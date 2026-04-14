import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Button, TextField,
    Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
    Skeleton, Divider, Tooltip, InputAdornment,
    CircularProgress, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Grid, Card, CardContent, TablePagination, Alert,
    Select, MenuItem, Menu, Slider,
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
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
            <DialogTitle fontWeight={700}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                    <Box>
                        <Typography variant="h6" fontWeight={700}>{t('playlists.addMedia')}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {selected.size > 0 ? `${selected.size} ${t('common.select').toLowerCase()}` : t('common.select')}
                        </Typography>
                    </Box>
                    {selected.size > 0 && (
                        <Chip label={`${selected.size} ${t('common.select').toLowerCase()}`} color="primary" size="small" onDelete={() => setSelected(new Map())} />
                    )}
                </Stack>
            </DialogTitle>

            <DialogContent dividers sx={{ p: 0 }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <TextField
                        placeholder={t('playlists.searchMedia')}
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
                            <Typography color="text.secondary">{t('playlists.noMediaFound')}</Typography>
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
                                                <Chip label={t('playlists.alreadyAdded')} size="small" sx={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: '0.6rem', bgcolor: 'rgba(0,0,0,0.7)', color: 'white' }} />
                                            )}
                                            {isProcessing && (
                                                <Chip label={t('playlists.processing')} size="small" sx={{ position: 'absolute', top: 6, left: 6, zIndex: 2, fontSize: '0.6rem', bgcolor: 'rgba(237,108,2,0.85)', color: 'white' }} />
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
                                                                    <Tooltip title={alreadyForever ? t('playlists.turnOffLoop') : otherHasForever ? t('playlists.playlistHasLoop') : t('playlists.loopForever')}>
                                                                        <span>
                                                                            <IconButton size="small" color={alreadyForever ? 'primary' : 'default'} onClick={() => toggleLoop(media.id)} disabled={otherHasForever} sx={{ p: 0.5 }}>
                                                                                <AllInclusive sx={{ fontSize: 16 }} />
                                                                            </IconButton>
                                                                        </span>
                                                                    </Tooltip>
                                                                );
                                                            })()}
                                                            {loopForever.has(media.id)
                                                                ? <Typography variant="caption" color="primary" fontWeight={700}>{t('playlists.loopForever')}</Typography>
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
                {videoData && (
                    <TablePagination
                        component="div"
                        count={videoData.total ?? 0}
                        page={page - 1}
                        onPageChange={(_, p) => setPage(p + 1)}
                        rowsPerPage={24}
                        onRowsPerPageChange={() => {}}
                        rowsPerPageOptions={[24]}
                        labelRowsPerPage=""
                        labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                    />
                )}
            </DialogContent>

            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={handleClose}>{t('common.cancel')}</Button>
                <Button size="small" disabled={selected.size === 0} startIcon={<Add />} onClick={handleConfirm}>
                    {t('common.add')}{selected.size > 0 ? ` (${selected.size})` : ''}
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
    const { t } = useTranslation();
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
            <Tooltip title={t('playlists.clickChangeDuration')}>
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
        <Tooltip title={t('playlists.clickChangeDuration')}>
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
    const { t } = useTranslation();
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
                    title={isEditable ? t('playlists.clickChangeTimestamp') : ''}
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
    { value: 'FADE',  labelKey: 'playlists.transitionFade',       icon: <BlurOn    sx={{ fontSize: 15 }} /> },
    { value: 'NONE',  labelKey: 'playlists.transitionInstant',    icon: <FlashOn   sx={{ fontSize: 15 }} /> },
    { value: 'SLIDE', labelKey: 'playlists.transitionSlide',      icon: <SwipeLeft sx={{ fontSize: 15 }} /> },
    { value: 'ZOOM',  labelKey: 'playlists.transitionZoom',       icon: <ZoomIn    sx={{ fontSize: 15 }} /> },
    { value: 'WIPE',  labelKey: 'playlists.transitionShutter',    icon: <SwipeLeft sx={{ fontSize: 15, transform: 'scaleX(-1)' }} /> },
    { value: 'FLIP',  labelKey: 'playlists.transitionFlip',       icon: <ZoomIn    sx={{ fontSize: 15, transform: 'scaleX(-1)' }} /> },
];

