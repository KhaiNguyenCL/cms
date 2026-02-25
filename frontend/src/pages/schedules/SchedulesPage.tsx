import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Button, TextField, Grid,
    Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Tooltip, Switch, FormControlLabel, Select, MenuItem as MuiMenuItem,
    FormControl, InputLabel, InputAdornment, Skeleton, ToggleButton, ToggleButtonGroup,
    Pagination, Divider, FormHelperText,
} from '@mui/material';
import {
    Add, Delete, EventNote, Search, CalendarMonth, AccessTime,
    Edit, Devices, Groups, Public, Circle,
} from '@mui/icons-material';
import { schedulesApi, type CreateSchedulePayload } from '@api/schedules.api';
import { playlistsApi } from '@api/playlists.api';
import { devicesApi } from '@api/devices.api';
import { deviceGroupsApi } from '@api/device-groups.api';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Schedule } from '@/types';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

function TargetChip({ schedule }: { schedule: Schedule }) {
    if (schedule.targetType === 'ALL') return <Chip icon={<Public sx={{ fontSize: 14 }} />} label="All Devices" size="small" color="info" sx={{ fontWeight: 600, fontSize: '0.65rem' }} />;
    if (schedule.targetType === 'DEVICE') return <Chip icon={<Devices sx={{ fontSize: 14 }} />} label={schedule.targetDeviceName ?? 'Device'} size="small" color="secondary" sx={{ fontWeight: 600, fontSize: '0.65rem' }} />;
    return <Chip icon={<Groups sx={{ fontSize: 14 }} />} label={schedule.targetGroupName ?? 'Group'} size="small" color="warning" sx={{ fontWeight: 600, fontSize: '0.65rem' }} />;
}

function formatDate(d: string | null) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString();
}

// ── Create / Edit Schedule Dialog ─────────────────────────────────────────────

