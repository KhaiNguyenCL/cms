import apiClient from './client';

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

export interface MailConfigPayload {
    name: string;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    fromName: string;
    fromAddress: string;
}

export interface MailTemplate {
    id: string;
    name: string;
    subject: string;
    bodyHtml: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface MailTemplatePayload {
    name: string;
    subject: string;
    bodyHtml: string;
    description?: string;
}

export interface MailSetting {
    id: string;
    eventType: string;
    templateId: string | null;
    mailConfigId: string | null;
    isEnabled: boolean;
    templateName: string | null;
    mailConfigName: string | null;
    triggerDelayMin: number;
    cooldownHours: number;
    advanceDays: number;
}

export interface EventTypeInfo {
    key: string;
    label: string;
    description: string;
    variables: string[];
}

export const mailConfigApi = {
    list: () =>
        apiClient.get<{ data: MailConfig[] }>('/platform/mail-configs').then(r => r.data.data),

    create: (payload: MailConfigPayload) =>
        apiClient.post<{ data: MailConfig }>('/platform/mail-configs', payload).then(r => r.data.data),

    update: (id: string, payload: Partial<MailConfigPayload>) =>
        apiClient.put<{ data: MailConfig }>(`/platform/mail-configs/${id}`, payload).then(r => r.data.data),

    delete: (id: string) =>
        apiClient.delete(`/platform/mail-configs/${id}`).then(r => r.data),

    activate: (id: string) =>
        apiClient.post<{ data: MailConfig }>(`/platform/mail-configs/${id}/activate`).then(r => r.data.data),

    testMail: (to: string, configId?: string) =>
        apiClient.post<{ message: string }>('/platform/mail-configs/test', { to, configId }).then(r => r.data),
};

export const mailTemplateApi = {
    list: () =>
        apiClient.get<{ data: MailTemplate[] }>('/platform/mail-templates').then(r => r.data.data),

    create: (payload: MailTemplatePayload) =>
        apiClient.post<{ data: MailTemplate }>('/platform/mail-templates', payload).then(r => r.data.data),

    update: (id: string, payload: Partial<MailTemplatePayload>) =>
        apiClient.put<{ data: MailTemplate }>(`/platform/mail-templates/${id}`, payload).then(r => r.data.data),

    delete: (id: string) =>
        apiClient.delete(`/platform/mail-templates/${id}`).then(r => r.data),
};

export const mailSettingsApi = {
    list: () =>
        apiClient.get<{ data: MailSetting[]; eventTypes: EventTypeInfo[] }>('/platform/mail-settings')
            .then(r => r.data),

    update: (eventType: string, payload: {
        templateId?: string | null;
        mailConfigId?: string | null;
        isEnabled?: boolean;
        triggerDelayMin?: number;
        cooldownHours?: number;
        advanceDays?: number;
    }) =>
        apiClient.put<{ data: MailSetting }>(`/platform/mail-settings/${eventType}`, payload).then(r => r.data.data),
};
