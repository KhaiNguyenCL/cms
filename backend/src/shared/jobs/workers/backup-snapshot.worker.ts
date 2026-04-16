/**
 * Worker: backup-snapshot
 * Runs daily at 02:30 UTC — creates AUTO snapshots for orgs that have a backupPlan,
 * then trims each org's AUTO backups to the plan's retention (3, 7, or 10 days).
 */
import { Worker, Job } from 'bullmq';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES, type BackupSnapshotJobData } from '../queues';
import { query } from '../../database/db';
import { createBackup, cleanupAutoBackups } from '../../../modules/backup/backup.service';
import logger from '../../utils/logger';

export const backupSnapshotWorker = new Worker<BackupSnapshotJobData>(
    QUEUE_NAMES.BACKUP_SNAPSHOT,
    async (job: Job<BackupSnapshotJobData>) => {
        const { organizationId } = job.data;

        // Fetch orgs: if specific orgId, just that one; otherwise all with a backupPlan
        const orgs: Array<{ id: string; backupPlan: number }> = organizationId === '__ALL__'
            ? await query<{ id: string; backupPlan: number }>(
                `SELECT id, "backupPlan" FROM organizations
                 WHERE "isActive" = true AND "backupPlan" IS NOT NULL`
              )
            : await query<{ id: string; backupPlan: number }>(
                `SELECT id, "backupPlan" FROM organizations
                 WHERE id = $1 AND "backupPlan" IS NOT NULL`,
                [organizationId]
              );

        let created = 0;
        let failed  = 0;

        for (const org of orgs) {
            try {
                await createBackup(org.id, null, undefined, 'AUTO');
                // Use the org's plan days as retention count
                await cleanupAutoBackups(org.id, org.backupPlan);
                created++;
            } catch (err) {
                logger.error('Auto backup failed for org', { orgId: org.id, error: (err as Error).message });
                failed++;
            }
        }

        logger.info('Backup snapshot job done', { created, failed, total: orgs.length });
        return { created, failed };
    },
    {
        connection: bullmqConnection,
        concurrency: 2,
    }
);

backupSnapshotWorker.on('completed', (job, result) => {
    logger.info('backup-snapshot job completed', { jobId: job.id, ...result });
});

backupSnapshotWorker.on('failed', (job, err) => {
    logger.error('backup-snapshot job failed', { jobId: job?.id, error: err.message });
});
