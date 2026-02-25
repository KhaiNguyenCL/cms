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
        currentContentHash: z.string().length(64).optional(), // SHA-256 hex từ lần sync gần nhất
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
