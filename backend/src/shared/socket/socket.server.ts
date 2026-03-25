import { Server as SocketIOServer, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import http from 'http';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import config from '../../config';
import logger from '../utils/logger';
import type { JwtPayload } from '../middleware/auth.middleware';

// ─── Singleton ────────────────────────────────────────────────────────────────

let io: SocketIOServer | null = null;

// Track devices that sent graceful offline signal before disconnecting.
// Key: deviceId, Value: reason string. Cleared on disconnect.
const gracefulOfflineMap = new Map<string, string>();

export function getIO(): SocketIOServer {
    if (!io) throw new Error('Socket.IO not initialized. Call initSocketIO(server) first.');
    return io;
}

// ─── Room name helpers ────────────────────────────────────────────────────────

/** Room for pushing commands/updates to a specific device */
export const deviceRoom = (deviceId: string) => `device:${deviceId}`;
/** Room for pushing updates to all admin/manager clients of an org */
export const orgRoom = (orgId: string) => `org:${orgId}`;

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initSocketIO(server: http.Server): SocketIOServer {
    io = new SocketIOServer(server, {
        cors: {
            origin: config.cors.origins,
            methods: ['GET', 'POST'],
        },
        // Screenshot base64 data URLs can be 300–600 KB; set 5 MB to be safe.
        maxHttpBufferSize: 5 * 1024 * 1024,
        // Faster dead-connection detection (default: 25s interval + 20s timeout = 45s)
        // Reduced to 15s + 10s = ~25s to detect power loss / network drop
        pingInterval: 15_000,
        pingTimeout:  10_000,
    });

    // Redis adapter — required for PM2 cluster mode so events are
    // forwarded across all worker processes via pub/sub.
    const redisOpts = {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
    };
    const pubClient = new Redis(redisOpts);
    const subClient = new Redis(redisOpts);
    pubClient.on('error', (err) => logger.error('Socket.IO pub Redis error', { err: err.message }));
    subClient.on('error', (err) => logger.error('Socket.IO sub Redis error', { err: err.message }));
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('Socket.IO Redis adapter attached');

    // ── Namespace: /device (Android TV) ──────────────────────────────────────
    const deviceNS = io.of('/device');

    deviceNS.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
        if (!token) return next(new Error('Device token required'));
        try {
            const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
            if (payload.type !== 'device') return next(new Error('Invalid token type'));
            (socket as SocketWithUser).user = payload;
            next();
        } catch {
            next(new Error('Invalid or expired device token'));
        }
    });

    deviceNS.on('connection', (rawSocket) => {
        const socket = rawSocket as unknown as SocketWithUser;
        const deviceId = socket.user.userId;
        const orgId = socket.user.organizationId;

        // Device joins its own private room + org-wide room (for content broadcasts)
        socket.join(deviceRoom(deviceId));
        socket.join(orgRoom(orgId));
        logger.info('Device connected via WebSocket', { deviceId });

        // Notify admin dashboard that this device is online
        io!.of('/admin').to(orgRoom(orgId)).emit('device.status', {
            deviceId,
            status: 'ONLINE',
            timestamp: new Date().toISOString(),
        });

        // ── Events from device → server ───────────────────────────────────────

        // device.status: device reports its current state
        socket.on('device.status', (data: DeviceStatusPayload) => {
            logger.debug('Device status update', { deviceId, ...data });
            // Forward to admin dashboard
            io!.of('/admin').to(orgRoom(orgId)).emit('device.status', {
                deviceId,
                ...data,
                timestamp: new Date().toISOString(),
            });
        });

        // device.error: device reports an error
        socket.on('device.error', (data: DeviceErrorPayload) => {
            logger.warn('Device error reported', { deviceId, ...data });
            io!.of('/admin').to(orgRoom(orgId)).emit('device.error', {
                deviceId,
                ...data,
                timestamp: new Date().toISOString(),
            });
        });

        // device.screenshot: device uploads screenshot result URL
        socket.on('device.screenshot', (data: { url: string }) => {
            logger.info('Device screenshot received', { deviceId, urlLength: data?.url?.length ?? 0 });
            io!.of('/admin').to(orgRoom(orgId)).emit('device.screenshot', {
                deviceId,
                url: data.url,
                timestamp: new Date().toISOString(),
            });
        });

        // device.playback: realtime now-playing report
        socket.on('device.playback', (data: NowPlayingPayload) => {
            io!.of('/admin').to(orgRoom(orgId)).emit('device.playback', {
                deviceId,
                ...data,
                timestamp: new Date().toISOString(),
            });
        });

        // device.going_offline: graceful shutdown signal (app closed / restart)
        // Emitted by CommandService.onDestroy() ~200ms before socket disconnects.
        socket.on('device.going_offline', (data: { reason?: string }) => {
            gracefulOfflineMap.set(deviceId, data?.reason ?? 'APP_CLOSED');
            logger.info('Device signaled graceful offline', { deviceId, reason: data?.reason });
        });

        // ── Disconnect ────────────────────────────────────────────────────────

        socket.on('disconnect', (reason) => {
            // A device has TWO concurrent socket connections to /device:
            //   1. CommandService (native Android) — always running
            //   2. usePlayerSocket (WebView JS)    — disconnects on every page reload
            //
            // After disconnect the socket has already left its rooms, so
            // adapter.rooms.get(deviceRoom) returns only the REMAINING connections.
            // Only mark OFFLINE when the last connection drops (i.e. the device
            // is truly unreachable), not on every WebView reload.
            const remaining = io!.of('/device').adapter.rooms.get(deviceRoom(deviceId));
            if (remaining && remaining.size > 0) {
                logger.debug('Device socket disconnected but other connections remain — keeping ONLINE', {
                    deviceId, remaining: remaining.size, reason,
                });
                return;
            }

            const gracefulReason = gracefulOfflineMap.get(deviceId);
            gracefulOfflineMap.delete(deviceId);
            const offlineType = gracefulReason ? 'GRACEFUL' : 'UNEXPECTED';
            logger.info('Device fully disconnected', { deviceId, reason, offlineType });

            import('../../modules/device-sync/device-sync.service')
                .then(({ markDeviceOffline }) => markDeviceOffline(deviceId, orgId))
                .catch((err) => logger.error('Failed to mark device offline', { deviceId, err }));

            // Auto-log offline event as device comment for audit/test tracking
            import('../../modules/devices/devices.service')
                .then(({ autoLogDeviceEvent }) => {
                    const msg = offlineType === 'GRACEFUL'
                        ? `📴 Offline (chủ động): ${gracefulReason}`
                        : `⚡ Offline (bất ngờ): mất điện hoặc crash`;
                    return autoLogDeviceEvent(deviceId, orgId, msg);
                })
                .catch(() => {});

            io!.of('/admin').to(orgRoom(orgId)).emit('device.status', {
                deviceId,
                status: 'OFFLINE',
                offlineType,
                reason,
                timestamp: new Date().toISOString(),
            });
        });
    });

    // ── Namespace: /admin (Dashboard) ─────────────────────────────────────────
    const adminNS = io.of('/admin');

    adminNS.use((socket, next) => {
        const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1];
        if (!token) return next(new Error('User token required'));
        try {
            const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
            if (payload.type !== 'user') return next(new Error('Invalid token type'));
            (socket as SocketWithUser).user = payload;
            next();
        } catch {
            next(new Error('Invalid or expired token'));
        }
    });

    adminNS.on('connection', (rawSocket) => {
        const socket = rawSocket as unknown as SocketWithUser;
        const orgId = socket.user.organizationId;
        const role = socket.user.role;
        const managingOrgId = (socket.handshake.auth as Record<string, unknown>)?.managingOrgId as string | undefined;

        // Admin/manager joins own org room to receive device updates
        socket.join(orgRoom(orgId));

        // SUPER_ADMIN managing another org — also join that org's room so
        // device events (screenshot, status) from the managed org are received.
        if (managingOrgId && managingOrgId !== orgId) {
            socket.join(orgRoom(managingOrgId));
            logger.info('Admin joined managed org room', { userId: socket.user.userId, managingOrgId });
        }

        logger.info('Admin connected via WebSocket', { userId: socket.user.userId, role, managingOrgId: managingOrgId ?? null });

        socket.on('disconnect', () => {
            logger.debug('Admin disconnected', { userId: socket.user.userId });
        });
    });

    // ── Stale heartbeat checker ───────────────────────────────────────────────
    // Devices that go to standby (TV sleep) keep socket connected but stop
    // sending heartbeats. Check every 60s and mark OFFLINE any device whose
    // lastSeen is older than 90s (= 3 missed heartbeats).
    setInterval(async () => {
        try {
            const { query } = await import('../database/db');
            const stale = await query<{ id: string; organizationId: string; name: string }>(
                `SELECT id, "organizationId", name FROM devices
                 WHERE status = 'ONLINE'
                   AND "lastSeen" < NOW() - INTERVAL '90 seconds'`,
                []
            );
            for (const device of stale) {
                logger.info('Stale heartbeat — marking OFFLINE', { deviceId: device.id });
                await query(
                    `UPDATE devices SET status = 'OFFLINE', "lastOfflineAt" = NOW(), "updatedAt" = NOW()
                     WHERE id = $1`,
                    [device.id]
                );
                io!.of('/admin').to(orgRoom(device.organizationId)).emit('device.status', {
                    deviceId: device.id,
                    status: 'OFFLINE',
                    offlineType: 'STALE_HEARTBEAT',
                    reason: 'No heartbeat for 90s — device may be in standby',
                    timestamp: new Date().toISOString(),
                });
            }
        } catch (err) {
            logger.error('Stale heartbeat check failed', { err });
        }
    }, 60_000);

    logger.info('Socket.IO initialized — namespaces: /device, /admin');
    return io;
}

