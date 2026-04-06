import { useState, useMemo } from 'react';
import {
    Box, Typography, Chip, Button, Stack, TextField,
    Table, TableBody, TableCell, TableHead, TableRow,
    CircularProgress, Tooltip, InputAdornment,
} from '@mui/material';
import {
    PlayCircleOutline, Search, CheckCircle, Cancel,
    Videocam, Image as ImageIcon, AccessTime,
} from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import contentHistoryApi from '@api/content-history.api';
import type { ContentDevice } from '@api/content-history.api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(secs: number): string {
    if (secs <= 0) return '0s';
    if (secs < 60) return `${secs}s`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    if (m < 60) return s > 0 ? `${m}p${s}s` : `${m}p`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm > 0 ? `${h}g${rm}p` : `${h}g`;
}

function fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('vi-VN', { hour12: false });
}

function fmtTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('vi-VN', { hour12: false });
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('vi-VN');
}

function statusChip(status: string) {
    const map: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'default' }> = {
        ONLINE:   { label: 'Online',  color: 'success' },
        OFFLINE:  { label: 'Offline', color: 'error' },
        APP_EXIT: { label: 'App exit',color: 'warning' },
        SLEEP:    { label: 'Sleep',   color: 'default' },
    };
    const cfg = map[status] ?? { label: status, color: 'default' };
    return <Chip label={cfg.label} color={cfg.color} size="small" sx={{ fontSize: '0.6rem', height: 18 }} />;
}

function mediaIcon(type: string) {
    return type === 'VIDEO'
        ? <Videocam sx={{ fontSize: 14, color: 'primary.main' }} />
        : <ImageIcon sx={{ fontSize: 14, color: 'success.main' }} />;
}

// ─── Right panel ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 100;

