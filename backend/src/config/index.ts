import dotenv from 'dotenv';
dotenv.config();

const _port = parseInt(process.env.PORT || '3000', 10);

const config = {
    env: process.env.NODE_ENV || 'development',
    port: _port,
    wsPort: parseInt(process.env.WEBSOCKET_PORT || '4000', 10),

    server: {
        // Base URL dùng để tạo signed media URL. Set SERVER_URL trong production.
        url: process.env.SERVER_URL || `http://localhost:${_port}`,
    },

    nginx: {
        // true trong production với Nginx reverse proxy.
        // Node.js validate token, trả X-Accel-Redirect, Nginx serve file trực tiếp.
        accel: process.env.NGINX_ACCEL === 'true',
        // Phải khớp với `location /internal/storage/` trong nginx.conf
        accelPrefix: process.env.NGINX_ACCEL_PREFIX || '/internal/storage',
    },

    db: {
        url: process.env.DATABASE_URL!,
    },

    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
    },

    jwt: {
        secret: process.env.JWT_SECRET!,
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshSecret: process.env.JWT_REFRESH_SECRET!,
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
        deviceSecret: process.env.JWT_DEVICE_SECRET || process.env.JWT_SECRET!,
    },

    storage: {
        root: process.env.STORAGE_ROOT || 'E:/Script/cms/storage',
        tempDir: process.env.UPLOAD_TEMP_DIR || 'E:/Script/cms/storage/temp',
        mediaDir: process.env.MEDIA_DIR || 'E:/Script/cms/storage/media',
        thumbnailDir: process.env.THUMBNAIL_DIR || 'E:/Script/cms/storage/thumbnails',
    },

    upload: {
        maxVideoSizeMB: parseInt(process.env.MAX_VIDEO_SIZE_MB || '2048', 10),
        maxImageSizeMB: parseInt(process.env.MAX_IMAGE_SIZE_MB || '50', 10),
        allowedVideoTypes: (process.env.ALLOWED_VIDEO_TYPES || 'video/mp4,video/webm').split(','),
        allowedImageTypes: (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/gif,image/webp').split(','),
    },

    cors: {
        origins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
    },

    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },

    devicePairing: {
        // Pairing code settings
        codeLength: 6,
        codeTtlSeconds: parseInt(process.env.PAIRING_CODE_TTL_SECONDS || '300', 10), // 5 minutes
        codeCharset: '0123456789',
        maxAttempts: 3,
        lockoutDurationSeconds: parseInt(process.env.PAIRING_LOCKOUT_SECONDS || '600', 10), // 10 minutes
        
        // Device token settings
        deviceTokenExpiryDays: parseInt(process.env.DEVICE_TOKEN_EXPIRY_DAYS || '60', 10),
        deviceTokenRefreshDaysBeforeExpiry: parseInt(process.env.DEVICE_TOKEN_REFRESH_DAYS || '10', 10),
        
        // Batch operation limits
        maxBatchCodeGeneration: 100,
    },

    log: {
        level: process.env.LOG_LEVEL || 'info',
    },
} as const;

// Validate required env vars
const required = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
    if (!process.env[key]) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
}

export default config;
