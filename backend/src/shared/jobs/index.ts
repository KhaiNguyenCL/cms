/**
 * Jobs bootstrap — import all workers here so they are registered
 * and call setupScheduledJobs() once at server startup.
 *
 * Import this file in server.ts: `import './shared/jobs';`
 */

// ─── Start all workers (importing starts the BullMQ worker processes) ─────────
import './workers/video-transcoding.worker';
import './workers/thumbnail.worker';
import './workers/device-notification.worker';
import './workers/cleanup-logs.worker';
import './workers/generate-reports.worker';
import './workers/license-deduction.worker';
import './workers/mail-notification.worker';
import './workers/media-purge.worker';
import './workers/backup-snapshot.worker';

// ─── Export scheduler helper for use in server.ts ─────────────────────────────
export { setupScheduledJobs, setupQueueEvents } from './scheduler';

// ─── Re-export queue helpers for use throughout the app ───────────────────────
export {
    enqueueVideoTranscoding,
    enqueueThumbnail,
    enqueueDeviceNotification,
    enqueueCleanupLogs,
    enqueueGenerateReport,
    enqueueLicenseDeduction,
    enqueueMailNotification,
    videoTranscodingQueue,
    thumbnailGenerationQueue,
    deviceNotificationQueue,
    cleanupLogsQueue,
    generateReportsQueue,
    licenseDeductionQueue,
    mailNotificationQueue,
    mediaPurgeQueue,
    enqueueMediaPurge,
    backupSnapshotQueue,
    enqueueBackupSnapshot,
    QUEUE_NAMES,
} from './queues';

export type {
    VideoTranscodingJobData,
    ThumbnailJobData,
    DeviceNotificationJobData,
    CleanupLogsJobData,
    GenerateReportsJobData,
    LicenseDeductionJobData,
    MailNotificationJobData,
    MediaPurgeJobData,
    BackupSnapshotJobData,
} from './queues';
