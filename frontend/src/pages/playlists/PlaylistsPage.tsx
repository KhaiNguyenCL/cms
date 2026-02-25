import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Card, CardContent, Stack, Button, TextField,
    Grid, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    Skeleton, Menu, MenuItem, Divider, List, ListItem, ListItemText,
    ListItemAvatar, Avatar, Pagination, Tooltip, Badge, InputAdornment,
    CircularProgress, Alert,
} from '@mui/material';
import {
    Add, QueueMusic, MoreVert, Delete, VideoFile, Image, Language, PlayArrow,
    Search, CheckCircle, AddCircle, DragIndicator,
} from '@mui/icons-material';
import { playlistsApi } from '@api/playlists.api';
import { mediaApi } from '@api/media.api';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Playlist, PlaylistItem, Media } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeIcon(type?: string) {
    if (type === 'VIDEO') return <VideoFile sx={{ fontSize: 20 }} />;
    if (type === 'WEBPAGE') return <Language sx={{ fontSize: 20 }} />;
    return <Image sx={{ fontSize: 20 }} />;
}

function formatSize(bytes: number) {
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

// ── Add Media Picker Dialog ───────────────────────────────────────────────────

function AddMediaDialog({
    playlistId,
    open,
    onClose,
    existingMediaIds,
}: {
    playlistId: string;
    open: boolean;
    onClose: () => void;
    existingMediaIds: Set<string>;
}) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    // selected: Map<mediaId, duration>
    const [selected, setSelected] = useState<Map<string, number>>(new Map());

    const { data, isLoading } = useQuery({
        queryKey: ['media-picker', page, search],
        queryFn: () => mediaApi.list({ page, limit: 12, search: search || undefined, type: 'IMAGE' }),
        enabled: open,
    });

    const { data: videoData } = useQuery({
        queryKey: ['media-picker-all', page, search],
        queryFn: () => mediaApi.list({ page, limit: 24, search: search || undefined }),
        enabled: open,
    });

    // Use all media (images + videos)
    const allMedia = videoData?.data ?? [];

    const addMutation = useMutation({
        mutationFn: async () => {
            const entries = [...selected.entries()];
            for (const [mediaId, durationOverride] of entries) {
                await playlistsApi.addItem(playlistId, mediaId, durationOverride);
            }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
            qc.invalidateQueries({ queryKey: ['playlists'] });
            const count = selected.size;
            dispatch(pushToast({ severity: 'success', message: `Added ${count} item${count > 1 ? 's' : ''} to playlist` }));
            setSelected(new Map());
            onClose();
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Failed to add media' })),
    });

    const toggleSelect = (mediaId: string) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(mediaId)) {
                next.delete(mediaId);
            } else {
                next.set(mediaId, 10); // default 10s
            }
            return next;
        });
    };

    const setDuration = (mediaId: string, secs: number) => {
        setSelected(prev => {
            const next = new Map(prev);
            next.set(mediaId, Math.max(1, secs));
            return next;
        });
    };

    const handleClose = () => {
        setSelected(new Map());
        setSearch('');
        setPage(1);
        onClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="h6" fontWeight={700}>Add Media to Playlist</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {selected.size > 0 ? `${selected.size} selected` : 'Click to select media'}
                        </Typography>
                    </Box>
                    {selected.size > 0 && (
                        <Chip
                            label={`${selected.size} selected`}
                            color="primary"
                            size="small"
                            onDelete={() => setSelected(new Map())}
                        />
                    )}
                </Stack>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                {/* Search bar */}
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <TextField
                        placeholder="Search media..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        size="small"
                        fullWidth
                        InputProps={{
                            startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment>,
                        }}
                    />
                </Box>

                {/* Media grid */}
                <Box sx={{ p: 2 }}>
                    {isLoading ? (
                        <Grid container spacing={1.5}>
                            {Array.from({ length: 8 }).map((_, i) => (
                                <Grid key={i} size={{ xs: 6, sm: 4, md: 3 }}>
                                    <Skeleton variant="rounded" height={130} />
                                </Grid>
                            ))}
                        </Grid>
                    ) : !allMedia.length ? (
                        <Box textAlign="center" py={4}>
                            <Image sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                            <Typography color="text.secondary">No media found</Typography>
                        </Box>
                    ) : (
                        <Grid container spacing={1.5}>
                            {allMedia.map((media: Media) => {
                                const isSelected = selected.has(media.id);
                                const alreadyInPlaylist = existingMediaIds.has(media.id);
                                const thumbUrl = media.thumbnailUrl ?? null;

                                return (
                                    <Grid key={media.id} size={{ xs: 6, sm: 4, md: 3 }}>
                                        <Card
                                            onClick={() => !alreadyInPlaylist && toggleSelect(media.id)}
                                            sx={{
                                                cursor: alreadyInPlaylist ? 'default' : 'pointer',
                                                border: '2px solid',
                                                borderColor: isSelected ? 'primary.main' : 'transparent',
                                                opacity: alreadyInPlaylist ? 0.5 : 1,
                                                transition: 'all 0.15s',
                                                position: 'relative',
                                                '&:hover': !alreadyInPlaylist ? { borderColor: isSelected ? 'primary.main' : 'action.focus' } : {},
                                            }}
                                        >
                                            {/* Selection checkmark */}
                                            {isSelected && (
                                                <Box sx={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
                                                    <CheckCircle sx={{ color: 'primary.main', fontSize: 22, filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }} />
                                                </Box>
                                            )}
                                            {alreadyInPlaylist && (
                                                <Chip
                                                    label="In playlist"
                                                    size="small"
                                                    sx={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: '0.6rem', bgcolor: 'rgba(0,0,0,0.7)', color: 'white' }}
                                                />
                                            )}

                                            {/* Thumbnail */}
                                            <Box sx={{ aspectRatio: '16/9', bgcolor: 'action.hover', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {thumbUrl ? (
                                                    <img src={thumbUrl} alt={media.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                ) : (
                                                    <Box sx={{ color: 'text.secondary' }}>{typeIcon(media.type)}</Box>
                                                )}
                                            </Box>

                                            <CardContent sx={{ p: 1, '&:last-child': { pb: '8px !important' } }}>
                                                <Typography variant="caption" fontWeight={600} noWrap display="block">
                                                    {media.title}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatSize(media.fileSize)}
                                                </Typography>

                                                {/* Duration input (only for selected) */}
                                                {isSelected && (
                                                    <Box onClick={(e) => e.stopPropagation()} mt={0.5}>
                                                        <TextField
                                                            label="Duration (s)"
                                                            type="number"
                                                            size="small"
                                                            value={selected.get(media.id) ?? 10}
                                                            onChange={(e) => setDuration(media.id, parseInt(e.target.value) || 10)}
                                                            inputProps={{ min: 1, max: 3600 }}
                                                            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.5 } }}
                                                        />
                                                    </Box>
                                                )}
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    )}
                </Box>

                {/* Pagination */}
                {videoData && videoData.totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', pb: 2 }}>
                        <Pagination count={videoData.totalPages} page={page} onChange={(_, p) => setPage(p)} size="small" color="primary" />
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 2.5, py: 1.5 }}>
                <Button onClick={handleClose}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={selected.size === 0 || addMutation.isPending}
                    onClick={() => addMutation.mutate()}
                    startIcon={addMutation.isPending ? <CircularProgress size={16} /> : <Add />}
                >
                    {addMutation.isPending ? 'Adding...' : `Add ${selected.size > 0 ? selected.size : ''} to Playlist`}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Playlist detail dialog (view + manage items) ───────────────────────────────

function PlaylistDetailDialog({ playlistId, open, onClose }: { playlistId: string; open: boolean; onClose: () => void }) {
    const qc = useQueryClient();
    const dispatch = useAppDispatch();
    const [addMediaOpen, setAddMediaOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['playlist', playlistId],
        queryFn: () => playlistsApi.get(playlistId),
        enabled: open,
    });

    const removeItem = useMutation({
        mutationFn: (itemId: string) => playlistsApi.removeItem(playlistId, itemId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: 'Item removed' }));
        },
    });

    // Collect existing media IDs to show "already in playlist" badge in picker
    const existingMediaIds = useMemo(
        () => new Set((data?.items ?? []).map((it: PlaylistItem) => it.mediaId ?? it.media?.id ?? '')),
        [data?.items]
    );

    const totalDuration = (data?.items ?? []).reduce((sum: number, it: PlaylistItem) => sum + (it.duration ?? 0), 0);

    return (
        <>
            <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Box>
                            {isLoading ? <Skeleton width={160} /> : <Typography variant="h6" fontWeight={700}>{data?.name}</Typography>}
                            {!isLoading && (
                                <Typography variant="caption" color="text.secondary">
                                    {data?.items?.length ?? 0} items · {totalDuration}s total
                                </Typography>
                            )}
                        </Box>
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={<Add />}
                            onClick={() => setAddMediaOpen(true)}
                        >
                            Add Media
                        </Button>
                    </Stack>
                </DialogTitle>

                <DialogContent sx={{ p: 0, minHeight: 200 }}>
                    {isLoading ? (
                        <Box p={2}>{[1, 2, 3].map(i => <Skeleton key={i} height={56} sx={{ mb: 1 }} />)}</Box>
                    ) : !data?.items?.length ? (
                        <Box textAlign="center" py={6}>
                            <QueueMusic sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                            <Typography variant="body2" color="text.secondary" gutterBottom>No items in this playlist</Typography>
                            <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setAddMediaOpen(true)}>
                                Add Media
                            </Button>
                        </Box>
                    ) : (
                        <List disablePadding>
                            {data.items.map((item: PlaylistItem, idx: number) => {
                                const thumbUrl = item.media?.thumbnailUrl ?? null;
                                return (
                                    <Box key={item.id}>
                                        <ListItem
                                            secondaryAction={
                                                <IconButton edge="end" size="small" color="error"
                                                    onClick={() => removeItem.mutate(item.id)}>
                                                    <Delete fontSize="small" />
                                                </IconButton>
                                            }
                                        >
                                            {/* Order number */}
                                            <Box sx={{ mr: 1, color: 'text.disabled', minWidth: 24, textAlign: 'center' }}>
                                                <Typography variant="caption" fontWeight={700}>{idx + 1}</Typography>
                                            </Box>

                                            <ListItemAvatar>
                                                <Avatar
                                                    src={thumbUrl ?? undefined}
                                                    variant="rounded"
                                                    sx={{ width: 48, height: 36, borderRadius: 1, bgcolor: 'action.hover' }}
                                                >
                                                    {!thumbUrl && <Box sx={{ color: 'text.secondary' }}>{typeIcon(item.media?.type)}</Box>}
                                                </Avatar>
                                            </ListItemAvatar>

                                            <ListItemText
                                                primary={
                                                    <Typography variant="body2" fontWeight={600} noWrap>
                                                        {item.media?.title ?? 'Unknown'}
                                                    </Typography>
                                                }
                                                secondary={
                                                    <Typography variant="caption" color="text.secondary">
                                                        {item.media?.type} · {item.duration ?? 10}s
                                                    </Typography>
                                                }
                                            />
                                        </ListItem>
                                        {idx < data.items.length - 1 && <Divider component="li" />}
                                    </Box>
                                );
                            })}
                        </List>
                    )}
                </DialogContent>

                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={onClose}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Add Media Picker (nested dialog) */}
            <AddMediaDialog
                playlistId={playlistId}
                open={addMediaOpen}
                onClose={() => setAddMediaOpen(false)}
                existingMediaIds={existingMediaIds}
            />
        </>
    );
}

