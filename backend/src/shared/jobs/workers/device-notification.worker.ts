/**
 * Worker: device-notification
 * Pushes a content/schedule update notification to a specific device.
 * Primary: via WebSocket (Socket.IO)
 * Fallback: marks device needs sync (device will pick up on next heartbeat/poll)
 *
 * Job data: DeviceNotificationJobData
 */
import { Worker, Job } from 'bullmq';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES, DeviceNotificationJobData } from '../queues';
import { query } from '../../database/db';
import { pushCommandToDevice } from '../../socket/socket.server';
import logger from '../../utils/logger';
import type { DeviceCommand } from '../../socket/socket.server';

export const deviceNotificationWorker = new Worker<DeviceNotificationJobData>(
    QUEUE_NAMES.DEVICE_NOTIFICATION,
    async (job: Job<DeviceNotificationJobData>) => {
        const { deviceId, organizationId, event, payload } = job.data;
        logger.info('Device notification job started', { deviceId, event, jobId: job.id });

        // Try WebSocket push
        let delivered = false;
        try {
            delivered = pushCommandToDevice(deviceId, event as DeviceCommand, payload);
        } catch (err) {
            logger.warn('WS push failed, falling back to poll flag', { deviceId, error: (err as Error).message });
        }

        if (!delivered) {
            // Fallback: store a "pending sync" flag in Redis or DB
            // Device will pick this up on next heartbeat via syncRequired=true
            await query(
                `UPDATE devices
                 SET settings = COALESCE(settings, '{}'::jsonb) || jsonb_build_object('pendingSync', true),
                     "updatedAt" = NOW()
                 WHERE id = $1 AND "organizationId" = $2`,
                [deviceId, organizationId]
            );
            logger.info('Device notification fallback: pendingSync flag set', { deviceId });
        }

        return { deviceId, event, delivered };
    },
    {
        connection: bullmqConnection,
        concurrency: 10,
    }
);

deviceNotificationWorker.on('completed', (job) => {
    logger.debug('Device notification completed', { jobId: job.id });
});

deviceNotificationWorker.on('failed', (job, err) => {
    logger.error('Device notification job failed', { jobId: job?.id, error: err.message });
});
