import { useState, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Button, TextField,
    Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    InputAdornment, LinearProgress, Tooltip, Skeleton, CircularProgress,
    Select, MenuItem as MuiMenuItem, FormControl, InputLabel,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, List, ListItem, TablePagination, alpha,
} from '@mui/material';
import {
    Search, VideoFile, Image, GifBox,
    CloudUpload, Delete, CheckCircle, HourglassEmpty, Error as ErrorIcon,
    Close, ArrowUpward, ArrowDownward, ZoomIn, Add, WarningAmber,
} from '@mui/icons-material';
import { mediaApi } from '@api/media.api';
import { storageQuotaApi } from '@api/storage-quota.api';
import { getApiError } from '@api/client';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Media, MediaType } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusChip({ status }: { status: Media['status'] }) {
    const cfg = {
        READY:      { color: 'success' as const, icon: <CheckCircle sx={{ fontSize: 12 }} /> },
        PROCESSING: { color: 'warning' as const, icon: <HourglassEmpty sx={{ fontSize: 12 }} /> },
        ERROR:      { color: 'error'   as const, icon: <ErrorIcon sx={{ fontSize: 12 }} /> },
    };
    const c = cfg[status] ?? cfg.ERROR;
    return <Chip label={status} color={c.color} size="small" icon={c.icon} sx={{ fontWeight: 600, fontSize: '0.65rem' }} />;
}

