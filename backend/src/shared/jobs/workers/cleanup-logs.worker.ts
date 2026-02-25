/**
 * Worker: cleanup-logs
 * Deletes old playback_logs and device_health records older than N days.
 * Scheduled to run daily at 3:00 AM (see scheduler.ts).
 *
 * Job data: CleanupLogsJobData
 */
import { Worker, Job } from 'bullmq';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES, CleanupLogsJobData } from '../queues';
import { query, queryOne } from '../../database/db';
import logger from '../../utils/logger';

export const cleanupLogsWorker = new Worker<CleanupLogsJobData>(
    QUEUE_NAMES.CLEANUP_LOGS,
    async (job: Job<CleanupLogsJobData>) => {
        const { olderThanDays, organizationId } = job.data;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - olderThanDays);

        logger.info('Cleanup logs started', { olderThanDays, cutoff: cutoff.toISOString(), jobId: job.id });

        // ── Delete old playback_logs ───────────────────────────────────────────
        let playbackResult: { count: string } | null;

        if (organizationId) {
            // Scoped to one org (join with devices)
            playbackResult = await queryOne<{ count: string }>(
                `WITH deleted AS (
                    DELETE FROM playback_logs pl
                    USING devices d
                    WHERE pl."deviceId" = d.id
                      AND d."organizationId" = $1
                      AND pl."playedAt" < $2
                    RETURNING pl.id
                )
                SELECT COUNT(*)::text as count FROM deleted`,
                [organizationId, cutoff]
            );
        } else {
            // Global cleanup
            playbackResult = await queryOne<{ count: string }>(
                `WITH deleted AS (
                    DELETE FROM playback_logs WHERE "playedAt" < $1 RETURNING id
                )
                SELECT COUNT(*)::text as count FROM deleted`,
                [cutoff]
            );
        }

        // ── Delete old device_health records (keep latest 10 per device) ──────
        const healthResult = await queryOne<{ count: string }>(
            `WITH ranked AS (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY "deviceId" ORDER BY "reportedAt" DESC) as rn
                FROM device_health
                WHERE "reportedAt" < $1
            ),
            deleted AS (
                DELETE FROM device_health WHERE id IN (
                    SELECT id FROM ranked WHERE rn > 10
                ) RETURNING id
            )
            SELECT COUNT(*)::text as count FROM deleted`,
            [cutoff]
        );

        const playbackDeleted = parseInt(playbackResult?.count ?? '0');
        const healthDeleted = parseInt(healthResult?.count ?? '0');

        logger.info('Cleanup logs completed', { playbackDeleted, healthDeleted, olderThanDays });
        return { playbackDeleted, healthDeleted, cutoff: cutoff.toISOString() };
    },
    {
        connection: bullmqConnection,
        concurrency: 1,   // one cleanup at a time to avoid DB deadlocks
    }
);

cleanupLogsWorker.on('completed', (job, result) => {
    logger.info('Cleanup job done', {
        jobId: job.id,
        playbackDeleted: result?.playbackDeleted,
        healthDeleted: result?.healthDeleted,
    });
});

cleanupLogsWorker.on('failed', (job, err) => {
    logger.error('Cleanup job failed', { jobId: job?.id, error: err.message });
});
