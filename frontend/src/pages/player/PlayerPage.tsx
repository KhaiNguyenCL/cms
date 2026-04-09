/**
 * PlayerPage — Web player loaded by Android WebView at ${serverUrl}/player.
 *
 * Flow:
 *   1. Read window.NativeBridge.getDeviceInfo() → device JWT + IDs
 *   2. Init device API client with device JWT
 *   3. GET /api/device/sync → schedules + playlist items
 *   4. Find active schedule (current time/day + highest priority)
 *   5. Double-buffer crossfade playback:
 *        - SlotA & SlotB always mounted (never unmount between items)
 *        - Active slot: opacity 1, plays/counts-down
 *        - Inactive slot: opacity 0, preloads next item silently
 *        - On advance: CSS fade active↔inactive → no black flash
 *   6. POST /api/device/heartbeat every 30s → re-sync if needed
 *   7. POST /api/device/playback-log after each item finishes
 *   8. Socket.IO /device → re-sync on content.update / schedule.update
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';

const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';
const DEFAULT_TRANSITION_MS = 800; // fallback when item has no transitionDuration
const SYNC_CACHE_KEY = 'signagecms_last_sync'; // localStorage key for offline cache
// Grace window before first reveal: all devices that finish syncing within this window
// will start playing at the same NTP position → no visible drift on boot.
const FIRST_REVEAL_BUFFER_MS = 1500;

function saveSyncCache(data: SyncResponse) {
    try { localStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(data)); } catch { /* quota full */ }
}
function loadSyncCache(): SyncResponse | null {
    try {
        const raw = localStorage.getItem(SYNC_CACHE_KEY);
        return raw ? (JSON.parse(raw) as SyncResponse) : null;
    } catch { return null; }
}

import {
    setDeviceToken,
    fetchSync,
    sendHeartbeat,
    logPlayback,
    logPlaylistSession,
    type SyncResponse,
    type PlaylistItemSync,
    type SiteState,
} from '@api/device-player.api';
import { usePlayerSocket } from '@hooks/usePlayerSocket';
import MediaSlide from './components/MediaSlide';

// ─── NativeBridge type (injected by Android WebView) ─────────────────────────

interface NativeBridgeAPI {
    getDeviceInfo(): string;
    reloadContent(): void;
    restartApp(): void;
    clearCache(): void;
    clearCredentialsAndRepair?(): void;
    // Offline cache
    enqueueMediaDownloads?(itemsJson: string): void;
    pruneMediaCache?(keepIdsJson: string): void;
    getCacheInfo?(): string;
    // Watchdog keep-alive (called every heartbeat)
    ping?(): void;
    // PIN sync (called when heartbeat returns new PIN from server)
    updateDevicePin?(pin: string): void;
    // Sprint 2: local content cache
    getLocalMediaPath?(mediaId: string): string | null;
    getDownloadStatus?(): 'PENDING' | 'DOWNLOADING' | 'READY' | 'ERROR';
    getDownloadProgress?(): number;   // 0–100
    forceDownload?(): void;
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

/**
 * Get the current day-of-week and minute-of-day in a given IANA timezone.
 * Uses the toLocaleString trick to shift the Date into the target timezone,
 * then reads the numeric components via standard Date methods.
 * Falls back to local OS time if the timezone string is invalid.
 */
function getNowInTimezone(tz: string): { day: number; totalMins: number } {
    try {
        // toLocaleString re-formats the instant in the target timezone;
        // parsing that string with new Date() gives us the *numeric* TZ-local values.
        const shifted = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
        return { day: shifted.getDay(), totalMins: shifted.getHours() * 60 + shifted.getMinutes() };
    } catch {
        const now = new Date();
        return { day: now.getDay(), totalMins: now.getHours() * 60 + now.getMinutes() };
    }
}

function isScheduleActiveNow(schedule: SyncResponse['schedules'][0], timezone: string): boolean {
    const { day, totalMins } = getNowInTimezone(timezone);

    if (schedule.daysOfWeek.length > 0 && !schedule.daysOfWeek.includes(day)) return false;

    if (schedule.startTime && schedule.endTime) {
        const [sh, sm] = schedule.startTime.split(':').map(Number);
        const [eh, em] = schedule.endTime.split(':').map(Number);
        if (totalMins < sh * 60 + sm || totalMins >= eh * 60 + em) return false;
    }

    return true;
}

function getActiveSchedule(syncData: SyncResponse) {
    // Schedules arrive sorted by priority DESC — first active one wins
    return syncData.schedules.find(s => isScheduleActiveNow(s, syncData.timezone)) ?? null;
}

function getActiveItems(syncData: SyncResponse): PlaylistItemSync[] {
    return getActiveSchedule(syncData)?.playlist.items ?? [];
}

// ─── NTP sync position calculator ────────────────────────────────────────────
// Given a sync group's startEpoch and the current server time, calculate which
// playlist item should be playing and how far into it we are.

function getItemDurationMs(item: PlaylistItemSync): number {
    return ((item.durationOverride != null && item.durationOverride > 0)
        ? item.durationOverride
        : (item.duration ?? 10)) * 1000;
}

function calculateSyncPosition(
    items: PlaylistItemSync[],
    startEpoch: number,
    totalDurationMs: number,
    serverTimeMs: number,
): { index: number; offsetMs: number } {
    if (items.length === 0 || totalDurationMs <= 0) return { index: 0, offsetMs: 0 };
    // Use modulo so late-joining devices pick up wherever the loop currently is.
    // The double-modulo form handles the (uncommon) case where serverTime < startEpoch.
    const elapsed = ((serverTimeMs - startEpoch) % totalDurationMs + totalDurationMs) % totalDurationMs;
    let acc = 0;
    for (let i = 0; i < items.length; i++) {
        const dur   = getItemDurationMs(items[i]);
        const nextI = (i + 1) % items.length;
        // Transition INTO the next item — each item "owns" the gap after it.
        const trans = items[nextI].transitionDuration ?? DEFAULT_TRANSITION_MS;

        if (elapsed < acc + dur) {
            // Actively displaying item i
            return { index: i, offsetMs: elapsed - acc };
        }
        if (elapsed < acc + dur + trans) {
            // In transition window → next item is becoming active, start it from offset 0
            return { index: nextI, offsetMs: 0 };
        }
        acc += dur + trans;
    }
    return { index: 0, offsetMs: 0 };
}

// ─── License required screen ──────────────────────────────────────────────────

function LicenseRequiredScreen({ status }: { status: 'LICENSE_EXPIRED' | 'LICENSE_REQUIRED' }) {
    return (
        <Box sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100vh', bgcolor: '#0D0D0D', gap: 2,
        }}>
            <img src="/logo-icon.png" alt="DMS Signage" style={{ height: 64, width: 'auto', objectFit: 'contain', opacity: 0.5 }} />
            <LockIcon sx={{ fontSize: 48, color: '#444' }} />
            <Typography variant="body2" sx={{ color: '#666', textAlign: 'center', maxWidth: 320 }}>
                {status === 'LICENSE_EXPIRED'
                    ? 'Giấy phép của tổ chức đã hết hạn.'
                    : 'Thiết bị này chưa được cấp phép.'}
                {'\n'}Liên hệ admin để gia hạn giấy phép.
            </Typography>
        </Box>
    );
}

// ─── Standby screen ───────────────────────────────────────────────────────────

