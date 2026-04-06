import apiClient from './client';

export type ActionType   = 'CREATE' | 'UPDATE' | 'DELETE';
export type ResourceType = 'DEVICE' | 'MEDIA' | 'PLAYLIST' | 'SCHEDULE' | 'USER' | 'STORE' | 'VERSION';

export interface ActionLog {
    id: string;
    organizationId: string;
    userId: string | null;
    userEmail: string | null;
    action: ActionType;
    resourceType: ResourceType;
    resourceId: string | null;
    resourceName: string | null;
    detail: Record<string, unknown> | null;
    occurredAt: string;
}

export interface ActionLogsResult {
    data: ActionLog[];
    total: number;
}

export interface ActionActor {
    userId: string;
    userEmail: string;
}

export interface ListActionLogsParams {
    userId?: string;
    action?: ActionType;
    resourceType?: ResourceType;
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
    offset?: number;
}

const actionHistoryApi = {
    getLogs: (params?: ListActionLogsParams): Promise<ActionLogsResult> =>
        apiClient.get('/action-history/logs', { params }).then(r => r.data),

    getActors: (): Promise<ActionActor[]> =>
        apiClient.get('/action-history/actors').then(r => r.data),
};

export default actionHistoryApi;
