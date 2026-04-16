import apiClient from './client';
import type { ApiResponse, PaginatedResponse, Media } from '@/types';

export interface ListMediaQuery {
    page?: number;
    limit?: number;
    search?: string;
    type?: string;
    status?: string;
}

export const mediaApi = {
    list: async (params: ListMediaQuery = {}) => {
        const { data } = await apiClient.get<PaginatedResponse<Media>>('/media', { params });
        return data;
    },

    get: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<Media>>(`/media/${id}`);
        return data.data;
    },

    upload: async (file: File, title: string, onProgress?: (pct: number) => void, duration?: number) => {
        const form = new FormData();
        form.append('file', file);
        form.append('title', title);
        if (duration != null && duration > 0) form.append('duration', String(duration));
        const { data } = await apiClient.post<ApiResponse<Media>>('/media/upload', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (e) => {
                if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
            },
        });
        return data.data;
    },

    update: async (id: string, payload: { title?: string; tags?: string[] }) => {
        const { data } = await apiClient.put<ApiResponse<Media>>(`/media/${id}`, payload);
        return data.data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/media/${id}`);
    },

    listTrash: async () => {
        const { data } = await apiClient.get<{ success: boolean; data: Media[] }>('/media/trash');
        return data.data;
    },

    restore: async (id: string) => {
        const { data } = await apiClient.post<ApiResponse<Media>>(`/media/${id}/restore`);
        return data.data;
    },

    permanentDelete: async (id: string) => {
        await apiClient.delete(`/media/${id}/permanent`);
    },

    getThumbnailUrl: (thumbnailPath: string | null | undefined) => {
        if (!thumbnailPath) return null;
        return `/api/media/thumbnail/${thumbnailPath.split('/').pop()}`;
    },
};
