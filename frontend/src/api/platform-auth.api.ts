import { apiClient } from './client';

export interface PlatformAdmin {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export const platformAuthApi = {
    login: async (email: string, password: string) => {
        const { data } = await apiClient.post<{ data: { accessToken: string; admin: PlatformAdmin } }>(
            '/platform/login', { email, password }
        );
        return data.data;
    },

    refresh: async () => {
        const { data } = await apiClient.post<{ data: { accessToken: string; admin: PlatformAdmin } }>(
            '/platform/refresh'
        );
        return data.data;
    },

    logout: async () => {
        await apiClient.post('/platform/logout');
    },

    listAdmins: async () => {
        const { data } = await apiClient.get<{ data: PlatformAdmin[] }>('/platform/admins');
        return data.data;
    },

    createAdmin: async (payload: { email: string; password: string; name: string }) => {
        const { data } = await apiClient.post<{ data: PlatformAdmin }>('/platform/admins', payload);
        return data.data;
    },

    updateAdmin: async (id: string, payload: { name?: string; password?: string; isActive?: boolean }) => {
        const { data } = await apiClient.patch<{ data: PlatformAdmin }>(`/platform/admins/${id}`, payload);
        return data.data;
    },

    deleteAdmin: async (id: string) => {
        await apiClient.delete(`/platform/admins/${id}`);
    },
};