function formatSize(bytes: number) {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024 ** 2)  return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3)  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatDuration(secs: number | null) {
    if (!secs) return null;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────

function DeleteConfirmDialog({ target, onClose, onConfirm, loading, errorMsg }: {
    target: { id: string; title: string } | null;
    onClose: () => void;
    onConfirm: (id: string) => void;
    loading: boolean;
    errorMsg: string | null;
}) {
    const { t } = useTranslation();
    return (
        <Dialog open={!!target} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <WarningAmber color="error" />
                    {t('media.deleteTitle')}
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" mb={errorMsg ? 2 : 0}>
                    {t('media.deleteConfirmMsg', { name: target?.title ?? '' })}
                </Typography>
                {errorMsg && (
                    <Box sx={{
                        mt: 1, p: 1.5, borderRadius: 1,
                        border: '1px solid', borderColor: 'error.main',
                        color: 'error.main', fontSize: 13, lineHeight: 1.5,
                    }}>
                        {errorMsg}
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
                <Button color="error" size="small" disabled={loading} startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Delete />} onClick={() => target && onConfirm(target.id)}>
                    {loading ? t('common.deleting') : t('common.delete')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Right preview panel ───────────────────────────────────────────────────────

function PreviewPanel({ media, onDelete }: { media: Media | null; onDelete: (id: string, title: string) => void }) {
    const { t } = useTranslation();
    if (!media) {
        return (
            <Box sx={{
                width: 300, flexShrink: 0,
                border: '1px dashed', borderColor: 'divider',
                borderRadius: 2,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: 'text.disabled', p: 3, minHeight: 400,
            }}>
                <ZoomIn sx={{ fontSize: 40, mb: 1, opacity: 0.4 }} />
                <Typography variant="body2" textAlign="center">
                    {t('media.hoverToPreview')}
                </Typography>
            </Box>
        );
    }

    const url = media.signedUrl ?? '';

    return (
        <Box sx={{
            width: 300, flexShrink: 0,
            border: '1px solid', borderColor: 'divider',
            borderRadius: 2, overflow: 'hidden',
            position: 'sticky', top: 80, alignSelf: 'flex-start',
        }}>
            {/* Preview media */}
            <Box sx={{ bgcolor: 'grey.900', width: '100%', aspectRatio: '16/9', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {media.type === 'IMAGE' ? (
                    <img
                        src={url}
                        alt={media.title}
                        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                    />
                ) : media.type === 'VIDEO' ? (
                    <video
                        key={media.id}
                        src={url}
                        controls
                        style={{ width: '100%', height: '100%', display: 'block', background: '#000' }}
                    />
                ) : (
                    <Image sx={{ fontSize: 48, color: 'grey.600' }} />
                )}
            </Box>

            {/* Metadata */}
            <Box sx={{ p: 1.5 }}>
                <Typography variant="body2" fontWeight={700} noWrap mb={0.5}>{media.title}</Typography>

                <Stack spacing={0.5}>
                    {[
                        { label: 'Type',       value: media.type },
                        { label: 'Size',       value: formatSize(media.fileSize) },
                        { label: 'Resolution', value: media.width && media.height ? `${media.width}×${media.height}` : '—' },
                        { label: 'Duration',   value: formatDuration(media.duration) ?? '—' },
                        { label: 'Uploaded',   value: new Date(media.createdAt).toLocaleDateString() },
                    ].map(({ label, value }) => (
                        <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="caption" color="text.secondary">{label}</Typography>
                            <Typography variant="caption" fontWeight={600}>{value}</Typography>
                        </Box>
                    ))}
                </Stack>

                <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <StatusChip status={media.status} />
                    <Tooltip title="Delete">
                        <IconButton
                            size="small"
                            color="error"
                            onClick={() => onDelete(media.id, media.title)}
                            sx={{ '&:hover': { bgcolor: 'error.main', color: 'white' } }}
                        >
                            <Delete sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </Box>
    );
}

// ── Preview Lightbox (click) ──────────────────────────────────────────────────

function MediaPreviewDialog({ media, open, onClose, onDelete }: {
    media: Media | null; open: boolean; onClose: () => void; onDelete: (id: string, title: string) => void;
}) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [editingTitle, setEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState('');
    const [localTitle, setLocalTitle] = useState('');

    // Sync title when dialog opens
    const handleEnter = () => {
        setTitleValue(media?.title ?? '');
        setLocalTitle(media?.title ?? '');
        setEditingTitle(false);
    };

    const renameMutation = useMutation({
        mutationFn: (title: string) => mediaApi.update(media!.id, { title }),
        onSuccess: (_, title) => {
            setLocalTitle(title);
            setEditingTitle(false);
            qc.invalidateQueries({ queryKey: ['media'] });
            dispatch(pushToast({ severity: 'success', message: 'Renamed successfully' }));
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Rename failed') })),
    });

    const commitRename = () => {
        const trimmed = titleValue.trim();
        if (!trimmed || trimmed === localTitle) { setEditingTitle(false); return; }
        renameMutation.mutate(trimmed);
    };

    if (!media) return null;
    const url = media.signedUrl ?? '';

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
            TransitionProps={{ onEnter: handleEnter }}
            PaperProps={{ sx: { bgcolor: 'background.paper', borderRadius: 3, overflow: 'hidden' } }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ flex: 1, mr: 2, minWidth: 0 }}>
                    {editingTitle ? (
                        <TextField
                            value={titleValue}
                            onChange={(e) => setTitleValue(e.target.value)}
                            onBlur={commitRename}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') commitRename();
                                if (e.key === 'Escape') setEditingTitle(false);
                            }}
                            size="small"
                            autoFocus
                            fullWidth
                            disabled={renameMutation.isPending}
                            sx={{ '& .MuiInputBase-input': { fontWeight: 700, fontSize: '1.1rem' } }}
                        />
                    ) : (
                        <Tooltip title={t('media.clickToRename')} placement="bottom-start">
                            <Typography
                                variant="h6" fontWeight={700} noWrap
                                onClick={() => { setTitleValue(localTitle); setEditingTitle(true); }}
                                sx={{ cursor: 'text', '&:hover': { color: 'primary.main' }, transition: 'color 0.15s' }}
                            >
                                {localTitle}
                            </Typography>
                        </Tooltip>
                    )}
                    <Typography variant="caption" color="text.secondary">
                        {formatSize(media.fileSize)}
                        {media.width && media.height ? ` · ${media.width}×${media.height}` : ''}
                    </Typography>
                </Box>
                <IconButton onClick={onClose} size="small"><Close /></IconButton>
            </Box>

            <Box sx={{ bgcolor: 'grey.900', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxHeight: '70vh', overflow: 'hidden' }}>
                {media.type === 'IMAGE' ? (
                    <img src={url} alt={media.title} style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }} />
                ) : (
                    <video src={url} controls style={{ width: '100%', maxHeight: '70vh', display: 'block', background: '#000' }} />
                )}
            </Box>

            <DialogActions sx={{ px: 3, pt: 2, pb: 2, justifyContent: 'space-between' }}>
                <Button size="small" variant="outlined" color="error" startIcon={<Delete />}
                    onClick={() => { onDelete(media.id, media.title); onClose(); }}>
                    Delete
                </Button>
                <Button size="small" onClick={onClose} variant="outlined">Close</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Upload dialog (multi-file) ────────────────────────────────────────────────

interface FileItem {
    id: string;
    file: File;
    title: string;
    duration?: number;
    status: 'pending' | 'uploading' | 'done' | 'error';
    progress: number;
    errorMsg?: string;
}

function getVideoDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
            URL.revokeObjectURL(url);
            resolve(Math.round(video.duration) || 0);
        };
        video.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
        video.src = url;
    });
}

