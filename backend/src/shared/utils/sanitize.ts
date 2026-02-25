/**
 * sanitize.ts — Server-side HTML strip cho tất cả text input.
 *
 * Mục tiêu: defense-in-depth chống stored XSS.
 * - Strip toàn bộ HTML tags và comments khỏi string fields
 * - Áp dụng đệ quy trên mọi object/array trong req.body
 * - React đã auto-escape khi render — đây là lớp bảo vệ phụ
 *
 * Không dùng thư viện ngoài — regex đủ dùng cho plain-text fields
 * (title, description, name, slug, ...). Không có field nào trong API
 * được phép chứa HTML content.
 */

/**
 * Strip HTML tags và comments khỏi một string.
 * Ví dụ: '<script>alert(1)</script>hello' → 'hello'
 */
export function stripHtml(input: string): string {
    return input
        .replace(/<!--[\s\S]*?-->/g, '') // strip HTML comments trước
        .replace(/<[^>]+>/g, '')          // strip tất cả HTML tags
        .trim();
}

/**
 * Đệ quy sanitize tất cả string values trong một object/array.
 * Non-string values (number, boolean, null) được giữ nguyên.
 */
export function sanitizeStrings<T>(value: T): T {
    if (typeof value === 'string') {
        return stripHtml(value) as T;
    }
    if (Array.isArray(value)) {
        return value.map(sanitizeStrings) as T;
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, sanitizeStrings(v)])
        ) as T;
    }
    return value;
}
