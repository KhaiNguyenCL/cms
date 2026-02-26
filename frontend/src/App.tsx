import { useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Provider } from 'react-redux';
import createCache from '@emotion/cache';
import { CacheProvider } from '@emotion/react';
import { store } from '@store/index';
import { useAppSelector } from '@store/hooks';
import { createAppTheme } from './theme';
import { AuthGuard } from '@components/guards/AuthGuard';
import { ToastContainer } from '@components/feedback/ToastContainer';

// Emotion cache with prepend:true — ensures MUI @import rules appear before other CSS
const muiCache = createCache({ key: 'mui', prepend: true });

// ── Lazy-loaded pages ──────────────────────────────────────────────────────────
import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';

const LoginPage = lazy(() => import('@pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('@pages/auth/RegisterPage'));
const DashboardLayout = lazy(() => import('@pages/layout/DashboardLayout'));
const DashboardPage = lazy(() => import('@pages/dashboard/DashboardPage'));
const DevicesPage = lazy(() => import('@pages/devices/DevicesPage'));
const MediaPage = lazy(() => import('@pages/media/MediaPage'));
const PlaylistsPage = lazy(() => import('@pages/playlists/PlaylistsPage'));
const SchedulesPage = lazy(() => import('@pages/schedules/SchedulesPage'));
const AnalyticsPage = lazy(() => import('@pages/analytics/AnalyticsPage'));
const UsersPage = lazy(() => import('@pages/users/UsersPage'));
const SettingsPage = lazy(() => import('@pages/settings/SettingsPage'));
const SuperAdminPage = lazy(() => import('@pages/superadmin/SuperAdminPage'));
const NotFoundPage = lazy(() => import('@pages/NotFoundPage'));
const PlayerPage = lazy(() => import('@pages/player/PlayerPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

const PageFallback = () => (
  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
    <CircularProgress />
  </Box>
);

// Inner app reads Redux state (must be inside Provider)
function AppRoutes() {
  const colorMode = useAppSelector((s) => s.ui.colorMode);
  const theme = useMemo(() => createAppTheme(colorMode), [colorMode]);

  return (
    <CacheProvider value={muiCache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ToastContainer />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            {/* Android TV WebView player — device JWT, no admin auth */}
            <Route path="/player" element={<PlayerPage />} />

            {/* Protected — requires auth */}
            <Route element={<AuthGuard />}>
              <Route element={<DashboardLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/devices" element={<DevicesPage />} />
                <Route path="/media" element={<MediaPage />} />
                <Route path="/playlists" element={<PlaylistsPage />} />
                <Route path="/schedules" element={<SchedulesPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/super-admin" element={<SuperAdminPage />} />
              </Route>
            </Route>

            {/* 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </ThemeProvider>
    </CacheProvider>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </QueryClientProvider>
    </Provider>
  );
}