function getTransition(val?: string | null) {
    return TRANSITIONS.find(tr => tr.value === (val ?? 'FADE')) ?? TRANSITIONS[0];
}

const DEFAULT_TRANS_MS = 800;
const TRANS_DURATION_MARKS = [
    { value: 200, label: '0.2s' },
    { value: 1000, label: '1s' },
    { value: 2000, label: '2s' },
    { value: 3000, label: '3s' },
];

function TransitionPicker({
    value, onChange, durationMs, onDurationChange,
}: {
    value?: string | null;
    onChange: (v: string) => void;
    durationMs?: number | null;
    onDurationChange: (ms: number) => void;
}) {
    const { t } = useTranslation();
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const committedMs = durationMs ?? DEFAULT_TRANS_MS;
    const [displayMs, setDisplayMs] = useState<number>(committedMs);
    const current = getTransition(value);
    const showDuration = (value ?? 'FADE') !== 'NONE';

    // Sync display value when committed value changes from outside (e.g. load from server)
    useEffect(() => { setDisplayMs(committedMs); }, [committedMs]);

    return (
        <>
            <Box
                sx={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    py: 0.25, px: 2, gap: 1.5, bgcolor: 'action.hover',
                    borderTop: '1px dashed', borderBottom: '1px dashed', borderColor: 'divider',
                }}
            >
                <Tooltip title={t('playlists.transitionEffect')}>
                    <Chip
                        size="small"
                        icon={current.icon}
                        label={t(current.labelKey)}
                        onClick={e => setAnchor(e.currentTarget)}
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', height: 20, cursor: 'pointer', borderStyle: 'dashed', flexShrink: 0 }}
                    />
                </Tooltip>
                {showDuration && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, maxWidth: 200}}>
                        <Slider
                            size="small"
                            value={displayMs}
                            min={100}
                            max={3000}
                            step={100}
                            marks={TRANS_DURATION_MARKS}
                            onChange={(_e, v) => setDisplayMs(v as number)}
                            onChangeCommitted={(_e, v) => onDurationChange(v as number)}
                            sx={{ py: 0.5 }}
                        />
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap', minWidth: 38, textAlign: 'right', color: 'text.secondary' }}>
                            {displayMs}ms
                        </Typography>
                    </Box>
                )}
            </Box>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                transformOrigin={{ vertical: 'top', horizontal: 'center' }}
            >
                {TRANSITIONS.map(tr => (
                    <MenuItem
                        key={tr.value}
                        selected={tr.value === (value ?? 'FADE')}
                        onClick={() => { onChange(tr.value); setAnchor(null); }}
                        sx={{ fontSize: '0.8rem', gap: 1, minWidth: 140 }}
                    >
                        {tr.icon}{t(tr.labelKey)}
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
    const { t } = useTranslation();
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
                            {item._isNew && <Chip label={t('playlists.unsaved')} size="small" color="primary" variant="outlined" sx={{ fontSize: '0.55rem', height: 14, px: 0.3 }} />}
                        </Stack>
                    </Box>

                    <Tooltip title={isForever ? t('playlists.turnOffLoop') : t('playlists.loopForever')}>
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

            <Dialog open={loopDialog} onClose={() => setLoopDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>{t('playlists.loopOnlyTitle')}</DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2">
                        {t('playlists.loopOnlyMsg', { count: totalItems })}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setLoopDialog(false)}>{t('playlists.understand')}</Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ── Playlist Preview Dialog ───────────────────────────────────────────────────

const PREVIEW_CAP_SECS = 10;   // cap "hiện mãi" items at 10s in preview
const TRANS_MS         = 400;  // crossfade duration (ms)

function previewDurSecs(item: LocalItem): number {
    const d = item.duration ?? 10;
    return d >= 86400 ? PREVIEW_CAP_SECS : d;
}

/** CSS for the OUTGOING layer: starts visible, animates away. */
function outStyle(type: string, active: boolean): React.CSSProperties {
    const t = `${TRANS_MS}ms ease`;
    if (!active || type === 'NONE') return { opacity: 1, transform: 'none', transition: 'none' };
    switch (type) {
        case 'SLIDE': return { opacity: 0, transform: 'translateX(-10%)', transition: `all ${t}` };
        case 'ZOOM':  return { opacity: 0, transform: 'scale(1.08)',       transition: `all ${t}` };
        case 'WIPE':  return { opacity: 0, transform: 'translateX(-18%)',  transition: `all ${t}` };
        case 'FLIP':  return { opacity: 0, transform: 'scaleX(0.04)',      transition: `all ${t}` };
        default:      return { opacity: 0,                                 transition: `opacity ${t}` };
    }
}

/** CSS for the INCOMING layer: starts hidden, animates in. */
function inStyle(type: string, entered: boolean): React.CSSProperties {
    const t = `${TRANS_MS}ms ease`;
    if (type === 'NONE') return { opacity: 1, transform: 'none', transition: 'none' };
    if (!entered) {
        switch (type) {
            case 'SLIDE': return { opacity: 0, transform: 'translateX(10%)',  transition: 'none' };
            case 'ZOOM':  return { opacity: 0, transform: 'scale(0.92)',       transition: 'none' };
            case 'WIPE':  return { opacity: 0, transform: 'translateX(18%)',   transition: 'none' };
            case 'FLIP':  return { opacity: 0, transform: 'scaleX(0.04)',      transition: 'none' };
            default:      return { opacity: 0,                                 transition: 'none' };
        }
    }
    switch (type) {
        case 'SLIDE': return { opacity: 1, transform: 'translateX(0)', transition: `all ${t}` };
        case 'ZOOM':  return { opacity: 1, transform: 'scale(1)',       transition: `all ${t}` };
        case 'WIPE':  return { opacity: 1, transform: 'translateX(0)',  transition: `all ${t}` };
        case 'FLIP':  return { opacity: 1, transform: 'scaleX(1)',      transition: `all ${t}` };
        default:      return { opacity: 1,                              transition: `opacity ${t}` };
    }
}

function MediaLayer({ item, url, onVideoEnd }: { item: LocalItem | undefined; url?: string; onVideoEnd?: () => void }) {
    const { t } = useTranslation();
    const isVideo = item?.media?.type === 'VIDEO';
    if (!url) return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'grey.700' }}>
            {typeIcon(item?.media?.type)}
            <Typography variant="caption" mt={1}>{t('playlists.noMediaLoad')}</Typography>
        </Box>
    );
    if (isVideo) return (
        <video key={url} src={url} autoPlay muted playsInline
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            onEnded={onVideoEnd} />
    );
    return (
        <img key={url} src={url} alt={item?.media?.title}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
    );
}

