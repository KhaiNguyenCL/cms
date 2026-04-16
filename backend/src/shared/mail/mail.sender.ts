/**
 * Central mail-sending utility.
 * Reads SMTP config + template from the database (mail_configs / mail_templates / mail_settings).
 * Recipients = ACTIVE ADMIN and MANAGER users of the org.
 */
import { query, queryOne } from '../database/db';
import logger from '../utils/logger';

interface MailConfig {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromName: string;
    fromAddress: string;
}

interface MailSetting {
    isEnabled: boolean;
    templateId: string | null;
    mailConfigId: string | null;
    cooldownHours: number;
}

interface MailTemplate {
    subject: string;
    bodyHtml: string;
}

/** Replace {{variable}} placeholders in a string. */
function renderTemplate(text: string, vars: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * Check whether "now" falls within a site's active operating window.
 * Returns true (→ should notify) when inside the window, false when outside.
 *
 * Window = [timeOn - toleranceMin  …  timeOff + toleranceMin]
 * If timeOn or timeOff is not set the site has no schedule → always notify.
 */
export function isWithinOperatingWindow(
    timeOn: string | null,
    timeOff: string | null,
    timezone: string | null,
    now: Date = new Date(),
): boolean {
    if (!timeOn || !timeOff) return true;   // no schedule configured → always notify

    const tz = timezone ?? 'UTC';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const h = parseInt(parts.find(p => p.type === 'hour')!.value, 10);
    const m = parseInt(parts.find(p => p.type === 'minute')!.value, 10);
    const nowMin = h * 60 + m;

    const [onH, onM]   = timeOn.split(':').map(Number);
    const [offH, offM] = timeOff.split(':').map(Number);

    const start = onH * 60 + onM;
    const end   = offH * 60 + offM;

    return nowMin >= start && nowMin <= end;
}

/** Get the SMTP config to use: specific one if set, otherwise the active one. */
async function resolveMailConfig(mailConfigId: string | null): Promise<MailConfig | null> {
    const row = mailConfigId
        ? await queryOne<MailConfig>(
            `SELECT host, port, secure, username, password, "fromName", "fromAddress"
             FROM mail_configs WHERE id = $1`,
            [mailConfigId]
          )
        : await queryOne<MailConfig>(
            `SELECT host, port, secure, username, password, "fromName", "fromAddress"
             FROM mail_configs WHERE "isActive" = true LIMIT 1`
          );
    return row ?? null;
}

/** Get ACTIVE ADMIN/MANAGER users in the org. */
async function getOrgRecipients(orgId: string): Promise<{ email: string; name: string }[]> {
    const rows = await query<{ email: string; name: string }>(
        `SELECT email, name FROM users
         WHERE "organizationId" = $1
           AND status = 'ACTIVE'
           AND role IN ('ADMIN', 'MANAGER')`,
        [orgId]
    );
    return rows.filter(r => r.email);
}

/** Redis cooldown key for a specific event + device. */
function cooldownKey(eventType: string, deviceId: string): string {
    return `mail:cooldown:${eventType}:${deviceId}`;
}

/**
 * Check cooldown and mark as sent.
 * Returns true if allowed to send (not in cooldown), false if suppressed.
 */
async function checkAndSetCooldown(
    eventType: string,
    deviceId: string | undefined,
    cooldownHours: number,
): Promise<boolean> {
    if (!deviceId || cooldownHours === 0) return true;
    try {
        const redis = (await import('../cache/redis')).default;
        const key = cooldownKey(eventType, deviceId);
        const exists = await redis.exists(key);
        if (exists) return false;
        await redis.setex(key, cooldownHours * 3600, '1');
        return true;
    } catch {
        return true; // Redis error → allow sending
    }
}

/**
 * Send a templated email for an event.
 * Silently skips if: event disabled, no template assigned, no mail config, no recipients, in cooldown.
 */
export async function sendEventMail(
    eventType: string,
    orgId: string,
    vars: Record<string, string>,
    deviceId?: string,
): Promise<void> {
    try {
        // 1. Check mail setting
        const setting = await queryOne<MailSetting>(
            `SELECT "isEnabled", "templateId", "mailConfigId", "cooldownHours"
             FROM mail_settings WHERE "eventType" = $1`,
            [eventType]
        );
        if (!setting?.isEnabled || !setting.templateId) return;

        // 2. Cooldown check
        const allowed = await checkAndSetCooldown(eventType, deviceId, setting.cooldownHours);
        if (!allowed) {
            logger.info('sendEventMail: suppressed by cooldown', { eventType, deviceId });
            return;
        }

        // 3. Load template
        const template = await queryOne<MailTemplate>(
            `SELECT subject, "bodyHtml" FROM mail_templates WHERE id = $1`,
            [setting.templateId]
        );
        if (!template) return;

        // 4. Resolve SMTP config
        const cfg = await resolveMailConfig(setting.mailConfigId);
        if (!cfg) {
            logger.warn('sendEventMail: no SMTP config available', { eventType, orgId });
            return;
        }

        // 5. Get recipients + enrich vars with org name
        const [recipients, orgRow] = await Promise.all([
            getOrgRecipients(orgId),
            queryOne<{ name: string }>(`SELECT name FROM organizations WHERE id = $1`, [orgId]),
        ]);
        if (recipients.length === 0) return;
        const enrichedVars = { ...vars, orgName: vars.orgName || orgRow?.name || '' };

        // 6. Send (per-recipient to personalize {{recipientName}})
        const nodemailer = await import('nodemailer');
        const transport = nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            auth: { user: cfg.username, pass: cfg.password },
        });

        for (const recipient of recipients) {
            try {
                const perVars = { ...enrichedVars, recipientName: recipient.name };
                const perSubject = renderTemplate(template.subject, perVars);
                const perHtml = renderTemplate(template.bodyHtml, perVars);
                await transport.sendMail({
                    from: `"${cfg.fromName}" <${cfg.fromAddress}>`,
                    to: recipient.email,
                    subject: perSubject,
                    html: perHtml,
                });
            } catch (err) {
                logger.warn('sendEventMail: failed to send to recipient', { to: recipient.email, eventType, err });
            }
        }

        logger.info('sendEventMail: sent', { eventType, orgId, count: recipients.length });
    } catch (err) {
        logger.warn('sendEventMail: error', { eventType, orgId, err });
    }
}
