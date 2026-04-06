import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Card, CardContent, Stack, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, InputAdornment, Pagination, Avatar, Skeleton,
    Tabs, Tab, Divider, TableSortLabel,
    Select, FormControl, InputLabel, MenuItem,
    LinearProgress, Slider, Popover, FormControlLabel, Checkbox, Autocomplete,
} from '@mui/material';
import {
    Add, Search, Tv, CheckCircle, ErrorOutline,
    PowerSettingsNew, Refresh, Screenshot, Delete,
    LinkOff, Settings,
    Bedtime, ExitToApp, ViewColumn,
} from '@mui/icons-material';
import { devicesApi } from '@api/devices.api';
import { sitesApi } from '@api/sites.api';
import { getApiError } from '@api/client';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Device, DeviceHealth, DeviceComment, Site, ActiveSchedule } from '@/types';

// ── Column visibility ─────────────────────────────────────────────────────────

const ALL_COLUMNS = [
    { id: 'device', label: 'Tên' },
    { id: 'status', label: 'Status' },
    { id: 'license', label: 'License' },
    { id: 'model', label: 'Model' },
    { id: 'sn', label: 'S/N' },
    { id: 'osVersion', label: 'OS Version' },
    { id: 'site', label: 'Site' },
    { id: 'lastSeen', label: 'Last seen' },
    { id: 'uptime', label: 'Uptime' },
    { id: 'location', label: 'Vị trí' },
    { id: 'licenseStartDate', label: 'Ngày đăng ký' },
    { id: 'licenseEndDate', label: 'Ngày hết hạn' },
    { id: 'pairingCode', label: 'Pairing Code' },
    { id: 'actions', label: 'Thao tác' },
] as const;

type ColId = (typeof ALL_COLUMNS)[number]['id'];
const DEFAULT_VISIBLE = new Set<ColId>([
    'device', 'status', 'license', 'model', 'sn', 'osVersion', 'site', 'pairingCode', 'actions',
]);

function ColumnPicker({ visible, onChange }: { visible: Set<ColId>; onChange: (v: Set<ColId>) => void }) {
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
                Cột hiển thị
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
                        Chọn cột hiển thị
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
                                label={<Typography variant="body2">{col.label}</Typography>}
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
    const isLicensed = device.isLicensed === true;
    return (
        <Chip
            label={isLicensed ? 'Licensed' : 'Unlicensed'}
            color={isLicensed ? 'success' : 'default'}
            size="small"
            sx={{ fontWeight: 600, fontSize: '0.7rem' }}
        />
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: Device['status'] }) {
    const map: Record<string, { label: string; color: 'success' | 'warning' | 'default' | 'error' | 'info'; icon: React.ReactElement }> = {
        ONLINE: { label: 'Online', color: 'success', icon: <CheckCircle sx={{ fontSize: 14 }} /> },
        SLEEP: { label: 'Sleep', color: 'info', icon: <Bedtime sx={{ fontSize: 14 }} /> },
        APP_EXIT: { label: 'Thoát app', color: 'warning', icon: <ExitToApp sx={{ fontSize: 14 }} /> },
        OFFLINE: { label: 'Offline', color: 'default', icon: <ErrorOutline sx={{ fontSize: 14 }} /> },
        ERROR: { label: 'Error', color: 'error', icon: <ErrorOutline sx={{ fontSize: 14 }} /> },
    };
    const cfg = map[status] ?? map.OFFLINE;
    return <Chip label={cfg.label} color={cfg.color} size="small" icon={cfg.icon} sx={{ fontWeight: 600, fontSize: '0.7rem' }} />;
}

function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Intl.DateTimeFormat('vi-VN').format(new Date(d));
}


// ── Create Device dialog ──────────────────────────────────────────────────────

function CreateDeviceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [location, setLocation] = useState('');

    const mutation = useMutation({
        mutationFn: () => devicesApi.create({ name, location }),
        onSuccess: (device) => {
            qc.invalidateQueries({ queryKey: ['devices'] });
            dispatch(pushToast({
                severity: 'success',
                message: `Tạo thành công! Mã ghép cặp: ${device.pairingCode}`,
            }));
            setName(''); setLocation('');
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Tạo device thất bại') })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Thêm Device</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Stack spacing={2.5} sx={{ mt: 0.5 }}>
                    <TextField label="Tên thiết bị *" value={name} onChange={(e) => setName(e.target.value)} fullWidth required autoFocus />
                    <TextField label="Vị trí (tuỳ chọn)" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={onClose}>Huỷ</Button>
                <Button variant="contained" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>
                    Tạo
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
    const [tab, setTab] = React.useState(0);
    const dispatch = useAppDispatch();
    const qc = useQueryClient();

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
        enabled: open && Boolean(device?.id) && (tab === 2 || tab === 3 || tab === 4),
        staleTime: 30_000,
    });

    const { data: activeSchedules = [] } = useQuery<ActiveSchedule[]>({
        queryKey: ['device-active-schedules', device?.id],
        queryFn: () => device ? devicesApi.getActiveSchedules(device.id) : Promise.resolve([]),
        enabled: open && Boolean(device?.id) && tab === 1,
        staleTime: 30_000,
    });

    const { data: comments = [] } = useQuery<DeviceComment[]>({
        queryKey: ['device-comments', device?.id],
        queryFn: () => device ? devicesApi.getComments(device.id) : Promise.resolve([]),
        enabled: open && Boolean(device?.id) && tab === 1,
    });

    const [volume, setVolume] = React.useState(50);
    const [volumeDirty, setVolumeDirty] = React.useState(false);
    React.useEffect(() => { if (open) setVolumeDirty(false); }, [open]);

    // Info form (tab 0)
    const [infoName, setInfoName] = React.useState('');
    const [infoLocation, setInfoLocation] = React.useState('');
    const [licenseStartDate, setLicenseStartDate] = React.useState('');
    const [licenseEndDate, setLicenseEndDate] = React.useState('');
    React.useEffect(() => {
        if (device) {
            setInfoName(device.name);
            setInfoLocation(device.location ?? '');
            setLicenseStartDate(device.licenseStartDate ? device.licenseStartDate.slice(0, 10) : '');
            setLicenseEndDate(device.licenseEndDate ? device.licenseEndDate.slice(0, 10) : '');
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
                licenseStartDate: licenseStartDate || null,
                licenseEndDate: licenseEndDate || null,
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
            dispatch(pushToast({ severity: 'success', message: 'Đã lưu thay đổi' }));
        } catch (err) {
            dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Lưu thất bại') }));
        } finally {
            setSaving(false);
        }
    };

    const [commentText, setCommentText] = React.useState('');
    const addCommentMutation = useMutation({
        mutationFn: () => devicesApi.addComment(device!.id, commentText),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['device-comments', device?.id] });
            setCommentText('');
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Gửi ghi chú thất bại') })),
    });

    const sendCmd = async (command: string, payload?: Record<string, unknown>) => {
        try {
            await devicesApi.sendCommand(device!.id, command, payload);
            dispatch(pushToast({ severity: 'success', message: `Đã gửi lệnh ${command}` }));
        } catch {
            dispatch(pushToast({ severity: 'error', message: 'Gửi lệnh thất bại' }));
        }
    };

    if (!device) return null;

    const isDirty =
        infoName          !== device.name ||
        infoLocation      !== (device.location ?? '') ||
        licenseStartDate  !== (device.licenseStartDate ? device.licenseStartDate.slice(0, 10) : '') ||
        licenseEndDate    !== (device.licenseEndDate   ? device.licenseEndDate.slice(0, 10)   : '') ||
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
                    <Tab label="Điều khiển" />
                    <Tab label="Nội dung" />
                    <Tab label="Phần cứng" />
                    <Tab label="Hiệu năng" />
                    <Tab label="Mạng" />
                </Tabs>
            </DialogTitle>

            <DialogContent dividers sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>

                {/* ── Tab 0: Điều khiển ── */}
                {tab === 0 && (
                    <Stack spacing={2}>

                        {/* Lệnh nhanh */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" mb={0.75} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                Lệnh nhanh
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" gap={0.75}>
                                {[
                                    { cmd: 'WAKE_UP', label: 'Wake Up', icon: <PowerSettingsNew sx={{ fontSize: 15 }} /> },
                                    { cmd: 'RESTART', label: 'Restart Player', icon: <PowerSettingsNew sx={{ fontSize: 15 }} /> },
                                    { cmd: 'RELOAD_CONTENT', label: 'Reload Content', icon: <Refresh sx={{ fontSize: 15 }} /> },
                                    { cmd: 'CLEAR_CACHE', label: 'Clear Cache', icon: <Refresh sx={{ fontSize: 15 }} /> },
                                    { cmd: 'SCREENSHOT', label: 'Screenshot', icon: <Screenshot sx={{ fontSize: 15 }} /> },
                                    { cmd: 'EXIT_APP', label: 'Thoát app', icon: <ExitToApp sx={{ fontSize: 15 }} /> },
                                ].map(({ cmd, label, icon }) => (
                                    <Button key={cmd} variant="outlined" size="small" startIcon={icon}
                                        sx={{ fontSize: '0.75rem', py: 0.5 }} onClick={() => sendCmd(cmd)}>
                                        {label}
                                    </Button>
                                ))}
                            </Stack>
                        </Box>

                        <Divider />

                        {/* Âm lượng */}
                        <Stack direction="row" alignItems="center" gap={1.5}>
                            <Typography variant="caption" color="text.secondary" fontWeight={700} sx={{ minWidth: 72, textTransform: 'uppercase', letterSpacing: 1 }}>
                                Âm lượng
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
                                    <TextField {...params} label="Chọn site" size="small"
                                        placeholder="Chưa thuộc site nào" />
                                )}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                size="small"
                            />
                        </Box>

                        <Divider />

                        {/* Thông tin thiết bị */}
                        <Box>
                            <Typography variant="caption" color="text.secondary" fontWeight={700} display="block" mb={0.75} sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                Thông tin thiết bị
                            </Typography>
                            <Stack spacing={1}>
                                <Stack direction="row" spacing={1}>
                                    <TextField label="Tên thiết bị" value={infoName} onChange={e => setInfoName(e.target.value)} size="small" sx={{ flex: 1 }} />
                                    <TextField label="Vị trí" value={infoLocation} onChange={e => setInfoLocation(e.target.value)} size="small" sx={{ flex: 1 }} />
                                </Stack>
                                <Divider />
                                <Stack direction="row" spacing={1}>
                                    <TextField label="Ngày đăng ký" type="date" value={licenseStartDate}
                                        onChange={e => setLicenseStartDate(e.target.value)}
                                        size="small" sx={{ flex: 1 }} InputLabelProps={{ shrink: true }} />
                                    <TextField label="Ngày hết hạn" type="date" value={licenseEndDate}
                                        onChange={e => setLicenseEndDate(e.target.value)}
                                        size="small" sx={{ flex: 1 }} InputLabelProps={{ shrink: true }} />
                                </Stack>
                            </Stack>
                        </Box>
                        <Divider />
                        {/* Vùng nguy hiểm */}
                        <Stack direction="row" alignItems="center" gap={1}>
                            <Typography variant="caption" color="error" fontWeight={700} sx={{ textTransform: 'uppercase', letterSpacing: 1, mr: 0.5 }}>
                                Nguy hiểm:
                            </Typography>
                            <Button variant="outlined" color="warning" size="small" startIcon={<LinkOff />}
                                sx={{ fontSize: '0.75rem', py: 0.5 }}
                                onClick={() => {
                                    if (!window.confirm(`⚠️ RELEASE "${device.name}"\n\nThiết bị sẽ bị ngắt kết nối và cần ghép cặp lại.\nBạn có chắc chắn?`)) return;
                                    devicesApi.reset(device.id)
                                        .then(r => {
                                            qc.invalidateQueries({ queryKey: ['devices'] });
                                            if (device.siteId) qc.invalidateQueries({ queryKey: ['sites'] });
                                            window.alert(`✅ Release thành công!\n\nMã ghép cặp mới: ${r.pairingCode}\n\nNhập mã này trên TV để ghép cặp lại.`);
                                            onClose();
                                        })
                                        .catch(() => dispatch(pushToast({ severity: 'error', message: 'Release thất bại' })));
                                }}>
                                Release
                            </Button>
                            <Button variant="outlined" color="error" size="small" startIcon={<Delete />}
                                sx={{ fontSize: '0.75rem', py: 0.5 }}
                                onClick={() => {
                                    if (!window.confirm(`Xóa device "${device.name}"?\nHành động này không thể hoàn tác.`)) return;
                                    devicesApi.delete(device.id)
                                        .then(() => {
                                            qc.invalidateQueries({ queryKey: ['devices'] });
                                            if (device.siteId) qc.invalidateQueries({ queryKey: ['sites'] });
                                            dispatch(pushToast({ severity: 'success', message: `Device "${device.name}" đã được xóa` }));
                                            onClose();
                                        })
                                        .catch(() => dispatch(pushToast({ severity: 'error', message: 'Xóa device thất bại' })));
                                }}>
                                Xóa device
                            </Button>
                        </Stack>

                    </Stack>
                )}

                {/* ── Tab 1: Nội dung ── */}
                {tab === 1 && (
                    <Stack spacing={3}>
                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                Lịch phát đang hoạt động
                            </Typography>
                            {activeSchedules.length > 0 ? (
                                <Stack spacing={1}>
                                    {activeSchedules.map(s => (
                                        <Card key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={0.5}>
                                                <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                                                <Chip label={`P${s.priority}`} size="small" sx={{ fontSize: '0.65rem', height: 18, ml: 1 }} />
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                Playlist: {s.playlistName ?? '—'}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                {s.startTime ?? '00:00'} – {s.endTime ?? '24:00'}
                                                {s.daysOfWeek?.length > 0 && ` · ${['CN','T2','T3','T4','T5','T6','T7'].filter((_, i) => s.daysOfWeek.includes(i)).join(', ')}`}
                                            </Typography>
                                        </Card>
                                    ))}
                                </Stack>
                            ) : (
                                <Typography variant="body2" color="text.disabled">Không có lịch nào đang hoạt động</Typography>
                            )}
                        </Box>
                        <Divider />
                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                Ghi chú
                            </Typography>
                            <Stack direction="row" gap={1} mt={2} alignItems="flex-end">
                                <TextField
                                    placeholder="Nhập ghi chú..."
                                    value={commentText}
                                    onChange={e => setCommentText(e.target.value)}
                                    size="small" fullWidth multiline maxRows={3}
                                />
                                <Button variant="contained" size="medium"
                                    disabled={!commentText.trim() || addCommentMutation.isPending}
                                    onClick={() => addCommentMutation.mutate()}>
                                    Gửi
                                </Button>
                            </Stack>
                            <Divider sx={{ my: 2 }} />
                            <Stack spacing={1}>
                                {comments.map(c => (
                                    <Card key={c.id} variant="outlined" sx={{ p: 1.5 }}>
                                        <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                            <Typography variant="caption" fontWeight={600}>{c.userName ?? 'Unknown'}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {new Date(c.createdAt).toLocaleString('vi-VN')}
                                            </Typography>
                                        </Stack>
                                        <Typography variant="body2">{c.comment}</Typography>
                                    </Card>
                                ))}
                                {comments.length === 0 && (
                                    <Typography variant="body2" color="text.disabled">Chưa có ghi chú</Typography>
                                )}
                            </Stack>
                            
                        </Box>
                    </Stack>
                )}

                {/* ── Tab 2: Phần cứng ── */}
                {tab === 2 && (
                    <Stack spacing={0}>
                        <InfoRow label="Model" value={device.model ?? '—'} />
                        <InfoRow label="S/N (Android ID)" value={
                            device.androidId
                                ? <Typography variant="body2" fontFamily="monospace" fontWeight={500} component="span">{device.androidId}</Typography>
                                : '—'
                        } />
                        <InfoRow label="OS Version" value={device.osVersion ?? '—'} />
                        <InfoRow label="App Version" value={device.appVersion ?? '—'} />
                        <InfoRow label="IP Address" value={health?.ipAddress ?? '—'} />
                        <InfoRow label="MAC Address" value={health?.macAddress ?? '—'} />
                        <InfoRow label="Múi giờ" value={device.timezone} />
                        <InfoRow label="Ngày đăng ký" value={fmtDate(device.licenseStartDate)} />
                        <InfoRow label="Ngày hết hạn" value={fmtDate(device.licenseEndDate)} />
                        <InfoRow label="Online từ" value={device.lastOnlineAt ? new Date(device.lastOnlineAt).toLocaleString('vi-VN') : '—'} />
                        <InfoRow label="Tắt lần cuối" value={device.lastOfflineAt ? new Date(device.lastOfflineAt).toLocaleString('vi-VN') : '—'} />
                        <InfoRow label="Pairing Code" value={
                            device.pairingCode
                                ? <Chip label={device.pairingCode} size="small" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }} />
                                : <Typography variant="body2" color="text.disabled" component="span">Đã ghép cặp</Typography>
                        } />
                        <InfoRow label="Tạo lúc" value={new Date(device.createdAt).toLocaleString('vi-VN')} />
                        <InfoRow label="Last Seen" value={device.lastSeen ? new Date(device.lastSeen).toLocaleString('vi-VN') : '—'} />
                    </Stack>
                )}

                {/* ── Tab 3: Hiệu năng ── */}
                {tab === 3 && (
                    <Box>
                        {healthLoading ? (
                            <Box>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={48} sx={{ mb: 0.5 }} />)}</Box>
                        ) : !health ? (
                            <Typography variant="body2" color="text.disabled" sx={{ py: 2 }}>
                                Chưa có dữ liệu — thiết bị chưa gửi heartbeat.
                            </Typography>
                        ) : (
                            <Stack spacing={0}>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>CPU (thiết bị)</Typography>
                                    <Box flex={1}><HealthBar value={health.cpuUsage} /></Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>CPU (CMS process)</Typography>
                                    <Box flex={1}><HealthBar value={health.processCpuPercent} /></Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>RAM</Typography>
                                    <Box flex={1}><HealthBar value={health.memoryUsage} /></Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>Heap Memory</Typography>
                                    <Box flex={1}>
                                        <Typography variant="body2" fontWeight={500}>{heapMB !== null ? `${heapMB} MB` : '—'}</Typography>
                                    </Box>
                                </Stack>
                                <Stack direction="row" alignItems="center" gap={1} py={1.5}>
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>Bộ nhớ lưu trữ</Typography>
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
                                Cập nhật lúc {new Date(health.reportedAt).toLocaleTimeString('vi-VN')}
                            </Typography>
                        )}
                    </Box>
                )}

                {/* ── Tab 4: Mạng ── */}
                {tab === 4 && (
                    <Stack spacing={3}>
                        {healthLoading ? (
                            <Box>{[1, 2, 3].map(i => <Skeleton key={i} height={40} sx={{ mb: 0.5 }} />)}</Box>
                        ) : (
                            <Stack spacing={0}>
                                <InfoRow label="Loại mạng" value={health?.networkType ?? '—'} />
                                <InfoRow label="Kết nối" value={
                                    health?.networkConnected === true ? 'Đã kết nối' :
                                        health?.networkConnected === false ? 'Mất kết nối' : '—'
                                } />
                                <InfoRow label="IP LAN" value={health?.ipAddress ?? '—'} />
                                <InfoRow label="IP WAN" value={(() => {
                                    const wan = health?.wanIp;
                                    if (!wan) return '—';
                                    // Same as LAN or private range → not a real WAN IP
                                    if (wan === health?.ipAddress) return '— (cùng LAN)';
                                    if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(wan)) return '— (private)';
                                    return wan;
                                })() } />
                            </Stack>
                        )}
                    </Stack>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, flexShrink: 0 }}>
                {tab === 0 && (
                    <Button variant="contained" onClick={handleSave} disabled={saving || !isDirty}>
                        {saving ? 'Đang lưu…' : 'Lưu'}
                    </Button>
                )}
                <Button onClick={onClose}>Đóng</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Devices tab ───────────────────────────────────────────────────────────────

