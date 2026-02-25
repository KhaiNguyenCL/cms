/**
 * All API-facing TypeScript types — mirrors the backend response shapes.
 * Keep in sync with backend DTOs and DB schema.
 */

// ─── Common ───────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
    success: boolean;
    message?: string;
    data: T;
}

export interface PaginatedResponse<T> {
    success: boolean;
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface User {
    id: string;
    organizationId: string;
    email: string;
    role: 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER' | 'VIEWER';
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    createdAt: string;
    updatedAt: string;
}

export interface AuthTokens {
    accessToken: string;
    // refreshToken không có trong response body — server set qua HttpOnly cookie
}

// ─── Organization ─────────────────────────────────────────────────────────────

export interface Organization {
    id: string;
    name: string;
    slug: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    plan: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrgStats {
    totalDevices: number;
    onlineDevices: number;
    totalMedia: number;
    totalStorage: number;
    usedStorage: number;
    totalPlaylists: number;
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'ERROR';

export interface Device {
    id: string;
    organizationId: string;
    name: string;
    pairingCode: string | null;
    androidId: string | null;
    model: string | null;
    osVersion: string | null;
    appVersion: string | null;
    status: DeviceStatus;
    lastSeen: string | null;
    location: string | null;
    timezone: string;
    settings: Record<string, unknown> | null;
    createdAt: string;
    updatedAt: string;
}

export interface DeviceGroup {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    deviceCount?: number;
    createdAt: string;
}

// ─── Media ────────────────────────────────────────────────────────────────────

export type MediaType = 'IMAGE' | 'VIDEO' | 'WEBPAGE';
export type MediaStatus = 'PROCESSING' | 'READY' | 'ERROR';

export interface Media {
    id: string;
    organizationId: string;
    title: string;
    type: MediaType;
    status: MediaStatus;
    filePath: string;
    mimeType: string;
    fileSize: number;
    duration: number | null;
    width: number | null;
    height: number | null;
    thumbnailPath: string | null;
    tags: string[];
    createdAt: string;
    updatedAt: string;
    // Signed URLs — trả về từ API, có TTL 1 giờ
    signedUrl?: string;
    thumbnailUrl?: string | null;
}

// ─── Playlists ────────────────────────────────────────────────────────────────

export interface Playlist {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    itemCount?: number;
    createdAt: string;
    updatedAt: string;
}

export interface PlaylistItem {
    id: string;
    playlistId: string;
    mediaId: string;
    displayOrder: number;
    duration: number;
    media?: Pick<Media, 'id' | 'title' | 'type' | 'thumbnailPath' | 'duration'> & { thumbnailUrl?: string | null };
}

// ─── Schedules ────────────────────────────────────────────────────────────────

export type ScheduleTargetType = 'ALL' | 'DEVICE' | 'GROUP';

export interface Schedule {
    id: string;
    organizationId: string;
    name: string;
    playlistId: string;
    targetType: ScheduleTargetType;
    targetDeviceId: string | null;
    targetGroupId: string | null;
    startDate: string;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    daysOfWeek: number[];
    priority: number;
    isActive: boolean;
    // Joined from DB
    playlistName?: string;
    targetDeviceName?: string;
    targetGroupName?: string;
    createdAt: string;
    updatedAt: string;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
    devices: { total: number; online: number };
    users: { total: number; active: number };
    media: { count: number; totalSizeBytes: number };
    playlists: { total: number };
    schedules: { total: number; active: number };
    playback: { totalPlays: number; totalMinutes: number; completionRate: number };
    storage: { usedBytes: number; totalBytes: number };
}

export interface PlaybackStat {
    period: string;
    plays: number;
    completed: number;
    totalMinutes: number;
}

export interface TopContent {
    mediaId: string;
    title: string;
    type: string;
    plays: number;
    completed: number;
    totalMinutes: number;
}

export interface DeviceHealthStat {
    deviceId: string;
    deviceName: string;
    isOnline: boolean;
    cpuUsage: number;
    memoryUsage: number;
    storageUsed: number;
    storageTotal: number;
    storagePercent: number;
    networkType: string;
    reportedAt: string | null;
}

// ─── WebSocket events ─────────────────────────────────────────────────────────

export interface WsDeviceStatus {
    deviceId: string;
    status: DeviceStatus;
    cpuUsage?: number;
    memoryUsage?: number;
    timestamp: string;
}

export interface WsDeviceError {
    deviceId: string;
    code: string;
    message: string;
    timestamp: string;
}

export interface WsDevicePlayback {
    deviceId: string;
    mediaId: string;
    mediaTitle: string;
    startedAt: string;
    timestamp: string;
}
