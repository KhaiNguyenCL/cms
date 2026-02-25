import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Card, CardContent, Stack, Button, TextField,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, InputAdornment, Pagination, Avatar, Skeleton,
    Menu, MenuItem, Tabs, Tab, Grid, Divider, List, ListItem,
    ListItemAvatar, ListItemText, Select, FormControl, InputLabel,
} from '@mui/material';
import {
    Add, Search, MoreVert, Tv, CheckCircle, ErrorOutline,
    PowerSettingsNew, Refresh, Screenshot, Groups, Delete,
    Edit, PersonAdd, Circle,
} from '@mui/icons-material';
import { devicesApi } from '@api/devices.api';
import { deviceGroupsApi, type DeviceGroup, type DeviceGroupDetail } from '@api/device-groups.api';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Device } from '@/types';

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

function DeviceActions({ device, onAssignGroup }: { device: Device; onAssignGroup: (d: Device) => void }) {
    const dispatch = useAppDispatch();
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);

    const sendCmd = async (command: string) => {
        setAnchor(null);
        try {
            await devicesApi.sendCommand(device.id, command);
            dispatch(pushToast({ severity: 'success', message: `"${command}" sent to ${device.name}` }));
        } catch {
            dispatch(pushToast({ severity: 'error', message: 'Failed to send command' }));
        }
    };

    return (
        <>
            <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
                <MoreVert fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                <MenuItem onClick={() => { onAssignGroup(device); setAnchor(null); }}>
                    <Groups sx={{ mr: 1, fontSize: 18 }} /> Assign to Group
                </MenuItem>
                <Divider />
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
            </Menu>
        </>
    );
}

// ── Assign to Group dialog ────────────────────────────────────────────────────

