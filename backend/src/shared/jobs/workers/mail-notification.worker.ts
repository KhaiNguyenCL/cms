import { Worker } from 'bullmq';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES, enqueueMailNotification, type MailNotificationJobData } from '../queues';
import { sendEventMail } from '../../mail/mail.sender';
import { query, queryOne } from '../../database/db';
import logger from '../../utils/logger';

/** Check all orgs for licenses expiring within advanceDays and enqueue mail jobs. */
async function checkLicenseExpiry(): Promise<void> {
    // Read advanceDays from mail_settings
    const setting = await queryOne<{ advanceDays: number; isEnabled: boolean }>(
        `SELECT "advanceDays", "isEnabled" FROM mail_settings WHERE "eventType" = 'LICENSE_EXPIRY'`
    );
    if (!setting?.isEnabled) return;

    const advanceDays = setting.advanceDays ?? 30;

    const rows = await query<{
        orgId: string;
        orgName: string;
        deviceCount: string;
        expiresAt: string;
    }>(
        `SELECT d."organizationId" AS "orgId", o.name AS "orgName",
                COUNT(dl.id)::text AS "deviceCount",
                MIN(dl."expiresAt")::text AS "expiresAt"
         FROM device_licenses dl
         JOIN devices d ON d.id = dl."deviceId"
         JOIN organizations o ON o.id = d."organizationId"
         WHERE dl."expiresAt" BETWEEN NOW() AND NOW() + ($1 || ' days')::INTERVAL
           AND dl."isActive" = true
         GROUP BY d."organizationId", o.name`,
        [advanceDays]
    );

    for (const row of rows) {
        const expiresAt = new Date(row.expiresAt).toLocaleDateString('vi-VN', {
            day: '2-digit', month: '2-digit', year: 'numeric',
        });
        await enqueueMailNotification({
            eventType: 'LICENSE_EXPIRY',
            orgId: row.orgId,
            vars: {
                orgName: row.orgName,
                deviceCount: row.deviceCount,
                expiresAt,
                recipientName: '',
            },
        });
    }

    logger.info('license-expiry-check: enqueued', { count: rows.length, advanceDays });
}

const worker = new Worker<MailNotificationJobData>(
    QUEUE_NAMES.MAIL_NOTIFICATION,
    async (job) => {
        const { eventType, orgId, vars, deviceId } = job.data;

        if (eventType === '__LICENSE_EXPIRY_CHECK__') {
            await checkLicenseExpiry();
            return;
        }

        logger.info('mail-notification: processing', { eventType, orgId, deviceId });
        await sendEventMail(eventType, orgId, vars, deviceId);
    },
    {
        connection: bullmqConnection,
        concurrency: 4,
    }
);

worker.on('failed', (job, err) => {
    logger.error('mail-notification: job failed', { jobId: job?.id, err });
});

export default worker;
