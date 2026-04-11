import { z } from 'zod';

// HH:MM or HH:MM:SS — stored as TEXT in DB
const timeString = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional();

export const listSitesSchema = z.object({
    query: z.object({
        page:   z.coerce.number().int().min(1).default(1),
        limit:  z.coerce.number().int().min(1).max(9999).default(20),
        search: z.string().optional(),
    }),
});

export const createSiteSchema = z.object({
    body: z.object({
        name:               z.string().min(1).max(100),
        description:        z.string().max(500).optional(),
        address:            z.string().max(500).optional(),
        contact:            z.string().max(200).optional(),
        timezone:           z.string().max(100).optional(),
        timeOn:             timeString,
        timeOff:            timeString,
        deployDate:         z.string().optional(),
        endDate:            z.string().optional(),
        playlistId:         z.string().min(1).optional(),
        alarmToleranceMin:  z.number().int().min(0).max(480).optional(),  // 0–8 hours
    }),
});

export const updateSiteSchema = z.object({
    body: z.object({
        name:               z.string().min(1).max(100).optional(),
        description:        z.string().max(500).nullable().optional(),
        address:            z.string().max(500).nullable().optional(),
        contact:            z.string().max(200).nullable().optional(),
        timezone:           z.string().max(100).nullable().optional(),
        timeOn:             z.string().nullable().optional(),
        timeOff:            z.string().nullable().optional(),
        deployDate:         z.string().nullable().optional(),
        endDate:            z.string().nullable().optional(),
        playlistId:         z.string().min(1).nullable().optional(),
        alarmToleranceMin:  z.number().int().min(0).max(480).optional(),
    }),
});

export const updateSiteDevicesSchema = z.object({
    body: z.object({
        add:           z.array(z.string()).optional(),
        remove:        z.array(z.string()).optional(),
        forceTransfer: z.boolean().optional(), // skip conflict check — used for site-to-site transfer
    }),
});

export type ListSitesQuery     = z.infer<typeof listSitesSchema>['query'];
export type CreateSiteBody     = z.infer<typeof createSiteSchema>['body'];
export type UpdateSiteBody     = z.infer<typeof updateSiteSchema>['body'];
export type UpdateSiteDevices  = z.infer<typeof updateSiteDevicesSchema>['body'];
