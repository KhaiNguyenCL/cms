import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import rateLimit from 'express-rate-limit';
import config from '../config';
import logger from './utils/logger';
import pool from './database/db';
import redis from './cache/redis';

// Route imports (filled in as modules are built)
import authRoutes from '../modules/auth/auth.routes';
import orgRoutes from '../modules/organizations/organizations.routes';
import userRoutes from '../modules/users/users.routes';
import deviceRoutes from '../modules/devices/devices.routes';
import mediaRoutes from '../modules/media/media.routes';
import playlistRoutes from '../modules/playlists/playlists.routes';
import scheduleRoutes from '../modules/schedules/schedules.routes';
import analyticsRoutes from '../modules/analytics/analytics.routes';
import deviceSyncRoutes from '../modules/device-sync/device-sync.routes';
import deviceGroupRoutes from '../modules/device-groups/device-groups.routes';
import siteRoutes from '../modules/sites/sites.routes';
import scheduleAssignmentRoutes from '../modules/schedule-assignments/schedule-assignments.routes';
import alarmRoutes from '../modules/alarm/alarm.routes';
import contentHistoryRoutes from '../modules/content-history/content-history.routes';
import softwareHistoryRoutes from '../modules/software-history/software-history.routes';
import actionHistoryRoutes from '../modules/action-history/action-history.routes';
import licenseRoutes from '../modules/license/license.routes';
import storageQuotaRoutes from '../modules/storage-quota/storage-quota.routes';
import notificationRoutes from '../modules/notifications/notifications.routes';
import backupRoutes from '../modules/backup/backup.routes';
import platformRoutes from '../modules/mail-config/mail-config.routes';

// Middleware imports
import { errorHandler } from './middleware/error.middleware';
import { authenticate } from './middleware/auth.middleware';

const app = express();

// Trust X-Forwarded-For from nginx reverse proxy (1 hop)
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────
// Production: full helmet with CSP allowing media (blobs + same-origin).
// Development: CSP disabled — Android WebView strict mode causes white screen.
if (config.env === 'production') {
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc:  ["'self'"],
                scriptSrc:   ["'self'", "'unsafe-inline'"],  // Vite inlines boot script
                styleSrc:    ["'self'", "'unsafe-inline'"],   // MUI injects styles
                imgSrc:      ["'self'", 'data:', 'blob:'],
                mediaSrc:    ["'self'", 'blob:'],
                connectSrc:  ["'self'", 'ws:', 'wss:'],       // WebSocket
                fontSrc:     ["'self'", 'data:'],
                objectSrc:   ["'none'"],
                frameAncestors: ["'none'"],
            },
        },
        crossOriginEmbedderPolicy: false,   // needed for video blob URLs
    }));
} else {
    app.use(helmet({
        contentSecurityPolicy: false,
        crossOriginOpenerPolicy: false,
    }));
}

// ── CORS ──────────────────────────────────────────────────────
app.use(cors({
    origin: config.cors.origins,
    credentials: true,
}));

// ── Cookie parser ─────────────────────────────────────────────
app.use(cookieParser());

// ── Body parsers ──────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limit disabled for development

// ── Request logging ───────────────────────────────────────────
app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
    next();
});

// ── Health check (no auth) ────────────────────────────────────
app.get('/health', async (_req, res) => {
    const [dbOk, redisOk] = await Promise.all([
        pool.query('SELECT 1').then(() => true).catch(() => false),
        redis.ping().then(r => r === 'PONG').catch(() => false),
    ]);
    const status = dbOk && redisOk ? 'ok' : 'degraded';
    res.status(status === 'ok' ? 200 : 503).json({
        status,
        db: dbOk,
        redis: redisOk,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

// ── Public routes (no auth needed) ───────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/device', deviceSyncRoutes); // Device player sync (uses device JWT)

// ── Admin routes (requires user auth) ────────────────────────
app.use('/api/organizations', orgRoutes); // authenticate applied inside router
app.use('/api/users', userRoutes);        // authenticate applied inside router
app.use('/api/devices', deviceRoutes); // authenticate applied inside router
app.use('/api/media', mediaRoutes);      // authenticate applied inside router
app.use('/api/playlists', playlistRoutes);  // authenticate applied inside router
app.use('/api/schedules', scheduleRoutes); // authenticate applied inside router
app.use('/api/device-groups', deviceGroupRoutes); // authenticate applied inside router
app.use('/api/sites',        siteRoutes);         // authenticate applied inside router
app.use('/api/schedule-assignments', scheduleAssignmentRoutes); // authenticate applied inside router
app.use('/api/analytics', analyticsRoutes); // authenticate applied inside router
app.use('/api/alarm',             alarmRoutes);
app.use('/api/content-history',   contentHistoryRoutes);
app.use('/api/software-history',  softwareHistoryRoutes);
app.use('/api/action-history',    actionHistoryRoutes);
app.use('/api/license',           licenseRoutes);
app.use('/api/storage-quota',     storageQuotaRoutes);
app.use('/api/notifications',     notificationRoutes);
app.use('/api/backup',            backupRoutes);
app.use('/api/platform',          platformRoutes);

// ── Serve built frontend (SPA) ────────────────────────────────
// In production: run `npm run build` in /frontend first.
// Android WebView loads ${serverUrl}/player which is handled here.
const frontendDist = path.resolve(__dirname, '../../../frontend/dist');

// Serve static assets (JS/CSS/images) — hashed filenames are safe to cache
app.use(express.static(frontendDist, {
    setHeaders: (res, filePath) => {
        // index.html must never be cached — WebView (Android TV) caches it
        // aggressively and won't load new JS/CSS after a frontend rebuild
        if (filePath.endsWith('index.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    },
}));

// SPA fallback — all non-API, non-asset routes return index.html
app.get(/^\/(?!api\/).*/, (_req, res) => {
    const indexPath = path.join(frontendDist, 'index.html');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile(indexPath, (err) => {
        if (err) res.status(404).json({ error: 'Frontend not built. Run: cd frontend && npm run build' });
    });
});

// ── 404 handler (API routes only) ────────────────────────────
app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Route not found' });
    }
});

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

export default app;
