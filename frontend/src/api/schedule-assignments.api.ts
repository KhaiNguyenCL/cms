import apiClient from './client';

export interface ScheduleAssignment {
    id: string;
    organizationId: string;
    scheduleId: string;
    scheduleName: string;
    scheduleStartTime: string | null;
    scheduleEndTime: string | null;
    scheduleDaysOfWeek: number[];
    scheduleStartDate: string | null;
    scheduleEndDate: string | null;
    scheduleIsActive: boolean;
    targetType: 'DEVICE' | 'SITE';
    targetId: string;
    targetName: string | null;
    assignedById: string | null;
    assignedAt: string;
    sortOrder: number;
}

export interface AssignTarget {
    targetType: 'DEVICE' | 'SITE';
    targetId: string;
}

export const scheduleAssignmentsApi = {
    list: (params?: { targetType?: string; targetId?: string; scheduleId?: string; siteId?: string }) =>
        apiClient.get<{ data: ScheduleAssignment[] }>('/schedule-assignments', { params })
            .then(r => r.data.data),

    bulkAssign: (scheduleId: string, targets: AssignTarget[]) =>
        apiClient.post<{ created: number; skipped: number }>('/schedule-assignments/bulk', { scheduleId, targets })
            .then(r => r.data),

    unassignOne: (id: string) =>
        apiClient.delete(`/schedule-assignments/${id}`).then(r => r.data),

    bulkUnassign: (ids: string[]) =>
        apiClient.delete<{ deleted: number }>('/schedule-assignments/bulk', { data: { ids } })
            .then(r => r.data),

    reorder: (targetType: 'DEVICE' | 'SITE', targetId: string, orderedIds: string[]) =>
        apiClient.put<{ success: boolean }>('/schedule-assignments/reorder', { targetType, targetId, orderedIds })
            .then(r => r.data),
};
