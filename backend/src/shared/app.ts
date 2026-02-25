import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import config from '../config';
import logger from './utils/logger';

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

// Middleware imports
import { errorHandler } from './middleware/error.middleware';
import { authenticate } from './middleware/auth.middleware';

const app = express();

// ── Security headers ──────────────────────────────────────────
app.use(helmet());

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

// ── Global rate limit ─────────────────────────────────────────
app.use(rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
}));

// ── Request logging ───────────────────────────────────────────
app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`, { ip: req.ip });
    next();
});

// ── Health check (no auth) ────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.use('/api/analytics', analyticsRoutes); // authenticate applied inside router

// ── 404 handler ───────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ──────────────────────────────────────
app.use(errorHandler);

export default app;
