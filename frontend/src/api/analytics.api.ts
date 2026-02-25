import apiClient from './client';
import type {
    ApiResponse, AnalyticsOverview, PlaybackStat, TopContent, DeviceHealthStat,
} from '@/types';

export const analyticsApi = {
    overview: async (params: { startDate?: string; endDate?: string } = {}) => {
        const { data } = await apiClient.get<ApiResponse<AnalyticsOverview>>('/analytics/overview', { params });
        return data.data;
    },

    playbackStats: async (params: { startDate?: string; endDate?: string; groupBy?: 'day' | 'week' | 'month' } = {}) => {
        const { data } = await apiClient.get<ApiResponse<PlaybackStat[]>>('/analytics/playback', { params });
        return data.data;
    },

    topContent: async (params: { startDate?: string; endDate?: string; limit?: number } = {}) => {
        const { data } = await apiClient.get<ApiResponse<TopContent[]>>('/analytics/top-content', { params });
        return data.data;
    },

    deviceHealth: async () => {
        const { data } = await apiClient.get<ApiResponse<DeviceHealthStat[]>>('/analytics/device-health');
        return data.data;
    },
};
