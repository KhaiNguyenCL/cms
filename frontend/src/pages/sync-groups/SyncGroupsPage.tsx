import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Button, Stack, Card, CardContent, CardActions,
    Chip, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, Autocomplete, Divider, List, ListItem,
    ListItemText, ListItemSecondaryAction, CircularProgress, Alert,
    LinearProgress,
} from '@mui/material';
import {
    Add, PlayArrow, Stop, Replay, Delete, Edit, Tv,
    Circle, SyncAlt,
} from '@mui/icons-material';
import { sitesApi as syncGroupsApi } from '@api/sites.api';
import { devicesApi } from '@api/devices.api';
import { apiClient } from '@api/client';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Site as SyncGroup, Device } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number | null): string {
    if (!ms) return '—';
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function SyncProgress({ group }: { group: SyncGroup }) {
    const [tick, setTick] = React.useState(0);
    React.useEffect(() => {
        if (!group.startEpoch || !group.totalDurationMs) return;
        const t = setInterval(() => setTick(n => n + 1), 1000);
        return () => clearInterval(t);
    }, [group.startEpoch, group.totalDurationMs]);

    if (!group.startEpoch || !group.totalDurationMs) return null;
    const elapsed = (Date.now() - group.startEpoch) % group.totalDurationMs;
    const pct = (elapsed / group.totalDurationMs) * 100;
    const elapsedSec = Math.floor(elapsed / 1000);
    const totalSec = Math.floor(group.totalDurationMs / 1000);
    return (
        <Box mt={1}>
            <Stack direction="row" justifyContent="space-between" mb={0.5}>
                <Typography variant="caption" color="text.secondary">Tiến độ vòng lặp</Typography>
                <Typography variant="caption" color="text.secondary">
                    {Math.floor(elapsedSec / 60)}:{String(elapsedSec % 60).padStart(2, '0')} / {Math.floor(totalSec / 60)}:{String(totalSec % 60).padStart(2, '0')}
                </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3 }} />
        </Box>
    );
}

// ─── Create/Edit Dialog ───────────────────────────────────────────────────────

interface GroupDialogProps {
    open: boolean;
    editing: SyncGroup | null;
    onClose: () => void;
}

