/**
 * Queue definitions — central registry for all BullMQ queues.
 * Import queues here and use them anywhere in the app to add jobs.
 */
import { Queue } from 'bullmq';
import bullmqConnection from './bullmq.connection';

// ─── Queue names (constants to avoid typos) ───────────────────────────────────

export const QUEUE_NAMES = {
    VIDEO_TRANSCODING: 'video-transcoding',
    THUMBNAIL_GENERATION: 'thumbnail-generation',
    DEVICE_NOTIFICATION: 'device-notification',
    CLEANUP_LOGS: 'cleanup-logs',
    GENERATE_REPORTS: 'generate-reports',
} as const;

// ─── Queue instances ──────────────────────────────────────────────────────────

/** Queue: background video transcoding (mp4 → optimized mp4/webm + thumbnail) */
export const videoTranscodingQueue = new Queue(QUEUE_NAMES.VIDEO_TRANSCODING, {
    connection: bullmqConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
    },
});

/** Queue: thumbnail generation for images (runs after upload, usually ~100ms) */
export const thumbnailGenerationQueue = new Queue(QUEUE_NAMES.THUMBNAIL_GENERATION, {
    connection: bullmqConnection,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 2_000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
    },
});

/** Queue: push notifications/commands to devices (via WebSocket or fallback polling) */
export const deviceNotificationQueue = new Queue(QUEUE_NAMES.DEVICE_NOTIFICATION, {
    connection: bullmqConnection,
    defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { count: 500 },
        removeOnFail: { count: 500 },
    },
});

/** Queue: cleanup old playback_logs (runs daily via scheduler) */
export const cleanupLogsQueue = new Queue(QUEUE_NAMES.CLEANUP_LOGS, {
    connection: bullmqConnection,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 60_000 },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 20 },
    },
});

/** Queue: generate analytics reports (daily/weekly summaries → future: email) */
export const generateReportsQueue = new Queue(QUEUE_NAMES.GENERATE_REPORTS, {
    connection: bullmqConnection,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'fixed', delay: 30_000 },
        removeOnComplete: { count: 30 },
        removeOnFail: { count: 30 },
    },
});

// ─── Job data types ───────────────────────────────────────────────────────────

export interface VideoTranscodingJobData {
    mediaId: string;
    organizationId: string;
    filePath: string;    // Input file path
    mimeType: string;
    outputDir: string;
}

export interface ThumbnailJobData {
    mediaId: string;
    organizationId: string;
    filePath: string;
    outputPath: string;
    width?: number;
    height?: number;
}

export interface DeviceNotificationJobData {
    deviceId: string;
    organizationId: string;
    event: string;    // e.g. 'content.update', 'schedule.update'
    payload?: Record<string, unknown>;
    retryViaPolling: boolean; // fallback if WS not connected
}

export interface CleanupLogsJobData {
    olderThanDays: number;    // delete playback_logs older than N days
    organizationId?: string; // null = all orgs
}

export interface GenerateReportsJobData {
    organizationId: string;
    period: 'daily' | 'weekly' | 'monthly';
    date: string;   // YYYY-MM-DD (the period to report on)
}

// ─── Helper: add jobs from anywhere ──────────────────────────────────────────

export async function enqueueVideoTranscoding(data: VideoTranscodingJobData): Promise<string> {
    const job = await videoTranscodingQueue.add('transcode', data);
    return job.id!;
}

export async function enqueueThumbnail(data: ThumbnailJobData): Promise<string> {
    const job = await thumbnailGenerationQueue.add('generate-thumbnail', data);
    return job.id!;
}

export async function enqueueDeviceNotification(data: DeviceNotificationJobData): Promise<string> {
    const job = await deviceNotificationQueue.add('notify', data);
    return job.id!;
}

export async function enqueueCleanupLogs(data: CleanupLogsJobData): Promise<string> {
    const job = await cleanupLogsQueue.add('cleanup', data);
    return job.id!;
}

export async function enqueueGenerateReport(data: GenerateReportsJobData): Promise<string> {
    const job = await generateReportsQueue.add('report', data);
    return job.id!;
}
