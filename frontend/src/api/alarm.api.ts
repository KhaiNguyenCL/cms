import apiClient from './client';

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
    event: 'ONLINE' | 'OFFLINE' | 'APP_EXIT';
    reason: 'NETWORK' | 'SOFTWARE' | 'DEVICE_OFF';
    occurredAt: string;
}

export interface AlarmEmail {
    id: string;
    organizationId: string;
    email: string;
    enabled: boolean;
    createdAt: string;
}

const alarmApi = {
    getDevices: (): Promise<AlarmDevice[]> =>
        apiClient.get('/alarm/devices').then(r => r.data),

    getDeviceHistory: (deviceId: string, limit = 100): Promise<StatusEvent[]> =>
        apiClient.get(`/alarm/devices/${deviceId}/history`, { params: { limit } }).then(r => r.data),

    getOrgHistory: (limit = 200): Promise<StatusEvent[]> =>
        apiClient.get('/alarm/history', { params: { limit } }).then(r => r.data),

    getEmails: (): Promise<AlarmEmail[]> =>
        apiClient.get('/alarm/emails').then(r => r.data),

    addEmail: (email: string): Promise<AlarmEmail> =>
        apiClient.post('/alarm/emails', { email }).then(r => r.data),

    updateEmail: (id: string, data: { email?: string; enabled?: boolean }): Promise<AlarmEmail> =>
        apiClient.patch(`/alarm/emails/${id}`, data).then(r => r.data),

    deleteEmail: (id: string): Promise<void> =>
        apiClient.delete(`/alarm/emails/${id}`).then(() => undefined),

    testEmail: (to: string): Promise<void> =>
        apiClient.post('/alarm/emails/test', { to }).then(() => undefined),
};

export default alarmApi;