// ─── Push helpers (call from REST handlers or BullMQ workers) ─────────────────

/**
 * Push a command to a specific device.
 * The device receives this and executes it immediately.
 */
export function pushCommandToDevice(
    deviceId: string,
    command: DeviceCommand,
    payload?: Record<string, unknown>
): boolean {
    if (!io) return false;
    const room = deviceRoom(deviceId);
    const roomSockets = io.of('/device').adapter.rooms.get(room);
    const connected = !!roomSockets && roomSockets.size > 0;

    io.of('/device').to(room).emit(command, payload ?? {});
    logger.info('Command pushed to device', { deviceId, command, connected });
    return connected;
}

/**
 * Broadcast a content/schedule update to all devices in an org.
 * Called after admin creates/updates a schedule or playlist.
 */
export function broadcastContentUpdate(orgId: string, eventType: 'content.update' | 'schedule.update', data?: Record<string, unknown>): void {
    if (!io) return;
    // Notify all admin dashboard clients
    io.of('/admin').to(orgRoom(orgId)).emit(eventType, { ...data, timestamp: new Date().toISOString() });
    // Notify all devices in this org — they will call GET /api/device/sync
    // We can't directly target by org easily without tracking, so we broadcast to all device rooms
    // Alternative: devices subscribe to an org room too
    io.of('/device').to(orgRoom(orgId)).emit(eventType, { ...data, timestamp: new Date().toISOString() });
}

