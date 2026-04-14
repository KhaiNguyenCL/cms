import apiClient from './client';

export interface AppNotification {
    id: string;
    organizationId: string;
    type: string;
    title: string;
    body: string | null;
    entityId: string | null;
    entityType: string | null;
    read: boolean;
    createdAt: string;
}

export const NOTIF_META: Record<string, { labelKey: string; color: 'error' | 'warning' | 'info' | 'success' }> = {
    DEVICE_OFFLINE:           { labelKey: 'notifications.deviceOffline',           color: 'error' },
    DEVICE_ERROR:             { labelKey: 'notifications.deviceError',             color: 'error' },
    LICENSE_ASSIGNED:         { labelKey: 'notifications.licenseAssigned',         color: 'success' },
    LICENSE_EXPIRING:         { labelKey: 'notifications.licenseExpiring',         color: 'warning' },
    LICENSE_EXPIRED:          { labelKey: 'notifications.licenseExpired',          color: 'error' },
    LICENSE_REQUEST_APPROVED: { labelKey: 'notifications.licenseRequestApproved',  color: 'success' },
    LICENSE_REQUEST_REJECTED: { labelKey: 'notifications.licenseRequestRejected',  color: 'warning' },
    STORAGE_NEARLY_FULL:      { labelKey: 'notifications.storageNearlyFull',       color: 'warning' },
    STORAGE_FULL:             { labelKey: 'notifications.storageFull',             color: 'error' },
    STORAGE_REQUEST_NEW:      { labelKey: 'notifications.storageRequestNew',       color: 'info' },
    STORAGE_REQUEST_APPROVED: { labelKey: 'notifications.storageRequestApproved',  color: 'success' },
    STORAGE_REQUEST_REJECTED: { labelKey: 'notifications.storageRequestRejected',  color: 'warning' },
    LICENSE_REQUEST_NEW:      { labelKey: 'notifications.licenseRequestNew',       color: 'info' },
    MEDIA_READY:              { labelKey: 'notifications.mediaReady',              color: 'success' },
    MEDIA_ERROR:              { labelKey: 'notifications.mediaError',              color: 'error' },
    USER_CREATED:             { labelKey: 'notifications.userCreated',             color: 'info' },
};

export const notificationsApi = {
    list: async (params?: { limit?: number; unread?: boolean }) => {
        const { data } = await apiClient.get<{ success: true; data: AppNotification[]; unreadCount: number }>(
            '/notifications', { params });
        return data;
    },
    markRead: async (id: string) => {
        await apiClient.patch(`/notifications/${id}/read`);
    },
    markAllRead: async () => {
        await apiClient.post('/notifications/read-all');
    },
    delete: async (id: string) => {
        await apiClient.delete(`/notifications/${id}`);
    },
};