function DeviceLogsPanel({ device }: { device: ContentDevice }) {
    const [search, setSearch] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [offset, setOffset] = useState(0);

    // Reset pagination when filters change
    const resetOffset = () => setOffset(0);

    const { data, isLoading } = useQuery({
        queryKey: ['content-logs', device.id, search, dateFrom, dateTo, offset],
        queryFn: () => contentHistoryApi.getDeviceLogs(device.id, {
            search:   search   || undefined,
            dateFrom: dateFrom || undefined,
            dateTo:   dateTo   || undefined,
            limit:    PAGE_SIZE,
            offset,
        }),
        placeholderData: prev => prev,
    });

    const logs   = data?.data ?? [];
    const total  = data?.total ?? 0;
    const pages  = Math.ceil(total / PAGE_SIZE);
    const curPage = Math.floor(offset / PAGE_SIZE) + 1;

    // Group logs by date for display
    const grouped = useMemo(() => {
        const groups: { date: string; logs: typeof logs }[] = [];
        let curDate = '';
        for (const log of logs) {
            const d = fmtDate(log.playedAt);
            if (d !== curDate) {
                curDate = d;
                groups.push({ date: d, logs: [] });
            }
            groups[groups.length - 1].logs.push(log);
        }
        return groups;
    }, [logs]);

    // Total duration of current page
    const totalDurSec = logs.reduce((s, l) => s + l.durationPlayed, 0);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <Box sx={{ px: 3, py: 1.5, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Stack direction="row" alignItems="center" gap={1.5} flexWrap="wrap">
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" fontWeight={700} noWrap>{device.name}</Typography>
                        <Stack direction="row" gap={1} alignItems="center">
                            {statusChip(device.status)}
                            {device.playlistName && (
                                <Typography variant="caption" color="text.secondary" noWrap>
                                    {device.playlistName}
                                    {device.scheduleName ? ` — ${device.scheduleName}` : ''}
                                </Typography>
                            )}
                        </Stack>
                    </Box>
                    <Chip
                        icon={<AccessTime sx={{ fontSize: 12 }} />}
                        label={`Hôm nay: ${fmtDuration(device.totalPlayedTodaySec)}`}
                        size="small" variant="outlined" color="primary"
                        sx={{ fontSize: '0.65rem' }}
                    />
                </Stack>
            </Box>

            {/* Filters */}
            <Box sx={{ px: 3, py: 1, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <TextField
                    size="small" value={search} placeholder="Tìm tên media…"
                    onChange={e => { setSearch(e.target.value); resetOffset(); }}
                    sx={{ width: 200, '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16 }} /></InputAdornment> }}
                />
                <TextField size="small" type="date" label="Từ ngày" value={dateFrom}
                    onChange={e => { setDateFrom(e.target.value); resetOffset(); }}
                    sx={{ width: 160 }} InputLabelProps={{ shrink: true }}
                    inputProps={{ style: { fontSize: '0.8rem' } }}
                />
                <TextField size="small" type="date" label="Đến ngày" value={dateTo}
                    onChange={e => { setDateTo(e.target.value); resetOffset(); }}
                    sx={{ width: 160 }} InputLabelProps={{ shrink: true }}
                    inputProps={{ style: { fontSize: '0.8rem' } }}
                />
                {(search || dateFrom || dateTo) && (
                    <Button size="small" onClick={() => { setSearch(''); setDateFrom(''); setDateTo(''); resetOffset(); }}>
                        Xóa bộ lọc
                    </Button>
                )}
                <Box sx={{ flex: 1 }} />
                <Typography variant="caption" color="text.secondary">
                    {total} log · {fmtDuration(totalDurSec)} tổng
                </Typography>
            </Box>

            {/* Logs */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', pt: 5 }}>
                        <CircularProgress size={28} />
                    </Box>
                ) : logs.length === 0 ? (
                    <Box sx={{ textAlign: 'center', pt: 8, color: 'text.disabled' }}>
                        <PlayCircleOutline sx={{ fontSize: 48, mb: 1, opacity: 0.2 }} />
                        <Typography variant="body2">Không có log nào</Typography>
                    </Box>
                ) : (
                    <>
                        {grouped.map(group => (
                            <Box key={group.date}>
                                {/* Date header */}
                                <Box sx={{ px: 3, py: 0.5, bgcolor: 'action.hover', borderBottom: '1px solid', borderColor: 'divider', position: 'sticky', top: 0, zIndex: 1 }}>
                                    <Stack direction="row" alignItems="center" gap={1}>
                                        <Typography variant="caption" fontWeight={700} color="text.secondary">
                                            {group.date}
                                        </Typography>
                                        <Typography variant="caption" color="text.disabled">
                                            · {group.logs.length} log
                                            · {fmtDuration(group.logs.reduce((s, l) => s + l.durationPlayed, 0))}
                                        </Typography>
                                    </Stack>
                                </Box>
                                <Table size="small">
                                    <TableBody>
                                        {group.logs.map(log => (
                                            <TableRow key={log.id} hover>
                                                <TableCell sx={{ py: 0.6, pl: 3, width: 80 }}>
                                                    <Typography variant="caption" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                                                        {fmtTime(log.playedAt)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ py: 0.6, width: 28 }}>
                                                    {mediaIcon(log.mediaType)}
                                                </TableCell>
                                                <TableCell sx={{ py: 0.6 }}>
                                                    <Typography variant="body2" noWrap sx={{ maxWidth: 280, fontSize: '0.8rem' }}>
                                                        {log.mediaTitle}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ py: 0.6, width: 80, textAlign: 'right' }}>
                                                    <Typography variant="caption" color="text.secondary"
                                                        sx={{ fontVariantNumeric: 'tabular-nums' }}>
                                                        {fmtDuration(log.durationPlayed)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell sx={{ py: 0.6, width: 32, textAlign: 'center' }}>
                                                    <Tooltip title={log.completed ? 'Phát đủ' : 'Bị ngắt'}>
                                                        {log.completed
                                                            ? <CheckCircle sx={{ fontSize: 14, color: 'success.main' }} />
                                                            : <Cancel sx={{ fontSize: 14, color: 'warning.main' }} />}
                                                    </Tooltip>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Box>
                        ))}

                        {/* Pagination */}
                        {pages > 1 && (
                            <Stack direction="row" justifyContent="center" gap={1} py={2}>
                                <Button size="small" disabled={curPage === 1}
                                    onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}>
                                    ← Trước
                                </Button>
                                <Typography variant="body2" sx={{ lineHeight: '30px', color: 'text.secondary' }}>
                                    {curPage} / {pages}
                                </Typography>
                                <Button size="small" disabled={curPage >= pages}
                                    onClick={() => setOffset(o => o + PAGE_SIZE)}>
                                    Tiếp →
                                </Button>
                            </Stack>
                        )}
                    </>
                )}
            </Box>
        </Box>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ContentHistoryPage() {
    const [selectedDevice, setSelectedDevice] = useState<ContentDevice | null>(null);
    const [search, setSearch] = useState('');

    const { data: devices = [], isLoading } = useQuery({
        queryKey: ['content-devices'],
        queryFn: contentHistoryApi.getDevices,
        refetchInterval: 60_000,
    });

    const filtered = useMemo(() => {
        if (!search.trim()) return devices;
        const q = search.toLowerCase();
        return devices.filter(d =>
            d.name.toLowerCase().includes(q) ||
            (d.playlistName ?? '').toLowerCase().includes(q) ||
            (d.storeName ?? '').toLowerCase().includes(q)
        );
    }, [devices, search]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
            {/* Top bar */}
            <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <PlayCircleOutline color="primary" />
                <Typography variant="h6" fontWeight={700}>Content History</Typography>
                <Chip label={`${devices.length} thiết bị`} size="small" variant="outlined" />
            </Box>

            {/* Two-panel layout */}
            <Box sx={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

                {/* ── Left panel: device list ── */}
                <Box sx={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
                    <Box sx={{ px: 1.5, py: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
                        <TextField
                            size="small" fullWidth value={search} placeholder="Tìm tên thiết bị, playlist…"
                            onChange={e => setSearch(e.target.value)}
                            InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16 }} /></InputAdornment> }}
                            sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
                        />
                    </Box>

                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        {isLoading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', pt: 4 }}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : filtered.length === 0 ? (
                            <Box sx={{ textAlign: 'center', pt: 6, color: 'text.disabled' }}>
                                <Typography variant="body2">Không có thiết bị</Typography>
                            </Box>
                        ) : (
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0.75 }}>Tên</TableCell>
                                        <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0.75 }}>Playlist</TableCell>
                                        <TableCell sx={{ fontSize: '0.7rem', fontWeight: 700, py: 0.75, width: 60 }}>Detail</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {filtered.map(d => {
                                        const isSelected = selectedDevice?.id === d.id;
                                        return (
                                            <TableRow key={d.id} hover selected={isSelected}
                                                sx={{ '&.Mui-selected': { bgcolor: 'primary.main' + '18' } }}>
                                                <TableCell sx={{ py: 0.75 }}>
                                                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 120, fontSize: '0.78rem' }}>
                                                        {d.name}
                                                    </Typography>
                                                    <Stack direction="row" gap={0.5} alignItems="center">
                                                        {statusChip(d.status)}
                                                        {d.storeName && (
                                                            <Typography variant="caption" color="text.disabled" noWrap sx={{ maxWidth: 80 }}>
                                                                {d.storeName}
                                                            </Typography>
                                                        )}
                                                    </Stack>
                                                </TableCell>
                                                <TableCell sx={{ py: 0.75 }}>
                                                    {d.playlistName ? (
                                                        <>
                                                            <Typography variant="body2" noWrap sx={{ maxWidth: 130, fontSize: '0.78rem' }}>
                                                                {d.playlistName}
                                                            </Typography>
                                                            {d.lastMediaTitle && (
                                                                <Typography variant="caption" color="text.disabled" noWrap sx={{ maxWidth: 130, display: 'block' }}>
                                                                    {d.lastMediaTitle}
                                                                </Typography>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <Typography variant="caption" color="text.disabled">—</Typography>
                                                    )}
                                                </TableCell>
                                                <TableCell sx={{ py: 0.75, textAlign: 'center' }}>
                                                    <Button size="small"
                                                        variant={isSelected ? 'contained' : 'outlined'}
                                                        disableElevation
                                                        sx={{ fontSize: '0.6rem', py: 0.25, px: 1, minWidth: 0 }}
                                                        onClick={() => setSelectedDevice(isSelected ? null : d)}>
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

                {/* ── Right panel ── */}
                <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {selectedDevice ? (
                        <DeviceLogsPanel key={selectedDevice.id} device={selectedDevice} />
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.disabled' }}>
                            <PlayCircleOutline sx={{ fontSize: 56, mb: 2, opacity: 0.15 }} />
                            <Typography variant="body1" fontWeight={500}>Chọn thiết bị để xem lịch sử phát</Typography>
                            <Typography variant="body2" mt={0.5}>Nhấn nút <strong>Xem</strong> ở cột Detail bên trái</Typography>
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    );
}
