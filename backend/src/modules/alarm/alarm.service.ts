import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import logger from '../../shared/utils/logger';
import config from '../../config';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AlarmDevice {
    id: string;
    name: string;
    status: string;
    lastOnlineAt: string | null;
    lastOfflineAt: string | null;
    lastSeen: string | null;
    siteId: string | null;
    siteName: string | null;
    organizationId: string;
}

export interface StatusEvent {
    id: string;
    deviceId: string;
    deviceName: string;
    organizationId: string;
    event: string;          // 'ONLINE' | 'OFFLINE' | 'APP_EXIT'
    reason: string;         // 'NETWORK' | 'SOFTWARE' | 'DEVICE_OFF'
    occurredAt: string;
}

export interface AlarmEmail {
    id: string;
    organizationId: string;
    email: string;
    enabled: boolean;
    createdAt: string;
}

// ─── Device list ──────────────────────────────────────────────────────────────

export async function getAlarmDevices(organizationId: string): Promise<AlarmDevice[]> {
    return query<AlarmDevice>(
        `SELECT d.id, d.name, d.status,
                d."lastOnlineAt", d."lastOfflineAt", d."lastSeen",
                d."storeId" AS "siteId", s.name AS "siteName", d."organizationId"
         FROM devices d
         LEFT JOIN stores s ON s.id = d."storeId"
         WHERE d."organizationId" = $1
         ORDER BY d.name`,
        [organizationId]
    );
}

// ─── Device status history ────────────────────────────────────────────────────

export async function getDeviceStatusHistory(
    deviceId: string,
    organizationId: string,
    limit = 100
): Promise<StatusEvent[]> {
    return query<StatusEvent>(
        `SELECT e.id, e."deviceId", d.name AS "deviceName", e."organizationId",
                e.event, e.reason, e."occurredAt"
         FROM device_status_events e
         JOIN devices d ON d.id = e."deviceId"
         WHERE e."deviceId" = $1 AND e."organizationId" = $2
         ORDER BY e."occurredAt" DESC
         LIMIT $3`,
        [deviceId, organizationId, limit]
    );
}

export async function getOrgStatusHistory(
    organizationId: string,
    limit = 200
): Promise<StatusEvent[]> {
    return query<StatusEvent>(
        `SELECT e.id, e."deviceId", d.name AS "deviceName", e."organizationId",
                e.event, e.reason, e."occurredAt"
         FROM device_status_events e
         JOIN devices d ON d.id = e."deviceId"
         WHERE e."organizationId" = $1
         ORDER BY e."occurredAt" DESC
         LIMIT $2`,
        [organizationId, limit]
    );
}

/** Called from device-sync when a device transitions ONLINE or OFFLINE. */
export async function logStatusEvent(
    deviceId: string,
    organizationId: string,
    event: 'ONLINE' | 'OFFLINE' | 'APP_EXIT',
    reason: 'NETWORK' | 'SOFTWARE' | 'DEVICE_OFF' = 'NETWORK'
): Promise<void> {
    try {
        await query(
            `INSERT INTO device_status_events (id, "deviceId", "organizationId", event, reason, "occurredAt")
             VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())`,
            [deviceId, organizationId, event, reason]
        );
    } catch (err) {
        logger.warn('Failed to log status event', { deviceId, event, err });
    }
}

// ─── Alarm emails ─────────────────────────────────────────────────────────────

const MAX_EMAILS_PER_ORG = 5;

export async function getAlarmEmails(organizationId: string): Promise<AlarmEmail[]> {
    return query<AlarmEmail>(
        `SELECT id, "organizationId", email, enabled, "createdAt"
         FROM alarm_emails WHERE "organizationId" = $1
         ORDER BY "createdAt"`,
        [organizationId]
    );
}