function PlaylistPreviewDialog({ open, onClose, items }: {
    open: boolean;
    onClose: () => void;
    items: LocalItem[];
}) {
    const [currentIdx, setCurrentIdx] = useState(0);
    const [prevIdx, setPrevIdx]       = useState<number | null>(null);
    const [transActive, setTransActive] = useState(false);
    const [entered, setEntered]       = useState(false);
    const [transType, setTransType]   = useState('FADE');
    const [playing, setPlaying]       = useState(true);
    const [progress, setProgress]     = useState(0);
    const [mediaUrls, setMediaUrls]   = useState<Record<string, string>>({});
    const [fetching, setFetching]     = useState(false);

    const itemsRef    = useRef(items);
    itemsRef.current  = items;
    const currentIdxRef = useRef(0);
    currentIdxRef.current = currentIdx;
    const inTransRef  = useRef(false);
    const startRef    = useRef<number>(0);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Fetch all signed URLs when dialog opens
    useEffect(() => {
        if (!open || items.length === 0) return;
        setFetching(true);
        setCurrentIdx(0); setPrevIdx(null);
        setTransActive(false); setEntered(false);
        setProgress(0); setPlaying(true);
        inTransRef.current = false;
        const ids = items.map(i => i.mediaId ?? i.media?.id ?? '').filter(Boolean);
        Promise.all(ids.map(id => mediaApi.get(id).catch(() => null))).then(results => {
            const urls: Record<string, string> = {};
            results.forEach((m, i) => { if (m?.signedUrl) urls[ids[i]] = m.signedUrl; });
            setMediaUrls(urls);
            setFetching(false);
        });
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * Two-layer crossfade transition:
     * 1. Keep current as outgoing layer (prevIdx), switch current to nextIdx
     * 2. Trigger outgoing OUT + incoming IN simultaneously — no black frame
     * 3. Clean up outgoing layer after animation
     */
    const goTo = useCallback((nextIdx: number) => {
        if (inTransRef.current) return;
        const tType = itemsRef.current[nextIdx]?.transition ?? 'FADE';

        if (tType === 'NONE') {
            setCurrentIdx(nextIdx); setProgress(0); setPlaying(true);
            return;
        }

        inTransRef.current = true;
        const prev = currentIdxRef.current;

        // Layer setup: prev = outgoing (still visible), current = incoming (hidden)
        setPrevIdx(prev);
        setTransType(tType);
        setTransActive(true);   // outgoing starts animating OUT immediately
        setEntered(false);       // incoming starts hidden
        setCurrentIdx(nextIdx);
        setProgress(0);
        setPlaying(true);

        // Next 2 rAFs: browser has painted both layers → trigger incoming IN
        requestAnimationFrame(() => requestAnimationFrame(() => {
            setEntered(true);
        }));

        // After full animation: clean up outgoing layer
        setTimeout(() => {
            setPrevIdx(null);
            setTransActive(false);
            setEntered(false);
            inTransRef.current = false;
        }, TRANS_MS + 60);
    }, []);

    // Auto-advance timer — loops back to 0 when playlist ends
    useEffect(() => {
        if (!open || fetching || !playing || items.length === 0) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return;
        }
        const item  = items[currentIdx];
        const durMs = previewDurSecs(item) * 1000;
        startRef.current = Date.now();
        intervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startRef.current;
            setProgress(Math.min(100, (elapsed / durMs) * 100));
            if (elapsed >= durMs) {
                clearInterval(intervalRef.current!);
                const next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
                goTo(next);
            }
        }, 50);
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [open, fetching, playing, currentIdx, items, goTo]);

    if (!open) return null;
    const item      = items[currentIdx];
    const prevItem  = prevIdx !== null ? items[prevIdx] : null;
    const mediaId   = item?.mediaId ?? item?.media?.id ?? '';
    const signedUrl = mediaUrls[mediaId];
    const prevMediaId  = prevItem?.mediaId ?? prevItem?.media?.id ?? '';
    const prevUrl   = prevIdx !== null ? mediaUrls[prevMediaId] : undefined;
    const durSecs   = previewDurSecs(item);
    const isHienMai = (item?.duration ?? 0) >= 86400;

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

            {/* Media area — two-layer crossfade, no black flash */}
            <Box sx={{ bgcolor: '#000', height: 420, position: 'relative',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {fetching ? (
                    <CircularProgress />
                ) : (
                    <>
                        {/* Outgoing layer (behind) */}
                        {prevIdx !== null && (
                            <Box sx={{
                                position: 'absolute',
                                top: 0, right: 0, bottom: 0, left: 0,
                                overflow: 'hidden',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                ...outStyle(transType, transActive),
                            }}>
                                <MediaLayer item={prevItem ?? undefined} url={prevUrl} />
                            </Box>
                        )}
                        {/* Incoming layer (front) */}
                        <Box sx={{
                            position: 'absolute',
                            top: 0, right: 0, bottom: 0, left: 0,
                            overflow: 'hidden',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            ...(!transActive ? {} : inStyle(transType, entered)),
                        }}>
                            <MediaLayer
                                item={item}
                                url={signedUrl}
                                onVideoEnd={() => {
                                    const next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
                                    goTo(next);
                                }}
                            />
                        </Box>
                    </>
                )}
            </Box>

            {/* Progress bar */}
            <LinearProgress variant="determinate" value={progress}
                sx={{ height: 3, bgcolor: 'rgba(255,255,255,0.06)', '& .MuiLinearProgress-bar': { transition: 'none' } }} />

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
                            {isHienMai ? `∞ → preview ${PREVIEW_CAP_SECS}s` : `${durSecs}s`}
                        </Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        <IconButton size="small" onClick={() => goTo(currentIdx === 0 ? items.length - 1 : currentIdx - 1)}
                            sx={{ color: 'grey.400' }}>
                            <SkipPrevious />
                        </IconButton>
                        <IconButton onClick={() => setPlaying(p => !p)}
                            sx={{ color: '#fff', bgcolor: 'rgba(255,255,255,0.1)', '&:hover': { bgcolor: 'rgba(255,255,255,0.18)' }, width: 36, height: 36 }}>
                            {playing ? <Pause fontSize="small" /> : <PlayArrow fontSize="small" />}
                        </IconButton>
                        <IconButton size="small" onClick={() => goTo(currentIdx === items.length - 1 ? 0 : currentIdx + 1)}
                            sx={{ color: 'grey.400' }}>
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
                                border: '2px solid',
                                borderColor: idx === currentIdx ? 'primary.main' : 'transparent',
                                cursor: 'pointer', bgcolor: 'grey.900',
                                opacity: idx === currentIdx ? 1 : 0.5,
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
    const { t } = useTranslation();
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
                <Typography variant="body2" textAlign="center">{t('playlists.clickToView')}</Typography>
            </Box>
        );
    }
    return <PlaylistPanelInner playlistId={playlistId} onClose={onClose} />;
}