function makeFileItem(file: File): FileItem {
    return {
        id: Math.random().toString(36).slice(2),
        file,
        title: file.name.replace(/\.[^.]+$/, ''),
        status: 'pending',
        progress: 0,
    };
}

function UploadDialog({ open, onClose, storageUsage }: {
    open: boolean;
    onClose: () => void;
    storageUsage?: { usedBytes: number; totalQuotaBytes: number; totalQuotaMb: number; usedMb: number } | null;
}) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [items, setItems] = useState<FileItem[]>([]);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // ── Quota check ───────────────────────────────────────────────────────────
    const pendingBytes = items.filter(i => i.status === 'pending').reduce((s, i) => s + i.file.size, 0);
    const usedBytes    = storageUsage?.usedBytes ?? 0;
    const quotaBytes   = storageUsage?.totalQuotaBytes ?? Infinity;
    const freeBytes    = quotaBytes - usedBytes;
    const alreadyFull  = storageUsage != null && usedBytes >= quotaBytes;
    const wouldExceed  = storageUsage != null && pendingBytes > 0 && (usedBytes + pendingBytes) > quotaBytes;

    // Per-file: cumulative check — mark files that push the total over quota
    const overLimitIds = useMemo(() => {
        if (!storageUsage) return new Set<string>();
        const pending = items.filter(i => i.status === 'pending');
        const ids = new Set<string>();
        let running = usedBytes;
        for (const item of pending) {
            running += item.file.size;
            if (running > quotaBytes) ids.add(item.id);
        }
        return ids;
    }, [items, usedBytes, quotaBytes, storageUsage]);

    const addFiles = async (files: FileList | null) => {
        if (!files) return;
        const newItems = await Promise.all(Array.from(files).map(async (file) => {
            const item = makeFileItem(file);
            if (file.type.startsWith('video/')) {
                item.duration = await getVideoDuration(file);
            }
            return item;
        }));
        setItems(prev => [...prev, ...newItems]);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        addFiles(e.dataTransfer.files);
    }, []);

    const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

    const updateTitle = (id: string, title: string) =>
        setItems(prev => prev.map(i => i.id === id ? { ...i, title } : i));

    const handleUpload = async () => {
        const pending = items.filter(i => i.status === 'pending');
        if (!pending.length) return;
        setUploading(true);

        for (const item of pending) {
            // Mark as uploading
            setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'uploading', progress: 0 } : i));
            try {
                await mediaApi.upload(item.file, item.title, (pct) =>
                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, progress: pct } : i)),
                    item.duration,
                );
                setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done', progress: 100 } : i));
            } catch (err) {
                setItems(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error', errorMsg: getApiError(err, 'Upload failed') } : i));
            }
        }

        qc.invalidateQueries({ queryKey: ['media'] });
        qc.invalidateQueries({ queryKey: ['storage-usage'] });
        setUploading(false);

        // If all done/error, show toast and auto-close if all succeeded
        setItems(prev => {
            const allDone  = prev.every(i => i.status === 'done');
            const anyError = prev.some(i => i.status === 'error');
            if (allDone) {
                dispatch(pushToast({ severity: 'success', message: `${prev.length} file(s) uploaded` }));
            } else if (anyError) {
                dispatch(pushToast({ severity: 'warning', message: 'Some files failed to upload' }));
            }
            return prev;
        });
    };

    const handleClose = () => {
        if (uploading) return;
        setItems([]);
        onClose();
    };

    const pendingCount  = items.filter(i => i.status === 'pending').length;
    const doneCount     = items.filter(i => i.status === 'done').length;
    const allFinished   = items.length > 0 && items.every(i => i.status === 'done' || i.status === 'error');

    const statusIcon = (s: FileItem['status']) => {
        if (s === 'done')      return <CheckCircle sx={{ fontSize: 16, color: 'success.main' }} />;
        if (s === 'error')     return <ErrorIcon   sx={{ fontSize: 16, color: 'error.main' }} />;
        if (s === 'uploading') return <HourglassEmpty sx={{ fontSize: 16, color: 'warning.main' }} />;
        return null;
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    Upload Media
                    {items.length > 0 && (
                        <Typography variant="caption" color="text.secondary">
                            {doneCount}/{items.length} done
                        </Typography>
                    )}
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} sx={{ mt: 0.5 }}>
                    {/* Drop zone */}
                    <Box
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => inputRef.current?.click()}
                        sx={{
                            border: '2px dashed',
                            borderColor: items.length ? 'primary.main' : 'divider',
                            borderRadius: 2, p: 3, textAlign: 'center', cursor: 'pointer',
                            transition: 'all 0.2s',
                            bgcolor: items.length ? 'primary.main' + '0A' : 'transparent',
                            '&:hover': { borderColor: 'primary.main', bgcolor: 'primary.main' + '0A' },
                        }}
                    >
                        <CloudUpload sx={{ fontSize: 36, color: 'primary.main', mb: 0.5 }} />
                        <Typography variant="body2" fontWeight={600}>
                            {t('media.clickOrDrop')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                            {t('media.supportedTypes')}
                        </Typography>
                    </Box>
                    <input
                        ref={inputRef}
                        type="file"
                        hidden
                        multiple
                        accept="video/*,image/*"
                        onChange={(e) => addFiles(e.target.files)}
                        // Reset input so same file can be re-added
                        onClick={(e) => { (e.target as HTMLInputElement).value = ''; }}
                    />

                    {/* Quota warning */}
                    {alreadyFull && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5,
                            bgcolor: theme => alpha(theme.palette.error.main, 0.08), border: '1px solid',
                            borderColor: 'error.light' }}>
                            <WarningAmber color="error" sx={{ fontSize: 18, flexShrink: 0 }} />
                            <Box>
                                <Typography variant="body2" fontWeight={600} color="error.main">
                                    {t('media.storageFull')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {t('media.storageFullDesc', { used: formatSize(usedBytes), total: storageUsage!.totalQuotaMb })}
                                </Typography>
                            </Box>
                        </Box>
                    )}
                    {!alreadyFull && wouldExceed && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.5, borderRadius: 1.5,
                            bgcolor: theme => alpha(theme.palette.warning.main, 0.08), border: '1px solid',
                            borderColor: 'warning.light' }}>
                            <WarningAmber color="warning" sx={{ fontSize: 18, flexShrink: 0 }} />
                            <Box>
                                <Typography variant="body2" fontWeight={600} color="warning.main">
                                    {t('media.willExceed')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {t('media.willExceedDesc', { free: formatSize(freeBytes), count: overLimitIds.size })}
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    {/* File list */}
                    {items.length > 0 && (
                        <List disablePadding sx={{ maxHeight: 320, overflowY: 'auto' }}>
                            {items.map((item) => (
                                <ListItem
                                    key={item.id}
                                    disablePadding
                                    sx={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'stretch',
                                        borderBottom: '1px solid', borderColor: 'divider',
                                        py: 1, px: 0,
                                        bgcolor: overLimitIds.has(item.id) ? theme => alpha(theme.palette.error.main, 0.06) : undefined,
                                    }}
                                >
                                    <Box sx={{ display: 'flex', alignItems: 'center', mb: item.status === 'uploading' ? 0.5 : 0 }}>
                                        {/* Status icon */}
                                        <Box sx={{ width: 24, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
                                            {statusIcon(item.status)}
                                        </Box>

                                        {/* Title input */}
                                        <TextField
                                            value={item.title}
                                            onChange={(e) => updateTitle(item.id, e.target.value)}
                                            size="small"
                                            variant="standard"
                                            disabled={item.status !== 'pending'}
                                            sx={{ flex: 1, mx: 1 }}
                                            InputProps={{ disableUnderline: item.status !== 'pending' }}
                                        />

                                                        {/* File size */}
                                        <Typography variant="caption"
                                            color={overLimitIds.has(item.id) ? 'error.main' : 'text.secondary'}
                                            fontWeight={overLimitIds.has(item.id) ? 700 : 400}
                                            sx={{ flexShrink: 0, mr: 1 }}>
                                            {overLimitIds.has(item.id) && '⚠ '}{formatSize(item.file.size)}
                                        </Typography>

                                        {/* Remove button (only pending) */}
                                        {item.status === 'pending' && (
                                            <IconButton size="small" onClick={() => removeItem(item.id)} sx={{ flexShrink: 0 }}>
                                                <Close sx={{ fontSize: 14 }} />
                                            </IconButton>
                                        )}
                                    </Box>

                                    {/* Progress bar */}
                                    {item.status === 'uploading' && (
                                        <Box sx={{ pl: 3, pr: 1 }}>
                                            <LinearProgress
                                                variant="determinate"
                                                value={item.progress}
                                                sx={{ borderRadius: 1, height: 3 }}
                                            />
                                        </Box>
                                    )}

                                    {/* Error message */}
                                    {item.status === 'error' && item.errorMsg && (
                                        <Typography variant="caption" color="error" sx={{ pl: 3 }}>
                                            {item.errorMsg}
                                        </Typography>
                                    )}
                                </ListItem>
                            ))}
                        </List>
                    )}

                    {/* Add more button (when files already selected) */}
                    {items.length > 0 && !uploading && (
                        <Button
                            size="small"
                            startIcon={<Add />}
                            onClick={() => inputRef.current?.click()}
                            sx={{ alignSelf: 'flex-start'}}
                        >
                            {t('media.addFiles')}
                        </Button>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={handleClose} disabled={uploading}>
                    {allFinished ? 'Close' : 'Cancel'}
                </Button>
                {!allFinished && (
                    <Tooltip title={alreadyFull ? t('media.storageFullTooltip') : wouldExceed ? t('media.clearRedTooltip') : ''}>
                        <span>
                            <Button size="small"
                                disabled={pendingCount === 0 || uploading || alreadyFull || wouldExceed}
                                onClick={handleUpload}
                                startIcon={<CloudUpload />}>
                                {uploading ? 'Uploading...' : `Upload ${pendingCount} file${pendingCount !== 1 ? 's' : ''}`}
                            </Button>
                        </span>
                    </Tooltip>
                )}
            </DialogActions>
        </Dialog>
    );
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortField = 'createdAt' | 'title' | 'fileSize' | 'type';
type SortDir   = 'asc' | 'desc';

function sortMedia(items: Media[], field: SortField, dir: SortDir): Media[] {
    return [...items].sort((a, b) => {
        let cmp = 0;
        if (field === 'createdAt') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        else if (field === 'title')    cmp = a.title.localeCompare(b.title);
        else if (field === 'fileSize') cmp = a.fileSize - b.fileSize;
        else if (field === 'type')     cmp = a.type.localeCompare(b.type);
        return dir === 'asc' ? cmp : -cmp;
    });
}

// ── Main Media Page ───────────────────────────────────────────────────────────

export default function MediaPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const { t } = useTranslation();
    const [search, setSearch]         = useState('');
    const [typeFilter, setTypeFilter] = useState('');
    const [page, setPage]             = useState(1);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [hoveredMedia, setHoveredMedia] = useState<Media | null>(null);
    const [previewMedia, setPreviewMedia] = useState<Media | null>(null);
    const [sortField, setSortField]   = useState<SortField>('createdAt');
    const [sortDir, setSortDir]       = useState<SortDir>('desc');
    const [limit, setLimit]           = useState(10);

    const { data: storageUsage } = useQuery({
        queryKey: ['storage-usage'],
        queryFn: storageQuotaApi.getUsage,
        staleTime: 30_000,
    });

    const { data, isLoading } = useQuery({
        queryKey: ['media', page, limit, search, typeFilter],
        queryFn: () => mediaApi.list({ page, limit: limit === 0 ? 9999 : limit, search: search || undefined, type: typeFilter || undefined }),
        refetchInterval: (query) => {
            const items = (query.state.data as { data: Media[] } | undefined)?.data;
            return Array.isArray(items) && items.some((m: Media) => m.status === 'PROCESSING') ? 3_000 : false;
        },
    });

    const sorted = useMemo(
        () => sortMedia(data?.data ?? [], sortField, sortDir),
        [data?.data, sortField, sortDir],
    );

    const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const deleteMutation = useMutation({
        mutationFn: (id: string) => mediaApi.delete(id),
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: ['media'] });
            qc.invalidateQueries({ queryKey: ['storage-usage'] });
            if (hoveredMedia?.id === id) setHoveredMedia(null);
            setDeleteTarget(null);
            setDeleteError(null);
            dispatch(pushToast({ severity: 'success', message: t('common.success') }));
        },
        onError: (err) => {
            setDeleteError(getApiError(err, t('common.failedAction')));
        },
    });

    const handleDelete = (id: string, title: string) => {
        setDeleteTarget({ id, title });
        setDeleteError(null);
    };

    const handleDeleteClose = () => {
        if (deleteMutation.isPending) return;
        setDeleteTarget(null);
        setDeleteError(null);
    };

    const toggleSort = (field: SortField) => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('asc'); }
    };

    const SortHeader = ({ field, label, center }: { field: SortField; label: string; center?: boolean }) => (
        <TableCell
            align={center ? 'center' : 'left'}
            onClick={() => toggleSort(field)}
            sx={{ cursor: 'pointer', userSelect: 'none', fontWeight: 700, whiteSpace: 'nowrap',
                '&:hover': { bgcolor: 'action.hover' } }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: center ? 'center' : 'flex-start' }}>
                {label}
                {sortField === field
                    ? sortDir === 'asc'
                        ? <ArrowUpward sx={{ fontSize: 14, ml: 0.5 }} />
                        : <ArrowDownward sx={{ fontSize: 14, ml: 0.5 }} />
                    : <ArrowUpward sx={{ fontSize: 14, ml: 0.5, opacity: 0.2 }} />}
            </Box>
        </TableCell>
    );

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>{t('media.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">{data?.total ?? 0} files</Typography>
                </Box>
                <Stack direction="row" alignItems="center" gap={2}>
                    {/* Storage usage */}
                    {storageUsage ? (
                        <Box sx={{ width: 220 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="baseline" mb={0.5}>
                                <Typography variant="caption" color="text.secondary" fontWeight={600}>
                                    {t('storage.title')}
                                </Typography>
                                <Typography variant="caption" fontWeight={700}
                                    color={storageUsage.percentUsed >= 90 ? 'error.main' : storageUsage.percentUsed >= 70 ? 'warning.main' : 'text.primary'}>
                                    {storageUsage.usedMb < 1024
                                        ? `${storageUsage.usedMb.toFixed(1)} MB`
                                        : `${(storageUsage.usedMb / 1024).toFixed(2)} GB`}
                                    {' / '}
                                    {storageUsage.totalQuotaMb >= 1024
                                        ? `${(storageUsage.totalQuotaMb / 1024).toFixed(1)} GB`
                                        : `${storageUsage.totalQuotaMb} MB`}
                                </Typography>
                            </Stack>
                            <Tooltip title={t('media.storageProgress', { pct: storageUsage.percentUsed, count: data?.total ?? 0 })}>
                                <LinearProgress
                                    variant="determinate"
                                    value={Math.min(storageUsage.percentUsed, 100)}
                                    color={storageUsage.percentUsed >= 90 ? 'error' : storageUsage.percentUsed >= 70 ? 'warning' : 'primary'}
                                    sx={{ height: 6, borderRadius: 3,
                                        bgcolor: theme => alpha(
                                            storageUsage.percentUsed >= 90 ? theme.palette.error.main
                                            : storageUsage.percentUsed >= 70 ? theme.palette.warning.main
                                            : theme.palette.primary.main, 0.15),
                                    }}
                                />
                            </Tooltip>
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.3, display: 'block' }}>
                                {t('media.storageProgressFree', {
                                    pct: storageUsage.percentUsed,
                                    free: (() => {
                                        const freeMb = storageUsage.totalQuotaMb - storageUsage.usedMb;
                                        return freeMb >= 1024 ? `${(freeMb / 1024).toFixed(1)} GB` : `${freeMb.toFixed(0)} MB`;
                                    })(),
                                })}
                            </Typography>
                        </Box>
                    ) : (
                        <Skeleton variant="rounded" width={220} height={48} />
                    )}
                    <Button startIcon={<CloudUpload />} onClick={() => setUploadOpen(true)}>
                        Upload
                    </Button>
                </Stack>
            </Stack>

            {/* Filters */}
            <Stack direction="row" spacing={2} mb={2} alignItems="center">
                <TextField
                    placeholder="Search media..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    size="small" sx={{ width: 240 }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
                />
                <FormControl size="small" sx={{ width: 130 }}>
                    <InputLabel>Type</InputLabel>
                    <Select value={typeFilter} label="Type" onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                        <MuiMenuItem value="">All</MuiMenuItem>
                        <MuiMenuItem value="VIDEO">Video</MuiMenuItem>
                        <MuiMenuItem value="IMAGE">Image</MuiMenuItem>
                        <MuiMenuItem value="GIF">GIF</MuiMenuItem>
                        <MuiMenuItem value="HTML">HTML</MuiMenuItem>
                        <MuiMenuItem value="URL">URL</MuiMenuItem>
                    </Select>
                </FormControl>

                <Box sx={{ flex: 1 }} />
            </Stack>

            {/* Split layout: list + preview */}
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>

                {/* ── Left: table list ── */}
                <Box sx={{ flex: 1, minWidth: 0, marginRight: 2 }}>
                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell align="center" sx={{ fontWeight: 700, width: 40 }}></TableCell>
                                    <SortHeader field="title"     label="Name" center />
                                    <SortHeader field="type"      label="Type"     center />
                                    <SortHeader field="fileSize"  label="Size"     center />
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>Resolution</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                                    <SortHeader field="createdAt" label="Uploaded" center />
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading
                                    ? Array.from({ length: 8 }).map((_, i) => (
                                        <TableRow key={i}>
                                            {Array.from({ length: 8 }).map((_, j) => (
                                                <TableCell key={j}><Skeleton variant="text" /></TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                    : sorted.map((media) => (
                                        <TableRow
                                            key={media.id}
                                            hover
                                            onMouseEnter={() => setHoveredMedia(media)}
                                            onClick={() => setPreviewMedia(media)}
                                            sx={{
                                                cursor: 'pointer',
                                                bgcolor: hoveredMedia?.id === media.id ? 'action.selected' : undefined,
                                                transition: 'background 0.15s',
                                            }}
                                        >
                                            {/* Thumbnail */}
                                            <TableCell sx={{ p: '6px 8px' }}>
                                                <Box sx={{
                                                    width: 48, height: 30,
                                                    borderRadius: 0.5, overflow: 'hidden',
                                                    bgcolor: 'grey.800',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}>
                                                    {media.thumbnailUrl ? (
                                                        <img
                                                            src={media.thumbnailUrl}
                                                            alt=""
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                        />
                                                    ) : media.type === 'VIDEO'
                                                        ? <VideoFile sx={{ fontSize: 16, color: '#FF6584' }} />
                                                        : media.type === 'GIF'
                                                        ? <GifBox sx={{ fontSize: 16, color: '#FF9800' }} />
                                                        : <Image sx={{ fontSize: 16, color: '#4CAF82' }} />
                                                    }
                                                </Box>
                                            </TableCell>

                                            {/* Name */}
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 220 }}>
                                                    {media.title}
                                                </Typography>
                                            </TableCell>

                                            {/* Type */}
                                            <TableCell align="center">
                                                <Chip
                                                    label={media.type}
                                                    size="small"
                                                    icon={media.type === 'VIDEO'
                                                        ? <VideoFile sx={{ fontSize: '12px !important', color: '#FF6584 !important' }} />
                                                        : media.type === 'GIF'
                                                        ? <GifBox sx={{ fontSize: '12px !important', color: '#FF9800 !important' }} />
                                                        : <Image sx={{ fontSize: '12px !important', color: '#4CAF82 !important' }} />
                                                    }
                                                    sx={{ fontWeight: 600, fontSize: '0.6rem' }}
                                                    variant="outlined"
                                                />
                                            </TableCell>

                                            {/* Size */}
                                            <TableCell align="center">
                                                <Typography variant="caption" color="text.secondary">
                                                    {formatSize(media.fileSize)}
                                                </Typography>
                                            </TableCell>

                                            {/* Resolution */}
                                            <TableCell align="center">
                                                <Typography variant="caption" color="text.secondary">
                                                    {media.width && media.height ? `${media.width}×${media.height}` : '—'}
                                                </Typography>
                                            </TableCell>

                                            {/* Status */}
                                            <TableCell align="center"><StatusChip status={media.status} /></TableCell>

                                            {/* Uploaded */}
                                            <TableCell align="center">
                                                <Typography variant="caption" color="text.secondary">
                                                    {new Date(media.createdAt).toLocaleDateString()}
                                                </Typography>
                                            </TableCell>

                                            {/* Actions */}
                                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                                <Tooltip title="Delete">
                                                    <IconButton
                                                        size="small"
                                                        color="error"
                                                        onClick={() => handleDelete(media.id, media.title)}
                                                    >
                                                        <Delete sx={{ fontSize: 16}} />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {data && (
                        <TablePagination
                            component="div"
                            count={data.total ?? 0}
                            page={page - 1}
                            onPageChange={(_, p) => setPage(p + 1)}
                            rowsPerPage={limit}
                            onRowsPerPageChange={e => { setLimit(Number(e.target.value)); setPage(1); }}
                            rowsPerPageOptions={[10, 25, 50, 100]}
                            labelRowsPerPage={t("common.perPage")}
                            labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                        />
                    )}

                    {/* Empty state */}
                    {!isLoading && !sorted.length && (
                        <Box textAlign="center" py={8}>
                            <CloudUpload sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
                            <Typography variant="h6" gutterBottom>No media yet</Typography>
                            <Typography variant="body2" color="text.secondary" mb={2}>
                                Upload your first video or image to get started.
                            </Typography>
                            <Button onClick={() => setUploadOpen(true)}>Upload Now</Button>
                        </Box>
                    )}
                </Box>

                {/* ── Right: preview panel ── */}
                <PreviewPanel media={hoveredMedia} onDelete={handleDelete} />
            </Box>

            <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} storageUsage={storageUsage} />

            <MediaPreviewDialog
                media={previewMedia}
                open={Boolean(previewMedia)}
                onClose={() => setPreviewMedia(null)}
                onDelete={handleDelete}
            />

            <DeleteConfirmDialog
                target={deleteTarget}
                onClose={handleDeleteClose}
                onConfirm={(id) => deleteMutation.mutate(id)}
                loading={deleteMutation.isPending}
                errorMsg={deleteError}
            />
        </Box>
    );
}
