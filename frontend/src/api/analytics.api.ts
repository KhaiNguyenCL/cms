import apiClient from './client';
import type {
    ApiResponse, AnalyticsOverview, PlaybackStat, TopContent, DeviceHealthStat,
} from '@/types';

export interface PieSlice { name: string; value: number; }
export interface DeviceCharts {
    status:    PieSlice[];
    schedule:  PieSlice[];
    model:     PieSlice[];
    version:   PieSlice[];
    osVersion: PieSlice[];
    license:   PieSlice[];
}

export interface CreationStat {
    period: string;
    devices: number;
    sites: number;
}

export interface TopPlaylist {
    playlistId: string; name: string;
    plays: number; completed: number; totalMinutes: number;
}
export interface TopSchedule {
    scheduleId: string; name: string;
    plays: number; completed: number; totalMinutes: number;
}

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

    topPlaylists: async (params: { startDate?: string; endDate?: string; limit?: number } = {}) => {
        const { data } = await apiClient.get<ApiResponse<TopPlaylist[]>>('/analytics/top-playlists', { params });
        return data.data;
    },

    topSchedules: async (params: { startDate?: string; endDate?: string; limit?: number } = {}) => {
        const { data } = await apiClient.get<ApiResponse<TopSchedule[]>>('/analytics/top-schedules', { params });
        return data.data;
    },

    deviceHealth: async () => {
        const { data } = await apiClient.get<ApiResponse<DeviceHealthStat[]>>('/analytics/device-health');
        return data.data;
    },

    deviceCharts: async () => {
        const { data } = await apiClient.get<ApiResponse<DeviceCharts>>('/analytics/device-charts');
        return data.data;
    },

    creationStats: async (params: { startDate?: string; endDate?: string; groupBy?: 'day' | 'week' | 'month' } = {}) => {
        const { data } = await apiClient.get<ApiResponse<CreationStat[]>>('/analytics/creation-stats', { params });
        return data.data;
    },
};
