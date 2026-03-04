import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Card, CardContent, Stack, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, InputAdornment, Pagination, Avatar, Skeleton,
    Menu, MenuItem, Tabs, Tab, Grid, Divider, List, ListItem,
    ListItemAvatar, ListItemText, Select, FormControl, InputLabel,
    LinearProgress, Slider,
} from '@mui/material';
import {
    Add, Search, MoreVert, Tv, CheckCircle, ErrorOutline,
    PowerSettingsNew, Refresh, Screenshot, Delete,
    Edit, PersonAdd, Circle, LinkOff, InfoOutlined,
} from '@mui/icons-material';
import { devicesApi } from '@api/devices.api';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Device, DeviceHealth, NowPlaying, DeviceComment } from '@/types';

// ── License chip + toggle ─────────────────────────────────────────────────────

function LicenseChip({ device }: { device: Device }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();

    const mutation = useMutation({
        mutationFn: (isLicensed: boolean) => devicesApi.setLicense(device.id, isLicensed),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['devices'] });
            qc.invalidateQueries({ queryKey: ['org-license'] });
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Cập nhật license thất bại' })),
    });

    const isLicensed = device.isLicensed !== false;

    const handleToggle = () => {
        if (isLicensed) {
            if (!window.confirm(`Hủy license cho "${device.name}"?\nThiết bị sẽ ngừng nhận nội dung và không tính phí.`)) return;
        }
        mutation.mutate(!isLicensed);
    };

    return (
        <Chip
            label={isLicensed ? 'Licensed' : 'Unlicensed'}
            color={isLicensed ? 'success' : 'default'}
            size="small"
            onClick={handleToggle}
            disabled={mutation.isPending}
            sx={{ fontWeight: 600, fontSize: '0.7rem', cursor: 'pointer' }}
        />
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: Device['status'] }) {
    const map = {
        ONLINE: { color: 'success' as const, icon: <CheckCircle sx={{ fontSize: 14 }} /> },
        OFFLINE: { color: 'default' as const, icon: <ErrorOutline sx={{ fontSize: 14 }} /> },
        ERROR: { color: 'error' as const, icon: <ErrorOutline sx={{ fontSize: 14 }} /> },
    };
    const cfg = map[status] ?? map.OFFLINE;
    return <Chip label={status} color={cfg.color} size="small" icon={cfg.icon} sx={{ fontWeight: 600, fontSize: '0.7rem' }} />;
}

// ── Device Actions menu ───────────────────────────────────────────────────────

