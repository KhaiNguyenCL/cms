import { useState } from 'react';
import {
    Box, Typography, Button, TextField, Table, TableHead, TableBody,
    TableRow, TableCell, TableContainer, Paper, IconButton, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
    Alert, Tooltip, Autocomplete, InputAdornment, Stack,
    Popover, FormControlLabel, Checkbox, Divider,
    Card, CardContent, Skeleton, TablePagination, Select, MenuItem, TableSortLabel, useTheme,
} from '@mui/material';
import {
    Add, Edit, Delete, Search, Close, PersonAdd, ViewColumn, SwapHoriz,
    StoreMallDirectory, AddAPhoto, AddToHomeScreen, AddToQueue, Clear,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi } from '@/api/sites.api';
import { devicesApi } from '@/api/devices.api';
import { getApiError } from '@/api/client';
import type { Site, SiteDevice, Device } from '@/types';
import { useAppSelector } from '@store/hooks';

// ─── Timezone helpers ─────────────────────────────────────────────────────────

const TIMEZONE_LIST: string[] =
    typeof (Intl as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf === 'function'
        ? (Intl as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
        : ['UTC', 'Asia/Ho_Chi_Minh', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo',
           'Asia/Seoul', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
           'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
           'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
           'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland'];

function getUtcOffsetLabel(tz: string): string {
    try {
        const parts = new Intl.DateTimeFormat('en', {
            timeZone: tz, timeZoneName: 'shortOffset',
        }).formatToParts(new Date());
        const off = parts.find(p => p.type === 'timeZoneName')?.value ?? '';
        return `${tz} (${off})`;
    } catch { return tz; }
}

interface TimezoneAutocompleteProps {
    value: string;
    onChange: (tz: string) => void;
    label?: string;
    helperText?: string;
}

function TimezoneAutocomplete({ value, onChange, label, helperText }: TimezoneAutocompleteProps) {
    const { t } = useTranslation();
    return (
        <Autocomplete<string>
            options={TIMEZONE_LIST}
            value={value || null}
            onChange={(_, v) => onChange(v ?? '')}
            getOptionLabel={getUtcOffsetLabel}
            renderInput={params => (
                <TextField
                    {...params}
                    label={label ?? t('sites.timezone')}
                    size="small"
                    helperText={helperText}
                    InputLabelProps={{ shrink: true }}
                />
            )}
            filterOptions={(opts, { inputValue }) => {
                const q = inputValue.toLowerCase();
                return opts.filter(o => o.toLowerCase().includes(q)).slice(0, 100);
            }}
            noOptionsText={t('sites.noTimezone')}
            isOptionEqualToValue={(o, v) => o === v}
            fullWidth
        />
    );
}

// ─── Column visibility ────────────────────────────────────────────────────────

const ALL_COLUMNS = [
    { id: 'name',       labelKey: 'sites.siteName' },
    { id: 'address',    labelKey: 'sites.address' },
    { id: 'contact',    labelKey: 'sites.contact' },
    { id: 'timezone',   labelKey: 'sites.timezone' },
    { id: 'timeOn',     labelKey: 'sites.timeOnLabel' },
    { id: 'timeOff',    labelKey: 'sites.timeOffLabel' },
    { id: 'deployDate', labelKey: 'sites.deployDate' },
    { id: 'devices',    labelKey: 'sites.devices' },
    { id: 'actions',    labelKey: 'common.actions' },
] as const;

type ColId = (typeof ALL_COLUMNS)[number]['id'];
const DEFAULT_VISIBLE = new Set<ColId>(['name', 'address', 'timezone', 'timeOn', 'timeOff', 'devices', 'actions']);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Intl.DateTimeFormat().format(new Date(d));
}

function fmtTime(t: string | null) {
    if (!t) return '—';
    return t.slice(0, 5);
}

function shortId(id: string) {
    return id.slice(0, 8).toUpperCase();
}

// ─── Shared table header cell style ──────────────────────────────────────────

const TH_SX = {
    fontWeight: 600,
    fontSize: '0.72rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: 'text.secondary',
    bgcolor: 'grey.50',
    whiteSpace: 'nowrap' as const,
    py: 1.25,
};

// ─── Column visibility picker ─────────────────────────────────────────────────

interface ColumnPickerProps {
    visible: Set<ColId>;
    onChange: (v: Set<ColId>) => void;
}

function ColumnPicker({ visible, onChange }: ColumnPickerProps) {
    const { t } = useTranslation();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);

    const toggle = (id: ColId) => {
        if (id === 'name' || id === 'actions') return;
        const next = new Set(visible);
        if (next.has(id)) next.delete(id); else next.add(id);
        onChange(next);
    };

    return (
        <>
            <Button
                variant="outlined"
                size="small"
                startIcon={<ViewColumn />}
                onClick={e => setAnchor(e.currentTarget)}
            >
                {t('sites.colPickerBtn')}
            </Button>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Box sx={{ p: 1.5, minWidth: 180 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ px: 1, display: 'block', mb: 0.5 }}>
                        {t('sites.colPickerTitle')}
                    </Typography>
                    <Divider sx={{ mb: 0.5 }} />
                    {ALL_COLUMNS.map(col => (
                        <Box key={col.id}>
                            <FormControlLabel
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={visible.has(col.id)}
                                        onChange={() => toggle(col.id)}
                                        disabled={col.id === 'name' || col.id === 'actions'}
                                    />
                                }
                                label={<Typography variant="body2">{t(col.labelKey)}</Typography>}
                                sx={{ display: 'flex', mx: 0 }}
                            />
                        </Box>
                    ))}
                </Box>
            </Popover>
        </>
    );
}

