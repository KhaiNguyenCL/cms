import http from 'http';
import app from './shared/app';
import config from './config';
import logger from './shared/utils/logger';
import pool, { testConnection } from './shared/database/db';
import redis from './shared/cache/redis';
import fs from 'fs';
import { initSocketIO } from './shared/socket/socket.server';
import { setupScheduledJobs, setupQueueEvents } from './shared/jobs';

async function bootstrap() {
    // Create storage directories if they don't exist
    const dirs = [
        config.storage.root,
        config.storage.tempDir,
        config.storage.mediaDir,
        config.storage.thumbnailDir,
    ];
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logger.info(`Created storage directory: ${dir}`);
        }
    }

    // Test DB connection using raw pg Pool
    try {
        await testConnection();
    } catch (err) {
        logger.warn('Database not reachable at startup', { err });
    }

    // Test Redis connection
    await redis.ping();
    logger.info('Redis connected');

    // Start HTTP server
    const server = http.createServer(app);

    // Attach Socket.IO
    const io = initSocketIO(server);

    server.listen(config.port, async () => {
        logger.info(`🚀 API Server running on http://localhost:${config.port}`);
        logger.info(`📁 Storage root: ${config.storage.root}`);
        logger.info(`🌍 Environment: ${config.env}`);

        // Register cron jobs (after server ready to avoid startup race)
        await setupScheduledJobs();
        setupQueueEvents();
        logger.info('📋 BullMQ workers started, scheduled jobs registered');
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
        logger.info(`${signal} received, shutting down gracefully...`);
        io.close();
        server.close(async () => {
            await pool.end();
            redis.disconnect();
            logger.info('Server shut down cleanly');
            process.exit(0);
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
