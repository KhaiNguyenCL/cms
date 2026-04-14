import { useState } from 'react';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Button, TextField, Grid,
    Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Tooltip, Switch, FormControlLabel, Select, MenuItem as MuiMenuItem,
    FormControl, InputLabel, InputAdornment, Skeleton, ToggleButton, ToggleButtonGroup,
    TablePagination, FormHelperText, CircularProgress,
} from '@mui/material';
import {
    Add, Delete, EventNote, Search, CalendarMonth, AccessTime,
    Edit, QueueMusic, Image as ImageIcon, AllInclusive, Close,
} from '@mui/icons-material';
import { schedulesApi, type CreateSchedulePayload } from '@api/schedules.api';
import { playlistsApi } from '@api/playlists.api';
import { getApiError } from '@api/client';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Schedule } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── TimeSelect: dropdown chọn giờ + phút ────────────────────────────────────

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function TimeSelect({ label, value, onChange, helperText, error }: {
    label: string;
    value: string | null;
    onChange: (v: string | null) => void;
    helperText?: string;
    error?: boolean;
}) {
    const { t } = useTranslation();
    const [h, m] = value ? value.split(':').map(Number) : [null, null];

    const setHour = (newH: number) => {
        onChange(`${String(newH).padStart(2, '0')}:${String(m ?? 0).padStart(2, '0')}`);
    };
    const setMinute = (newM: number) => {
        onChange(`${String(h ?? 0).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
    };
    const clear = () => onChange(null);

    return (
        <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ mb: 0.5, display: 'block' }}>
                {label}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl size="small" sx={{ flex: 1 }} error={error}>
                    <InputLabel>{t('schedules.hour')}</InputLabel>
                    <Select
                        value={h ?? ''}
                        label={t('schedules.hour')}
                        onChange={(e) => setHour(Number(e.target.value))}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 220 } } }}
                    >
                        {HOURS.map(i => (
                            <MuiMenuItem key={i} value={i}>{String(i).padStart(2, '0')}</MuiMenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Typography variant="body1" fontWeight={700}>:</Typography>
                <FormControl size="small" sx={{ flex: 1 }} error={error}>
                    <InputLabel>{t('schedules.minute')}</InputLabel>
                    <Select
                        value={m ?? ''}
                        label={t('schedules.minute')}
                        onChange={(e) => setMinute(Number(e.target.value))}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 220 } } }}
                    >
                        {MINUTES.map(i => (
                            <MuiMenuItem key={i} value={i}>{String(i).padStart(2, '0')}</MuiMenuItem>
                        ))}
                    </Select>
                </FormControl>
                {value && (
                    <Tooltip title={t('common.delete')}>
                        <IconButton size="small" onClick={clear}><Close fontSize="small" /></IconButton>
                    </Tooltip>
                )}
            </Box>
            {helperText && (
                <Typography variant="caption" color={error ? 'error' : 'text.secondary'} sx={{ mt: 0.5, display: 'block' }}>
                    {helperText}
                </Typography>
            )}
        </Box>
    );
}

function TimeRangeField({ startTime, endTime, onChange, error }: {
    startTime: string | null;
    endTime: string | null;
    onChange: (start: string | null, end: string | null) => void;
    error?: string | null;
}) {
    const { t } = useTranslation();
    const isAllDay = !startTime && !endTime;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 2, width: '100%', alignItems: 'flex-start' }}>
                <TimeSelect
                    label={t('schedules.startTime')}
                    value={startTime}
                    onChange={(s) => onChange(s, endTime)}
                    helperText={isAllDay ? `✓ ${t('schedules.playingAllDay')}` : undefined}
                    error={!!error}
                />
                <TimeSelect
                    label={t('schedules.endTime')}
                    value={endTime}
                    onChange={(e) => onChange(startTime, e)}
                    helperText={error ?? undefined}
                    error={!!error}
                />
                <Tooltip title={isAllDay ? t('schedules.playingAllDay') : t('schedules.clearTimeTooltip')}>
                    <Button
                        size="medium"
                        variant={isAllDay ? 'contained' : 'outlined'}
                        color={isAllDay ? 'success' : 'inherit'}
                        onClick={() => onChange(null, null)}
                        startIcon={<AllInclusive sx={{ fontSize: 15 }} />}
                        sx={{ mt: 2.5, whiteSpace: 'nowrap', minWidth: 90 }}
                    >
                        {t('schedules.allDay')}
                    </Button>
                </Tooltip>
            </Box>
        </Box>
    );
}

// ── Helper display components ─────────────────────────────────────────────────

function DaysChips({ days }: { days: number[] }) {
    if (!days || days.length === 0) {
        return <Chip label="Everyday" size="small" color="default" sx={{ fontWeight: 600, fontSize: '0.65rem' }} />;
    }
    return (
        <Stack direction="row" gap={0.5} flexWrap="wrap">
            {DAY_LABELS.map((d, i) => (
                <Chip
                    key={i}
                    label={d}
                    size="small"
                    sx={{
                        fontWeight: 700,
                        fontSize: '0.6rem',
                        bgcolor: days.includes(i) ? 'primary.main' : 'action.disabledBackground',
                        color: days.includes(i) ? 'white' : 'text.disabled',
                    }}
                />
            ))}
        </Stack>
    );
}


function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
}

/** Parse date from API (ISO timestamp or YYYY-MM-DD) → YYYY-MM-DD in local timezone */
function toLocalDateStr(d: string | null | undefined): string {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-CA'); // en-CA = YYYY-MM-DD
}

function makeEmptyForm(): CreateSchedulePayload {
    return {
        name: '',
        playlistId: undefined,
        targetType: 'ALL',
        targetDeviceId: null,
        targetGroupId: null,
        startDate: new Date().toLocaleDateString('en-CA'),
        endDate: null,
        startTime: null,
        endTime: null,
        daysOfWeek: [],
        priority: 0,
        isActive: true,
    };
}
// targetType, targetDeviceId, targetGroupId, priority are managed in Schedule Assignment — kept in payload with defaults

function ScheduleFormDialog({
    open,
    onClose,
    editing,
    onDeleted,
}: {
    open: boolean;
    onClose: () => void;
    editing: Schedule | null;
    onDeleted?: () => void;
}) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [confirmDel, setConfirmDel] = useState(false);

    const [form, setForm] = useState<CreateSchedulePayload>(
        editing
            ? {
                name: editing.name,
                playlistId: editing.playlistId,
                targetType: editing.targetType,
                targetDeviceId: editing.targetDeviceId,
                targetGroupId: editing.targetGroupId,
                startDate: toLocalDateStr(editing.startDate),
                endDate: toLocalDateStr(editing.endDate) || null,
                startTime: editing.startTime,
                endTime: editing.endTime,
                daysOfWeek: editing.daysOfWeek ?? [],
                priority: editing.priority,
                isActive: editing.isActive,
            }
            : makeEmptyForm()
    );

    const handleOpen = () => {
        setForm(
            editing
                ? {
                    name: editing.name,
                    playlistId: editing.playlistId,
                    targetType: editing.targetType,
                    targetDeviceId: editing.targetDeviceId,
                    targetGroupId: editing.targetGroupId,
                    startDate: toLocalDateStr(editing.startDate),
                    endDate: toLocalDateStr(editing.endDate) || null,
                    startTime: editing.startTime,
                    endTime: editing.endTime,
                    daysOfWeek: editing.daysOfWeek ?? [],
                    priority: editing.priority,
                    isActive: editing.isActive,
                }
                : makeEmptyForm()
        );
    };

    const { data: playlistsData } = useQuery({
        queryKey: ['playlists-all'],
        queryFn: () => playlistsApi.list({ limit: 100 }),
        enabled: open,
    });
    const playlists = playlistsData?.data ?? [];

    const mutation = useMutation({
        mutationFn: () => editing
            ? schedulesApi.update(editing.id, form)
            : schedulesApi.create(form),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            dispatch(pushToast({ severity: 'success', message: editing ? 'Schedule updated!' : 'Schedule created!' }));
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Failed to save schedule') })),
    });

    const deleteMutation = useMutation({
        mutationFn: () => schedulesApi.delete(editing!.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            dispatch(pushToast({ severity: 'success', message: t('schedules.deleteSuccess') }));
            onDeleted?.();
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Delete failed') })),
    });

    const toggleDay = (day: number) => {
        setForm(prev => ({
            ...prev,
            daysOfWeek: prev.daysOfWeek?.includes(day)
                ? prev.daysOfWeek.filter(d => d !== day)
                : [...(prev.daysOfWeek ?? []), day].sort(),
        }));
    };

    const field = <K extends keyof CreateSchedulePayload>(key: K) => (value: CreateSchedulePayload[K]) =>
        setForm(prev => ({ ...prev, [key]: value }));

    const timeError = form.startTime && form.endTime && form.startTime >= form.endTime
        ? t('schedules.timeError')
        : null;

    const isValid = form.name && form.startDate && !!form.playlistId && !timeError;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth TransitionProps={{ onEnter: handleOpen }}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                <Typography fontWeight={700}>{editing ? 'Edit Schedule' : 'New Schedule'}</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <Button size="small" onClick={onClose} disabled={mutation.isPending || deleteMutation.isPending}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        size="small"
                        variant="contained"
                        disabled={!isValid || mutation.isPending || deleteMutation.isPending}
                        onClick={() => mutation.mutate()}
                    >
                        {mutation.isPending ? t('common.saving') : editing ? t('common.save') : t('common.create')}
                    </Button>
                </Box>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} sx={{ mt: 0.5 }}>
                    {/* Name */}
                    <TextField
                        label="Schedule name"
                        value={form.name}
                        onChange={(e) => field('name')(e.target.value)}
                        fullWidth required
                    />

                    {/* Playlist */}
                    <FormControl fullWidth required>
                        <InputLabel>Playlist</InputLabel>
                        <Select
                            value={form.playlistId ?? ''}
                            label="Playlist"
                            onChange={(e) => field('playlistId')(e.target.value)}
                        >
                            {playlists.map(p => (
                                <MuiMenuItem key={p.id} value={p.id}>
                                    <Stack direction="row" gap={1} alignItems="center">
                                        <QueueMusic sx={{ fontSize: 16, color: 'text.secondary' }} />
                                        {p.name}
                                    </Stack>
                                </MuiMenuItem>
                            ))}
                        </Select>
                        <FormHelperText>{t('schedules.playlistHelper')}</FormHelperText>
                    </FormControl>

                    {/* Date range */}
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 6 }}>
                            <TextField
                                label="Start date" type="date"
                                value={form.startDate}
                                onChange={(e) => field('startDate')(e.target.value)}
                                fullWidth required
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                            <TextField
                                label="End date (optional)" type="date"
                                value={form.endDate ?? ''}
                                onChange={(e) => field('endDate')(e.target.value || null)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                helperText="Leave empty = no expiry"
                            />
                        </Grid>
                    </Grid>

                    {/* Time window */}
                    <TimeRangeField
                        startTime={form.startTime ?? null}
                        endTime={form.endTime ?? null}
                        onChange={(s, e) => setForm(prev => ({ ...prev, startTime: s, endTime: e }))}
                        error={timeError}
                    />

                    {/* Days of week */}
                    <Box>
                        <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                            {t('schedules.daysOfWeek')} — {t('schedules.daysHelper')}
                        </Typography>
                        <Typography variant="caption" color="warning.main" display="block" mb={1}>
                            {t('schedules.daysSpecificHint')}
                        </Typography>
                        <ToggleButtonGroup size="small">
                            {DAY_LABELS.map((d, i) => (
                                <ToggleButton
                                    key={i}
                                    value={i}
                                    selected={form.daysOfWeek?.includes(i) ?? false}
                                    onClick={() => toggleDay(i)}
                                    sx={{
                                        minWidth: 44, fontWeight: 700,
                                        '&.Mui-selected': {
                                            bgcolor: 'primary.main',
                                            color: '#fff',
                                            '&:hover': { bgcolor: 'primary.dark' },
                                        },
                                        '&:not(.Mui-selected)': {
                                            bgcolor: 'action.selected',
                                            color: 'text.secondary',
                                            '&:hover': { bgcolor: 'action.focus' },
                                        },
                                    }}
                                >
                                    {d}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>

                    {/* Active */}
                    <FormControlLabel
                        control={<Switch checked={form.isActive ?? true} onChange={(e) => field('isActive')(e.target.checked)} />}
                        label="Active"
                    />
                </Stack>
            </DialogContent>
            {editing && (
                <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'flex-start' }}>
                    {confirmDel ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="error">{t('schedules.confirmDelete')}</Typography>
                            <Button size="small" color="error" disabled={deleteMutation.isPending}
                                startIcon={deleteMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                                onClick={() => deleteMutation.mutate()}>{t('common.delete')}</Button>
                            <Button size="small" onClick={() => setConfirmDel(false)} disabled={deleteMutation.isPending}>{t('common.no')}</Button>
                        </Stack>
                    ) : (
                        <Button size="small" color="error" startIcon={<Delete />} onClick={() => setConfirmDel(true)}>{t('common.delete')}</Button>
                    )}
                </DialogActions>
            )}
        </Dialog>
    );
}

// ── Main SchedulesPage ────────────────────────────────────────────────────────

export default function SchedulesPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const { t } = useTranslation();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(15);
    const [search, setSearch] = useState('');
    const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
    const [createOpen, setCreateOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['schedules', page, limit, search, filterActive],
        queryFn: () => schedulesApi.list({
            page,
            limit,
            search: search || undefined,
            isActive: filterActive === 'all' ? undefined : filterActive === 'active',
        }),
    });

    const toggleMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            schedulesApi.toggleActive(id, isActive),
        // Optimistic update: flip the switch immediately, rollback on error
        onMutate: async ({ id, isActive }) => {
            await qc.cancelQueries({ queryKey: ['schedules'] });
            const prev = qc.getQueryData(['schedules', page, search, filterActive]);
            qc.setQueryData(['schedules', page, search, filterActive], (old: typeof data) => {
                if (!old) return old;
                return { ...old, data: old.data.map(s => s.id === id ? { ...s, isActive } : s) };
            });
            return { prev };
        },
        onError: (err, _vars, ctx) => {
            if (ctx?.prev) qc.setQueryData(['schedules', page, search, filterActive], ctx.prev);
            dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Failed to toggle schedule') }));
        },
        onSettled: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
    });


    return (
        <Box>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>{t('schedules.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {data?.total ?? 0} {t('schedules.title').toLowerCase()}
                    </Typography>
                </Box>
                <Button startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                    {t('schedules.createSchedule')}
                </Button>
            </Stack>

            {/* Filters */}
            <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
                <TextField
                    placeholder="Search schedules..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    size="small"
                    sx={{ width: 240 }}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
                    }}
                />
                <FormControl size="small" sx={{ width: 140 }}>
                    <InputLabel>Status</InputLabel>
                    <Select value={filterActive} label="Status" onChange={(e) => { setFilterActive(e.target.value as any); setPage(1); }}>
                        <MuiMenuItem value="all">All</MuiMenuItem>
                        <MuiMenuItem value="active">Active</MuiMenuItem>
                        <MuiMenuItem value="inactive">Inactive</MuiMenuItem>
                    </Select>
                </FormControl>
            </Stack>

            {/* Table */}
            <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                <Table size="medium">
                    <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'action.hover' } }}>
                            <TableCell>{t('schedules.isActive')}</TableCell>
                            <TableCell>{t('common.name')}</TableCell>
                            <TableCell>{t('schedules.playlist')}</TableCell>
                            <TableCell>{t('schedules.startTime')}</TableCell>
                            <TableCell>{t('schedules.endTime')}</TableCell>
                            <TableCell>{t('schedules.daysOfWeek')}</TableCell>
                            <TableCell align="right">{t('common.actions')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoading
                            ? Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    {Array.from({ length: 7 }).map((_, j) => (
                                        <TableCell key={j}><Skeleton variant="text" /></TableCell>
                                    ))}
                                </TableRow>
                            ))
                            : (data?.data ?? []).map((s) => (
                                <TableRow
                                    key={s.id}
                                    hover
                                    sx={{ opacity: s.isActive ? 1 : 0.5 }}
                                >
                                    {/* Toggle active */}
                                    <TableCell>
                                        <Tooltip title={s.isActive ? 'Click to deactivate' : 'Click to activate'}>
                                            <Switch
                                                checked={s.isActive}
                                                size="small"
                                                onChange={(e) => toggleMutation.mutate({ id: s.id, isActive: e.target.checked })}
                                            />
                                        </Tooltip>
                                    </TableCell>

                                    {/* Name */}
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={600}>{s.name}</Typography>
                                    </TableCell>

                                    {/* Playlist / Direct media */}
                                    <TableCell>
                                        {s.playlistName?.startsWith('[Auto] ') ? (
                                            <Chip
                                                icon={<ImageIcon sx={{ fontSize: 12 }} />}
                                                label={s.playlistName.slice(7)}
                                                size="small"
                                                color="secondary"
                                                variant="outlined"
                                                sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                                            />
                                        ) : (
                                            <Chip
                                                icon={<QueueMusic sx={{ fontSize: 12 }} />}
                                                label={s.playlistName ?? s.playlistId?.slice(0, 8) + '…'}
                                                size="small"
                                                variant="outlined"
                                                sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                                            />
                                        )}
                                    </TableCell>

                                    {/* Bắt đầu: date + time */}
                                    <TableCell>
                                        <Stack spacing={0.25}>
                                            <Stack direction="row" gap={0.5} alignItems="center">
                                                <CalendarMonth sx={{ fontSize: 13, color: 'text.secondary' }} />
                                                <Typography variant="caption">{formatDate(s.startDate)}</Typography>
                                            </Stack>
                                            {s.startTime ? (
                                                <Stack direction="row" gap={0.5} alignItems="center">
                                                    <AccessTime sx={{ fontSize: 13, color: 'text.secondary' }} />
                                                    <Typography variant="caption" color="text.secondary">{s.startTime}</Typography>
                                                </Stack>
                                            ) : (
                                                <Typography variant="caption" color="text.disabled">00:00</Typography>
                                            )}
                                        </Stack>
                                    </TableCell>

                                    {/* Kết thúc: date + time */}
                                    <TableCell>
                                        <Stack spacing={0.25}>
                                            <Stack direction="row" gap={0.5} alignItems="center">
                                                <CalendarMonth sx={{ fontSize: 13, color: 'text.secondary' }} />
                                                {s.endDate
                                                    ? <Typography variant="caption">{formatDate(s.endDate)}</Typography>
                                                    : <AllInclusive sx={{ fontSize: 15, color: 'text.disabled' }} />
                                                }
                                            </Stack>
                                            {s.endTime ? (
                                                <Stack direction="row" gap={0.5} alignItems="center">
                                                    <AccessTime sx={{ fontSize: 13, color: 'text.secondary' }} />
                                                    <Typography variant="caption" color="text.secondary">{s.endTime}</Typography>
                                                </Stack>
                                            ) : (
                                                <Typography variant="caption" color="text.disabled">23:59</Typography>
                                            )}
                                        </Stack>
                                    </TableCell>

                                    {/* Days */}
                                    <TableCell sx={{ minWidth: 180 }}>
                                        <DaysChips days={s.daysOfWeek ?? []} />
                                    </TableCell>

                                    {/* Actions */}
                                    <TableCell align="right">
                                        <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                            <Tooltip title="Edit">
                                                <IconButton size="small" onClick={() => setEditingSchedule(s)}>
                                                    <Edit fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Empty state */}
            {!isLoading && !data?.data.length && (
                <Box textAlign="center" py={8}>
                    <EventNote sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    {filterActive !== 'all' || search ? (
                        <>
                            <Typography variant="h6" gutterBottom>{t('schedules.noSchedulesFound')}</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {filterActive === 'inactive'
                                    ? t('schedules.noInactive')
                                    : filterActive === 'active'
                                        ? t('schedules.noActive')
                                        : t('schedules.noResults', { search })}
                            </Typography>
                        </>
                    ) : (
                        <>
                            <Typography variant="h6" gutterBottom>{t('schedules.noSchedulesYet')}</Typography>
                            <Typography variant="body2" color="text.secondary" mb={2}>
                                {t('schedules.noSchedulesSubtitle')}
                            </Typography>
                            <Button startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                                {t('schedules.createFirst')}
                            </Button>
                        </>
                    )}
                </Box>
            )}

            {data && (
                <TablePagination
                    component="div"
                    count={data.total ?? 0}
                    page={page - 1}
                    onPageChange={(_, p) => setPage(p + 1)}
                    rowsPerPage={limit}
                    onRowsPerPageChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                    rowsPerPageOptions={[10, 15, 25, 50]}
                    labelRowsPerPage={t("common.perPage")}
                    labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                />
            )}

            {/* Create dialog */}
            <ScheduleFormDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                editing={null}
            />

            {/* Edit dialog */}
            {editingSchedule && (
                <ScheduleFormDialog
                    open={Boolean(editingSchedule)}
                    onClose={() => setEditingSchedule(null)}
                    editing={editingSchedule}
                    onDeleted={() => setEditingSchedule(null)}
                />
            )}
        </Box>
    );
}
