/**
 * media.signing.ts — HMAC-signed media URL helpers.
 *
 * Mỗi URL chứa:
 *   expires  — Unix timestamp (giây) khi URL hết hạn
 *   sig      — HMAC-SHA256(mediaId:type:expires, signingKey) dạng base64url
 *
 * Signing key = env.MEDIA_SIGN_SECRET ?? (JWT_SECRET + ':media')
 * TTL mặc định: 3600 giây (1 giờ)
 */

import crypto from 'crypto';
import config from '../../config';

const SIGN_TTL_SECONDS = 3600;

function signingKey(): string {
    return (process.env.MEDIA_SIGN_SECRET ?? config.jwt.secret) + ':media';
}

function computeSig(mediaId: string, type: string, expires: number): string {
    return crypto
        .createHmac('sha256', signingKey())
        .update(`${mediaId}:${type}:${expires}`)
        .digest('base64url');
}

/**
 * Tạo signed URL cho một media item.
 * @param mediaId    UUID của media
 * @param type       'file' | 'thumbnail'
 * @param ttlSeconds Thời hạn URL (mặc định 1 giờ)
 * @param absolute   true = full URL (cho Android device), false = path only (cho admin frontend)
 */
export function signMediaUrl(
    mediaId: string,
    type: 'file' | 'thumbnail',
    ttlSeconds = SIGN_TTL_SECONDS,
    absolute = false
): string {
    const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = computeSig(mediaId, type, expires);
    const path = `/api/media/${mediaId}/${type}?expires=${expires}&sig=${sig}`;
    return absolute ? `${config.server.url}${path}` : path;
}

/**
 * Xác thực signed token từ query string.
 * Trả về true nếu token hợp lệ và chưa hết hạn.
 */
export function verifyMediaToken(
    mediaId: string,
    type: 'file' | 'thumbnail',
    expires: string | number,
    sig: string
): boolean {
    const exp = Number(expires);
    if (!Number.isFinite(exp) || Math.floor(Date.now() / 1000) > exp) return false;

    const expected = computeSig(mediaId, type, exp);
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expected);
    // Bảo vệ timing attack: chỉ so sánh khi cùng độ dài
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
}
