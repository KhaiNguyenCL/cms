import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Button, Chip, Tooltip, IconButton,
    Paper, Skeleton, TextField, Divider, InputAdornment,
    Tab, Tabs, Dialog, DialogTitle, DialogContent, DialogActions,
    List, ListItemButton, ListItemText, ListItemIcon,
    Table, TableBody, TableCell, TableHead, TableRow,
    Accordion, AccordionSummary, AccordionDetails, Alert,
} from '@mui/material';
import {
    CalendarMonth, Search, DevicesOther, Storefront,
    Add, Delete, DragIndicator, FiberManualRecord,
    AllInclusive, ExpandMore, InfoOutlined, WarningAmber,
} from '@mui/icons-material';
import {
    DndContext, closestCenter,
    KeyboardSensor, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove, SortableContext, sortableKeyboardCoordinates,
    useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { schedulesApi } from '@api/schedules.api';
import { devicesApi } from '@api/devices.api';
import { sitesApi } from '@api/sites.api';
import { scheduleAssignmentsApi, type ScheduleAssignment } from '@api/schedule-assignments.api';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Schedule, Device, Site } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function DaysChips({ days }: { days: number[] | null | undefined }) {
    if (!days || days.length === 0)
        return <Chip label="Hàng ngày" size="small" color="primary" variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18 }} />;
    return (
        <Stack direction="row" spacing={0.25} flexWrap="wrap">
            {DAY_LABELS.map((d, i) => (
                <Chip key={i} label={d} size="small" sx={{
                    fontSize: '0.6rem', height: 18, fontWeight: 700,
                    bgcolor: days.includes(i) ? 'primary.main' : 'action.disabledBackground',
                    color: days.includes(i) ? 'white' : 'text.disabled',
                }} />
            ))}
        </Stack>
    );
}

function TimeRange({ start, end }: { start?: string | null; end?: string | null }) {
    if (!start && !end)
        return (
            <Stack direction="row" alignItems="center" spacing={0.5}>
                <AllInclusive sx={{ fontSize: 14, color: 'success.main' }} />
                <Typography variant="caption" color="success.main">Cả ngày</Typography>
            </Stack>
        );
    return (
        <Typography variant="caption" color="text.secondary" noWrap>
            {start ?? '—'} – {end ?? '—'}
        </Typography>
    );
}

// ─── Add Schedule Dialog ──────────────────────────────────────────────────────

interface DeviceConflict {
    deviceId: string;
    deviceName: string;
}