/**
 * Broadcast sync group state change to all devices + admin clients in an org.
 * Called when admin starts / restarts / stops a sync group.
 * Devices in the group will immediately recalculate their playback position.
 */
export function broadcastSyncState(
    orgId: string,
    payload: {
        storeId: string;   // DB column name kept for wire compatibility
        startEpoch: number | null;
        totalDurationMs: number | null;
        playlistId: string | null;
    },
): void {
    if (!io) return;
    const event = 'sync.state';
    const data = { ...payload, siteId: payload.storeId, timestamp: new Date().toISOString() };
    io.of('/device').to(orgRoom(orgId)).emit(event, data);
    io.of('/admin').to(orgRoom(orgId)).emit(event, data);
    logger.info('Sync state broadcast', { orgId, siteId: payload.storeId, startEpoch: payload.startEpoch });
}

/**
 * Check if a device is currently connected via WebSocket.
 */
export function isDeviceOnline(deviceId: string): boolean {
    if (!io) return false;
    const room = deviceRoom(deviceId);
    const roomSockets = io.of('/device').adapter.rooms.get(room);
    return !!roomSockets && roomSockets.size > 0;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeviceCommand =
    | 'command.restart'
    | 'command.screenshot'
    | 'command.reload_content'
    | 'command.clear_cache'
    | 'content.update'
    | 'schedule.update';

export interface DeviceStatusPayload {
    status: 'ONLINE' | 'OFFLINE' | 'ERROR';
    cpuUsage?: number;
    memoryUsage?: number;
    appVersion?: string;
    message?: string;
}

export interface DeviceErrorPayload {
    code: string;
    message: string;
    details?: unknown;
}

export interface NowPlayingPayload {
    mediaId: string;
    mediaTitle: string;
    startedAt: string;
}

interface SocketWithUser extends Socket {
    user: JwtPayload;
}
