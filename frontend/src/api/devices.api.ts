import apiClient from './client';
import type { ApiResponse, PaginatedResponse, Device, DeviceGroup } from '@/types';

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

    update: async (id: string, payload: Partial<Device>) => {
        const { data } = await apiClient.patch<ApiResponse<Device>>(`/devices/${id}`, payload);
        return data.data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/devices/${id}`);
    },

    sendCommand: async (id: string, command: string, params?: Record<string, unknown>) => {
        const { data } = await apiClient.post<ApiResponse<null>>(`/devices/${id}/command`, { command, params });
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
};
