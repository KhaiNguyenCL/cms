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

export function setAccessToken(token: string | null): void {
    _accessToken = token;
}

export function getAccessToken(): string | null {
    return _accessToken;
}

let _managingOrgId: string | null = null;

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

apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
        const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                // Queue lại request trong khi đang refresh
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
                // Không cần gửi body — refresh token nằm trong HttpOnly cookie,
                // browser tự đính kèm nhờ withCredentials: true
                const { data } = await axios.post(
                    '/api/auth/refresh-token',
                    {},
                    { withCredentials: true }
                );
                const newToken: string = data.data.accessToken;

                setAccessToken(newToken);
                processQueue(null, newToken);

                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(originalRequest);
            } catch (refreshError) {
                processQueue(refreshError, null);
                setAccessToken(null);
                window.dispatchEvent(new CustomEvent('auth:logout'));
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

export default apiClient;
