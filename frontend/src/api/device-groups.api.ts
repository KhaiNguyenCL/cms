import apiClient from './client';
import type { ApiResponse, PaginatedResponse } from '@/types';

export interface DeviceGroup {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    deviceCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface DeviceGroupDetail extends DeviceGroup {
    devices: GroupDevice[];
}

export interface GroupDevice {
    id: string;
    name: string;
    status: 'ONLINE' | 'OFFLINE' | 'ERROR';
    location: string | null;
    model: string | null;
    lastSeen: string | null;
}

export const deviceGroupsApi = {
    list: async (params: { page?: number; limit?: number; search?: string } = {}) => {
        const { data } = await apiClient.get<PaginatedResponse<DeviceGroup>>('/device-groups', { params });
        return data;
    },

    listAll: async () => {
        const { data } = await apiClient.get<PaginatedResponse<DeviceGroup>>('/device-groups', { params: { limit: 100 } });
        return data.data;
    },

    get: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<DeviceGroupDetail>>(`/device-groups/${id}`);
        return data.data;
    },

    create: async (payload: { name: string; description?: string | null }) => {
        const { data } = await apiClient.post<ApiResponse<DeviceGroup>>('/device-groups', payload);
        return data.data;
    },

    update: async (id: string, payload: { name?: string; description?: string | null }) => {
        const { data } = await apiClient.put<ApiResponse<DeviceGroup>>(`/device-groups/${id}`, payload);
        return data.data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/device-groups/${id}`);
    },

    addDevice: async (groupId: string, deviceId: string) => {
        await apiClient.post(`/device-groups/${groupId}/devices`, { deviceId });
    },

    removeDevice: async (groupId: string, deviceId: string) => {
        await apiClient.delete(`/device-groups/${groupId}/devices/${deviceId}`);
    },
};
