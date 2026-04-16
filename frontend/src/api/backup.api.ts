import apiClient from './client';
import type { ApiResponse, OrgBackup, OrgBackupPlan, BackupPlanRequest } from '@/types';

export const backupApi = {
    list: async () => {
        const { data } = await apiClient.get<ApiResponse<OrgBackup[]>>('/backup');
        return data.data;
    },

    create: async (label?: string) => {
        const { data } = await apiClient.post<ApiResponse<OrgBackup>>('/backup', { label });
        return data.data;
    },

    delete: async (id: string) => {
        await apiClient.delete(`/backup/${id}`);
    },

    restore: async (id: string) => {
        const { data } = await apiClient.post<{ success: boolean; message: string }>(`/backup/${id}/restore`);
        return data;
    },

    // ─── Backup Plan ─────────────────────────────────────────────────────────
    getPlan: async () => {
        const { data } = await apiClient.get<ApiResponse<OrgBackupPlan>>('/backup/plan');
        return data.data;
    },

    requestPlan: async (requestedPlan: number, note?: string) => {
        const { data } = await apiClient.post<ApiResponse<BackupPlanRequest>>('/backup/plan/request', { requestedPlan, note });
        return data.data;
    },

    // ─── Super Admin ──────────────────────────────────────────────────────────
    listPlanRequests: async (status?: string) => {
        const { data } = await apiClient.get<ApiResponse<BackupPlanRequest[]>>('/backup/plan/requests', {
            params: status ? { status } : {},
        });
        return data.data;
    },

    approvePlanRequest: async (id: string, adminNote?: string) => {
        const { data } = await apiClient.post<ApiResponse<BackupPlanRequest>>(`/backup/plan/requests/${id}/approve`, { adminNote });
        return data.data;
    },

    rejectPlanRequest: async (id: string, adminNote?: string) => {
        const { data } = await apiClient.post<ApiResponse<BackupPlanRequest>>(`/backup/plan/requests/${id}/reject`, { adminNote });
        return data.data;
    },
};
