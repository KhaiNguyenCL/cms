import { z } from 'zod';

export const registerSchema = z.object({
    body: z.object({
        organizationName: z.string().min(2).max(100),
        organizationSlug: z
            .string()
            .min(2)
            .max(50)
            .regex(/^[a-z0-9-]+$/, 'Slug chỉ được chứa chữ thường, số và dấu -'),
        email: z.string().email('Email không hợp lệ'),
        password: z
            .string()
            .min(8, 'Mật khẩu tối thiểu 8 ký tự')
            .regex(/[0-9]/, 'Mật khẩu phải chứa ít nhất 1 số')
            .regex(/[^a-zA-Z0-9]/, 'Mật khẩu phải chứa ít nhất 1 ký tự đặc biệt'),
    }),
});

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email(),
        password: z.string().min(1),
    }),
});

export const forgotPasswordSchema = z.object({
    body: z.object({
        email: z.string().email(),
    }),
});

export const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(1),
        password: z
            .string()
            .min(8)
            .regex(/[0-9]/)
            .regex(/[^a-zA-Z0-9]/),
    }),
});

export type RegisterBody = z.infer<typeof registerSchema>['body'];
export type LoginBody = z.infer<typeof loginSchema>['body'];
