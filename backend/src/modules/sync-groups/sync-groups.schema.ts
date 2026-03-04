import { z } from 'zod';

export const listSyncGroupsSchema = z.object({
    query: z.object({
        page:   z.coerce.number().int().min(1).default(1),
        limit:  z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
    }),
});

export const createSyncGroupSchema = z.object({
    body: z.object({
        name:        z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        playlistId:  z.string().min(1).optional(),
    }),
});

export const updateSyncGroupSchema = z.object({
    body: z.object({
        name:        z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
        playlistId:  z.string().min(1).nullable().optional(),
    }),
});

// PATCH /sync-groups/:id/devices
// add: add deviceIds to group, remove: remove deviceIds from group
export const updateSyncGroupDevicesSchema = z.object({
    body: z.object({
        add:    z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
    }),
});

export type ListSyncGroupsQuery     = z.infer<typeof listSyncGroupsSchema>['query'];
export type CreateSyncGroupBody     = z.infer<typeof createSyncGroupSchema>['body'];
export type UpdateSyncGroupBody     = z.infer<typeof updateSyncGroupSchema>['body'];
export type UpdateSyncGroupDevices  = z.infer<typeof updateSyncGroupDevicesSchema>['body'];
