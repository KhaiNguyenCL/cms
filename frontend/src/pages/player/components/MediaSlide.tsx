/**
 * Renders a single playlist item fullscreen.
 *
 * Props:
 *   active    — true = slot đang hiển thị, false = preloading ngầm (opacity 0)
 *   onEnded   — gọi khi item kết thúc (chỉ gọi từ slot active)
 *   onWillEnd — gọi trước khi item kết thúc PRELOAD_BEFORE_MS ms (để preload item sau kế tiếp)
 *
 * IMAGE  : timer chạy khi active=true, ảnh tải ngầm khi active=false
 * VIDEO  : play khi active, pause khi inactive
 *
 *   - firedRef ngăn double-call onEnded (timer + onError cùng lúc)
 */
import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { PlaylistItemSync } from '@api/device-player.api';

/** Call onWillEnd this many ms before item ends (warms HTTP cache for after-next item). */
const PRELOAD_BEFORE_MS = 5000;

interface Props {
    item: PlaylistItemSync;
    active: boolean;
    onEnded: () => void;
    /** Called ~5s before item ends — use to preload the item after next. */
    onWillEnd?: () => void;
    /** Sync mode: start image timer or video seek at this offset (ms). Default 0. */
    startOffsetMs?: number;
    debug?: boolean;
}

