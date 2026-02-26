import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Card, CardContent, Stack, Button, TextField,
    Grid, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    InputAdornment, Pagination, LinearProgress, Tooltip, CardMedia,
    CardActionArea, Skeleton, Select, MenuItem as MuiMenuItem, FormControl,
    InputLabel, Fade, Backdrop,
} from '@mui/material';
import {
    Search, VideoFile, Image, Language,
    CloudUpload, Delete, CheckCircle, HourglassEmpty, Error as ErrorIcon,
    Close, Download, ZoomIn,
} from '@mui/icons-material';
import { mediaApi } from '@api/media.api';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Media, MediaType } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function MediaTypeIcon({ type }: { type: MediaType }) {
    const icons = { VIDEO: <VideoFile />, IMAGE: <Image />, WEBPAGE: <Language /> };
    const colors = { VIDEO: '#FF6584', IMAGE: '#4CAF82', WEBPAGE: '#29B6F6' };
    return (
        <Box sx={{ color: colors[type] ?? 'text.secondary', display: 'flex' }}>
            {icons[type] ?? <Image />}
        </Box>
    );
}

function StatusChip({ status }: { status: Media['status'] }) {
    const cfg = {
        READY: { color: 'success' as const, icon: <CheckCircle sx={{ fontSize: 12 }} /> },
        PROCESSING: { color: 'warning' as const, icon: <HourglassEmpty sx={{ fontSize: 12 }} /> },
        ERROR: { color: 'error' as const, icon: <ErrorIcon sx={{ fontSize: 12 }} /> },
    };
    const c = cfg[status] ?? cfg.ERROR;
    return <Chip label={status} color={c.color} size="small" icon={c.icon} sx={{ fontWeight: 600, fontSize: '0.65rem' }} />;
}

function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ── Preview Lightbox ──────────────────────────────────────────────────────────

