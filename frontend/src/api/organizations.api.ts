import apiClient from './client';
import type { ApiResponse } from '@/types';

export interface Organization {
    id: string;
    name: string;
    slug: string;
    settings: Record<string, unknown>;
    isActive: boolean;
    pkg12m: number;
    pkg24m: number;
    pkg36m: number;
    createdAt: string;
    updatedAt: string;
}


export interface OrgStats {
    totalUsers: number;
    activeUsers: number;
    totalDevices: number;
    onlineDevices: number;
    totalMedia: number;
    totalMediaSizeBytes: number;
    totalPlaylists: number;
    totalSchedules: number;
}

export interface OrgWithStats extends Organization, OrgStats {
    licensedDevices: number;
}

export const organizationsApi = {
    getMe: async () => {
        const { data } = await apiClient.get<ApiResponse<Organization>>('/organizations/me');
        return data.data;
    },

    updateMe: async (payload: { name?: string; settings?: Record<string, unknown> }) => {
        const { data } = await apiClient.put<ApiResponse<Organization>>('/organizations/me', payload);
        return data.data;
    },

    getStats: async () => {
        const { data } = await apiClient.get<ApiResponse<OrgStats>>('/organizations/me/stats');
        return data.data;
    },

    // ── SUPER_ADMIN only ──────────────────────────────────────────────────────

    listAll: async () => {
        const { data } = await apiClient.get<ApiResponse<OrgWithStats[]>>('/organizations/all');
        return data.data;
    },

    setStatus: async (id: string, isActive: boolean) => {
        const { data } = await apiClient.patch<ApiResponse<Organization>>(`/organizations/${id}/status`, { isActive });
        return data.data;
    },



    updateDevicePin: async (pin: string) => {
        const { data } = await apiClient.patch<ApiResponse<null>>('/organizations/me/device-pin', { pin });
        return data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/organizations/${id}`);
    },
};
