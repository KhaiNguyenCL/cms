import Redis from 'ioredis';
import config from '../../config';
import logger from '../utils/logger';

const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    retryStrategy(times) {
        const delay = Math.min(times * 100, 3000);
        return delay;
    },
    maxRetriesPerRequest: 3,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

export default redis;

// Typed key helpers to avoid typos
export const RedisKeys = {
    session: (userId: string) => `session:${userId}`,
    refreshToken: (tokenId: string) => `refresh:${tokenId}`,
    deviceStatus: (deviceId: string) => `device:${deviceId}:status`,
    deviceSchedule: (deviceId: string, date: string) => `device:${deviceId}:schedule:${date}`,
    pairingCode: (code: string) => `pairing:${code}`,
    loginAttempts: (email: string) => `login_attempts:${email}`,
    orgSettings: (orgId: string) => `org:${orgId}:settings`,
    deviceContentHash: (deviceId: string) => `device:${deviceId}:content_hash`,
    deviceBlacklist: (deviceId: string) => `device:${deviceId}:blacklisted`,
};
