/**
 * PlayerPage — Web player loaded by Android WebView at ${serverUrl}/player.
 *
 * Flow:
 *   1. Read window.NativeBridge.getDeviceInfo() → device JWT + IDs
 *   2. Init device API client with device JWT
 *   3. GET /api/device/sync → schedules + playlist items
 *   4. Find active schedule (current time/day + highest priority)
 *   5. Loop through playlist items, advancing after each duration
 *   6. POST /api/device/heartbeat every 30s → re-sync if needed
 *   7. POST /api/device/playback-log after each item finishes
 *   8. Socket.IO /device → re-sync on content.update / schedule.update
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import {
    setDeviceToken,
    fetchSync,
    sendHeartbeat,
    logPlayback,
    type SyncResponse,
    type PlaylistItemSync,
} from '@api/device-player.api';
import { usePlayerSocket } from '@hooks/usePlayerSocket';
import MediaSlide from './components/MediaSlide';

// ─── NativeBridge type (injected by Android WebView) ─────────────────────────

interface NativeBridgeAPI {
    getDeviceInfo(): string;
    reloadContent(): void;
    restartApp(): void;
    clearCache(): void;
}

declare global {
    interface Window {
        NativeBridge?: NativeBridgeAPI;
    }
}

interface DeviceInfo {
    token: string;
    deviceId: string;
    orgId: string;
    deviceName: string;
    serverUrl: string;
    hwId: string;
}

// ─── Schedule active-now check ────────────────────────────────────────────────

function isScheduleActiveNow(schedule: SyncResponse['schedules'][0]): boolean {
    const now = new Date();
    const day = now.getDay(); // 0=Sun … 6=Sat

    if (schedule.daysOfWeek.length > 0 && !schedule.daysOfWeek.includes(day)) return false;

    if (schedule.startTime && schedule.endTime) {
        const [sh, sm] = schedule.startTime.split(':').map(Number);
        const [eh, em] = schedule.endTime.split(':').map(Number);
        const nowMins = now.getHours() * 60 + now.getMinutes();
        if (nowMins < sh * 60 + sm || nowMins >= eh * 60 + em) return false;
    }

    return true;
}

function getActiveItems(syncData: SyncResponse): PlaylistItemSync[] {
    // Schedules arrive sorted by priority DESC — first active one wins
    const active = syncData.schedules.find(isScheduleActiveNow);
    return active?.playlist.items ?? [];
}

// ─── Standby screen ───────────────────────────────────────────────────────────

function StandbyScreen({ deviceName }: { deviceName?: string }) {
    return (
        <Box sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100vh', bgcolor: '#1A1A2E', gap: 2,
        }}>
            <Box sx={{
                width: 80, height: 80, borderRadius: 2,
                background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Box component="span" sx={{ fontSize: 36, color: '#fff' }}>▶</Box>
            </Box>
            <Typography variant="h5" sx={{ color: '#6C63FF', fontWeight: 600 }}>
                SignageCMS
            </Typography>
            {deviceName && (
                <Typography sx={{ color: 'grey.500', fontSize: 14 }}>{deviceName}</Typography>
            )}
            <Typography sx={{ color: 'grey.600', fontSize: 13, mt: 1 }}>
                No content scheduled for this time.
            </Typography>
        </Box>
    );
}

// ─── PlayerPage ───────────────────────────────────────────────────────────────

export default function PlayerPage() {
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [syncData, setSyncData] = useState<SyncResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    const contentHashRef = useRef<string | undefined>(undefined);
    const playedAtRef = useRef<string>(new Date().toISOString());
    const syncingRef = useRef(false);   // prevent concurrent syncs

    // ── 1. Read NativeBridge ──────────────────────────────────────────────────

    useEffect(() => {
        const raw = window.NativeBridge?.getDeviceInfo();
        if (!raw) {
            setError('NativeBridge not available.\nOpen this page in the SignageCMS Android app.');
            return;
        }
        try {
            const info = JSON.parse(raw) as DeviceInfo;
            setDeviceToken(info.token);
            setDeviceInfo(info);
        } catch {
            setError('Failed to parse device info from NativeBridge.');
        }
    }, []);

    // ── 2. Fetch sync ─────────────────────────────────────────────────────────

    const doSync = useCallback(async () => {
        if (!deviceInfo || syncingRef.current) return;
        syncingRef.current = true;
        try {
            const data = await fetchSync();
            setSyncData(data);
            setCurrentIndex(0);
            playedAtRef.current = new Date().toISOString();
            contentHashRef.current = data.contentHash;
        } catch (e) {
            console.error('[Player] sync failed', e);
        } finally {
            syncingRef.current = false;
        }
    }, [deviceInfo]);

    useEffect(() => {
        if (deviceInfo) doSync();
    }, [deviceInfo, doSync]);

    // ── 3. Socket.IO: re-sync on content/schedule updates ────────────────────

    usePlayerSocket(deviceInfo?.token ?? null, doSync);

    // ── 4. Heartbeat every 30s ────────────────────────────────────────────────

    useEffect(() => {
        if (!deviceInfo) return;
        const timer = setInterval(async () => {
            try {
                const { syncRequired } = await sendHeartbeat(contentHashRef.current);
                if (syncRequired) doSync();
            } catch {
                // ignore transient heartbeat failures
            }
        }, 30_000);
        return () => clearInterval(timer);
    }, [deviceInfo, doSync]);

    // ── 5. Advance to next item + log playback ────────────────────────────────

    const items = syncData ? getActiveItems(syncData) : [];

    const handleItemEnded = useCallback(async () => {
        if (items.length === 0) return;

        const item = items[currentIndex];
        const startedAt = playedAtRef.current;
        const durationPlayed = Math.round(
            (Date.now() - new Date(startedAt).getTime()) / 1000
        );

        logPlayback({
            mediaId: item.mediaId,
            playedAt: startedAt,
            durationPlayed,
            completed: true,
        }).catch(() => { /* ignore */ });

        const nextIndex = (currentIndex + 1) % items.length;
        setCurrentIndex(nextIndex);
        playedAtRef.current = new Date().toISOString();
    }, [items, currentIndex]);

    // ── Render ────────────────────────────────────────────────────────────────

    if (error) {
        return (
            <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', bgcolor: '#0D0D0D', p: 3,
            }}>
                <Typography sx={{ color: '#FF6584', textAlign: 'center', whiteSpace: 'pre-line' }}>
                    {error}
                </Typography>
            </Box>
        );
    }

    if (!syncData) {
        return (
            <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', bgcolor: '#0D0D0D',
            }}>
                <CircularProgress sx={{ color: '#6C63FF' }} />
            </Box>
        );
    }

    if (items.length === 0) {
        return <StandbyScreen deviceName={deviceInfo?.deviceName} />;
    }

    return (
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: '#000', overflow: 'hidden' }}>
            <MediaSlide
                key={`${items[currentIndex].id}-${currentIndex}`}
                item={items[currentIndex]}
                onEnded={handleItemEnded}
            />
        </Box>
    );
}