function DevicesTab({ onAddDevice }: { onAddDevice: () => void }) {
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
            case 'osVersion':       return d.osVersion ?? '';
            case 'site':            return d.siteName ?? '';
            case 'lastSeen':        return d.lastSeen ?? '';
            case 'uptime':          return d.lastOnlineAt && (d.status === 'ONLINE' || d.status === 'SLEEP') ? new Date(d.lastOnlineAt).getTime() : 0;
            case 'licenseStartDate': return d.licenseStartDate ?? '';
            case 'licenseEndDate':  return d.licenseEndDate ?? '';
            default:                return '';
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
                        placeholder="Tìm kiếm thiết bị..."
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
                                {show('device') && <TableCell align="center" sx={{ fontWeight: 700 }}>Tên</TableCell>}
                                {show('status') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>Status</TableCell>}
                                {show('license') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>License</TableCell>}
                                {show('model') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>Model</TableCell>}
                                {show('sn') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>S/N</TableCell>}
                                {show('osVersion') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>
                                    <TableSortLabel active={sortBy === 'osVersion'} direction={sortBy === 'osVersion' ? sortDir : 'asc'} onClick={() => handleSort('osVersion')}>OS Version</TableSortLabel>
                                </TableCell>}
                                {show('lastSeen') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>
                                    <TableSortLabel active={sortBy === 'lastSeen'} direction={sortBy === 'lastSeen' ? sortDir : 'asc'} onClick={() => handleSort('lastSeen')}>Last Seen</TableSortLabel>
                                </TableCell>}
                                {show('uptime') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>
                                    <TableSortLabel active={sortBy === 'uptime'} direction={sortBy === 'uptime' ? sortDir : 'asc'} onClick={() => handleSort('uptime')}>Uptime</TableSortLabel>
                                </TableCell>}
                                {show('site') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>
                                    <TableSortLabel active={sortBy === 'site'} direction={sortBy === 'site' ? sortDir : 'asc'} onClick={() => handleSort('site')}>Site</TableSortLabel>
                                </TableCell>}
                                {show('location') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>Vị trí</TableCell>}
                                {show('licenseStartDate') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>
                                    <TableSortLabel active={sortBy === 'licenseStartDate'} direction={sortBy === 'licenseStartDate' ? sortDir : 'asc'} onClick={() => handleSort('licenseStartDate')}>Ngày đăng ký</TableSortLabel>
                                </TableCell>}
                                {show('licenseEndDate') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>
                                    <TableSortLabel active={sortBy === 'licenseEndDate'} direction={sortBy === 'licenseEndDate' ? sortDir : 'asc'} onClick={() => handleSort('licenseEndDate')}>Ngày hết hạn</TableSortLabel>
                                </TableCell>}
                                {show('pairingCode') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>Pairing Code</TableCell>}
                                {show('actions') && <TableCell align="center" sx={{ fontWeight: 700, borderLeft: '1px solid', borderColor: 'divider' }}>Thao tác</TableCell>}
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
                                        {show('status') && <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}><StatusChip status={device.status} /></TableCell>}
                                        {show('license') && <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}><LicenseChip device={device} /></TableCell>}
                                        {show('model') && <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}><Typography variant="body2">{device.model ?? '—'}</Typography></TableCell>}
                                        {show('sn') && (
                                            <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>
                                                <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem" color="text.secondary">
                                                    {device.androidId ? device.androidId.slice(0, 12) : '—'}
                                                </Typography>
                                            </TableCell>
                                        )}
                                        {show('osVersion') && <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}><Typography variant="body2">{device.osVersion ?? '—'}</Typography></TableCell>}
                                        {show('lastSeen') && (
                                            <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>
                                                <Typography variant="caption" color="text.secondary">
                                                    {device.lastSeen ? new Date(device.lastSeen).toLocaleString('vi-VN') : '—'}
                                                </Typography>
                                            </TableCell>
                                        )}
                                        {show('uptime') && (
                                            <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>
                                                <Typography variant="body2" fontWeight={device.lastOnlineAt ? 500 : 400} color={device.lastOnlineAt && (device.status === 'ONLINE' || device.status === 'SLEEP') ? 'success.main' : 'text.secondary'}>
                                                    {formatUptime(device.lastOnlineAt, device.status)}
                                                </Typography>
                                            </TableCell>
                                        )}
                                        {show('site') && <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}><Typography variant="body2">{device.siteName ?? '—'}</Typography></TableCell>}
                                        {show('location') && <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}><Typography variant="body2">{device.location ?? '—'}</Typography></TableCell>}
                                        {show('licenseStartDate') && <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}><Typography variant="body2">{fmtDate(device.licenseStartDate)}</Typography></TableCell>}
                                        {show('licenseEndDate') && <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}><Typography variant="body2">{fmtDate(device.licenseEndDate)}</Typography></TableCell>}
                                        {show('pairingCode') && (
                                            <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>
                                                <Chip label={device.pairingCode ?? '—'} size="small" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }} />
                                            </TableCell>
                                        )}
                                        {show('actions') && (
                                            <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>
                                                <Tooltip title="Quản lý">
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
                                            Không tìm thấy thiết bị nào.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {data && (
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="caption" color="text.secondary">{data.total ?? 0} thiết bị</Typography>
                            <Select size="small" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }} sx={{ fontSize: '0.75rem', height: 28 }}>
                                {[10, 20, 50, 100].map(n => <MenuItem key={n} value={n} sx={{ fontSize: '0.75rem' }}>{n} / trang</MenuItem>)}
                                <MenuItem value={0} sx={{ fontSize: '0.75rem' }}>Tất cả</MenuItem>
                            </Select>
                        </Stack>
                        <Pagination count={limit === 0 ? 1 : (data.totalPages || 1)} page={page} onChange={(_, p) => setPage(p)} variant="outlined" shape="rounded" size="small" />
                    </Box>
                )}
            </CardContent>

            <DeviceManageDialog device={detailDevice} open={Boolean(detailDevice)} onClose={() => setDetailDevice(null)} />
        </Card>
    );
}

// ── Main DevicesPage ─────────────────────────────────────────────────────────

export default function DevicesPage() {
    const [createOpen, setCreateOpen] = useState(false);

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Device Management</Typography>
                    <Typography variant="body2" color="text.secondary">Manage your display network</Typography>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                    Add Device
                </Button>
            </Stack>

            <DevicesTab onAddDevice={() => setCreateOpen(true)} />

            <CreateDeviceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </Box>
    );
}
