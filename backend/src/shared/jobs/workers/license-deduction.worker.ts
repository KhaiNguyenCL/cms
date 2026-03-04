/**
 * Worker: license-deduction
 * Daily job (00:01 UTC) that deducts 1 point per licensed device from each org.
 * Updates licenseStatus based on remaining points.
 */
import { Worker, Job } from 'bullmq';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES } from '../queues';
import { query, queryOne } from '../../database/db';
import logger from '../../utils/logger';

export interface LicenseDeductionJobData {
    triggeredBy?: string; // 'scheduler' | 'manual'
}

export const licenseDeductionWorker = new Worker<LicenseDeductionJobData>(
    QUEUE_NAMES.LICENSE_DEDUCTION,
    async (job: Job<LicenseDeductionJobData>) => {
        logger.info('License deduction started', { jobId: job.id, triggeredBy: job.data.triggeredBy });

        // Get all active orgs that are not yet EXPIRED
        const orgs = await query<{
            id: string;
            pointsTotal: number;
            pointsUsed: number;
            licenseStatus: string;
            suspendedAt: string | null;
        }>(
            `SELECT id, "pointsTotal", "pointsUsed", "licenseStatus", "suspendedAt"
             FROM organizations
             WHERE "isActive" = true AND "licenseStatus" != 'EXPIRED'`
        );

        let totalOrgsProcessed = 0;
        let totalPointsDeducted = 0;

        for (const org of orgs) {
            // Count licensed devices
            const countRes = await queryOne<{ count: string }>(
                `SELECT COUNT(*) AS count FROM devices WHERE "organizationId" = $1 AND "isLicensed" = true`,
                [org.id]
            );
            const n = parseInt(countRes?.count ?? '0');

            if (n === 0) continue; // No licensed devices — skip deduction

            const newPointsUsed = org.pointsUsed + n;
            const remaining = org.pointsTotal - newPointsUsed;
            const daysLeft = remaining > 0 ? remaining / n : 0;

            // Determine new licenseStatus
            let newStatus: string;
            let newSuspendedAt: string | null = org.suspendedAt;

            if (remaining > 0 && daysLeft > 7) {
                newStatus = 'ACTIVE';
                newSuspendedAt = null;
            } else if (remaining > 0 && daysLeft <= 7) {
                newStatus = 'WARNING';
                newSuspendedAt = null;
            } else {
                // remaining <= 0
                if (!org.suspendedAt) {
                    newStatus = 'SUSPENDED';
                    newSuspendedAt = new Date().toISOString();
                } else {
                    const suspendedMs = Date.now() - new Date(org.suspendedAt).getTime();
                    const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
                    newStatus = suspendedMs > threeDaysMs ? 'EXPIRED' : 'SUSPENDED';
                }
            }

            // Update org pointsUsed + licenseStatus
            await query(
                `UPDATE organizations
                 SET "pointsUsed" = $1,
                     "licenseStatus" = $2,
                     "suspendedAt" = $3,
                     "updatedAt" = NOW()
                 WHERE id = $4`,
                [newPointsUsed, newStatus, newSuspendedAt, org.id]
            );

            // Insert deduction transaction
            await query(
                `INSERT INTO license_transactions (id, "organizationId", type, points, "deviceCount", description, "createdAt")
                 VALUES (gen_random_uuid()::text, $1, 'DAILY_DEDUCTION', $2, $3, $4, NOW())`,
                [org.id, -n, n, `Khấu trừ hàng ngày: ${n} thiết bị`]
            );

            totalOrgsProcessed++;
            totalPointsDeducted += n;

            logger.debug('Org license deducted', {
                orgId: org.id,
                devicesCharged: n,
                pointsUsed: newPointsUsed,
                remaining,
                newStatus,
            });
        }

        logger.info('License deduction completed', { totalOrgsProcessed, totalPointsDeducted });
        return { totalOrgsProcessed, totalPointsDeducted };
    },
    {
        connection: bullmqConnection,
        concurrency: 1, // one deduction job at a time
    }
);

licenseDeductionWorker.on('completed', (job, result) => {
    logger.info('License deduction job done', {
        jobId: job.id,
        orgsProcessed: result?.totalOrgsProcessed,
        pointsDeducted: result?.totalPointsDeducted,
    });
});

licenseDeductionWorker.on('failed', (job, err) => {
    logger.error('License deduction job failed', { jobId: job?.id, error: err.message });
});
