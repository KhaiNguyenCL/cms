import { useState, useMemo, useCallback, useEffect } from 'react';
import {
    Box, Typography, Chip, Stack, TextField, MenuItem,
    Table, TableBody, TableCell, TableHead, TableRow,
    CircularProgress, InputAdornment, TablePagination,
    Tooltip, IconButton, Collapse,
} from '@mui/material';
import {
    Search, Add, Edit, Delete, ExpandMore, ExpandLess,
    Person, DevicesOther, PermMedia, PlaylistPlay,
    CalendarMonth, People, Storefront, SystemUpdate,
    FilterAlt,
} from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import actionHistoryApi from '@api/action-history.api';
import type { ActionLog, ActionType, ResourceType } from '@api/action-history.api';
import { useSocket } from '@hooks/useSocket';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function fmtDateTime(iso: string): string {
    return new Date(iso).toLocaleString('vi-VN', { hour12: false });
}

function actionChip(action: ActionType) {
    const map: Record<ActionType, { label: string; color: 'success' | 'warning' | 'error' }> = {
        CREATE: { label: 'Tạo mới', color: 'success' },
        UPDATE: { label: 'Cập nhật', color: 'warning' },
        DELETE: { label: 'Xóa',     color: 'error'   },
    };
    const { label, color } = map[action] ?? { label: action, color: 'default' as const };
    return <Chip label={label} size="small" color={color} />;
}

function actionIcon(action: ActionType) {
    if (action === 'CREATE') return <Add fontSize="small" color="success" />;
    if (action === 'UPDATE') return <Edit fontSize="small" color="warning" />;
    return <Delete fontSize="small" color="error" />;
}

const RESOURCE_LABELS: Record<ResourceType, string> = {
    DEVICE:   'Thiết bị',
    MEDIA:    'Media',
    PLAYLIST: 'Playlist',
    SCHEDULE: 'Lịch phát',
    USER:     'Người dùng',
    STORE:    'Store',
    VERSION:  'Phiên bản',
};

function resourceIcon(type: ResourceType) {
    switch (type) {
        case 'DEVICE':   return <DevicesOther   fontSize="small" />;
        case 'MEDIA':    return <PermMedia       fontSize="small" />;
        case 'PLAYLIST': return <PlaylistPlay    fontSize="small" />;
        case 'SCHEDULE': return <CalendarMonth   fontSize="small" />;
        case 'USER':     return <People          fontSize="small" />;
        case 'STORE':    return <Storefront      fontSize="small" />;
        case 'VERSION':  return <SystemUpdate    fontSize="small" />;
        default:         return null;
    }
}

// ─── Log Row (expandable detail) ─────────────────────────────────────────────

