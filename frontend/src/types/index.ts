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
    isRoot?: boolean;
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

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'SLEEP' | 'APP_EXIT' | 'ERROR';

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
    isLicensed: boolean;
    licenseStartDate: string | null;  // ISO date — subscription start
    licenseEndDate: string | null;    // ISO date — subscription end
    lastSeen: string | null;
    lastOnlineAt: string | null;      // when device last came ONLINE (for uptime)
    lastOfflineAt: string | null;
    location: string | null;
    timezone: string;
    settings: Record<string, unknown> | null;
    downloadStatus: 'PENDING' | 'DOWNLOADING' | 'READY' | 'ERROR';
    contentReady: boolean;
    siteId: string | null;
    siteName?: string | null;
    createdAt: string;
    updatedAt: string;
}

// ─── Sites ────────────────────────────────────────────────────────────────────

export interface Site {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    address: string | null;
    contact: string | null;
    timezone: string | null;      // IANA timezone — inherited by devices when device.timezone is null
    timeOn: string | null;         // HH:MM — screen-on time
    timeOff: string | null;        // HH:MM — screen-off time
    alarmToleranceMin: number;     // minutes of grace around timeOn/timeOff before alerting
    deployDate: string | null;    // ISO date — deployment start
    endDate: string | null;       // ISO date — deployment end
    playlistId: string | null;
    playlistName: string | null;
    startEpoch: number | null;       // Unix ms — null means stopped
    totalDurationMs: number | null;
    deviceCount: number;
    onlineCount: number;
    deviceNames: string[];
    devices?: SiteDevice[];
    createdAt: string;
    updatedAt: string;
}

export interface SiteDevice {
    id: string;
    name: string;
    status: string;
    location: string | null;
    model: string | null;
}

export interface DeviceHealth {
    cpuUsage: number | null;
    memoryUsage: number | null;
    storageTotal: number | null;
    storageUsed: number | null;
    networkType: string | null;
    ipAddress: string | null;
    macAddress: string | null;
    heapMemory: number | null;
    networkConnected: boolean | null;
    processCpuPercent: number | null;
    wanIp: string | null;
    subnet: string | null;
    ipProtocol: string | null;
    reportedAt: string | null;
}

export interface ActiveSchedule {
    id: string;
    name: string;
    playlistId: string | null;
    playlistName: string | null;
    targetType: string;
    startDate: string | null;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    daysOfWeek: number[];
    priority: number;
}

export interface NowPlaying {
    mediaId: string;
    mediaTitle: string;
    mediaType: string;
    playedAt: string;
    durationPlayed: number;
    completed: boolean;
}

export interface DeviceComment {
    id: string;
    deviceId: string;
    userId: string | null;
    userName: string | null;
    comment: string;
    createdAt: string;
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

export type MediaType = 'IMAGE' | 'VIDEO';
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
    transition?: string | null;
    transitionDuration?: number | null;
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
    // For direct-media schedules (auto-generated playlist) — first item info
    directMediaId?: string | null;
    directMediaTitle?: string | null;
    directMediaType?: string | null;
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
    processCpuPercent: number | null;
    memoryUsage: number;
    storageUsed: number;
    storageTotal: number;
    storagePercent: number;
    networkType: string;
    reportedAt: string | null;
}

// ─── Programs ─────────────────────────────────────────────────────────────────

export interface Program {
    id: string;
    organizationId: string;
    name: string;
    description: string | null;
    scheduleCount: number;
    assignmentCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface ProgramScheduleItem {
    id: string; // program_schedules.id
    scheduleId: string;
    scheduleName: string;
    position: number;
    // schedule details
    startDate: string;
    endDate: string | null;
    startTime: string | null;
    endTime: string | null;
    daysOfWeek: number[];
    isActive: boolean;
    playlistName: string | null;
}

export interface ProgramAssignment {
    id: string;
    programId: string;
    programName: string;
    targetType: 'STORE' | 'DEVICE';
    targetId: string;
    targetName: string;
    assignedAt: string;
    scheduleCount?: number;
    assignedByName?: string | null;
}

export interface ProgramDetail extends Program {
    schedules: ProgramScheduleItem[];
    assignments: ProgramAssignment[];
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
