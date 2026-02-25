/**
 * Worker: thumbnail-generation
 * Generates WebP thumbnail from uploaded image using sharp.
 * Typically runs within ~100ms for most images.
 *
 * Job data: ThumbnailJobData
 * On success: updates media.thumbnailPath + dimensions
 */
import { Worker, Job } from 'bullmq';
import sharp from 'sharp';
import bullmqConnection from '../bullmq.connection';
import { QUEUE_NAMES, ThumbnailJobData } from '../queues';
import { query } from '../../database/db';
import logger from '../../utils/logger';

export const thumbnailWorker = new Worker<ThumbnailJobData>(
    QUEUE_NAMES.THUMBNAIL_GENERATION,
    async (job: Job<ThumbnailJobData>) => {
        const { mediaId, filePath, outputPath, width = 320, height = 180 } = job.data;
        logger.info('Thumbnail generation started', { mediaId, jobId: job.id });

        // Generate thumbnail using sharp
        const meta = await sharp(filePath)
            .resize(width, height, {
                fit: 'cover',
                position: 'centre',
            })
            .webp({ quality: 80 })
            .toFile(outputPath);

        // Also get original image dimensions
        const origMeta = await sharp(filePath).metadata();

        // Update media record with thumbnail path + dimensions
        await query(
            `UPDATE media SET
                "thumbnailPath" = $1,
                width  = $2,
                height = $3,
                status = 'READY',
                "updatedAt" = NOW()
             WHERE id = $4`,
            [outputPath, origMeta.width ?? 0, origMeta.height ?? 0, mediaId]
        );

        logger.info('Thumbnail generated', { mediaId, outputPath, size: meta.size });
        return { mediaId, outputPath, width: origMeta.width, height: origMeta.height };
    },
    {
        connection: bullmqConnection,
        concurrency: 5,    // thumbnails are fast, allow more concurrency
    }
);

thumbnailWorker.on('completed', (job) => {
    logger.info('Thumbnail job completed', { jobId: job.id, mediaId: job.data.mediaId });
});

thumbnailWorker.on('failed', async (job, err) => {
    logger.error('Thumbnail job failed', { jobId: job?.id, mediaId: job?.data?.mediaId, error: err.message });
    if (job?.data?.mediaId) {
        await query(
            `UPDATE media SET status = 'ERROR', "updatedAt" = NOW() WHERE id = $1`,
            [job.data.mediaId]
        ).catch(() => { });
    }
});