function LogRow({ log }: { log: ActionLog }) {
    const [open, setOpen] = useState(false);
    const hasDetail = log.detail && Object.keys(log.detail).length > 0;

    return (
        <>
            <TableRow
                hover
                sx={{ cursor: hasDetail ? 'pointer' : 'default' }}
                onClick={() => hasDetail && setOpen(o => !o)}
            >
                <TableCell sx={{ width: 160 }}>
                    <Typography variant="caption" color="text.secondary">
                        {fmtDateTime(log.occurredAt)}
                    </Typography>
                </TableCell>
                <TableCell sx={{ width: 48 }}>
                    <Tooltip title={log.action}>
                        {actionIcon(log.action)}
                    </Tooltip>
                </TableCell>
                <TableCell sx={{ width: 110 }}>
                    {actionChip(log.action)}
                </TableCell>
                <TableCell sx={{ width: 120 }}>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        {resourceIcon(log.resourceType)}
                        <Typography variant="caption">
                            {RESOURCE_LABELS[log.resourceType] ?? log.resourceType}
                        </Typography>
                    </Stack>
                </TableCell>
                <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>
                        {log.resourceName ?? <em style={{ color: '#999' }}>(đã xóa)</em>}
                    </Typography>
                    {log.resourceId && (
                        <Typography variant="caption" color="text.disabled" display="block" sx={{ fontFamily: 'monospace' }}>
                            {log.resourceId.slice(0, 8)}…
                        </Typography>
                    )}
                </TableCell>
                <TableCell>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        <Person fontSize="small" color="disabled" />
                        <Typography variant="body2">{log.userEmail ?? '—'}</Typography>
                    </Stack>
                </TableCell>
                <TableCell sx={{ width: 32, p: 0 }}>
                    {hasDetail && (
                        <IconButton size="small" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>
                            {open ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                        </IconButton>
                    )}
                </TableCell>
            </TableRow>
            {hasDetail && (
                <TableRow>
                    <TableCell colSpan={7} sx={{ py: 0, bgcolor: 'action.hover' }}>
                        <Collapse in={open} unmountOnExit>
                            <Box sx={{ p: 1.5 }}>
                                <Typography variant="caption" component="pre" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                    {JSON.stringify(log.detail, null, 2)}
                                </Typography>
                            </Box>
                        </Collapse>
                    </TableCell>
                </TableRow>
            )}
        </>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const ACTION_OPTIONS: { value: ActionType; label: string }[] = [
    { value: 'CREATE', label: 'Tạo mới' },
    { value: 'UPDATE', label: 'Cập nhật' },
    { value: 'DELETE', label: 'Xóa' },
];

const RESOURCE_OPTIONS: { value: ResourceType; label: string }[] = [
    { value: 'DEVICE',   label: 'Thiết bị' },
    { value: 'MEDIA',    label: 'Media' },
    { value: 'PLAYLIST', label: 'Playlist' },
    { value: 'SCHEDULE', label: 'Lịch phát' },
    { value: 'USER',     label: 'Người dùng' },
    { value: 'STORE',    label: 'Store' },
    { value: 'VERSION',  label: 'Phiên bản' },
];

export default function ActionHistoryPage() {
    const qc = useQueryClient();
    const { socket } = useSocket();
    const [search,       setSearch]       = useState('');
    const [userId,       setUserId]       = useState('');
    const [action,       setAction]       = useState('');
    const [resourceType, setResourceType] = useState('');
    const [dateFrom,     setDateFrom]     = useState('');
    const [dateTo,       setDateTo]       = useState('');
    const [page,         setPage]         = useState(0);

    const params = useMemo(() => ({
        search:       search       || undefined,
        userId:       userId       || undefined,
        action:       action       as ActionType | undefined || undefined,
        resourceType: resourceType as ResourceType | undefined || undefined,
        dateFrom:     dateFrom     || undefined,
        dateTo:       dateTo       || undefined,
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
    }), [search, userId, action, resourceType, dateFrom, dateTo, page]);

    const { data, isLoading } = useQuery({
        queryKey: ['action-logs', params],
        queryFn: () => actionHistoryApi.getLogs(params),
        placeholderData: prev => prev,
    });

    const { data: actors = [] } = useQuery({
        queryKey: ['action-actors'],
        queryFn: actionHistoryApi.getActors,
        staleTime: 60_000,
    });

    const resetPage = useCallback(() => setPage(0), []);

    // Realtime: invalidate log list whenever any action is logged in this org
    useEffect(() => {
        if (!socket) return;
        const handler = () => {
            qc.invalidateQueries({ queryKey: ['action-logs'] });
            qc.invalidateQueries({ queryKey: ['action-actors'] });
        };
        socket.on('action.logged', handler);
        return () => { socket.off('action.logged', handler); };
    }, [socket, qc]);

    return (
        <Box sx={{ p: 3, height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Stack direction="row" alignItems="center" gap={1}>
                <FilterAlt color="action" />
                <Typography variant="h6" fontWeight={700}>Action History</Typography>
            </Stack>

            {/* ── Filters ── */}
            <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
                <TextField
                    size="small" placeholder="Tìm tên tài nguyên..."
                    value={search}
                    onChange={e => { setSearch(e.target.value); resetPage(); }}
                    sx={{ width: 220 }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                />

                <TextField
                    select size="small" label="Người dùng" value={userId}
                    onChange={e => { setUserId(e.target.value); resetPage(); }}
                    sx={{ width: 200 }}
                >
                    <MenuItem value="">Tất cả</MenuItem>
                    {actors.map(a => (
                        <MenuItem key={a.userId} value={a.userId}>{a.userEmail}</MenuItem>
                    ))}
                </TextField>

                <TextField
                    select size="small" label="Hành động" value={action}
                    onChange={e => { setAction(e.target.value); resetPage(); }}
                    sx={{ width: 140 }}
                >
                    <MenuItem value="">Tất cả</MenuItem>
                    {ACTION_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                </TextField>

                <TextField
                    select size="small" label="Loại tài nguyên" value={resourceType}
                    onChange={e => { setResourceType(e.target.value); resetPage(); }}
                    sx={{ width: 160 }}
                >
                    <MenuItem value="">Tất cả</MenuItem>
                    {RESOURCE_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                </TextField>

                <TextField
                    size="small" type="date" label="Từ ngày"
                    value={dateFrom} InputLabelProps={{ shrink: true }}
                    onChange={e => { setDateFrom(e.target.value); resetPage(); }}
                    sx={{ width: 150 }}
                />
                <TextField
                    size="small" type="date" label="Đến ngày"
                    value={dateTo} InputLabelProps={{ shrink: true }}
                    onChange={e => { setDateTo(e.target.value); resetPage(); }}
                    sx={{ width: 150 }}
                />
            </Stack>

            {/* ── Table ── */}
            <Box sx={{ flex: 1, overflow: 'auto' }}>
                {isLoading && <CircularProgress size={24} />}
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Thời gian</TableCell>
                            <TableCell colSpan={2}>Hành động</TableCell>
                            <TableCell>Loại</TableCell>
                            <TableCell>Tài nguyên</TableCell>
                            <TableCell>Người thực hiện</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(data?.data ?? []).map(log => (
                            <LogRow key={log.id} log={log} />
                        ))}
                        {!isLoading && (data?.data ?? []).length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                    Không có dữ liệu
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Box>

            {/* ── Pagination ── */}
            <TablePagination
                component="div"
                count={data?.total ?? 0}
                page={page}
                rowsPerPage={PAGE_SIZE}
                rowsPerPageOptions={[PAGE_SIZE]}
                onPageChange={(_, p) => setPage(p)}
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
            />
        </Box>
    );
}
