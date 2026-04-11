import { query, queryOne } from '../../shared/database/db';
import { AppError } from '../../shared/middleware/error.middleware';
import type { CreateTemplateBody, UpdateTemplateBody } from './mail-template.schema';

export interface MailTemplate {
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
}

// Known event types with metadata
export const EVENT_TYPES = [
    {
        key: 'DEVICE_OFFLINE',
        label: 'Thiết bị offline',
        description: 'Gửi khi thiết bị mất kết nối',
        variables: ['{{recipientName}}', '{{deviceName}}', '{{siteName}}', '{{orgName}}', '{{offlineAt}}'],
    },
    {
        key: 'DEVICE_ERROR',
        label: 'Thiết bị lỗi',
        description: 'Gửi khi thiết bị báo trạng thái ERROR',
        variables: ['{{recipientName}}', '{{deviceName}}', '{{siteName}}', '{{orgName}}', '{{errorAt}}'],
    },
    {
        key: 'LICENSE_EXPIRY',
        label: 'License sắp hết hạn',
        description: 'Gửi trước khi license hết hạn',
        variables: ['{{recipientName}}', '{{orgName}}', '{{deviceCount}}', '{{expiresAt}}'],
    },
    {
        key: 'USER_WELCOME',
        label: 'Chào mừng người dùng',
        description: 'Gửi khi tạo tài khoản mới',
        variables: ['{{recipientName}}', '{{email}}', '{{orgName}}', '{{role}}'],
    },
] as const;

export type EventTypeKey = typeof EVENT_TYPES[number]['key'];

// ─── Mail Settings ────────────────────────────────────────────────────────────

export interface MailSetting {
    id: string;
    eventType: string;
    templateId: string | null;
    mailConfigId: string | null;
    isEnabled: boolean;
    templateName: string | null;
    mailConfigName: string | null;
    triggerDelayMin: number;   // wait N min before sending (avoid false alarms)
    cooldownHours: number;     // min hours between repeated alerts for same device
    advanceDays: number;       // days before expiry to start notifying (LICENSE_EXPIRY)
}

// ─── Templates CRUD ───────────────────────────────────────────────────────────

export async function listTemplates(): Promise<MailTemplate[]> {
    return query<MailTemplate>(
        `SELECT id, name, subject, "bodyHtml", description, "createdAt", "updatedAt"
         FROM mail_templates ORDER BY "createdAt" DESC`
    );
}

export async function createTemplate(data: CreateTemplateBody): Promise<MailTemplate> {
    const row = await queryOne<MailTemplate>(
        `INSERT INTO mail_templates (id, name, subject, "bodyHtml", description, "createdAt", "updatedAt")
         VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW(), NOW())
         RETURNING id, name, subject, "bodyHtml", description, "createdAt", "updatedAt"`,
        [data.name, data.subject, data.bodyHtml, data.description ?? null]
    );
    if (!row) throw new AppError(500, 'Tạo template thất bại');
    return row;
}

export async function updateTemplate(id: string, data: UpdateTemplateBody): Promise<MailTemplate> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (data.name !== undefined)        { fields.push(`name = $${idx++}`);         values.push(data.name); }
    if (data.subject !== undefined)     { fields.push(`subject = $${idx++}`);      values.push(data.subject); }
    if (data.bodyHtml !== undefined)    { fields.push(`"bodyHtml" = $${idx++}`);   values.push(data.bodyHtml); }
    if (data.description !== undefined) { fields.push(`description = $${idx++}`);  values.push(data.description); }
    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(id);
    const row = await queryOne<MailTemplate>(
        `UPDATE mail_templates SET ${fields.join(', ')} WHERE id = $${idx}
         RETURNING id, name, subject, "bodyHtml", description, "createdAt", "updatedAt"`,
        values
    );
    if (!row) throw new AppError(404, 'Template không tồn tại');
    return row;
}

export async function deleteTemplate(id: string): Promise<void> {
    // Clear FK in mail_settings first
    await query(`UPDATE mail_settings SET "templateId" = NULL WHERE "templateId" = $1`, [id]);
    const row = await queryOne<{ id: string }>(`DELETE FROM mail_templates WHERE id = $1 RETURNING id`, [id]);
    if (!row) throw new AppError(404, 'Template không tồn tại');
}

// ─── Mail Settings CRUD ───────────────────────────────────────────────────────

export async function listMailSettings(): Promise<MailSetting[]> {
    // Ensure all known event types exist
    for (const et of EVENT_TYPES) {
        await query(
            `INSERT INTO mail_settings (id, "eventType", "isEnabled", "createdAt", "updatedAt")
             VALUES (gen_random_uuid()::text, $1, true, NOW(), NOW())
             ON CONFLICT ("eventType") DO NOTHING`,
            [et.key]
        );
    }
    return query<MailSetting>(
        `SELECT ms.id, ms."eventType", ms."templateId", ms."mailConfigId", ms."isEnabled",
                ms."triggerDelayMin", ms."cooldownHours", ms."advanceDays",
                mt.name AS "templateName", mc.name AS "mailConfigName"
         FROM mail_settings ms
         LEFT JOIN mail_templates mt ON mt.id = ms."templateId"
         LEFT JOIN mail_configs   mc ON mc.id = ms."mailConfigId"
         ORDER BY ms."eventType"`
    );
}

export async function updateMailSetting(
    eventType: string,
    data: {
        templateId?: string | null;
        mailConfigId?: string | null;
        isEnabled?: boolean;
        triggerDelayMin?: number;
        cooldownHours?: number;
        advanceDays?: number;
    }
): Promise<MailSetting> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (data.templateId !== undefined)      { fields.push(`"templateId" = $${idx++}`);      values.push(data.templateId); }
    if (data.mailConfigId !== undefined)    { fields.push(`"mailConfigId" = $${idx++}`);    values.push(data.mailConfigId); }
    if (data.isEnabled !== undefined)       { fields.push(`"isEnabled" = $${idx++}`);       values.push(data.isEnabled); }
    if (data.triggerDelayMin !== undefined) { fields.push(`"triggerDelayMin" = $${idx++}`); values.push(data.triggerDelayMin); }
    if (data.cooldownHours !== undefined)   { fields.push(`"cooldownHours" = $${idx++}`);   values.push(data.cooldownHours); }
    if (data.advanceDays !== undefined)     { fields.push(`"advanceDays" = $${idx++}`);     values.push(data.advanceDays); }
    if (fields.length === 0) throw new AppError(400, 'Không có dữ liệu để cập nhật');
    fields.push(`"updatedAt" = NOW()`);
    values.push(eventType);
    const row = await queryOne<MailSetting>(
        `UPDATE mail_settings SET ${fields.join(', ')} WHERE "eventType" = $${idx}
         RETURNING id, "eventType", "templateId", "mailConfigId", "isEnabled",
                   "triggerDelayMin", "cooldownHours", "advanceDays",
                   NULL::text AS "templateName", NULL::text AS "mailConfigName"`,
        values
    );
    if (!row) throw new AppError(404, 'Setting không tồn tại');
    return row;
}
