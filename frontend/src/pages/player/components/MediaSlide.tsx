/**
 * Renders a single playlist item fullscreen.
 *
 * Props:
 *   active    — true = slot đang hiển thị, false = preloading ngầm (opacity 0)
 *   isPaused  — true = đóng băng slide hiện tại (timer dừng, video pause)
 *   onEnded   — gọi khi item kết thúc (chỉ gọi từ slot active, không gọi khi paused)
 *
 * IMAGE  : timer chạy khi active=true && !isPaused, ảnh tải ngầm khi active=false
 * VIDEO  : play khi active && !isPaused, pause khi inactive hoặc isPaused
 *
 * Timer pause/resume:
 *   - Effect 1 (deps: active, item.id, duration): khởi tạo remaining time, start timer nếu !isPaused
 *   - Effect 2 (deps: isPaused): pause → lưu remaining; resume → restart timer với remaining còn lại
 *   - firedRef ngăn double-call onEnded (timer + onError cùng lúc)
 */
import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import type { PlaylistItemSync } from '@api/device-player.api';

interface Props {
    item: PlaylistItemSync;
    active: boolean;
    onEnded: () => void;
    /** Sync mode: start image timer or video seek at this offset (ms). Default 0. */
    startOffsetMs?: number;
    debug?: boolean;
    /** When true: freeze current slide — timer stops, video pauses. */
    isPaused?: boolean;
}

export default function MediaSlide({
    item, active, onEnded, startOffsetMs = 0, debug = false, isPaused = false,
}: Props) {
    const onEndedRef = useRef(onEnded);
    onEndedRef.current = onEnded;

    // Stable refs so pause/resume effect doesn't need active/mediaType as deps
    const activeRef    = useRef(active);
    activeRef.current  = active;
    const mediaTypeRef = useRef(item.mediaType);
    mediaTypeRef.current = item.mediaType;

    const videoRef = useRef<HTMLVideoElement>(null);
    const [mediaError, setMediaError] = useState<string | null>(null);

    // Guard: only call onEnded once per activation cycle
    const firedRef = useRef(false);

    // Timer state for pause/resume
    const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
    const remainingMsRef = useRef(0);   // remaining display time (updated on pause)
    const segStartRef    = useRef(0);   // Date.now() when current timer segment started

    const durationMs = Math.max(
        1,
        ((item.durationOverride != null && item.durationOverride > 0)
            ? item.durationOverride
            : (item.duration ?? 10)) * 1000,
    );

    // ── Effect 1: initialise timer when slot becomes active ──────────────────
    // Runs when: active flips, item changes, duration changes, offset changes.
    // isPaused is intentionally NOT a dependency — we handle it in Effect 2.
    useEffect(() => {
        if (!active || item.mediaType === 'VIDEO') return;
        setMediaError(null);
        firedRef.current = false;

        if (timerRef.current) clearTimeout(timerRef.current);

        const initial = Math.max(1, durationMs - startOffsetMs);
        remainingMsRef.current = initial;

        if (!isPaused) {
            segStartRef.current = Date.now();
            timerRef.current = setTimeout(() => {
                if (!firedRef.current) { firedRef.current = true; onEndedRef.current(); }
            }, initial);
        }
        // If already paused when slot activates: remainingMsRef holds full duration,
        // timer will start when Effect 2 sees isPaused → false.

        return () => {
            if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, item.id, durationMs, startOffsetMs]);

    // ── Effect 2: pause / resume timer ───────────────────────────────────────
    // Only depends on isPaused — reads active/mediaType from stable refs.
    useEffect(() => {
        if (!activeRef.current || mediaTypeRef.current === 'VIDEO' || firedRef.current) return;

        if (isPaused) {
            // Freeze: stop timer, save remaining ms
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
                const used = Date.now() - segStartRef.current;
                remainingMsRef.current = Math.max(0, remainingMsRef.current - used);
            }
        } else {
            // Resume: restart timer with saved remaining
            if (!firedRef.current && remainingMsRef.current > 0) {
                segStartRef.current = Date.now();
                timerRef.current = setTimeout(() => {
                    if (!firedRef.current) { firedRef.current = true; onEndedRef.current(); }
                }, remainingMsRef.current);
            }
        }
    }, [isPaused]);

    // ── VIDEO: play/pause based on active + isPaused ─────────────────────────
    useEffect(() => {
        const video = videoRef.current;
        if (!video || item.mediaType !== 'VIDEO') return;
        setMediaError(null);

        if (active) {
            firedRef.current = false;
            video.currentTime = startOffsetMs / 1000;
            video.load();
            if (!isPaused) {
                video.play().catch(() => {});
            }
        } else {
            video.pause();
            video.load();
        }
    }, [active, item.mediaUrl, item.mediaType, startOffsetMs]);

    // Separate effect: respond to isPaused changes while video is active
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !activeRef.current || mediaTypeRef.current !== 'VIDEO') return;
        if (isPaused) {
            video.pause();
        } else {
            video.play().catch(() => {});
        }
    }, [isPaused]);

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
                [{item.mediaType}] {item.mediaTitle} — {active ? (isPaused ? '⏸ PAUSED' : '▶ ACTIVE') : '⏸ preload'}
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
