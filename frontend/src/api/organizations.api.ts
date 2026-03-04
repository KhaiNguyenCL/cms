import apiClient from './client';
import type { ApiResponse } from '@/types';

export interface Organization {
    id: string;
    name: string;
    slug: string;
    settings: Record<string, unknown>;
    isActive: boolean;
    pointsTotal: number;
    pointsUsed: number;
    licenseStatus: string;
    suspendedAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface LicenseTransaction {
    id: string;
    organizationId: string;
    type: string;
    points: number;
    deviceCount: number | null;
    description: string | null;
    createdById: string | null;
    createdAt: string;
}

export interface LicenseInfo {
    pointsTotal: number;
    pointsUsed: number;
    pointsRemaining: number;
    licenseStatus: string;
    suspendedAt: string | null;
    licensedDevices: number;
    daysRemaining: number;
    recentTransactions: LicenseTransaction[];
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
    pointsRemaining: number;
    daysRemaining: number;
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


    getLicenseInfo: async () => {
        const { data } = await apiClient.get<ApiResponse<LicenseInfo>>('/organizations/me/license');
        return data.data;
    },

    getOrgLicenseInfo: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<LicenseInfo>>(`/organizations/${id}/license`);
        return data.data;
    },

    addPoints: async (id: string, payload: { points: number; type?: string; description: string }) => {
        const { data } = await apiClient.post<ApiResponse<LicenseInfo>>(`/organizations/${id}/license/add-points`, payload);
        return data.data;
    },

    updateDevicePin: async (pin: string) => {
        const { data } = await apiClient.patch<ApiResponse<null>>('/organizations/me/device-pin', { pin });
        return data;
    },
};