export default function MediaSlide({
    item, active, onEnded, onWillEnd, startOffsetMs = 0, debug = false,
}: Props) {
    const onEndedRef   = useRef(onEnded);
    onEndedRef.current = onEnded;
    const onWillEndRef   = useRef(onWillEnd);
    onWillEndRef.current = onWillEnd;

    // Stable refs so pause/resume effect doesn't need active/mediaType as deps
    const activeRef    = useRef(active);
    activeRef.current  = active;
    const mediaTypeRef = useRef(item.mediaType);
    mediaTypeRef.current = item.mediaType;

    const videoRef = useRef<HTMLVideoElement>(null);
    const [mediaError, setMediaError] = useState<string | null>(null);

    // Guard: only call onEnded once per activation cycle
    const firedRef = useRef(false);
    // Guard: only call onWillEnd once per activation cycle
    const willEndFiredRef = useRef(false);

    // Timer state for pause/resume
    const timerRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
    const willEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const remainingMsRef  = useRef(0);   // remaining display time (updated on pause)
    const segStartRef     = useRef(0);   // Date.now() when current timer segment started

    const durationMs = Math.max(
        1,
        ((item.durationOverride != null && item.durationOverride > 0)
            ? item.durationOverride
            : (item.duration ?? 10)) * 1000,
    );

    // ── Effect 1: initialise timer when slot becomes active ──────────────────
    // Runs when: active flips, item changes, duration changes, offset changes.
useEffect(() => {
        if (!active || item.mediaType === 'VIDEO') return;
        setMediaError(null);
        firedRef.current     = false;
        willEndFiredRef.current = false;

        if (timerRef.current) clearTimeout(timerRef.current);
        if (willEndTimerRef.current) { clearTimeout(willEndTimerRef.current); willEndTimerRef.current = null; }

        const initial = Math.max(1, durationMs - startOffsetMs);
        remainingMsRef.current = initial;

        segStartRef.current = Date.now();
        timerRef.current = setTimeout(() => {
            if (!firedRef.current) { firedRef.current = true; onEndedRef.current(); }
            }, initial);

            // Fire onWillEnd 5s before end so PlayerPage can warm HTTP cache for after-next item.
            // Only schedule if there's enough time remaining.
            if (initial > PRELOAD_BEFORE_MS) {
                willEndTimerRef.current = setTimeout(() => {
                    if (!willEndFiredRef.current) {
                        willEndFiredRef.current = true;
                        onWillEndRef.current?.();
                    }
                }, initial - PRELOAD_BEFORE_MS);
            }
        return () => {
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
            if (willEndTimerRef.current) { clearTimeout(willEndTimerRef.current); willEndTimerRef.current = null; }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, item.id, durationMs, startOffsetMs]);

    // ── VIDEO: play/pause based on active ───────────────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video || item.mediaType !== 'VIDEO') return;
        setMediaError(null);

        if (active) {
            firedRef.current      = false;
            willEndFiredRef.current = false;
            if (startOffsetMs > 0) {
                // Sync seek mode: must reset to specific position
                video.currentTime = startOffsetMs / 1000;
                video.load();
            } else {
                // Normal mode: video was already buffering while inactive —
                // just seek to start without calling load() (preserves buffered data).
                video.currentTime = 0;
            }
            video.play().catch(() => {});
        } else {
            video.pause();
            // Call load() only when src changes (handled by React re-render + deps change).
            // Here we just start buffering the assigned src silently.
            video.load();
        }
    }, [active, item.mediaUrl, item.mediaType, startOffsetMs]);

    // Chrome 73 safe: explicit top/right/bottom/left, no `inset` shorthand
    const mediaStyle: React.CSSProperties = {
        position: 'absolute',
        top: 0, right: 0, bottom: 0, left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
    };

    // ── Debug overlay ─────────────────────────────────────────────────────────
    const rawDur = (item.durationOverride != null && item.durationOverride > 0)
        ? item.durationOverride
        : (item.duration ?? 10);

    const infoOverlay = debug && (
        <Box sx={{
            position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 100,
            bgcolor: 'rgba(0,0,0,0.78)', color: '#fff',
            fontFamily: 'monospace', fontSize: 13, px: 2, py: 1,
            borderTop: '1px solid rgba(255,255,255,0.12)',
            pointerEvents: 'none',
        }}>
            <Box sx={{ color: active ? '#6f6' : '#fa0', fontWeight: 'bold', mb: 0.25 }}>
                [{item.mediaType}] {item.mediaTitle} — {active ? '▶ ACTIVE' : '⏸ preload'}
            </Box>
            <Box sx={{ color: '#aaa', fontSize: 11, wordBreak: 'break-all' }}>
                {item.mediaUrl}
            </Box>
            {mediaError && (
                <Box sx={{ color: '#f77', fontSize: 12, mt: 0.5 }}>⚠ {mediaError}</Box>
            )}
            <Box sx={{ color: '#888', fontSize: 11, mt: 0.25 }}>
                dur: {rawDur}s ({durationMs}ms) | id: {item.mediaId.slice(0, 8)}
                {startOffsetMs > 0 && ` | sync+${(startOffsetMs / 1000).toFixed(1)}s`}
            </Box>
        </Box>
    );

    // ── VIDEO ─────────────────────────────────────────────────────────────────
    if (item.mediaType === 'VIDEO') {
        return (
            <Box sx={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
                <video
                    ref={videoRef}
                    src={item.mediaUrl}
                    preload="auto"
                    playsInline
                    style={{ ...mediaStyle, objectFit: 'contain' }}
                    onTimeUpdate={() => {
                        // Fire onWillEnd 5s before video ends (only while active, only once)
                        if (!active || willEndFiredRef.current) return;
                        const video = videoRef.current;
                        if (!video || !video.duration || isNaN(video.duration)) return;
                        if (video.duration - video.currentTime <= PRELOAD_BEFORE_MS / 1000) {
                            willEndFiredRef.current = true;
                            onWillEndRef.current?.();
                        }
                    }}
                    onEnded={() => {
                        if (active && !firedRef.current) {
                            firedRef.current = true;
                            onEndedRef.current();
                        }
                    }}
                    onError={(e) => {
                        if (active && !firedRef.current) {
                            firedRef.current = true;
                            const code = (e.currentTarget as HTMLVideoElement).error?.code ?? '?';
                            setMediaError(`video error code ${code}`);
                            onEndedRef.current();
                        }
                    }}
                />
                {infoOverlay}
            </Box>
        );
    }

    // ── IMAGE ─────────────────────────────────────────────────────────────────
    return (
        <Box sx={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
            <img
                src={item.mediaUrl}
                alt={item.mediaTitle}
                style={{ ...mediaStyle, objectFit: 'cover' }}
                onError={() => {
                    if (active && !firedRef.current) {
                        firedRef.current = true;
                        setMediaError('failed to load image');
                        onEndedRef.current();
                    }
                }}
            />
            {infoOverlay}
        </Box>
    );
}
