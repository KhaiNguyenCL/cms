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
import { Box, CircularProgress, Typography } from '@mui/material';
import { Lock as LockIcon } from '@mui/icons-material';

const DEBUG = new URLSearchParams(window.location.search).get('debug') === '1';
const FADE_MS = 500; // crossfade duration (ms)

import {
    setDeviceToken,
    fetchSync,
    sendHeartbeat,
    logPlayback,
    type SyncResponse,
    type PlaylistItemSync,
    type StoreState,
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
        const dur = ((items[i].durationOverride != null && items[i].durationOverride! > 0)
            ? items[i].durationOverride!
            : (items[i].duration ?? 10)) * 1000;
        if (elapsed < acc + dur) return { index: i, offsetMs: elapsed - acc };
        acc += dur;
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
            <LockIcon sx={{ fontSize: 80, color: '#555' }} />
            <Typography variant="h5" sx={{ color: '#888', fontWeight: 600 }}>
                License Required
            </Typography>
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
    const [deviceInfo, setDeviceInfo]   = useState<DeviceInfo | null>(null);
    const [syncData, setSyncData]       = useState<SyncResponse | null>(null);
    const [error, setError]             = useState<string | null>(null);
    const [syncError, setSyncError]     = useState<string | null>(null);
    const [licenseStatus, setLicenseStatus] = useState<string | null>(null);

    // ── Double-buffer slots ────────────────────────────────────────────────────
    const [slotA, setSlotA]         = useState<PlaylistItemSync | null>(null);
    const [slotB, setSlotB]         = useState<PlaylistItemSync | null>(null);
    const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
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
    // Debounce guard: ngăn handleItemEnded bị gọi 2 lần trong 800ms
    const lastAdvancedRef = useRef<number>(0);
    // Track schedule đang chạy — để detect khi admin đổi schedule
    const currentScheduleIdRef = useRef<string | null>(null);
    // Track active store sync for heartbeat drift correction
    const syncGroupRef = useRef<StoreState | null>(null);

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

        const params = new URLSearchParams(window.location.search);
        const token    = params.get('token');
        const deviceId = params.get('deviceId');
        const orgId    = params.get('orgId');
        if (token && deviceId && orgId) {
            const info: DeviceInfo = {
                token, deviceId, orgId,
                deviceName: params.get('deviceName') ?? 'Dev Browser',
                serverUrl: window.location.origin,
                hwId: params.get('hwId') ?? 'dev',
            };
            setDeviceToken(info.token);
            setDeviceInfo(info);
            return;
        }

        setError('NativeBridge not available.\nOpen this page in the SignageCMS Android app.\n\nDev mode: add ?token=...&deviceId=...&orgId=... to URL.');
    }, []);

    // ── 2. Fetch sync ──────────────────────────────────────────────────────────

    /**
     * Sau mỗi sync thành công:
     * - Gửi toàn bộ media items (tất cả schedules) cho Android để download về local
     * - Gửi danh sách mediaIds cần giữ để Android xóa file không còn dùng
     */
    const triggerNativeCacheSync = useCallback((data: SyncResponse) => {
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

        window.NativeBridge.enqueueMediaDownloads?.(JSON.stringify(allItems));
        window.NativeBridge.pruneMediaCache?.(JSON.stringify([...seen]));

        if (DEBUG) {
            const info = window.NativeBridge.getCacheInfo?.();
            console.log('[Cache] enqueued', allItems.length, 'items | cache:', info);
        }
    }, []);

    const doSync = useCallback(async () => {
        if (!deviceInfo || syncingRef.current) return;
        syncingRef.current = true;
        try {
            const data = await fetchSync();

            if ((data as any).licenseStatus === 'LICENSE_EXPIRED' || (data as any).licenseStatus === 'LICENSE_REQUIRED') {
                setLicenseStatus((data as any).licenseStatus);
                syncingRef.current = false;
                return;
            }
            setLicenseStatus(null);

            setSyncData(data);           // triggers slot management effect below
            contentHashRef.current = data.contentHash;
            setSyncError(null);

            // Trigger Android to download/cache all media files
            triggerNativeCacheSync(data);
        } catch (e: unknown) {
            const msg = e instanceof Error ? `${e.message}` : String(e);
            console.error('[Player] sync failed', e);
            const status = (e as { response?: { status?: number } })?.response?.status;
            socketEmit('device.error', { code: 'SYNC_FAILED', message: msg, httpStatus: status });
            if (status === 401) {
                window.NativeBridge?.clearCredentialsAndRepair?.();
            }
            setSyncError(msg);
        } finally {
            syncingRef.current = false;
        }
    }, [deviceInfo, triggerNativeCacheSync]);

    useEffect(() => {
        if (deviceInfo) doSync();
    }, [deviceInfo, doSync]);

    // ── 3. Socket.IO: re-sync on content/schedule updates ─────────────────────
    // onSyncState: admin started/stopped/restarted a sync group → immediate re-sync
    // (no jitter — we want the position recalculated right away)

    const { emit: socketEmit } = usePlayerSocket(deviceInfo?.token ?? null, doSync, () => doSync());

    // ── 4. Heartbeat every 30s ─────────────────────────────────────────────────

    useEffect(() => {
        if (!deviceInfo) return;
        const timer = setInterval(async () => {
            try {
                // Notify watchdog that player is alive
                window.NativeBridge?.ping?.();

                const hb = await sendHeartbeat(contentHashRef.current);

                // Sync PIN if server returned a new value
                if ((hb as any).deviceAdminPin) {
                    window.NativeBridge?.updateDevicePin?.((hb as any).deviceAdminPin);
                }

                if ((hb as any).licenseStatus === 'EXPIRED' || !(hb as any).isLicensed) {
                    setLicenseStatus((hb as any).licenseStatus === 'EXPIRED' ? 'LICENSE_EXPIRED' : 'LICENSE_REQUIRED');
                } else {
                    setLicenseStatus(null);
                    if (hb.syncRequired) {
                        doSync();
                    } else {
                        // ── Sync group drift correction ───────────────────────
                        // Every heartbeat, verify we're on the right item.
                        // Corrects for clock drift, missed advances, or late joins.
                        const sg = syncGroupRef.current;
                        if (sg?.startEpoch && hb.serverTime && itemsRef.current.length > 0) {
                            const serverTimeMs = new Date(hb.serverTime).getTime();
                            if (!isNaN(serverTimeMs)) {
                                const { index: expectedIdx, offsetMs } = calculateSyncPosition(
                                    itemsRef.current, sg.startEpoch, sg.totalDurationMs, serverTimeMs,
                                );
                                if (expectedIdx !== currentIndexRef.current) {
                                    const nextIdx = (expectedIdx + 1) % itemsRef.current.length;
                                    currentIndexRef.current = expectedIdx;
                                    setCurrentIndex(expectedIdx);
                                    activeSlotRef.current = 'A';
                                    setActiveSlot('A');
                                    setSlotA(itemsRef.current[expectedIdx]);
                                    setSlotAOffset(offsetMs);
                                    setSlotB(itemsRef.current[nextIdx]);
                                    setSlotBOffset(0);
                                    lastAdvancedRef.current = Date.now();
                                    playedAtRef.current = new Date().toISOString();
                                }
                            }
                        }
                    }
                }
            } catch {
                // ignore transient heartbeat failures
            }
        }, 30_000);
        return () => clearInterval(timer);
    }, [deviceInfo, doSync]);

    // ── Pause/freeze: long-press touch (600ms) toggles freeze ────────────────
    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        const t = e.touches[0];
        touchStartPosRef.current = { x: t.clientX, y: t.clientY };
        longPressTimerRef.current = setTimeout(() => {
            longPressTimerRef.current = null;
            touchStartPosRef.current = null;
            isPausedRef.current = !isPausedRef.current;
            setIsPaused(isPausedRef.current);
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

        if (syncData.syncGroup?.startEpoch) {
            const sg = syncData.syncGroup;
            const syncItems = sg.playlist?.items ?? [];
            if (syncItems.length > 0) {
                itemsRef.current = syncItems;
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

        // Helper: hard reset tất cả về đầu playlist mới
        const hardReset = () => {
            currentScheduleIdRef.current = newScheduleId;
            lastAdvancedRef.current = 0;
            currentIndexRef.current = 0;
            setCurrentIndex(0);
            activeSlotRef.current = 'A';
            setActiveSlot('A');
            setSlotAOffset(0);
            setSlotBOffset(0);
            playedAtRef.current = new Date().toISOString();
            if (items.length > 0) {
                setSlotA(items[0]);
                setSlotB(items.length > 1 ? items[1] : items[0]);
            } else {
                // Không có schedule nào active → clear slots → render sẽ show StandbyScreen
                setSlotA(null);
                setSlotB(null);
            }
        };

        if (!initialSyncDone.current) {
            // ── First sync: initialize both slots ──────────────────────────────
            initialSyncDone.current = true;
            hardReset();
        } else {
            const scheduleChanged = newScheduleId !== currentScheduleIdRef.current;

            if (scheduleChanged) {
                // ── Schedule đổi (admin toggle, hết giờ, v.v.) → reset ngay ─────
                hardReset();
            } else {
                // ── Cùng schedule → chỉ update inactive slot (content thay đổi) ──
                if (items.length > 0) {
                    const clamped = Math.min(currentIndexRef.current, items.length - 1);
                    currentIndexRef.current = clamped;
                    setCurrentIndex(clamped);

                    const nextIdx = (clamped + 1) % items.length;
                    const inactiveSlot = activeSlotRef.current === 'A' ? 'B' : 'A';
                    if (inactiveSlot === 'A') setSlotA(items[nextIdx]);
                    else setSlotB(items[nextIdx]);
                }
            }
        }
    }, [syncData]);

    // ── 5b. Periodic schedule re-evaluation — xử lý time-based schedule ─────────
    // Mỗi 60s tạo reference mới của syncData để trigger useEffect([syncData]),
    // từ đó re-evaluate isScheduleActiveNow với thời gian hiện tại.
    // Ví dụ: schedule A chạy 9:00–12:00, khi đồng hồ qua 12:00 → tự detect và switch.
    useEffect(() => {
        const interval = setInterval(() => {
            setSyncData(sd => sd ? { ...sd } : sd);
        }, 60_000);
        return () => clearInterval(interval);
    }, []);

    // ── 6. Advance to next item with crossfade ─────────────────────────────────

    const handleItemEnded = useCallback(async () => {
        // Don't advance when frozen
        if (isPausedRef.current) return;
        // Debounce: ngăn double-call trong vòng 800ms (race giữa timer và onError)
        const now = Date.now();
        if (now - lastAdvancedRef.current < 800) return;
        lastAdvancedRef.current = now;

        const items = itemsRef.current;
        if (items.length === 0) return;

        const idx  = currentIndexRef.current;
        const item = items[idx];

        // Log playback
        logPlayback({
            mediaId: item.mediaId,
            playedAt: playedAtRef.current,
            durationPlayed: Math.round((Date.now() - new Date(playedAtRef.current).getTime()) / 1000),
            completed: true,
        }).catch(() => {});

        const nextIdx = (idx + 1) % items.length;
        currentIndexRef.current = nextIdx;
        setCurrentIndex(nextIdx);
        playedAtRef.current = new Date().toISOString();

        // The incoming slot already has the next item preloaded —
        // it was filled during the PREVIOUS advance (or at init for slot B).
        const incomingSlot: 'A' | 'B' = activeSlotRef.current === 'A' ? 'B' : 'A';
        const outgoingSlot = activeSlotRef.current;

        // Fill the outgoing (now-inactive) slot with the item AFTER next,
        // so it preloads silently while the incoming item plays.
        // Always reset offset to 0 — natural advance always starts from beginning.
        const afterNextIdx = (nextIdx + 1) % items.length;
        if (outgoingSlot === 'A') { setSlotA(items[afterNextIdx]); setSlotAOffset(0); }
        else                      { setSlotB(items[afterNextIdx]); setSlotBOffset(0); }

        // Trigger CSS crossfade
        activeSlotRef.current = incomingSlot;
        setActiveSlot(incomingSlot);
    }, []);

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
        return (
            <Box sx={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100vh', bgcolor: '#0D0D0D',
            }}>
                <CircularProgress sx={{ color: '#6C63FF' }} />
                {syncError && (
                    <Typography sx={{ position: 'absolute', bottom: 40, color: '#f66', fontSize: 13, px: 3, textAlign: 'center' }}>
                        Sync error: {syncError}
                    </Typography>
                )}
            </Box>
        );
    }

    const items = syncData ? getActiveItems(syncData) : [];

    if (items.length === 0) {
        return (
            <>
                <StandbyScreen deviceName={deviceInfo?.deviceName} />
                {syncError && (
                    <Box sx={{
                        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
                        bgcolor: 'rgba(160,0,0,0.92)', color: '#fff',
                        fontFamily: 'monospace', fontSize: 13, px: 2, py: 0.75,
                        display: 'flex', alignItems: 'center', gap: 1.5,
                    }}>
                        <span style={{ color: '#ff9999', flexShrink: 0 }}>⚠ Sync error:</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {syncError}
                        </span>
                    </Box>
                )}
            </>
        );
    }

    // ── Persistent error banner ────────────────────────────────────────────────
    const errorBanner = syncError && (
        <Box sx={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
            bgcolor: 'rgba(160,0,0,0.92)', color: '#fff',
            fontFamily: 'monospace', fontSize: 13, px: 2, py: 0.75,
            display: 'flex', alignItems: 'center', gap: 1.5,
            borderTop: '1px solid rgba(255,100,100,0.4)',
        }}>
            <span style={{ color: '#ff9999', flexShrink: 0 }}>⚠ Sync error:</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {syncError}
            </span>
            <span style={{ marginLeft: 'auto', flexShrink: 0, color: '#aaa', fontSize: 11 }}>
                {deviceInfo?.deviceId?.slice(0, 8)}
            </span>
        </Box>
    );

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
            <div>slotA: {slotA?.mediaTitle ?? '—'} | slotB: {slotB?.mediaTitle ?? '—'}</div>
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

    // ── Slot layer styles ──────────────────────────────────────────────────────
    // Chrome 73: transition + opacity both supported. No `inset` used.
    const slotStyle = (isActive: boolean) => ({
        position: 'absolute' as const,
        top: 0, right: 0, bottom: 0, left: 0,
        opacity: isActive ? 1 : 0,
        // CSS transition — supported since Chrome 26
        transition: `opacity ${FADE_MS}ms ease-in-out`,
        // Active slot on top so it receives pointer events correctly
        zIndex: isActive ? 2 : 1,
        pointerEvents: isActive ? 'auto' : 'none' as const,
    });

    return (
        <Box
            sx={{ position: 'fixed', top: 0, right: 0, bottom: 0, left: 0, bgcolor: '#111', overflow: 'hidden' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={cancelLongPress}
            onTouchCancel={cancelLongPress}
        >
            {mediaInfoOverlay}
            {debugPanel}
            {errorBanner}
            {pauseOverlay}

            {/* ── Slot A ── */}
            {slotA && (
                <Box sx={slotStyle(activeSlot === 'A')}>
                    <MediaSlide
                        item={slotA}
                        active={activeSlot === 'A'}
                        onEnded={handleItemEnded}
                        startOffsetMs={slotAOffset}
                        debug={DEBUG}
                        isPaused={isPaused}
                    />
                </Box>
            )}

            {/* ── Slot B ── */}
            {slotB && (
                <Box sx={slotStyle(activeSlot === 'B')}>
                    <MediaSlide
                        item={slotB}
                        active={activeSlot === 'B'}
                        onEnded={handleItemEnded}
                        startOffsetMs={slotBOffset}
                        debug={DEBUG}
                        isPaused={isPaused}
                    />
                </Box>
            )}
        </Box>
    );
}
