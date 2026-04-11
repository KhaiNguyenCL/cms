import { query, queryOne } from '../../shared/database/db';
import { emitToAdmins } from '../../shared/socket/socket.server';
import logger from '../../shared/utils/logger';

// ─── Notification types ───────────────────────────────────────────────────────

export const NOTIF_TYPES = {
    // Device
    DEVICE_OFFLINE:             'DEVICE_OFFLINE',
    DEVICE_ERROR:               'DEVICE_ERROR',
    // License
    LICENSE_ASSIGNED:           'LICENSE_ASSIGNED',
    LICENSE_EXPIRING:           'LICENSE_EXPIRING',
    LICENSE_EXPIRED:            'LICENSE_EXPIRED',
    LICENSE_REQUEST_APPROVED:   'LICENSE_REQUEST_APPROVED',
    LICENSE_REQUEST_REJECTED:   'LICENSE_REQUEST_REJECTED',
    // Storage
    STORAGE_NEARLY_FULL:        'STORAGE_NEARLY_FULL',
    STORAGE_FULL:               'STORAGE_FULL',
    STORAGE_REQUEST_NEW:        'STORAGE_REQUEST_NEW',
    STORAGE_REQUEST_APPROVED:   'STORAGE_REQUEST_APPROVED',
    STORAGE_REQUEST_REJECTED:   'STORAGE_REQUEST_REJECTED',
    // Media
    MEDIA_READY:                'MEDIA_READY',
    MEDIA_ERROR:                'MEDIA_ERROR',
    // License requests (for super admin)
    LICENSE_REQUEST_NEW:        'LICENSE_REQUEST_NEW',
    // Users
    USER_CREATED:               'USER_CREATED',
} as const;

export type NotifType = typeof NOTIF_TYPES[keyof typeof NOTIF_TYPES];

export interface NotificationRow {
    id: string;
    organizationId: string;
    type: NotifType;
    title: string;
    body: string | null;
    entityId: string | null;
    entityType: string | null;
    read: boolean;
    createdAt: string;
}

// ─── Super admin org IDs ──────────────────────────────────────────────────────

export async function getSuperAdminOrgIds(): Promise<string[]> {
    const rows = await query<{ organizationId: string }>(
        `SELECT DISTINCT "organizationId" FROM users WHERE role = 'SUPER_ADMIN'`
    );
    return rows.map(r => r.organizationId);
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createNotification(
    organizationId: string,
    type: NotifType,
    title: string,
    body?: string,
    entityId?: string,
    entityType?: string,
): Promise<void> {
    try {
        const row = await queryOne<NotificationRow>(
            `INSERT INTO notifications (id, "organizationId", type, title, body, "entityId", "entityType", read, "createdAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, false, NOW())
             RETURNING *`,
            [organizationId, type, title, body ?? null, entityId ?? null, entityType ?? null],
        );
        if (row) {
            emitToAdmins(organizationId, 'notification:new', {
                id: row.id, type: row.type, title: row.title,
                body: row.body, entityId: row.entityId, entityType: row.entityType,
                createdAt: row.createdAt,
            });
        }
    } catch (err) {
        // Never let notification failure break the main flow
        logger.warn('Failed to create notification', { organizationId, type, error: (err as Error).message });
    }
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listNotifications(
    organizationId: string,
    limit = 50,
    onlyUnread = false,
): Promise<NotificationRow[]> {
    const where = onlyUnread
        ? `WHERE "organizationId" = $1 AND read = false`
        : `WHERE "organizationId" = $1`;
    return query<NotificationRow>(
        `SELECT * FROM notifications ${where} ORDER BY "createdAt" DESC LIMIT $2`,
        [organizationId, limit],
    );
}

export async function countUnread(organizationId: string): Promise<number> {
    const row = await queryOne<{ count: string }>(
        `SELECT COUNT(*) AS count FROM notifications WHERE "organizationId" = $1 AND read = false`,
        [organizationId],
    );
    return parseInt(row?.count ?? '0');
}

// ─── Mark read ────────────────────────────────────────────────────────────────

export async function markRead(id: string, organizationId: string): Promise<void> {
    await query(
        `UPDATE notifications SET read = true WHERE id = $1 AND "organizationId" = $2`,
        [id, organizationId],
    );
}

export async function markAllRead(organizationId: string): Promise<void> {
    await query(
        `UPDATE notifications SET read = true WHERE "organizationId" = $1 AND read = false`,
        [organizationId],
    );
}

export async function deleteNotification(id: string, organizationId: string): Promise<void> {
    await query(
        `DELETE FROM notifications WHERE id = $1 AND "organizationId" = $2`,
        [id, organizationId],
    );
}
