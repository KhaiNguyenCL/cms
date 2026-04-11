/**
 * Axios API client — configured with base URL, auth header injection,
 * and automatic token refresh on 401.
 *
 * Access token: lưu trong MEMORY (mất khi reload — ngắn hạn).
 * Refresh token: HttpOnly cookie do server set — JS không thể đọc/ghi.
 *   Browser tự gửi cookie khi request tới /api/auth/* nhờ withCredentials: true.
 */
import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// ─── Instance ─────────────────────────────────────────────────────────────────

export const apiClient = axios.create({
    baseURL: '/api',
    withCredentials: true,   // gửi HttpOnly refresh-token cookie tự động
    timeout: 30_000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// ─── In-memory access token ───────────────────────────────────────────────────

let _accessToken: string | null = null;
let _isPlatformAdmin = false;

export function setAccessToken(token: string | null): void {
    _accessToken = token;
}

export function getAccessToken(): string | null {
    return _accessToken;
}

export function setIsPlatformAdmin(value: boolean): void {
    _isPlatformAdmin = value;
}

const MANAGING_ORG_ID_KEY = 'cms_managing_org_id';

// Restore from localStorage on page load so X-Organization-Id header survives reload
let _managingOrgId: string | null = localStorage.getItem(MANAGING_ORG_ID_KEY);

export function setManagingOrgId(orgId: string | null): void {
    _managingOrgId = orgId;
}

// ─── Request interceptor — inject Authorization header ───────────────────────

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    if (_accessToken) {
        config.headers.Authorization = `Bearer ${_accessToken}`;
    }
    if (_managingOrgId) {
        config.headers['X-Organization-Id'] = _managingOrgId;
    }
    return config;
});

// ─── Response interceptor — auto-refresh on 401 ──────────────────────────────

let isRefreshing = false;
let failedQueue: Array<{
    resolve: (value: string) => void;
    reject: (reason: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
    failedQueue.forEach((prom) => {
        if (error) prom.reject(error);
        else prom.resolve(token!);
    });
    failedQueue = [];
}

// ─── Cross-tab token coordination via BroadcastChannel ───────────────────────

const _refreshChannel = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('cms_token_refresh')
    : null;

if (_refreshChannel) {
    _refreshChannel.onmessage = (event: MessageEvent) => {
        if (event.data?.type === 'TOKEN_REFRESHED') {
            // Another tab successfully refreshed — adopt its token and unblock any queued requests
            setAccessToken(event.data.token);
            if (isRefreshing) {
                processQueue(null, event.data.token);
                isRefreshing = false;
            }
        } else if (event.data?.type === 'TOKEN_REFRESH_FAILED') {
            // Another tab failed to refresh — propagate logout here too
            if (isRefreshing) {
                processQueue(event.data.error, null);
                isRefreshing = false;
            }
            setAccessToken(null);
            window.dispatchEvent(new CustomEvent('auth:logout'));
        }
    };
}

apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        const reqUrl = originalRequest.url ?? '';
        const isRefreshEndpoint = reqUrl.includes('refresh-token') || reqUrl.includes('platform/refresh');
        if (error.response?.status === 401 && !originalRequest._retry && !isRefreshEndpoint) {
            if (isRefreshing) {
                // Queue lại request trong khi đang refresh (same-tab or cross-tab)
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then((token) => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return apiClient(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const refreshUrl = _isPlatformAdmin
                    ? '/api/platform/refresh'
                    : '/api/auth/refresh-token';
                const { data } = await axios.post(refreshUrl, {}, { withCredentials: true });
                const newToken: string = data.data.accessToken;

                setAccessToken(newToken);
                processQueue(null, newToken);

                // Broadcast to other tabs so they don't trigger their own refresh
                _refreshChannel?.postMessage({ type: 'TOKEN_REFRESHED', token: newToken });

                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                setAccessToken(null);
                _refreshChannel?.postMessage({ type: 'TOKEN_REFRESH_FAILED', error: 'refresh_failed' });
                window.dispatchEvent(new CustomEvent('auth:logout'));
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

/**
 * Extract a human-readable error message from an Axios error.
 * Falls back to `fallback` if the server didn't send a specific message.
 *
 * Usage in React Query onError:
 *   onError: (err) => dispatch(pushToast({ severity: 'error', message: getApiError(err, 'Tạo thất bại') }))
 */
export function getApiError(err: unknown, fallback: string): string {
    const data = (err as { response?: { data?: { error?: string } } })?.response?.data;
    return data?.error ?? fallback;
}

export default apiClient;
