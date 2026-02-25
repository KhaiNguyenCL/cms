/**
 * Worker: generate-reports
 * Generates analytics summary for an org/period and stores result in Redis cache.
 * Future: could also send email reports.
 *
 * Job data: GenerateReportsJobData
 */
import { Worker, Job } from 'bullmq';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES, GenerateReportsJobData, generateReportsQueue } from '../queues';
import { query, queryOne } from '../../database/db';
import redis from '../../cache/redis';
import logger from '../../utils/logger';

export const generateReportsWorker = new Worker<GenerateReportsJobData>(
    QUEUE_NAMES.GENERATE_REPORTS,
    async (job: Job<GenerateReportsJobData>) => {
        const { organizationId, period, date: rawDate } = job.data;

        // Fill in today's date if empty (from scheduled jobs)
        const date = rawDate || new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

        // ── Fan-out: if __ALL__, create one job per active org ────────────────
        if (organizationId === '__ALL__') {
            const orgs = await query<{ id: string }>(
                `SELECT id FROM organizations`
            );
            const { generateReportsQueue } = await import('../queues');
            for (const org of orgs) {
                await generateReportsQueue.add('report', { organizationId: org.id, period, date });
            }
            logger.info('Report fan-out dispatched', { orgCount: orgs.length, period, date });
            return { fanned: true, orgCount: orgs.length };
        }

        logger.info('Generate report started', { organizationId, period, date, jobId: job.id });

        // Build date range
        const startDate = new Date(date);
        const endDate = new Date(date);

        if (period === 'daily') {
            endDate.setDate(endDate.getDate() + 1);
        } else if (period === 'weekly') {
            startDate.setDate(startDate.getDate() - startDate.getDay()); // Start of week
            endDate.setDate(startDate.getDate() + 7);
        } else {
            startDate.setDate(1); // Start of month
            endDate.setMonth(endDate.getMonth() + 1, 1); // Start of next month
        }

        await job.updateProgress(20);

        // ── Parallel analytics queries ─────────────────────────────────────────
        const [playbackSummary, topContent, deviceActivity, deviceHealth] = await Promise.all([
            // Total plays + minutes + completion rate
            queryOne<{ plays: string; totalMinutes: string; completed: string }>(
                `SELECT COUNT(*) as plays,
                        ROUND(COALESCE(SUM(pl."durationPlayed"), 0) / 60.0, 2)::float as "totalMinutes",
                        COUNT(*) FILTER (WHERE pl.completed = true) as completed
                 FROM playback_logs pl
                 JOIN devices d ON d.id = pl."deviceId"
                 WHERE d."organizationId" = $1
                   AND pl."playedAt" >= $2 AND pl."playedAt" < $3`,
                [organizationId, startDate, endDate]
            ),

            // Top 5 content
            query<{ mediaId: string; title: string; plays: string }>(
                `SELECT pl."mediaId", m.title, COUNT(*) as plays
                 FROM playback_logs pl
                 JOIN devices d ON d.id = pl."deviceId"
                 JOIN media m   ON m.id = pl."mediaId"
                 WHERE d."organizationId" = $1
                   AND pl."playedAt" >= $2 AND pl."playedAt" < $3
                 GROUP BY pl."mediaId", m.title
                 ORDER BY plays DESC
                 LIMIT 5`,
                [organizationId, startDate, endDate]
            ),

            // Device activity
            query<{ deviceId: string; name: string; plays: string }>(
                `SELECT pl."deviceId", d.name, COUNT(*) as plays
                 FROM playback_logs pl
                 JOIN devices d ON d.id = pl."deviceId"
                 WHERE d."organizationId" = $1
                   AND pl."playedAt" >= $2 AND pl."playedAt" < $3
                 GROUP BY pl."deviceId", d.name
                 ORDER BY plays DESC
                 LIMIT 10`,
                [organizationId, startDate, endDate]
            ),

            // Device online rate (avg of device_health.isOnline in period)
            queryOne<{ onlineRate: string }>(
                `SELECT ROUND(AVG(CASE WHEN dh."isOnline" THEN 100.0 ELSE 0 END), 1)::float as "onlineRate"
                 FROM device_health dh
                 JOIN devices d ON d.id = dh."deviceId"
                 WHERE d."organizationId" = $1
                   AND dh."reportedAt" >= $2 AND dh."reportedAt" < $3`,
                [organizationId, startDate, endDate]
            ),
        ]);

        await job.updateProgress(80);

        const totalPlays = parseInt(playbackSummary?.plays ?? '0');
        const completed = parseInt(playbackSummary?.completed ?? '0');

        const report = {
            organizationId,
            period,
            date,
            generatedAt: new Date().toISOString(),
            summary: {
                totalPlays,
                totalMinutes: playbackSummary?.totalMinutes ?? 0,
                completionRate: totalPlays > 0 ? Math.round((completed / totalPlays) * 100) : 0,
                deviceOnlineRate: deviceHealth?.onlineRate ?? 0,
            },
            topContent: topContent.map(c => ({ ...c, plays: parseInt(c.plays) })),
            deviceActivity: deviceActivity.map(d => ({ ...d, plays: parseInt(d.plays) })),
        };

        // Cache report in Redis (TTL: 25 hours → refreshed daily)
        const cacheKey = `report:${organizationId}:${period}:${date}`;
        await redis.setex(cacheKey, 90_000, JSON.stringify(report));

        await job.updateProgress(100);
        logger.info('Report generated and cached', { organizationId, period, date, cacheKey, totalPlays });
        return report;
    },
    {
        connection: bullmqConnection,
        concurrency: 3,
    }
);

generateReportsWorker.on('completed', (job) => {
    logger.info('Report job completed', { jobId: job.id, organizationId: job.data.organizationId, period: job.data.period });
});

generateReportsWorker.on('failed', (job, err) => {
    logger.error('Report job failed', { jobId: job?.id, error: err.message });
});
