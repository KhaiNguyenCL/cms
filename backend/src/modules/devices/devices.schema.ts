import { z } from 'zod';

export const DEVICE_STATUSES = ['ONLINE', 'OFFLINE', 'SLEEP', 'APP_EXIT', 'ERROR'] as const;
export const DEVICE_REG_STATUSES = ['REGISTERED', 'PAIRED', 'REVOKED', 'REPLACED'] as const;
export const DEVICE_COMMANDS = [
    'RESTART', 'SCREENSHOT', 'RELOAD_CONTENT', 'CLEAR_CACHE',
    'SLEEP', 'WAKE_UP', 'VIEWER_RESTART', 'DOWNLOAD_CONTENT',
    'SET_VOLUME',
    'EXIT_APP',
] as const;

// ─── STEP 1: Register Device ──────────────────────────────────────────────────

export const registerDeviceSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(100, 'Tên device tối đa 100 ký tự'),
        location: z.string().max(200).optional(),
        description: z.string().max(500).optional(),
        expectedModel: z.string().max(100).optional(),
        timezone: z.string().max(50).optional(),
    }),
});

// ─── STEP 2: Generate Pairing Code ────────────────────────────────────────────

export const generatePairingCodeSchema = z.object({
    params: z.object({ deviceId: z.string().min(1) }),
});

// ─── STEP 3: Device Pair (with signature verification) ────────────────────────

export const devicePairSchema = z.object({
    body: z.object({
        pairingCode: z.string().length(6, 'Pairing code phải 6 ký tự').regex(/^\d+$/, 'Pairing code chỉ chứa số'),
        deviceInfo: z.object({
            hwId: z.string().min(1, 'Hardware ID bắt buộc'),
            osVersion: z.string().min(1, 'OS version bắt buộc'),
            appVersion: z.string().min(1, 'App version bắt buộc'),
        }),
        // HMAC-SHA256(JSON(deviceInfo), embeddedSecret)
        signature: z.string().min(1, 'Signature bắt buộc'),
    }),
});

// ─── Reconnect Device (by hwId — skip pairing code after reinstall) ──────────

export const reconnectDeviceSchema = z.object({
    body: z.object({
        hwId:       z.string().min(1, 'Hardware ID bắt buộc'),
        osVersion:  z.string().min(1),
        appVersion: z.string().min(1),
        signature:  z.string().min(1, 'Signature bắt buộc'),
    }),
});
export type ReconnectDeviceBody = z.infer<typeof reconnectDeviceSchema>['body'];

// ─── Refresh Device Token ─────────────────────────────────────────────────────

export const refreshDeviceTokenSchema = z.object({
    // Token sẽ được verify qua Authorization header middleware
    body: z.object({}).optional(),
});

// ─── Batch Generate Pairing Codes ────────────────────────────────────────────

export const batchGeneratePairingCodesSchema = z.object({
    body: z.object({
        deviceIds: z.array(z.string().min(1)).min(1).max(100).optional(),
        // OR
        count: z.number().int().min(1).max(100).optional(),
        baseNamePrefix: z.string().max(100).optional(),
    }).refine(
        (d) => (d.deviceIds && d.deviceIds.length > 0) || (d.count && d.count > 0),
        { message: 'Phải cung cấp deviceIds hoặc count' }
    ),
});

// ─── List / filter ────────────────────────────────────────────────────────────

export const listDevicesSchema = z.object({
    query: z.object({
        page: z.coerce.number().int().min(1).catch(1),
        limit: z.coerce.number().int().min(1).max(9999).catch(20),
        status: z.enum(DEVICE_STATUSES).optional().catch(undefined),
        regStatus: z.enum(DEVICE_REG_STATUSES).optional().catch(undefined),
        search: z.string().optional(),
        groupId: z.string().optional(),
    }),
});

// ─── Create device (legacy - full creation) ───────────────────────────────────

export const createDeviceSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(100),
        location: z.string().max(200).optional(),
        timezone: z.string().max(50).optional(),
        settings: z.record(z.unknown()).optional(),
        siteId: z.string().uuid().optional().nullable(),
    }),
});

// ─── Update device ────────────────────────────────────────────────────────────

export const updateDeviceSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name:             z.string().min(1).max(100).optional(),
        location:         z.string().max(200).optional().nullable(),
        timezone:         z.string().max(50).optional(),
        status:           z.enum(DEVICE_STATUSES).optional(),
        settings:         z.record(z.unknown()).optional(),
    }).refine(d => Object.keys(d).length > 0, { message: 'Phải cung cấp ít nhất một trường' }),
});

// ─── Device command ───────────────────────────────────────────────────────────

export const deviceCommandSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        command: z.enum(DEVICE_COMMANDS),
        payload: z.record(z.unknown()).optional(),
    }),
});

// ─── Device Groups ────────────────────────────────────────────────────────────

export const createGroupSchema = z.object({
    body: z.object({
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        deviceIds: z.array(z.string()).optional(),
    }),
});

export const updateGroupSchema = z.object({
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional().nullable(),
        deviceIds: z.array(z.string()).optional(),
    }).refine(d => Object.keys(d).length > 0, { message: 'Phải cung cấp ít nhất một trường' }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type RegisterDeviceBody = z.infer<typeof registerDeviceSchema>['body'];
export type GeneratePairingCodeParams = z.infer<typeof generatePairingCodeSchema>['params'];
export type DevicePairBody = z.infer<typeof devicePairSchema>['body'];
export type RefreshDeviceTokenBody = z.infer<typeof refreshDeviceTokenSchema>['body'];
export type BatchGeneratePairingCodesBody = z.infer<typeof batchGeneratePairingCodesSchema>['body'];
export type ListDevicesQuery = z.infer<typeof listDevicesSchema>['query'];
export type CreateDeviceBody = z.infer<typeof createDeviceSchema>['body'];
export type UpdateDeviceBody = z.infer<typeof updateDeviceSchema>['body'];
export type DeviceCommandBody = z.infer<typeof deviceCommandSchema>['body'];
export type CreateGroupBody = z.infer<typeof createGroupSchema>['body'];
export type UpdateGroupBody = z.infer<typeof updateGroupSchema>['body'];

