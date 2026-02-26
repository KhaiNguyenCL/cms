import apiClient from './client';
import type { ApiResponse, PaginatedResponse, Schedule } from '@/types';

export interface CreateSchedulePayload {
    name: string;
    playlistId?: string;
    mediaId?: string;
    targetType?: 'ALL' | 'DEVICE' | 'GROUP';
    targetDeviceId?: string | null;
    targetGroupId?: string | null;
    startDate: string;
    endDate?: string | null;
    startTime?: string | null;
    endTime?: string | null;
    daysOfWeek?: number[];
    priority?: number;
    isActive?: boolean;
}

export const schedulesApi = {
    list: async (params: { page?: number; limit?: number; search?: string; isActive?: boolean; targetType?: string } = {}) => {
        const query: Record<string, unknown> = { ...params };
        if (params.isActive !== undefined) query.isActive = String(params.isActive);
        const { data } = await apiClient.get<PaginatedResponse<Schedule>>('/schedules', { params: query });
        return data;
    },

    get: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<Schedule>>(`/schedules/${id}`);
        return data.data;
    },

    create: async (payload: CreateSchedulePayload) => {
        const { data } = await apiClient.post<ApiResponse<Schedule>>('/schedules', payload);
        return data.data;
    },

    update: async (id: string, payload: Partial<CreateSchedulePayload>) => {
        const { data } = await apiClient.put<ApiResponse<Schedule>>(`/schedules/${id}`, payload);
        return data.data;
    },

    toggleActive: async (id: string, isActive: boolean) => {
        const { data } = await apiClient.put<ApiResponse<Schedule>>(`/schedules/${id}`, { isActive });
        return data.data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/schedules/${id}`);
    },
};
