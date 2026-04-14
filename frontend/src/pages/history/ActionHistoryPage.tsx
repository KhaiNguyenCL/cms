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
import { useTranslation } from 'react-i18next';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

function fmtDateTime(iso: string, lang = 'vi'): string {
    return new Date(iso).toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour12: false });
}

function actionChip(action: ActionType, t: (key: string) => string) {
    const map: Record<ActionType, { labelKey: string; color: 'success' | 'warning' | 'error' }> = {
        CREATE: { labelKey: 'history.action.actionCreate', color: 'success' },
        UPDATE: { labelKey: 'history.action.actionUpdate', color: 'warning' },
        DELETE: { labelKey: 'history.action.actionDelete', color: 'error'   },
    };
    const { labelKey, color } = map[action] ?? { labelKey: action, color: 'default' as const };
    return <Chip label={t(labelKey)} size="small" color={color} />;
}

function actionIcon(action: ActionType) {
    if (action === 'CREATE') return <Add fontSize="small" color="success" />;
    if (action === 'UPDATE') return <Edit fontSize="small" color="warning" />;
    return <Delete fontSize="small" color="error" />;
}

const RESOURCE_LABEL_KEYS: Record<ResourceType, string> = {
    DEVICE:   'history.action.resourceDevice',
    MEDIA:    'media.title',
    PLAYLIST: 'nav.playlists',
    SCHEDULE: 'history.action.resourceSchedule',
    USER:     'history.action.resourceUser',
    STORE:    'nav.sites',
    VERSION:  'history.action.resourceVersion',
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
    const { t, i18n } = useTranslation();
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
                        {fmtDateTime(log.occurredAt, i18n.language)}
                    </Typography>
                </TableCell>
                <TableCell sx={{ width: 110 }}>
                    {actionChip(log.action, t)}
                </TableCell>
                <TableCell sx={{ width: 120 }}>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        {resourceIcon(log.resourceType)}
                        <Typography variant="caption">
                            {t(RESOURCE_LABEL_KEYS[log.resourceType] ?? log.resourceType)}
                        </Typography>
                    </Stack>
                </TableCell>
                <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 240 }}>
                        {log.resourceName ?? <em style={{ color: '#999' }}>{t('common.deleted')}</em>}
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

export default function ActionHistoryPage() {
    const qc = useQueryClient();
    const { t } = useTranslation();
    const { socket } = useSocket();
    const [search,       setSearch]       = useState('');
    const [userId,       setUserId]       = useState('');
    const [action,       setAction]       = useState('');
    const [resourceType, setResourceType] = useState('');
    const [dateFrom,     setDateFrom]     = useState('');
    const [dateTo,       setDateTo]       = useState('');
    const [page,         setPage]         = useState(0);

    const ACTION_OPTIONS = useMemo(() => [
        { value: 'CREATE' as ActionType, label: t('history.action.actionCreate') },
        { value: 'UPDATE' as ActionType, label: t('history.action.actionUpdate') },
        { value: 'DELETE' as ActionType, label: t('history.action.actionDelete') },
    ], [t]);

    const RESOURCE_OPTIONS = useMemo(() => [
        { value: 'DEVICE'   as ResourceType, label: t('history.action.resourceDevice') },
        { value: 'MEDIA'    as ResourceType, label: t('media.title') },
        { value: 'PLAYLIST' as ResourceType, label: t('nav.playlists') },
        { value: 'SCHEDULE' as ResourceType, label: t('history.action.resourceSchedule') },
        { value: 'USER'     as ResourceType, label: t('history.action.resourceUser') },
        { value: 'STORE'    as ResourceType, label: t('nav.sites') },
        { value: 'VERSION'  as ResourceType, label: t('history.action.resourceVersion') },
    ], [t]);

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
                <Typography variant="h6" fontWeight={700}>{t('history.action.title')}</Typography>
            </Stack>

            {/* ── Filters ── */}
            <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
                <TextField
                    size="small" placeholder={t('history.action.searchPlaceholder')}
                    value={search}
                    onChange={e => { setSearch(e.target.value); resetPage(); }}
                    sx={{ width: 220 }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                />

                <TextField
                    select size="small" label={t('history.action.filterUser')} value={userId}
                    onChange={e => { setUserId(e.target.value); resetPage(); }}
                    sx={{ width: 200 }}
                >
                    <MenuItem value="">{t('common.all')}</MenuItem>
                    {actors.map(a => (
                        <MenuItem key={a.userId} value={a.userId}>{a.userEmail}</MenuItem>
                    ))}
                </TextField>

                <TextField
                    select size="small" label={t('history.action.filterAction')} value={action}
                    onChange={e => { setAction(e.target.value); resetPage(); }}
                    sx={{ width: 140 }}
                >
                    <MenuItem value="">{t('common.all')}</MenuItem>
                    {ACTION_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                </TextField>

                <TextField
                    select size="small" label={t('history.action.filterResource')} value={resourceType}
                    onChange={e => { setResourceType(e.target.value); resetPage(); }}
                    sx={{ width: 160 }}
                >
                    <MenuItem value="">{t('common.all')}</MenuItem>
                    {RESOURCE_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                </TextField>

                <TextField
                    size="small" type="date" label={t('common.fromDate')}
                    value={dateFrom} InputLabelProps={{ shrink: true }}
                    onChange={e => { setDateFrom(e.target.value); resetPage(); }}
                    sx={{ width: 150 }}
                />
                <TextField
                    size="small" type="date" label={t('common.toDate')}
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
                            <TableCell>{t('common.timestamp')}</TableCell>
                            <TableCell>{t('common.actionCol')}</TableCell>
                            <TableCell>{t('common.type')}</TableCell>
                            <TableCell>Resource</TableCell>
                            <TableCell>{t('common.performer')}</TableCell>
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
                                    {t('common.noData')}
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
                labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
            />
        </Box>
    );
}
