/**
 * BullMQ connection factory
 * BullMQ requires its own ioredis connection (with maxRetriesPerRequest: null)
 * Do NOT reuse the shared redis singleton for queues/workers.
 */
import { ConnectionOptions } from 'bullmq';
import config from '../../config';

export const bullmqConnection: ConnectionOptions = {
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    maxRetriesPerRequest: null,  // Required by BullMQ
};

export default bullmqConnection;
