/**
 * Worker: video-transcoding
 * Converts uploaded videos to optimized MP4 + generates a thumbnail frame.
 * Uses ffmpeg (via child_process) — must have ffmpeg installed on the server.
 *
 * Job data: VideoTranscodingJobData
 * On success: updates media record status → READY, sets duration + dimensions
 * On failure: updates media record status → ERROR
 */
import { Worker, Job } from 'bullmq';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES, VideoTranscodingJobData } from '../queues';
import { query } from '../../database/db';
import { invalidateContentHashForOrg } from '../../../modules/device-sync/device-sync.service';
import logger from '../../utils/logger';
import config from '../../../config';

const execFileAsync = promisify(execFile);

// ─── ffprobe helper: get video metadata ──────────────────────────────────────

async function getVideoMetadata(filePath: string): Promise<{ duration: number; width: number; height: number }> {
    try {
        const { stdout } = await execFileAsync('ffprobe', [
            '-v', 'quiet',
            '-print_format', 'json',
            '-show_streams',
            filePath,
        ]);
        const data = JSON.parse(stdout);
        const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
        return {
            duration: Math.round(parseFloat(data.streams?.[0]?.duration ?? '0')),
            width: videoStream?.width ?? 0,
            height: videoStream?.height ?? 0,
        };
    } catch {
        return { duration: 0, width: 0, height: 0 };
    }
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export const videoTranscodingWorker = new Worker<VideoTranscodingJobData>(
    QUEUE_NAMES.VIDEO_TRANSCODING,
    async (job: Job<VideoTranscodingJobData>) => {
        const { mediaId, filePath, outputDir, mimeType } = job.data;
        logger.info('Video transcoding started', { mediaId, jobId: job.id });

        // Update status to PROCESSING
        await query(
            `UPDATE media SET status = 'PROCESSING', "updatedAt" = NOW() WHERE id = $1`,
            [mediaId]
        );

        // Construct output paths (outputDir is already org-specific)
        const baseName = path.basename(filePath, path.extname(filePath));
        const outputMp4 = path.join(outputDir, `${baseName}_transcoded.mp4`);
        const orgThumbDir = path.join(config.storage.thumbnailDir, job.data.organizationId);
        if (!fs.existsSync(orgThumbDir)) fs.mkdirSync(orgThumbDir, { recursive: true });
        const thumbPath = path.join(orgThumbDir, `${baseName}_thumb.webp`);

        // Report progress: 10%
        await job.updateProgress(10);

        // Check if ffmpeg available
        const ffmpegAvailable = await execFileAsync('ffmpeg', ['-version']).then(() => true).catch(() => false);
        if (!ffmpegAvailable) {
            // ffmpeg not installed — mark as READY with original file, log warning
            logger.warn('ffmpeg not installed, skipping video transcoding', { mediaId });
            const meta = await getVideoMetadata(filePath).catch(() => ({ duration: 0, width: 0, height: 0 }));
            await query(
                `UPDATE media SET status = 'READY',
                 duration = CASE WHEN $1 > 0 THEN $1 ELSE COALESCE(duration, NULL) END,
                 width = $2, height = $3, "updatedAt" = NOW() WHERE id = $4`,
                [meta.duration, meta.width, meta.height, mediaId]
            );
            invalidateContentHashForOrg(job.data.organizationId, 'CONTENT').catch(() => {});
            return { mediaId, status: 'READY', note: 'ffmpeg unavailable, original file kept' };
        }

        // ── Transcode to optimized MP4 (H.264, CRF 23) ───────────────────────
        await execFileAsync('ffmpeg', [
            '-i', filePath,
            '-c:v', 'libx264',
            '-crf', '23',
            '-preset', 'fast',
            '-c:a', 'aac',
            '-movflags', '+faststart',
            '-y',         // overwrite output
            outputMp4,
        ]);
        await job.updateProgress(70);

        // ── Extract thumbnail at 2s ───────────────────────────────────────────
        await execFileAsync('ffmpeg', [
            '-ss', '2',
            '-i', outputMp4,
            '-frames:v', '1',
            '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2',
            '-y',
            thumbPath,
        ]);
        await job.updateProgress(90);

        // ── Get metadata ──────────────────────────────────────────────────────
        const meta = await getVideoMetadata(outputMp4);
        const fileSize = fs.existsSync(outputMp4) ? fs.statSync(outputMp4).size : 0;

        // ── Update DB ─────────────────────────────────────────────────────────
        await query(
            `UPDATE media SET
                status = 'READY',
                "filePath" = $1,
                "thumbnailPath" = $2,
                "fileSize" = $3,
                duration = CASE WHEN $4 > 0 THEN $4 ELSE COALESCE(duration, NULL) END,
                width = $5,
                height = $6,
                "updatedAt" = NOW()
             WHERE id = $7`,
            [outputMp4, thumbPath, fileSize, meta.duration, meta.width, meta.height, mediaId]
        );

        await job.updateProgress(100);
        logger.info('Video transcoding completed', { mediaId, outputMp4, duration: meta.duration });

        // Invalidate content hash so connected devices get push notification
        invalidateContentHashForOrg(job.data.organizationId).catch(() => {});

        // In-app notification
        const title = await query<{ title: string }>(`SELECT title FROM media WHERE id = $1`, [mediaId])
            .then(r => r[0]?.title ?? mediaId).catch(() => mediaId);
        import('../../../modules/notifications/notifications.service')
            .then(({ createNotification, NOTIF_TYPES }) =>
                createNotification(job.data.organizationId, NOTIF_TYPES.MEDIA_READY,
                    `Video đã xử lý xong: ${title}`, undefined, mediaId, 'media')
            ).catch(() => {});

        return { mediaId, outputMp4, thumbnailPath: thumbPath, ...meta };
    },
    {
        connection: bullmqConnection,
        concurrency: 2,    // max 2 simultaneous transcoding jobs
    }
);

videoTranscodingWorker.on('completed', (job) => {
    logger.info('Video transcoding job completed', { jobId: job.id, mediaId: job.data.mediaId });
});

videoTranscodingWorker.on('failed', async (job, err) => {
    logger.error('Video transcoding job failed', { jobId: job?.id, mediaId: job?.data?.mediaId, error: err.message });
    if (job?.data?.mediaId) {
        await query(
            `UPDATE media SET status = 'ERROR', "updatedAt" = NOW() WHERE id = $1`,
            [job.data.mediaId]
        ).catch(() => { });
        const title = await query<{ title: string }>(`SELECT title FROM media WHERE id = $1`, [job.data.mediaId])
            .then(r => r[0]?.title ?? job.data.mediaId).catch(() => job.data.mediaId);
        import('../../../modules/notifications/notifications.service')
            .then(({ createNotification, NOTIF_TYPES }) =>
                createNotification(job.data.organizationId, NOTIF_TYPES.MEDIA_ERROR,
                    `Video xử lý thất bại: ${title}`, err.message, job.data.mediaId, 'media')
            ).catch(() => {});
    }
});