// ─── Add Site Dialog ──────────────────────────────────────────────────────────

interface AddSiteDialogProps {
    open: boolean;
    onClose: () => void;
}

function pickerSx(dark: boolean) {
    return { '& input::-webkit-calendar-picker-indicator': { filter: dark ? 'invert(1)' : 'none' } };
}

function AddSiteDialog({ open, onClose }: AddSiteDialogProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const dark  = theme.palette.mode === 'dark';
    const qc = useQueryClient();
    const emptyForm = { name: '', address: '', contact: '', timezone: 'Asia/Bangkok', timeOn: '', timeOff: '', deployDate: '' };
    const [form, setForm] = useState(emptyForm);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const createMutation = useMutation({
        mutationFn: () => sitesApi.create({
            name:               form.name.trim(),
            address:            form.address.trim()    || undefined,
            contact:            form.contact.trim()    || undefined,
            timezone:           form.timezone          || undefined,
            timeOn:             form.timeOn            || undefined,
            timeOff:            form.timeOff           || undefined,
            deployDate:         form.deployDate        || undefined,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sites'] });
            setForm(emptyForm);
            setErrorMsg(null);
            onClose();
        },
        onError: (err) => setErrorMsg(getApiError(err, t('sites.createFailed'))),
    });

    const handleClose = () => {
        setForm(emptyForm);
        setErrorMsg(null);
        createMutation.reset();
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>{t('sites.addSiteTitle')}</DialogTitle>
            <DialogContent dividers>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>
                    <TextField label={`${t('sites.siteName')} *`} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} fullWidth autoFocus size="small" />
                    <TextField label={t('sites.address')} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} fullWidth size="small" />
                    <TextField label={t('sites.contact')} value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} fullWidth size="small" />
                    <TimezoneAutocomplete value={form.timezone} onChange={tz => setForm(f => ({ ...f, timezone: tz }))} helperText={t('sites.timezone')} />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label={t('sites.timeOnLabel')} type="time" value={form.timeOn}
                            onChange={e => setForm(f => ({ ...f, timeOn: e.target.value }))}
                            fullWidth InputLabelProps={{ shrink: true }} helperText={t('sites.timeOnHelper')} size="small" sx={pickerSx(dark)}
                            InputProps={{ endAdornment: form.timeOn ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setForm(f => ({ ...f, timeOn: '' }))} edge="end" tabIndex={-1}>
                                        <Clear sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </InputAdornment>
                            ) : null }}
                        />
                        <TextField
                            label={t('sites.timeOffLabel')} type="time" value={form.timeOff}
                            onChange={e => setForm(f => ({ ...f, timeOff: e.target.value }))}
                            fullWidth InputLabelProps={{ shrink: true }} helperText={t('sites.timeOffHelper')} size="small" sx={pickerSx(dark)}
                            InputProps={{ endAdornment: form.timeOff ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setForm(f => ({ ...f, timeOff: '' }))} edge="end" tabIndex={-1}>
                                        <Clear sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </InputAdornment>
                            ) : null }}
                        />
                        <TextField label={t('sites.deployDate')} type="date" value={form.deployDate} onChange={e => setForm(f => ({ ...f, deployDate: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} helperText={t('sites.deployDateHelper')} size="small" sx={pickerSx(dark)} />
                    </Box>
                    {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={handleClose}>{t('common.cancel')}</Button>
                <Button size="small" onClick={() => createMutation.mutate()} disabled={!form.name.trim() || createMutation.isPending} startIcon={createMutation.isPending ? <CircularProgress size={16} /> : undefined}>
                    {t('common.create')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Transfer Device Dialog ────────────────────────────────────────────────────

interface TransferDeviceDialogProps {
    device: SiteDevice;
    currentSiteId: string;
    open: boolean;
    onClose: () => void;
}

function TransferDeviceDialog({ device, currentSiteId, open, onClose }: TransferDeviceDialogProps) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const [targetSiteId, setTargetSiteId] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const { data: sitesData } = useQuery({
        queryKey: ['sites', 'all'],
        queryFn: () => sitesApi.list({ limit: 9999 }),
        enabled: open,
    });

    const otherSites = (sitesData?.data ?? []).filter(s => s.id !== currentSiteId);

    const transferMutation = useMutation({
        mutationFn: async () => {
            await sitesApi.updateDevices(targetSiteId, { add: [device.id], forceTransfer: true });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sites'] });
            qc.invalidateQueries({ queryKey: ['devices'] });
            onClose();
        },
        onError: (err) => setErrorMsg(getApiError(err, t('sites.transferFailed'))),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>{t('sites.transferTitle')}</DialogTitle>
            <DialogContent dividers>
                <Box sx={{ pt: 0.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Typography variant="body2">
                        {t('common.name')}: <strong>{device.name}</strong>
                    </Typography>
                    <Autocomplete<Site>
                        options={otherSites}
                        getOptionLabel={s => s.name}
                        onChange={(_, v) => { setTargetSiteId(v?.id ?? ''); setErrorMsg(null); }}
                        isOptionEqualToValue={(o, v) => o.id === v.id}
                        renderInput={params => <TextField {...params} label={`${t('sites.targetSite')} *`} size="small" />}
                        size="small"
                        noOptionsText={t('sites.noOtherSites')}
                    />
                    {errorMsg && <Alert severity="error" sx={{ py: 0.5 }}>{errorMsg}</Alert>}
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>{t('common.cancel')}</Button>
                <Button size="small" disabled={!targetSiteId || transferMutation.isPending} startIcon={transferMutation.isPending ? <CircularProgress size={16} /> : <SwapHoriz />} onClick={() => transferMutation.mutate()}>
                    {t('common.transfer')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Edit Site Dialog ─────────────────────────────────────────────────────────

interface EditSiteDialogProps {
    site: Site;
    open: boolean;
    onClose: () => void;
}

function EditSiteDialog({ site, open, onClose }: EditSiteDialogProps) {
    const { t } = useTranslation();
    const theme = useTheme();
    const dark  = theme.palette.mode === 'dark';
    const qc = useQueryClient();
    const currentUser = useAppSelector(s => s.auth.user);
    const isAdmin = currentUser?.role === 'ADMIN';
    const [form, setForm] = useState({
        name:               site.name,
        address:            site.address    ?? '',
        contact:            site.contact    ?? '',
        timezone:           site.timezone   ?? '',
        timeOn:             site.timeOn     ?? '',
        timeOff:            site.timeOff    ?? '',
        deployDate:         site.deployDate ? site.deployDate.slice(0, 10) : '',
    });
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
    const [addDeviceError, setAddDeviceError] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [transferDevice, setTransferDevice] = useState<SiteDevice | null>(null);
    const [confirmDel, setConfirmDel] = useState(false);

    const { data: siteDetail } = useQuery({
        queryKey: ['sites', site.id],
        queryFn:  () => sitesApi.get(site.id),
        enabled:  open,
    });

    const { data: allDevicesData } = useQuery({
        queryKey: ['devices', 'all'],
        queryFn:  () => devicesApi.list({ limit: 200 }),
        enabled:  open,
    });

    const assignedIds = new Set((siteDetail?.devices ?? []).map(d => d.id));
    const availableDevices = (allDevicesData?.data ?? []).filter(
        (d: Device) => !assignedIds.has(d.id) && d.siteId === null
    );

    const updateMutation = useMutation({
        mutationFn: () => sitesApi.update(site.id, {
            name:               form.name.trim(),
            address:            form.address.trim()    || null,
            contact:            form.contact.trim()    || null,
            timezone:           form.timezone          || null,
            timeOn:             form.timeOn            || null,
            timeOff:            form.timeOff           || null,
            deployDate:         form.deployDate        || null,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sites'] });
            qc.invalidateQueries({ queryKey: ['devices'] });
            qc.invalidateQueries({ queryKey: ['sites-list-for-assign'] });
            onClose();
        },
        onError: (err) => setErrorMsg(getApiError(err, t('sites.updateFailed'))),
    });

    const addDeviceMutation = useMutation({
        mutationFn: (deviceId: string) => sitesApi.updateDevices(site.id, { add: [deviceId] }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sites', site.id] });
            qc.invalidateQueries({ queryKey: ['sites'] });
            qc.invalidateQueries({ queryKey: ['devices'] });
            setSelectedDevice(null);
            setAddDeviceError(null);
        },
        onError: (err) => setAddDeviceError(getApiError(err, t('sites.addDeviceFailed'))),
    });

    const removeDeviceMutation = useMutation({
        mutationFn: (deviceId: string) => sitesApi.updateDevices(site.id, { remove: [deviceId] }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sites', site.id] });
            qc.invalidateQueries({ queryKey: ['sites'] });
            qc.invalidateQueries({ queryKey: ['devices'] });
        },
    });

    const deleteSiteMutation = useMutation({
        mutationFn: () => sitesApi.delete(site.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sites'] });
            qc.invalidateQueries({ queryKey: ['devices'] });
            qc.invalidateQueries({ queryKey: ['sites-list-for-assign'] });
            onClose();
        },
    });

    const devices: SiteDevice[] = siteDetail?.devices ?? [];

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle fontWeight={700}>{t('sites.editSiteTitle')} — {site.name}</DialogTitle>
            <DialogContent dividers>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 0.5 }}>

                    {/* ── General info ── */}
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
                        {t('sites.generalInfo')}
                    </Typography>
                    <TextField label={`${t('sites.siteName')} *`} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} fullWidth size="small" />
                    <TextField label={t('sites.address')} value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} fullWidth size="small" />
                    <TextField label={t('sites.contact')} value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} fullWidth size="small" />
                    <TimezoneAutocomplete value={form.timezone} onChange={tz => setForm(f => ({ ...f, timezone: tz }))} helperText={t('sites.timezone')} />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label={t('sites.timeOnLabel')} type="time" value={form.timeOn}
                            onChange={e => setForm(f => ({ ...f, timeOn: e.target.value }))}
                            fullWidth InputLabelProps={{ shrink: true }} helperText={t('sites.timeOnHelper')} size="small" sx={pickerSx(dark)}
                            InputProps={{ endAdornment: form.timeOn ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setForm(f => ({ ...f, timeOn: '' }))} edge="end" tabIndex={-1}>
                                        <Clear sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </InputAdornment>
                            ) : null }}
                        />
                        <TextField
                            label={t('sites.timeOffLabel')} type="time" value={form.timeOff}
                            onChange={e => setForm(f => ({ ...f, timeOff: e.target.value }))}
                            fullWidth InputLabelProps={{ shrink: true }} helperText={t('sites.timeOffHelper')} size="small" sx={pickerSx(dark)}
                            InputProps={{ endAdornment: form.timeOff ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setForm(f => ({ ...f, timeOff: '' }))} edge="end" tabIndex={-1}>
                                        <Clear sx={{ fontSize: 14 }} />
                                    </IconButton>
                                </InputAdornment>
                            ) : null }}
                        />
                        <TextField label={t('sites.deployDate')} type="date" value={form.deployDate} onChange={e => setForm(f => ({ ...f, deployDate: e.target.value }))} fullWidth InputLabelProps={{ shrink: true }} helperText={t('sites.deployDateHelper')} size="small" sx={pickerSx(dark)} />
                    </Box>
                    <Divider />

                    {/* ── Devices section ── */}
                    <Typography variant="overline" color="text.secondary" sx={{ lineHeight: 1 }}>
                        {t('sites.devices')} ({devices.length})
                    </Typography>

                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Autocomplete<Device>
                            options={availableDevices}
                            getOptionLabel={d => `${d.name}${d.location ? ` — ${d.location}` : ''}`}
                            value={selectedDevice}
                            onChange={(_, v) => { setSelectedDevice(v); setAddDeviceError(null); }}
                            isOptionEqualToValue={(o, v) => o.id === v.id}
                            renderInput={params => (
                                <TextField {...params} label={t('sites.addDeviceToSite')} size="small" />
                            )}
                            size="small"
                            sx={{ flex: 1 }}
                            noOptionsText={t('sites.noAvailableDevices')}
                        />
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={addDeviceMutation.isPending ? <CircularProgress size={14} /> : <AddToQueue />}
                            disabled={!selectedDevice || addDeviceMutation.isPending}
                            onClick={() => selectedDevice && addDeviceMutation.mutate(selectedDevice.id)}
                            sx={{ whiteSpace: 'nowrap' }}
                        >
                            {t('common.add')}
                        </Button>
                    </Box>
                    {addDeviceError && (
                        <Alert severity="error" sx={{ py: 0.5, fontSize: '0.75rem' }} onClose={() => setAddDeviceError(null)}>
                            {addDeviceError}
                        </Alert>
                    )}

                    <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                        {devices.length === 0 ? (
                            <Box sx={{ py: 3, textAlign: 'center' }}>
                                <Typography variant="body2" color="text.secondary">
                                    {t('sites.noDevicesInSite')}
                                </Typography>
                            </Box>
                        ) : (
                            devices.map((d: SiteDevice) => (
                                <Box
                                    key={d.id}
                                    sx={{
                                        display: 'flex', alignItems: 'center',
                                        px: 2, py: 1,
                                        borderBottom: '1px solid', borderColor: 'divider',
                                        '&:last-child': { borderBottom: 0 },
                                    }}
                                >
                                    <Box sx={{ flex: 1 }}>
                                        <Typography variant="body2" fontWeight={500}>{d.name}</Typography>
                                        {d.location && (
                                            <Typography variant="caption" color="text.secondary">{d.location}</Typography>
                                        )}
                                    </Box>
                                    <Chip
                                        label={d.status}
                                        size="small"
                                        color={d.status === 'ONLINE' ? 'success' : 'default'}
                                        sx={{ mr: 1 }}
                                    />
                                    <Tooltip title={t('sites.transferDevice')}>
                                        <IconButton size="small" color="primary" onClick={() => setTransferDevice(d)}>
                                            <SwapHoriz fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title={t('sites.removeFromSite')}>
                                        <IconButton size="small" color="error" onClick={() => removeDeviceMutation.mutate(d.id)} disabled={removeDeviceMutation.isPending}>
                                            <Close fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Box>
                            ))
                        )}
                    </Paper>

                    {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
                </Box>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
                <Box>
                    {isAdmin && (confirmDel ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="error">{t('sites.confirmDeleteSite')}</Typography>
                            <Button size="small" color="error" disabled={deleteSiteMutation.isPending} onClick={() => deleteSiteMutation.mutate()} startIcon={deleteSiteMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}>{t('common.delete')}</Button>
                            <Button size="small" onClick={() => setConfirmDel(false)} disabled={deleteSiteMutation.isPending}>{t('common.no')}</Button>
                        </Stack>
                    ) : (
                        <Button size="small" color="error" startIcon={<Delete />} onClick={() => setConfirmDel(true)}>{t('sites.deleteConfirm').replace('?', '')}</Button>
                    ))}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" onClick={onClose} disabled={updateMutation.isPending}>{t('common.cancel')}</Button>
                    <Button size="small" onClick={() => updateMutation.mutate()} disabled={!form.name.trim() || updateMutation.isPending} startIcon={updateMutation.isPending ? <CircularProgress size={16} /> : undefined}>{t('common.save')}</Button>
                </Box>
            </DialogActions>

            {transferDevice && (
                <TransferDeviceDialog
                    device={transferDevice}
                    currentSiteId={site.id}
                    open={true}
                    onClose={() => setTransferDevice(null)}
                />
            )}
        </Dialog>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type SortCol = 'timeOn' | 'timeOff' | 'deployDate';

export default function SitePage() {
    const { t } = useTranslation();
    const [search, setSearch]           = useState('');
    const [page, setPage]               = useState(1);
    const [limit, setLimit]             = useState(10);
    const [addOpen, setAddOpen]         = useState(false);
    const [editSite, setEditSite]       = useState<Site | null>(null);
    const [visibleCols, setVisibleCols] = useState<Set<ColId>>(DEFAULT_VISIBLE);
    const [sortBy, setSortBy]           = useState<SortCol | null>(null);
    const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc');

    const handleSort = (col: SortCol) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };

    const { data, isLoading, isError } = useQuery({
        queryKey: ['sites', page, limit, search],
        queryFn:  () => sitesApi.list({ page, limit: limit === 0 ? 9999 : limit, search: search || undefined }),
    });

    const sites: Site[] = [...(data?.data ?? [])].sort((a, b) => {
        if (!sortBy) return 0;
        const va = a[sortBy] ?? '';
        const vb = b[sortBy] ?? '';
        const cmp = String(va).localeCompare(String(vb), 'vi');
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const colCount = visibleCols.size;
    const show = (id: ColId) => visibleCols.has(id);

    return (
        <Box>
            {/* ── Header ── */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight={700}>{t('sites.title')}</Typography>
                    <Typography variant="body2" color="text.secondary" mt={0.25}>
                        {t('sites.subtitle')}
                    </Typography>
                </Box>
                <Button size="small" startIcon={<Add />} onClick={() => setAddOpen(true)}>
                    {t('sites.createSite')}
                </Button>
            </Stack>

            <Card variant="outlined">
                <CardContent sx={{ p: 0 }}>
                    {/* ── Toolbar ── */}
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1}
                        sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}
                    >
                        <TextField
                            placeholder={t('sites.searchPlaceholder')}
                            value={search}
                            onChange={e => { setSearch(e.target.value); setPage(1); }}
                            size="small"
                            sx={{ width: 260 }}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <Search fontSize="small" sx={{ color: 'text.disabled' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        {!isLoading && data && (
                            <Typography variant="body2" color="text.secondary">
                                {data.total ?? 0} site
                            </Typography>
                        )}
                        <Box sx={{ flex: 1 }} />
                        <ColumnPicker visible={visibleCols} onChange={setVisibleCols} />
                    </Stack>

                    {/* ── Table ── */}
                    {isError ? (
                        <Alert severity="error" sx={{ m: 2 }}>{t('sites.loadFailed')}</Alert>
                    ) : (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        {show('name')       && <TableCell sx={{ ...TH_SX, pl: 2 }}>{t('common.siteName')}</TableCell>}
                                        {show('address')    && <TableCell sx={TH_SX}>{t('sites.address')}</TableCell>}
                                        {show('contact')    && <TableCell sx={TH_SX}>{t('sites.contact')}</TableCell>}
                                        {show('timezone')   && <TableCell sx={TH_SX}>{t('sites.timezone')}</TableCell>}
                                        {show('timeOn')     && (
                                            <TableCell sx={TH_SX}>
                                                <TableSortLabel active={sortBy === 'timeOn'} direction={sortBy === 'timeOn' ? sortDir : 'asc'} onClick={() => handleSort('timeOn')}>
                                                    {t('sites.timeOnLabel')}
                                                </TableSortLabel>
                                            </TableCell>
                                        )}
                                        {show('timeOff')    && (
                                            <TableCell sx={TH_SX}>
                                                <TableSortLabel active={sortBy === 'timeOff'} direction={sortBy === 'timeOff' ? sortDir : 'asc'} onClick={() => handleSort('timeOff')}>
                                                    {t('sites.timeOffLabel')}
                                                </TableSortLabel>
                                            </TableCell>
                                        )}
                                        {show('deployDate') && (
                                            <TableCell sx={TH_SX}>
                                                <TableSortLabel active={sortBy === 'deployDate'} direction={sortBy === 'deployDate' ? sortDir : 'asc'} onClick={() => handleSort('deployDate')}>
                                                    {t('common.createdAt')}
                                                </TableSortLabel>
                                            </TableCell>
                                        )}
                                        {show('devices')    && <TableCell sx={{ ...TH_SX, textAlign: 'center' }}>{t('sites.devices')}</TableCell>}
                                        {show('actions')    && <TableCell sx={{ ...TH_SX, textAlign: 'center', width: 80 }}>{t('common.actions')}</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {isLoading
                                        ? Array.from({ length: 5 }).map((_, i) => (
                                            <TableRow key={i}>
                                                {Array.from({ length: colCount }).map((__, j) => (
                                                    <TableCell key={j} sx={{ py: 1.5 }}><Skeleton height={20} /></TableCell>
                                                ))}
                                            </TableRow>
                                        ))
                                        : sites.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={colCount}>
                                                    <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5, color: 'text.disabled' }}>
                                                        <StoreMallDirectory sx={{ fontSize: 48 }} />
                                                        <Typography variant="body2">
                                                            {search ? t('sites.noMatch') : t('sites.noSiteYet')}
                                                        </Typography>
                                                    </Box>
                                                </TableCell>
                                            </TableRow>
                                        ) : sites.map(site => (
                                            <TableRow key={site.id} hover sx={{ cursor: 'pointer' }} onClick={() => setEditSite(site)}>
                                                {show('name') && (
                                                    <TableCell sx={{ pl: 2, py: 1.25, textAlign:"center" }}>
                                                        <Stack direction="row" alignItems="center" spacing={1}>
                                                            <Box>
                                                                <Typography variant="body2" fontWeight={600}>{site.name}</Typography>
                                                                {site.description && (
                                                                    <Typography variant="caption" color="text.secondary" display="block">
                                                                        {site.description}
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                            {site.startEpoch ? (
                                                                <Chip label={t('sites.running')} size="small" color="success" sx={{ fontSize: '0.65rem', height: 18 }} />
                                                            ) : null}
                                                        </Stack>
                                                    </TableCell>
                                                )}
                                                {show('address')  && (
                                                    <TableCell sx={{ py: 1.25, maxWidth: 200 }}>
                                                        <Typography variant="caption" color={site.address ? 'text.secondary' : 'text.disabled'} noWrap title={site.address ?? ''}>
                                                            {site.address ?? '—'}
                                                        </Typography>
                                                    </TableCell>
                                                )}
                                                {show('contact')  && (
                                                    <TableCell sx={{ py: 1.25, maxWidth: 160 }}>
                                                        <Typography variant="caption" color={site.contact ? 'text.secondary' : 'text.disabled'} noWrap title={site.contact ?? ''}>
                                                            {site.contact ?? '—'}
                                                        </Typography>
                                                    </TableCell>
                                                )}
                                                {show('timezone') && (
                                                    <TableCell sx={{ py: 1.25 }}>
                                                        {site.timezone
                                                            ? <Chip label={site.timezone} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.68rem' }} />
                                                            : <Typography variant="body2" color="text.disabled">—</Typography>
                                                        }
                                                    </TableCell>
                                                )}
                                                {show('timeOn')  && (
                                                    <TableCell sx={{ py: 1.25 }}>
                                                        <Typography variant="body2" fontFamily="monospace" color={site.timeOn ? 'text.primary' : 'text.disabled'}>
                                                            {fmtTime(site.timeOn)}
                                                        </Typography>
                                                    </TableCell>
                                                )}
                                                {show('timeOff') && (
                                                    <TableCell sx={{ py: 1.25 }}>
                                                        <Typography variant="body2" fontFamily="monospace" color={site.timeOff ? 'text.primary' : 'text.disabled'}>
                                                            {fmtTime(site.timeOff)}
                                                        </Typography>
                                                    </TableCell>
                                                )}
                                                {show('deployDate') && (
                                                    <TableCell sx={{ py: 1.25 }}>
                                                        <Typography variant="body2" color={site.deployDate ? 'text.primary' : 'text.disabled'}>
                                                            {fmtDate(site.deployDate)}
                                                        </Typography>
                                                    </TableCell>
                                                )}
                                                {show('devices') && (
                                                    <TableCell align="center" sx={{ py: 1.25 }}>
                                                        <Tooltip
                                                            title={site.deviceCount === 0 ? t('sites.noDevicesInSite') : (site.deviceNames?.join(', ') || `${site.deviceCount} device`)}
                                                            placement="top"
                                                        >
                                                            <Stack direction="row" justifyContent="center" spacing={0.5}>
                                                                <Chip
                                                                    label={`${site.onlineCount ?? 0} online`}
                                                                    size="small"
                                                                    color={site.onlineCount > 0 ? 'success' : 'default'}
                                                                    sx={{ fontSize: '0.68rem', height: 20 }}
                                                                />
                                                                {site.deviceCount > 0 && (
                                                                    <Chip
                                                                        label={`${site.deviceCount} total`}
                                                                        size="small"
                                                                        variant="outlined"
                                                                        sx={{ fontSize: '0.68rem', height: 20 }}
                                                                    />
                                                                )}
                                                            </Stack>
                                                        </Tooltip>
                                                    </TableCell>
                                                )}
                                                {show('actions') && (
                                                    <TableCell align="center" sx={{ py: 1.25 }} onClick={e => e.stopPropagation()}>
                                                        <Tooltip title={t('sites.editTooltip')}>
                                                            <IconButton size="small" onClick={() => setEditSite(site)}>
                                                                <Edit fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </TableCell>
                                                )}
                                            </TableRow>
                                        ))
                                    }
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {data && (
                        <TablePagination
                            component="div"
                            count={data.total ?? 0}
                            page={page - 1}
                            onPageChange={(_, p) => setPage(p + 1)}
                            rowsPerPage={limit}
                            onRowsPerPageChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                            rowsPerPageOptions={[10, 25, 50, 100]}
                            labelRowsPerPage={t("common.perPage")}
                            labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                        />
                    )}
                </CardContent>
            </Card>

            {/* ── Dialogs ── */}
            <AddSiteDialog open={addOpen} onClose={() => setAddOpen(false)} />
            {editSite && <EditSiteDialog site={editSite} open={true} onClose={() => setEditSite(null)} />}
        </Box>
    );
}
