import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Card, CardContent, Stack, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, InputAdornment, TablePagination, Avatar, Skeleton,
    Tabs, Tab, Divider, TableSortLabel,
    Select, FormControl, InputLabel, MenuItem,
    LinearProgress, Slider, Popover, FormControlLabel, Checkbox, Autocomplete,
} from '@mui/material';
import {
    Add, Search, Tv, CheckCircle, ErrorOutline,
    PowerSettingsNew, Refresh, Screenshot, Delete,
    LinkOff, Settings,
    Bedtime, ExitToApp, ViewColumn, Restore, DeleteForever,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { devicesApi } from '@api/devices.api';
import { sitesApi } from '@api/sites.api';
import { getApiError } from '@api/client';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Device, DeviceHealth, DeviceComment, Site, ActiveSchedule } from '@/types';

// ── Column visibility ─────────────────────────────────────────────────────────

const ALL_COLUMNS = [
    { id: 'device', labelKey: 'common.name' },
    { id: 'status', labelKey: 'common.status' },
    { id: 'license', labelKey: 'devices.licensed' },
    { id: 'model', labelKey: 'devices.model' },
    { id: 'sn', labelKey: 'S/N' },
    { id: 'osVersion', labelKey: 'devices.osVersion' },
    { id: 'site', labelKey: 'devices.site' },
    { id: 'lastSeen', labelKey: 'devices.lastSeen' },
    { id: 'uptime', labelKey: 'devices.uptime' },
    { id: 'location', labelKey: 'common.note' },
    { id: 'licenseStartDate', labelKey: 'common.registeredAt' },
    { id: 'licenseEndDate', labelKey: 'common.expiredAt' },
    { id: 'pairingCode', labelKey: 'devices.pairingCode' },
    { id: 'actions', labelKey: 'common.actions' },
] as const;

type ColId = (typeof ALL_COLUMNS)[number]['id'];
const DEFAULT_VISIBLE = new Set<ColId>([
    'device', 'status', 'license', 'model', 'sn', 'osVersion', 'site', 'pairingCode', 'actions',
]);

function ColumnPicker({ visible, onChange }: { visible: Set<ColId>; onChange: (v: Set<ColId>) => void }) {
    const { t } = useTranslation();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);

    const toggle = (id: ColId) => {
        if (id === 'device' || id === 'actions') return;
        const next = new Set(visible);
        if (next.has(id)) next.delete(id); else next.add(id);
        onChange(next);
    };

    return (
        <>
            <Button variant="outlined" size="small" startIcon={<ViewColumn />} onClick={e => setAnchor(e.currentTarget)}>
                {t('devices.columnPicker')}
            </Button>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Box sx={{ p: 1.5, minWidth: 190 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ px: 1, display: 'block', mb: 0.5 }}>
                        {t('devices.selectColumns')}
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
                                        disabled={col.id === 'device' || col.id === 'actions' || col.id === 'status'
                                            || col.id === 'license' || col.id === 'model' || col.id === 'sn'
                                            || col.id === 'osVersion' || col.id === 'site' || col.id === 'pairingCode'}
                                    />
                                }
                                label={<Typography variant="body2">{col.labelKey.includes('.') ? t(col.labelKey) : col.labelKey}</Typography>}
                                sx={{ display: 'flex', mx: 0 }}
                            />
                        </Box>
                    ))}
                </Box>
            </Popover>
        </>
    );
}

// ── Uptime formatter ──────────────────────────────────────────────────────────

function formatUptime(lastOnlineAt: string | null, status: string): string {
    if (!lastOnlineAt || (status !== 'ONLINE' && status !== 'SLEEP')) return '—';
    const ms = Date.now() - new Date(lastOnlineAt).getTime();
    if (ms < 0) return '—';
    const totalMins = Math.floor(ms / 60_000);
    const days = Math.floor(totalMins / 1440);
    const hours = Math.floor((totalMins % 1440) / 60);
    const mins = totalMins % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

// ── License chip (read-only — quản lý tại trang License) ────────────────────

function LicenseChip({ device }: { device: Device }) {
    const { t } = useTranslation();
    const isLicensed = device.isLicensed === true;
    return (
        <Chip
            label={isLicensed ? t('devices.licensed') : t('devices.unlicensed')}
            color={isLicensed ? 'success' : 'default'}
            size="small"
            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
        />
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: Device['status'] }) {
    const { t } = useTranslation();
    const map: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'error' | 'info'; icon: React.ReactElement }> = {
        ONLINE: { label: t('devices.online'), color: 'success', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
        SLEEP: { label: t('devices.sleep'), color: 'info', icon: <Bedtime sx={{ fontSize: 14 }} /> },
        APP_EXIT: { label: t('devices.appExit'), color: 'warning', icon: <ExitToApp sx={{ fontSize: 14 }} /> },
        OFFLINE: { label: t('devices.offline'), color: 'default', icon: <ErrorOutline sx={{ fontSize: 14 }} /> },
        ERROR: { label: t('devices.error'), color: 'error', icon: <ErrorOutline sx={{ fontSize: 14 }} /> },
    };
    const cfg = map[status] ?? map.OFFLINE;
    return <Chip label={cfg.label} color={cfg.color} size="small" icon={cfg.icon} sx={{ fontWeight: 600, fontSize: '0.7rem' }} />;
}

function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Intl.DateTimeFormat().format(new Date(d));
}


