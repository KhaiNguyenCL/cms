import { useMemo, Component, type ReactNode } from 'react';
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

// ── Error boundary for /player route ──────────────────────────────────────────
class PlayerErrorBoundary extends Component<
    { children: ReactNode },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    render() {
        const { error } = this.state;
        if (!error) return this.props.children;
        return (
            <div style={{
                position: 'fixed', inset: 0, background: '#0D0D0D',
                color: '#FF6584', fontFamily: 'monospace', padding: 24,
                overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: 13,
            }}>
                <div style={{ marginBottom: 12, fontSize: 16, color: '#fff' }}>
                    ⚠ Player crashed — React error
                </div>
                <div style={{ color: '#FF6584' }}>{error.message}</div>
                <div style={{ color: '#888', marginTop: 12 }}>{error.stack}</div>
            </div>
        );
    }
}

// Emotion cache with prepend:true — ensures MUI @import rules appear before other CSS
const muiCache = createCache({ key: 'mui', prepend: true });

// ── Lazy-loaded pages ──────────────────────────────────────────────────────────
import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';

const LoginPage = lazy(() => import('@pages/auth/LoginPage'));
const DashboardLayout = lazy(() => import('@pages/layout/DashboardLayout'));
const DashboardPage = lazy(() => import('@pages/dashboard/DashboardPage'));
const DevicesPage = lazy(() => import('@pages/devices/DevicesPage'));
const MediaPage = lazy(() => import('@pages/media/MediaPage'));
const PlaylistsPage = lazy(() => import('@pages/playlists/PlaylistsPage'));
const SchedulesPage = lazy(() => import('@pages/schedules/SchedulesPage'));
const UsersPage = lazy(() => import('@pages/users/UsersPage'));
const SettingsPage = lazy(() => import('@pages/settings/SettingsPage'));
const SuperAdminPage = lazy(() => import('@pages/superadmin/SuperAdminPage'));
const LicensePage = lazy(() => import('@pages/license/LicensePage'));
const LicenseManagementPage = lazy(() => import('@pages/license/LicenseManagementPage'));
const NotFoundPage = lazy(() => import('@pages/NotFoundPage'));
const PlayerPage = lazy(() => import('@pages/player/PlayerPage'));
const SitePage = lazy(() => import('@pages/sites/SitePage'));
const TemplatePage         = lazy(() => import('@pages/content/TemplatePage'));
const SlidePage            = lazy(() => import('@pages/content/SlidePage'));
const DailySchedulePage    = lazy(() => import('@pages/schedules/DailySchedulePage'));
const StatusAlarmPage      = lazy(() => import('@pages/history/StatusAlarmPage'));
const ContentHistoryPage   = lazy(() => import('@pages/history/ContentHistoryPage'));
const SoftwareHistoryPage  = lazy(() => import('@pages/history/SoftwareHistoryPage'));
const ActionHistoryPage    = lazy(() => import('@pages/history/ActionHistoryPage'));
const ScheduleAssignmentPage = lazy(() => import('@pages/schedule-assignment/ScheduleAssignmentPage'));
const PlatformLoginPage = lazy(() => import('@pages/platform/PlatformLoginPage'));

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
            <Route path="/platform/login" element={<PlatformLoginPage />} />
            {/* Android TV WebView player — device JWT, no admin auth */}
            <Route path="/player" element={
                <PlayerErrorBoundary><PlayerPage /></PlayerErrorBoundary>
            } />

            {/* Protected — requires auth */}
            <Route element={<AuthGuard />}>
              <Route element={<DashboardLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/device-management" element={<DevicesPage />} />
                <Route path="/media" element={<MediaPage />} />
                <Route path="/playlists" element={<PlaylistsPage />} />
                <Route path="/schedules" element={<SchedulesPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/license" element={<LicensePage />} />
                <Route path="/license-management" element={<LicenseManagementPage />} />
                <Route path="/super-admin" element={<SuperAdminPage />} />
                <Route path="/sites"            element={<SitePage />} />
                <Route path="/template"         element={<TemplatePage />} />
                <Route path="/slide"            element={<SlidePage />} />
                <Route path="/daily-schedule"   element={<DailySchedulePage />} />
                <Route path="/history/alarm"    element={<StatusAlarmPage />} />
                <Route path="/history/content"  element={<ContentHistoryPage />} />
                <Route path="/history/software" element={<SoftwareHistoryPage />} />
                <Route path="/history/action"   element={<ActionHistoryPage />} />
                <Route path="/programs" element={<Navigate to="/schedule-assignment" replace />} />
                <Route path="/schedule-assignment" element={<ScheduleAssignmentPage />} />
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
