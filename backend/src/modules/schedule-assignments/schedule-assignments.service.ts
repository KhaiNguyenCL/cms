import { query, queryOne, withTransaction } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import { invalidateContentHashForOrg } from '../device-sync/device-sync.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ScheduleAssignment {
    id: string;
    organizationId: string;
    scheduleId: string;
    scheduleName: string;
    scheduleStartTime: string | null;
    scheduleEndTime: string | null;
    scheduleDaysOfWeek: number[];
    scheduleStartDate: string | null;
    scheduleEndDate: string | null;
    scheduleIsActive: boolean;
    targetType: 'DEVICE' | 'SITE';
    targetId: string;
    targetName: string | null;
    assignedById: string | null;
    assignedAt: string;
    sortOrder: number;
}

interface AssignTarget {
    targetType: 'DEVICE' | 'SITE';
    targetId: string;
}

// ─── List assignments ─────────────────────────────────────────────────────────

export async function listAssignments(
    organizationId: string,
    targetType?: string,
    targetId?: string,
    scheduleId?: string,
    siteId?: string,   // when set: returns DEVICE assignments for all devices in this site
): Promise<ScheduleAssignment[]> {
    const params: unknown[] = [organizationId];
    let whereClause: string;

    if (siteId) {
        // All device-level assignments for devices belonging to siteId
        params.push(siteId);
        whereClause = `sa."organizationId" = $1
          AND sa."targetType" = 'DEVICE'
          AND sa."targetId" IN (
              SELECT id FROM devices WHERE "storeId" = $2 AND "organizationId" = $1
          )`;
    } else {
        const conditions: string[] = [`sa."organizationId" = $1`];
        let idx = 2;
        if (targetType) { conditions.push(`sa."targetType" = $${idx++}`); params.push(targetType); }
        if (targetId)   { conditions.push(`sa."targetId"   = $${idx++}`); params.push(targetId); }
        if (scheduleId) { conditions.push(`sa."scheduleId" = $${idx++}`); params.push(scheduleId); }
        whereClause = conditions.join(' AND ');
    }

    const rows = await query<ScheduleAssignment>(
        `SELECT sa.id, sa."organizationId", sa."scheduleId", s.name AS "scheduleName",
                s."startTime" AS "scheduleStartTime", s."endTime" AS "scheduleEndTime",
                s."daysOfWeek" AS "scheduleDaysOfWeek",
                s."startDate" AS "scheduleStartDate", s."endDate" AS "scheduleEndDate",
                s."isActive" AS "scheduleIsActive",
                sa."targetType", sa."targetId",
                COALESCE(d.name, st.name) AS "targetName",
                sa."assignedById", sa."assignedAt", sa."sortOrder"
         FROM schedule_assignments sa
         JOIN schedules s ON s.id = sa."scheduleId"
         LEFT JOIN devices d  ON d.id  = sa."targetId" AND sa."targetType" = 'DEVICE'
         LEFT JOIN stores  st ON st.id = sa."targetId" AND sa."targetType" = 'SITE'
         WHERE ${whereClause}
         ORDER BY sa."sortOrder" ASC, sa."assignedAt" ASC`,
        params,
    );
    return rows;
}

// ─── Bulk assign ──────────────────────────────────────────────────────────────

export async function bulkAssign(
    organizationId: string,
    scheduleId: string,
    targets: AssignTarget[],
    assignedById: string | null,
): Promise<{ created: number; skipped: number }> {
    const sched = await queryOne<{ id: string }>(
        `SELECT id FROM schedules WHERE id = $1 AND "organizationId" = $2`,
        [scheduleId, organizationId],
    );
    if (!sched) throw new AppError(404, 'Schedule không tồn tại');

    let created = 0;
    let skipped = 0;

    for (const { targetType, targetId } of targets) {
        // Shift existing sortOrders for this target up by 1
        await query(
            `UPDATE schedule_assignments
             SET "sortOrder" = "sortOrder" + 1
             WHERE "organizationId" = $1 AND "targetType" = $2 AND "targetId" = $3`,
            [organizationId, targetType, targetId],
        );

        const result = await query<{ id: string }>(
            `INSERT INTO schedule_assignments
                (id, "organizationId", "scheduleId", "targetType", "targetId", "assignedById", "assignedAt", "sortOrder")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, NOW(), 0)
             ON CONFLICT ("scheduleId", "targetType", "targetId") DO NOTHING
             RETURNING id`,
            [organizationId, scheduleId, targetType, targetId, assignedById],
        );
        if (result.length > 0) {
            created++;
        } else {
            // Revert the shift if skipped
            await query(
                `UPDATE schedule_assignments
                 SET "sortOrder" = "sortOrder" - 1
                 WHERE "organizationId" = $1 AND "targetType" = $2 AND "targetId" = $3`,
                [organizationId, targetType, targetId],
            );
            skipped++;
        }
    }

    if (created > 0) await invalidateContentHashForOrg(organizationId, 'CONTENT');
    return { created, skipped };
}

// ─── Unassign one ─────────────────────────────────────────────────────────────

export async function unassignOne(
    organizationId: string,
    id: string,
): Promise<void> {
    const row = await queryOne<{ id: string }>(
        `DELETE FROM schedule_assignments WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId],
    );
    if (!row) throw new AppError(404, 'Assignment không tồn tại');
    await invalidateContentHashForOrg(organizationId, 'CONTENT');
}

// ─── Bulk unassign ────────────────────────────────────────────────────────────

export async function bulkUnassign(
    organizationId: string,
    ids: string[],
): Promise<{ deleted: number }> {
    const result = await query<{ id: string }>(
        `DELETE FROM schedule_assignments
         WHERE id = ANY($1::text[]) AND "organizationId" = $2
         RETURNING id`,
        [ids, organizationId],
    );
    if (result.length > 0) await invalidateContentHashForOrg(organizationId, 'CONTENT');
    return { deleted: result.length };
}

// ─── Reorder assignments for a target ─────────────────────────────────────────

export async function reorderAssignments(
    organizationId: string,
    targetType: 'DEVICE' | 'SITE',
    targetId: string,
    orderedIds: string[],
): Promise<void> {
    await withTransaction(async (client) => {
        for (let i = 0; i < orderedIds.length; i++) {
            await client.query(
                `UPDATE schedule_assignments
                 SET "sortOrder" = $1
                 WHERE id = $2 AND "organizationId" = $3 AND "targetType" = $4 AND "targetId" = $5`,
                [i, orderedIds[i], organizationId, targetType, targetId],
            );
        }
    });
    await invalidateContentHashForOrg(organizationId, 'META');
}