// ── Create Device dialog ──────────────────────────────────────────────────────

function CreateDeviceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');
    const [selectedSite, setSelectedSite] = useState<Site | null>(null);

    const { data: sitesData } = useQuery({
        queryKey: ['sites-list-for-create-device'],
        queryFn: () => sitesApi.list({ limit: 999 }),
        enabled: open,
    });
    const sites: Site[] = sitesData?.data ?? [];

    const mutation = useMutation({
        mutationFn: () => devicesApi.create({ name, location, siteId: selectedSite?.id ?? null }),
        onSuccess: (device) => {
            qc.invalidateQueries({ queryKey: ['devices'] });
            dispatch(pushToast({
                severity: 'success',
                message: t('devices.createSuccessCode', { code: device.pairingCode }),
            }));
            setName(''); setLocation(''); setSelectedSite(null);
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, t('devices.createFailed')) })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>{t('devices.addDevice')}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField label={`${t('devices.deviceName')} *`} value={name} onChange={(e) => setName(e.target.value)} fullWidth required autoFocus size="small" />
                    <Autocomplete
                        size="small"
                        options={sites}
                        getOptionLabel={(s) => s.name}
                        value={selectedSite}
                        onChange={(_e, v) => setSelectedSite(v)}
                        renderInput={(params) => <TextField {...params} label={t('devices.siteOptional')} />}
                        noOptionsText={t('devices.noSiteOptions')}
                    />
                    <TextField label={t('devices.noteOptional')} value={location} onChange={(e) => setLocation(e.target.value)} fullWidth size="small" />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>{t('common.cancel')}</Button>
                <Button size="small" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>
                    {mutation.isPending ? t('common.creating') : t('common.create')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Device Detail dialog ──────────────────────────────────────────────────────

function formatBytes(bytes: number | null | undefined): string {
    if (bytes === null || bytes === undefined) return '—';
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)} MB`;
    return `${bytes} B`;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <Stack direction="row" sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>{label}</Typography>
            <Box flex={1}><Typography variant="body2" fontWeight={500} component="span">{value}</Typography></Box>
        </Stack>
    );
}

function HealthBar({ value, label }: { value: number | null; label?: string }) {
    const pct = value ?? 0;
    const color = pct > 80 ? 'error.main' : pct > 60 ? 'warning.main' : 'success.main';
    return (
        <Stack direction="row" alignItems="center" gap={1}>
            <LinearProgress
                variant="determinate"
                value={pct}
                sx={{ flex: 1, height: 6, borderRadius: 3, '& .MuiLinearProgress-bar': { bgcolor: color } }}
            />
            <Typography variant="body2" fontWeight={600} sx={{ minWidth: 40, textAlign: 'right' }}>
                {value !== null ? `${value}%` : '—'}
            </Typography>
            {label && <Typography variant="caption" color="text.secondary">{label}</Typography>}
        </Stack>
    );
}

function DeviceManageDialog({ device, open, onClose }: { device: Device | null; open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const [tab, setTab] = React.useState(0);
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const currentUser = useAppSelector(s => s.auth.user);
    const isViewer = currentUser?.role === 'VIEWER';
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'MANAGER';
    const [confirmAction, setConfirmAction] = React.useState<'release' | 'delete' | null>(null);

    // For VIEWER the "Điều khiển" tab is hidden, so tab index 0 = "Nội dung" (actualTab 1), etc.
    const actualTab = isViewer ? tab + 1 : tab;

    React.useEffect(() => { if (open) setTab(0); }, [open]);

    // ── Site assignment state ──────────────────────────────────────────────────
    const { data: sitesData } = useQuery({
        queryKey: ['sites-list-for-assign'],
        queryFn: () => sitesApi.list({ limit: 999 }),
        enabled: open,
    });
    const sites: Site[] = sitesData?.data ?? [];

    const [selectedSite, setSelectedSite] = React.useState<Site | null>(null);
    React.useEffect(() => {
        if (device && sites.length > 0) {
            setSelectedSite(sites.find(s => s.id === device.siteId) ?? null);
        }
    }, [device, sites]);


    const { data: health, isLoading: healthLoading } = useQuery<DeviceHealth | null>({
        queryKey: ['device-health', device?.id],
        queryFn: () => device ? devicesApi.getHealth(device.id) : Promise.resolve(null),
        enabled: open && Boolean(device?.id) && actualTab >= 2,
        staleTime: 30_000,
    });

    const { data: activeSchedules = [] } = useQuery<ActiveSchedule[]>({
        queryKey: ['device-active-schedules', device?.id],
        queryFn: () => device ? devicesApi.getActiveSchedules(device.id) : Promise.resolve([]),
        enabled: open && Boolean(device?.id) && actualTab === 1,
        staleTime: 30_000,
    });

    const { data: comments = [] } = useQuery<DeviceComment[]>({
        queryKey: ['device-comments', device?.id],
        queryFn: () => device ? devicesApi.getComments(device.id) : Promise.resolve([]),
        enabled: open && Boolean(device?.id) && actualTab === 1,
    });

    const [volume, setVolume] = React.useState(50);
    const [volumeDirty, setVolumeDirty] = React.useState(false);
    React.useEffect(() => { if (open) setVolumeDirty(false); }, [open]);

    // Info form (tab 0)
    const [infoName, setInfoName] = React.useState('');
    const [infoLocation, setInfoLocation] = React.useState('');
    React.useEffect(() => {
        if (device) {
            setInfoName(device.name);
            setInfoLocation(device.location ?? '');
        }
    }, [device]);

    // Unified save (tab 0)
    const [saving, setSaving] = React.useState(false);
    const handleSave = async () => {
        if (!device) return;
        setSaving(true);
        try {
            // 1. Device info
            await devicesApi.update(device.id, {
                name: infoName,
                location: infoLocation || null,
            });

            // 2. Site (only if changed)
            const newSiteId = selectedSite?.id ?? null;
            const oldSiteId = device.siteId ?? null;
            if (newSiteId !== oldSiteId) {
                if (oldSiteId) await sitesApi.updateDevices(oldSiteId, { remove: [device.id] });
                if (newSiteId) await sitesApi.updateDevices(newSiteId, { add: [device.id] });
            }

            // 4. Volume (only if slider was touched)
            if (volumeDirty) {
                await devicesApi.sendCommand(device.id, 'SET_VOLUME', { volume });
            }

            qc.invalidateQueries({ queryKey: ['devices'] });
            if (newSiteId !== oldSiteId) {
                // Device moved between sites — refresh site device counts
                qc.invalidateQueries({ queryKey: ['sites'] });
            }
            dispatch(pushToast({ severity: 'success', message: t('devices.saveSuccess') }));
        } catch (err) {
            dispatch(pushToast({ severity: 'error', message: getApiError(err, t('devices.saveFailed')) }));
        } finally {
            setSaving(false);
        }
    };

    const [commentText, setCommentText] = React.useState('');
    const addCommentMutation = useMutation({
        mutationFn: () => devicesApi.addComment(device!.id, commentText, currentUser?.email),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['device-comments', device?.id] });
            setCommentText('');
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, t('devices.sendNoteFailed')) })),
    });

    const sendCmd = async (command: string, payload?: Record<string, unknown>) => {
        try {
            await devicesApi.sendCommand(device!.id, command, payload);
            dispatch(pushToast({ severity: 'success', message: t('devices.commandSent', { command }) }));
        } catch {
            dispatch(pushToast({ severity: 'error', message: t('devices.commandFailed') }));
        }
    };

    if (!device) return null;

    const isDirty =
        infoName !== device.name ||
        infoLocation !== (device.location ?? '') ||
        (selectedSite?.id ?? null) !== (device.siteId ?? null) ||
        volumeDirty;

    const storagePercent = (health?.storageTotal && health.storageUsed != null)
        ? Math.round((health.storageUsed / health.storageTotal) * 100)
        : null;
    const heapMB = health?.heapMemory ? Math.round(health.heapMemory / 1_048_576) : null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { height: '82vh', display: 'flex', flexDirection: 'column' } }}>

            <DialogTitle sx={{ pb: 0, flexShrink: 0 }}>
                <Stack direction="row" gap={1.5} alignItems="center">
                    <Avatar sx={{ bgcolor: device.status === 'ONLINE' ? 'success.main' : device.status === 'SLEEP' ? 'info.main' : device.status === 'APP_EXIT' ? 'warning.main' : 'grey.700', width: 44, height: 44 }}>
                        <Tv />
                    </Avatar>
                    <Box flex={1} minWidth={0}>
                        <Typography variant="h6" fontWeight={700} noWrap>{device.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                            {device.id}
                        </Typography>
                    </Box>
                    <Stack direction="row" gap={0.5} flexShrink={0}>
                        <StatusChip status={device.status} />
                        <LicenseChip device={device} />
                    </Stack>
                </Stack>
                <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mt: 1 }} variant="scrollable" scrollButtons="auto">
                    {!isViewer && <Tab label={t('devices.tabControl')} />}
                    <Tab label={t('devices.tabContent')} />
                    <Tab label={t('devices.tabHardware')} />
                    <Tab label={t('devices.tabPerformance')} />
                    <Tab label={t('devices.tabNetwork')} />
                </Tabs>
            </DialogTitle>

            <DialogContent dividers sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>

                {/* ── Tab 0: Điều khiển ── */}
                {actualTab === 0 && (
                    <Stack spacing={2}>

                        {/* Quick commands */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" mb={0.75} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                {t('devices.quickCommands')}
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" gap={0.75}>
                                {[
                                    { cmd: 'WAKE_UP', label: t('devices.wakeUp'), icon: <PowerSettingsNew sx={{ fontSize: 15 }} /> },
                                    { cmd: 'RESTART', label: t('devices.restart'), icon: <PowerSettingsNew sx={{ fontSize: 15 }} /> },
                                    { cmd: 'RELOAD_CONTENT', label: t('devices.reloadContent'), icon: <Refresh sx={{ fontSize: 15 }} /> },
                                    { cmd: 'SCREENSHOT', label: t('devices.screenshot'), icon: <Screenshot sx={{ fontSize: 15 }} /> },
                                    { cmd: 'EXIT_APP', label: t('devices.exitApp'), icon: <ExitToApp sx={{ fontSize: 15 }} /> },
                                ].map(({ cmd, label, icon }) => (
                                    <Button key={cmd} variant="outlined" size="small" startIcon={icon}
                                        sx={{ fontSize: '0.75rem', py: 0.5 }} onClick={() => sendCmd(cmd)}>
                                        {label}
                                    </Button>
                                ))}
                            </Stack>
                        </Box>

                        <Divider />

                        {/* Volume */}
                        <Stack direction="row" alignItems="center" gap={1.5}>
                            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ minWidth: 72, textTransform: 'uppercase', letterSpacing: 1 }}>
                                {t('devices.volume')}
                            </Typography>
                            <Slider
                                value={volume}
                                onChange={(_, v) => { setVolume(v as number); setVolumeDirty(true); }}
                                min={0} max={100} sx={{ flex: 1 }} valueLabelDisplay="auto" size="small"
                            />
                            <Typography variant="body2" fontWeight={600} sx={{ minWidth: 32 }}>{volume}%</Typography>
                        </Stack>

                        <Divider />

                        <Divider />

                        {/* Site */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" mb={0.75} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                Site
                            </Typography>
                            <Autocomplete
                                options={sites}
                                getOptionLabel={(s) => s.name}
                                value={selectedSite}
                                onChange={(_, v) => setSelectedSite(v)}
                                renderInput={(params) => (
                                    <TextField {...params} label={t('devices.selectSite')} size="small"
                                        placeholder={t('devices.noSiteAssigned')} />
                                )}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                size="small"
                            />
                        </Box>

                        <Divider />

                        {/* Device info */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" mb={0.75} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                {t('devices.deviceInfo')}
                            </Typography>
                            <Stack direction="row" spacing={1}>
                                <TextField label={t('devices.deviceName')} value={infoName} onChange={e => setInfoName(e.target.value)} size="small" sx={{ flex: 1 }} />
                                <TextField label={t('common.note')} value={infoLocation} onChange={e => setInfoLocation(e.target.value)} size="small" sx={{ flex: 1 }} />
                            </Stack>
                        </Box>
                        <Divider />
                        {/* Danger zone — ADMIN only */}
                        {isAdmin && <Stack direction="row" alignItems="center" gap={1}>
                            <Typography variant="caption" color="error" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, mr: 0.5 }}>
                                {t('devices.dangerZone')}
                            </Typography>
                            {confirmAction === 'release' ? (
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography variant="caption" color="warning.main">{t('devices.confirmDisconnect')}</Typography>
                                    <Button size="small" color="warning" onClick={() => {
                                        setConfirmAction(null);
                                        devicesApi.reset(device.id)
                                            .then(r => {
                                                qc.invalidateQueries({ queryKey: ['devices'] });
                                                if (device.siteId) qc.invalidateQueries({ queryKey: ['sites'] });
                                                dispatch(pushToast({ severity: 'success', message: t('devices.disconnectOk', { code: r.pairingCode }) }));
                                                onClose();
                                            })
                                            .catch(() => dispatch(pushToast({ severity: 'error', message: t('devices.disconnectFailed') })));
                                    }}>{t('common.yes')}</Button>
                                    <Button size="small" onClick={() => setConfirmAction(null)}>{t('common.no')}</Button>
                                </Stack>
                            ) : confirmAction === 'delete' ? (
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <Typography variant="caption" color="error">{t('devices.confirmDeleteDevice')}</Typography>
                                    <Button size="small" color="error" onClick={() => {
                                        setConfirmAction(null);
                                        devicesApi.delete(device.id)
                                            .then(() => {
                                                qc.invalidateQueries({ queryKey: ['devices'] });
                                                qc.invalidateQueries({ queryKey: ['devices-trash'] });
                                                if (device.siteId) qc.invalidateQueries({ queryKey: ['sites'] });
                                                dispatch(pushToast({ severity: 'success', message: t('devices.deleteSuccess', { name: device.name }) }));
                                                onClose();
                                            })
                                            .catch(() => dispatch(pushToast({ severity: 'error', message: t('devices.deleteFailed') })));
                                    }}>{t('common.yes')}</Button>
                                    <Button size="small" onClick={() => setConfirmAction(null)}>{t('common.no')}</Button>
                                </Stack>
                            ) : (
                                <>
                                    <Button variant="outlined" color="warning" size="small" startIcon={<LinkOff />}
                                        sx={{ fontSize: '0.75rem', py: 0.5 }}
                                        onClick={() => setConfirmAction('release')}>
                                        Disconnect
                                    </Button>
                                    <Button variant="outlined" color="error" size="small" startIcon={<Delete />}
                                        sx={{ fontSize: '0.75rem', py: 0.5 }}
                                        onClick={() => setConfirmAction('delete')}>
                                        {t('devices.deleteDevice')}
                                    </Button>
                                </>
                            )}
                        </Stack>}

                    </Stack>
                )}

                {/* ── Tab 1: Nội dung ── */}
                {actualTab === 1 && (
                    <Stack spacing={3}>
                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                {t('devices.activeSchedules')}
                            </Typography>
                            {activeSchedules.length > 0 ? (
                                <Stack spacing={1}>
                                    {activeSchedules.map((s, idx) => (
                                        <Card key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
                                                <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                                                <Chip label={`P${idx}`} size="small" sx={{ fontSize: '0.65rem', height: 18, ml: 1 }} />
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                Playlist: {s.playlistName ?? '—'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                {s.startTime ?? '00:00'} – {s.endTime ?? '24:00'}
                                                {s.daysOfWeek?.length > 0 && ` · ${['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].filter((_, i) => s.daysOfWeek.includes(i)).join(', ')}`}
                                            </Typography>
                                        </Card>
                                    ))}
                                </Stack>
                            ) : (
                                <Typography variant="body2" color="text.disabled">{t('devices.noActiveSchedules')}</Typography>
                            )}
                        </Box>
                        <Divider />
                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                {t('devices.notes')}
                            </Typography>
                            {!isViewer && (
                                <Stack direction="row" gap={1} mt={2} alignItems="anchor-center">
                                    <TextField
                                        placeholder={t('devices.enterNote')}
                                        value={commentText}
                                        onChange={e => setCommentText(e.target.value)}
                                        size="small" fullWidth multiline maxRows={5}
                                    />
                                    <Button size="small" variant="contained"
                                        disabled={!commentText.trim() || addCommentMutation.isPending}
                                        onClick={() => addCommentMutation.mutate()}>
                                        {t('common.send')}
                                    </Button>
                                </Stack>
                            )}
                            <Divider sx={{ my: 2 }} />
                            <Stack spacing={1}>
                                {comments.map(c => (
                                    <Card key={c.id} variant="outlined" sx={{ p: 1.5 }}>
                                        <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                            <Typography variant="caption" fontWeight={600}>{c.userName ?? 'Unknown'}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(c.createdAt).toLocaleString()}
                                            </Typography>
                                        </Stack>
                                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{c.comment}</Typography>
                                    </Card>
                                ))}
                                {comments.length === 0 && (
                                    <Typography variant="body2" color="text.disabled">{t('devices.noNotes')}</Typography>
                                )}
                            </Stack>

                        </Box>
                    </Stack>
                )}

                {/* ── Tab 2: Phần cứng ── */}
                {actualTab === 2 && (
                    <Stack spacing={0}>
                        <InfoRow label={t('devices.model')} value={device.model ?? '—'} />
                        <InfoRow label={t('devices.serialNumber')} value={
                            device.androidId
                                ? <Typography variant="body2" fontFamily="monospace" fontWeight={500} component="span">{device.androidId}</Typography>
                                : '—'
                        } />
                        <InfoRow label={t('devices.osVersion')} value={device.osVersion ?? '—'} />
                        <InfoRow label={t('devices.appVersion')} value={device.appVersion ?? '—'} />
                        <InfoRow label={t('devices.ipAddress')} value={health?.ipAddress ?? '—'} />
                        <InfoRow label={t('devices.macAddress')} value={health?.macAddress ?? '—'} />
                        <InfoRow label={t('devices.timezoneLabel')} value={device.timezone} />
                        <InfoRow label={t('devices.licenseActivatedAt')} value={fmtDate(device.licenseStartDate)} />
                        <InfoRow label={t('devices.licenseExpiresAt')} value={fmtDate(device.licenseEndDate)} />
                        <InfoRow label={t('devices.lastOnlineAt')} value={device.lastOnlineAt ? new Date(device.lastOnlineAt).toLocaleString() : '—'} />
                        <InfoRow label={t('devices.lastOfflineAt')} value={device.lastOfflineAt ? new Date(device.lastOfflineAt).toLocaleString() : '—'} />
                        <InfoRow label={t('devices.pairingCode')} value={
                            device.pairingCode
                                ? <Chip label={device.pairingCode} size="small" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }} />
                                : <Typography variant="body2" color="text.disabled" component="span">{t('devices.paired')}</Typography>
                        } />
                        <InfoRow label={t('devices.createdAt')} value={new Date(device.createdAt).toLocaleString()} />
                        <InfoRow label={t('devices.lastSeen')} value={device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'} />
                    </Stack>
                )}

                {/* ── Tab 3: Hiệu năng ── */}
                {actualTab === 3 && (
                    <Box>
                        {healthLoading ? (
                            <Box>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={48} sx={{ mb: 0.5 }} />)}</Box>
                        ) : !health ? (
                            <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
                                {t('devices.noHealthData')}
                            </Typography>
                        ) : (
                            <Stack spacing={0}>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>{t('devices.cpuLabel')}</Typography>
                                    <Box flex={1}><HealthBar value={health.cpuUsage} /></Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>{t('devices.memory')}</Typography>
                                    <Box flex={1}><HealthBar value={health.memoryUsage} /></Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>{t('devices.heapMemory')}</Typography>
                                    <Box flex={1}>
                                        <Typography variant="body2" fontWeight={500}>{heapMB !== null ? `${heapMB} MB` : '—'}</Typography>
                                    </Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>{t('devices.storageLabel')}</Typography>
                                    <Box flex={1}>
                                        {health.storageTotal ? (
                                            <Stack spacing={0.5}>
                                                <HealthBar value={storagePercent} />
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatBytes(health.storageUsed)} / {formatBytes(health.storageTotal)}
                                                </Typography>
                                            </Stack>
                                        ) : <Typography variant="body2">—</Typography>}
                                    </Box>
                                </Stack>
                            </Stack>
                        )}
                        {health?.reportedAt && (
                            <Typography variant="caption" color="text.disabled" display="block" mt={1}>
                                {t('devices.updatedAt', { time: new Date(health.reportedAt).toLocaleTimeString('vi-VN') })}
                            </Typography>
                        )}
                    </Box>
                )}

                {/* ── Tab 4: Mạng ── */}
                {actualTab === 4 && (
                    <Stack spacing={3}>
                        {healthLoading ? (
                            <Box>{[1, 2, 3].map(i => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
                        ) : (
                            <Stack spacing={0}>
                                <InfoRow label={t('devices.networkType')} value={health?.networkType ?? '—'} />
                                <InfoRow label={t('devices.protocol')} value={health?.ipProtocol ?? '—'} />
                                <InfoRow label={t('devices.connection')} value={
                                    health?.networkConnected === true ? t('devices.connected') :
                                        health?.networkConnected === false ? t('devices.disconnected') : '—'
                                } />
                                <InfoRow label={t('devices.lanIp')} value={health?.ipAddress ?? '—'} />
                                <InfoRow label={t('devices.subnet')} value={health?.subnet ?? '—'} />
                                <InfoRow label={t('devices.wanIp')} value={(() => {
                                    const wan = health?.wanIp;
                                    if (!wan) return '—';
                                    // Same as LAN or private range → not a real WAN IP
                                    if (wan === health?.ipAddress) return t('devices.sameLan');
                                    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(wan)) return '— (private)';
                                    return wan;
                                })()} />
                            </Stack>
                        )}
                    </Stack>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2, flexShrink: 0 }}>
                {!isViewer && actualTab === 0 && (
                    <Button size="small" onClick={handleSave} disabled={saving || !isDirty}>
                        {saving ? t('common.saving') : t('common.save')}
                    </Button>
                )}
                <Button size="small" onClick={onClose}>{t('common.close')}</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Devices tab ───────────────────────────────────────────────────────────────

function DevicesTab({ onAddDevice }: { onAddDevice: () => void }) {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [detailDevice, setDetailDevice] = useState<Device | null>(null);
    const [visibleCols, setVisibleCols] = useState<Set<ColId>>(DEFAULT_VISIBLE);
    const [sortBy, setSortBy] = useState<ColId | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [limit, setLimit] = useState(10);

    const handleSort = (col: ColId) => {
        if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortBy(col); setSortDir('asc'); }
    };

    const sortVal = (d: Device): string | number => {
        switch (sortBy) {
            case 'osVersion': return d.osVersion ?? '';
            case 'site': return d.siteName ?? '';
            case 'lastSeen': return d.lastSeen ?? '';
            case 'uptime': return d.lastOnlineAt && (d.status === 'ONLINE' || d.status === 'SLEEP') ? new Date(d.lastOnlineAt).getTime() : 0;
            case 'licenseStartDate': return d.licenseStartDate ?? '';
            case 'licenseEndDate': return d.licenseEndDate ?? '';
            default: return '';
        }
    };

    const { data, isLoading } = useQuery({
        queryKey: ['devices', page, limit, search],
        queryFn: () => devicesApi.list({ page, limit: limit === 0 ? 9999 : limit, search: search || undefined }),
        refetchInterval: 15_000,
    });

    const show = (id: ColId) => visibleCols.has(id);
    const colCount = visibleCols.size;

    return (
        <Card>
            <CardContent sx={{ p: 0 }}>
                {/* ── Toolbar ── */}
                <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <TextField
                        placeholder={t('devices.searchPlaceholder')}
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        size="small"
                        sx={{ width: 260 }}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.secondary', fontSize: 20 }} /></InputAdornment>,
                        }}
                    />
                    <Box sx={{ flex: 1 }} />
                    <ColumnPicker visible={visibleCols} onChange={setVisibleCols} />
                </Stack>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                {show('device') && <TableCell align="center" sx={{ fontWeight: 700 }}>{t('common.name')}</TableCell>}
                                {show('status') && <TableCell align="center" sx={{ fontWeight: 700 }}>{t('common.status')}</TableCell>}
                                {show('license') && <TableCell align="center" sx={{ fontWeight: 700 }}>License</TableCell>}
                                {show('model') && <TableCell align="center" sx={{ fontWeight: 700 }}>Model</TableCell>}
                                {show('sn') && <TableCell align="center" sx={{ fontWeight: 700 }}>S/N</TableCell>}
                                {show('osVersion') && <TableCell align="center" sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortBy === 'osVersion'} direction={sortBy === 'osVersion' ? sortDir : 'asc'} onClick={() => handleSort('osVersion')}>{t('devices.osVersion')}</TableSortLabel>
                                </TableCell>}
                                {show('lastSeen') && <TableCell align="center" sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortBy === 'lastSeen'} direction={sortBy === 'lastSeen' ? sortDir : 'asc'} onClick={() => handleSort('lastSeen')}>{t('devices.lastSeen')}</TableSortLabel>
                                </TableCell>}
                                {show('uptime') && <TableCell align="center" sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortBy === 'uptime'} direction={sortBy === 'uptime' ? sortDir : 'asc'} onClick={() => handleSort('uptime')}>{t('devices.uptime')}</TableSortLabel>
                                </TableCell>}
                                {show('site') && <TableCell align="center" sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortBy === 'site'} direction={sortBy === 'site' ? sortDir : 'asc'} onClick={() => handleSort('site')}>{t('devices.site')}</TableSortLabel>
                                </TableCell>}
                                {show('location') && <TableCell align="center" sx={{ fontWeight: 700 }}>{t('common.note')}</TableCell>}
                                {show('licenseStartDate') && <TableCell align="center" sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortBy === 'licenseStartDate'} direction={sortBy === 'licenseStartDate' ? sortDir : 'asc'} onClick={() => handleSort('licenseStartDate')}>{t('common.registeredAt')}</TableSortLabel>
                                </TableCell>}
                                {show('licenseEndDate') && <TableCell align="center" sx={{ fontWeight: 700 }}>
                                    <TableSortLabel active={sortBy === 'licenseEndDate'} direction={sortBy === 'licenseEndDate' ? sortDir : 'asc'} onClick={() => handleSort('licenseEndDate')}>{t('common.expiredAt')}</TableSortLabel>
                                </TableCell>}
                                {show('pairingCode') && <TableCell align="center" sx={{ fontWeight: 700 }}>{t('devices.pairingCode')}</TableCell>}
                                {show('actions') && <TableCell align="center" sx={{ fontWeight: 700 }}>{t('common.actions')}</TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading
                                ? Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        {Array.from({ length: colCount }).map((__, j) => (
                                            <TableCell key={j}><Skeleton height={24} /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                                : ([...(data?.data ?? [])].sort((a, b) => {
                                    if (!sortBy) return 0;
                                    const va = sortVal(a), vb = sortVal(b);
                                    const cmp = typeof va === 'number' ? va - (vb as number) : String(va).localeCompare(String(vb), 'vi');
                                    return sortDir === 'asc' ? cmp : -cmp;
                                })).map((device) => (
                                    <TableRow key={device.id} hover>
                                        {show('device') && (
                                            <TableCell align="center">
                                                <Stack direction="row" alignItems="center" gap={1.5}>
                                                    <Avatar sx={{ width: 36, height: 36, bgcolor: device.status === 'ONLINE' ? 'success.main' : device.status === 'SLEEP' ? 'info.main' : device.status === 'APP_EXIT' ? 'warning.main' : 'grey.700' }}>
                                                        <Tv sx={{ fontSize: 18 }} />
                                                    </Avatar>
                                                    <Box>
                                                        <Typography align='left' variant="body2" fontWeight={600}>{device.name}</Typography>
                                                        {/* <Typography  variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                                            {device.id.slice(0, 8)}…
                                                        </Typography> */}
                                                    </Box>
                                                </Stack>
                                            </TableCell>
                                        )}
                                        {show('status') && <TableCell align="center"><StatusChip status={device.status} /></TableCell>}
                                        {show('license') && <TableCell align="center"><LicenseChip device={device} /></TableCell>}
                                        {show('model') && <TableCell align="center"><Typography variant="body2">{device.model ?? '—'}</Typography></TableCell>}
                                        {show('sn') && (
                                            <TableCell align="center">
                                                <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem" color="text.secondary">
                                                    {device.androidId ? device.androidId.slice(0, 12) : '—'}
                                                </Typography>
                                            </TableCell>
                                        )}
                                        {show('osVersion') && <TableCell align="center"><Typography variant="body2">{device.osVersion ?? '—'}</Typography></TableCell>}
                                        {show('lastSeen') && (
                                            <TableCell align="center">
                                                <Typography variant="caption" color="text.secondary">
                                                    {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
                                                </Typography>
                                            </TableCell>
                                        )}
                                        {show('uptime') && (
                                            <TableCell align="center">
                                                <Typography variant="body2" fontWeight={device.lastOnlineAt ? 500 : 400} color={device.lastOnlineAt && (device.status === 'ONLINE' || device.status === 'SLEEP') ? 'success.main' : 'text.secondary'}>
                                                    {formatUptime(device.lastOnlineAt, device.status)}
                                                </Typography>
                                            </TableCell>
                                        )}
                                        {show('site') && <TableCell align="center"><Typography variant="body2">{device.siteName ?? '—'}</Typography></TableCell>}
                                        {show('location') && <TableCell align="center"><Typography variant="caption" color={device.location ? 'text.secondary' : 'text.disabled'}>{device.location ?? '—'}</Typography></TableCell>}
                                        {show('licenseStartDate') && <TableCell align="center"><Typography variant="body2">{fmtDate(device.licenseStartDate)}</Typography></TableCell>}
                                        {show('licenseEndDate') && <TableCell align="center"><Typography variant="body2">{fmtDate(device.licenseEndDate)}</Typography></TableCell>}
                                        {show('pairingCode') && (
                                            <TableCell align="center">
                                                <Chip label={device.pairingCode ?? '—'} size="small" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }} />
                                            </TableCell>
                                        )}
                                        {show('actions') && (
                                            <TableCell align="center">
                                                <Tooltip title={t('common.manage')}>
                                                    <IconButton size="small" onClick={() => setDetailDevice(device)}>
                                                        <Settings fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}

                            {!isLoading && !data?.data.length && (
                                <TableRow>
                                    <TableCell colSpan={colCount} align="center" sx={{ py: 6 }}>
                                        <Tv sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                                        <Typography variant="body2" color="text.secondary">
                                            {t('devices.noDevicesFound')}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

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

            <DeviceManageDialog device={detailDevice} open={Boolean(detailDevice)} onClose={() => setDetailDevice(null)} />
        </Card>
    );
}

// ── Devices Trash Tab ─────────────────────────────────────────────────────────

function DevicesTrashTab({ isAdmin }: { isAdmin: boolean }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const { t } = useTranslation();

    const { data: trashItems = [], isLoading } = useQuery({
        queryKey: ['devices-trash'],
        queryFn: () => devicesApi.listTrash(),
        staleTime: 30_000,
    });

    const [confirmTarget, setConfirmTarget] = useState<{ id: string; name: string; action: 'restore' | 'permanent' } | null>(null);

    const restoreMutation = useMutation({
        mutationFn: (id: string) => devicesApi.restore(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['devices-trash'] });
            qc.invalidateQueries({ queryKey: ['devices'] });
            setConfirmTarget(null);
            dispatch(pushToast({ severity: 'success', message: t('common.success') }));
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, t('common.failedAction')) })),
    });

    const permanentDeleteMutation = useMutation({
        mutationFn: (id: string) => devicesApi.permanentDelete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['devices-trash'] });
            setConfirmTarget(null);
            dispatch(pushToast({ severity: 'success', message: t('common.success') }));
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, t('common.failedAction')) })),
    });

    const isPending = restoreMutation.isPending || permanentDeleteMutation.isPending;

    const handleConfirm = () => {
        if (!confirmTarget) return;
        if (confirmTarget.action === 'restore') restoreMutation.mutate(confirmTarget.id);
        else permanentDeleteMutation.mutate(confirmTarget.id);
    };

    if (isLoading) return (
        <Card><CardContent sx={{ p: 0 }}>
            <TableContainer><Table size="small"><TableBody>
                {Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => (
                        <TableCell key={j}><Skeleton /></TableCell>
                    ))}</TableRow>
                ))}
            </TableBody></Table></TableContainer>
        </CardContent></Card>
    );

    if (!trashItems.length) return (
        <Card><CardContent>
            <Stack alignItems="center" py={6} spacing={1}>
                <Tv sx={{ fontSize: 64, color: 'text.secondary' }} />
                <Typography variant="h6">Thùng rác trống</Typography>
                <Typography variant="body2" color="text.secondary">
                    Thiết bị đã xóa sẽ xuất hiện ở đây và tự động xóa vĩnh viễn sau 30 ngày.
                </Typography>
            </Stack>
        </CardContent></Card>
    );

    return (
        <>
            <Card>
                <CardContent sx={{ p: 0 }}>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('common.name')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('devices.model')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('devices.site')}</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>{t('common.deletedAt')}</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>{t('common.actions')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {trashItems.map((device) => (
                                    <TableRow key={device.id} hover>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={1}>
                                                <Avatar sx={{ width: 28, height: 28, bgcolor: 'grey.300' }}>
                                                    <Tv sx={{ fontSize: 16, color: 'grey.600' }} />
                                                </Avatar>
                                                <Typography variant="body2" fontWeight={600}>{device.name}</Typography>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">{device.model ?? '—'}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">{device.siteName ?? '—'}</Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Typography variant="caption" color="text.secondary">
                                                {device.deletedAt ? new Date(device.deletedAt).toLocaleDateString() : '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            <Stack direction="row" justifyContent="center" spacing={0.5}>
                                                <Tooltip title={t('common.restore')}>
                                                    <IconButton size="small" color="success" onClick={() => setConfirmTarget({ id: device.id, name: device.name, action: 'restore' })}>
                                                        <Restore sx={{ fontSize: 16 }} />
                                                    </IconButton>
                                                </Tooltip>
                                                {isAdmin && (
                                                    <Tooltip title={t('common.permanentDelete')}>
                                                        <IconButton size="small" color="error" onClick={() => setConfirmTarget({ id: device.id, name: device.name, action: 'permanent' })}>
                                                            <DeleteForever sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            {/* Confirm dialog */}
            <Dialog open={!!confirmTarget} onClose={isPending ? undefined : () => setConfirmTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        {confirmTarget?.action === 'permanent' ? <DeleteForever color="error" /> : <Restore color="success" />}
                        <span>{confirmTarget?.action === 'permanent' ? t('devices.permanentDeleteTitle') : t('devices.restoreTitle')}</span>
                    </Stack>
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2">
                        {confirmTarget?.action === 'permanent'
                            ? t('devices.permanentDeleteConfirm', { name: confirmTarget?.name })
                            : t('devices.restoreConfirm', { name: confirmTarget?.name })}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setConfirmTarget(null)} disabled={isPending}>{t('common.cancel')}</Button>
                    <Button
                        size="small"
                        color={confirmTarget?.action === 'permanent' ? 'error' : 'success'}
                        disabled={isPending}
                        onClick={handleConfirm}
                    >
                        {isPending ? '...' : confirmTarget?.action === 'permanent' ? t('common.permanentDelete') : t('common.restore')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ── Main DevicesPage ─────────────────────────────────────────────────────────

export default function DevicesPage() {
    const [createOpen, setCreateOpen] = useState(false);
    const currentUser = useAppSelector(s => s.auth.user);
    const isViewer = currentUser?.role === 'VIEWER';
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN' || currentUser?.role === 'MANAGER';
    const [activeTab, setActiveTab] = useState(0);
    const { t } = useTranslation();

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>{t('devices.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">{t('devices.subtitle')}</Typography>
                </Box>
                {!isViewer && activeTab === 0 && (
                    <Button startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                        {t('devices.addDevice')}
                    </Button>
                )}
            </Stack>

            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Tab label={t('devices.title')} />
                <Tab label={t('devices.trashTab')} />
            </Tabs>

            {activeTab === 0
                ? <DevicesTab onAddDevice={() => setCreateOpen(true)} />
                : <DevicesTrashTab isAdmin={isAdmin} />
            }

            {!isViewer && <CreateDeviceDialog open={createOpen} onClose={() => setCreateOpen(false)} />}
        </Box>
    );
}
