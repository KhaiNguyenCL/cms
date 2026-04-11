/**
 * Job Scheduler — sets up recurring jobs using BullMQ's built-in cron repeat.
 * Called once at server startup.
 *
 * Schedule overview:
 *  - cleanup-logs:       daily at 03:00 (delete logs > 90 days)
 *  - generate-reports:   daily at 04:00 (yesterday's daily report for all orgs)
 */
import { QueueEvents } from 'bullmq';
import { cleanupLogsQueue, generateReportsQueue, licenseDeductionQueue, mailNotificationQueue } from './queues';
import { query } from '../database/db';
import bullmqConnection from './bullmq.connection';
import logger from '../utils/logger';

// ─── Recurring jobs ───────────────────────────────────────────────────────────

export async function setupScheduledJobs(): Promise<void> {
    // ── 1. Cleanup old logs — daily at 03:00 ─────────────────────────────────
    await cleanupLogsQueue.add(
        'daily-cleanup',
        { olderThanDays: 90 },
        {
            repeat: { pattern: '0 3 * * *' },   // cron: 3:00 AM daily
            jobId: 'scheduled-cleanup-daily',     // stable ID prevents duplicates
        }
    );
    logger.info('Scheduled: cleanup-logs daily at 03:00');

    // ── 2. Generate daily reports — daily at 04:00 ────────────────────────────
    // We schedule one meta-job; the worker will query all active orgs
    await generateReportsQueue.add(
        'daily-reports',
        { organizationId: '__ALL__', period: 'daily', date: '' },
        {
            repeat: { pattern: '0 4 * * *' },   // 4:00 AM daily
            jobId: 'scheduled-reports-daily',
        }
    );
    logger.info('Scheduled: generate-reports daily at 04:00');

    // ── 3. Weekly reports — every Monday at 05:00 ─────────────────────────────
    await generateReportsQueue.add(
        'weekly-reports',
        { organizationId: '__ALL__', period: 'weekly', date: '' },
        {
            repeat: { pattern: '0 5 * * 1' },
            jobId: 'scheduled-reports-weekly',
        }
    );
    logger.info('Scheduled: generate-reports weekly on Monday at 05:00');

    // ── 4. Monthly reports — 1st of each month at 06:00 ─────────────────────
    await generateReportsQueue.add(
        'monthly-reports',
        { organizationId: '__ALL__', period: 'monthly', date: '' },
        {
            repeat: { pattern: '0 6 1 * *' },
            jobId: 'scheduled-reports-monthly',
        }
    );
    logger.info('Scheduled: generate-reports monthly on 1st at 06:00');

    // ── 5. License deduction — daily at 00:01 UTC ─────────────────────────────
    await licenseDeductionQueue.add(
        'daily-deduction',
        { triggeredBy: 'scheduler' },
        {
            repeat: { pattern: '1 17 * * *' },  // 17:01 UTC = 00:01 UTC+7
            jobId: 'license-deduction-daily',
        }
    );
    logger.info('Scheduled: license-deduction daily at 17:01 UTC (00:01 UTC+7)');

    // ── 6. License expiry check — daily at 08:00 UTC+7 (01:00 UTC) ──────────────
    await mailNotificationQueue.add(
        'license-expiry-check',
        { eventType: '__LICENSE_EXPIRY_CHECK__', orgId: '__ALL__', vars: {} },
        {
            repeat: { pattern: '0 1 * * *' },    // 01:00 UTC = 08:00 UTC+7
            jobId: 'license-expiry-check-daily',
        }
    );
    logger.info('Scheduled: license-expiry-check daily at 01:00 UTC (08:00 UTC+7)');

    logger.info('All scheduled jobs registered');
}

// ─── QueueEvents (optional: log queue-level events) ──────────────────────────

export function setupQueueEvents(): void {
    const cleanupEvents = new QueueEvents('cleanup-logs', { connection: bullmqConnection });
    const reportEvents = new QueueEvents('generate-reports', { connection: bullmqConnection });

    cleanupEvents.on('completed', ({ jobId, returnvalue }) => {
        logger.debug('cleanup-logs queue: job completed', { jobId });
    });
    reportEvents.on('completed', ({ jobId }) => {
        logger.debug('generate-reports queue: job completed', { jobId });
    });
}

// ─── Get all active org IDs (used by report workers when organizationId = __ALL__) ──

export async function getAllOrgIds(): Promise<string[]> {
    const rows = await query<{ id: string }>(
        `SELECT id FROM organizations WHERE status = 'ACTIVE' OR status IS NULL`
    );
    return rows.map(r => r.id);
}