function PlaylistPanelInner({ playlistId, onClose }: { playlistId: string; onClose: () => void }) {
    const { t } = useTranslation();
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
            if ((localItems[i].transitionDuration ?? DEFAULT_TRANS_MS) !== (serverItems[i]?.transitionDuration ?? DEFAULT_TRANS_MS)) return true;
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

    const handleTransitionDurationChange = useCallback((itemId: string, ms: number) => {
        setLocalItems(prev => prev.map(i => i.id === itemId ? { ...i, transitionDuration: ms } : i));
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
                    (server.transitionDuration ?? DEFAULT_TRANS_MS) !== (i.transitionDuration ?? DEFAULT_TRANS_MS);
            });
            await Promise.all(existingChanges.map(i =>
                playlistsApi.updateItem(playlistId, i.id, {
                    durationOverride: i.duration ?? 10,
                    transition: i.transition ?? 'FADE',
                    transitionDuration: i.transitionDuration ?? DEFAULT_TRANS_MS,
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
            dispatch(pushToast({ severity: 'success', message: t('playlists.savedAndUpdated') }));
        },
        onError: (err) => {
            dispatch(pushToast({ severity: 'error', message: getApiError(err, t('playlists.saveFailed')) }));
        },
    });

    const handleDiscard = () => {
        setLocalItems(serverItems);
    };

    // ── Computed timeline ─────────────────────────────────────────────────────

    const startTimes = useMemo(() => {
        const times: number[] = [];
        let acc = 0;
        for (const item of localItems) {
            times.push(acc);
            const dur = item.duration ?? 10;
            if (dur >= 86400) {
                while (times.length < localItems.length) times.push(-1);
                break;
            }
            acc += dur;
        }
        while (times.length < localItems.length) times.push(acc);
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
            height: 'calc(100vh - 100px)',
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
                            {isDirty && <Typography component="span" variant="caption" color="warning.main"> · {t('playlists.unsaved')}</Typography>}
                        </Typography>
                    </Box>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        <Button size="small" color="inherit" onClick={handleDiscard}
                            disabled={!isDirty || saveMutation.isPending}
                            sx={{ fontSize: '0.72rem', color: isDirty ? 'text.secondary' : 'text.disabled' }}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            size="small"
                            variant={isDirty ? 'contained' : 'outlined'}
                            color="primary"
                            startIcon={saveMutation.isPending ? <CircularProgress size={12} color="inherit" /> : <Save sx={{ fontSize: 14 }} />}
                            disabled={!isDirty || saveMutation.isPending}
                            onClick={() => saveMutation.mutate()}
                            sx={{ fontSize: '0.72rem' }}
                        >
                            {saveMutation.isPending ? t('common.saving') : t('common.save')}
                        </Button>
                        <Button size="small" startIcon={<PlayCircle />}
                            onClick={() => { setPreviewStartIdx(0); setPreviewOpen(true); }}
                            disabled={localItems.length === 0}>
                            Preview
                        </Button>
                        <Button size="small" startIcon={<Add />} onClick={() => setAddMediaOpen(true)}>
                            {t('common.add')}
                        </Button>
                        <Tooltip title={t('playlists.closePanel')}>
                            <IconButton size="small" onClick={onClose}>
                                <Close sx={{ fontSize: 16 }} />
                            </IconButton>
                        </Tooltip>
                    </Stack>
                </Stack>
            </Box>

            {/* Item list */}
            <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {isLoading ? (
                    <Box sx={{ p: 2 }}>
                        {[1, 2, 3].map(i => <Skeleton key={i} height={48} sx={{ mb: 0.5 }} />)}
                    </Box>
                ) : !localItems.length ? (
                    <Box textAlign="center" py={6}>
                        <QueueMusic sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">{t('playlists.emptyPlaylist')}</Typography>
                        <Button size="small" variant="outlined" startIcon={<Add />} onClick={() => setAddMediaOpen(true)} sx={{ mt: 1.5 }}>
                            {t('playlists.addMediaBtn')}
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
                                            onChange={v => handleTransitionChange(item.id, v)}
                                            durationMs={item.transitionDuration}
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
    const { t } = useTranslation();
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const mutation = useMutation({
        mutationFn: () => playlistsApi.create({ name, description: description || undefined }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: t('playlists.createdSuccess', { name }) }));
            setName(''); setDescription('');
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, t('playlists.createFailed')) })),
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>{t('playlists.newPlaylistTitle')}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField label={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} fullWidth required size="small" />
                    <TextField label={t('common.description')} value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} size="small" />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>{t('common.cancel')}</Button>
                <Button size="small" disabled={!name || mutation.isPending} onClick={() => mutation.mutate()}>{t('common.create')}</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Edit Playlist Dialog ──────────────────────────────────────────────────────

function EditPlaylistDialog({ playlist, open, onClose, onDeleted }: {
    playlist: Playlist; open: boolean; onClose: () => void; onDeleted?: () => void;
}) {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const { t } = useTranslation();
    const [name, setName] = useState(playlist.name);
    const [description, setDescription] = useState(playlist.description ?? '');
    const [confirmDel, setConfirmDel] = useState(false);

    const handleEnter = () => {
        setName(playlist.name);
        setDescription(playlist.description ?? '');
        setConfirmDel(false);
    };

    const mutation = useMutation({
        mutationFn: () => playlistsApi.update(playlist.id, { name, description: description || undefined }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: t('playlists.updateSuccess') }));
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, t('playlists.updateFailed')) })),
    });

    const deleteMutation = useMutation({
        mutationFn: () => playlistsApi.delete(playlist.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['playlists'] });
            dispatch(pushToast({ severity: 'success', message: t('playlists.deleteSuccess') }));
            onDeleted?.();
            onClose();
        },
        onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, t('playlists.deleteFailed')) })),
    });

    const isPending = mutation.isPending || deleteMutation.isPending;

    return (
        <Dialog open={open} onClose={isPending ? undefined : onClose} maxWidth="xs" fullWidth TransitionProps={{ onEnter: handleEnter }}>
            <DialogTitle fontWeight={700}>{t('playlists.editTitle')}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} sx={{ mt: 0.5 }}>
                    <TextField label={t('playlists.playlistName')} value={name} onChange={(e) => setName(e.target.value)} fullWidth required autoFocus />
                    <TextField label={`${t('common.description')} (${t('common.optional')})`} value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={3} />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
                <Box>
                    {confirmDel ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="body2" color="error">{t('playlists.deleteConfirm')}</Typography>
                            <Button size="small" color="error" disabled={deleteMutation.isPending}
                                startIcon={deleteMutation.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                                onClick={() => deleteMutation.mutate()}>{t('common.delete')}</Button>
                            <Button size="small" onClick={() => setConfirmDel(false)} disabled={deleteMutation.isPending}>{t('common.no')}</Button>
                        </Stack>
                    ) : (
                        <Button size="small" color="error" startIcon={<Delete />} onClick={() => setConfirmDel(true)}>
                            {t('common.delete')}
                        </Button>
                    )}
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
                    <Button size="small" disabled={!name.trim() || isPending} onClick={() => mutation.mutate()}>
                        {mutation.isPending ? t('common.saving') : t('common.save')}
                    </Button>
                </Box>
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
    const { t } = useTranslation();
    return (
        <Dialog open={!!target} onClose={loading ? undefined : onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <WarningAmber color="error" /> {t('playlists.deletePlaylistTitle')}
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" mb={errorMsg ? 2 : 0}>
                    {t('playlists.deleteConfirmFull', { name: target?.name })}
                </Typography>
                {errorMsg && (
                    <Box sx={{ mt: 1, p: 1.5, borderRadius: 1, border: '1px solid', borderColor: 'error.main', color: 'error.main', fontSize: 13 }}>
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

// ── Playlist table row ────────────────────────────────────────────────────────

function PlaylistRow({ playlist, selected, onSelect, onDeleted }: {
    playlist: Playlist; selected: boolean;
    onSelect: (id: string) => void; onDeleted: (id: string) => void;
}) {
    const [editOpen, setEditOpen] = useState(false);

    return (
        <>
            <TableRow hover sx={{
                cursor: 'pointer',
                bgcolor: selected ? 'primary.main' + '12' : undefined,
                '& td': { borderBottom: '1px solid', borderColor: 'divider' },
            }}>
                <TableCell onClick={() => onSelect(playlist.id)}>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>{playlist.name}</Typography>
                </TableCell>
                <TableCell onClick={() => onSelect(playlist.id)} sx={{ maxWidth: 0 }}>
                    <Tooltip title={playlist.description ?? ''} disableHoverListener={!playlist.description}>
                        <Typography variant="body2" color={playlist.description ? 'text.secondary' : 'text.disabled'} noWrap display="block" align={playlist.description ? 'left' : 'center'}>
                            {playlist.description ?? '—'}
                        </Typography>
                    </Tooltip>
                </TableCell>
                <TableCell align="center" onClick={() => onSelect(playlist.id)}>
                    <Typography variant="body2" color="text.secondary">{playlist.itemCount ?? 0}</Typography>
                </TableCell>
                <TableCell align="center" onClick={() => onSelect(playlist.id)}>
                    <Typography variant="body2" color="text.secondary" noWrap>{new Date(playlist.createdAt).toLocaleDateString('vi-VN')}</Typography>
                </TableCell>
                <TableCell align="center" onClick={() => onSelect(playlist.id)}>
                    <Typography variant="body2" color="text.secondary" noWrap>{new Date(playlist.updatedAt).toLocaleDateString('vi-VN')}</Typography>
                </TableCell>
                <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title={t('playlists.editTooltip')}>
                        <IconButton size="small" onClick={() => setEditOpen(true)}><Edit sx={{ fontSize: 14 }} /></IconButton>
                    </Tooltip>
                </TableCell>
            </TableRow>
            <EditPlaylistDialog
                playlist={playlist}
                open={editOpen}
                onClose={() => setEditOpen(false)}
                onDeleted={() => { onDeleted(playlist.id); setEditOpen(false); }}
            />
        </>
    );
}

// ── Main Playlists Page ───────────────────────────────────────────────────────

export default function PlaylistsPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const { t } = useTranslation();
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

    const handleDeleted = (id: string) => {
        if (selectedId === id) setSelectedId(null);
        qc.invalidateQueries({ queryKey: ['playlists'] });
    };

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>{t('playlists.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">{data?.total ?? 0} {t('playlists.title').toLowerCase()}</Typography>
                </Box>
                <Button startIcon={<Add />} onClick={() => setCreateOpen(true)}>{t('playlists.createPlaylist')}</Button>
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
                                    <TableCell align="center">{t('common.name')}</TableCell>
                                    <TableCell align="center">{t('common.description')}</TableCell>
                                    <TableCell align="center" sx={{ width: 60 }}>Items</TableCell>
                                    <TableCell
                                        align="center"
                                        sx={{ width: 100, cursor: 'pointer', userSelect: 'none', '&:hover': { bgcolor: 'action.selected' } }}
                                        onClick={() => toggleSort('createdAt')}
                                    >
                                        <Stack direction="row" alignItems="center" justifyContent="center" gap={0.5}>
                                            {t('common.createdAt')}
                                            {sortField === 'createdAt' && (sortDir === 'asc' ? <ArrowUpward sx={{ fontSize: 12 }} /> : <ArrowDownward sx={{ fontSize: 12 }} />)}
                                        </Stack>
                                    </TableCell>
                                    <TableCell
                                        align="center"
                                        sx={{ width: 100, cursor: 'pointer', userSelect: 'none', '&:hover': { bgcolor: 'action.selected' } }}
                                        onClick={() => toggleSort('updatedAt')}
                                    >
                                        <Stack direction="row" alignItems="center" justifyContent="center" gap={0.5}>
                                            {t('common.updatedAt')}
                                            {sortField === 'updatedAt' && (sortDir === 'asc' ? <ArrowUpward sx={{ fontSize: 12 }} /> : <ArrowDownward sx={{ fontSize: 12 }} />)}
                                        </Stack>
                                    </TableCell>
                                    <TableCell align="center" sx={{ width: 80 }}>{t('common.actions')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading
                                    ? [1, 2, 3, 4, 5].map(i => (
                                        <TableRow key={i}>
                                            {[1, 2, 3, 4, 5, 6].map(j => (
                                                <TableCell key={j}><Skeleton height={24} /></TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                    : sorted.length === 0
                                        ? (
                                            <TableRow>
                                                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6 }}>
                                                    <QueueMusic sx={{ fontSize: 40, color: 'text.secondary', mb: 1, display: 'block', mx: 'auto' }} />
                                                    <Typography variant="body2" color="text.secondary">
                                                        {search ? t('playlists.noPlaylistMatch') : t('playlists.noPlaylists')}
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
                                                onDeleted={handleDeleted}
                                            />
                                        ))
                                }
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
                </Box>

                {/* Right panel */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <PlaylistPanel playlistId={selectedId} onClose={() => setSelectedId(null)} />
                </Box>
            </Box>

            <CreatePlaylistDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </Box>
    );
}