function StandbyScreen({ deviceName }: { deviceName?: string }) {
    return (
        <Box sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100vh', bgcolor: '#1A1A2E', gap: 2,
        }}>
            <img src="/logo-icon.png" alt="DMS Signage" style={{ height: 72, width: 'auto', objectFit: 'contain' }} />
            {deviceName && (
                <Typography sx={{ color: 'grey.500', fontSize: 14 }}>{deviceName}</Typography>
            )}
            <Typography sx={{ color: 'grey.600', fontSize: 13, mt: 1 }}>
                No content scheduled for this time.
            </Typography>
        </Box>
    );
}

// ─── Offline indicator — small pulsing dot, bottom-right corner ───────────────
// Shown whenever the player cannot reach the server (sync failed or socket down).
// Intentionally small and unobtrusive: audience sees clean content, ops staff
// notices the dot when walking past the screen.

function OfflineIndicator({ isOffline }: { isOffline: boolean }) {
    if (!isOffline) return null;
    return (
        <Box sx={{
            position: 'fixed',
            bottom: 10,
            right: 10,
            width: 10,
            height: 10,
            borderRadius: '50%',
            bgcolor: '#ff3333',
            zIndex: 9999,
            pointerEvents: 'none',
            '@keyframes offlinePulse': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%':      { opacity: 0.35, transform: 'scale(1.7)' },
            },
            animation: 'offlinePulse 2s ease-in-out infinite',
        }} />
    );
}

// ─── Download progress screen ─────────────────────────────────────────────────

