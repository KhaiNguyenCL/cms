import apiClient from './client';
import type { ApiResponse, PaginatedResponse, Device, DeviceGroup, DeviceHealth, NowPlaying, DeviceComment } from '@/types';

export interface ListDevicesQuery {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    groupId?: string;
}

export const devicesApi = {
    list: async (params: ListDevicesQuery = {}) => {
        const { data } = await apiClient.get<PaginatedResponse<Device>>('/devices', { params });
        return data;
    },

    get: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<Device>>(`/devices/${id}`);
        return data.data;
    },

    create: async (payload: { name: string; location?: string; timezone?: string }) => {
        const { data } = await apiClient.post<ApiResponse<Device>>('/devices', payload);
        return data.data;
    },

    update: async (id: string, payload: {
        name?: string;
        location?: string | null;
        timezone?: string;
        status?: string;
        licenseStartDate?: string | null;
        licenseEndDate?: string | null;
    }) => {
        const { data } = await apiClient.patch<ApiResponse<Device>>(`/devices/${id}`, payload);
        return data.data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/devices/${id}`);
    },

    reset: async (id: string) => {
        const { data } = await apiClient.post<{ success: boolean; data: { pairingCode: string } }>(`/devices/${id}/reset`);
        return data.data;
    },

    sendCommand: async (id: string, command: string, payload?: Record<string, unknown>) => {
        const { data } = await apiClient.post<ApiResponse<null>>(`/devices/${id}/command`, { command, payload });
        return data;
    },

    // Groups
    listGroups: async () => {
        const { data } = await apiClient.get<ApiResponse<DeviceGroup[]>>('/device-groups');
        return data.data;
    },

    createGroup: async (payload: { name: string; description?: string }) => {
        const { data } = await apiClient.post<ApiResponse<DeviceGroup>>('/device-groups', payload);
        return data.data;
    },

    addToGroup: async (groupId: string, deviceIds: string[]) => {
        const { data } = await apiClient.post<ApiResponse<null>>(`/device-groups/${groupId}/members`, { deviceIds });
        return data;
    },


    setLicense: async (id: string, isLicensed: boolean) => {
        const { data } = await apiClient.patch<ApiResponse<null>>(`/devices/${id}/license`, { isLicensed });
        return data;
    },

    getHealth: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<DeviceHealth | null>>(`/devices/${id}/health`);
        return data.data;
    },

    getNowPlaying: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<NowPlaying | null>>(`/devices/${id}/now-playing`);
        return data.data;
    },

    getComments: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<DeviceComment[]>>(`/devices/${id}/comments`);
        return data.data;
    },

    addComment: async (id: string, comment: string, userName?: string) => {
        const { data } = await apiClient.post<ApiResponse<DeviceComment>>(`/devices/${id}/comments`, { comment, userName });
        return data.data;
    },
};
