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
    transitionDuration: number | null;
    mediaId: string;
    mediaTitle: string;
    mediaType: string;   // 'IMAGE' | 'VIDEO'
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
    /** UTC ms — when today's playlist cycle started (backend-computed from startTime + timezone). */
    startEpoch: number;
    /** Sum of all item durations (ms). Used with startEpoch for global-clock sync. */
    totalDurationMs: number;
    playlist: {
        id: string;
        name: string;
        items: PlaylistItemSync[];
    };
}

export interface SiteState {
    id: string;
    startEpoch: number;           // Unix ms
    totalDurationMs: number;
    playlistId: string;
    playlist: {
        id: string;
        items: PlaylistItemSync[];
    };
}

export interface SyncConfig {
    role: 'MASTER' | 'SLAVE' | 'STANDALONE';
    broadcastPort: number;
    siteId: string | null;
}

export interface SyncResponse {
    deviceId: string;
    organizationId: string;
    serverTime: string;
    timezone: string;
    settings: Record<string, unknown>;
    contentHash: string;
    schedules: ScheduleSync[];
    syncGroup?: SiteState;   // present when device belongs to an active site
    syncConfig?: SyncConfig; // role + broadcast config (Sprint 2/3)
}

// ─── API calls ────────────────────────────────────────────────────────────────

export async function fetchSync(): Promise<SyncResponse> {
    const { data } = await client.get<{ data: SyncResponse }>('/sync');
    return data.data;
}

export async function sendHeartbeat(currentContentHash?: string): Promise<{
    syncRequired: boolean;
    serverTime: string;
    licenseStatus: string;
    isLicensed: boolean;
    deviceAdminPin?: string;
}> {
    // Collect health metrics from Android NativeBridge (available when running in WebView).
    // Silently ignored when running in a desktop browser (NativeBridge not injected).
    let healthMetrics: Record<string, unknown> = {};
    try {
        const raw = (window as any).NativeBridge?.getHealthMetrics?.();
        if (raw) healthMetrics = JSON.parse(raw);
    } catch { /* not in Android WebView — skip */ }

    const { data } = await client.post<{ data: { syncRequired: boolean; serverTime: string; licenseStatus: string; isLicensed: boolean; deviceAdminPin?: string } }>(
        '/heartbeat',
        { currentContentHash, ...healthMetrics },
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
