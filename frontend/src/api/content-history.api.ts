import apiClient from './client';

export interface ContentDevice {
    id: string;
    name: string;
    status: string;
    storeId: string | null;
    storeName: string | null;
    scheduleName: string | null;
    playlistName: string | null;
    lastSyncedAt: string | null;
}

export interface ContentLog {
    id: string;
    playlistId: string | null;
    playlistName: string | null;
    scheduleName: string | null;
    syncedAt: string;
}

export interface ContentLogsResult {
    data: ContentLog[];
    total: number;
}

const contentHistoryApi = {
    getDevices: (): Promise<ContentDevice[]> =>
        apiClient.get('/content-history/devices').then(r => r.data),

    getDeviceLogs: (
        deviceId: string,
        params?: { dateFrom?: string; dateTo?: string; limit?: number; offset?: number }
    ): Promise<ContentLogsResult> =>
        apiClient.get(`/content-history/devices/${deviceId}/logs`, { params }).then(r => r.data),
};

export default contentHistoryApi;