function GroupDialog({ open, editing, onClose }: GroupDialogProps) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [playlistId, setPlaylistId] = useState<string | null>(null);
    const [playlistInput, setPlaylistInput] = useState('');

    React.useEffect(() => {
        if (open) {
            setName(editing?.name ?? '');
            setDescription(editing?.description ?? '');
            setPlaylistId(editing?.playlistId ?? null);
            setPlaylistInput(editing?.playlistName ?? '');
        }
    }, [open, editing]);

    const { data: playlists } = useQuery({
        queryKey: ['playlists-simple'],
        queryFn: () => apiClient.get<{ data: { data: { id: string; name: string }[] } }>('/playlists?limit=200').then(r => r.data.data.data),
        enabled: open,
    });

    const mutation = useMutation({
        mutationFn: () => editing
            ? syncGroupsApi.update(editing.id, { name, description: description || null, playlistId })
            : syncGroupsApi.create({ name, description: description || undefined, playlistId: playlistId ?? undefined }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sites'] });
            dispatch(pushToast({ severity: 'success', message: editing ? 'Đã cập nhật' : 'Đã tạo sync group' }));
            onClose();
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Có lỗi xảy ra' })),
    });

    const playlistOptions = playlists ?? [];
    const selectedPlaylist = playlistOptions.find(p => p.id === playlistId) ?? null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>{editing ? 'Chỉnh sửa Sync Group' : 'Tạo Sync Group mới'}</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} mt={1}>
                    <TextField label="Tên nhóm *" value={name} onChange={e => setName(e.target.value)} fullWidth />
                    <TextField label="Mô tả" value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={2} />
                    <Autocomplete
                        options={playlistOptions}
                        getOptionLabel={o => o.name}
                        value={selectedPlaylist}
                        inputValue={playlistInput}
                        onInputChange={(_, v) => setPlaylistInput(v)}
                        onChange={(_, v) => setPlaylistId(v?.id ?? null)}
                        renderInput={params => <TextField {...params} label="Playlist (có thể gán sau)" />}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose}>Hủy</Button>
                <Button variant="contained" disabled={!name.trim() || mutation.isPending}
                    onClick={() => mutation.mutate()}>
                    {mutation.isPending ? <CircularProgress size={18} /> : (editing ? 'Lưu' : 'Tạo')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Device Assignment Dialog ─────────────────────────────────────────────────

function DeviceDialog({ group, onClose }: { group: SyncGroup; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();

    const { data: allDevices } = useQuery({
        queryKey: ['devices-simple'],
        queryFn: () => devicesApi.list({ limit: 200 }).then(r => r.data),
    });

    const mutation = useMutation({
        mutationFn: (body: { add?: string[]; remove?: string[] }) =>
            syncGroupsApi.updateDevices(group.id, body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sites'] });
            dispatch(pushToast({ severity: 'success', message: 'Đã cập nhật danh sách thiết bị' }));
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Có lỗi xảy ra' })),
    });

    const memberIds = new Set(group.devices?.map(d => d.id) ?? []);
    const available = (allDevices ?? []).filter((d: Device) => !d.siteId || d.siteId === group.id);

    const toggle = (device: Device) => {
        if (memberIds.has(device.id)) {
            mutation.mutate({ remove: [device.id] });
        } else {
            mutation.mutate({ add: [device.id] });
        }
    };

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Thiết bị trong nhóm: {group.name}</DialogTitle>
            <DialogContent>
                <Alert severity="info" sx={{ mb: 2 }}>
                    Chỉ hiển thị thiết bị chưa thuộc nhóm sync khác.
                </Alert>
                <List dense>
                    {available.map((d: Device) => {
                        const isMember = memberIds.has(d.id);
                        return (
                            <ListItem key={d.id} divider>
                                <Circle sx={{ fontSize: 10, mr: 1.5, color: d.status === 'ONLINE' ? 'success.main' : 'text.disabled' }} />
                                <ListItemText primary={d.name} secondary={d.model ?? d.location ?? '—'} />
                                <ListItemSecondaryAction>
                                    <Button size="small" variant={isMember ? 'outlined' : 'contained'}
                                        color={isMember ? 'error' : 'primary'}
                                        disabled={mutation.isPending}
                                        onClick={() => toggle(d)}>
                                        {isMember ? 'Xóa' : 'Thêm'}
                                    </Button>
                                </ListItemSecondaryAction>
                            </ListItem>
                        );
                    })}
                    {available.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                            Không có thiết bị khả dụng
                        </Typography>
                    )}
                </List>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button variant="contained" onClick={onClose}>Đóng</Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({ group, onEdit }: { group: SyncGroup; onEdit: (g: SyncGroup) => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [showDevices, setShowDevices] = useState(false);

    const isPlaying = !!group.startEpoch;

    const start = useMutation({
        mutationFn: () => syncGroupsApi.start(group.id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); dispatch(pushToast({ severity: 'success', message: 'Đã bắt đầu sync' })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Lỗi' })),
    });
    const restart = useMutation({
        mutationFn: () => syncGroupsApi.restart(group.id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); dispatch(pushToast({ severity: 'success', message: 'Đã restart sync' })); },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Lỗi' })),
    });
    const stop = useMutation({
        mutationFn: () => syncGroupsApi.stop(group.id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); dispatch(pushToast({ severity: 'success', message: 'Đã dừng sync' })); },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Lỗi' })),
    });
    const del = useMutation({
        mutationFn: () => syncGroupsApi.delete(group.id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); dispatch(pushToast({ severity: 'success', message: 'Đã xóa' })); },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Lỗi' })),
    });

    return (
        <>
            <Card variant="outlined" sx={{ borderColor: isPlaying ? 'success.main' : 'divider', position: 'relative' }}>
                {isPlaying && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, bgcolor: 'success.main', borderRadius: '4px 4px 0 0' }} />
                )}
                <CardContent sx={{ pb: 1 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Stack direction="row" spacing={1} alignItems="center">
                            <SyncAlt sx={{ color: isPlaying ? 'success.main' : 'text.disabled' }} />
                            <Box>
                                <Typography variant="subtitle1" fontWeight={600}>{group.name}</Typography>
                                {group.description && (
                                    <Typography variant="caption" color="text.secondary">{group.description}</Typography>
                                )}
                            </Box>
                        </Stack>
                        <Stack direction="row" spacing={0.5}>
                            <Tooltip title="Chỉnh sửa">
                                <IconButton size="small" onClick={() => onEdit(group)}><Edit fontSize="small" /></IconButton>
                            </Tooltip>
                            <Tooltip title="Xóa">
                                <IconButton size="small" color="error" disabled={del.isPending}
                                    onClick={() => window.confirm(`Xóa "${group.name}"?`) && del.mutate()}>
                                    <Delete fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                    </Stack>

                    <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
                        <Chip
                            label={isPlaying ? 'Đang phát' : 'Dừng'}
                            color={isPlaying ? 'success' : 'default'}
                            size="small" icon={isPlaying ? <PlayArrow sx={{ fontSize: '14px !important' }} /> : undefined}
                        />
                        <Chip icon={<Tv sx={{ fontSize: '14px !important' }} />}
                            label={`${group.onlineCount}/${group.deviceCount} online`}
                            size="small" variant="outlined"
                            onClick={() => setShowDevices(true)} sx={{ cursor: 'pointer' }}
                        />
                        {group.playlistName && (
                            <Chip label={group.playlistName} size="small" variant="outlined" />
                        )}
                        {group.totalDurationMs && (
                            <Chip label={formatDuration(group.totalDurationMs)} size="small" variant="outlined" />
                        )}
                    </Stack>

                    <SyncProgress group={group} />
                </CardContent>

                <Divider />

                <CardActions sx={{ px: 2, py: 1, justifyContent: 'flex-end', gap: 1 }}>
                    {!isPlaying ? (
                        <Button size="small" variant="contained" color="success" startIcon={<PlayArrow />}
                            disabled={!group.playlistId || start.isPending}
                            onClick={() => start.mutate()}>
                            {start.isPending ? <CircularProgress size={16} /> : 'Start'}
                        </Button>
                    ) : (
                        <>
                            <Button size="small" variant="outlined" startIcon={<Replay />}
                                disabled={restart.isPending} onClick={() => restart.mutate()}>
                                {restart.isPending ? <CircularProgress size={16} /> : 'Restart'}
                            </Button>
                            <Button size="small" variant="outlined" color="error" startIcon={<Stop />}
                                disabled={stop.isPending} onClick={() => stop.mutate()}>
                                {stop.isPending ? <CircularProgress size={16} /> : 'Stop'}
                            </Button>
                        </>
                    )}
                </CardActions>
            </Card>

            {showDevices && <DeviceDialog group={group} onClose={() => setShowDevices(false)} />}
        </>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SyncGroupsPage() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<SyncGroup | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['sites'],
        queryFn: () => syncGroupsApi.list(),
        refetchInterval: 5000,   // poll every 5s to update progress + device counts
    });

    const groups = data?.data ?? [];

    const openCreate = () => { setEditing(null); setDialogOpen(true); };
    const openEdit = (g: SyncGroup) => { setEditing(g); setDialogOpen(true); };

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h5" fontWeight={700}>Sync Groups</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Đồng bộ phát nội dung trên nhiều màn hình cùng lúc
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
                    Tạo nhóm mới
                </Button>
            </Stack>

            {isLoading ? (
                <Stack spacing={2}>
                    {[1, 2, 3].map(i => <Card key={i} variant="outlined" sx={{ height: 160 }} />)}
                </Stack>
            ) : groups.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <SyncAlt sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">Chưa có sync group nào</Typography>
                    <Typography variant="body2" color="text.disabled" mb={3}>
                        Tạo nhóm để đồng bộ phát nội dung trên nhiều màn hình
                    </Typography>
                    <Button variant="contained" startIcon={<Add />} onClick={openCreate}>
                        Tạo nhóm đầu tiên
                    </Button>
                </Box>
            ) : (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 2 }}>
                    {groups.map((g: SyncGroup) => <GroupCard key={g.id} group={g} onEdit={openEdit} />)}
                </Box>
            )}

            <GroupDialog open={dialogOpen} editing={editing} onClose={() => setDialogOpen(false)} />
        </Box>
    );
}
