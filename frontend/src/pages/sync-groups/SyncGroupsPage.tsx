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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
                <Typography variant="caption" color="text.secondary">{t('syncGroups.loopProgress')}</Typography>
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
    const { t } = useTranslation();
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
            dispatch(pushToast({ severity: 'success', message: editing ? t('syncGroups.updateSuccess') : t('syncGroups.createSuccess') }));
            onClose();
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: t('syncGroups.genericError') })),
    });

    const playlistOptions = playlists ?? [];
    const selectedPlaylist = playlistOptions.find(p => p.id === playlistId) ?? null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>{editing ? t('syncGroups.editTitle') : t('syncGroups.createTitle')}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField label={t('syncGroups.groupName')} value={name} onChange={e => setName(e.target.value)} fullWidth size="small" />
                    <TextField label={t('syncGroups.description')} value={description} onChange={e => setDescription(e.target.value)} fullWidth multiline rows={2} size="small" />
                    <Autocomplete
                        options={playlistOptions}
                        getOptionLabel={o => o.name}
                        value={selectedPlaylist}
                        inputValue={playlistInput}
                        onInputChange={(_, v) => setPlaylistInput(v)}
                        onChange={(_, v) => setPlaylistId(v?.id ?? null)}
                        renderInput={params => <TextField {...params} label={t('syncGroups.playlistOptional')} size="small" />}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>{t('common.cancel')}</Button>
                <Button size="small" disabled={!name.trim() || mutation.isPending}
                    onClick={() => mutation.mutate()}>
                    {mutation.isPending ? <CircularProgress size={18} /> : (editing ? t('common.save') : t('common.create'))}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Device Assignment Dialog ─────────────────────────────────────────────────

function DeviceDialog({ group, onClose }: { group: SyncGroup; onClose: () => void }) {
    const { t } = useTranslation();
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
            dispatch(pushToast({ severity: 'success', message: t('syncGroups.devicesUpdated') }));
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: t('syncGroups.genericError') })),
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
            <DialogTitle fontWeight={700}>{t('syncGroups.devicesTitle', { name: group.name })}</DialogTitle>
            <DialogContent dividers>
                <Alert severity="info" sx={{ mb: 2 }}>
                    {t('syncGroups.devicesHint')}
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
                                        {isMember ? t('common.delete') : t('common.add')}
                                    </Button>
                                </ListItemSecondaryAction>
                            </ListItem>
                        );
                    })}
                    {available.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2, textAlign: 'center' }}>
                            {t('syncGroups.noDevicesAvailable')}
                        </Typography>
                    )}
                </List>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>{t('common.close')}</Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Group Card ───────────────────────────────────────────────────────────────

function GroupCard({ group, onEdit }: { group: SyncGroup; onEdit: (g: SyncGroup) => void }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [showDevices, setShowDevices] = useState(false);

    const isPlaying = !!group.startEpoch;

    const start = useMutation({
        mutationFn: () => syncGroupsApi.start(group.id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); dispatch(pushToast({ severity: 'success', message: t('syncGroups.startSuccess') })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('syncGroups.genericError') })),
    });
    const restart = useMutation({
        mutationFn: () => syncGroupsApi.restart(group.id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); dispatch(pushToast({ severity: 'success', message: t('syncGroups.restartSuccess') })); },
        onError: () => dispatch(pushToast({ severity: 'error', message: t('syncGroups.genericError') })),
    });
    const stop = useMutation({
        mutationFn: () => syncGroupsApi.stop(group.id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); dispatch(pushToast({ severity: 'success', message: t('syncGroups.stopSuccess') })); },
        onError: () => dispatch(pushToast({ severity: 'error', message: t('syncGroups.genericError') })),
    });
    const del = useMutation({
        mutationFn: () => syncGroupsApi.delete(group.id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['sites'] }); dispatch(pushToast({ severity: 'success', message: t('syncGroups.deleteSuccess') })); },
        onError: () => dispatch(pushToast({ severity: 'error', message: t('syncGroups.genericError') })),
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
                            <Tooltip title={t('common.edit')}>
                                <IconButton size="small" onClick={() => onEdit(group)}><Edit fontSize="small" /></IconButton>
                            </Tooltip>
                            <Tooltip title={t('common.delete')}>
                                <IconButton size="small" color="error" disabled={del.isPending}
                                    onClick={() => window.confirm(t('syncGroups.deleteConfirm', { name: group.name })) && del.mutate()}>
                                    <Delete fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        </Stack>
                    </Stack>

                    <Stack direction="row" spacing={1} mt={1.5} flexWrap="wrap" useFlexGap>
                        <Chip
                            label={isPlaying ? t('syncGroups.playing') : t('syncGroups.stopped')}
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
                        <Button size="small" color="success" startIcon={<PlayArrow />}
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
    const { t } = useTranslation();
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
                    <Typography variant="h5" fontWeight={700}>{t('syncGroups.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('syncGroups.subtitle')}
                    </Typography>
                </Box>
                <Button startIcon={<Add />} onClick={openCreate}>
                    {t('syncGroups.createGroup')}
                </Button>
            </Stack>

            {isLoading ? (
                <Stack spacing={2}>
                    {[1, 2, 3].map(i => <Card key={i} variant="outlined" sx={{ height: 160 }} />)}
                </Stack>
            ) : groups.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 8 }}>
                    <SyncAlt sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
                    <Typography variant="h6" color="text.secondary">{t('syncGroups.noGroups')}</Typography>
                    <Typography variant="body2" color="text.disabled" mb={3}>
                        {t('syncGroups.noGroupsSubtitle')}
                    </Typography>
                    <Button startIcon={<Add />} onClick={openCreate}>
                        {t('syncGroups.createFirst')}
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
