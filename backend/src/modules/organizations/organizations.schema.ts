import { z } from 'zod';

/**
 * Schema cập nhật thông tin organization
 * PUT /api/organizations/me
 */
export const updateOrganizationSchema = z.object({
    body: z.object({
        name: z
            .string()
            .min(2, 'Tên tối thiểu 2 ký tự')
            .max(100, 'Tên tối đa 100 ký tự')
            .optional(),
        settings: z
            .record(z.unknown())
            .optional(),
    }).refine(
        (data) => Object.keys(data).length > 0,
        { message: 'Phải cung cấp ít nhất một trường để cập nhật' }
    ),
});

export type UpdateOrganizationBody = z.infer<typeof updateOrganizationSchema>['body'];
