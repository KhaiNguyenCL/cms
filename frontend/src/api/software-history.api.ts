import apiClient from './client';

export interface AppVersion {
    id: string;
    organizationId: string | null;
    versionName: string;
    versionCode: number;
    downloadUrl: string;
    releaseNotes: string | null;
    isLatest: boolean;
    createdAt: string;
}

export interface SoftwareDevice {
    id: string;
    name: string;
    status: string;
    appVersion: string | null;
    osVersion: string | null;
    model: string | null;
    lastSeen: string | null;
    storeId: string | null;
    storeName: string | null;
    organizationId: string;
    latestVersion: string | null;
    isOutdated: boolean;
}

export interface VersionLog {
    id: string;
    deviceId: string;
    deviceName: string;
    fromVersion: string | null;
    toVersion: string;
    method: string;
    triggeredBy: string | null;
    occurredAt: string;
}

export interface OutdatedReport {
    latestVersion: string | null;
    total: number;
    upToDate: number;
    outdated: number;
    unknown: number;
    devices: SoftwareDevice[];
}

const softwareHistoryApi = {
    getDevices: (): Promise<SoftwareDevice[]> =>
        apiClient.get('/software-history/devices').then(r => r.data),

    getDeviceLogs: (deviceId: string, params?: { limit?: number }): Promise<VersionLog[]> =>
        apiClient.get(`/software-history/devices/${deviceId}/logs`, { params }).then(r => r.data),

    listVersions: (): Promise<AppVersion[]> =>
        apiClient.get('/software-history/versions').then(r => r.data),

    createVersion: (data: {
        versionName: string;
        versionCode: number;
        downloadUrl: string;
        releaseNotes?: string;
        isLatest?: boolean;
    }): Promise<AppVersion> =>
        apiClient.post('/software-history/versions', data).then(r => r.data),

    setLatest: (id: string): Promise<AppVersion> =>
        apiClient.patch(`/software-history/versions/${id}/latest`).then(r => r.data),

    deleteVersion: (id: string): Promise<void> =>
        apiClient.delete(`/software-history/versions/${id}`).then(() => undefined),

    pushOta: (deviceId: string, versionId: string): Promise<{ versionName: string; downloadUrl: string }> =>
        apiClient.post(`/software-history/devices/${deviceId}/ota`, { versionId }).then(r => r.data),

    pushOtaAll: (versionId: string): Promise<{ pushed: number }> =>
        apiClient.post('/software-history/ota/push-all', { versionId }).then(r => r.data),

    getReport: (): Promise<OutdatedReport> =>
        apiClient.get('/software-history/report/outdated').then(r => r.data),
};

export default softwareHistoryApi;
