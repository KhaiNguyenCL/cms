import { useState } from 'react';
import {
    Box, Typography, Button, TextField, Table, TableHead, TableBody,
    TableRow, TableCell, TableContainer, Paper, IconButton, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress,
    Alert, Tooltip, Autocomplete, InputAdornment,
} from '@mui/material';
import { Add, Edit, Search, Storefront, Close, PersonAdd } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storesApi } from '@/api/sync-groups.api';
import { devicesApi } from '@/api/devices.api';
import type { Store, StoreDevice, Device } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
    if (!d) return '—';
    return new Intl.DateTimeFormat('vi-VN').format(new Date(d));
}

function shortId(id: string) {
    return id.slice(0, 8).toUpperCase();
}

// ─── Add Store Dialog ─────────────────────────────────────────────────────────

interface AddStoreDialogProps {
    open: boolean;
    onClose: () => void;
}

function AddStoreDialog({ open, onClose }: AddStoreDialogProps) {
    const qc = useQueryClient();
    const [form, setForm] = useState({ name: '', address: '', contact: '', openDate: '', closeDate: '' });

    const createMutation = useMutation({
        mutationFn: () => storesApi.create({
            name: form.name.trim(),
            address:   form.address.trim()   || undefined,
            contact:   form.contact.trim()   || undefined,
            openDate:  form.openDate         || undefined,
            closeDate: form.closeDate        || undefined,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['stores'] });
            setForm({ name: '', address: '', contact: '', openDate: '', closeDate: '' });
            onClose();
        },
    });

    const handleClose = () => {
        setForm({ name: '', address: '', contact: '', openDate: '', closeDate: '' });
        createMutation.reset();
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Add Store</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                    <TextField
                        label="Store Name *"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        fullWidth
                        autoFocus
                    />
                    <TextField
                        label="Address"
                        value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                        fullWidth
                    />
                    <TextField
                        label="Contact"
                        value={form.contact}
                        onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                        fullWidth
                    />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Open Date"
                            type="date"
                            value={form.openDate}
                            onChange={e => setForm(f => ({ ...f, openDate: e.target.value }))}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            label="Close Date"
                            type="date"
                            value={form.closeDate}
                            onChange={e => setForm(f => ({ ...f, closeDate: e.target.value }))}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                    </Box>
                    {createMutation.isError && (
                        <Alert severity="error">Failed to create store. Please try again.</Alert>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={() => createMutation.mutate()}
                    disabled={!form.name.trim() || createMutation.isPending}
                    startIcon={createMutation.isPending ? <CircularProgress size={16} /> : undefined}
                >
                    Create
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Edit Store Dialog ────────────────────────────────────────────────────────

interface EditStoreDialogProps {
    store: Store;
    open: boolean;
    onClose: () => void;
}

function EditStoreDialog({ store, open, onClose }: EditStoreDialogProps) {
    const qc = useQueryClient();
    const [form, setForm] = useState({
        name:      store.name,
        address:   store.address   ?? '',
        contact:   store.contact   ?? '',
        openDate:  store.openDate  ? store.openDate.slice(0, 10)  : '',
        closeDate: store.closeDate ? store.closeDate.slice(0, 10) : '',
    });
    const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);

    // Store detail (includes devices list)
    const { data: storeDetail } = useQuery({
        queryKey: ['stores', store.id],
        queryFn:  () => storesApi.get(store.id),
        enabled:  open,
    });

    // All devices in org for the autocomplete
    const { data: allDevicesData } = useQuery({
        queryKey: ['devices', 'all'],
        queryFn:  () => devicesApi.list({ limit: 200 }),
        enabled:  open,
    });

    const assignedIds = new Set((storeDetail?.devices ?? []).map(d => d.id));
    const availableDevices = (allDevicesData?.data ?? []).filter((d: Device) => !assignedIds.has(d.id));

    const updateMutation = useMutation({
        mutationFn: () => storesApi.update(store.id, {
            name:      form.name.trim(),
            address:   form.address.trim()   || null,
            contact:   form.contact.trim()   || null,
            openDate:  form.openDate         || null,
            closeDate: form.closeDate        || null,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['stores'] });
            onClose();
        },
    });

    const addDeviceMutation = useMutation({
        mutationFn: (deviceId: string) => storesApi.updateDevices(store.id, { add: [deviceId] }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['stores', store.id] });
            qc.invalidateQueries({ queryKey: ['stores'] });
            setSelectedDevice(null);
        },
    });

    const removeDeviceMutation = useMutation({
        mutationFn: (deviceId: string) => storesApi.updateDevices(store.id, { remove: [deviceId] }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['stores', store.id] });
            qc.invalidateQueries({ queryKey: ['stores'] });
        },
    });

    const devices: StoreDevice[] = storeDetail?.devices ?? [];

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Edit Store — {store.name}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>

                    {/* ── General info ── */}
                    <Typography variant="subtitle2" color="text.secondary">General Info</Typography>
                    <TextField
                        label="Store Name *"
                        value={form.name}
                        onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                        fullWidth
                    />
                    <TextField
                        label="Address"
                        value={form.address}
                        onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                        fullWidth
                    />
                    <TextField
                        label="Contact"
                        value={form.contact}
                        onChange={e => setForm(f => ({ ...f, contact: e.target.value }))}
                        fullWidth
                    />
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <TextField
                            label="Open Date"
                            type="date"
                            value={form.openDate}
                            onChange={e => setForm(f => ({ ...f, openDate: e.target.value }))}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            label="Close Date"
                            type="date"
                            value={form.closeDate}
                            onChange={e => setForm(f => ({ ...f, closeDate: e.target.value }))}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                    </Box>

                    {/* ── Devices section ── */}
                    <Box sx={{ mt: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                            Devices ({devices.length})
                        </Typography>

                        {/* Add device row */}
                        <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                            <Autocomplete<Device>
                                options={availableDevices}
                                getOptionLabel={d => `${d.name}${d.location ? ` — ${d.location}` : ''}`}
                                value={selectedDevice}
                                onChange={(_, v) => setSelectedDevice(v)}
                                isOptionEqualToValue={(o, v) => o.id === v.id}
                                renderInput={params => (
                                    <TextField {...params} label="Add device to store" size="small" />
                                )}
                                size="small"
                                sx={{ flex: 1 }}
                                noOptionsText="No unassigned devices"
                            />
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={addDeviceMutation.isPending ? <CircularProgress size={14} /> : <PersonAdd />}
                                disabled={!selectedDevice || addDeviceMutation.isPending}
                                onClick={() => selectedDevice && addDeviceMutation.mutate(selectedDevice.id)}
                                sx={{ whiteSpace: 'nowrap' }}
                            >
                                Add
                            </Button>
                        </Box>

                        {/* Assigned devices list */}
                        <Paper variant="outlined" sx={{ maxHeight: 220, overflowY: 'auto' }}>
                            {devices.length === 0 ? (
                                <Box sx={{ p: 2, textAlign: 'center' }}>
                                    <Typography variant="body2" color="text.secondary">
                                        No devices assigned to this store
                                    </Typography>
                                </Box>
                            ) : (
                                devices.map((d: StoreDevice) => (
                                    <Box
                                        key={d.id}
                                        sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            px: 2, py: 1,
                                            borderBottom: '1px solid',
                                            borderColor: 'divider',
                                            '&:last-child': { borderBottom: 0 },
                                        }}
                                    >
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2" fontWeight={500}>{d.name}</Typography>
                                            {d.location && (
                                                <Typography variant="caption" color="text.secondary">{d.location}</Typography>
                                            )}
                                        </Box>
                                        <Chip
                                            label={d.status}
                                            size="small"
                                            color={d.status === 'ONLINE' ? 'success' : 'default'}
                                            sx={{ mr: 1 }}
                                        />
                                        <Tooltip title="Remove from store">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => removeDeviceMutation.mutate(d.id)}
                                                disabled={removeDeviceMutation.isPending}
                                            >
                                                <Close fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                ))
                            )}
                        </Paper>
                    </Box>

                    {updateMutation.isError && (
                        <Alert severity="error">Failed to update store. Please try again.</Alert>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    onClick={() => updateMutation.mutate()}
                    disabled={!form.name.trim() || updateMutation.isPending}
                    startIcon={updateMutation.isPending ? <CircularProgress size={16} /> : undefined}
                >
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StoreManagementPage() {
    const [search, setSearch] = useState('');
    const [addOpen, setAddOpen] = useState(false);
    const [editStore, setEditStore] = useState<Store | null>(null);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['stores', { search }],
        queryFn:  () => storesApi.list({ page: 1, limit: 100, search: search || undefined }),
    });

    const stores: Store[] = data?.data ?? [];

    return (
        <Box sx={{ p: 3 }}>
            {/* ── Header ── */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Storefront color="primary" />
                    <Typography variant="h5" fontWeight={700}>Store Management</Typography>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>
                    Add Store
                </Button>
            </Box>

            {/* ── Search ── */}
            <TextField
                placeholder="Search stores..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                size="small"
                sx={{ mb: 2, width: 320 }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <Search fontSize="small" />
                        </InputAdornment>
                    ),
                }}
            />

            {/* ── Table ── */}
            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress />
                </Box>
            ) : isError ? (
                <Alert severity="error">Failed to load stores</Alert>
            ) : (
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { fontWeight: 700, whiteSpace: 'nowrap' } }}>
                                <TableCell>Store Name</TableCell>
                                <TableCell>Code</TableCell>
                                <TableCell>Address</TableCell>
                                <TableCell>Contact</TableCell>
                                <TableCell>Open Date</TableCell>
                                <TableCell>Close Date</TableCell>
                                <TableCell>Devices</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {stores.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} align="center" sx={{ py: 8, color: 'text.secondary' }}>
                                        {search ? 'No stores match your search' : 'No stores yet — click Add Store to create one'}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                stores.map(store => (
                                    <TableRow key={store.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>
                                                {store.name}
                                            </Typography>
                                            {store.description && (
                                                <Typography variant="caption" color="text.secondary" display="block">
                                                    {store.description}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Tooltip title={store.id} placement="top">
                                                <Typography
                                                    variant="body2"
                                                    fontFamily="monospace"
                                                    color="text.secondary"
                                                    sx={{ cursor: 'default', letterSpacing: 0.5 }}
                                                >
                                                    {shortId(store.id)}
                                                </Typography>
                                            </Tooltip>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{store.address ?? '—'}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{store.contact ?? '—'}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{fmtDate(store.openDate)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{fmtDate(store.closeDate)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={`${store.onlineCount}/${store.deviceCount}`}
                                                size="small"
                                                color={store.onlineCount > 0 ? 'success' : 'default'}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            <Tooltip title="Edit store">
                                                <IconButton size="small" onClick={() => setEditStore(store)}>
                                                    <Edit fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* ── Dialogs ── */}
            <AddStoreDialog open={addOpen} onClose={() => setAddOpen(false)} />
            {editStore && (
                <EditStoreDialog
                    store={editStore}
                    open={true}
                    onClose={() => setEditStore(null)}
                />
            )}
        </Box>
    );
}
