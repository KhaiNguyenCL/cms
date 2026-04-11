import { z } from 'zod';

export const STORAGE_PACKAGES = [50, 100, 200] as const;
export type StoragePackageMb = typeof STORAGE_PACKAGES[number];

export const purchaseRequestSchema = z.object({
    body: z.object({
        packageMb: z.union([z.literal(50), z.literal(100), z.literal(200)]),
        quantity:  z.number().int().min(1).max(100).default(1),
        note:      z.string().max(500).optional(),
    }),
});

export const adjustPoolSchema = z.object({
    body: z.object({
        storageBaseMb: z.number().int().min(0).max(100_000).optional(),
        delta50mb:     z.number().int().optional(),
        delta100mb:    z.number().int().optional(),
        delta200mb:    z.number().int().optional(),
        note:          z.string().max(500).optional(),
    }),
});

export const resolveRequestSchema = z.object({
    body: z.object({
        adminNote: z.string().max(500).optional(),
    }),
});

export type PurchaseRequestBody = z.infer<typeof purchaseRequestSchema>['body'];
export type AdjustPoolBody      = z.infer<typeof adjustPoolSchema>['body'];
export type ResolveRequestBody  = z.infer<typeof resolveRequestSchema>['body'];
