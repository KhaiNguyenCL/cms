import { z } from 'zod';

export const listStoresSchema = z.object({
    query: z.object({
        page:   z.coerce.number().int().min(1).default(1),
        limit:  z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().optional(),
    }),
});

export const createStoreSchema = z.object({
    body: z.object({
        name:        z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        address:     z.string().max(500).optional(),
        contact:     z.string().max(200).optional(),
        openDate:    z.string().optional(),   // ISO date string
        closeDate:   z.string().optional(),
        playlistId:  z.string().min(1).optional(),
    }),
});

export const updateStoreSchema = z.object({
    body: z.object({
        name:        z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
        address:     z.string().max(500).nullable().optional(),
        contact:     z.string().max(200).nullable().optional(),
        openDate:    z.string().nullable().optional(),
        closeDate:   z.string().nullable().optional(),
        playlistId:  z.string().min(1).nullable().optional(),
    }),
});

export const updateStoreDevicesSchema = z.object({
    body: z.object({
        add:    z.array(z.string()).optional(),
        remove: z.array(z.string()).optional(),
    }),
});

export type ListStoresQuery     = z.infer<typeof listStoresSchema>['query'];
export type CreateStoreBody     = z.infer<typeof createStoreSchema>['body'];
export type UpdateStoreBody     = z.infer<typeof updateStoreSchema>['body'];
export type UpdateStoreDevices  = z.infer<typeof updateStoreDevicesSchema>['body'];
