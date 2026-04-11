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

export const NOTIF_META: Record<string, { label: string; color: 'error' | 'warning' | 'info' | 'success' }> = {
    DEVICE_OFFLINE:           { label: 'Thiết bị offline',         color: 'error' },
    DEVICE_ERROR:             { label: 'Thiết bị lỗi',             color: 'error' },
    LICENSE_ASSIGNED:         { label: 'License đã cấp',           color: 'success' },
    LICENSE_EXPIRING:         { label: 'License sắp hết hạn',      color: 'warning' },
    LICENSE_EXPIRED:          { label: 'License đã hết hạn',       color: 'error' },
    LICENSE_REQUEST_APPROVED: { label: 'Yêu cầu license đã duyệt', color: 'success' },
    LICENSE_REQUEST_REJECTED: { label: 'Yêu cầu license từ chối',  color: 'warning' },
    STORAGE_NEARLY_FULL:      { label: 'Dung lượng sắp đầy',       color: 'warning' },
    STORAGE_FULL:             { label: 'Dung lượng đã đầy',        color: 'error' },
    STORAGE_REQUEST_NEW:      { label: 'Yêu cầu storage mới',      color: 'info' },
    STORAGE_REQUEST_APPROVED: { label: 'Yêu cầu storage đã duyệt', color: 'success' },
    STORAGE_REQUEST_REJECTED: { label: 'Yêu cầu storage từ chối',  color: 'warning' },
    LICENSE_REQUEST_NEW:      { label: 'Yêu cầu license mới',      color: 'info' },
    MEDIA_READY:              { label: 'Video xử lý xong',         color: 'success' },
    MEDIA_ERROR:              { label: 'Video xử lý lỗi',          color: 'error' },
    USER_CREATED:             { label: 'Người dùng mới',           color: 'info' },
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