function AddScheduleDialog({
    open,
    onClose,
    onAdd,
    existingSiteScheduleIds,
    deviceConflicts,   // scheduleId → devices that already have it
}: {
    open: boolean;
    onClose: () => void;
    onAdd: (scheduleId: string) => void;
    existingSiteScheduleIds: Set<string>;
    deviceConflicts: Map<string, DeviceConflict[]>;
}) {
    const [search, setSearch] = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['schedules', 'all'],
        queryFn: () => schedulesApi.list({ limit: 200 }),
        enabled: open,
    });

    const schedules = useMemo(() => {
        const list: Schedule[] = data?.data ?? [];
        const q = search.toLowerCase().trim();
        return list.filter(s => !q || s.name.toLowerCase().includes(q));
    }, [data, search]);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Thêm Schedule</DialogTitle>
            <DialogContent sx={{ p: 0 }}>
                <Box sx={{ px: 2, pt: 1, pb: 1 }}>
                    <TextField
                        size="small" fullWidth autoFocus placeholder="Tìm schedule…"
                        value={search} onChange={e => setSearch(e.target.value)}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search fontSize="small" />
                                </InputAdornment>
                            ),
                        }}
                    />
                </Box>
                <Divider />
                <List dense sx={{ maxHeight: 380, overflowY: 'auto', py: 0 }}>
                    {isLoading && Array.from({ length: 5 }).map((_, i) => (
                        <Box key={i} sx={{ px: 2, py: 1 }}><Skeleton variant="text" /></Box>
                    ))}
                    {!isLoading && schedules.length === 0 && (
                        <Typography variant="body2" color="text.secondary"
                            sx={{ p: 2, textAlign: 'center' }}>
                            Không có schedule nào
                        </Typography>
                    )}
                    {schedules.map(s => {
                        const alreadySite = existingSiteScheduleIds.has(s.id);
                        const conflicts = deviceConflicts.get(s.id) ?? [];
                        const hasConflict = conflicts.length > 0;

                        return (
                            <ListItemButton
                                key={s.id}
                                disabled={alreadySite}
                                onClick={() => { if (!alreadySite) { onAdd(s.id); onClose(); } }}
                                sx={{ px: 2, alignItems: 'flex-start', py: 1 }}
                            >
                                <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
                                    <CalendarMonth fontSize="small"
                                        color={s.isActive ? 'primary' : 'disabled'} />
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Stack direction="row" alignItems="center" spacing={1}
                                            flexWrap="wrap">
                                            <Typography variant="body2" fontWeight={600} noWrap
                                                sx={{ flex: 1 }}>
                                                {s.name}
                                            </Typography>
                                            {alreadySite && (
                                                <Chip label="Đã assign site" size="small"
                                                    color="success"
                                                    sx={{ fontSize: '0.6rem', height: 18 }} />
                                            )}
                                            {!alreadySite && hasConflict && (
                                                <Tooltip
                                                    title={
                                                        <Box>
                                                            <Typography variant="caption"
                                                                fontWeight={700}>
                                                                Đã assign trực tiếp cho:
                                                            </Typography>
                                                            {conflicts.map(c => (
                                                                <Typography key={c.deviceId}
                                                                    variant="caption"
                                                                    display="block">
                                                                    • {c.deviceName}
                                                                </Typography>
                                                            ))}
                                                            <Typography variant="caption"
                                                                display="block"
                                                                sx={{ mt: 0.5,
                                                                    fontStyle: 'italic' }}>
                                                                Device schedule có độ ưu tiên cao
                                                                hơn site schedule.
                                                            </Typography>
                                                        </Box>
                                                    }
                                                    arrow
                                                >
                                                    <Chip
                                                        icon={<WarningAmber
                                                            sx={{ fontSize: '12px !important' }} />}
                                                        label={`${conflicts.length} device đã có`}
                                                        size="small"
                                                        color="warning"
                                                        variant="outlined"
                                                        sx={{ fontSize: '0.6rem', height: 18 }}
                                                    />
                                                </Tooltip>
                                            )}
                                        </Stack>
                                    }
                                    secondary={
                                        <TimeRange start={s.startTime} end={s.endTime} />
                                    }
                                />
                            </ListItemButton>
                        );
                    })}
                </List>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Đóng</Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Sortable Row ─────────────────────────────────────────────────────────────

