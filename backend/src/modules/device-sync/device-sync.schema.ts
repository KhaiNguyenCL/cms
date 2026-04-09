import { z } from 'zod';

// ─── Heartbeat ────────────────────────────────────────────────────────────────
// Android TV gửi mỗi 30-60 giây để báo còn sống + cập nhật health metrics

export const heartbeatSchema = z.object({
    body: z.object({
        cpuUsage: z.number().min(0).max(100).optional(),
        memoryUsage: z.number().min(0).max(100).optional(),
        storageTotal: z.number().int().min(0).optional(),  // bytes
        storageUsed: z.number().int().min(0).optional(),  // bytes
        networkType: z.string().max(50).optional(),       // 'WIFI' | 'ETHERNET' | 'MOBILE'
        appVersion: z.string().max(50).optional(),
        osVersion: z.string().max(50).optional(),
        model: z.string().max(150).optional(),    // "Xiaomi Mi Box S" — sent every heartbeat so already-paired devices get updated
        currentContentHash: z.string().length(64).optional(), // SHA-256 hex từ lần sync gần nhất
        ipAddress: z.string().max(50).optional(),
        macAddress: z.string().max(50).optional(),
        heapMemory: z.number().int().min(0).optional(),
        networkConnected: z.boolean().optional(),
        processCpuPercent: z.number().min(0).max(100).optional(), // CPU% của riêng process player
        isScreenOn: z.boolean().optional(),  // false khi màn hình tắt (SLEEP)
        wanIp: z.string().max(50).optional(),  // WAN IP tự fetch từ ipify.org trên device
        // Sprint 2: local content cache
        downloadStatus:   z.enum(['PENDING','DOWNLOADING','READY','ERROR']).optional(),
        downloadProgress: z.number().int().min(0).max(100).optional(),
        contentReady:     z.boolean().optional(),
    }),
});

// ─── Sync (pull schedule + playlist + media list) ─────────────────────────────
// GET — no body needed; returns current active schedule for this device

// ─── Playback log ─────────────────────────────────────────────────────────────
// Android TV gửi mỗi khi 1 media được phát xong (hoặc interrupted)

export const playbackLogSchema = z.object({
    body: z.object({
        mediaId: z.string().min(1),
        playedAt: z.string().datetime(),       // ISO 8601
        durationPlayed: z.number().int().min(0),    // seconds actually played
        completed: z.boolean(),                 // true = played to end
    }),
});

// ─── Playlist session log ────────────────────────────────────────────────────
// Gửi khi hoàn thành 1 vòng playlist (completed=true) hoặc bị gián đoạn giữa chừng (completed=false)

export const playlistLogSchema = z.object({
    body: z.object({
        playlistId: z.string().uuid(),
        startedAt: z.string().datetime(),   // ISO 8601 — khi bắt đầu vòng này
        completed: z.boolean(),             // true = đã phát hết 1 vòng
    }),
});

// ─── Batch playback logs ──────────────────────────────────────────────────────
// Gửi nhiều logs 1 lần khi device offline rồi reconnect

export const batchPlaybackLogSchema = z.object({
    body: z.object({
        logs: z.array(z.object({
            mediaId: z.string().min(1),
            playedAt: z.string().datetime(),
            durationPlayed: z.number().int().min(0),
            completed: z.boolean(),
        })).min(1).max(500),
    }),
});

// ─── Register device (first-time pairing) ────────────────────────────────────
// Dùng pairingCode để claim device + lấy JWT device token

export const registerDeviceSchema = z.object({
    body: z.object({
        pairingCode: z.string().length(6).toUpperCase(),
        androidId: z.string().min(1).max(100),
        model: z.string().max(100).optional(),
        osVersion: z.string().max(50).optional(),
        appVersion: z.string().max(50).optional(),
    }),
});

export type HeartbeatBody = z.infer<typeof heartbeatSchema>['body'];
export type PlaybackLogBody = z.infer<typeof playbackLogSchema>['body'];
export type BatchPlaybackLogBody = z.infer<typeof batchPlaybackLogSchema>['body'];
export type RegisterDeviceBody = z.infer<typeof registerDeviceSchema>['body'];
