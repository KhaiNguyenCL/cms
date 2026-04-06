import { query, queryOne } from '../../shared/database/db';
import logger from '../../shared/utils/logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionType    = 'CREATE' | 'UPDATE' | 'DELETE';
export type ResourceType  = 'DEVICE' | 'MEDIA' | 'PLAYLIST' | 'SCHEDULE' | 'USER' | 'STORE' | 'VERSION';

export interface ActionLog {
    id: string;
    organizationId: string;
    userId: string | null;
    userEmail: string | null;
    action: ActionType;
    resourceType: ResourceType;
    resourceId: string | null;
    resourceName: string | null;
    detail: Record<string, unknown> | null;
    occurredAt: string;
}

export interface ListActionLogsQuery {
    userId?: string;
    action?: ActionType;
    resourceType?: ResourceType;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
    offset?: number;
}

export interface ListActionLogsResult {
    data: ActionLog[];
    total: number;
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget: log a user action.
 * Resolves the actor's email from users table for display.
 * Never throws — errors are swallowed to avoid blocking the response.
 */
export async function logAction(
    organizationId: string,
    userId: string,
    action: ActionType,
    resourceType: ResourceType,
    resourceId: string | null,
    resourceName: string | null,
    detail?: Record<string, unknown>,
): Promise<void> {
    try {
        // Resolve display name — best effort, null if user deleted
        const userRow = await queryOne<{ email: string }>(
            `SELECT email FROM users WHERE id = $1`, [userId]
        );
        await query(
            `INSERT INTO action_logs
               (id, "organizationId", "userId", "userEmail", action, "resourceType",
                "resourceId", "resourceName", detail, "occurredAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
            [
                organizationId,
                userId,
                userRow?.email ?? null,
                action,
                resourceType,
                resourceId ?? null,
                resourceName ?? null,
                detail ? JSON.stringify(detail) : null,
            ]
        );
        // Notify admin dashboard clients so ActionHistoryPage can refetch
        import('../../shared/socket/socket.server')
            .then(({ emitToAdmins }) => emitToAdmins(organizationId, 'action.logged', {
                action, resourceType, resourceName, userEmail: userRow?.email ?? null,
            })).catch(() => {});
    } catch (err) {
        logger.warn('Failed to log action', { organizationId, userId, action, resourceType, err });
    }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listActionLogs(
    organizationId: string,
    q: ListActionLogsQuery,
): Promise<ListActionLogsResult> {
    const limit  = Math.min(q.limit  ?? 50, 200);
    const offset = q.offset ?? 0;

    const conditions: string[] = [`al."organizationId" = $1`];
    const values: unknown[] = [organizationId];
    let idx = 2;

    if (q.userId) {
        conditions.push(`al."userId" = $${idx++}`);
        values.push(q.userId);
    }
    if (q.action) {
        conditions.push(`al.action = $${idx++}`);
        values.push(q.action);
    }
    if (q.resourceType) {
        conditions.push(`al."resourceType" = $${idx++}`);
        values.push(q.resourceType);
    }
    if (q.dateFrom) {
        conditions.push(`al."occurredAt" >= $${idx++}`);
        values.push(q.dateFrom);
    }
    if (q.dateTo) {
        conditions.push(`al."occurredAt" <= $${idx++}`);
        values.push(q.dateTo);
    }
    if (q.search) {
        const p1 = idx++; const p2 = idx++;
        conditions.push(`(al."resourceName" ILIKE $${p1} OR al."userEmail" ILIKE $${p2})`);
        values.push(`%${q.search}%`, `%${q.search}%`);
    }

    const where = conditions.join(' AND ');

    const [countRow, rows] = await Promise.all([
        queryOne<{ count: string }>(
            `SELECT COUNT(*) AS count FROM action_logs al WHERE ${where}`,
            values,
        ),
        query<ActionLog>(
            `SELECT al.id, al."organizationId", al."userId", al."userEmail",
                    al.action, al."resourceType", al."resourceId", al."resourceName",
                    al.detail, al."occurredAt"
             FROM action_logs al
             WHERE ${where}
             ORDER BY al."occurredAt" DESC
             LIMIT $${idx++} OFFSET $${idx++}`,
            [...values, limit, offset],
        ),
    ]);

    return { data: rows, total: parseInt(countRow?.count ?? '0') };
}

/** Distinct users who have performed actions in this org — for filter dropdown. */
export async function getActionActors(
    organizationId: string,
): Promise<{ userId: string; userEmail: string }[]> {
    return query<{ userId: string; userEmail: string }>(
        `SELECT DISTINCT "userId", "userEmail"
         FROM action_logs
         WHERE "organizationId" = $1 AND "userId" IS NOT NULL AND "userEmail" IS NOT NULL
         ORDER BY "userEmail"`,
        [organizationId]
    );
}
