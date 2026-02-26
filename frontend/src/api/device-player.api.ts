/**
 * Device Player API — uses device JWT (not admin user JWT).
 * Called by PlayerPage running inside Android WebView.
 * Base URL is relative (/api/device) so it works on any host.
 */
import axios from 'axios';

const client = axios.create({
    baseURL: '/api/device',
    timeout: 30_000,
    headers: { 'Content-Type': 'application/json' },
});

/** Call once after reading NativeBridge.getDeviceInfo() */
export function setDeviceToken(token: string) {
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlaylistItemSync {
    id: string;
    position: number;
    durationOverride: number | null;
    transition: string | null;
    mediaId: string;
    mediaTitle: string;
    mediaType: string;   // 'IMAGE' | 'VIDEO' | 'WEBPAGE'
    mimeType: string;
    duration: number | null;
    width: number | null;
    height: number | null;
    mediaUrl: string;       // signed absolute URL
    thumbnailUrl: string | null;
}

export interface ScheduleSync {
    scheduleId: string;
    scheduleName: string;
    priority: number;
    startTime: string | null;   // "HH:MM"
    endTime: string | null;     // "HH:MM"
    daysOfWeek: number[];       // 0=Sun … 6=Sat
    playlist: {
        id: string;
        name: string;
        items: PlaylistItemSync[];
    };
}

export interface SyncResponse {
    deviceId: string;
    organizationId: string;
    serverTime: string;
    timezone: string;
    settings: Record<string, unknown>;
    contentHash: string;
    schedules: ScheduleSync[];
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchSync(): Promise<SyncResponse> {
    const { data } = await client.get<{ data: SyncResponse }>('/sync');
    return data.data;
}

export async function sendHeartbeat(currentContentHash?: string): Promise<{
    syncRequired: boolean;
    serverTime: string;
}> {
    const { data } = await client.post<{ data: { syncRequired: boolean; serverTime: string } }>(
        '/heartbeat',
        { currentContentHash },
    );
    return data.data;
}

export async function logPlayback(payload: {
    mediaId: string;
    playedAt: string;
    durationPlayed: number;
    completed: boolean;
}): Promise<void> {
    await client.post('/playback-log', payload);
}
