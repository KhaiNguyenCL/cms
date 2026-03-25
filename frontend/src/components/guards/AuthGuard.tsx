/**
 * AuthGuard — bảo vệ các route yêu cầu xác thực.
 *
 * Khi mount, thử silent refresh bằng cách gọi /api/auth/refresh-token.
 * Browser tự gửi HttpOnly cookie — không cần đọc/lưu token trong JS.
 * Nếu cookie còn hợp lệ → session được khôi phục sau khi reload trang.
 * Nếu cookie hết hạn hoặc không tồn tại → redirect về login.
 */
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Box, CircularProgress } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { logout, setCredentials, setPlatformAdminCredentials, setLoading } from '@store/slices/authSlice';
import type { RootState } from '@store/index';
import type { User } from '@/types';

// ─── AuthGuard ────────────────────────────────────────────────────────────────

export function AuthGuard() {
    const dispatch = useAppDispatch();
    const { isAuthenticated, isLoading, isPlatformAdmin } = useAppSelector((s) => s.auth);
    const location = useLocation();

    // Khi mount: thử silent refresh — HttpOnly cookie được gửi tự động
    // Platform admin dùng /api/platform/refresh; regular user dùng /api/auth/refresh-token
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (isPlatformAdmin) {
                    const { platformAuthApi } = await import('@api/platform-auth.api');
                    const result = await platformAuthApi.refresh();
                    if (cancelled) return;
                    dispatch(setPlatformAdminCredentials({
                        admin: result.admin,
                        accessToken: result.accessToken,
                    }));
                } else {
                    const { authApi } = await import('@api/auth.api');
                    const result = await authApi.refresh();
                    if (cancelled) return;
                    dispatch(setCredentials({
                        user: result.user,
                        accessToken: result.accessToken,
                    }));
                }
            } catch {
                if (!cancelled) dispatch(logout());
            }
        })();

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lắng nghe forced logout từ 401 interceptor (refresh thất bại giữa session)
    useEffect(() => {
        const handler = () => dispatch(logout());
        window.addEventListener('auth:logout', handler);
        return () => window.removeEventListener('auth:logout', handler);
    }, [dispatch]);

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
                <CircularProgress size={48} />
            </Box>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Outlet />;
}

// ─── RoleGuard ────────────────────────────────────────────────────────────────

interface RoleGuardProps {
    allowedRoles: User['role'][];
    children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
    const user = useSelector((s: RootState) => s.auth.user);
    if (!user || !allowedRoles.includes(user.role)) {
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
}
