import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import * as deviceSyncController from './device-sync.controller';
import { authenticateDevice } from '../../shared/middleware/auth.middleware';
import { validate } from '../../shared/middleware/validate.middleware';
import {
    heartbeatSchema, playbackLogSchema, batchPlaybackLogSchema, registerDeviceSchema,
} from './device-sync.schema';

const router = Router();

// ─── Rate Limiters ────────────────────────────────────────────────────────────
//
// Authenticated endpoints dùng deviceId (từ JWT) làm key → mỗi device có quota riêng,
// không bị ảnh hưởng bởi các device khác cùng IP (NAT).
//
// Register (public) dùng IP vì chưa có JWT.

function deviceKey(req: Request): string {
    // req.user được set bởi authenticateDevice trước khi limiter chạy
    return req.user?.userId ?? req.ip ?? 'unknown';
}

// /register — public, chặn brute-force thử pairing code
const registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.' },
});

// /heartbeat — device gọi mỗi 30s → ~2 req/phút; cho 4 để có buffer khi retry
const heartbeatLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1 phút
    max: 4,
    keyGenerator: deviceKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Heartbeat quá nhanh. Chờ trước khi gửi tiếp.' },
});

// /sync — gọi khi boot + khi syncRequired=true; 12 req/giờ đủ dư
const syncLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 giờ
    max: 12,
    keyGenerator: deviceKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Sync quá thường xuyên. Vui lòng chờ trước khi sync lại.' },
});

// /playback-log — log sau mỗi media item phát xong; 200/phút rất thoải mái
const playbackLogLimiter = rateLimit({
    windowMs: 60 * 1000,       // 1 phút
    max: 200,
    keyGenerator: deviceKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Playback log rate limit exceeded.' },
});

// /playback-logs/batch — heavy operation khi flush offline logs; 20/giờ
const batchLogLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 giờ
    max: 20,
    keyGenerator: deviceKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Batch log rate limit exceeded. Thử lại sau ít phút.' },
});

// /offline — tín hiệu shutdown sạch; 20/giờ quá đủ
const offlineLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,  // 1 giờ
    max: 20,
    keyGenerator: deviceKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many offline notifications.' },
});

// ─── Public (no auth) ─────────────────────────────────────────────────────────

/**
 * @route   POST /api/device/register
 * @desc    First-time device pairing. Receives pairingCode, returns device JWT.
 * @access  Public
 */
router.post('/register', registerLimiter, validate(registerDeviceSchema), deviceSyncController.registerDevice);

// ─── Device-authenticated routes ──────────────────────────────────────────────
// authenticateDevice chạy TRƯỚC các limiters → req.user.userId có sẵn cho deviceKey()

router.use(authenticateDevice);

/**
 * @route   POST /api/device/heartbeat
 * @desc    Periodic ping (every 30-60s). Updates lastSeen + health metrics.
 *          Response: { syncRequired } — true nếu content đã thay đổi.
 * @access  Device JWT
 */
router.post('/heartbeat', heartbeatLimiter, validate(heartbeatSchema), deviceSyncController.heartbeat);

/**
 * @route   GET /api/device/sync
 * @desc    Full sync payload: schedules + playlists + media + contentHash.
 * @access  Device JWT
 */
router.get('/sync', syncLimiter, deviceSyncController.syncContent);

/**
 * @route   POST /api/device/playback-log
 * @desc    Report a single media playback event.
 * @access  Device JWT
 */
router.post('/playback-log', playbackLogLimiter, validate(playbackLogSchema), deviceSyncController.logPlayback);

/**
 * @route   POST /api/device/playback-logs/batch
 * @desc    Upload up to 500 offline playback logs at once (reconnect catchup).
 * @access  Device JWT
 */
router.post('/playback-logs/batch', batchLogLimiter, validate(batchPlaybackLogSchema), deviceSyncController.batchLogPlayback);

/**
 * @route   POST /api/device/offline
 * @desc    Device clean shutdown notification.
 * @access  Device JWT
 */
router.post('/offline', offlineLimiter, deviceSyncController.markOffline);

export default router;
