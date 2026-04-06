import { useState, useMemo, useEffect, useRef } from 'react';
import {
    Box, Typography, Chip, IconButton, Button, Stack, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, Switch, FormControlLabel, Tooltip, CircularProgress,
    Table, TableBody, TableCell, TableHead, TableRow, Paper,
} from '@mui/material';
import {
    NotificationsActive, Mail, Add, Delete, Edit, CheckCircle,
    Cancel, SignalWifiOff, PowerSettingsNew, BugReport, Send,
    Circle, AccessTime,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@hooks/useSocket';
import alarmApi from '@api/alarm.api';
import type { AlarmDevice, AlarmEmail, StatusEvent } from '@api/alarm.api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}p`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return rm > 0 ? `${h}g${rm}p` : `${h}g`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh > 0 ? `${d}ng${rh}g` : `${d}ng`;
}

function fmtTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('vi-VN', { hour12: false });
}

function statusChip(status: string) {
    const map: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
        ONLINE:     { label: 'Online',    color: 'success' },
        OFFLINE:    { label: 'Offline',   color: 'error' },
        APP_EXIT:   { label: 'App exit',  color: 'warning' },
        SLEEP:      { label: 'Sleep',     color: 'default' },
        REGISTERED: { label: 'Chưa kết nối', color: 'default' },
    };
    const cfg = map[status] ?? { label: status, color: 'default' };
    return <Chip label={cfg.label} color={cfg.color} size="small" sx={{ fontSize: '0.65rem', height: 20 }} />;
}

function deviceTimeCell(d: AlarmDevice): { label: string; color: string } {
    const now = Date.now();
    if (d.status === 'ONLINE' || d.status === 'SLEEP') {
        const since = d.lastOnlineAt ? now - new Date(d.lastOnlineAt).getTime() : null;
        return { label: since != null ? fmtDuration(since) : '—', color: 'success.main' };
    }
    if (d.status === 'OFFLINE' || d.status === 'APP_EXIT') {
        const since = d.lastOfflineAt ? now - new Date(d.lastOfflineAt).getTime() : null;
        return { label: since != null ? fmtDuration(since) : '—', color: 'error.main' };
    }
    return { label: '—', color: 'text.disabled' };
}

function eventIcon(event: string, reason: string) {
    if (event === 'ONLINE') return <CheckCircle sx={{ color: 'success.main', fontSize: 16 }} />;
    if (reason === 'SOFTWARE') return <BugReport sx={{ color: 'warning.main', fontSize: 16 }} />;
    if (reason === 'DEVICE_OFF') return <PowerSettingsNew sx={{ color: 'text.disabled', fontSize: 16 }} />;
    return <SignalWifiOff sx={{ color: 'error.main', fontSize: 16 }} />;
}

function eventLabel(event: string, reason: string): { text: string; color: string } {
    if (event === 'ONLINE') return { text: 'Online', color: 'success.main' };
    const reasonLabel: Record<string, string> = {
        SOFTWARE: 'Lỗi phần mềm',
        DEVICE_OFF: 'Thiết bị tắt',
        NETWORK: 'Mất mạng / timeout',
    };
    return { text: reasonLabel[reason] ?? (event === 'APP_EXIT' ? 'App thoát' : 'Offline'), color: 'error.main' };
}

// ─── Mail Setting Dialog ──────────────────────────────────────────────────────

function MailSettingDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const qc = useQueryClient();
    const [addInput, setAddInput] = useState('');
    const [editId, setEditId] = useState<string | null>(null);
    const [editInput, setEditInput] = useState('');
    const [testingId, setTestingId] = useState<string | null>(null);
    const [testMsg, setTestMsg] = useState<Record<string, string>>({});

    const { data: emails = [], isLoading } = useQuery({
        queryKey: ['alarm-emails'],
        queryFn: alarmApi.getEmails,
        enabled: open,
    });

    const addMut = useMutation({
        mutationFn: (email: string) => alarmApi.addEmail(email),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['alarm-emails'] }); setAddInput(''); },
    });

    const updateMut = useMutation({
        mutationFn: ({ id, data }: { id: string; data: { email?: string; enabled?: boolean } }) =>
            alarmApi.updateEmail(id, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['alarm-emails'] }); setEditId(null); },
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => alarmApi.deleteEmail(id),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['alarm-emails'] }),
    });

    const MAX = 5;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Mail fontSize="small" color="primary" /> Cài đặt email cảnh báo
            </DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" color="text.secondary" mb={2}>
                    Hệ thống sẽ gửi email khi thiết bị offline. Mỗi tổ chức tối đa <strong>{MAX} email</strong>.
                </Typography>

                {isLoading ? <CircularProgress size={24} /> : (
                    <Stack spacing={1.5}>
                        {emails.map(em => (
                            <Paper key={em.id} variant="outlined" sx={{ px: 2, py: 1 }}>
                                {editId === em.id ? (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <TextField
                                            size="small" value={editInput} fullWidth
                                            onChange={e => setEditInput(e.target.value)}
                                            placeholder="Nhập email mới"
                                            sx={{ fontSize: '0.8rem' }}
                                        />
                                        <Button size="small" variant="contained" disableElevation
                                            disabled={!editInput.includes('@') || updateMut.isPending}
                                            onClick={() => updateMut.mutate({ id: em.id, data: { email: editInput } })}>
                                            Lưu
                                        </Button>
                                        <Button size="small" onClick={() => setEditId(null)}>Hủy</Button>
                                    </Stack>
                                ) : (
                                    <Stack direction="row" alignItems="center" spacing={1}>
                                        <Circle sx={{ fontSize: 8, color: em.enabled ? 'success.main' : 'text.disabled' }} />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography variant="body2" noWrap>{em.email}</Typography>
                                            {testMsg[em.id] && (
                                                <Typography variant="caption"
                                                    color={testMsg[em.id].startsWith('✅') ? 'success.main' : 'error.main'}>
                                                    {testMsg[em.id]}
                                                </Typography>
                                            )}
                                        </Box>
                                        <Switch
                                            size="small" checked={em.enabled}
                                            onChange={e => updateMut.mutate({ id: em.id, data: { enabled: e.target.checked } })}
                                        />
                                        <Tooltip title="Gửi email test">
                                            <IconButton size="small" color="primary"
                                                disabled={testingId === em.id}
                                                onClick={async () => {
                                                    setTestingId(em.id);
                                                    try {
                                                        await alarmApi.testEmail(em.email);
                                                        setTestMsg(p => ({ ...p, [em.id]: '✅ Đã gửi' }));
                                                    } catch {
                                                        setTestMsg(p => ({ ...p, [em.id]: '❌ Lỗi SMTP' }));
                                                    } finally {
                                                        setTestingId(null);
                                                        setTimeout(() => setTestMsg(p => { const n = { ...p }; delete n[em.id]; return n; }), 4000);
                                                    }
                                                }}>
                                                {testingId === em.id
                                                    ? <CircularProgress size={14} />
                                                    : <Send fontSize="inherit" />}
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Sửa email">
                                            <IconButton size="small" onClick={() => { setEditId(em.id); setEditInput(em.email); }}>
                                                <Edit fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Xóa">
                                            <IconButton size="small" color="error"
                                                onClick={() => deleteMut.mutate(em.id)}>
                                                <Delete fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                )}
                            </Paper>
                        ))}

                        {emails.length < MAX && (
                            <Stack direction="row" spacing={1} alignItems="center">
                                <TextField
                                    size="small" value={addInput} fullWidth
                                    onChange={e => setAddInput(e.target.value)}
                                    placeholder="Thêm email mới…"
                                    type="email"
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && addInput.includes('@')) {
                                            addMut.mutate(addInput);
                                        }
                                    }}
                                />
                                <Button
                                    size="small" variant="outlined" startIcon={<Add />}
                                    disabled={!addInput.includes('@') || addMut.isPending}
                                    onClick={() => addMut.mutate(addInput)}
                                    sx={{ whiteSpace: 'nowrap' }}>
                                    Thêm
                                </Button>
                            </Stack>
                        )}

                        {emails.length >= MAX && (
                            <Typography variant="caption" color="warning.main">
                                Đã đạt giới hạn {MAX} email.
                            </Typography>
                        )}
                    </Stack>
                )}

            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Đóng</Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StatusAlarmPage() {
    const [selectedDevice, setSelectedDevice] = useState<AlarmDevice | null>(null);
    const [mailOpen, setMailOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    const qc = useQueryClient();
    const { socket } = useSocket();
    const selectedDeviceRef = useRef(selectedDevice);
    selectedDeviceRef.current = selectedDevice;

    const { data: devices = [], isLoading: loadingDevices } = useQuery({
        queryKey: ['alarm-devices'],
        queryFn: alarmApi.getDevices,
        refetchInterval: 60_000,
    });

    const { data: history = [], isLoading: loadingHistory } = useQuery({
        queryKey: ['alarm-history', selectedDevice?.id],
        queryFn: () => selectedDevice ? alarmApi.getDeviceHistory(selectedDevice.id) : Promise.resolve([]),
        enabled: !!selectedDevice,
        refetchInterval: 60_000,
    });

    // Realtime: cập nhật device list ngay khi nhận device.status từ socket
    useEffect(() => {
        if (!socket) return;
        const handler = (data: { deviceId: string; status: string; timestamp: string }) => {
            const now = data.timestamp ?? new Date().toISOString();
            // Update cache in-place — không cần refetch toàn bộ
            qc.setQueryData<AlarmDevice[]>(['alarm-devices'], prev =>
                prev?.map(d => {
                    if (d.id !== data.deviceId) return d;
                    const isOnline  = data.status === 'ONLINE' || data.status === 'SLEEP';
                    const isOffline = data.status === 'OFFLINE' || data.status === 'APP_EXIT';
                    return {
                        ...d,
                        status: data.status,
                        lastOnlineAt:  isOnline  ? now : d.lastOnlineAt,
                        lastOfflineAt: isOffline ? now : d.lastOfflineAt,
                    };
                })
            );
            // Nếu đang xem lịch sử thiết bị này → refetch để hiện event mới
            if (selectedDeviceRef.current?.id === data.deviceId) {
                qc.invalidateQueries({ queryKey: ['alarm-history', data.deviceId] });
            }
        };
        socket.on('device.status', handler);
        return () => { socket.off('device.status', handler); };
    }, [socket, qc]);

    const filtered = useMemo(() => {
        let list = devices;
        if (statusFilter !== 'ALL') {
            list = list.filter(d => {
                if (statusFilter === 'OFFLINE') return d.status === 'OFFLINE' || d.status === 'APP_EXIT';
                return d.status === statusFilter;
            });
        }
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(d =>
                d.name.toLowerCase().includes(q) || (d.siteName ?? '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [devices, search, statusFilter]);

    const offlineCount = devices.filter(d => d.status === 'OFFLINE' || d.status === 'APP_EXIT').length;
    const onlineCount  = devices.filter(d => d.status === 'ONLINE' || d.status === 'SLEEP').length;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Top bar */}
            <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <NotificationsActive color="primary" />
                    <Typography variant="h6" fontWeight={700}>Status Alarm</Typography>
                </Stack>
                <Stack direction="row" gap={1}>
                    <Chip icon={<CheckCircle sx={{ fontSize: 14 }} />} label={`Online: ${onlineCount}`}
                        color="success" variant="outlined" size="small" />
                    <Chip icon={<Cancel sx={{ fontSize: 14 }} />} label={`Offline: ${offlineCount}`}
                        color="error" variant="outlined" size="small" />
                </Stack>
                <Box sx={{ flex: 1 }} />
                <Button variant="outlined" size="small" startIcon={<Mail />}
                    onClick={() => setMailOpen(true)}>
                    Mail Setting
                </Button>
            </Box>

            {/* Content: left + right panels */}
            <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                {/* ── Left panel: device list ── */}
                <Box sx={{
                    width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column',
                    borderRight: '1px solid', borderColor: 'divider', overflow: 'hidden',
                }}>
                    {/* Filters */}
                    <Box sx={{ px: 1.5, py: 1, display: 'flex', gap: 1, flexWrap: 'wrap', borderBottom: '1px solid', borderColor: 'divider' }}>
                        <TextField
                            size="small" placeholder="Tìm tên, site…" value={search}
                            onChange={e => setSearch(e.target.value)}
                            sx={{ flex: 1, minWidth: 120, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                        />
                        <Stack direction="row" gap={0.5}>
                            {[
                                { value: 'ALL', label: 'Tất cả' },
                                { value: 'ONLINE', label: 'Online' },
                                { value: 'OFFLINE', label: 'Offline' },
                            ].map(f => (
                                <Chip
                                    key={f.value}
                                    label={f.label}
                                    size="small"
                                    onClick={() => setStatusFilter(f.value)}
                                    color={statusFilter === f.value ? 'primary' : 'default'}
                                    variant={statusFilter === f.value ? 'filled' : 'outlined'}
                                    sx={{ fontSize: '0.65rem', cursor: 'pointer' }}
                                />
                            ))}
                        </Stack>
                    </Box>

                    {/* Device table */}
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        {loadingDevices ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : filtered.length === 0 ? (
                            <Box sx={{ textAlign: 'center', pt: 6, color: 'text.disabled' }}>
                                <NotificationsActive sx={{ fontSize: 40, mb: 1, opacity: 0.3 }} />
                                <Typography variant="body2">Không có thiết bị nào</Typography>
                            </Box>
                        ) : (
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0.75 }}>Tên</TableCell>
                                        <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0.75 }}>Trạng thái</TableCell>
                                        <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0.75 }}>
                                            <AccessTime sx={{ fontSize: 12, verticalAlign: 'middle' }} />
                                        </TableCell>
                                        <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0.75, width: 60 }}>Chi tiết</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filtered.map(d => {
                                        const isSelected = selectedDevice?.id === d.id;
                                        const tc = deviceTimeCell(d);
                                        return (
                                            <TableRow
                                                key={d.id}
                                                hover
                                                selected={isSelected}
                                                sx={{ cursor: 'default', '&.Mui-selected': { bgcolor: 'primary.main' + '18' } }}
                                            >
                                                <TableCell sx={{ py: 0.75 }}>
                                                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 130, fontSize: '0.78rem' }}>
                                                        {d.name}
                                                    </Typography>
                                                    {d.siteName && (
                                                        <Typography variant="caption" color="text.disabled" noWrap display="block">
                                                            {d.siteName}
                                                        </Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ py: 0.75 }}>
                                                    {statusChip(d.status)}
                                                </TableCell>
                                                <TableCell sx={{ py: 0.75 }}>
                                                    <Typography variant="caption" sx={{ color: tc.color, fontVariantNumeric: 'tabular-nums', fontSize: '0.72rem' }}>
                                                        {tc.label}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ py: 0.75, textAlign: 'center' }}>
                                                    <Button
                                                        size="small"
                                                        variant={isSelected ? 'contained' : 'outlined'}
                                                        disableElevation
                                                        sx={{ fontSize: '0.6rem', py: 0.25, px: 1, minWidth: 0 }}
                                                        onClick={() => setSelectedDevice(isSelected ? null : d)}
                                                    >
                                                        {isSelected ? 'Ẩn' : 'Xem'}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        )}
                    </Box>
                </Box>

                {/* ── Right panel: history ── */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                    {!selectedDevice ? (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.disabled' }}>
                            <NotificationsActive sx={{ fontSize: 56, mb: 2, opacity: 0.15 }} />
                            <Typography variant="body1" fontWeight={500}>Chọn thiết bị để xem lịch sử</Typography>
                            <Typography variant="body2" mt={0.5}>Nhấn nút <strong>Xem</strong> ở cột Detail bên trái</Typography>
                        </Box>
                    ) : (
                        <>
                            {/* Panel header */}
                            <Box sx={{ px: 3, py: 1.5, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                                <Box sx={{ flex: 1 }}>
                                    <Typography variant="subtitle1" fontWeight={700}>{selectedDevice.name}</Typography>
                                    <Stack direction="row" gap={1} alignItems="center">
                                        {statusChip(selectedDevice.status)}
                                        {selectedDevice.siteName && (
                                            <Typography variant="caption" color="text.secondary">{selectedDevice.siteName}</Typography>
                                        )}
                                    </Stack>
                                </Box>
                                <Typography variant="caption" color="text.disabled">
                                    {history.length} sự kiện
                                </Typography>
                                            </Box>

                            {/* History list */}
                            <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 2 }}>
                                {loadingHistory ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                                        <CircularProgress size={28} />
                                    </Box>
                                ) : history.length === 0 ? (
                                    <Box sx={{ textAlign: 'center', pt: 6, color: 'text.disabled' }}>
                                        <Typography variant="body2">Chưa có lịch sử sự kiện</Typography>
                                        <Typography variant="caption">Lịch sử sẽ được ghi nhận từ lúc thiết bị kết nối</Typography>
                                    </Box>
                                ) : (
                                    <Stack spacing={0}>
                                        {history.map((ev, idx) => {
                                            const lbl = eventLabel(ev.event, ev.reason);
                                            const isOnline = ev.event === 'ONLINE';
                                            const nextEv = history[idx + 1];
                                            const durationMs = nextEv
                                                ? new Date(ev.occurredAt).getTime() - new Date(nextEv.occurredAt).getTime()
                                                : null;

                                            return (
                                                <Box key={ev.id} sx={{ display: 'flex', gap: 2, pb: 0 }}>
                                                    {/* Timeline line */}
                                                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 24, flexShrink: 0 }}>
                                                        <Box sx={{ mt: '14px' }}>
                                                            {eventIcon(ev.event, ev.reason)}
                                                        </Box>
                                                        {idx < history.length - 1 && (
                                                            <Box sx={{ flex: 1, width: 2, minHeight: 28, bgcolor: 'divider', mt: 0.5 }} />
                                                        )}
                                                    </Box>

                                                    {/* Content */}
                                                    <Box sx={{ flex: 1, pb: 2, pt: '10px' }}>
                                                        <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
                                                            <Typography variant="body2" fontWeight={600} sx={{ color: lbl.color }}>
                                                                {lbl.text}
                                                            </Typography>
                                                            {!isOnline && (
                                                                <Chip
                                                                    size="small"
                                                                    label={
                                                                        ev.reason === 'SOFTWARE' ? 'Phần mềm' :
                                                                        ev.reason === 'DEVICE_OFF' ? 'Thiết bị tắt' : 'Mạng'
                                                                    }
                                                                    variant="outlined"
                                                                    sx={{ fontSize: '0.6rem', height: 16 }}
                                                                />
                                                            )}
                                                            {durationMs !== null && (
                                                                <Typography variant="caption" color="text.disabled">
                                                                    — kéo dài {fmtDuration(durationMs)}
                                                                </Typography>
                                                            )}
                                                        </Stack>
                                                        <Typography variant="caption" color="text.secondary">
                                                            {fmtTime(ev.occurredAt)}
                                                        </Typography>
                                                    </Box>
                                                </Box>
                                            );
                                        })}
                                    </Stack>
                                )}
                            </Box>
                        </>
                    )}
                </Box>
            </Box>

            <MailSettingDialog open={mailOpen} onClose={() => setMailOpen(false)} />
        </Box>
    );
}