function AssignGroupDialog({
    device,
    open,
    onClose,
}: { device: Device | null; open: boolean; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [selectedGroupId, setSelectedGroupId] = useState('');

    const { data: groups = [] } = useQuery({
        queryKey: ['device-groups-all'],
        queryFn: () => deviceGroupsApi.listAll(),
        enabled: open,
    });

    const addMutation = useMutation({
        mutationFn: () => deviceGroupsApi.addDevice(selectedGroupId, device!.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['device-groups'] });
            qc.invalidateQueries({ queryKey: ['devices'] });
            dispatch(pushToast({ severity: 'success', message: `${device!.name} added to group` }));
            setSelectedGroupId('');
            onClose();
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Failed to assign group' })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Assign "{device?.name}" to Group</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <FormControl fullWidth size="small">
                    <InputLabel>Select group</InputLabel>
                    <Select
                        value={selectedGroupId}
                        label="Select group"
                        onChange={(e) => setSelectedGroupId(e.target.value)}
                    >
                        {groups.map(g => (
                            <MenuItem key={g.id} value={g.id}>
                                <Stack direction="row" justifyContent="space-between" width="100%">
                                    <span>{g.name}</span>
                                    <Chip label={`${g.deviceCount} devices`} size="small" sx={{ ml: 1 }} />
                                </Stack>
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={!selectedGroupId || addMutation.isPending}
                    onClick={() => addMutation.mutate()}
                >
                    Assign
                </Button>
            </DialogActions>
        </Dialog>
    );
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

// ── Devices tab ───────────────────────────────────────────────────────────────

function DevicesTab({ onAddDevice }: { onAddDevice: () => void }) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [assignDevice, setAssignDevice] = useState<Device | null>(null);
    const LIMIT = 10;

    const { data, isLoading } = useQuery({
        queryKey: ['devices', page, search],
        queryFn: () => devicesApi.list({ page, limit: LIMIT, search: search || undefined }),
        refetchInterval: 15_000,
    });

    // Load all groups for group tag display
    const { data: allGroups = [] } = useQuery({
        queryKey: ['device-groups-all'],
        queryFn: () => deviceGroupsApi.listAll(),
    });

    // Build a map of deviceId → group names by fetching all group details
    // (lightweight: just use group list with device members)
    const { data: groupDetails } = useQuery({
        queryKey: ['device-group-details-map'],
        queryFn: async () => {
            if (!allGroups.length) return {};
            const details = await Promise.all(allGroups.map(g => deviceGroupsApi.get(g.id)));
            const map: Record<string, string[]> = {};
            for (const g of details) {
                for (const d of g.devices) {
                    if (!map[d.id]) map[d.id] = [];
                    map[d.id].push(g.name);
                }
            }
            return map;
        },
        enabled: allGroups.length > 0,
    });

    const groupMap: Record<string, string[]> = groupDetails ?? {};

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
                                <TableCell sx={{ fontWeight: 700 }}>Group(s)</TableCell>
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

                                        {/* Groups */}
                                        <TableCell>
                                            <Stack direction="row" gap={0.5} flexWrap="wrap">
                                                {(groupMap[device.id] ?? []).length > 0
                                                    ? (groupMap[device.id]).map(gName => (
                                                        <Chip
                                                            key={gName}
                                                            label={gName}
                                                            size="small"
                                                            icon={<Groups sx={{ fontSize: 14 }} />}
                                                            color="secondary"
                                                            sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                                                        />
                                                    ))
                                                    : <Typography variant="caption" color="text.disabled">—</Typography>
                                                }
                                            </Stack>
                                        </TableCell>

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
                                            <DeviceActions device={device} onAssignGroup={setAssignDevice} />
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

            <AssignGroupDialog device={assignDevice} open={Boolean(assignDevice)} onClose={() => setAssignDevice(null)} />
        </Card>
    );
}

// ── Group detail dialog ───────────────────────────────────────────────────────

function GroupDetailDialog({
    groupId,
    open,
    onClose,
}: { groupId: string; open: boolean; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();

    const { data, isLoading, refetch } = useQuery({
        queryKey: ['device-group', groupId],
        queryFn: () => deviceGroupsApi.get(groupId),
        enabled: open,
    });

    const removeMutation = useMutation({
        mutationFn: (deviceId: string) => deviceGroupsApi.removeDevice(groupId, deviceId),
        onSuccess: () => {
            refetch();
            qc.invalidateQueries({ queryKey: ['device-groups'] });
            qc.invalidateQueries({ queryKey: ['device-group-details-map'] });
            dispatch(pushToast({ severity: 'success', message: 'Device removed from group' }));
        },
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                <Stack direction="row" gap={1} alignItems="center">
                    <Groups color="secondary" />
                    <Box>
                        {isLoading ? <Skeleton width={140} /> : <Typography variant="h6" fontWeight={700}>{data?.name}</Typography>}
                        <Typography variant="caption" color="text.secondary">{data?.deviceCount ?? 0} devices</Typography>
                    </Box>
                </Stack>
            </DialogTitle>
            <DialogContent dividers sx={{ p: 0, minHeight: 150 }}>
                {isLoading
                    ? <Box p={2}>{[1, 2, 3].map(i => <Skeleton key={i} height={52} sx={{ mb: 1 }} />)}</Box>
                    : !data?.devices.length
                        ? (
                            <Box textAlign="center" py={4}>
                                <Tv sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
                                <Typography variant="body2" color="text.secondary">No devices in this group</Typography>
                            </Box>
                        )
                        : (
                            <List disablePadding>
                                {data.devices.map((d, idx) => (
                                    <Box key={d.id}>
                                        <ListItem
                                            secondaryAction={
                                                <Tooltip title="Remove from group">
                                                    <IconButton edge="end" size="small" color="error"
                                                        onClick={() => removeMutation.mutate(d.id)}>
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            }
                                        >
                                            <ListItemAvatar>
                                                <Avatar sx={{ width: 36, height: 36, bgcolor: d.status === 'ONLINE' ? 'success.main' : 'grey.700' }}>
                                                    <Tv sx={{ fontSize: 18 }} />
                                                </Avatar>
                                            </ListItemAvatar>
                                            <ListItemText
                                                secondaryTypographyProps={{ component: 'div' }}
                                                primary={<Typography variant="body2" fontWeight={600}>{d.name}</Typography>}
                                                secondary={
                                                    <Stack direction="row" gap={1} alignItems="center">
                                                        <StatusChip status={d.status as Device['status']} />
                                                        {d.location && <Typography variant="caption" color="text.secondary">{d.location}</Typography>}
                                                    </Stack>
                                                }
                                            />
                                        </ListItem>
                                        {idx < data.devices.length - 1 && <Divider component="li" />}
                                    </Box>
                                ))}
                            </List>
                        )}
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Groups tab ────────────────────────────────────────────────────────────────

function CreateGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const mutation = useMutation({
        mutationFn: () => deviceGroupsApi.create({ name, description: description || null }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['device-groups'] });
            dispatch(pushToast({ severity: 'success', message: `Group "${name}" created` }));
            setName(''); setDescription('');
            onClose();
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Failed to create group' })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>New Device Group</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Stack spacing={2.5} sx={{ mt: 0.5 }}>
                    <TextField label="Group Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
                    <TextField label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>Create</Button>
            </DialogActions>
        </Dialog>
    );
}

function GroupsTab() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [createOpen, setCreateOpen] = useState(false);
    const [detailGroupId, setDetailGroupId] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['device-groups', page, search],
        queryFn: () => deviceGroupsApi.list({ page, limit: 12, search: search || undefined }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => deviceGroupsApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['device-groups'] });
            qc.invalidateQueries({ queryKey: ['device-groups-all'] });
            qc.invalidateQueries({ queryKey: ['device-group-details-map'] });
            dispatch(pushToast({ severity: 'success', message: 'Group deleted' }));
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Delete failed' })),
    });

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                <TextField
                    placeholder="Search groups..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    size="small" sx={{ width: 240 }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
                />
                <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>New Group</Button>
            </Stack>

            <Grid container spacing={2}>
                {isLoading
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                            <Skeleton variant="rounded" height={140} />
                        </Grid>
                    ))
                    : (data?.data ?? []).map(g => (
                        <Grid key={g.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                            <Card
                                sx={{
                                    cursor: 'pointer',
                                    transition: 'transform 0.15s, box-shadow 0.15s',
                                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
                                }}
                                onClick={() => setDetailGroupId(g.id)}
                            >
                                <CardContent>
                                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                                        <Box
                                            sx={{
                                                width: 44, height: 44, borderRadius: 3,
                                                background: 'linear-gradient(135deg, #9C27B022, #E91E6322)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1.5,
                                            }}
                                        >
                                            <Groups sx={{ color: 'secondary.main', fontSize: 22 }} />
                                        </Box>
                                        <Tooltip title="Delete group">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (window.confirm(`Delete group "${g.name}"?`)) deleteMutation.mutate(g.id);
                                                }}
                                            >
                                                <Delete fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>

                                    <Typography variant="h6" fontWeight={700} noWrap>{g.name}</Typography>
                                    {g.description && (
                                        <Typography variant="caption" color="text.secondary" display="block" noWrap>{g.description}</Typography>
                                    )}
                                    <Box mt={1.5}>
                                        <Chip
                                            icon={<Tv sx={{ fontSize: 14 }} />}
                                            label={`${g.deviceCount} device${g.deviceCount !== 1 ? 's' : ''}`}
                                            size="small"
                                            color="secondary"
                                            variant="outlined"
                                            sx={{ fontWeight: 600 }}
                                        />
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>
                    ))}
            </Grid>

            {!isLoading && !data?.data.length && (
                <Box textAlign="center" py={8}>
                    <Groups sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>No groups yet</Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Groups let you target multiple devices in a schedule at once.
                    </Typography>
                    <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>Create First Group</Button>
                </Box>
            )}

            {data && data.totalPages > 1 && (
                <Box mt={2} display="flex" justifyContent="center">
                    <Pagination count={data.totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" size="small" />
                </Box>
            )}

            <CreateGroupDialog open={createOpen} onClose={() => setCreateOpen(false)} />

            {detailGroupId && (
                <GroupDetailDialog
                    groupId={detailGroupId}
                    open={Boolean(detailGroupId)}
                    onClose={() => setDetailGroupId(null)}
                />
            )}
        </Box>
    );
}

// ── Main DevicesPage ─────────────────────────────────────────────────────────

export default function DevicesPage() {
    const [tab, setTab] = useState(0);
    const [createOpen, setCreateOpen] = useState(false);

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Devices</Typography>
                    <Typography variant="body2" color="text.secondary">Manage your display network</Typography>
                </Box>
                {tab === 0 && (
                    <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                        Add Device
                    </Button>
                )}
            </Stack>

            {/* Tabs */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                    <Tab label="Devices" icon={<Tv sx={{ fontSize: 18 }} />} iconPosition="start" />
                    <Tab label="Groups" icon={<Groups sx={{ fontSize: 18 }} />} iconPosition="start" />
                </Tabs>
            </Box>

            {tab === 0 && <DevicesTab onAddDevice={() => setCreateOpen(true)} />}
            {tab === 1 && <GroupsTab />}

            <CreateDeviceDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </Box>
    );
}
