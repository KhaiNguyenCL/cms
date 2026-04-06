/**
 * Worker: license-expiry-check
 * Daily job (00:01 UTC+7) — marks devices as isLicensed=false when licenseExpiresAt < NOW().
 */
import { Worker, Job } from 'bullmq';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES } from '../queues';
import logger from '../../utils/logger';

export interface LicenseDeductionJobData {
    triggeredBy?: string;
}

export const licenseDeductionWorker = new Worker<LicenseDeductionJobData>(
    QUEUE_NAMES.LICENSE_DEDUCTION,
    async (job: Job<LicenseDeductionJobData>) => {
        logger.info('License expiry check started', { jobId: job.id, triggeredBy: job.data.triggeredBy });

        const { runExpiryCheck } = await import('../../../modules/license/license.service');
        const result = await runExpiryCheck();

        logger.info('License expiry check completed', result);
        return result;
    },
    { connection: bullmqConnection, concurrency: 1 },
);

licenseDeductionWorker.on('completed', (job, result) => {
    logger.info('License expiry check done', { jobId: job.id, expired: result?.expired });
});

licenseDeductionWorker.on('failed', (job, err) => {
    logger.error('License expiry check failed', { jobId: job?.id, error: err.message });
});
