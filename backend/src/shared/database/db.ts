/**
 * Raw PostgreSQL pool - dùng thay thế Prisma do Prisma Query Engine
 * binary không hoạt động trên Windows host → Docker container.
 *
 * pg driver dùng pure JS, kết nối trực tiếp qua TCP không cần binary.
 */
import { Pool, PoolClient } from 'pg';
import logger from '../utils/logger';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: false,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 30_000,    // kill queries stuck > 30s
    query_timeout: 30_000,
});

pool.on('error', (err: Error) => {
    logger.error('PostgreSQL pool error', { err: err.message });
});

pool.on('connect', () => {
    logger.debug('New PostgreSQL connection established');
});

// Helper: chạy query đơn giản
export async function query<T = any>(
    sql: string,
    params?: any[]
): Promise<T[]> {
    const result = await pool.query(sql, params);
    return result.rows;
}

// Helper: lấy 1 row
export async function queryOne<T = any>(
    sql: string,
    params?: any[]
): Promise<T | null> {
    const rows = await query<T>(sql, params);
    return rows[0] ?? null;
}

// Helper: transaction
export async function withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export async function testConnection(): Promise<void> {
    const result = await query<{ now: string }>('SELECT NOW() as now');
    logger.info('Database connected', { serverTime: result[0]?.now });
}

export default pool;
