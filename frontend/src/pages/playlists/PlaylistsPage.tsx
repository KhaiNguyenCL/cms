import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Button, TextField,
    Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    Skeleton, Divider, Tooltip, InputAdornment,
    CircularProgress, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Grid, Card, CardContent, Pagination, Alert,
    Select, MenuItem, Menu,
} from '@mui/material';
import {
    Add, QueueMusic, Delete, VideoFile, Image, Edit,
    Search, CheckCircle, AllInclusive, DragIndicator, Close,
    ArrowUpward, ArrowDownward, WarningAmber, Save,
    FlashOn, BlurOn, SwipeLeft, ZoomIn,
    PlayCircle, Visibility, PlayArrow, Pause, SkipNext, SkipPrevious,
} from '@mui/icons-material';
import LinearProgress from '@mui/material/LinearProgress';
import {
    DndContext, closestCenter, PointerSensor, useSensor, useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext, verticalListSortingStrategy,
    useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { playlistsApi } from '@api/playlists.api';
import { mediaApi } from '@api/media.api';
import { getApiError } from '@api/client';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import type { Playlist, PlaylistItem, Media } from '@/types';

// ── Types ─────────────────────────────────────────────────────────────────────

// LocalItem = PlaylistItem that may be unsaved (_isNew = true → no DB id yet)
type LocalItem = PlaylistItem & { _isNew?: boolean };

// ── Helpers ───────────────────────────────────────────────────────────────────

function typeIcon(type?: string) {
    if (type === 'VIDEO') return <VideoFile sx={{ fontSize: 20 }} />;
    return <Image sx={{ fontSize: 20 }} />;
}

function formatSize(bytes: number) {
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function fmtTime(totalSecs: number): string {
    const m = Math.floor(totalSecs / 60);
    const s = Math.floor(totalSecs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseTimestamp(str: string): number | null {
    const parts = str.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] < 60) {
        return parts[0] * 60 + parts[1];
    }
    return null;
}

function fmtDuration(secs: number): string {
    return `${secs}s`;
}

function fmtTotalDuration(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m > 0 ? `${m}m ` : ''}${s}s`;
}

// ── Add Media Picker Dialog (staged — returns items to parent, no API call) ────

function AddMediaDialog({
    open,
    onClose,
    onConfirm,
    existingMediaIds,
    hasForeverItem,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: (items: { media: Media; duration: number }[]) => void;
    existingMediaIds: Set<string>;
    hasForeverItem: boolean;
}) {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState<Map<string, number>>(new Map());
    const [loopForever, setLoopForever] = useState<Set<string>>(new Set());

    const { data: videoData, isLoading } = useQuery({
        queryKey: ['media-picker-all', page, search],
        queryFn: () => mediaApi.list({ page, limit: 24, search: search || undefined }),
        enabled: open,
    });

    const allMedia = videoData?.data ?? [];

    const toggleSelect = (media: Media) => {
        setSelected(prev => {
            const next = new Map(prev);
            if (next.has(media.id)) {
                next.delete(media.id);
                setLoopForever(lf => { const s = new Set(lf); s.delete(media.id); return s; });
            } else {
                // Default: use actual video duration, 10s for images
                const defaultDur = media.type === 'VIDEO' && media.duration != null && media.duration > 0 ? media.duration : 10;
                next.set(media.id, defaultDur);
            }
            return next;
        });
    };

    const toggleLoop = (mediaId: string) => {
        setLoopForever(prev => {
            const next = new Set(prev);
            if (next.has(mediaId)) {
                next.delete(mediaId);
                setSelected(s => { const m = new Map(s); m.set(mediaId, 10); return m; });
            } else {
                next.add(mediaId);
                setSelected(s => { const m = new Map(s); m.set(mediaId, 86400); return m; });
            }
            return next;
        });
    };

    const handleClose = () => {
        setSelected(new Map()); setLoopForever(new Set()); setSearch(''); setPage(1); onClose();
    };

    const handleConfirm = () => {
        const items: { media: Media; duration: number }[] = [];
        for (const [mediaId, duration] of selected.entries()) {
            const media = allMedia.find(m => m.id === mediaId);
            if (media) items.push({ media, duration });
        }
        onConfirm(items);
        handleClose();
    };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
            <DialogTitle>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="h6" fontWeight={700}>Thêm Media vào Playlist</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {selected.size > 0 ? `${selected.size} đã chọn` : 'Click để chọn media'}
                        </Typography>
                    </Box>
                    {selected.size > 0 && (
                        <Chip label={`${selected.size} đã chọn`} color="primary" size="small" onDelete={() => setSelected(new Map())} />
                    )}
                </Stack>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <TextField
                        placeholder="Tìm media..."
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        size="small" fullWidth
                        InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
                    />
                </Box>
                <Box sx={{ p: 2 }}>
                    {isLoading ? (
                        <Grid container spacing={1.5}>
                            {Array.from({ length: 8 }).map((_, i) => (
                                <Grid key={i} size={{ xs: 6, sm: 4, md: 3 }}><Skeleton variant="rounded" height={130} /></Grid>
                            ))}
                        </Grid>
                    ) : !allMedia.length ? (
                        <Box textAlign="center" py={4}>
                            <Image sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
                            <Typography color="text.secondary">Không tìm thấy media</Typography>
                        </Box>
                    ) : (
                        <Grid container spacing={1.5}>
                            {allMedia.map((media: Media) => {
                                const isSelected = selected.has(media.id);
                                const alreadyIn = existingMediaIds.has(media.id);
                                const isProcessing = media.status === 'PROCESSING';
                                const disabled = alreadyIn || isProcessing;
                                const thumbUrl = media.thumbnailUrl ?? null;
                                return (
                                    <Grid key={media.id} size={{ xs: 6, sm: 4, md: 3 }}>
                                        <Card
                                            onClick={() => !disabled && toggleSelect(media)}
                                            sx={{
                                                cursor: disabled ? 'default' : 'pointer',
                                                border: '2px solid',
                                                borderColor: isSelected ? 'primary.main' : 'transparent',
                                                opacity: disabled ? 0.5 : 1,
                                                transition: 'all 0.15s', position: 'relative',
                                                '&:hover': !disabled ? { borderColor: isSelected ? 'primary.main' : 'action.focus' } : {},
                                            }}
                                        >
                                            {isSelected && (
                                                <Box sx={{ position: 'absolute', top: 6, right: 6, zIndex: 2 }}>
                                                    <CheckCircle sx={{ color: 'primary.main', fontSize: 22, filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }} />
                                                </Box>
                                            )}
                                            {alreadyIn && (
                                                <Chip label="Đã có" size="small" sx={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: '0.6rem', bgcolor: 'rgba(0,0,0,0.7)', color: 'white' }} />
                                            )}
                                            {isProcessing && (
                                                <Chip label="Đang xử lý" size="small" sx={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: '0.6rem', bgcolor: 'rgba(237,108,2,0.85)', color: 'white' }} />
                                            )}
                                            <Box sx={{ aspectRatio: '16/9', bgcolor: 'action.hover', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {thumbUrl
                                                    ? <img src={thumbUrl} alt={media.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    : <Box sx={{ color: 'text.secondary' }}>{typeIcon(media.type)}</Box>
                                                }
                                            </Box>
                                            <CardContent sx={{ p: 1, '&:last-child': { pb: '8px !important' } }}>
                                                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
                                                    <Typography variant="caption" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>{media.title}</Typography>
                                                    {media.type === 'VIDEO' && media.duration != null && media.duration > 0 ? (
                                                        <Chip label={fmtDuration(media.duration)} size="small" color="primary" variant="outlined" sx={{ fontSize: '0.6rem', height: 16, flexShrink: 0, '& .MuiChip-label': { px: '4px' } }} />
                                                    ) : null}
                                                </Stack>
                                                <Typography variant="caption" color="text.secondary">{formatSize(media.fileSize)}</Typography>
                                                {isSelected && (
                                                    <Box onClick={(e) => e.stopPropagation()} mt={0.5}>
                                                        <Stack direction="row" alignItems="center" spacing={0.5}>
                                                            {(() => {
                                                                const alreadyForever = loopForever.has(media.id);
                                                                const otherHasForever = !alreadyForever && (hasForeverItem || loopForever.size > 0);
                                                                return (
                                                                    <Tooltip title={alreadyForever ? 'Tắt hiện mãi' : otherHasForever ? 'Playlist đã có item hiện mãi' : 'Hiện mãi'}>
                                                                        <span>
                                                                            <IconButton size="small" color={alreadyForever ? 'primary' : 'default'} onClick={() => toggleLoop(media.id)} disabled={otherHasForever} sx={{ p: 0.5 }}>
                                                                                <AllInclusive sx={{ fontSize: 16 }} />
                                                                            </IconButton>
                                                                        </span>
                                                                    </Tooltip>
                                                                );
                                                            })()}
                                                            {loopForever.has(media.id)
                                                                ? <Typography variant="caption" color="primary" fontWeight={700}>Hiện mãi</Typography>
                                                                : <Chip
                                                                    size="small"
                                                                    label={fmtDuration(selected.get(media.id) ?? 10)}
                                                                    variant="outlined"
                                                                    sx={{ fontSize: '0.65rem', height: 20 }}
                                                                />
                                                            }
                                                        </Stack>
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
                {videoData && videoData.totalPages > 1 && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', pb: 2 }}>
                        <Pagination count={videoData.totalPages} page={page} onChange={(_, p) => setPage(p)} size="small" color="primary" />
                    </Box>
                )}
            </DialogContent>

            <DialogActions sx={{ px: 2.5, py: 1.5 }}>
                <Button onClick={handleClose}>Huỷ</Button>
                <Button
                    variant="contained"
                    disabled={selected.size === 0}
                    startIcon={<Add />}
                    onClick={handleConfirm}
                >
                    Thêm {selected.size > 0 ? selected.size : ''} vào danh sách
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Duration inline editor (staged — calls onChange instead of API) ────────────

function DurationCell({
    item,
    onChange,
}: {
    item: LocalItem;
    onChange: (itemId: string, secs: number) => void;
}) {
    const isForever = (item.duration ?? 0) >= 86400;
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(String(item.duration ?? 10));

    const commit = () => {
        const secs = Math.max(1, parseInt(value) || 10);
        if (secs !== item.duration) onChange(item.id, secs);
        setEditing(false);
    };

    if (isForever) {
        return (
            <Tooltip title="Click để đổi thời gian">
                <Chip label="∞" size="small" color="primary" variant="outlined"
                    onClick={() => { setValue('10'); setEditing(true); }}
                    sx={{ fontWeight: 700, cursor: 'pointer', fontSize: '0.65rem', minWidth: 36 }} />
            </Tooltip>
        );
    }

    if (editing) {
        return (
            <TextField
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
                type="text" inputMode="numeric" size="small" autoFocus
                inputProps={{ style: { width: 36, padding: '2px 4px', fontSize: '0.8rem' } }}
                sx={{ width: 64 }}
                InputProps={{ endAdornment: <InputAdornment position="end"><Typography variant="caption">s</Typography></InputAdornment> }}
            />
        );
    }

    return (
        <Tooltip title="Click để đổi thời gian">
            <Chip label={`${item.duration ?? 10}s`} size="small" variant="outlined"
                onClick={() => { setValue(String(item.duration ?? 10)); setEditing(true); }}
                sx={{ fontWeight: 600, cursor: 'pointer', fontSize: '0.65rem', minWidth: 36, '&:hover': { bgcolor: 'action.hover' } }} />
        </Tooltip>
    );
}

// ── Timeline timestamp marker ─────────────────────────────────────────────────

function TimestampMarker({
    idx, startSecs, prevStartSecs, prevItem, isFinal = false,
    onDurationChange,
}: {
    idx: number; startSecs: number; prevStartSecs: number;
    prevItem: LocalItem | null; isFinal?: boolean;
    onDurationChange: (itemId: string, secs: number) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState('');

    const commit = () => {
        const parsed = parseTimestamp(value);
        if (parsed === null || parsed <= prevStartSecs || !prevItem) { setEditing(false); return; }
        const newDuration = parsed - prevStartSecs;
        if (newDuration < 1) { setEditing(false); return; }
        onDurationChange(prevItem.id, newDuration);
        setEditing(false);
    };

    const isEditable = !isFinal && idx > 0 && startSecs >= 0
        && !(prevItem && (prevItem.duration ?? 0) >= 86400);

    const label = startSecs < 0 ? '∞' : fmtTime(startSecs);

    return (
        <Box sx={{
            display: 'flex', alignItems: 'center', px: 1.5, py: 0.3,
            bgcolor: 'action.hover',
            borderTop: idx === 0 ? 'none' : '1px solid',
            borderColor: 'divider',
        }}>
            {editing ? (
                <TextField
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
                    size="small" autoFocus placeholder="MM:SS"
                    inputProps={{ style: { width: 42, padding: '2px 4px', fontFamily: 'monospace', fontSize: '0.8rem' } }}
                    sx={{ width: 70 }}
                />
            ) : (
                <Tooltip
                    title={isEditable ? 'Click để chỉnh mốc (thay đổi thời lượng media trước)' : ''}
                    disableHoverListener={!isEditable}
                >
                    <Typography
                        variant="caption"
                        onClick={isEditable ? () => { setValue(fmtTime(startSecs)); setEditing(true); } : undefined}
                        sx={{
                            fontFamily: 'monospace', fontWeight: 700, fontSize: '0.85rem',
                            color: isEditable ? 'primary.main' : 'text.secondary',
                            cursor: isEditable ? 'pointer' : 'default',
                            '&:hover': isEditable ? { textDecoration: 'underline' } : {},
                            userSelect: 'none',
                        }}
                    >
                        {label}
                    </Typography>
                </Tooltip>
            )}
            <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider', ml: 1 }} />
        </Box>
    );
}

// ── Transition config ─────────────────────────────────────────────────────────

const TRANSITIONS = [
    { value: 'FADE',  label: 'Crossfade',    icon: <BlurOn    sx={{ fontSize: 15 }} /> },
    { value: 'NONE',  label: 'Tức thì',      icon: <FlashOn   sx={{ fontSize: 15 }} /> },
    { value: 'SLIDE', label: 'Trượt',        icon: <SwipeLeft sx={{ fontSize: 15 }} /> },
    { value: 'ZOOM',  label: 'Phóng to',     icon: <ZoomIn    sx={{ fontSize: 15 }} /> },
    { value: 'WIPE',  label: 'Màn trập',     icon: <SwipeLeft sx={{ fontSize: 15, transform: 'scaleX(-1)' }} /> },
    { value: 'FLIP',  label: 'Lật trang',    icon: <ZoomIn    sx={{ fontSize: 15, transform: 'scaleX(-1)' }} /> },
];

function getTransition(val?: string | null) {
    return TRANSITIONS.find(t => t.value === (val ?? 'FADE')) ?? TRANSITIONS[0];
}

const DEFAULT_TRANS_MS = 800;

function TransitionPicker({
    value, transitionDuration, onChange, onDurationChange,
}: {
    value?: string | null;
    transitionDuration?: number | null;
    onChange: (v: string) => void;
    onDurationChange: (ms: number) => void;
}) {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const current = getTransition(value);
    const durMs = transitionDuration ?? DEFAULT_TRANS_MS;
    const hasAnimation = (value ?? 'FADE') !== 'NONE';
    return (
        <>
            <Box
                sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    py: 0.25, gap: 0.5, bgcolor: 'action.hover',
                    borderTop: '1px dashed', borderBottom: '1px dashed', borderColor: 'divider',
                }}
            >
                <Tooltip title="Hiệu ứng chuyển cảnh — nhấn để thay đổi">
                    <Chip
                        size="small"
                        icon={current.icon}
                        label={current.label}
                        onClick={e => setAnchor(e.currentTarget)}
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', height: 20, cursor: 'pointer', borderStyle: 'dashed' }}
                    />
                </Tooltip>
                {hasAnimation && (
                    <Tooltip title={`Thời gian hiệu ứng: ${durMs}ms`}>
                        <Box
                            component="input"
                            type="number"
                            min={100}
                            max={5000}
                            step={100}
                            value={durMs}
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                const v = Math.max(100, Math.min(5000, Number(e.target.value)));
                                if (!isNaN(v)) onDurationChange(v);
                            }}
                            sx={{
                                width: 60, fontSize: '0.65rem', textAlign: 'center',
                                border: '1px dashed', borderColor: 'divider', borderRadius: '4px',
                                bgcolor: 'transparent', color: 'text.secondary',
                                p: '1px 4px', outline: 'none', cursor: 'pointer',
                                '&::-webkit-inner-spin-button': { display: 'none' },
                            }}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        />
                    </Tooltip>
                )}
                {hasAnimation && (
                    <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem' }}>ms</Typography>
                )}
            </Box>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                {TRANSITIONS.map(t => (
                    <MenuItem
                        key={t.value}
                        selected={t.value === (value ?? 'FADE')}
                        onClick={() => { onChange(t.value); setAnchor(null); }}
                        sx={{ fontSize: '0.8rem', gap: 1, minWidth: 140 }}
                    >
                        {t.icon}{t.label}
                    </MenuItem>
                ))}
            </Menu>
        </>
    );
}

// ── Sortable item row ─────────────────────────────────────────────────────────

function SortableItem({
    item, onRemove, onDurationChange, totalItems, onPreview,
}: {
    item: LocalItem;
    onRemove: (id: string) => void;
    onDurationChange: (itemId: string, secs: number) => void;
    totalItems: number;
    onPreview: (item: LocalItem) => void;
}) {
    const [loopDialog, setLoopDialog] = useState(false);

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 999 : undefined,
    };

    const thumbUrl = item.media?.thumbnailUrl ?? null;
    const isForever = (item.duration ?? 0) >= 86400;

    const handleLoopClick = () => {
        if (totalItems > 1) { setLoopDialog(true); return; }
        onDurationChange(item.id, isForever ? 10 : 86400);
    };

    return (
        <>
            <Box ref={setNodeRef} style={style}>
                <Box sx={{
                    display: 'flex', alignItems: 'center', py: 1, px: 1.5,
                    bgcolor: item._isNew ? 'primary.main' + '08' : isDragging ? 'rgba(99,102,241,0.06)' : 'background.paper',
                    '&:hover': { bgcolor: 'action.hover' },
                    minHeight: 72,
                    borderLeft: item._isNew ? '3px solid' : 'none',
                    borderColor: 'primary.main',
                }}>
                    <Box {...attributes} {...listeners}
                        sx={{ mr: 1.5, color: 'text.disabled', cursor: 'grab', display: 'flex', alignItems: 'center', touchAction: 'none', flexShrink: 0, '&:active': { cursor: 'grabbing' } }}>
                        <DragIndicator sx={{ fontSize: 18 }} />
                    </Box>

                    <Box onClick={() => onPreview(item)}
                        sx={{ width: 96, height: 60, borderRadius: 1, overflow: 'hidden', bgcolor: 'grey.800', flexShrink: 0, mr: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative', '&:hover .prev-ov': { opacity: 1 } }}>
                        {thumbUrl
                            ? <img src={thumbUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            : <Box sx={{ color: 'grey.500', display: 'flex' }}>{typeIcon(item.media?.type)}</Box>
                        }
                        <Box className="prev-ov" sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}>
                            <Visibility sx={{ color: '#fff', fontSize: 18 }} />
                        </Box>
                    </Box>

                    <Box sx={{ flex: 1, minWidth: 0, mr: 1.5 }}>
                        <Typography variant="body2" fontWeight={600} noWrap display="block">
                            {item.media?.title ?? 'Unknown'}
                        </Typography>
                        <Stack direction="row" alignItems="center" gap={0.5}>
                            <Typography variant="caption" color="text.secondary">{item.media?.type}</Typography>
                            {item.media?.type === 'VIDEO' && item.media?.duration != null && item.media.duration > 0 && (
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.85rem' }}>
                                    ({fmtDuration(item.media.duration)})
                                </Typography>
                            )}
                            {item._isNew && <Chip label="Chưa lưu" size="small" color="primary" variant="outlined" sx={{ fontSize: '0.55rem', height: 14, px: 0.3 }} />}
                        </Stack>
                    </Box>

                    <Tooltip title={isForever ? 'Tắt hiện mãi' : 'Hiện mãi (lặp liên tục)'}>
                        <span>
                            <IconButton size="small" color={isForever ? 'primary' : 'default'} onClick={handleLoopClick} sx={{ mr: 0.5 }}>
                                <AllInclusive sx={{ fontSize: 22 }} />
                            </IconButton>
                        </span>
                    </Tooltip>

                    <Box sx={{ mr: 0.5, flexShrink: 0 }}>
                        <DurationCell item={item} onChange={onDurationChange} />
                    </Box>

                    <IconButton size="small" color="error" onClick={() => onRemove(item.id)}>
                        <Delete sx={{ fontSize: 15 }} />
                    </IconButton>
                </Box>
            </Box>

            <Dialog open={loopDialog} onClose={() => setLoopDialog(false)} maxWidth="xs">
                <DialogTitle>Không thể bật Hiện mãi</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        Chế độ <strong>Hiện mãi</strong> chỉ có thể bật khi playlist chỉ có <strong>1 media</strong>.
                        <br /><br />
                        Hiện tại playlist có <strong>{totalItems} media</strong>.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setLoopDialog(false)}>Đã hiểu</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ── Playlist Preview Dialog ───────────────────────────────────────────────────

const PREVIEW_MAX_SECS = 10; // cap "hiện mãi" items at 10s in preview

function PlaylistPreviewDialog({ open, onClose, items }: {
    open: boolean;
    onClose: () => void;
    items: LocalItem[];
}) {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [playing, setPlaying] = useState(true);
    const [progress, setProgress] = useState(0);
    const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
    const [fetching, setFetching] = useState(false);
    const startRef = useRef<number>(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch all signed URLs when dialog opens
    useEffect(() => {
        if (!open || items.length === 0) return;
        setFetching(true);
        setCurrentIdx(0);
        setProgress(0);
        setPlaying(true);
        const ids = items.map(i => i.mediaId ?? i.media?.id ?? '').filter(Boolean);
        Promise.all(ids.map(id => mediaApi.get(id).catch(() => null))).then(results => {
            const urls: Record<string, string> = {};
            results.forEach((m, i) => { if (m?.signedUrl) urls[ids[i]] = m.signedUrl; });
            setMediaUrls(urls);
            setFetching(false);
        });
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Auto-advance timer
    useEffect(() => {
        if (!open || fetching || !playing || items.length === 0) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        const item = items[currentIdx];
        const durMs = Math.min(item.duration ?? 10, PREVIEW_MAX_SECS) * 1000;
        startRef.current = Date.now();
        intervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startRef.current;
            setProgress(Math.min(100, (elapsed / durMs) * 100));
            if (elapsed >= durMs) {
                clearInterval(intervalRef.current!);
                if (currentIdx < items.length - 1) {
                    setCurrentIdx(prev => prev + 1);
                    setProgress(0);
                } else {
                    setPlaying(false);
                    setProgress(100);
                }
            }
        }, 50);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [open, fetching, playing, currentIdx, items]);

    const goTo = (idx: number) => { setCurrentIdx(idx); setProgress(0); setPlaying(true); };

    if (!open) return null;
    const item = items[currentIdx];
    const mediaId = item?.mediaId ?? item?.media?.id ?? '';
    const signedUrl = mediaUrls[mediaId];
    const isVideo = item?.media?.type === 'VIDEO';
    const dispDur = (item?.duration ?? 0) >= 86400 ? PREVIEW_MAX_SECS : (item?.duration ?? 10);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { bgcolor: '#0d0d0d', color: '#fff', borderRadius: 2, overflow: 'hidden' } }}>
            {/* Title bar */}
            <Box sx={{ px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <PlayCircle sx={{ color: 'primary.main', fontSize: 20 }} />
                    <Typography fontWeight={700} fontSize="0.95rem">Preview Playlist</Typography>
                    <Chip label={`${currentIdx + 1} / ${items.length}`} size="small"
                        sx={{ fontSize: '0.65rem', bgcolor: 'rgba(255,255,255,0.08)', color: 'grey.400' }} />
                </Stack>
                <IconButton size="small" onClick={onClose} sx={{ color: 'grey.500' }}>
                    <Close fontSize="small" />
                </IconButton>
            </Box>

            {/* Media area */}
            <Box sx={{ bgcolor: '#000', minHeight: 420, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {fetching ? (
                    <CircularProgress />
                ) : signedUrl ? (
                    isVideo ? (
                        <video key={signedUrl} src={signedUrl} autoPlay muted playsInline
                            style={{ maxWidth: '100%', maxHeight: 480, display: 'block' }} />
                    ) : (
                        <img key={signedUrl} src={signedUrl} alt={item?.media?.title}
                            style={{ maxWidth: '100%', maxHeight: 480, objectFit: 'contain', display: 'block' }} />
                    )
                ) : (
                    <Box textAlign="center" sx={{ color: 'grey.700' }}>
                        {typeIcon(item?.media?.type)}
                        <Typography variant="caption" display="block" mt={1}>Không tải được media</Typography>
                    </Box>
                )}
            </Box>

            {/* Progress bar */}
            <LinearProgress variant="determinate" value={progress}
                sx={{ height: 2, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { transition: 'none' } }} />

            {/* Controls */}
            <Box sx={{ px: 2.5, py: 1.5, bgcolor: '#111' }}>
                <Typography variant="body2" fontWeight={600} noWrap sx={{ mb: 0.5, color: 'grey.100' }}>
                    {item?.media?.title ?? 'Unknown'}
                </Typography>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" gap={1}>
                        <Chip label={item?.media?.type} size="small"
                            sx={{ fontSize: '0.62rem', bgcolor: 'rgba(255,255,255,0.06)', color: 'grey.500' }} />
                        <Typography variant="caption" color="grey.600">
                            {(item?.duration ?? 0) >= 86400
                                ? `∞ → preview ${PREVIEW_MAX_SECS}s`
                                : `${dispDur}s`}
                        </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        <IconButton size="small" onClick={() => goTo(currentIdx - 1)}
                            disabled={currentIdx === 0} sx={{ color: 'grey.400' }}>
                            <SkipPrevious />
                        </IconButton>
                        <IconButton onClick={() => setPlaying(p => !p)}
                            sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' }, width: 36, height: 36 }}>
                            {playing ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
                        </IconButton>
                        <IconButton size="small" onClick={() => goTo(currentIdx + 1)}
                            disabled={currentIdx === items.length - 1} sx={{ color: 'grey.400' }}>
                            <SkipNext />
                        </IconButton>
                    </Stack>
                </Stack>

                {/* Item strip */}
                <Stack direction="row" gap={0.75} mt={1.5} sx={{ overflowX: 'auto', pb: 0.5 }}>
                    {items.map((it, idx) => (
                        <Box key={it.id} onClick={() => goTo(idx)}
                            sx={{
                                width: 52, height: 34, flexShrink: 0, borderRadius: 0.75, overflow: 'hidden',
                                border: idx === currentIdx ? '2px solid' : '2px solid transparent',
                                borderColor: idx === currentIdx ? 'primary.main' : 'transparent',
                                cursor: 'pointer', bgcolor: 'grey.900', opacity: idx === currentIdx ? 1 : 0.5,
                                transition: 'opacity 0.15s, border-color 0.15s',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                            {it.media?.thumbnailUrl
                                ? <img src={it.media.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                : <Box sx={{ color: 'grey.700', display: 'flex', fontSize: 14 }}>{typeIcon(it.media?.type)}</Box>
                            }
                        </Box>
                    ))}
                </Stack>
            </Box>
        </Dialog>
    );
}

// ── Playlist right panel ──────────────────────────────────────────────────────

function PlaylistPanel({ playlistId, onClose }: { playlistId: string | null; onClose: () => void }) {
    if (!playlistId) {
        return (
            <Box sx={{
                flex: 1, minWidth: 0,
                border: '1px dashed', borderColor: 'divider', borderRadius: 2,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: 'text.disabled', p: 3, minHeight: 380,
                position: 'sticky', top: 80, alignSelf: 'flex-start',
            }}>
                <QueueMusic sx={{ fontSize: 48, mb: 1, opacity: 0.4 }} />
                <Typography variant="body2" textAlign="center">Click vào playlist để xem danh sách media</Typography>
            </Box>
        );
    }
    return <PlaylistPanelInner playlistId={playlistId} onClose={onClose} />;
}

function PlaylistPanelInner({ playlistId, onClose }: { playlistId: string; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [addMediaOpen, setAddMediaOpen] = useState(false);
    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewStartIdx, setPreviewStartIdx] = useState(0);

    // ── Server state (source of truth) ────────────────────────────────────────
    const { data, isLoading } = useQuery({
        queryKey: ['playlist', playlistId],
        queryFn: () => playlistsApi.get(playlistId),
    });
    const serverItems: PlaylistItem[] = data?.items ?? [];

    // ── Local staged state ────────────────────────────────────────────────────
    const [localItems, setLocalItems] = useState<LocalItem[]>([]);
    const [loadedForId, setLoadedForId] = useState<string | null>(null);

    // Derived state reset: runs synchronously during render when playlist switches
    if (loadedForId !== null && loadedForId !== playlistId) {
        setLoadedForId(null);
        setLocalItems([]);
    }

    // Sync from server once data arrives for the current playlist
    useEffect(() => {
        if (!data) return;
        setLoadedForId(playlistId);
        setLocalItems(data.items ?? []);
    }, [data, playlistId]);

    // ── Dirty detection ───────────────────────────────────────────────────────
    const isDirty = useMemo(() => {
        if (localItems.some(i => i._isNew)) return true;
        if (localItems.length !== serverItems.length) return true;
        for (let i = 0; i < localItems.length; i++) {
            if (localItems[i].id !== serverItems[i]?.id) return true;
            if (localItems[i].duration !== serverItems[i]?.duration) return true;
            if ((localItems[i].transition ?? 'FADE') !== (serverItems[i]?.transition ?? 'FADE')) return true;
            if ((localItems[i].transitionDuration ?? 800) !== (serverItems[i]?.transitionDuration ?? 800)) return true;
        }
        return false;
    }, [localItems, serverItems]);

    // ── Staged change handlers ────────────────────────────────────────────────

    const handleDurationChange = useCallback((itemId: string, secs: number) => {
        setLocalItems(prev => prev.map(item => {
            if (item.id === itemId) return { ...item, duration: secs };
            // If setting this item to "hiện mãi", reset any other "hiện mãi" items to 10s
            if (secs >= 86400 && (item.duration ?? 0) >= 86400) return { ...item, duration: 10 };
            return item;
        }));
    }, []);

    const handleRemove = useCallback((itemId: string) => {
        setLocalItems(prev => prev.filter(i => i.id !== itemId));
    }, []);

    const handleTransitionChange = useCallback((itemId: string, transition: string) => {
        setLocalItems(prev => prev.map(i => i.id === itemId ? { ...i, transition } : i));
    }, []);

    const handleTransitionDurationChange = useCallback((itemId: string, transitionDuration: number) => {
        setLocalItems(prev => prev.map(i => i.id === itemId ? { ...i, transitionDuration } : i));
    }, []);

    const handleStagedAdd = useCallback((items: { media: Media; duration: number }[]) => {
        setLocalItems(prev => [
            ...prev,
            ...items.map((it, idx) => ({
                id: `new-${Date.now()}-${idx}`,
                playlistId,
                mediaId: it.media.id,
                media: it.media as any,
                displayOrder: prev.length + idx,
                duration: it.duration,
                _isNew: true,
            } as LocalItem)),
        ]);
    }, [playlistId]);

    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setLocalItems(prev => {
            const oldIdx = prev.findIndex(i => i.id === active.id);
            const newIdx = prev.findIndex(i => i.id === over.id);
            return arrayMove(prev, oldIdx, newIdx);
        });
    }, []);

    // ── Save mutation ─────────────────────────────────────────────────────────

    const saveMutation = useMutation({
        mutationFn: async () => {
            const serverIds = new Set(serverItems.map(i => i.id));
            const localRealIds = new Set(localItems.filter(i => !i._isNew).map(i => i.id));

            // 1. Delete removed items
            const toDelete = serverItems.filter(i => !localRealIds.has(i.id));
            await Promise.all(toDelete.map(i => playlistsApi.removeItem(playlistId, i.id)));

            // 2. Add new items (sequential — need real IDs)
            const newItems = localItems.filter(i => i._isNew);
            const addedRealIds: string[] = [];
            for (const item of newItems) {
                const added = await playlistsApi.addItem(playlistId, item.mediaId, item.duration ?? 10);
                addedRealIds.push(added.id);
            }

            // 3. Update duration overrides + transition for existing items that changed
            const existingChanges = localItems.filter(i => {
                if (i._isNew) return false;
                const server = serverItems.find(si => si.id === i.id);
                if (!server) return false;
                return server.duration !== i.duration ||
                    (server.transition ?? 'FADE') !== (i.transition ?? 'FADE') ||
                    (server.transitionDuration ?? 800) !== (i.transitionDuration ?? 800);
            });
            await Promise.all(existingChanges.map(i =>
                playlistsApi.updateItem(playlistId, i.id, {
                    durationOverride: i.duration ?? 10,
                    transition: i.transition ?? 'FADE',
                    transitionDuration: i.transitionDuration ?? null,
                })
            ));

            // 4. Reorder to match current local order (map temp IDs → real IDs)
            let addedIdx = 0;
            const finalOrder = localItems.map(item => {
                if (item._isNew) return addedRealIds[addedIdx++];
                return item.id;
            });

            if (finalOrder.length > 1) {
                await playlistsApi.reorderItems(playlistId, finalOrder.map((id, idx) => ({ itemId: id, position: idx })));
            }
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlist', playlistId] });
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: 'Playlist đã được lưu và cập nhật thiết bị' }));
        },
        onError: (err) => {
            dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Lưu thất bại, vui lòng thử lại') }));
        },
    });

    const handleDiscard = () => {
        setLocalItems(serverItems);
    };

    // ── Computed timeline ─────────────────────────────────────────────────────

    const startTimes = useMemo(() => {
        const times: number[] = [];
        let t = 0;
        for (const item of localItems) {
            times.push(t);
            const dur = item.duration ?? 10;
            if (dur >= 86400) {
                while (times.length < localItems.length) times.push(-1);
                break;
            }
            t += dur;
        }
        while (times.length < localItems.length) times.push(t);
        return times;
    }, [localItems]);

    const totalSecs = useMemo(() => {
        if (localItems.some(i => (i.duration ?? 0) >= 86400)) return null;
        return localItems.reduce((sum, i) => sum + (i.duration ?? 10), 0);
    }, [localItems]);

    const existingMediaIds = useMemo(
        () => new Set(localItems.map(it => it.mediaId ?? it.media?.id ?? '')),
        [localItems],
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <Box sx={{
            flex: 1, minWidth: 0,
            border: '1px solid', borderColor: isDirty ? 'warning.main' : 'divider',
            borderRadius: 2, overflow: 'hidden',
            position: 'sticky', top: 80, alignSelf: 'flex-start',
            maxHeight: 'calc(100vh - 100px)',
            display: 'flex', flexDirection: 'column',
            transition: 'border-color 0.2s',
        }}>
            {/* Header */}
            <Box sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box sx={{ minWidth: 0 }}>
                        {isLoading
                            ? <Skeleton width={140} />
                            : <Typography variant="subtitle2" fontWeight={700} noWrap>{data?.name}</Typography>
                        }
                        <Typography variant="caption" color="text.secondary">
                            {localItems.length} items
                            {totalSecs !== null && ` · ${fmtTotalDuration(totalSecs)}`}
                            {isDirty && <Typography component="span" variant="caption" color="warning.main"> · Chưa lưu</Typography>}
                        </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        {isDirty && (
                            <Button size="small" color="inherit" onClick={handleDiscard}
                                disabled={saveMutation.isPending}
                                sx={{ fontSize: '0.72rem', color: 'text.secondary' }}>
                                Huỷ
                            </Button>
                        )}
                        <Button
                            size="small"
                            variant={isDirty ? 'contained' : 'outlined'}
                            color="primary"
                            startIcon={saveMutation.isPending ? <CircularProgress size={12} color="inherit" /> : <Save sx={{ fontSize: 14 }} />}
                            disabled={!isDirty || saveMutation.isPending}
                            onClick={() => saveMutation.mutate()}
                            sx={{ fontSize: '0.72rem' }}
                        >
                            {saveMutation.isPending ? 'Đang lưu…' : 'Save'}
                        </Button>
                        <Button size="small" startIcon={<PlayCircle />}
                            onClick={() => { setPreviewStartIdx(0); setPreviewOpen(true); }}
                            disabled={localItems.length === 0}>
                            Preview
                        </Button>
                        <Button size="small" startIcon={<Add />} onClick={() => setAddMediaOpen(true)}>
                            Thêm
                        </Button>
                        <Tooltip title="Đóng panel">
                            <IconButton size="small" onClick={onClose}>
                                <Close sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Stack>
            </Box>

            {/* Unsaved warning */}
            {isDirty && (
                <Alert severity="warning" icon={false} sx={{ py: 0.5, px: 2, borderRadius: 0, fontSize: '0.75rem' }}>
                    Có thay đổi chưa được lưu — nhấn <strong>Save</strong> để áp dụng cho thiết bị
                </Alert>
            )}

            {/* Item list */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {isLoading ? (
                    <Box sx={{ p: 2 }}>
                        {[1, 2, 3].map(i => <Skeleton key={i} height={48} sx={{ mb: 0.5 }} />)}
                    </Box>
                ) : !localItems.length ? (
                    <Box textAlign="center" py={6}>
                        <QueueMusic sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">Playlist chưa có media</Typography>
                        <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setAddMediaOpen(true)} sx={{ mt: 1.5 }}>
                            Thêm Media
                        </Button>
                    </Box>
                ) : (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={localItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                            {localItems.map((item, idx) => (
                                <Fragment key={item.id}>
                                    <TimestampMarker
                                        idx={idx}
                                        startSecs={startTimes[idx] >= 0 ? startTimes[idx] : -1}
                                        prevStartSecs={idx > 0 && startTimes[idx - 1] >= 0 ? startTimes[idx - 1] : 0}
                                        prevItem={idx > 0 ? localItems[idx - 1] : null}
                                        onDurationChange={handleDurationChange}
                                    />
                                    {idx > 0 && (
                                        <TransitionPicker
                                            value={item.transition}
                                            transitionDuration={item.transitionDuration}
                                            onChange={v => handleTransitionChange(item.id, v)}
                                            onDurationChange={ms => handleTransitionDurationChange(item.id, ms)}
                                        />
                                    )}
                                    <SortableItem
                                        item={item}
                                        onRemove={handleRemove}
                                        onDurationChange={handleDurationChange}
                                        totalItems={localItems.length}
                                        onPreview={(it) => { setPreviewStartIdx(idx); setPreviewOpen(true); }}
                                    />
                                </Fragment>
                            ))}
                            <TimestampMarker
                                idx={localItems.length}
                                startSecs={totalSecs !== null ? totalSecs : -1}
                                prevStartSecs={startTimes.length > 0 && startTimes[startTimes.length - 1] >= 0 ? startTimes[startTimes.length - 1] : 0}
                                prevItem={localItems[localItems.length - 1] ?? null}
                                onDurationChange={handleDurationChange}
                                isFinal
                            />
                        </SortableContext>
                    </DndContext>
                )}
            </Box>

            <AddMediaDialog
                open={addMediaOpen}
                onClose={() => setAddMediaOpen(false)}
                onConfirm={handleStagedAdd}
                existingMediaIds={existingMediaIds}
                hasForeverItem={localItems.some(i => (i.duration ?? 0) >= 86400)}
            />
            <PlaylistPreviewDialog
                open={previewOpen}
                onClose={() => setPreviewOpen(false)}
                items={localItems}
            />
        </Box>
    );
}

// ── Create Playlist Dialog ────────────────────────────────────────────────────

function CreatePlaylistDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const mutation = useMutation({
        mutationFn: () => playlistsApi.create({ name, description: description || undefined }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: `Playlist "${name}" đã được tạo!` }));
            setName(''); setDescription('');
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Tạo playlist thất bại') })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Tạo Playlist mới</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                    <TextField label="Tên" value={name} onChange={(e) => setName(e.target.value)} fullWidth required />
                    <TextField label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={onClose}>Huỷ</Button>
                <Button variant="contained" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>Tạo</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Edit Playlist Dialog ──────────────────────────────────────────────────────

function EditPlaylistDialog({ playlist, open, onClose }: {
    playlist: Playlist; open: boolean; onClose: () => void;
}) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [name, setName] = useState(playlist.name);
    const [description, setDescription] = useState(playlist.description ?? '');

    const handleEnter = () => { setName(playlist.name); setDescription(playlist.description ?? ''); };

    const mutation = useMutation({
        mutationFn: () => playlistsApi.update(playlist.id, { name, description: description || undefined }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: 'Playlist đã được cập nhật' }));
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Cập nhật thất bại') })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth TransitionProps={{ onEnter: handleEnter }}>
            <DialogTitle fontWeight={700}>Chỉnh sửa Playlist</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} sx={{ mt: 0.5 }}>
                    <TextField label="Tên playlist" value={name} onChange={(e) => setName(e.target.value)} fullWidth required autoFocus />
                    <TextField label="Mô tả (tuỳ chọn)" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={3} />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={onClose} disabled={mutation.isPending}>Huỷ</Button>
                <Button variant="contained" disabled={!name.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
                    {mutation.isPending ? 'Đang lưu...' : 'Lưu'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Delete confirm dialog ─────────────────────────────────────────────────────

function DeleteConfirmDialog({ target, onClose, onConfirm, loading, errorMsg }: {
    target: { id: string; name: string } | null;
    onClose: () => void; onConfirm: (id: string) => void;
    loading: boolean; errorMsg: string | null;
}) {
    return (
        <Dialog open={!!target} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <WarningAmber color="error" />Xoá playlist
            </DialogTitle>
            <DialogContent>
                <Typography variant="body2" mb={errorMsg ? 2 : 0}>
                    Bạn có chắc muốn xoá playlist <strong>&ldquo;{target?.name}&rdquo;</strong>? Hành động này không thể hoàn tác.
                </Typography>
                {errorMsg && (
                    <Box sx={{ mt: 1, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'error.main', color: 'error.main', fontSize: 13 }}>
                        {errorMsg}
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={loading}>Huỷ</Button>
                <Button variant="contained" color="error" disabled={loading}
                    startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Delete />}
                    onClick={() => target && onConfirm(target.id)}>
                    {loading ? 'Đang xoá…' : 'Xoá'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Playlist table row ────────────────────────────────────────────────────────

function PlaylistRow({ playlist, selected, onSelect, onDelete }: {
    playlist: Playlist; selected: boolean;
    onSelect: (id: string) => void; onDelete: (id: string, name: string) => void;
}) {
    const [editOpen, setEditOpen] = useState(false);

    return (
        <>
            <TableRow hover sx={{
                cursor: 'pointer',
                bgcolor: selected ? 'primary.main' + '12' : undefined,
                '& td': { borderBottom: '1px solid', borderColor: 'divider' },
            }}>
                <TableCell sx={{ width: 40, pl: 1, pr: 0 }} onClick={() => onSelect(playlist.id)}>
                    <Box sx={{
                        width: 28, height: 28, borderRadius: 1,
                        background: selected ? 'linear-gradient(135deg, #6C63FF44, #FF658444)' : 'linear-gradient(135deg, #6C63FF22, #FF658422)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <QueueMusic sx={{ color: 'primary.main', fontSize: 14 }} />
                    </Box>
                </TableCell>
                <TableCell onClick={() => onSelect(playlist.id)} sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>{playlist.name}</Typography>
                </TableCell>
                <TableCell onClick={() => onSelect(playlist.id)} sx={{ borderLeft: '1px solid', borderColor: 'divider', maxWidth: 0 }}>
                    <Tooltip title={playlist.description ?? ''} disableHoverListener={!playlist.description}>
                        <Typography variant="caption" color="text.secondary" noWrap display="block">
                            {playlist.description ?? '—'}
                        </Typography>
                    </Tooltip>
                </TableCell>
                <TableCell align="center" onClick={() => onSelect(playlist.id)} sx={{ whiteSpace: 'nowrap', borderLeft: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary">{playlist.itemCount ?? 0} items</Typography>
                </TableCell>
                <TableCell align="center" onClick={() => onSelect(playlist.id)} sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" noWrap>{new Date(playlist.createdAt).toLocaleDateString('vi-VN')}</Typography>
                </TableCell>
                <TableCell align="center" onClick={() => onSelect(playlist.id)} sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>
                    <Typography variant="caption" color="text.secondary" noWrap>{new Date(playlist.updatedAt).toLocaleDateString('vi-VN')}</Typography>
                </TableCell>
                <TableCell align="center" onClick={(e) => e.stopPropagation()} sx={{ whiteSpace: 'nowrap', borderLeft: '1px solid', borderColor: 'divider' }}>
                    <Box sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center' }}>
                        <Tooltip title="Chỉnh sửa">
                            <IconButton size="small" onClick={() => setEditOpen(true)}><Edit sx={{ fontSize: 14 }} /></IconButton>
                        </Tooltip>
                        <Tooltip title="Xoá">
                            <IconButton size="small" color="error" onClick={() => onDelete(playlist.id, playlist.name)}><Delete sx={{ fontSize: 16 }} /></IconButton>
                        </Tooltip>
                    </Box>
                </TableCell>
            </TableRow>
            <EditPlaylistDialog playlist={playlist} open={editOpen} onClose={() => setEditOpen(false)} />
        </>
    );
}

// ── Main Playlists Page ───────────────────────────────────────────────────────

export default function PlaylistsPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(10);
    const [search, setSearch] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [sortField, setSortField] = useState<'createdAt' | 'updatedAt'>('createdAt');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const { data, isLoading } = useQuery({
        queryKey: ['playlists', page, limit, search],
        queryFn: () => playlistsApi.list({ page, limit: limit === 0 ? 9999 : limit, search: search || undefined }),
    });

    const sorted = useMemo(() => {
        const list = [...(data?.data ?? [])];
        list.sort((a, b) => {
            const diff = new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime();
            return sortDir === 'asc' ? diff : -diff;
        });
        return list;
    }, [data?.data, sortField, sortDir]);

    const toggleSort = (field: 'createdAt' | 'updatedAt') => {
        if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortField(field); setSortDir('desc'); }
    };

    const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const deleteMutation = useMutation({
        mutationFn: (id: string) => playlistsApi.delete(id),
        onSuccess: (_, id) => {
            qc.invalidateQueries({ queryKey: ['playlists'] });
            if (selectedId === id) setSelectedId(null);
            setDeleteTarget(null); setDeleteError(null);
            dispatch(pushToast({ severity: 'success', message: 'Xoá playlist thành công' }));
        },
        onError: (err) => {
            setDeleteError(getApiError(err, 'Xoá thất bại'));
        },
    });

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Playlists</Typography>
                    <Typography variant="body2" color="text.secondary">{data?.total ?? 0} playlists</Typography>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOpen(true)}>New Playlist</Button>
            </Stack>

            <Box mb={2}>
                <TextField
                    placeholder="Search playlists..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                    size="small" sx={{ width: 280 }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.secondary' }} /></InputAdornment> }}
                />
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { fontWeight: 700, bgcolor: 'action.hover' } }}>
                                    <TableCell align="center" sx={{ width: 40, pl: 1 }} />
                                    <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>Tên</TableCell>
                                    <TableCell align="center" sx={{ borderLeft: '1px solid', borderColor: 'divider' }}>Mô tả</TableCell>
                                    <TableCell align="center" sx={{ width: 60, borderLeft: '1px solid', borderColor: 'divider' }}>Items</TableCell>
                                    <TableCell
                                        align="center"
                                        sx={{ width: 100, cursor: 'pointer', userSelect: 'none', borderLeft: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.selected' } }}
                                        onClick={() => toggleSort('createdAt')}
                                    >
                                        <Stack direction="row" alignItems="center" justifyContent="center" gap={0.5}>
                                            Ngày tạo
                                            {sortField === 'createdAt' && (sortDir === 'asc' ? <ArrowUpward sx={{ fontSize: 12 }} /> : <ArrowDownward sx={{ fontSize: 12 }} />)}
                                        </Stack>
                                    </TableCell>
                                    <TableCell
                                        align="center"
                                        sx={{ width: 100, cursor: 'pointer', userSelect: 'none', borderLeft: '1px solid', borderColor: 'divider', '&:hover': { bgcolor: 'action.selected' } }}
                                        onClick={() => toggleSort('updatedAt')}
                                    >
                                        <Stack direction="row" alignItems="center" justifyContent="center" gap={0.5}>
                                            Cập nhật
                                            {sortField === 'updatedAt' && (sortDir === 'asc' ? <ArrowUpward sx={{ fontSize: 12 }} /> : <ArrowDownward sx={{ fontSize: 12 }} />)}
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="center" sx={{ width: 80, borderLeft: '1px solid', borderColor: 'divider' }}>Thao tác</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading
                                    ? [1, 2, 3, 4, 5].map(i => (
                                        <TableRow key={i}>
                                            {[1, 2, 3, 4, 5, 6, 7].map(j => (
                                                <TableCell key={j}><Skeleton height={24} /></TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                    : sorted.length === 0
                                        ? (
                                            <TableRow>
                                                <TableCell colSpan={7} sx={{ textAlign: 'center', py: 6 }}>
                                                    <QueueMusic sx={{ fontSize: 40, color: 'text.secondary', mb: 1, display: 'block', mx: 'auto' }} />
                                                    <Typography variant="body2" color="text.secondary">
                                                        {search ? 'Không tìm thấy playlist' : 'Chưa có playlist nào'}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        )
                                        : sorted.map(pl => (
                                            <PlaylistRow
                                                key={pl.id}
                                                playlist={pl}
                                                selected={selectedId === pl.id}
                                                onSelect={setSelectedId}
                                                onDelete={(id, name) => { setDeleteTarget({ id, name }); setDeleteError(null); }}
                                            />
                                        ))
                                }
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {data && (
                        <Box sx={{ mt: 1, px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid', borderColor: 'divider' }}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                                <Typography variant="caption" color="text.secondary">{data.total ?? 0} playlist</Typography>
                                <Select size="small" value={limit} onChange={e => { setLimit(Number(e.target.value)); setPage(1); }} sx={{ fontSize: '0.75rem', height: 28 }}>
                                    {[10, 20, 50, 100].map(n => <MenuItem key={n} value={n} sx={{ fontSize: '0.75rem' }}>{n} / trang</MenuItem>)}
                                    <MenuItem value={0} sx={{ fontSize: '0.75rem' }}>Tất cả</MenuItem>
                                </Select>
                            </Stack>
                            <Pagination count={limit === 0 ? 1 : (data.totalPages || 1)} page={page} onChange={(_, p) => setPage(p)} variant="outlined" shape="rounded" size="small" />
                        </Box>
                    )}
                </Box>

                {/* Right panel */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <PlaylistPanel playlistId={selectedId} onClose={() => setSelectedId(null)} />
                </Box>
            </Box>

            <CreatePlaylistDialog open={createOpen} onClose={() => setCreateOpen(false)} />
            <DeleteConfirmDialog
                target={deleteTarget}
                onClose={() => { if (!deleteMutation.isPending) { setDeleteTarget(null); setDeleteError(null); } }}
                onConfirm={(id) => deleteMutation.mutate(id)}
                loading={deleteMutation.isPending}
                errorMsg={deleteError}
            />
        </Box>
    );
}