function DownloadProgressScreen({ progress }: { progress: number }) {
    return (
        <Box sx={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100vh', bgcolor: '#0D0D0D', gap: 3,
        }}>
            <Box sx={{
                width: 72, height: 72, borderRadius: 2,
                background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
                <Box component="span" sx={{ fontSize: 32, color: '#fff' }}>⬇</Box>
            </Box>
            <Typography sx={{ color: '#6C63FF', fontWeight: 600, fontSize: 18 }}>
                Đang tải nội dung…
            </Typography>
            <Box sx={{ width: 280, bgcolor: '#222', borderRadius: 1, overflow: 'hidden', height: 8 }}>
                <Box sx={{
                    width: `${progress}%`, height: '100%',
                    background: 'linear-gradient(90deg, #6C63FF, #FF6584)',
                    transition: 'width 0.5s ease',
                }} />
            </Box>
            <Typography sx={{ color: '#666', fontSize: 14 }}>{progress}%</Typography>
        </Box>
    );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Use local cached file if available, otherwise fall back to server URL. */
function resolveMediaUrl(mediaId: string, serverUrl: string): string {
    const localPath = window.NativeBridge?.getLocalMediaPath?.(mediaId);
    return localPath ?? serverUrl;
}

// ─── PlayerPage ───────────────────────────────────────────────────────────────

export default function PlayerPage() {
    const [deviceInfo, setDeviceInfo]   = useState<DeviceInfo | null>(null);
    const [syncData, setSyncData]       = useState<SyncResponse | null>(null);
    const [error, setError]             = useState<string | null>(null);
    const [syncError, setSyncError]     = useState<string | null>(null);
    const [licenseStatus, setLicenseStatus] = useState<string | null>(null);

    // ── Download status (from local DownloadService via NativeBridge) ──────────
    const [dlStatus, setDlStatus]     = useState<string>(() => window.NativeBridge?.getDownloadStatus?.() ?? 'READY');
    const [dlProgress, setDlProgress] = useState<number>(() => window.NativeBridge?.getDownloadProgress?.() ?? 100);

    // ── Double-buffer slots ────────────────────────────────────────────────────
    const [slotA, setSlotA]         = useState<PlaylistItemSync | null>(null);
    const [slotB, setSlotB]         = useState<PlaylistItemSync | null>(null);
    const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
    const [transitionType, setTransitionType] = useState<string>('FADE');
    const [transitionMs, setTransitionMs]     = useState<number>(DEFAULT_TRANSITION_MS);
    // Pre-positioning: tracks which slot is currently being positioned at its
    // entry point (before animation fires). Slot is invisible (opacity 0) during this phase.
    const [prePositioningSlot, setPrePositioningSlot] = useState<'A' | 'B' | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0); // display only (debug panel)

    // ── Double-buffer slot offsets (ms) — non-zero only on sync group jump ─────
    const [slotAOffset, setSlotAOffset] = useState(0);
    const [slotBOffset, setSlotBOffset] = useState(0);

    // ── Refs (used inside callbacks to avoid stale closures) ──────────────────
    const activeSlotRef   = useRef<'A' | 'B'>('A');
    const currentIndexRef = useRef(0);
    const itemsRef        = useRef<PlaylistItemSync[]>([]);
    const contentHashRef  = useRef<string | undefined>(undefined);
    const playedAtRef     = useRef<string>(new Date().toISOString());
    const syncingRef      = useRef(false);
    const initialSyncDone = useRef(false);
    // True once the first-reveal buffer has fired — subsequent syncs show immediately.
    const firstRevealDoneRef = useRef(false);
    // Set to true by command.reload_content to force clockReset on next sync
    const forceSyncResetRef = useRef(false);
    // Debounce guard: ngăn handleItemEnded bị gọi 2 lần trong cùng một transition window
    const lastAdvancedRef  = useRef<number>(0);
    const transitionMsRef  = useRef<number>(DEFAULT_TRANSITION_MS); // mirrors transitionMs state
    // Track schedule đang chạy — để detect khi admin đổi schedule
    const currentScheduleIdRef = useRef<string | null>(null);
    // Track active store sync for heartbeat drift correction
    const syncGroupRef = useRef<SiteState | null>(null);
    // Track playlist session for completion logging: { playlistId, startedAt }
    const playlistSessionRef = useRef<{ playlistId: string; startedAt: string } | null>(null);
    // True when device is in an active sync group → faster heartbeat (10s vs 30s)
    const [inSyncGroup, setInSyncGroup] = useState(false);

    // ── Global clock refs (used by all schedules, not just sync groups) ────────
    // serverTimeMsRef: server UTC time captured at the last sync response
    // syncedAtRef: Date.now() at the moment of capture (for drift estimation)
    // scheduleEpochRef/scheduleTotalMsRef: active schedule's clock anchor
    const serverTimeMsRef    = useRef(0);
    const syncedAtRef        = useRef(0);
    const scheduleEpochRef   = useRef(0);   // startEpoch of active normal schedule
    const scheduleTotalMsRef = useRef(0);   // totalDurationMs of active normal schedule

    /** Estimate current server time from the last captured sync timestamp. */
    const estimatedServerTimeMs = useCallback((): number => {
        return serverTimeMsRef.current + (Date.now() - syncedAtRef.current);
    }, []);

    // ── Predictive preload: warm HTTP cache for after-next VIDEO 5s early ────
    // A hidden <video> element (created lazily) downloads the upcoming file so
    // that when the inactive double-buffer slot switches to it, bytes are cached.
    const preloadVideoRef = useRef<HTMLVideoElement | null>(null);

    const handleWillEnd = useCallback(() => {
        const items = itemsRef.current;
        // Need at least 3 items to benefit (2 items = after-next === current)
        if (items.length < 3) return;

        const idx          = currentIndexRef.current;
        const nextIdx      = (idx + 1) % items.length;
        const afterNextIdx = (nextIdx + 1) % items.length;
        const afterNext    = items[afterNextIdx];

        if (afterNext.mediaType !== 'VIDEO') return; // images already preloaded globally

        // Lazily create the hidden video element once
        if (!preloadVideoRef.current) {
            const v = document.createElement('video');
            v.preload = 'auto';
            v.muted   = true;
            v.style.cssText = 'position:absolute;width:0;height:0;opacity:0;pointer-events:none';
            document.body.appendChild(v);
            preloadVideoRef.current = v;
        }
        const pv = preloadVideoRef.current;
        if (pv.src !== afterNext.mediaUrl) {
            pv.src = afterNext.mediaUrl;
            pv.load(); // start buffering into HTTP cache
        }
    }, []);

    // Clean up hidden preload video on unmount
    useEffect(() => {
        return () => {
            const pv = preloadVideoRef.current;
            if (pv) {
                pv.src = '';
                pv.load();
                pv.remove();
                preloadVideoRef.current = null;
            }
        };
    }, []);

    // ── Pause / freeze state ──────────────────────────────────────────────────
    const [isPaused, setIsPaused] = useState(false);
    const isPausedRef          = useRef(false);
    const longPressTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const touchStartPosRef     = useRef<{ x: number; y: number } | null>(null);

    // ── 1. Read NativeBridge (Android) or URL params (dev/browser testing) ─────

    useEffect(() => {
        const raw = window.NativeBridge?.getDeviceInfo();
        if (raw) {
            try {
                const info = JSON.parse(raw) as DeviceInfo;
                setDeviceToken(info.token);
                setDeviceInfo(info);
            } catch {
                setError('Failed to parse device info from NativeBridge.');
            }
            return;
        }

        const params   = new URLSearchParams(window.location.search);
        const token    = params.get('token');
        const deviceId = params.get('deviceId');
        const orgId    = params.get('orgId');

        if (token && deviceId && orgId) {
            const info: DeviceInfo = {
                token, deviceId, orgId,
                deviceName: params.get('deviceName') ?? 'Browser Player',
                serverUrl: window.location.origin,
                hwId: params.get('hwId') ?? 'browser',
            };
            setDeviceToken(info.token);
            setDeviceInfo(info);
            return;
        }

        // Auto-fetch token from server when only deviceId is provided (Tizen / browser mode)
        if (deviceId) {
            fetch(`/api/device/browser-token?deviceId=${encodeURIComponent(deviceId)}`)
                .then(r => r.json())
                .then(json => {
                    if (!json.success) throw new Error(json.message ?? 'Token fetch failed');
                    const d = json.data;
                    const info: DeviceInfo = {
                        token: d.token, deviceId: d.deviceId, orgId: d.organizationId,
                        deviceName: d.name, serverUrl: window.location.origin, hwId: 'browser',
                    };
                    setDeviceToken(info.token);
                    setDeviceInfo(info);
                })
                .catch(e => setError(`Không thể lấy token: ${e.message}`));
            return;
        }

        setError('Thiếu deviceId.\nThêm ?deviceId=... vào URL.');
    }, []);

    // ── Poll download progress while DOWNLOADING ──────────────────────────────
    useEffect(() => {
        if (!window.NativeBridge?.getDownloadStatus) return;
        const poll = () => {
            const s = window.NativeBridge!.getDownloadStatus!();
            const p = window.NativeBridge!.getDownloadProgress?.() ?? 0;
            setDlStatus(s);
            setDlProgress(p);
        };
        poll();
        const timer = setInterval(poll, 2000);
        return () => clearInterval(timer);
    }, []);

    // ── 2. Fetch sync ──────────────────────────────────────────────────────────

    /**
     * Sau mỗi sync thành công:
     * - Gửi toàn bộ media items (tất cả schedules) cho Android để download về local
     * - Gửi danh sách mediaIds cần giữ để Android xóa file không còn dùng
     */
    /**
     * updateType = 'CONTENT': media files may have changed → enqueue downloads + prune stale.
     * updateType = 'META'   : only ordering/timing changed → skip download/prune entirely.
     */
    const triggerNativeCacheSync = useCallback((data: SyncResponse, updateType: 'CONTENT' | 'META') => {
        if (!window.NativeBridge) return;

        // Collect unique media items from ALL schedules (not just active)
        const seen = new Set<string>();
        const allItems: Array<{ mediaId: string; mediaUrl: string; mimeType: string }> = [];
        data.schedules.forEach(s => {
            s.playlist.items.forEach(item => {
                if (!seen.has(item.mediaId)) {
                    seen.add(item.mediaId);
                    allItems.push({
                        mediaId:  item.mediaId,
                        mediaUrl: item.mediaUrl,
                        mimeType: item.mimeType,
                    });
                }
            });
        });

        if (updateType === 'CONTENT') {
            window.NativeBridge.enqueueMediaDownloads?.(JSON.stringify(allItems));
            window.NativeBridge.pruneMediaCache?.(JSON.stringify([...seen]));
        }

        if (DEBUG) {
            const info = window.NativeBridge.getCacheInfo?.();
            console.log(`[Cache] updateType=${updateType} | items=${allItems.length} | cache:`, info);
        }
    }, []);

    const doSync = useCallback(async (updateType: 'CONTENT' | 'META' = 'CONTENT') => {
        if (!deviceInfo || syncingRef.current) return;
        syncingRef.current = true;
        try {
            const data = await fetchSync();

            if ((data as any).licenseStatus === 'LICENSE_EXPIRED' || (data as any).licenseStatus === 'LICENSE_REQUIRED') {
                setLicenseStatus((data as any).licenseStatus);
                // Clear syncData so old content stops playing immediately.
                // setSyncError triggers the 15s retry timer to keep re-checking.
                setSyncData(null);
                setSyncError('license');
                // Force clockReset() when license is restored — without this,
                // initialSyncDone stays true and the device resumes at a stale position.
                initialSyncDone.current = false;
                syncingRef.current = false;
                return;
            }
            // /sync confirmed license OK — safe to clear any previous license block.
            // (heartbeat uses 60s cached values; /sync uses live DB — /sync is authoritative)
            setLicenseStatus(null);

            // Capture server clock immediately — estimatedServerTimeMs() stays accurate
            // even during the first-reveal buffer period.
            contentHashRef.current  = data.contentHash;
            serverTimeMsRef.current = new Date(data.serverTime).getTime();
            syncedAtRef.current     = Date.now();
            setSyncError(null);
            saveSyncCache(data);

            // Trigger Android to download/cache all media files (skipped for META-only updates)
            triggerNativeCacheSync(data, updateType);

            if (!firstRevealDoneRef.current) {
                // ── First reveal: wait until the next NTP item boundary ──────────────
                // All devices that complete their initial sync during the SAME item will
                // reveal at the start of the NEXT item — the same absolute wall-clock
                // moment — so observers see all screens light up simultaneously.
                // Fallback: 1500ms when no epoch/items available.
                const snapServerMs  = new Date(data.serverTime).getTime();
                const snapSchedule  = getActiveSchedule(data);
                const snapItems     = snapSchedule?.playlist.items ?? [];
                const snapEpoch     = snapSchedule?.startEpoch  ?? 0;
                const snapTotal     = snapSchedule?.totalDurationMs ?? 0;

                let revealDelayMs = FIRST_REVEAL_BUFFER_MS;
                if (snapEpoch && snapTotal > 0 && snapItems.length > 0) {
                    const { index, offsetMs: itemOff } = calculateSyncPosition(
                        snapItems, snapEpoch, snapTotal, snapServerMs,
                    );
                    const msUntilBoundary = getItemDurationMs(snapItems[index]) - itemOff;
                    // +400ms render grace so slower devices finish painting before content appears
                    revealDelayMs = Math.max(400, msUntilBoundary + 400);
                }

                setTimeout(() => {
                    firstRevealDoneRef.current = true;
                    setSyncData(data);
                }, revealDelayMs);
            } else {
                setSyncData(data);   // subsequent syncs — show immediately
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? `${e.message}` : String(e);
            console.error('[Player] sync failed', e);
            const status = (e as { response?: { status?: number } })?.response?.status;
            socketEmit('device.error', { code: 'SYNC_FAILED', message: msg, httpStatus: status });
            if (status === 401) {
                window.NativeBridge?.clearCredentialsAndRepair?.();
                return; // credentials invalid — don't load cache
            }
            // Nếu chưa có syncData (lần đầu boot mà server down) → load cache
            setSyncData(prev => {
                if (prev) return prev; // đang phát rồi, giữ nguyên
                const cached = loadSyncCache();
                if (cached) console.log('[Player] server offline — using cached sync data');
                return cached;
            });
            setSyncError(msg);
        } finally {
            syncingRef.current = false;
        }
    }, [deviceInfo, triggerNativeCacheSync]);

    useEffect(() => {
        if (deviceInfo) doSync();
    }, [deviceInfo, doSync]);

    // Retry sync mỗi 15s khi server down (syncError != null)
    // Heartbeat đã retry mỗi 30s nhưng chỉ khi syncData có sẵn.
    // Khi boot mà server down, cần retry riêng để recover sớm hơn.
    useEffect(() => {
        if (!deviceInfo || !syncError) return;
        const timer = setInterval(() => doSync('CONTENT'), 15_000);
        return () => clearInterval(timer);
    }, [deviceInfo, syncError, doSync]);

    // ── 3. Socket.IO: re-sync on content/schedule updates ─────────────────────
    // onSyncState: admin started/stopped/restarted a sync group → immediate re-sync
    // (no jitter — we want the position recalculated right away)

    const { emit: socketEmit, isConnected: socketConnected } = usePlayerSocket(
        deviceInfo?.token ?? null,
        (updateType) => doSync(updateType),
        () => doSync('CONTENT'),  // sync.state (site start/stop) always CONTENT
        () => { forceSyncResetRef.current = true; doSync('CONTENT'); }, // reload_content → force NTP jump
    );

    // Offline = sync failed OR socket lost. Only meaningful after deviceInfo is loaded
    // (before that socketConnected is always false — don't flash dot during startup).
    const isOffline = !!deviceInfo && (syncError !== null || !socketConnected);

    // ── 4. Heartbeat: 10s when in sync group (tight drift correction), 30s otherwise ──

    useEffect(() => {
        if (!deviceInfo) return;
        const timer = setInterval(async () => {
            try {
                // Notify watchdog that player is alive
                window.NativeBridge?.ping?.();

                const hb = await sendHeartbeat(contentHashRef.current);

                // Sync PIN if server returned a new value
                if (hb.deviceAdminPin) {
                    window.NativeBridge?.updateDevicePin?.(hb.deviceAdminPin);
                }

                if (hb.licenseStatus === 'EXPIRED' || !hb.isLicensed) {
                    // Heartbeat says unlicensed — show license screen.
                    // Do NOT clear syncData here: heartbeat uses a 60s Redis cache that can
                    // be stale (e.g. device just licensed). Clearing syncData would stop content.
                    // The 15s retry timer (syncError='license') will call doSync which uses
                    // live DB — doSync is the only authority that may clear syncData.
                    setLicenseStatus(hb.licenseStatus === 'EXPIRED' ? 'LICENSE_EXPIRED' : 'LICENSE_REQUIRED');
                    setSyncError('license');
                } else {
                    // Heartbeat OK. Heartbeat uses 60s cached values so don't clear
                    // licenseStatus here — delegate to doSync (live DB). The 15s retry
                    // (active when syncError='license') will call doSync which clears it.
                    if (hb.syncRequired) {
                        doSync('CONTENT');
                    } else if (hb.serverTime && itemsRef.current.length > 0) {
                        const serverTimeMs = new Date(hb.serverTime).getTime();
                        if (!isNaN(serverTimeMs)) {
                            // Re-anchor server clock on every heartbeat for better estimation
                            serverTimeMsRef.current = serverTimeMs;
                            syncedAtRef.current     = Date.now();
                            // Reset NTP timer with freshly-anchored clock.
                            // This corrects within-item offset drift: even when both devices
                            // are on the same item, their timers may have been set from
                            // slightly different server-time estimates. Re-anchoring here
                            // ensures both fire at the same absolute wall-clock boundary.
                            scheduleNTPTickRef.current();

                            // ── Drift correction (sync groups + normal schedules) ────────
                            // Sync groups: need sub-second accuracy.
                            // Normal schedules: two devices that boot at different times may
                            // start at different cycle positions and only converge when the
                            // cycle wraps (could be minutes for long playlists). Heartbeat
                            // correction bounds convergence to ≤1 heartbeat interval (30s).
                            //
                            // Backward-jump guard: at heartbeat time we are well inside an
                            // item (30s >> 0.8s transition). Any index mismatch is genuine
                            // drift — not a false positive from a timer firing at a boundary.
                            const sg = syncGroupRef.current;
                            const corrItems   = sg?.startEpoch ? (sg.playlist?.items ?? itemsRef.current) : itemsRef.current;
                            const corrEpoch   = sg?.startEpoch   ?? scheduleEpochRef.current;
                            const corrTotalMs = sg?.totalDurationMs ?? scheduleTotalMsRef.current;

                            if (corrEpoch && corrTotalMs > 0 && corrItems.length > 0) {
                                const { index: expectedIdx, offsetMs } = calculateSyncPosition(
                                    corrItems, corrEpoch, corrTotalMs, serverTimeMs,
                                );
                                if (expectedIdx !== currentIndexRef.current) {
                                    const nextIdx = (expectedIdx + 1) % corrItems.length;
                                    currentIndexRef.current = expectedIdx;
                                    setCurrentIndex(expectedIdx);
                                    // Update the CURRENT active slot in-place — do NOT switch
                                    // activeSlot. Switching triggers the CSS FADE transition
                                    // which flashes the screen black on every correction.
                                    const cur = activeSlotRef.current;
                                    if (cur === 'A') {
                                        setSlotA(corrItems[expectedIdx]);
                                        setSlotAOffset(offsetMs);
                                        setSlotB(corrItems[nextIdx]);
                                        setSlotBOffset(0);
                                    } else {
                                        setSlotB(corrItems[expectedIdx]);
                                        setSlotBOffset(offsetMs);
                                        setSlotA(corrItems[nextIdx]);
                                        setSlotAOffset(0);
                                    }
                                    lastAdvancedRef.current = Date.now();
                                    playedAtRef.current = new Date().toISOString();
                                    scheduleNTPTickRef.current();
                                }
                            }
                        }
                    }
                }
            } catch {
                // ignore transient heartbeat failures
            }
        }, inSyncGroup ? 15_000 : 30_000);
        return () => clearInterval(timer);
    }, [deviceInfo, doSync, inSyncGroup]);

    // ── Pause/freeze: long-press touch (600ms) toggles freeze ────────────────
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const t = e.touches[0];
        touchStartPosRef.current = { x: t.clientX, y: t.clientY };
        longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null;
            touchStartPosRef.current = null;
            isPausedRef.current = !isPausedRef.current;
            setIsPaused(isPausedRef.current);
            // Restart NTP tick when unpausing (tick stops itself when isPaused)
            if (!isPausedRef.current) scheduleNTPTickRef.current();
        }, 600);
    }, []);

    const cancelLongPress = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        touchStartPosRef.current = null;
    }, []);

    const handleTouchMove = useCallback((e: React.TouchEvent) => {
        if (!touchStartPosRef.current || !longPressTimerRef.current) return;
        const t = e.touches[0];
        const dx = Math.abs(t.clientX - touchStartPosRef.current.x);
        const dy = Math.abs(t.clientY - touchStartPosRef.current.y);
        if (dx > 10 || dy > 10) cancelLongPress();
    }, [cancelLongPress]);

    // TV remote: hold Enter / OK (600ms) toggles freeze
    useEffect(() => {
        let keyTimer: ReturnType<typeof setTimeout> | null = null;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (keyTimer) return;
            keyTimer = setTimeout(() => {
                keyTimer = null;
                isPausedRef.current = !isPausedRef.current;
                setIsPaused(isPausedRef.current);
            }, 600);
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (keyTimer) { clearTimeout(keyTimer); keyTimer = null; }
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            if (keyTimer) clearTimeout(keyTimer);
        };
    }, []);

    // ── 5. Slot management: initialize / update on sync ────────────────────────
    //
    // Double-buffer logic:
    //   SlotA = item currently playing (or preloading if B is active)
    //   SlotB = next item preloading (or item currently playing if B is active)
    //   When advance: swap active slot, fill outgoing slot with item after next.

    useEffect(() => {
        if (!syncData) return;

        // ── Sync group mode: overrides schedule playback ──────────────────────
        // When a sync group is active, all screens must play the same position.
        // Calculate position from (serverTime - startEpoch) % totalDurationMs.
        syncGroupRef.current = syncData.syncGroup ?? null;
        setInSyncGroup(!!(syncData.syncGroup?.startEpoch));

        if (syncData.syncGroup?.startEpoch) {
            const sg = syncData.syncGroup;
            const syncItems = sg.playlist?.items ?? [];
            if (syncItems.length > 0) {
                itemsRef.current = syncItems;
                // Clear normal-schedule epoch so handleItemEnded uses syncGroupRef instead
                scheduleEpochRef.current   = 0;
                scheduleTotalMsRef.current = 0;
                // Preload sync playlist images
                syncItems.forEach(it => {
                    if (it.mediaType === 'IMAGE') {
                        const preImg = new Image();
                        preImg.src = it.mediaUrl;
                    }
                });
                const serverTimeMs = new Date(syncData.serverTime).getTime();
                const { index, offsetMs } = calculateSyncPosition(
                    syncItems, sg.startEpoch, sg.totalDurationMs, serverTimeMs,
                );
                const nextIdx = (index + 1) % syncItems.length;
                currentScheduleIdRef.current = null;
                currentIndexRef.current = index;
                setCurrentIndex(index);
                lastAdvancedRef.current = Date.now();
                activeSlotRef.current = 'A';
                setActiveSlot('A');
                setSlotA(syncItems[index]);
                setSlotAOffset(offsetMs);
                setSlotB(syncItems[nextIdx]);
                setSlotBOffset(0);
                playedAtRef.current = new Date().toISOString();
                initialSyncDone.current = true;
                return; // Skip normal schedule slot management
            }
        }

        // ── Normal schedule mode ──────────────────────────────────────────────
        const activeSchedule = getActiveSchedule(syncData);
        const items = activeSchedule?.playlist.items ?? [];
        const newScheduleId = activeSchedule?.scheduleId ?? null;
        itemsRef.current = items;

        // Preload ALL images into browser cache immediately after sync
        items.forEach(it => {
            if (it.mediaType === 'IMAGE') {
                const preImg = new Image();
                preImg.src = it.mediaUrl;
            }
        });

        // Store the active schedule's clock anchor for global-clock transitions
        scheduleEpochRef.current   = activeSchedule?.startEpoch   ?? 0;
        scheduleTotalMsRef.current = activeSchedule?.totalDurationMs ?? 0;

        // Helper: position slots from global clock (same algorithm as sync groups).
        // All devices compute the same position → naturally synchronized.
        const clockReset = () => {
            // If a playlist session was in progress mid-cycle, log it as incomplete
            if (playlistSessionRef.current && currentIndexRef.current > 0) {
                logPlaylistSession({ ...playlistSessionRef.current, completed: false }).catch(() => {});
            }
            // Start a new session for the incoming playlist
            const incomingPlaylistId = activeSchedule?.playlist.id ?? null;
            playlistSessionRef.current = incomingPlaylistId
                ? { playlistId: incomingPlaylistId, startedAt: new Date().toISOString() }
                : null;

            currentScheduleIdRef.current = newScheduleId;
            lastAdvancedRef.current = Date.now();
            activeSlotRef.current = 'A';
            setActiveSlot('A');
            playedAtRef.current = new Date().toISOString();

            if (items.length === 0) {
                setSlotA(null); setSlotB(null);
                return;
            }

            // Use global clock if backend provided startEpoch
            if (activeSchedule?.startEpoch && activeSchedule.totalDurationMs > 0) {
                const serverMs = estimatedServerTimeMs();
                const { index, offsetMs } = calculateSyncPosition(
                    items, activeSchedule.startEpoch, activeSchedule.totalDurationMs, serverMs,
                );
                const nextIdx = (index + 1) % items.length;
                currentIndexRef.current = index;
                setCurrentIndex(index);
                setSlotA(items[index]);
                // Use offsetMs so both devices show the SAME position within the item.
                // A device that boots mid-item will join at the correct offset, not restart
                // the item from 0 — which would cause a permanent phase shift between screens.
                setSlotAOffset(offsetMs);
                setSlotB(items[nextIdx]);
                setSlotBOffset(0);
            } else {
                // Fallback: start from beginning (no epoch from backend)
                currentIndexRef.current = 0;
                setCurrentIndex(0);
                setSlotAOffset(0); setSlotBOffset(0);
                setSlotA(items[0]);
                setSlotB(items.length > 1 ? items[1] : items[0]);
            }
            // Start NTP-aligned timer so subsequent advances stay locked to server clock
            scheduleNTPTickRef.current();
        };

        if (!initialSyncDone.current || forceSyncResetRef.current) {
            // ── First sync OR explicit reload command → jump to NTP position ───
            initialSyncDone.current  = true;
            forceSyncResetRef.current = false;
            clockReset();
        } else {
            const scheduleChanged = newScheduleId !== currentScheduleIdRef.current;

            if (scheduleChanged) {
                // ── Schedule đổi (admin toggle, hết giờ, v.v.) → reset ngay ─────
                clockReset();
            } else {
                // ── Cùng schedule → update cả active slot (metadata only) + inactive slot ──
                // Active slot: update item object in-place so handleItemEnded reads fresh
                // duration/transition. Does NOT reset timer or video position — MediaSlide
                // only re-runs effects when active, item.id, durationMs, or mediaUrl change.
                // Inactive slot: preload the correct next item from fresh data.
                if (items.length > 0) {
                    const clamped = Math.min(currentIndexRef.current, items.length - 1);
                    currentIndexRef.current = clamped;
                    setCurrentIndex(clamped);

                    const nextIdx    = (clamped + 1) % items.length;
                    const activeSlot = activeSlotRef.current;
                    const inactiveSlot = activeSlot === 'A' ? 'B' : 'A';

                    // Update active slot metadata (same mediaId → no effect re-run in MediaSlide)
                    if (activeSlot === 'A') setSlotA(items[clamped]);
                    else                    setSlotB(items[clamped]);

                    // Update inactive slot with fresh next item
                    if (inactiveSlot === 'A') setSlotA(items[nextIdx]);
                    else                      setSlotB(items[nextIdx]);
                }
            }
        }
    }, [syncData]);

    // ── 5b. Smart schedule re-evaluation ────────────────────────────────────────
    // Tính chính xác khi nào schedule event tiếp theo xảy ra (start/end time hoặc midnight),
    // set setTimeout đến đúng thời điểm đó để switch schedule ngay lập tức (độ trễ < 1s).
    // Fallback tối đa 5 phút để đảm bảo luôn re-check định kỳ.
    useEffect(() => {
        if (!syncData) return;

        const tz = syncData.timezone ?? 'Asia/Ho_Chi_Minh';
        const now = new Date();
        const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
        const totalMins = local.getHours() * 60 + local.getMinutes();
        const totalSecs = totalMins * 60 + local.getSeconds();

        // Find nearest schedule boundary (startTime or endTime of any schedule)
        let nearestMs = 5 * 60 * 1000; // fallback max 5 min

        for (const s of syncData.schedules) {
            for (const t of [s.startTime, s.endTime]) {
                if (!t) continue;
                const [th, tm] = t.split(':').map(Number);
                const boundaryTotalSecs = th * 3600 + tm * 60;
                let diffSecs = boundaryTotalSecs - totalSecs;
                if (diffSecs <= 0) diffSecs += 24 * 3600; // next occurrence tomorrow
                nearestMs = Math.min(nearestMs, diffSecs * 1000);
            }
        }

        // Also schedule at midnight for day-of-week transitions
        const secsTillMidnight = 24 * 3600 - totalSecs;
        nearestMs = Math.min(nearestMs, secsTillMidnight * 1000);

        // Minimum 500ms to avoid tight loops
        const delay = Math.max(nearestMs + 200, 500);

        const timer = setTimeout(() => {
            setSyncData(sd => sd ? { ...sd } : sd);
        }, delay);
        return () => clearTimeout(timer);
    }, [syncData]);

    // ── 6. NTP-aligned timer ───────────────────────────────────────────────────
    //
    // Root cause of drift: `setTimeout(duration)` accumulates ±50ms error per item.
    // Fix: always compute remaining time from NTP clock, not from item duration alone.
    // Each timer fires at the exact NTP boundary → errors do NOT accumulate.
    //
    // Two mechanisms:
    //   a) scheduleNTPTick() — fires at NTP boundary, calls doAdvanceTo(ntpIdx)
    //   b) handleItemEnded() — MediaSlide callback (video onEnded / image timer backup)
    // Both call doAdvanceTo() which has a debounce guard preventing double-fire.
    // scheduleNTPTick is the primary driver; handleItemEnded is the backup.

    const ntpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Ref so clockReset (defined inside useEffect) can call scheduleNTPTick without stale closure
    const scheduleNTPTickRef = useRef<() => void>(() => {});

    // Shared crossfade logic used by both the NTP timer and MediaSlide callback.
    const doAdvanceTo = useCallback((targetIdx: number, targetOffsetMs: number) => {
        const nowMs = Date.now();
        if (nowMs - lastAdvancedRef.current < Math.max(200, transitionMsRef.current) + 100) return;
        lastAdvancedRef.current = nowMs;

        const items = itemsRef.current;
        if (items.length === 0) return;

        const prevIdx = currentIndexRef.current;
        logPlayback({
            mediaId: items[prevIdx].mediaId,
            playedAt: playedAtRef.current,
            durationPlayed: Math.round((nowMs - new Date(playedAtRef.current).getTime()) / 1000),
            completed: true,
        }).catch(() => {});

        // Playlist session tracking: log completion when wrapping back to index 0
        if (targetIdx === 0 && prevIdx > 0 && playlistSessionRef.current) {
            logPlaylistSession({ ...playlistSessionRef.current, completed: true }).catch(() => {});
            // Start new session immediately
            playlistSessionRef.current = { playlistId: playlistSessionRef.current.playlistId, startedAt: new Date().toISOString() };
        }

        currentIndexRef.current = targetIdx;
        setCurrentIndex(targetIdx);
        playedAtRef.current = new Date().toISOString();

        const incomingSlot: 'A' | 'B' = activeSlotRef.current === 'A' ? 'B' : 'A';
        const outgoingSlot = activeSlotRef.current;
        const nextTransition = items[targetIdx]?.transition ?? 'FADE';
        const nextTransMs    = items[targetIdx]?.transitionDuration ?? DEFAULT_TRANSITION_MS;
        transitionMsRef.current = nextTransMs;
        const afterNextIdx = (targetIdx + 1) % items.length;
        const needsPrePosition = nextTransition === 'SLIDE' || nextTransition === 'ZOOM'
                              || nextTransition === 'FLIP'  || nextTransition === 'WIPE';

        if (needsPrePosition) {
            flushSync(() => {
                setTransitionType(nextTransition);
                setTransitionMs(nextTransMs);
                setPrePositioningSlot(incomingSlot);
                if (incomingSlot === 'A') { setSlotA(items[targetIdx]); setSlotAOffset(targetOffsetMs); }
                else                      { setSlotB(items[targetIdx]); setSlotBOffset(targetOffsetMs); }
            });
            let rafFired = false;
            const doSwap = () => {
                if (rafFired) return;
                rafFired = true;
                setPrePositioningSlot(null);
                activeSlotRef.current = incomingSlot;
                setActiveSlot(incomingSlot);
                setTimeout(() => {
                    if (outgoingSlot === 'A') { setSlotA(items[afterNextIdx]); setSlotAOffset(0); }
                    else                      { setSlotB(items[afterNextIdx]); setSlotBOffset(0); }
                }, nextTransMs + 50);
            };
            requestAnimationFrame(doSwap);
            setTimeout(doSwap, 32);
        } else {
            if (incomingSlot === 'A') { setSlotA(items[targetIdx]); setSlotAOffset(targetOffsetMs); }
            else                      { setSlotB(items[targetIdx]); setSlotBOffset(targetOffsetMs); }
            setTransitionType(nextTransition);
            setTransitionMs(nextTransMs);
            activeSlotRef.current = incomingSlot;
            setActiveSlot(incomingSlot);
            setTimeout(() => {
                if (outgoingSlot === 'A') { setSlotA(items[afterNextIdx]); setSlotAOffset(0); }
                else                      { setSlotB(items[afterNextIdx]); setSlotBOffset(0); }
            }, nextTransMs + 50);
        }
    }, []);

    // Schedule the NTP-aligned timer. Each call computes exactly how many ms remain
    // for the current NTP item, so errors from the previous tick do NOT carry over.
    const scheduleNTPTick = useCallback(() => {
        if (ntpTimerRef.current) { clearTimeout(ntpTimerRef.current); ntpTimerRef.current = null; }
        const items = itemsRef.current;
        const epoch = scheduleEpochRef.current;
        const totalMs = scheduleTotalMsRef.current;
        if (!epoch || !totalMs || items.length === 0) return; // no NTP epoch → skip
        const serverMs = estimatedServerTimeMs();
        const { index, offsetMs } = calculateSyncPosition(items, epoch, totalMs, serverMs);
        const remaining = Math.max(100, getItemDurationMs(items[index]) - offsetMs);
        ntpTimerRef.current = setTimeout(() => {
            ntpTimerRef.current = null;
            if (isPausedRef.current) return; // paused — tick restarts when unpaused
            const now = estimatedServerTimeMs();
            const { index: ntpIdx, offsetMs: ntpOff } = calculateSyncPosition(
                itemsRef.current, scheduleEpochRef.current, scheduleTotalMsRef.current, now,
            );
            // Advance if NTP says different item. Debounce in doAdvanceTo prevents backward
            // jumps when this fires slightly after handleItemEnded already advanced.
            if (ntpIdx !== currentIndexRef.current) {
                doAdvanceTo(ntpIdx, ntpOff);
            }
            scheduleNTPTick(); // reschedule for next boundary — errors don't accumulate
        }, remaining);
    }, [estimatedServerTimeMs, doAdvanceTo]);

    // Keep ref in sync so clockReset (inside useEffect) can always call the latest version
    scheduleNTPTickRef.current = scheduleNTPTick;

    // Cleanup NTP timer on unmount
    useEffect(() => () => {
        if (ntpTimerRef.current) clearTimeout(ntpTimerRef.current);
    }, []);

    // MediaSlide callback — fires when image timer ends or video onEnded.
    // IMPORTANT: always uses NTP to determine starting offset of the next item.
    // Without this, one device may use handleItemEnded (offset=0) while the other
    // uses the NTP timer (offset=ntpOff), causing a permanent phase shift of ntpOff ms.
    const handleItemEnded = useCallback(() => {
        if (isPausedRef.current) return;
        const items = itemsRef.current;
        if (items.length === 0) return;

        const epoch   = scheduleEpochRef.current;
        const totalMs = scheduleTotalMsRef.current;

        if (epoch && totalMs > 0) {
            // Ask NTP where we should be right now
            const serverMs = estimatedServerTimeMs();
            const { index: ntpIdx, offsetMs: ntpOff } = calculateSyncPosition(items, epoch, totalMs, serverMs);
            if (ntpIdx !== currentIndexRef.current) {
                // NTP already moved us past the current item (possibly by >1 item)
                doAdvanceTo(ntpIdx, ntpOff);
            }
            // If NTP still says current item (timer fired early): do NOT advance.
            // scheduleNTPTick() below will set a fresh timer for the true boundary.
            // Both devices fire at the same absolute time → no within-item drift.
        } else {
            // No global clock epoch (edge case) — fall back to sequential
            doAdvanceTo((currentIndexRef.current + 1) % items.length, 0);
        }

        scheduleNTPTick(); // re-anchor NTP timer after each advance
    }, [doAdvanceTo, estimatedServerTimeMs, scheduleNTPTick]);

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

    if (licenseStatus === 'LICENSE_EXPIRED' || licenseStatus === 'LICENSE_REQUIRED') {
        return <LicenseRequiredScreen status={licenseStatus as 'LICENSE_EXPIRED' | 'LICENSE_REQUIRED'} />;
    }

    if (!syncData) {
        // If sync failed and there's no cached data, show StandbyScreen so the
        // display looks professional (no error text visible to audience).
        // The offline dot tells ops staff the device is disconnected.
        if (syncError) {
            return (
                <>
                    <StandbyScreen deviceName={deviceInfo?.deviceName} />
                    <OfflineIndicator isOffline />
                </>
            );
        }
        // Still loading on first boot — show minimal spinner
        return (
            <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', bgcolor: '#0D0D0D',
            }}>
                <img src="/logo-icon.png" alt="DMS Signage" style={{ height: 48, width: 'auto', objectFit: 'contain', opacity: 0.7 }} />
            </Box>
        );
    }

    const items = syncData ? getActiveItems(syncData) : [];

    if (items.length === 0) {
        return (
            <>
                <StandbyScreen deviceName={deviceInfo?.deviceName} />
                <OfflineIndicator isOffline={isOffline} />
            </>
        );
    }

    // OfflineIndicator rendered as overlay in main return below

    // ── Debug overlay ──────────────────────────────────────────────────────────
    const activeItem = activeSlot === 'A' ? slotA : slotB;
    const debugPanel = DEBUG && (
        <Box sx={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
            bgcolor: 'rgba(0,0,0,0.88)', color: '#0f0', fontFamily: 'monospace',
            fontSize: 12, p: 1.5, maxHeight: '60vh', overflowY: 'auto',
            pointerEvents: 'none',
        }}>
            <div style={{ color: '#fff', marginBottom: 4 }}>── PLAYER DEBUG ──</div>
            <div>deviceId: {deviceInfo?.deviceId ?? '(none)'}</div>
            <div>syncError: <span style={{ color: syncError ? '#f66' : '#0f0' }}>{syncError ?? 'none'}</span></div>
            <div>schedules: {syncData?.schedules.length ?? 0} | activeItems: {items.length}</div>
            {syncGroupRef.current?.startEpoch && (
                <div style={{ color: '#fa0' }}>
                    SYNC group={syncGroupRef.current.id.slice(0, 8)}
                    {' | '}offset={slotAOffset > 0 ? `${(slotAOffset / 1000).toFixed(1)}s` : '0s'}
                </div>
            )}
            <div>currentIndex: {currentIndex} | activeSlot: {activeSlot}</div>
            <div>slotA: {slotA?.mediaTitle ?? '—'} (off={slotAOffset}ms) | slotB: {slotB?.mediaTitle ?? '—'} (off={slotBOffset}ms)</div>
            {(() => {
                const epoch = scheduleEpochRef.current;
                const totalMs = scheduleTotalMsRef.current;
                if (!epoch || !totalMs || syncGroupRef.current?.startEpoch) return null;
                const serverMs = estimatedServerTimeMs();
                const { index: ntpIdx, offsetMs: ntpOff } = calculateSyncPosition(itemsRef.current, epoch, totalMs, serverMs);
                const idxMatch = Number(currentIndex) === Number(ntpIdx);
                return (
                    <div style={{ color: idxMatch ? '#0f0' : '#f66' }}>
                        NTP: idx={ntpIdx} off={(ntpOff/1000).toFixed(1)}s | playing: idx={currentIndex}
                        {' '}{idxMatch ? '✓' : `✗ expect idx=${ntpIdx} got idx=${currentIndex}`}
                    </div>
                );
            })()}
            <div>contentHash: {syncData?.contentHash?.slice(0, 16) ?? '—'}</div>
            {syncData?.schedules.map((s, i) => (
                <div key={i} style={{ marginTop: 4, color: '#adf' }}>
                    [{i}] {s.scheduleName} | items={s.playlist.items.length}
                    {' | '}days={s.daysOfWeek.length === 0 ? 'all' : s.daysOfWeek.join(',')}
                    {' | '}time={s.startTime ?? '00:00'}–{s.endTime ?? '24:00'}
                    {' | '}active={isScheduleActiveNow(s, syncData?.timezone ?? 'Asia/Ho_Chi_Minh') ? '✓' : '✗'}
                </div>
            ))}
            {activeItem && (
                <div style={{ marginTop: 4, color: '#fa0' }}>
                    playing: [{currentIndex}] {activeItem.mediaTitle} ({activeItem.mediaType})
                </div>
            )}
        </Box>
    );

    // ── Media info overlay (debug=1) ───────────────────────────────────────────
    const mediaInfoOverlay = DEBUG && activeItem && (
        <Box sx={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9997,
            bgcolor: 'rgba(0,0,60,0.92)', color: '#fff',
            fontFamily: 'monospace', fontSize: 15, px: 2, py: 1.5,
            borderBottom: '2px solid #6C63FF',
            pointerEvents: 'none',
        }}>
            <Box sx={{ color: '#6cf', fontWeight: 'bold', fontSize: 17 }}>
                [{currentIndex + 1}/{items.length}] {activeItem.mediaTitle} ({activeItem.mediaType})
            </Box>
            <Box sx={{ color: '#aaa', fontSize: 12, mt: 0.5, wordBreak: 'break-all' }}>
                URL: {activeItem.mediaUrl}
            </Box>
            <Box sx={{ color: '#888', fontSize: 11, mt: 0.25 }}>
                duration: {activeItem.durationOverride ?? activeItem.duration ?? 10}s
                {' | '}slot: {activeSlot}
                {' | '}mediaId: {activeItem.mediaId.slice(0, 12)}
            </Box>
        </Box>
    );

    // ── Pause overlay (Chrome 73 safe: no gap, no inset) ──────────────────────
    const pauseOverlay = isPaused && (
        <Box sx={{
            position: 'fixed',
            top: 0, right: 0, bottom: 0, left: 0,
            zIndex: 9990,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'rgba(0,0,0,0.45)',
            pointerEvents: 'none',
        }}>
            <Box sx={{
                bgcolor: 'rgba(0,0,0,0.72)',
                borderRadius: 3,
                px: 5, py: 3,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
            }}>
                <Box component="span" sx={{ fontSize: 52, lineHeight: 1, color: '#fff', mb: 1.5 }}>⏸</Box>
                <Typography sx={{ color: '#fff', fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>
                    Đang tạm dừng
                </Typography>
                <Typography sx={{ color: '#aaa', fontSize: 13, mt: 1 }}>
                    Giữ màn hình để tiếp tục
                </Typography>
            </Box>
        </Box>
    );

    // ── Download progress screen ──────────────────────────────────────────────
    if (dlStatus === 'DOWNLOADING') {
        return <DownloadProgressScreen progress={dlProgress} />;
    }

    // ── Slot layer styles ──────────────────────────────────────────────────────
    // Chrome 73: transition + opacity both supported. No `inset` used.
    // transitionType is set from the INCOMING item in handleItemEnded (not activeItem).

    const slotStyle = (isActive: boolean, slot: 'A' | 'B'): React.CSSProperties => {
        const base: React.CSSProperties = {
            position: 'absolute',
            top: 0, right: 0, bottom: 0, left: 0,
            zIndex: isActive ? 2 : 1,
            pointerEvents: isActive ? 'auto' : 'none',
        };

        if (prePositioningSlot === slot) {
            const entryTransform =
                transitionType === 'SLIDE' ? 'translateX(100%)' :
                transitionType === 'ZOOM'  ? 'scale(1.08)'      :
                transitionType === 'FLIP'  ? 'rotateY(-90deg)'  :
                transitionType === 'WIPE'  ? undefined           : undefined;
            return {
                ...base, opacity: 0, transform: entryTransform,
                transition: 'none', zIndex: 1, pointerEvents: 'none',
                // WIPE: start fully clipped from right edge (invisible)
                ...(transitionType === 'WIPE' ? { clipPath: 'inset(0 100% 0 0)', opacity: 1 } : {}),
            };
        }

        switch (transitionType) {
            case 'NONE':
                return { ...base, opacity: isActive ? 1 : 0 };
            case 'SLIDE':
                return {
                    ...base,
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? 'translateX(0)' : 'translateX(-100%)',
                    transition: `transform ${transitionMs}ms ease-in-out, opacity ${transitionMs}ms ease-in-out`,
                };
            case 'ZOOM':
                return {
                    ...base,
                    opacity: isActive ? 1 : 0,
                    transform: isActive ? 'scale(1)' : 'scale(1.06)',
                    transition: `transform ${transitionMs}ms ease-in-out, opacity ${transitionMs}ms ease-in-out`,
                };
            case 'FLIP':
                // 3D horizontal page-flip. Parent container must have perspective set.
                return {
                    ...base,
                    opacity: 1,
                    transform: isActive ? 'rotateY(0deg)' : 'rotateY(90deg)',
                    transition: `transform ${transitionMs}ms ease-in-out`,
                    backfaceVisibility: 'hidden',
                };
            case 'WIPE':
                // Clip-path curtain wipe: incoming reveals left→right, outgoing fades behind
                return isActive ? {
                    ...base,
                    clipPath: 'inset(0 0% 0 0)',
                    transition: `clip-path ${transitionMs}ms ease-in-out`,
                    zIndex: 2,
                } : {
                    ...base,
                    opacity: 1,
                    zIndex: 1,
                    transition: 'none',
                };
            default: // FADE
                return {
                    ...base,
                    opacity: isActive ? 1 : 0,
                    transition: `opacity ${transitionMs}ms ease-in-out`,
                };
        }
    };

    return (
        <Box
            sx={{
                position: 'fixed', top: 0, right: 0, bottom: 0, left: 0,
                bgcolor: '#111', overflow: 'hidden',
                // perspective required for FLIP 3D transforms
                ...(transitionType === 'FLIP' ? { perspective: '1200px' } : {}),
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={cancelLongPress}
            onTouchCancel={cancelLongPress}
        >
            {mediaInfoOverlay}
            {debugPanel}
            <OfflineIndicator isOffline={isOffline} />
            {pauseOverlay}

            {/* ── Slot A ── */}
            {slotA && (
                <Box sx={slotStyle(activeSlot === 'A', 'A')}>
                    <MediaSlide
                        item={{ ...slotA, mediaUrl: resolveMediaUrl(slotA.mediaId, slotA.mediaUrl) }}
                        active={activeSlot === 'A'}
                        onEnded={handleItemEnded}
                        onWillEnd={activeSlot === 'A' ? handleWillEnd : undefined}
                        startOffsetMs={slotAOffset}
                        debug={DEBUG}
                        isPaused={isPaused}
                    />
                </Box>
            )}

            {/* ── Slot B ── */}
            {slotB && (
                <Box sx={slotStyle(activeSlot === 'B', 'B')}>
                    <MediaSlide
                        item={{ ...slotB, mediaUrl: resolveMediaUrl(slotB.mediaId, slotB.mediaUrl) }}
                        active={activeSlot === 'B'}
                        onEnded={handleItemEnded}
                        onWillEnd={activeSlot === 'B' ? handleWillEnd : undefined}
                        startOffsetMs={slotBOffset}
                        debug={DEBUG}
                        isPaused={isPaused}
                    />
                </Box>
            )}
        </Box>
    );
}
