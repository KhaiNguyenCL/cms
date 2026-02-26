/**
 * Renders a single playlist item fullscreen.
 * IMAGE: displayed for durationOverride ?? duration ?? 10 seconds.
 * VIDEO: plays until ended (or error) then calls onEnded.
 * WEBPAGE: displayed in iframe for the scheduled duration.
 */
import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import type { PlaylistItemSync } from '@api/device-player.api';

interface Props {
    item: PlaylistItemSync;
    onEnded: () => void;
}

export default function MediaSlide({ item, onEnded }: Props) {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const onEndedRef = useRef(onEnded);
    onEndedRef.current = onEnded;

    // Duration in ms: durationOverride (sec) > media duration (sec) > 10s default
    const durationMs = (item.durationOverride ?? item.duration ?? 10) * 1000;

    // For non-video items schedule a timer to advance
    useEffect(() => {
        if (item.mediaType === 'VIDEO') return;
        timerRef.current = setTimeout(() => onEndedRef.current(), durationMs);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id]);

    const fullscreenSx = {
        position: 'absolute' as const,
        inset: 0,
        width: '100%',
        height: '100%',
        backgroundColor: '#000',
    };

    if (item.mediaType === 'VIDEO') {
        return (
            <Box
                component="video"
                src={item.mediaUrl}
                autoPlay
                muted={false}
                playsInline
                onEnded={() => onEndedRef.current()}
                onError={() => onEndedRef.current()}
                sx={{ ...fullscreenSx, objectFit: 'contain' }}
            />
        );
    }

    if (item.mediaType === 'WEBPAGE') {
        return (
            <Box
                component="iframe"
                src={item.mediaUrl}
                title={item.mediaTitle}
                sx={{ ...fullscreenSx, border: 'none' }}
            />
        );
    }

    // IMAGE (default)
    return (
        <Box
            component="img"
            src={item.mediaUrl}
            alt={item.mediaTitle}
            onError={() => onEndedRef.current()}
            sx={{ ...fullscreenSx, objectFit: 'contain' }}
        />
    );
}
