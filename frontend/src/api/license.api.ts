import apiClient from './client';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PackageType   = '12M' | '24M' | '36M';
export type LicenseAction = 'ASSIGN' | 'TRANSFER' | 'ADJUST_EXPIRY' | 'REVOKE' | 'EDIT_POOL';
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface OrgPool {
    pkg12m: number;
    pkg24m: number;
    pkg36m: number;
}

export interface DeviceLicenseRow {
    deviceId: string;
    deviceName: string;
    deviceStatus: string;
    isLicensed: boolean;
    packageType: PackageType | null;
    activatedAt: string | null;
    expiresAt: string | null;
    activatedByName: string | null;
    transferredFromDeviceName: string | null;
    daysRemaining: number | null;
}

export interface LicenseHistoryRow {
    id: string;
    deviceId: string | null;
    deviceName: string | null;
    organizationId: string;
    action: LicenseAction;
    detail: Record<string, unknown> | null;
    performedByName: string | null;
    createdAt: string;
}

export interface PurchaseRequestRow {
    id: string;
    organizationId: string;
    orgName: string | null;
    requestedByName: string | null;
    packageType: PackageType;
    quantity: number;
    status: RequestStatus;
    note: string | null;
    adminNote: string | null;
    resolvedAt: string | null;
    createdAt: string;
}

export interface PoolBatch {
    id: string;
    createdAt: string;
    performedByName: string | null;
    delta: { pkg12m?: number; pkg24m?: number; pkg36m?: number };
    source: string | null;
}

export interface OrgDetailData {
    devices: DeviceLicenseRow[];
    poolBatches: PoolBatch[];
    licenseHistory: LicenseHistoryRow[];
    pool: OrgPool;
}

export interface OrgPoolRow extends OrgPool {
    id: string;
    name: string;
    slug: string;
    totalDevices: number;
    licensedDevices: number;
    expiringIn7: number;
}

export interface LicenseStats {
    pool: OrgPool;
    totalDevices: number;
    activeDevices: number;
    expiredDevices: number;
    unlicensedDevices: number;
    expiringIn7: number;
    expiringIn30: number;
}

// ─── API ──────────────────────────────────────────────────────────────────────

const licenseApi = {
    getStats: () =>
        apiClient.get<{ success: boolean; data: LicenseStats }>('/license/stats')
            .then(r => r.data.data),

    getPool: () =>
        apiClient.get<{ success: boolean; data: OrgPool }>('/license/pool')
            .then(r => r.data.data),

    getDeviceLicenses: () =>
        apiClient.get<{ success: boolean; data: DeviceLicenseRow[] }>('/license/devices')
            .then(r => r.data.data),

    assignLicense: (deviceId: string, packageType: PackageType) =>
        apiClient.post('/license/assign', { deviceId, packageType }).then(r => r.data),

    transferLicense: (fromDeviceId: string, toDeviceId: string) =>
        apiClient.post('/license/transfer', { fromDeviceId, toDeviceId }).then(r => r.data),

    adjustExpiry: (deviceId: string, newExpiresAt: string) =>
        apiClient.post('/license/adjust-expiry', { deviceId, newExpiresAt }).then(r => r.data),

    revokeLicense: (deviceId: string) =>
        apiClient.delete(`/license/revoke/${deviceId}`).then(r => r.data),

    getHistory: (limit = 100, deviceId?: string) =>
        apiClient.get<{ success: boolean; data: LicenseHistoryRow[] }>(
            `/license/history?limit=${limit}${deviceId ? `&deviceId=${encodeURIComponent(deviceId)}` : ''}`,
        ).then(r => r.data.data),

    getPurchaseRequests: () =>
        apiClient.get<{ success: boolean; data: PurchaseRequestRow[] }>('/license/requests')
            .then(r => r.data.data),

    createPurchaseRequest: (body: { packageType: PackageType; quantity: number; note?: string }) =>
        apiClient.post<{ success: boolean; data: PurchaseRequestRow }>('/license/requests', body)
            .then(r => r.data.data),

    approvePurchaseRequest: (id: string, adminNote?: string) =>
        apiClient.post(`/license/requests/${id}/approve`, { adminNote }).then(r => r.data),

    rejectPurchaseRequest: (id: string, adminNote?: string) =>
        apiClient.post(`/license/requests/${id}/reject`, { adminNote }).then(r => r.data),

    // SUPER_ADMIN
    getOrgDetail: (orgId: string) =>
        apiClient.get<{ success: boolean; data: OrgDetailData }>(`/license/admin/orgs/${orgId}/detail`)
            .then(r => r.data.data),

    getAllOrgPools: () =>
        apiClient.get<{ success: boolean; data: OrgPoolRow[] }>('/license/admin/orgs')
            .then(r => r.data.data),

    updateOrgPool: (orgId: string, delta: Partial<OrgPool>) =>
        apiClient.patch<{ success: boolean; data: OrgPool }>(`/license/admin/orgs/${orgId}/pool`, delta)
            .then(r => r.data.data),

    adminTransferLicense: (orgId: string, fromDeviceId: string, toDeviceId: string) =>
        apiClient.post(`/license/admin/orgs/${orgId}/transfer`, { fromDeviceId, toDeviceId }).then(r => r.data),

    adminRevokeLicense: (orgId: string, deviceId: string) =>
        apiClient.delete(`/license/admin/orgs/${orgId}/revoke/${deviceId}`).then(r => r.data),

    adminAdjustExpiry: (orgId: string, deviceId: string, newExpiresAt: string) =>
        apiClient.post(`/license/admin/orgs/${orgId}/adjust-expiry`, { deviceId, newExpiresAt }).then(r => r.data),
};

export default licenseApi;