export async function addAlarmEmail(organizationId: string, email: string): Promise<AlarmEmail> {
    const existing = await query<{ id: string }>(
        `SELECT id FROM alarm_emails WHERE "organizationId" = $1`,
        [organizationId]
    );
    if (existing.length >= MAX_EMAILS_PER_ORG) {
        throw new AppError(400, `Mỗi tổ chức chỉ được thêm tối đa ${MAX_EMAILS_PER_ORG} email`);
    }

    const row = await queryOne<AlarmEmail>(
        `INSERT INTO alarm_emails (id, "organizationId", email, enabled, "createdAt")
         VALUES (gen_random_uuid()::text, $1, $2, true, NOW())
         ON CONFLICT ("organizationId", email) DO NOTHING
         RETURNING id, "organizationId", email, enabled, "createdAt"`,
        [organizationId, email.toLowerCase().trim()]
    );
    if (!row) throw new AppError(409, 'Email đã tồn tại');
    return row;
}

export async function updateAlarmEmail(
    id: string,
    organizationId: string,
    data: { email?: string; enabled?: boolean }
): Promise<AlarmEmail> {
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (data.email !== undefined) { sets.push(`email = $${i++}`); vals.push(data.email.toLowerCase().trim()); }
    if (data.enabled !== undefined) { sets.push(`enabled = $${i++}`); vals.push(data.enabled); }
    if (sets.length === 0) throw new AppError(400, 'Không có dữ liệu cập nhật');
    vals.push(id, organizationId);
    const row = await queryOne<AlarmEmail>(
        `UPDATE alarm_emails SET ${sets.join(', ')}
         WHERE id = $${i++} AND "organizationId" = $${i++}
         RETURNING id, "organizationId", email, enabled, "createdAt"`,
        vals
    );
    if (!row) throw new AppError(404, 'Không tìm thấy email');
    return row;
}

export async function deleteAlarmEmail(id: string, organizationId: string): Promise<void> {
    const result = await query(
        `DELETE FROM alarm_emails WHERE id = $1 AND "organizationId" = $2 RETURNING id`,
        [id, organizationId]
    );
    if (!result[0]) throw new AppError(404, 'Không tìm thấy email');
}

// ─── Email sending ────────────────────────────────────────────────────────────

async function getMailTransport() {
    if (!config.smtp?.host) return null;
    try {
        const nodemailer = await import('nodemailer');
        return nodemailer.createTransport({
            host: config.smtp.host,
            port: config.smtp.port,
            secure: config.smtp.port === 465,
            auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        });
    } catch {
        return null;
    }
}

export async function sendOfflineAlert(
    organizationId: string,
    deviceName: string,
    reason: string,
    offlineSince: string
): Promise<{ sent: number; skipped: number }> {
    const emails = await getAlarmEmails(organizationId);
    const enabled = emails.filter(e => e.enabled);
    if (enabled.length === 0) return { sent: 0, skipped: emails.length };

    const transport = await getMailTransport();
    if (!transport) {
        logger.warn('SMTP not configured — skipping alarm email', { organizationId, deviceName });
        return { sent: 0, skipped: enabled.length };
    }

    const subject = `[CMS Alarm] Thiết bị "${deviceName}" offline`;
    const html = `
        <p>Thiết bị <strong>${deviceName}</strong> đã offline.</p>
        <p><strong>Loại:</strong> ${reason}</p>
        <p><strong>Thời điểm:</strong> ${new Date(offlineSince).toLocaleString('vi-VN')}</p>
        <hr/><p style="color:#888;font-size:12px">Digital Signage CMS</p>
    `;

    let sent = 0;
    for (const e of enabled) {
        try {
            await transport.sendMail({
                from: config.smtp!.from,
                to: e.email,
                subject,
                html,
            });
            sent++;
        } catch (err) {
            logger.warn('Failed to send alarm email', { to: e.email, err });
        }
    }
    return { sent, skipped: enabled.length - sent };
}

export async function sendTestEmail(organizationId: string, to: string): Promise<void> {
    const transport = await getMailTransport();
    if (!transport) throw new AppError(503, 'SMTP chưa được cấu hình trên server');
    await transport.sendMail({
        from: config.smtp!.from,
        to,
        subject: '[CMS] Test email từ hệ thống cảnh báo',
        html: '<p>Email này xác nhận rằng cấu hình email cảnh báo đang hoạt động đúng.</p>',
    });
}
