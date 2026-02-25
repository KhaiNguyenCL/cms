import apiClient from './client';
import type { ApiResponse, PaginatedResponse, Playlist, PlaylistItem } from '@/types';

export const playlistsApi = {
    list: async (params: { page?: number; limit?: number; search?: string } = {}) => {
        const { data } = await apiClient.get<PaginatedResponse<Playlist>>('/playlists', { params });
        return data;
    },

    get: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<Playlist & { items: PlaylistItem[] }>>(`/playlists/${id}`);
        return data.data;
    },

    create: async (payload: { name: string; description?: string; isDefault?: boolean }) => {
        const { data } = await apiClient.post<ApiResponse<Playlist>>('/playlists', payload);
        return data.data;
    },

    update: async (id: string, payload: Partial<Playlist>) => {
        const { data } = await apiClient.patch<ApiResponse<Playlist>>(`/playlists/${id}`, payload);
        return data.data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/playlists/${id}`);
    },

    addItem: async (playlistId: string, mediaId: string, durationOverride?: number) => {
        const { data } = await apiClient.post<ApiResponse<PlaylistItem>>(
            `/playlists/${playlistId}/items`, { mediaId, durationOverride }
        );
        return data.data;
    },

    removeItem: async (playlistId: string, itemId: string) => {
        await apiClient.delete(`/playlists/${playlistId}/items/${itemId}`);
    },

    reorderItems: async (playlistId: string, items: { itemId: string; position: number }[]) => {
        const { data } = await apiClient.put<ApiResponse<null>>(
            `/playlists/${playlistId}/items/reorder`, { items }
        );
        return data;
    },
};
