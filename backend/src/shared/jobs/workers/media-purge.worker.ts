/**
 * Worker: media-purge
 * Hard-deletes media and devices that have been in trash longer than retentionDays.
 * Scheduled to run nightly at 02:00 (see scheduler.ts).
 *
 * For media: deletes physical files (filePath + thumbnailPath) then DB row.
 * For devices: deletes DB row (JWT is already revoked by permanentDeleteDevice if done manually,
 *   but for auto-purge after retention period we also blacklist here).
 */
import fs from 'fs';
import { Worker, Job } from 'bullmq';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES, type MediaPurgeJobData } from '../queues';
import { query } from '../../database/db';
import logger from '../../utils/logger';
import config from '../../../config';

const DEFAULT_RETENTION_DAYS = parseInt(process.env.TRASH_RETENTION_DAYS ?? '30', 10);

export const mediaPurgeWorker = new Worker<MediaPurgeJobData>(
    QUEUE_NAMES.MEDIA_PURGE,
    async (job: Job<MediaPurgeJobData>) => {
        const retentionDays = job.data.retentionDays ?? DEFAULT_RETENTION_DAYS;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - retentionDays);

        logger.info('Media purge started', { retentionDays, cutoff: cutoff.toISOString(), jobId: job.id });

        // ── 1. Hard delete media files + rows ─────────────────────────────────
        const expiredMedia = await query<{ id: string; filePath: string; thumbnailPath: string | null }>(
            `SELECT id, "filePath", "thumbnailPath" FROM media
             WHERE "deletedAt" IS NOT NULL AND "deletedAt" < $1`,
            [cutoff]
        );

        let mediaDeleted = 0;
        for (const m of expiredMedia) {
            try {
                if (fs.existsSync(m.filePath)) fs.unlinkSync(m.filePath);
                if (m.thumbnailPath && fs.existsSync(m.thumbnailPath)) fs.unlinkSync(m.thumbnailPath);
            } catch (e) {
                logger.warn('Could not delete media file during purge', { mediaId: m.id, error: (e as Error).message });
            }
            await query(`DELETE FROM media WHERE id = $1`, [m.id]);
            mediaDeleted++;
        }

        // ── 2. Hard delete expired device rows ────────────────────────────────
        const expiredDevices = await query<{ id: string }>(
            `DELETE FROM devices WHERE "deletedAt" IS NOT NULL AND "deletedAt" < $1 RETURNING id`,
            [cutoff]
        );

        // Blacklist JWTs for auto-purged devices (7 days — enough for rotation)
        if (expiredDevices.length > 0) {
            const redis = (await import('../../cache/redis')).default;
            const { RedisKeys } = await import('../../cache/redis');
            for (const d of expiredDevices) {
                await redis.setex(RedisKeys.deviceBlacklist(d.id), 60 * 60 * 24 * 7, '1').catch(() => {});
            }
        }

        const devicesPurged = expiredDevices.length;
        logger.info('Media purge completed', { mediaDeleted, devicesPurged, retentionDays });
        return { mediaDeleted, devicesPurged };
    },
    {
        connection: bullmqConnection,
        concurrency: 1,
    }
);

mediaPurgeWorker.on('completed', (job, result) => {
    logger.info('Media purge job done', { jobId: job.id, ...result });
});

mediaPurgeWorker.on('failed', (job, err) => {
    logger.error('Media purge job failed', { jobId: job?.id, error: err.message });
});
