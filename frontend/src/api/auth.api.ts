import apiClient from './client';
import type { ApiResponse, AuthTokens, User } from '@/types';

export interface RegisterPayload {
    organizationName: string;
    organizationSlug: string;
    email: string;
    password: string;
}

export const authApi = {
    register: async (payload: RegisterPayload) => {
        const { data } = await apiClient.post<ApiResponse<AuthTokens & { user: User }>>('/auth/register', payload);
        return data.data;
    },

    login: async (email: string, password: string) => {
        const { data } = await apiClient.post<ApiResponse<AuthTokens & { user: User }>>('/auth/login', { email, password });
        return data.data;
    },

    logout: async () => {
        // Refresh token nằm trong HttpOnly cookie — backend tự đọc để revoke
        await apiClient.post('/auth/logout', {});
    },

    refresh: async () => {
        // Không cần body — HttpOnly cookie được gửi tự động nhờ withCredentials: true
        const { data } = await apiClient.post<ApiResponse<{ accessToken: string; user: User }>>(
            '/auth/refresh-token',
            {}
        );
        return data.data;
    },

    getMe: async () => {
        const { data } = await apiClient.get<ApiResponse<User>>('/auth/me');
        return data.data;
    },

    forgotPassword: async (email: string) => {
        const { data } = await apiClient.post<ApiResponse<null>>('/auth/forgot-password', { email });
        return data;
    },

    resetPassword: async (token: string, password: string) => {
        const { data } = await apiClient.post<ApiResponse<null>>('/auth/reset-password', { token, password });
        return data;
    },
};
