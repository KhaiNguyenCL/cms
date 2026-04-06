import apiClient from './client';

export interface ContentDevice {
    id: string;
    name: string;
    status: string;
    storeId: string | null;
    storeName: string | null;
    scheduleName: string | null;
    playlistName: string | null;
    lastMediaTitle: string | null;
    lastPlayedAt: string | null;
    totalPlayedTodaySec: number;
}

export interface PlaybackLog {
    id: string;
    mediaId: string;
    mediaTitle: string;
    mediaType: string;
    playedAt: string;
    durationPlayed: number;
    completed: boolean;
}

export interface PlaybackLogsResult {
    data: PlaybackLog[];
    total: number;
}

const contentHistoryApi = {
    getDevices: (): Promise<ContentDevice[]> =>
        apiClient.get('/content-history/devices').then(r => r.data),

    getDeviceLogs: (
        deviceId: string,
        params?: { search?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }
    ): Promise<PlaybackLogsResult> =>
        apiClient.get(`/content-history/devices/${deviceId}/logs`, { params }).then(r => r.data),
};

export default contentHistoryApi;
