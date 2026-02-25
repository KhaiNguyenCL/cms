import { Server as SocketIOServer, Socket } from 'socket.io';
import http from 'http';
import jwt from 'jsonwebtoken';
import config from '../../config';
import logger from '../utils/logger';
import type { JwtPayload } from '../middleware/auth.middleware';

// ─── Singleton ────────────────────────────────────────────────────────────────

let io: SocketIOServer | null = null;

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
            origin: '*',   // tighten in production
            methods: ['GET', 'POST'],
        },
        // Separate namespaces for devices vs admin dashboard
        // Default namespace '/' is used by admin dashboard
        // Namespace '/device' is used by Android TV
    });

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

        // Device joins its own private room
        socket.join(deviceRoom(deviceId));
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

        // ── Disconnect ────────────────────────────────────────────────────────

        socket.on('disconnect', (reason) => {
            logger.info('Device disconnected', { deviceId, reason });
            io!.of('/admin').to(orgRoom(orgId)).emit('device.status', {
                deviceId,
                status: 'OFFLINE',
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

        // Admin/manager joins org-wide room to receive device updates
        socket.join(orgRoom(orgId));
        logger.info('Admin connected via WebSocket', { userId: socket.user.userId, role });

        socket.on('disconnect', () => {
            logger.debug('Admin disconnected', { userId: socket.user.userId });
        });
    });

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