function MediaPreviewDialog({
    media,
    open,
    onClose,
    onDelete,
}: {
    media: Media | null;
    open: boolean;
    onClose: () => void;
    onDelete: (id: string) => void;
}) {
    if (!media) return null;

    // Dùng signed URL từ API response (có ?expires=&sig=)
    const previewUrl = media.signedUrl ?? '';

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="lg"
            fullWidth
            slots={{ backdrop: Backdrop }}
            slotProps={{ backdrop: { timeout: 300 } }}
            TransitionComponent={Fade}
            PaperProps={{
                sx: { bgcolor: 'background.paper', borderRadius: 3, overflow: 'hidden' },
            }}
        >
            {/* Header */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box>
                    <Typography variant="h6" fontWeight={700} noWrap>{media.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {formatSize(media.fileSize)}
                        {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
                        {' · '}<StatusChip status={media.status} />
                    </Typography>
                </Box>
                <IconButton onClick={onClose} size="small"><Close /></IconButton>
            </Box>

            {/* Preview area — fills dialog width, max 70vh tall */}
            <Box sx={{
                bgcolor: 'grey.900',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%',
                maxHeight: '70vh',
                overflow: 'hidden',
            }}>
                {media.type === 'IMAGE' ? (
                    <img
                        src={previewUrl}
                        alt={media.title}
                        style={{
                            width: '100%',
                            maxHeight: '70vh',
                            objectFit: 'contain',
                            display: 'block',
                        }}
                    />
                ) : media.type === 'VIDEO' ? (
                    <video
                        src={previewUrl}
                        controls
                        style={{
                            width: '100%',
                            maxHeight: '70vh',
                            display: 'block',
                            background: '#000',
                            paddingBottom: '8px',
                        }}
                    />
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, color: 'grey.400', py: 8 }}>
                        <MediaTypeIcon type={media.type} />
                        <Typography variant="body2" color="grey.400">{media.type}</Typography>
                    </Box>
                )}
            </Box>

            {/* Metadata */}
            <Box sx={{ px: 2.5, py: 2, bgcolor: 'action.hover' }}>
                <Grid container spacing={2}>
                    {[
                        { label: 'Type', value: media.type },
                        { label: 'Size', value: formatSize(media.fileSize) },
                        { label: 'Resolution', value: media.width && media.height ? `${media.width}×${media.height}` : '—' },
                        { label: 'MIME', value: media.mimeType ?? '—' },
                        { label: 'Uploaded', value: new Date(media.createdAt).toLocaleString() },
                        { label: 'Status', value: media.status },
                    ].map(({ label, value }) => (
                        <Grid key={label} size={{ xs: 6, sm: 4 }}>
                            <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
                            <Typography variant="body2" fontWeight={600}>{value}</Typography>
                        </Grid>
                    ))}
                </Grid>
            </Box>

            {/* Actions */}
            <DialogActions sx={{ px: 2.5, py: 1.5, justifyContent: 'space-between' }}>
                <Tooltip title="Delete this media">
                    <Button
                        variant="outlined"
                        color="error"
                        startIcon={<Delete />}
                        onClick={() => { onDelete(media.id); onClose(); }}
                    >
                        Delete
                    </Button>
                </Tooltip>
                <Button onClick={onClose} variant="outlined">Close</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Media card ────────────────────────────────────────────────────────────────

function MediaCard({ media, onPreview, onDelete }: {
    media: Media;
    onPreview: (m: Media) => void;
    onDelete: (id: string) => void;
}) {
    // Dùng signed URL từ API response (có ?expires=&sig=), fallback null nếu không có thumbnail
    const thumbnailUrl = media.thumbnailUrl ?? null;

    return (
        <Card sx={{ position: 'relative', transition: 'transform 0.2s, box-shadow 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: 6 } }}>
            {/* Delete button — always visible top-right */}
            <Tooltip title="Delete">
                <IconButton
                    size="small"
                    onClick={(e) => { e.stopPropagation(); onDelete(media.id); }}
                    sx={{
                        position: 'absolute', top: 6, right: 6, zIndex: 2,
                        bgcolor: 'rgba(0,0,0,0.55)', color: 'white',
                        '&:hover': { bgcolor: 'error.main' },
                    }}
                >
                    <Delete sx={{ fontSize: 16 }} />
                </IconButton>
            </Tooltip>

            {/* Zoom hint overlay on hover */}
            <CardActionArea onClick={() => onPreview(media)} sx={{ position: 'relative' }}>
                <Box sx={{
                    position: 'relative', aspectRatio: '16/9',
                    bgcolor: 'action.hover', overflow: 'hidden',
                    '&:hover .zoom-hint': { opacity: 1 },
                }}>
                    {thumbnailUrl ? (
                        <CardMedia
                            component="img"
                            image={thumbnailUrl}
                            alt={media.title}
                            sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <MediaTypeIcon type={media.type} />
                        </Box>
                    )}

                    {/* Hover zoom indicator */}
                    <Box className="zoom-hint" sx={{
                        position: 'absolute', inset: 0, opacity: 0, transition: 'opacity 0.2s',
                        bgcolor: 'rgba(0,0,0,0.4)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <ZoomIn sx={{ color: 'white', fontSize: 40 }} />
                    </Box>

                    {/* Type badge */}
                    <Box sx={{ position: 'absolute', top: 8, left: 8 }}>
                        <Chip
                            label={media.type}
                            size="small"
                            sx={{ bgcolor: 'rgba(0,0,0,0.7)', color: 'white', fontWeight: 600, fontSize: '0.6rem' }}
                        />
                    </Box>
                </Box>

                {/* Info */}
                <CardContent sx={{ pt: 1.5, pb: '12px !important' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                        <Box sx={{ flex: 1, overflow: 'hidden', mr: 1 }}>
                            <Typography variant="body2" fontWeight={600} noWrap>{media.title}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {formatSize(media.fileSize)} · {media.width && media.height ? `${media.width}×${media.height}` : '—'}
                            </Typography>
                        </Box>
                        <StatusChip status={media.status} />
                    </Stack>
                </CardContent>
            </CardActionArea>
        </Card>
    );
}

// ── Upload dialog ─────────────────────────────────────────────────────────────

function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState('');
    const [progress, setProgress] = useState(0);
    const [uploading, setUploading] = useState(false);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); }
    }, [title]);

    const handleUpload = async () => {
        if (!file || !title) return;
        setUploading(true);
        try {
            await mediaApi.upload(file, title, setProgress);
            qc.invalidateQueries({ queryKey: ['media'] });
            dispatch(pushToast({ severity: 'success', message: 'File uploaded successfully!' }));
            setFile(null); setTitle(''); setProgress(0);
            onClose();
        } catch {
            dispatch(pushToast({ severity: 'error', message: 'Upload failed' }));
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        if (!uploading) { setFile(null); setTitle(''); setProgress(0); onClose(); }
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle>Upload Media</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                    {/* Drop zone */}
                    <Box
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        sx={{
                            border: '2px dashed',
                            borderColor: file ? 'primary.main' : 'divider',
                            borderRadius: 3,
                            p: 4, textAlign: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            bgcolor: file ? 'primary.main' + '11' : 'transparent',
                            '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.main' + '08' },
                        }}
                        onClick={() => document.getElementById('media-file-input')?.click()}
                    >
                        <CloudUpload sx={{ fontSize: 48, color: file ? 'primary.main' : 'text.secondary', mb: 1 }} />
                        <Typography variant="body2" fontWeight={600}>
                            {file ? file.name : 'Click or drag & drop a file here'}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {file ? formatSize(file.size) : 'MP4, MOV, JPG, PNG, WEBP supported'}
                        </Typography>
                    </Box>
                    <input
                        id="media-file-input" type="file" hidden
                        accept="video/*,image/*"
                        onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) { setFile(f); if (!title) setTitle(f.name.replace(/\.[^.]+$/, '')); }
                        }}
                    />

                    <TextField
                        label="Title" value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        fullWidth required
                    />

                    {uploading && (
                        <Box>
                            <Typography variant="caption" color="text.secondary" mb={0.5}>
                                Uploading... {progress}%
                            </Typography>
                            <LinearProgress variant="determinate" value={progress} sx={{ borderRadius: 2 }} />
                        </Box>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={handleClose} disabled={uploading}>Cancel</Button>
                <Button
                    variant="contained"
                    disabled={!file || !title || uploading}
                    onClick={handleUpload}
                >
                    {uploading ? 'Uploading...' : 'Upload'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Main Media Page ───────────────────────────────────────────────────────────

export default function MediaPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [page, setPage] = useState(1);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [previewMedia, setPreviewMedia] = useState<Media | null>(null);
    const LIMIT = 12;

    const { data, isLoading } = useQuery({
        queryKey: ['media', page, search, typeFilter],
        queryFn: () => mediaApi.list({ page, limit: LIMIT, search: search || undefined, type: typeFilter || undefined }),
        // Poll every 3s while any item is still transcoding, stop once all are READY/ERROR
        refetchInterval: (query) => {
            const items = (query.state.data as typeof data)?.data;
            return Array.isArray(items) && items.some(m => m.status === 'PROCESSING') ? 3_000 : false;
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => mediaApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['media'] });
            dispatch(pushToast({ severity: 'success', message: 'Media deleted successfully' }));
        },
        onError: () => dispatch(pushToast({ severity: 'error', message: 'Delete failed' })),
    });

    const handleDelete = (id: string) => {
        if (window.confirm('Are you sure you want to delete this media file? This cannot be undone.')) {
            deleteMutation.mutate(id);
        }
    };

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Media Library</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {data?.total ?? 0} files
                    </Typography>
                </Box>
                <Button variant="contained" startIcon={<CloudUpload />} onClick={() => setUploadOpen(true)}>
                    Upload
                </Button>
            </Stack>

            {/* Filters */}
            <Stack direction="row" gap={2} mb={3}>
                <TextField
                    placeholder="Search media..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    size="small"
                    sx={{ width: 240 }}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 20, color: 'text.secondary' }} /></InputAdornment>,
                    }}
                />
                <FormControl size="small" sx={{ width: 140 }}>
                    <InputLabel>Type</InputLabel>
                    <Select value={typeFilter} label="Type" onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                        <MuiMenuItem value="">All</MuiMenuItem>
                        <MuiMenuItem value="VIDEO">Video</MuiMenuItem>
                        <MuiMenuItem value="IMAGE">Image</MuiMenuItem>
                        <MuiMenuItem value="WEBPAGE">Webpage</MuiMenuItem>
                    </Select>
                </FormControl>
            </Stack>

            {/* Grid */}
            <Grid container spacing={2}>
                {isLoading
                    ? Array.from({ length: LIMIT }).map((_, i) => (
                        <Grid key={i} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                            <Skeleton variant="rounded" height={220} />
                        </Grid>
                    ))
                    : (data?.data ?? []).map((media) => (
                        <Grid key={media.id} size={{ xs: 12, sm: 6, md: 4, lg: 3 }}>
                            <MediaCard
                                media={media}
                                onPreview={setPreviewMedia}
                                onDelete={handleDelete}
                            />
                        </Grid>
                    ))}
            </Grid>

            {!isLoading && !data?.data.length && (
                <Box textAlign="center" py={8}>
                    <CloudUpload sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                    <Typography variant="h6" gutterBottom>No media yet</Typography>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        Upload your first video or image to get started.
                    </Typography>
                    <Button variant="contained" onClick={() => setUploadOpen(true)}>Upload Now</Button>
                </Box>
            )}

            {/* Pagination */}
            {data && data.totalPages > 1 && (
                <Box mt={3} display="flex" justifyContent="center">
                    <Pagination count={data.totalPages} page={page} onChange={(_, p) => setPage(p)} color="primary" />
                </Box>
            )}

            <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />

            {/* Preview Lightbox */}
            <MediaPreviewDialog
                media={previewMedia}
                open={Boolean(previewMedia)}
                onClose={() => setPreviewMedia(null)}
                onDelete={handleDelete}
            />
        </Box>
    );
}
