import apiClient from './client';
import type { ApiResponse, PaginatedResponse, User } from '@/types';

export interface ListUsersParams {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    status?: string;
}

export interface CreateUserPayload {
    email: string;
    password: string;
    role: 'ADMIN' | 'MANAGER' | 'VIEWER' | 'CONTENT_MANAGER' | 'SITE_MANAGER';
    siteId?: string | null;
}

export interface UpdateUserPayload {
    email?: string;
    password?: string;
    role?: 'ADMIN' | 'MANAGER' | 'VIEWER' | 'CONTENT_MANAGER' | 'SITE_MANAGER';
    status?: 'ACTIVE' | 'INACTIVE';
    siteId?: string | null;
}

export const usersApi = {
    list: async (params: ListUsersParams = {}) => {
        const { data } = await apiClient.get<PaginatedResponse<User>>('/users', { params });
        return data;
    },

    get: async (id: string) => {
        const { data } = await apiClient.get<ApiResponse<User>>(`/users/${id}`);
        return data.data;
    },

    create: async (payload: CreateUserPayload) => {
        const { data } = await apiClient.post<ApiResponse<User>>('/users', payload);
        return data.data;
    },

    update: async (id: string, payload: UpdateUserPayload) => {
        const { data } = await apiClient.put<ApiResponse<User>>(`/users/${id}`, payload);
        return data.data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/users/${id}`);
    },

    hardDelete: async (id: string) => {
        await apiClient.delete(`/users/${id}/permanent`);
    },
};