function DeviceActions({ device }: { device: Device }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);
    const [newPairingCode, setNewPairingCode] = useState<string | null>(null);

    const sendCmd = async (command: string) => {
        setAnchor(null);
        try {
            await devicesApi.sendCommand(device.id, command);
            dispatch(pushToast({ severity: 'success', message: `"${command}" sent to ${device.name}` }));
        } catch {
            dispatch(pushToast({ severity: 'error', message: 'Failed to send command' }));
        }
    };

    const handleReset = async () => {
        setAnchor(null);
        if (!window.confirm(`Reset "${device.name}"?\nDevice sẽ bị ngắt kết nối và cần ghép cặp lại.`)) return;
        try {
            const result = await devicesApi.reset(device.id);
            qc.invalidateQueries({ queryKey: ['devices'] });
            setNewPairingCode(result.pairingCode);
        } catch {
            dispatch(pushToast({ severity: 'error', message: 'Reset thất bại' }));
        }
    };

    const handleDelete = async () => {
        setAnchor(null);
        if (!window.confirm(`Xóa device "${device.name}"?\nHành động này không thể hoàn tác.`)) return;
        try {
            await devicesApi.delete(device.id);
            qc.invalidateQueries({ queryKey: ['devices'] });
            dispatch(pushToast({ severity: 'success', message: `Device "${device.name}" đã được xóa` }));
        } catch {
            dispatch(pushToast({ severity: 'error', message: 'Xóa device thất bại' }));
        }
    };

    return (
        <>
            <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
                <MoreVert fontSize="small" />
            </IconButton>

            {/* Pairing code dialog — shown after successful reset */}
            <Dialog open={Boolean(newPairingCode)} onClose={() => setNewPairingCode(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Device đã được reset</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Nhập mã này trên TV để ghép cặp lại <strong>{device.name}</strong>:
                    </Typography>
                    <Box sx={{
                        textAlign: 'center', py: 3, borderRadius: 2,
                        bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider',
                    }}>
                        <Typography variant="h2" fontWeight={700} letterSpacing={6} fontFamily="monospace">
                            {newPairingCode}
                        </Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="contained" onClick={() => setNewPairingCode(null)}>Đóng</Button>
                </DialogActions>
            </Dialog>

            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                <MenuItem onClick={() => sendCmd('RESTART')}>
                    <PowerSettingsNew sx={{ mr: 1, fontSize: 18 }} /> Restart
                </MenuItem>
                <MenuItem onClick={() => sendCmd('RELOAD_CONTENT')}>
                    <Refresh sx={{ mr: 1, fontSize: 18 }} /> Reload Content
                </MenuItem>
                <MenuItem onClick={() => sendCmd('SCREENSHOT')}>
                    <Screenshot sx={{ mr: 1, fontSize: 18 }} /> Screenshot
                </MenuItem>
                <MenuItem onClick={() => sendCmd('CLEAR_CACHE')}>
                    <Refresh sx={{ mr: 1, fontSize: 18 }} /> Clear Cache
                </MenuItem>
                <Divider />
                <MenuItem onClick={handleReset} sx={{ color: 'warning.main' }}>
                    <LinkOff sx={{ mr: 1, fontSize: 18 }} /> Reset (Re-pair)
                </MenuItem>
                <MenuItem onClick={handleDelete} sx={{ color: 'error.main' }}>
                    <Delete sx={{ mr: 1, fontSize: 18 }} /> Xóa device
                </MenuItem>
            </Menu>
        </>
    );
}

// ── Create Device dialog ──────────────────────────────────────────────────────

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
                message: `Device "${device.name}" created! Pairing code: ${device.pairingCode}`,
            }));
            setName(''); setLocation('');
            onClose();
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Failed to create device' })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Add New Device</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Stack spacing={2.5} sx={{ mt: 0.5 }}>
                    <TextField label="Device Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
                    <TextField label="Location (optional)" value={location} onChange={(e) => setLocation(e.target.value)} fullWidth />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>
                    Create
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
            <Typography variant="body2" color="text.secondary" sx={{ width: 140, flexShrink: 0 }}>{label}</Typography>
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

    // Reset tab when dialog opens
    React.useEffect(() => { if (open) setTab(0); }, [open]);

    // Health data — load for tabs 2, 3, 4
    const { data: health, isLoading: healthLoading } = useQuery<DeviceHealth | null>({
        queryKey: ['device-health', device?.id],
        queryFn: () => device ? devicesApi.getHealth(device.id) : Promise.resolve(null),
        enabled: open && Boolean(device?.id) && (tab === 2 || tab === 3 || tab === 4),
        staleTime: 30_000,
    });

    // Now playing — tab 1
    const { data: nowPlaying } = useQuery<NowPlaying | null>({
        queryKey: ['device-now-playing', device?.id],
        queryFn: () => device ? devicesApi.getNowPlaying(device.id) : Promise.resolve(null),
        enabled: open && Boolean(device?.id) && tab === 1,
        staleTime: 60_000,
    });

    // Comments — tab 1
    const { data: comments = [] } = useQuery<DeviceComment[]>({
        queryKey: ['device-comments', device?.id],
        queryFn: () => device ? devicesApi.getComments(device.id) : Promise.resolve([]),
        enabled: open && Boolean(device?.id) && tab === 1,
    });

    // Volume state
    const [volume, setVolume] = React.useState(50);
    const volumeMutation = useMutation({
        mutationFn: () => devicesApi.sendCommand(device!.id, 'SET_VOLUME', { volume }),
        onSuccess: () => dispatch(pushToast({ severity: 'success', message: `Đã gửi lệnh đặt âm lượng ${volume}%` })),
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Gửi lệnh thất bại' })),
    });

    // Info form
    const [infoName, setInfoName] = React.useState('');
    const [infoLocation, setInfoLocation] = React.useState('');
    React.useEffect(() => {
        if (device) { setInfoName(device.name); setInfoLocation(device.location ?? ''); }
    }, [device]);

    const updateInfoMutation = useMutation({
        mutationFn: () => devicesApi.update(device!.id, { name: infoName, location: infoLocation }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['devices'] });
            dispatch(pushToast({ severity: 'success', message: 'Đã lưu thông tin thiết bị' }));
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Lưu thất bại' })),
    });


    // Comment input — tab 1
    const [commentText, setCommentText] = React.useState('');
    const addCommentMutation = useMutation({
        mutationFn: () => devicesApi.addComment(device!.id, commentText),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['device-comments', device?.id] });
            setCommentText('');
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Gửi ghi chú thất bại' })),
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

    const storagePercent = (health?.storageTotal && health.storageUsed != null)
        ? Math.round((health.storageUsed / health.storageTotal) * 100)
        : null;
    const heapMB = health?.heapMemory ? Math.round(health.heapMemory / 1_048_576) : null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { height: '82vh', display: 'flex', flexDirection: 'column' } }}>

            {/* Fixed header */}
            <DialogTitle sx={{ pb: 0, flexShrink: 0 }}>
                <Stack direction="row" gap={1.5} alignItems="center">
                    <Avatar sx={{ bgcolor: device.status === 'ONLINE' ? 'success.main' : 'grey.700', width: 44, height: 44 }}>
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
                    <Stack spacing={3}>
                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                Lệnh nhanh
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" gap={1}>
                                {[
                                    { cmd: 'SLEEP', label: 'Sleep' },
                                    { cmd: 'WAKE_UP', label: 'Wake Up' },
                                    { cmd: 'RESTART', label: 'Restart' },
                                    { cmd: 'VIEWER_RESTART', label: 'Viewer Restart' },
                                    { cmd: 'CLEAR_CACHE', label: 'Clear Storage' },
                                    { cmd: 'DOWNLOAD_CONTENT', label: 'Download Content' },
                                ].map(({ cmd, label }) => (
                                    <Button key={cmd} variant="outlined" size="small" onClick={() => sendCmd(cmd)}>
                                        {label}
                                    </Button>
                                ))}
                                <Button
                                    variant="outlined"
                                    size="small"
                                    color="error"
                                    onClick={() => {
                                        if (window.confirm(`Thoát ứng dụng trên "${device.name}"?\nMàn hình sẽ trở về launcher của Android TV.`)) {
                                            sendCmd('EXIT_APP');
                                        }
                                    }}
                                >
                                    Thoát ứng dụng
                                </Button>
                            </Stack>
                        </Box>

                        <Divider />

                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                Âm lượng
                            </Typography>
                            <Stack direction="row" alignItems="center" gap={2}>
                                <Slider
                                    value={volume}
                                    onChange={(_, v) => setVolume(v as number)}
                                    min={0} max={100}
                                    sx={{ flex: 1 }}
                                    valueLabelDisplay="auto"
                                />
                                <Typography variant="body2" fontWeight={600} sx={{ minWidth: 36 }}>{volume}%</Typography>
                                <Button variant="contained" size="small"
                                    onClick={() => volumeMutation.mutate()}
                                    disabled={volumeMutation.isPending}>
                                    Apply
                                </Button>
                            </Stack>
                        </Box>

                        <Divider />

                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                Thông tin thiết bị
                            </Typography>
                            <Stack spacing={1.5}>
                                <TextField label="Tên thiết bị" value={infoName} onChange={e => setInfoName(e.target.value)} size="small" fullWidth />
                                <TextField label="Địa chỉ / Vị trí" value={infoLocation} onChange={e => setInfoLocation(e.target.value)} size="small" fullWidth />
                                <Box>
                                    <Button variant="contained" size="small"
                                        onClick={() => updateInfoMutation.mutate()}
                                        disabled={updateInfoMutation.isPending}>
                                        Lưu
                                    </Button>
                                </Box>
                            </Stack>
                        </Box>

                    </Stack>
                )}

                {/* ── Tab 1: Nội dung ── */}
                {tab === 1 && (
                    <Stack spacing={3}>
                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                Đang phát
                            </Typography>
                            {nowPlaying ? (
                                <Card variant="outlined" sx={{ p: 2 }}>
                                    <Stack spacing={0.5}>
                                        <Typography variant="body1" fontWeight={600}>{nowPlaying.mediaTitle}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {nowPlaying.mediaType} · {Math.round(nowPlaying.durationPlayed / 60)} phút · {nowPlaying.completed ? '✓ Hoàn thành' : 'Bị ngắt'}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Phát lúc: {new Date(nowPlaying.playedAt).toLocaleString('vi-VN')}
                                        </Typography>
                                    </Stack>
                                </Card>
                            ) : (
                                <Typography variant="body2" color="text.disabled">Chưa có dữ liệu phát</Typography>
                            )}
                        </Box>

                        <Divider />

                        <Box>
                            <Typography variant="overline" color="text.secondary" fontWeight={700} display="block" mb={1}>
                                Ghi chú
                            </Typography>
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
                            <Stack direction="row" gap={1} mt={2} alignItems="flex-end">
                                <TextField
                                    placeholder="Nhập ghi chú..."
                                    value={commentText}
                                    onChange={e => setCommentText(e.target.value)}
                                    size="small" fullWidth multiline maxRows={3}
                                />
                                <Button variant="contained" size="small"
                                    disabled={!commentText.trim() || addCommentMutation.isPending}
                                    onClick={() => addCommentMutation.mutate()}>
                                    Gửi
                                </Button>
                            </Stack>
                        </Box>
                    </Stack>
                )}

                {/* ── Tab 2: Phần cứng ── */}
                {tab === 2 && (
                    <Stack spacing={0}>
                        <InfoRow label="Model" value={device.model ?? '—'} />
                        <InfoRow label="Android ID" value={
                            device.androidId
                                ? <Typography variant="body2" fontFamily="monospace" fontWeight={500} component="span">{device.androidId}</Typography>
                                : '—'
                        } />
                        <InfoRow label="OS Version" value={device.osVersion ?? '—'} />
                        <InfoRow label="App Version" value={device.appVersion ?? '—'} />
                        <InfoRow label="IP Address" value={health?.ipAddress ?? '—'} />
                        <InfoRow label="MAC Address" value={health?.macAddress ?? '—'} />
                        <InfoRow label="Múi giờ" value={device.timezone} />
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
                                    <Typography variant="body2" color="text.secondary" sx={{ width: 160, flexShrink: 0 }}>CPU</Typography>
                                    <Box flex={1}><HealthBar value={health.cpuUsage} /></Box>
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
                                <InfoRow label="IP Address" value={health?.ipAddress ?? '—'} />
                            </Stack>
                        )}

                    </Stack>
                )}
            </DialogContent>

            <DialogActions sx={{ p: 2, flexShrink: 0 }}>
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
    const LIMIT = 10;

    const { data, isLoading } = useQuery({
        queryKey: ['devices', page, search],
        queryFn: () => devicesApi.list({ page, limit: LIMIT, search: search || undefined }),
        refetchInterval: 15_000,
    });

    return (
        <Card>
            <CardContent sx={{ p: 0 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <TextField
                        placeholder="Search devices..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        size="small"
                        sx={{ width: 280 }}
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search sx={{ color: 'text.secondary', fontSize: 20 }} /></InputAdornment>,
                        }}
                    />
                </Box>

                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>Device</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>License</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Model</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Location</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Last Seen</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Pairing Code</TableCell>
                                <TableCell align="right" sx={{ fontWeight: 700 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading
                                ? Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        {Array.from({ length: 8 }).map((__, j) => (
                                            <TableCell key={j}><Skeleton height={24} /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                                : (data?.data ?? []).map((device) => (
                                    <TableRow key={device.id} hover>
                                        {/* Device name + ID */}
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" gap={1.5}>
                                                <Avatar sx={{ width: 36, height: 36, bgcolor: device.status === 'ONLINE' ? 'success.main' : 'grey.700' }}>
                                                    <Tv sx={{ fontSize: 18 }} />
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2" fontWeight={600}>{device.name}</Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                                        {device.id.slice(0, 8)}…
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                        </TableCell>

                                        {/* Status */}
                                        <TableCell><StatusChip status={device.status} /></TableCell>

                                        {/* License */}
                                        <TableCell><LicenseChip device={device} /></TableCell>

                                        <TableCell><Typography variant="body2">{device.model ?? '—'}</Typography></TableCell>
                                        <TableCell><Typography variant="body2">{device.location ?? '—'}</Typography></TableCell>
                                        <TableCell>
                                            <Typography variant="caption" color="text.secondary">
                                                {device.lastSeen ? new Date(device.lastSeen).toLocaleString() : '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={device.pairingCode ?? '—'}
                                                size="small"
                                                sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: 2 }}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" justifyContent="flex-end" alignItems="center">
                                                <Tooltip title="Chi tiết">
                                                    <IconButton size="small" onClick={() => setDetailDevice(device)}>
                                                        <InfoOutlined fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <DeviceActions device={device} />
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}

                            {!isLoading && !data?.data.length && (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                                        <Tv sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                                        <Typography variant="body2" color="text.secondary">
                                            No devices found.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {data && data.totalPages > 1 && (
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid', borderColor: 'divider' }}>
                        <Pagination count={data.totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" size="small" />
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
