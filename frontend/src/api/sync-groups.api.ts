import { apiClient } from './client';
import type { Store } from '@/types';

export interface StoresListResponse {
    data: Store[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export const storesApi = {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
        apiClient.get<{ data: StoresListResponse }>('/stores', { params })
            .then(r => r.data.data),

    get: (id: string) =>
        apiClient.get<{ data: Store }>(`/stores/${id}`)
            .then(r => r.data.data),

    create: (body: { name: string; description?: string; address?: string; contact?: string; openDate?: string; closeDate?: string; playlistId?: string }) =>
        apiClient.post<{ data: Store }>('/stores', body)
            .then(r => r.data.data),

    update: (id: string, body: { name?: string; description?: string | null; address?: string | null; contact?: string | null; openDate?: string | null; closeDate?: string | null; playlistId?: string | null }) =>
        apiClient.patch<{ data: Store }>(`/stores/${id}`, body)
            .then(r => r.data.data),

    delete: (id: string) =>
        apiClient.delete(`/stores/${id}`),

    // Playback controls
    start:   (id: string) => apiClient.post<{ data: { startEpoch: number; totalDurationMs: number } }>(`/stores/${id}/start`).then(r => r.data.data),
    restart: (id: string) => apiClient.post<{ data: { startEpoch: number; totalDurationMs: number } }>(`/stores/${id}/restart`).then(r => r.data.data),
    stop:    (id: string) => apiClient.post(`/stores/${id}/stop`),

    // Device assignment
    updateDevices: (id: string, body: { add?: string[]; remove?: string[] }) =>
        apiClient.patch<{ data: Store }>(`/stores/${id}/devices`, body)
            .then(r => r.data.data),
};
