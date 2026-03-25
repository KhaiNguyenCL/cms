import { useState } from 'react';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Button, TextField, Grid,
    Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Tooltip, Switch, FormControlLabel, Select, MenuItem as MuiMenuItem,
    FormControl, InputLabel, InputAdornment, Skeleton, ToggleButton, ToggleButtonGroup,
    Pagination, FormHelperText,
} from '@mui/material';
import {
    Add, Delete, EventNote, Search, CalendarMonth, AccessTime,
    Edit, QueueMusic, Image as ImageIcon, AllInclusive, Close,
} from '@mui/icons-material';
import { schedulesApi, type CreateSchedulePayload } from '@api/schedules.api';
import { playlistsApi } from '@api/playlists.api';
import { getApiError } from '@api/client';
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
                    <InputLabel>Giờ</InputLabel>
                    <Select
                        value={h ?? ''}
                        label="Giờ"
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
                    <InputLabel>Phút</InputLabel>
                    <Select
                        value={m ?? ''}
                        label="Phút"
                        onChange={(e) => setMinute(Number(e.target.value))}
                        MenuProps={{ PaperProps: { sx: { maxHeight: 220 } } }}
                    >
                        {MINUTES.map(i => (
                            <MuiMenuItem key={i} value={i}>{String(i).padStart(2, '0')}</MuiMenuItem>
                        ))}
                    </Select>
                </FormControl>
                {value && (
                    <Tooltip title="Xoá">
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
    const isAllDay = !startTime && !endTime;
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', gap: 2, width: '100%', alignItems: 'flex-start' }}>
                <TimeSelect
                    label="Giờ bắt đầu"
                    value={startTime}
                    onChange={(s) => onChange(s, endTime)}
                    helperText={isAllDay ? '✓ Đang phát cả ngày' : undefined}
                    error={!!error}
                />
                <TimeSelect
                    label="Giờ kết thúc"
                    value={endTime}
                    onChange={(e) => onChange(startTime, e)}
                    helperText={error ?? undefined}
                    error={!!error}
                />
                <Tooltip title={isAllDay ? 'Đang phát cả ngày' : 'Xoá giờ → phát cả ngày'}>
                    <Button
                        size="small"
                        variant={isAllDay ? 'contained' : 'outlined'}
                        color={isAllDay ? 'success' : 'inherit'}
                        onClick={() => onChange(null, null)}
                        startIcon={<AllInclusive sx={{ fontSize: 15 }} />}
                        sx={{ mt: 2.5, whiteSpace: 'nowrap', minWidth: 90 }}
                    >
                        Cả ngày
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
}: {
    open: boolean;
    onClose: () => void;
    editing: Schedule | null;
}) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();

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
        ? 'Giờ kết thúc phải sau giờ bắt đầu'
        : null;

    const isValid = form.name && form.startDate && !!form.playlistId && !timeError;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth TransitionProps={{ onEnter: handleOpen }}>
            <DialogTitle fontWeight={700}>{editing ? 'Edit Schedule' : 'New Schedule'}</DialogTitle>
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
                        <FormHelperText>Media trong playlist sẽ phát theo thứ tự, lặp lại</FormHelperText>
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
                            Ngày trong tuần — không chọn = chạy mỗi ngày trong khoảng ngày
                        </Typography>
                        <Typography variant="caption" color="warning.main" display="block" mb={1}>
                            Chọn cụ thể (VD: T2, T6) → các ngày còn lại trong khoảng ngày sẽ không chạy schedule này
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
            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={!isValid || mutation.isPending}
                    onClick={() => mutation.mutate()}
                >
                    {mutation.isPending ? 'Saving...' : editing ? 'Save Changes' : 'Create Schedule'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Main SchedulesPage ────────────────────────────────────────────────────────

export default function SchedulesPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');
    const [createOpen, setCreateOpen] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['schedules', page, search, filterActive],
        queryFn: () => schedulesApi.list({
            page,
            limit: 15,
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

    const deleteMutation = useMutation({
        mutationFn: (id: string) => schedulesApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            dispatch(pushToast({ severity: 'success', message: 'Schedule deleted' }));
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Delete failed') })),
    });

    const handleDelete = (s: Schedule) => {
        if (window.confirm(`Delete schedule "${s.name}"?`)) deleteMutation.mutate(s.id);
    };

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Schedules</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {data?.total ?? 0} schedules
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                    New Schedule
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
                            <TableCell>Active</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>Playlist</TableCell>
                            <TableCell>Date Range</TableCell>
                            <TableCell>Time Window</TableCell>
                            <TableCell>Days</TableCell>
                            <TableCell align="right">Actions</TableCell>
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

                                    {/* Date range */}
                                    <TableCell>
                                        <Stack direction="row" gap={0.5} alignItems="center">
                                            <CalendarMonth sx={{ fontSize: 14, color: 'text.secondary' }} />
                                            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                {formatDate(s.startDate)}
                                                {' → '}
                                                {s.endDate
                                                    ? formatDate(s.endDate)
                                                    : <AllInclusive sx={{ fontSize: 16 }} />
                                                }
                                            </Typography>
                                        </Stack>
                                    </TableCell>

                                    {/* Time window */}
                                    <TableCell>
                                        {s.startTime || s.endTime ? (
                                            <Stack direction="row" gap={0.5} alignItems="center">
                                                <AccessTime sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                <Typography variant="caption">
                                                    {s.startTime ?? '00:00'} – {s.endTime ?? '23:59'}
                                                </Typography>
                                            </Stack>
                                        ) : (
                                            <Typography variant="caption" color="text.disabled">All day</Typography>
                                        )}
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
                                            <Tooltip title="Delete">
                                                <IconButton size="small" color="error" onClick={() => handleDelete(s)}>
                                                    <Delete fontSize="small" />
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
                            <Typography variant="h6" gutterBottom>Không tìm thấy schedule nào</Typography>
                            <Typography variant="body2" color="text.secondary">
                                {filterActive === 'inactive'
                                    ? 'Không có schedule nào đang Inactive.'
                                    : filterActive === 'active'
                                        ? 'Không có schedule nào đang Active.'
                                        : `Không có kết quả cho "${search}".`}
                            </Typography>
                        </>
                    ) : (
                        <>
                            <Typography variant="h6" gutterBottom>Chưa có schedule nào</Typography>
                            <Typography variant="body2" color="text.secondary" mb={2}>
                                Tạo schedule để tự động đẩy playlist đến thiết bị.
                            </Typography>
                            <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                                Tạo Schedule đầu tiên
                            </Button>
                        </>
                    )}
                </Box>
            )}

            {/* Pagination */}
            {data && data.totalPages > 1 && (
                <Box mt={3} display="flex" justifyContent="center">
                    <Pagination count={data.totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
                </Box>
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
                />
            )}
        </Box>
    );
}