function SortableRow({
    assignment,
    index,
    onDelete,
    deleting,
}: {
    assignment: ScheduleAssignment;
    index: number;
    onDelete: (id: string) => void;
    deleting: boolean;
}) {
    const {
        attributes, listeners, setNodeRef, transform, transition, isDragging,
    } = useSortable({ id: assignment.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        background: isDragging ? '#f5f5f5' : undefined,
    };

    return (
        <TableRow ref={setNodeRef} style={style} hover>
            <TableCell sx={{ width: 36, px: 1, cursor: 'grab' }} {...attributes} {...listeners}>
                <DragIndicator fontSize="small"
                    sx={{ color: 'text.disabled', verticalAlign: 'middle' }} />
            </TableCell>
            <TableCell sx={{ width: 52, textAlign: 'center' }}>
                <Chip
                    label={index + 1}
                    size="small"
                    color={index === 0 ? 'error' : index === 1 ? 'warning' : 'default'}
                    sx={{ fontWeight: 700, minWidth: 28 }}
                />
            </TableCell>
            <TableCell>
                <Stack direction="row" spacing={0.75} alignItems="center">
                    <FiberManualRecord sx={{
                        fontSize: 10,
                        color: assignment.scheduleIsActive ? 'success.main' : 'text.disabled',
                    }} />
                    <Typography variant="body2" fontWeight={600} noWrap>
                        {assignment.scheduleName}
                    </Typography>
                </Stack>
            </TableCell>
            <TableCell sx={{ minWidth: 110 }}>
                <TimeRange start={assignment.scheduleStartTime}
                    end={assignment.scheduleEndTime} />
            </TableCell>
            <TableCell sx={{ minWidth: 150 }}>
                <DaysChips days={assignment.scheduleDaysOfWeek} />
            </TableCell>
            <TableCell sx={{ minWidth: 110 }}>
                {(assignment.scheduleStartDate || assignment.scheduleEndDate) ? (
                    <Typography variant="caption" color="text.secondary" noWrap>
                        {assignment.scheduleStartDate
                            ? new Date(assignment.scheduleStartDate)
                                .toLocaleDateString('vi-VN')
                            : '—'}
                        {' – '}
                        {assignment.scheduleEndDate
                            ? new Date(assignment.scheduleEndDate)
                                .toLocaleDateString('vi-VN')
                            : '—'}
                    </Typography>
                ) : (
                    <Typography variant="caption" color="text.disabled">—</Typography>
                )}
            </TableCell>
            <TableCell sx={{ width: 44, px: 0.5 }}>
                <Tooltip title="Xóa">
                    <span>
                        <IconButton size="small" color="error" disabled={deleting}
                            onClick={() => onDelete(assignment.id)}>
                            <Delete fontSize="small" />
                        </IconButton>
                    </span>
                </Tooltip>
            </TableCell>
        </TableRow>
    );
}

// ─── Schedule table header ────────────────────────────────────────────────────

function ScheduleTableHeader({ showDrag = true }: { showDrag?: boolean }) {
    return (
        <TableHead>
            <TableRow>
                {showDrag && <TableCell sx={{ width: 36, px: 1 }} />}
                <TableCell sx={{ width: 52, textAlign: 'center', fontWeight: 700 }}>
                    #
                </TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Schedule</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Giờ phát</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Ngày phát</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Khoảng ngày</TableCell>
                {showDrag && <TableCell sx={{ width: 44 }} />}
            </TableRow>
        </TableHead>
    );
}

// ─── Right panel: schedule list ───────────────────────────────────────────────

function ScheduleListPanel({
    targetType,
    targetId,
    targetName,
}: {
    targetType: 'DEVICE' | 'SITE';
    targetId: string;
    targetName: string;
}) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [addOpen, setAddOpen] = useState(false);
    const [localItems, setLocalItems] = useState<ScheduleAssignment[] | null>(null);
    const [reordering, setReordering] = useState(false);

    const queryKey = ['schedule-assignments', targetType, targetId];

    // Site-level assignments (or device-level if targetType=DEVICE)
    const { data: assignments = [], isLoading } = useQuery({
        queryKey,
        queryFn: () => scheduleAssignmentsApi.list({ targetType, targetId }),
    });

    // Device-level assignments for devices inside this site (only when SITE)
    const devAssignKey = ['schedule-assignments', 'site-devices', targetId];
    const { data: devAssignments = [], isLoading: devAssignLoading } = useQuery({
        queryKey: devAssignKey,
        queryFn: () => scheduleAssignmentsApi.list({ siteId: targetId }),
        enabled: targetType === 'SITE',
    });

    useEffect(() => { setLocalItems(assignments); }, [assignments]);

    const items = localItems ?? assignments;

    // Map: scheduleId → list of devices that already have it (for Add dialog)
    const deviceConflicts = useMemo(() => {
        const map = new Map<string, DeviceConflict[]>();
        for (const a of devAssignments) {
            if (!map.has(a.scheduleId)) map.set(a.scheduleId, []);
            map.get(a.scheduleId)!.push({
                deviceId: a.targetId,
                deviceName: a.targetName ?? a.targetId,
            });
        }
        return map;
    }, [devAssignments]);

    // Group device assignments by device (for display)
    const deviceGroups = useMemo(() => {
        const groups = new Map<string, { deviceName: string; rows: ScheduleAssignment[] }>();
        for (const a of devAssignments) {
            if (!groups.has(a.targetId))
                groups.set(a.targetId, { deviceName: a.targetName ?? a.targetId, rows: [] });
            groups.get(a.targetId)!.rows.push(a);
        }
        return [...groups.values()];
    }, [devAssignments]);

    const existingSiteScheduleIds = useMemo(
        () => new Set(items.map(a => a.scheduleId)),
        [items],
    );

    const assignMutation = useMutation({
        mutationFn: (scheduleId: string) =>
            scheduleAssignmentsApi.bulkAssign(scheduleId, [{ targetType, targetId }]),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey });
            dispatch(pushToast({ message: 'Đã thêm schedule', severity: 'success' }));
        },
        onError: () => dispatch(pushToast({ message: 'Thêm schedule thất bại', severity: 'error' })),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => scheduleAssignmentsApi.unassignOne(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey });
            dispatch(pushToast({ message: 'Đã xóa schedule', severity: 'success' }));
        },
        onError: () => dispatch(pushToast({ message: 'Xóa thất bại', severity: 'error' })),
    });

    const reorderMutation = useMutation({
        mutationFn: (orderedIds: string[]) =>
            scheduleAssignmentsApi.reorder(targetType, targetId, orderedIds),
        onSettled: () => {
            setReordering(false);
            qc.invalidateQueries({ queryKey });
        },
        onError: () =>
            dispatch(pushToast({ message: 'Lưu thứ tự thất bại', severity: 'error' })),
    });

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIdx = items.findIndex(a => a.id === active.id);
        const newIdx = items.findIndex(a => a.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(items, oldIdx, newIdx);
        setLocalItems(reordered);
        setReordering(true);
        reorderMutation.mutate(reordered.map(a => a.id));
    }

    const isSite = targetType === 'SITE';

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <Box sx={{
                px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1,
                borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0,
            }}>
                {isSite
                    ? <Storefront fontSize="small" color="secondary" />
                    : <DevicesOther fontSize="small" color="primary" />
                }
                <Typography variant="subtitle1" fontWeight={700} sx={{ flex: 1 }} noWrap>
                    {targetName}
                </Typography>
                <Chip
                    label={isSite ? 'Site' : 'Device'}
                    size="small"
                    color={isSite ? 'secondary' : 'primary'}
                    variant="outlined"
                />
                <Button
                    variant="contained" size="small" startIcon={<Add />}
                    onClick={() => setAddOpen(true)}
                    disabled={assignMutation.isPending}
                >
                    Thêm Schedule
                </Button>
            </Box>

            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {/* ── Site Schedules section ─────────────────────────────── */}
                <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography variant="caption" fontWeight={700}
                            color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                            {isSite ? 'Site Schedules' : 'Schedules'}
                        </Typography>
                        {isSite && (
                            <Tooltip title="Schedule gán cho site áp dụng cho tất cả devices trong site. Độ ưu tiên thấp hơn schedule gán trực tiếp cho device.">
                                <InfoOutlined sx={{ fontSize: 14, color: 'text.disabled' }} />
                            </Tooltip>
                        )}
                        {items.length > 0 && (
                            <Chip label={items.length} size="small"
                                sx={{ height: 18, fontSize: '0.65rem' }} />
                        )}
                    </Stack>
                </Box>

                {isLoading ? (
                    <Box sx={{ px: 2 }}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Skeleton key={i} variant="rectangular" height={40}
                                sx={{ mb: 1, borderRadius: 1 }} />
                        ))}
                    </Box>
                ) : items.length === 0 ? (
                    <Stack alignItems="center" spacing={1}
                        sx={{ py: 4, color: 'text.disabled' }}>
                        <CalendarMonth sx={{ fontSize: 40 }} />
                        <Typography variant="body2">Chưa có schedule nào</Typography>
                        <Button variant="outlined" size="small" startIcon={<Add />}
                            onClick={() => setAddOpen(true)}>
                            Thêm Schedule
                        </Button>
                    </Stack>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={items.map(a => a.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <Table size="small" stickyHeader>
                                <ScheduleTableHeader />
                                <TableBody>
                                    {items.map((a, i) => (
                                        <SortableRow
                                            key={a.id}
                                            assignment={a}
                                            index={i}
                                            onDelete={id => deleteMutation.mutate(id)}
                                            deleting={deleteMutation.isPending}
                                        />
                                    ))}
                                </TableBody>
                            </Table>
                        </SortableContext>
                    </DndContext>
                )}

                {/* ── Device Override section (site only) ───────────────── */}
                {isSite && (
                    <Box sx={{ px: 2, pt: 2, pb: 1 }}>
                        <Divider sx={{ mb: 1.5 }} />
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                            <DevicesOther fontSize="small" sx={{ color: 'text.secondary' }} />
                            <Typography variant="caption" fontWeight={700}
                                color="text.secondary"
                                sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
                                Device Schedules
                            </Typography>
                            <Tooltip title="Schedule gán trực tiếp cho device có độ ưu tiên CAO HƠN site schedules trong cùng khung giờ.">
                                <InfoOutlined sx={{ fontSize: 14, color: 'text.disabled' }} />
                            </Tooltip>
                        </Stack>

                        {devAssignLoading ? (
                            Array.from({ length: 2 }).map((_, i) => (
                                <Skeleton key={i} variant="rectangular" height={36}
                                    sx={{ mb: 1, borderRadius: 1 }} />
                            ))
                        ) : deviceGroups.length === 0 ? (
                            <Typography variant="caption" color="text.disabled"
                                sx={{ display: 'block', py: 1 }}>
                                Không có device nào trong site này được assign schedule trực tiếp
                            </Typography>
                        ) : (
                            deviceGroups.map(group => (
                                <Accordion
                                    key={group.deviceName}
                                    disableGutters
                                    elevation={0}
                                    sx={{
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: '6px !important',
                                        mb: 1,
                                        '&:before': { display: 'none' },
                                    }}
                                >
                                    <AccordionSummary
                                        expandIcon={<ExpandMore fontSize="small" />}
                                        sx={{ minHeight: 40, px: 1.5, py: 0,
                                            '& .MuiAccordionSummary-content': { my: 0.5 } }}
                                    >
                                        <Stack direction="row" alignItems="center" spacing={1}>
                                            <DevicesOther fontSize="small" color="primary" />
                                            <Typography variant="body2" fontWeight={600}>
                                                {group.deviceName}
                                            </Typography>
                                            <Chip
                                                label={`${group.rows.length} schedule`}
                                                size="small"
                                                color="primary"
                                                variant="outlined"
                                                sx={{ height: 18, fontSize: '0.6rem' }}
                                            />
                                        </Stack>
                                    </AccordionSummary>
                                    <AccordionDetails sx={{ p: 0 }}>
                                        <Table size="small">
                                            <ScheduleTableHeader showDrag={false} />
                                            <TableBody>
                                                {group.rows.map((a, i) => (
                                                    <TableRow key={a.id} hover>
                                                        <TableCell sx={{ width: 52, textAlign: 'center' }}>
                                                            <Chip
                                                                label={i + 1}
                                                                size="small"
                                                                color={i === 0 ? 'error' : i === 1 ? 'warning' : 'default'}
                                                                sx={{ fontWeight: 700, minWidth: 28 }}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Stack direction="row" spacing={0.75}
                                                                alignItems="center">
                                                                <FiberManualRecord sx={{
                                                                    fontSize: 10,
                                                                    color: a.scheduleIsActive
                                                                        ? 'success.main'
                                                                        : 'text.disabled',
                                                                }} />
                                                                <Typography variant="body2"
                                                                    fontWeight={600} noWrap>
                                                                    {a.scheduleName}
                                                                </Typography>
                                                            </Stack>
                                                        </TableCell>
                                                        <TableCell>
                                                            <TimeRange
                                                                start={a.scheduleStartTime}
                                                                end={a.scheduleEndTime}
                                                            />
                                                        </TableCell>
                                                        <TableCell>
                                                            <DaysChips days={a.scheduleDaysOfWeek} />
                                                        </TableCell>
                                                        <TableCell>
                                                            {a.scheduleStartDate || a.scheduleEndDate ? (
                                                                <Typography variant="caption"
                                                                    color="text.secondary" noWrap>
                                                                    {a.scheduleStartDate
                                                                        ? new Date(a.scheduleStartDate)
                                                                            .toLocaleDateString('vi-VN')
                                                                        : '—'}
                                                                    {' – '}
                                                                    {a.scheduleEndDate
                                                                        ? new Date(a.scheduleEndDate)
                                                                            .toLocaleDateString('vi-VN')
                                                                        : '—'}
                                                                </Typography>
                                                            ) : (
                                                                <Typography variant="caption"
                                                                    color="text.disabled">—</Typography>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </AccordionDetails>
                                </Accordion>
                            ))
                        )}
                    </Box>
                )}
            </Box>

            {reordering && (
                <Box sx={{
                    px: 2, py: 0.5, borderTop: '1px solid', borderColor: 'divider',
                    flexShrink: 0,
                }}>
                    <Typography variant="caption" color="text.secondary">
                        Đang lưu thứ tự…
                    </Typography>
                </Box>
            )}

            <AddScheduleDialog
                open={addOpen}
                onClose={() => setAddOpen(false)}
                onAdd={scheduleId => assignMutation.mutate(scheduleId)}
                existingSiteScheduleIds={existingSiteScheduleIds}
                deviceConflicts={isSite ? deviceConflicts : new Map()}
            />
        </Box>
    );
}

// ─── Left panel: device / site list ──────────────────────────────────────────

type TabType = 'devices' | 'sites';

interface TargetInfo {
    id: string;
    name: string;
    type: 'DEVICE' | 'SITE';
}

function TargetListPanel({
    selected,
    onSelect,
}: {
    selected: TargetInfo | null;
    onSelect: (t: TargetInfo) => void;
}) {
    const [tab, setTab] = useState<TabType>('devices');
    const [search, setSearch] = useState('');

    const { data: devicesData, isLoading: devLoading } = useQuery({
        queryKey: ['devices', 'all-for-assign'],
        queryFn: () => devicesApi.list({ limit: 500 }),
    });

    const { data: sitesData, isLoading: siteLoading } = useQuery({
        queryKey: ['sites', 'all-for-assign'],
        queryFn: () => sitesApi.list({ limit: 500 }),
    });

    const devices: Device[] = useMemo(() => {
        const list = devicesData?.data ?? [];
        const q = search.toLowerCase().trim();
        if (!q) return list;
        return list.filter(d =>
            d.name.toLowerCase().includes(q) || d.siteName?.toLowerCase().includes(q));
    }, [devicesData, search]);

    const sites: Site[] = useMemo(() => {
        const list = sitesData?.data ?? [];
        const q = search.toLowerCase().trim();
        if (!q) return list;
        return list.filter(s => s.name.toLowerCase().includes(q));
    }, [sitesData, search]);

    const isLoading = tab === 'devices' ? devLoading : siteLoading;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Box sx={{ px: 1.5, pt: 1.5 }}>
                <Tabs
                    value={tab}
                    onChange={(_, v) => { setTab(v); setSearch(''); }}
                    sx={{ minHeight: 36, mb: 1 }}
                    variant="fullWidth"
                >
                    <Tab value="devices" label="Devices"
                        icon={<DevicesOther fontSize="small" />} iconPosition="start"
                        sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }}
                    />
                    <Tab value="sites" label="Sites"
                        icon={<Storefront fontSize="small" />} iconPosition="start"
                        sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }}
                    />
                </Tabs>
                <TextField
                    size="small" fullWidth
                    placeholder={`Tìm ${tab === 'devices' ? 'device' : 'site'}…`}
                    value={search} onChange={e => setSearch(e.target.value)}
                    sx={{ mb: 1 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search fontSize="small" />
                            </InputAdornment>
                        ),
                    }}
                />
            </Box>
            <Divider />
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {isLoading
                    ? Array.from({ length: 8 }).map((_, i) => (
                        <Box key={i} sx={{ px: 2, py: 1 }}>
                            <Skeleton variant="text" width="75%" />
                            <Skeleton variant="text" width="45%" />
                        </Box>
                    ))
                    : tab === 'devices'
                        ? devices.length === 0
                            ? <Typography variant="body2" color="text.secondary"
                                sx={{ p: 2, textAlign: 'center' }}>
                                Không có device
                            </Typography>
                            : devices.map(d => (
                                <ListItemButton
                                    key={d.id}
                                    selected={selected?.id === d.id && selected?.type === 'DEVICE'}
                                    onClick={() => onSelect({ id: d.id, name: d.name, type: 'DEVICE' })}
                                    sx={{ px: 2, py: 0.75 }}
                                >
                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                        <DevicesOther fontSize="small"
                                            color={d.status === 'ONLINE' ? 'success' : 'disabled'} />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Typography variant="body2" fontWeight={600} noWrap>
                                                {d.name}
                                            </Typography>
                                        }
                                        secondary={
                                            <Typography variant="caption" color="text.secondary"
                                                noWrap>
                                                {d.siteName ?? 'Chưa thuộc site'}
                                            </Typography>
                                        }
                                    />
                                </ListItemButton>
                            ))
                        : sites.length === 0
                            ? <Typography variant="body2" color="text.secondary"
                                sx={{ p: 2, textAlign: 'center' }}>
                                Không có site
                            </Typography>
                            : sites.map(s => (
                                <ListItemButton
                                    key={s.id}
                                    selected={selected?.id === s.id && selected?.type === 'SITE'}
                                    onClick={() => onSelect({ id: s.id, name: s.name, type: 'SITE' })}
                                    sx={{ px: 2, py: 0.75 }}
                                >
                                    <ListItemIcon sx={{ minWidth: 32 }}>
                                        <Storefront fontSize="small" color="secondary" />
                                    </ListItemIcon>
                                    <ListItemText
                                        primary={
                                            <Typography variant="body2" fontWeight={600} noWrap>
                                                {s.name}
                                            </Typography>
                                        }
                                        secondary={
                                            <Typography variant="caption" color="text.secondary">
                                                {s.deviceCount ?? 0} device(s)
                                            </Typography>
                                        }
                                    />
                                </ListItemButton>
                            ))
                }
            </Box>
        </Box>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScheduleAssignmentPage() {
    const [selected, setSelected] = useState<TargetInfo | null>(null);

    return (
        <Box sx={{
            height: 'calc(100vh - 64px)',
            display: 'flex', flexDirection: 'column', p: 2, gap: 2,
        }}>
            <Stack direction="row" alignItems="center" spacing={1}>
                <CalendarMonth color="primary" />
                <Typography variant="h6" fontWeight={700}>Schedule Assignment</Typography>
            </Stack>

            <Box sx={{ flex: 1, display: 'flex', gap: 2, minHeight: 0 }}>
                {/* Left — device / site list */}
                <Paper variant="outlined" sx={{
                    width: 280, flexShrink: 0,
                    display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                    <TargetListPanel selected={selected} onSelect={setSelected} />
                </Paper>

                {/* Right — schedule list for selected target */}
                <Paper variant="outlined" sx={{
                    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
                }}>
                    {selected ? (
                        <ScheduleListPanel
                            key={`${selected.type}:${selected.id}`}
                            targetType={selected.type}
                            targetId={selected.id}
                            targetName={selected.name}
                        />
                    ) : (
                        <Stack alignItems="center" justifyContent="center" spacing={1.5}
                            sx={{ height: '100%', color: 'text.disabled' }}>
                            <CalendarMonth sx={{ fontSize: 56 }} />
                            <Typography variant="body1">Chọn một Device hoặc Site</Typography>
                            <Typography variant="body2" color="text.disabled">
                                để xem và quản lý schedule assignment
                            </Typography>
                        </Stack>
                    )}
                </Paper>
            </Box>
        </Box>
    );
}
