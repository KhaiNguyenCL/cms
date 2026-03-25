import { apiClient } from './client';
import type { Site } from '@/types';

export interface SitesListResponse {
    data: Site[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export const sitesApi = {
    list: (params?: { page?: number; limit?: number; search?: string }) =>
        apiClient.get<{ data: SitesListResponse }>('/sites', { params })
            .then(r => r.data.data),

    get: (id: string) =>
        apiClient.get<{ data: Site }>(`/sites/${id}`)
            .then(r => r.data.data),

    create: (body: { name: string; description?: string; address?: string; contact?: string; timezone?: string; timeOn?: string; timeOff?: string; deployDate?: string; endDate?: string; playlistId?: string }) =>
        apiClient.post<{ data: Site }>('/sites', body)
            .then(r => r.data.data),

    update: (id: string, body: { name?: string; description?: string | null; address?: string | null; contact?: string | null; timezone?: string | null; timeOn?: string | null; timeOff?: string | null; deployDate?: string | null; endDate?: string | null; playlistId?: string | null }) =>
        apiClient.patch<{ data: Site }>(`/sites/${id}`, body)
            .then(r => r.data.data),

    delete: (id: string) =>
        apiClient.delete(`/sites/${id}`),

    // Playback controls
    start:   (id: string) => apiClient.post<{ data: { startEpoch: number; totalDurationMs: number } }>(`/sites/${id}/start`).then(r => r.data.data),
    restart: (id: string) => apiClient.post<{ data: { startEpoch: number; totalDurationMs: number } }>(`/sites/${id}/restart`).then(r => r.data.data),
    stop:    (id: string) => apiClient.post(`/sites/${id}/stop`),

    // Device assignment
    updateDevices: (id: string, body: { add?: string[]; remove?: string[]; forceTransfer?: boolean }) =>
        apiClient.patch<{ data: Site }>(`/sites/${id}/devices`, body)
            .then(r => r.data.data),
};