const EMPTY_FORM: CreateSchedulePayload = {
    name: '',
    playlistId: '',
    targetType: 'ALL',
    targetDeviceId: null,
    targetGroupId: null,
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    startTime: null,
    endTime: null,
    daysOfWeek: [],
    priority: 0,
    isActive: true,
};

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
                startDate: editing.startDate?.slice(0, 10) ?? '',
                endDate: editing.endDate?.slice(0, 10) ?? null,
                startTime: editing.startTime,
                endTime: editing.endTime,
                daysOfWeek: editing.daysOfWeek ?? [],
                priority: editing.priority,
                isActive: editing.isActive,
            }
            : EMPTY_FORM
    );

    // Reset form when dialog opens
    const handleOpen = () => {
        setForm(
            editing
                ? {
                    name: editing.name,
                    playlistId: editing.playlistId,
                    targetType: editing.targetType,
                    targetDeviceId: editing.targetDeviceId,
                    targetGroupId: editing.targetGroupId,
                    startDate: editing.startDate?.slice(0, 10) ?? '',
                    endDate: editing.endDate?.slice(0, 10) ?? null,
                    startTime: editing.startTime,
                    endTime: editing.endTime,
                    daysOfWeek: editing.daysOfWeek ?? [],
                    priority: editing.priority,
                    isActive: editing.isActive,
                }
                : EMPTY_FORM
        );
    };

    const { data: playlistsData } = useQuery({
        queryKey: ['playlists-all'],
        queryFn: () => playlistsApi.list({ limit: 100 }),
        enabled: open,
    });
    const playlists = playlistsData?.data ?? [];

    const { data: devicesData } = useQuery({
        queryKey: ['devices-all'],
        queryFn: () => devicesApi.list({ limit: 100 }),
        enabled: open,
    });
    const devices = devicesData?.data ?? [];

    const { data: allGroups = [] } = useQuery({
        queryKey: ['device-groups-all'],
        queryFn: () => deviceGroupsApi.listAll(),
        enabled: open,
    });

    const mutation = useMutation({
        mutationFn: () =>
            editing
                ? schedulesApi.update(editing.id, form)
                : schedulesApi.create(form),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            dispatch(pushToast({ severity: 'success', message: editing ? 'Schedule updated!' : 'Schedule created!' }));
            onClose();
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Failed to save schedule' })),
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

    const isValid = form.name && form.playlistId && form.startDate;

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
                            value={form.playlistId}
                            label="Playlist"
                            onChange={(e) => field('playlistId')(e.target.value)}
                        >
                            {playlists.map(p => (
                                <MuiMenuItem key={p.id} value={p.id}>{p.name}</MuiMenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    <Divider><Typography variant="caption" color="text.secondary">Target</Typography></Divider>

                    {/* Target type */}
                    <FormControl fullWidth>
                        <InputLabel>Target</InputLabel>
                        <Select
                            value={form.targetType}
                            label="Target"
                            onChange={(e) => field('targetType')(e.target.value as any)}
                        >
                            <MuiMenuItem value="ALL"><Stack direction="row" gap={1} alignItems="center"><Public fontSize="small" /> All Devices</Stack></MuiMenuItem>
                            <MuiMenuItem value="DEVICE"><Stack direction="row" gap={1} alignItems="center"><Devices fontSize="small" /> Specific Device</Stack></MuiMenuItem>
                            <MuiMenuItem value="GROUP"><Stack direction="row" gap={1} alignItems="center"><Groups fontSize="small" /> Device Group</Stack></MuiMenuItem>
                        </Select>
                    </FormControl>

                    {form.targetType === 'DEVICE' && (
                        <FormControl fullWidth required>
                            <InputLabel>Select Device</InputLabel>
                            <Select
                                value={form.targetDeviceId ?? ''}
                                label="Select Device"
                                onChange={(e) => field('targetDeviceId')(e.target.value || null)}
                            >
                                {devices.map(d => (
                                    <MuiMenuItem key={d.id} value={d.id}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" width="100%">
                                            <span>{d.name}</span>
                                            <Chip
                                                label={d.status}
                                                size="small"
                                                color={d.status === 'ONLINE' ? 'success' : 'default'}
                                                sx={{ ml: 1, fontSize: '0.6rem', fontWeight: 700 }}
                                            />
                                        </Stack>
                                    </MuiMenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}
                    {form.targetType === 'GROUP' && (
                        <FormControl fullWidth required>
                            <InputLabel>Select Group</InputLabel>
                            <Select
                                value={form.targetGroupId ?? ''}
                                label="Select Group"
                                onChange={(e) => field('targetGroupId')(e.target.value || null)}
                            >
                                {allGroups.map(g => (
                                    <MuiMenuItem key={g.id} value={g.id}>
                                        <Stack direction="row" justifyContent="space-between" alignItems="center" width="100%">
                                            <span>{g.name}</span>
                                            <Chip
                                                label={`${g.deviceCount} devices`}
                                                size="small"
                                                sx={{ ml: 1, fontSize: '0.6rem', fontWeight: 700 }}
                                            />
                                        </Stack>
                                    </MuiMenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    )}

                    <Divider><Typography variant="caption" color="text.secondary">Schedule</Typography></Divider>

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
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 6 }}>
                            <TextField
                                label="Start time (optional)" type="time"
                                value={form.startTime ?? ''}
                                onChange={(e) => field('startTime')(e.target.value || null)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                                helperText="Empty = all day"
                            />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                            <TextField
                                label="End time (optional)" type="time"
                                value={form.endTime ?? ''}
                                onChange={(e) => field('endTime')(e.target.value || null)}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                    </Grid>

                    {/* Days of week */}
                    <Box>
                        <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                            Days of week — leave all unselected to run every day
                        </Typography>
                        <ToggleButtonGroup size="small">
                            {DAY_LABELS.map((d, i) => (
                                <ToggleButton
                                    key={i}
                                    value={i}
                                    selected={form.daysOfWeek?.includes(i) ?? false}
                                    onClick={() => toggleDay(i)}
                                    sx={{ minWidth: 44, fontWeight: 700 }}
                                >
                                    {d}
                                </ToggleButton>
                            ))}
                        </ToggleButtonGroup>
                    </Box>

                    {/* Priority & Active */}
                    <Grid container spacing={2} alignItems="center">
                        <Grid size={{ xs: 6 }}>
                            <TextField
                                label="Priority (0–100)"
                                type="number"
                                value={form.priority}
                                onChange={(e) => field('priority')(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                                inputProps={{ min: 0, max: 100 }}
                                fullWidth
                                helperText="Higher priority wins conflicts"
                            />
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                            <FormControlLabel
                                control={<Switch checked={form.isActive ?? true} onChange={(e) => field('isActive')(e.target.checked)} />}
                                label="Active"
                            />
                        </Grid>
                    </Grid>
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
        onSuccess: () => qc.invalidateQueries({ queryKey: ['schedules'] }),
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Failed to toggle schedule' })),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => schedulesApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['schedules'] });
            dispatch(pushToast({ severity: 'success', message: 'Schedule deleted' }));
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Delete failed' })),
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
                            <TableCell>Target</TableCell>
                            <TableCell>Date Range</TableCell>
                            <TableCell>Time Window</TableCell>
                            <TableCell>Days</TableCell>
                            <TableCell align="center">Priority</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoading
                            ? Array.from({ length: 5 }).map((_, i) => (
                                <TableRow key={i}>
                                    {Array.from({ length: 9 }).map((_, j) => (
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
                                        {s.priority > 0 && (
                                            <Typography variant="caption" color="text.secondary">Priority {s.priority}</Typography>
                                        )}
                                    </TableCell>

                                    {/* Playlist */}
                                    <TableCell>
                                        <Chip
                                            label={s.playlistName ?? s.playlistId.slice(0, 8) + '…'}
                                            size="small"
                                            variant="outlined"
                                            sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                                        />
                                    </TableCell>

                                    {/* Target */}
                                    <TableCell><TargetChip schedule={s} /></TableCell>

                                    {/* Date range */}
                                    <TableCell>
                                        <Stack direction="row" gap={0.5} alignItems="center">
                                            <CalendarMonth sx={{ fontSize: 14, color: 'text.secondary' }} />
                                            <Typography variant="caption">
                                                {formatDate(s.startDate)}
                                                {' → '}
                                                {s.endDate ? formatDate(s.endDate) : '∞'}
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

                                    {/* Priority */}
                                    <TableCell align="center">
                                        <Chip
                                            label={s.priority}
                                            size="small"
                                            color={s.priority >= 50 ? 'warning' : 'default'}
                                            sx={{ fontWeight: 700, minWidth: 32 }}
                                        />
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
                    <Typography variant="h6" gutterBottom>No schedules yet</Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Create a schedule to automatically push playlists to your devices.
                    </Typography>
                    <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                        Create First Schedule
                    </Button>
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
