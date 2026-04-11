import apiClient from './client';

export interface StorageUsage {
    storageBaseMb: number;
    ext50mb: number;
    ext100mb: number;
    ext200mb: number;
    totalQuotaMb: number;
    usedBytes: number;
    usedMb: number;
    totalQuotaBytes: number;
    percentUsed: number;
}

export interface StoragePurchaseRequest {
    id: string;
    organizationId: string;
    orgName: string;
    packageMb: 50 | 100 | 200;
    quantity: number;
    totalMb: number;
    status: 'PENDING' | 'APPROVED' | 'REJECTED';
    note: string | null;
    adminNote: string | null;
    requestedById: string | null;
    requestedByName: string | null;
    resolvedById: string | null;
    resolvedAt: string | null;
    createdAt: string;
}

export interface OrgStorageStat {
    id: string;
    name: string;
    slug: string;
    storageBaseMb: number;
    ext50mb: number;
    ext100mb: number;
    ext200mb: number;
    totalQuotaMb: number;
    usedBytes: number;
    pendingRequests: number;
}

export interface AdjustPoolPayload {
    storageBaseMb?: number;
    delta50mb?: number;
    delta100mb?: number;
    delta200mb?: number;
    note?: string;
}

export const storageQuotaApi = {
    // Org-facing
    getUsage: async (): Promise<StorageUsage> => {
        const { data } = await apiClient.get<{ success: true; data: StorageUsage }>('/storage-quota/usage');
        return data.data;
    },
    listOwnRequests: async (): Promise<StoragePurchaseRequest[]> => {
        const { data } = await apiClient.get<{ success: true; data: StoragePurchaseRequest[] }>('/storage-quota/purchase-requests');
        return data.data;
    },
    createRequest: async (payload: { packageMb: 50 | 100 | 200; quantity: number; note?: string }): Promise<StoragePurchaseRequest> => {
        const { data } = await apiClient.post<{ success: true; data: StoragePurchaseRequest }>('/storage-quota/purchase-requests', payload);
        return data.data;
    },

    // Platform admin only (requires platform admin auth)
    getAllOrgStats: async (): Promise<OrgStorageStat[]> => {
        const { data } = await apiClient.get<{ success: true; data: OrgStorageStat[] }>('/platform/storage/orgs');
        return data.data;
    },
    adjustPool: async (orgId: string, payload: AdjustPoolPayload): Promise<void> => {
        await apiClient.patch(`/platform/storage/orgs/${orgId}/pool`, payload);
    },

    // SUPER_ADMIN routes (regular JWT auth)
    listAllRequests: async (status?: string): Promise<StoragePurchaseRequest[]> => {
        const { data } = await apiClient.get<{ success: true; data: StoragePurchaseRequest[] }>('/storage-quota/admin/purchase-requests', {
            params: status ? { status } : undefined,
        });
        return data.data;
    },
    approveRequest: async (id: string, adminNote?: string): Promise<StoragePurchaseRequest> => {
        const { data } = await apiClient.post<{ success: true; data: StoragePurchaseRequest }>(`/storage-quota/admin/purchase-requests/${id}/approve`, { adminNote });
        return data.data;
    },
    rejectRequest: async (id: string, adminNote?: string): Promise<StoragePurchaseRequest> => {
        const { data } = await apiClient.post<{ success: true; data: StoragePurchaseRequest }>(`/storage-quota/admin/purchase-requests/${id}/reject`, { adminNote });
        return data.data;
    },
};
