import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import type { CreateMailConfigBody, UpdateMailConfigBody } from './mail-config.schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MailConfig {
    id: string;
    name: string;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    fromName: string;
    fromAddress: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}

interface MailConfigRow extends MailConfig {
    password: string;
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listMailConfigs(): Promise<MailConfig[]> {
    const rows = await query<MailConfigRow>(
        `SELECT id, name, host, port, secure, username, "fromName", "fromAddress", "isActive", "createdAt", "updatedAt"
         FROM mail_configs ORDER BY "createdAt" DESC`
    );
    return rows;
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createMailConfig(data: CreateMailConfigBody): Promise<MailConfig> {
    const row = await queryOne<MailConfig>(
        `INSERT INTO mail_configs (id, name, host, port, secure, username, password, "fromName", "fromAddress", "isActive", "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, false, NOW(), NOW())
         RETURNING id, name, host, port, secure, username, "fromName", "fromAddress", "isActive", "createdAt", "updatedAt"`,
        [data.name, data.host, data.port, data.secure, data.username, data.password, data.fromName, data.fromAddress]
    );
    if (!row) throw new AppError(500, 'Tạo cấu hình mail thất bại');
    return row;
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateMailConfig(id: string, data: UpdateMailConfigBody): Promise<MailConfig> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.name !== undefined)        { fields.push(`name = $${idx++}`);          values.push(data.name); }
    if (data.host !== undefined)        { fields.push(`host = $${idx++}`);          values.push(data.host); }
    if (data.port !== undefined)        { fields.push(`port = $${idx++}`);          values.push(data.port); }
    if (data.secure !== undefined)      { fields.push(`secure = $${idx++}`);        values.push(data.secure); }
    if (data.username !== undefined)    { fields.push(`username = $${idx++}`);      values.push(data.username); }
    if (data.password !== undefined)    { fields.push(`password = $${idx++}`);      values.push(data.password); }
    if (data.fromName !== undefined)    { fields.push(`"fromName" = $${idx++}`);    values.push(data.fromName); }
    if (data.fromAddress !== undefined) { fields.push(`"fromAddress" = $${idx++}`); values.push(data.fromAddress); }

    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(id);

    const row = await queryOne<MailConfig>(
        `UPDATE mail_configs SET ${fields.join(', ')} WHERE id = $${idx}
         RETURNING id, name, host, port, secure, username, "fromName", "fromAddress", "isActive", "createdAt", "updatedAt"`,
        values
    );
    if (!row) throw new AppError(404, 'Cấu hình mail không tồn tại');
    return row;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteMailConfig(id: string): Promise<void> {
    const row = await queryOne<{ id: string }>(
        `DELETE FROM mail_configs WHERE id = $1 RETURNING id`, [id]
    );
    if (!row) throw new AppError(404, 'Cấu hình mail không tồn tại');
}

// ─── Set active ───────────────────────────────────────────────────────────────

export async function setActiveMailConfig(id: string): Promise<MailConfig> {
    const existing = await queryOne<{ id: string }>(
        `SELECT id FROM mail_configs WHERE id = $1`, [id]
    );
    if (!existing) throw new AppError(404, 'Cấu hình mail không tồn tại');

    // Deactivate all, then activate the selected one
    await query(`UPDATE mail_configs SET "isActive" = false, "updatedAt" = NOW()`);
    const row = await queryOne<MailConfig>(
        `UPDATE mail_configs SET "isActive" = true, "updatedAt" = NOW() WHERE id = $1
         RETURNING id, name, host, port, secure, username, "fromName", "fromAddress", "isActive", "createdAt", "updatedAt"`,
        [id]
    );
    return row!;
}

// ─── Get active (for use by mailer) ──────────────────────────────────────────

export async function getActiveMailConfig(): Promise<MailConfigRow | null> {
    return queryOne<MailConfigRow>(
        `SELECT id, name, host, port, secure, username, password, "fromName", "fromAddress", "isActive", "createdAt", "updatedAt"
         FROM mail_configs WHERE "isActive" = true LIMIT 1`
    );
}

// ─── Send test email ──────────────────────────────────────────────────────────

export async function sendTestMail(to: string, configId?: string): Promise<void> {
    const cfg = configId
        ? await queryOne<MailConfigRow>(
            `SELECT host, port, secure, username, password, "fromName", "fromAddress"
             FROM mail_configs WHERE id = $1`, [configId]
          )
        : await queryOne<MailConfigRow>(
            `SELECT host, port, secure, username, password, "fromName", "fromAddress"
             FROM mail_configs WHERE "isActive" = true LIMIT 1`
          );

    if (!cfg) throw new AppError(400, 'Không có cấu hình SMTP nào. Vui lòng tạo và kích hoạt cấu hình trước.');

    const nodemailer = await import('nodemailer');
    const transport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.username, pass: cfg.password },
    });

    try {
        await transport.verify();
    } catch (err: any) {
        throw new AppError(502, `Không thể kết nối SMTP: ${err?.message ?? 'Lỗi không xác định'}`);
    }

    await transport.sendMail({
        from: `"${cfg.fromName}" <${cfg.fromAddress}>`,
        to,
        subject: '[CMS] Test email từ hệ thống',
        html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
                <h2 style="color:#1976d2">Test email thành công ✓</h2>
                <p>Email này xác nhận rằng cấu hình SMTP <strong>${cfg.fromAddress}</strong> đang hoạt động đúng.</p>
                <p style="color:#888;font-size:12px;margin-top:32px">Digital Signage CMS</p>
            </div>
        `,
    });
}