// ── Create playlist dialog ────────────────────────────────────────────────────

function CreatePlaylistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const mutation = useMutation({
        mutationFn: () => playlistsApi.create({ name, description }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: `Playlist "${name}" created!` }));
            setName(''); setDescription('');
            onClose();
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Failed to create playlist' })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>New Playlist</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                    <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
                    <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} />
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

// ── Playlist card ─────────────────────────────────────────────────────────────

function PlaylistCard({ playlist, onDelete }: { playlist: Playlist; onDelete: (id: string) => void }) {
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    return (
        <>
            <Card
                sx={{
                    cursor: 'pointer',
                    transition: 'transform 0.15s, box-shadow 0.15s',
                    '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
                }}
                onClick={() => setDetailOpen(true)}
            >
                <CardContent sx={{ p: 3 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box
                            sx={{
                                width: 48, height: 48, borderRadius: 3, mb: 2,
                                background: 'linear-gradient(135deg, #6C63FF22, #FF658422)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <QueueMusic sx={{ color: 'primary.main', fontSize: 24 }} />
                        </Box>
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAnchor(e.currentTarget); }}>
                            <MoreVert fontSize="small" />
                        </IconButton>
                    </Stack>

                    <Typography variant="h6" fontWeight={700} noWrap>{playlist.name}</Typography>
                    {playlist.description && (
                        <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                            {playlist.description}
                        </Typography>
                    )}

                    <Stack direction="row" gap={1} mt={2} alignItems="center">
                        <Chip
                            label={`${playlist.itemCount ?? 0} items`}
                            size="small"
                            sx={{ fontWeight: 600 }}
                        />
                        {playlist.isDefault && (
                            <Chip label="Default" color="primary" size="small" sx={{ fontWeight: 600 }} />
                        )}
                    </Stack>
                </CardContent>

                <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                    <MenuItem onClick={() => { setDetailOpen(true); setAnchor(null); }}>
                        <PlayArrow sx={{ mr: 1, fontSize: 18 }} /> View Items
                    </MenuItem>
                    <Divider />
                    <MenuItem
                        onClick={() => { onDelete(playlist.id); setAnchor(null); }}
                        sx={{ color: 'error.main' }}
                    >
                        <Delete sx={{ mr: 1, fontSize: 18 }} /> Delete
                    </MenuItem>
                </Menu>
            </Card>

            <PlaylistDetailDialog
                playlistId={playlist.id}
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
            />
        </>
    );
}

// ── Main Playlists Page ───────────────────────────────────────────────────────

export default function PlaylistsPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [page, setPage] = useState(1);
    const [createOpen, setCreateOpen] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['playlists', page],
        queryFn: () => playlistsApi.list({ page, limit: 12 }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => playlistsApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: 'Playlist deleted' }));
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Delete failed' })),
    });

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Playlists</Typography>
                    <Typography variant="body2" color="text.secondary">{data?.total ?? 0} playlists</Typography>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                    New Playlist
                </Button>
            </Stack>

            <Grid container spacing={2.5}>
                {isLoading
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <Grid key={i} size={{ xs: 12, sm: 6, md: 4 }}>
                            <Skeleton variant="rounded" height={180} />
                        </Grid>
                    ))
                    : (data?.data ?? []).map((pl) => (
                        <Grid key={pl.id} size={{ xs: 12, sm: 6, md: 4 }}>
                            <PlaylistCard playlist={pl} onDelete={(id) => deleteMutation.mutate(id)} />
                        </Grid>
                    ))}
            </Grid>

            {!isLoading && !data?.data.length && (
                <Box textAlign="center" py={8}>
                    <QueueMusic sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>No playlists yet</Typography>
                    <Button variant="contained" onClick={() => setCreateOpen(true)}>Create First Playlist</Button>
                </Box>
            )}

            {data && data.totalPages > 1 && (
                <Box mt={3} display="flex" justifyContent="center">
                    <Pagination count={data.totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
                </Box>
            )}

            <CreatePlaylistDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </Box>
    );
}
