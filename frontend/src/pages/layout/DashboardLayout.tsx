import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { useSocket } from '@hooks/useSocket';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from '@/i18n';
import {
    Box, Drawer, AppBar, Toolbar, Typography, IconButton, Avatar,
    List, ListItemButton, ListItemIcon, ListItemText, Tooltip,
    Divider, Menu, MenuItem, Badge, useTheme, useMediaQuery,
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Chip, alpha, Collapse, TextField, InputAdornment,
    Popover, Stack, CircularProgress,
} from '@mui/material';
import {
    Dashboard, PermMedia, QueueMusic, CalendarMonth, BarChart,
    People, Settings, Menu as MenuIcon, LightMode, DarkMode,
    NotificationsNone, Logout, ChevronLeft, AdminPanelSettings, Close, Download,
    SwapHoriz, Business, CheckCircle, WorkspacePremium, Search,
    Storefront, DashboardCustomize, Slideshow, Today, History,
    NotificationsActive, PlayCircleOutline, SystemUpdate, TouchApp,
    Assignment, ExpandMore, ExpandLess, DevicesOther, PhotoLibrary, LibraryBooks,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { toggleColorMode, setSidebarOpen, pushToast } from '@store/slices/uiSlice';
import { logout, setManagingOrg } from '@store/slices/authSlice';
import { authApi } from '@api/auth.api';
import { organizationsApi, type OrgWithStats } from '@api/organizations.api';
import { notificationsApi, NOTIF_META, type AppNotification } from '@api/notifications.api';

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 72;

// ── Nav types ─────────────────────────────────────────────────────────────────

type NavLeaf = {
    kind: 'item';
    label: string;
    icon: ReactNode;
    path: string;
    roles?: string[] | null;
};

type NavGroup = {
    kind: 'group';
    id: string;
    label: string;
    icon: ReactNode;
    children: NavLeaf[];
    roles?: string[];
};

type NavEntry = NavLeaf | NavGroup;

// ── Nav structure ─────────────────────────────────────────────────────────────

const navStructure: NavEntry[] = [
    { kind: 'item', label: 'Dashboard', icon: <Dashboard sx={{ color: '#38BDF8' }} />, path: '/dashboard', roles: null },
    { kind: 'item', label: 'Site Management', icon: <Storefront sx={{ color: '#34D399' }} />, path: '/sites', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER'] },
    { kind: 'item', label: 'Device Management', icon: <DevicesOther sx={{ color: '#60A5FA' }} />, path: '/device-management', roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER', 'SITE_MANAGER'] },
    {
        kind: 'group', id: 'content-management', label: 'Content Management', icon: <PhotoLibrary sx={{ color: '#A78BFA' }} />,
        roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'VIEWER', 'CONTENT_MANAGER'],
        children: [
            { kind: 'item', label: 'Media Library', icon: <PermMedia sx={{ color: '#F472B6' }} />, path: '/media', roles: null },
            { kind: 'item', label: 'Playlist', icon: <QueueMusic sx={{ color: '#A78BFA' }} />, path: '/playlists', roles: null },
            { kind: 'item', label: 'Schedule', icon: <Today sx={{ color: '#FB923C' }} />, path: '/schedules', roles: null },
            { kind: 'item', label: 'Schedule Assignment', icon: <CalendarMonth sx={{ color: '#FBBF24' }} />, path: '/schedule-assignment', roles: null },
        ],
    },
    {
        kind: 'group', id: 'history', label: 'History', icon: <History sx={{ color: '#94A3B8' }} />,
        roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'],
        children: [
            { kind: 'item', label: 'Status Alarm', icon: <NotificationsActive sx={{ color: '#F87171' }} />, path: '/history/alarm', roles: null },
            { kind: 'item', label: 'Content History', icon: <PlayCircleOutline sx={{ color: '#34D399' }} />, path: '/history/content', roles: null },
            { kind: 'item', label: 'Software History', icon: <SystemUpdate sx={{ color: '#60A5FA' }} />, path: '/history/software', roles: null },
            { kind: 'item', label: 'Action History', icon: <Assignment sx={{ color: '#94A3B8' }} />, path: '/history/action', roles: null },
        ],
    },
    { kind: 'item', label: 'Users', icon: <People sx={{ color: '#4ADE80' }} />, path: '/users', roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
    { kind: 'item', label: 'License', icon: <WorkspacePremium sx={{ color: '#FBBF24' }} />, path: '/license', roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
    { kind: 'item', label: 'Settings', icon: <Settings sx={{ color: '#94A3B8' }} />, path: '/settings', roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
];

const superAdminItems: NavLeaf[] = [
    { kind: 'item', label: 'Super Admin',        icon: <AdminPanelSettings sx={{ color: '#F87171' }} />, path: '/super-admin' },
    { kind: 'item', label: 'License Management', icon: <WorkspacePremium sx={{ color: '#FBBF24' }} />,   path: '/license-management' },
];

// ── Label finder for AppBar ───────────────────────────────────────────────────

function findLabel(entries: NavEntry[], pathname: string): string {
    for (const e of entries) {
        if (e.kind === 'item' && pathname.startsWith(e.path)) return e.label;
        if (e.kind === 'group') {
            const child = e.children.find((c) => pathname.startsWith(c.path));
            if (child) return child.label;
        }
    }
    return 'Dashboard';
}

// ── Notification helpers ──────────────────────────────────────────────────────

function timeAgo(iso: string, lang = 'vi'): string {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (lang === 'en') {
        if (m < 1)  return 'just now';
        if (m < 60) return `${m}m ago`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h ago`;
        return `${Math.floor(h / 24)}d ago`;
    }
    if (m < 1)  return 'vừa xong';
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    return `${Math.floor(h / 24)} ngày trước`;
}

const NOTIF_ICON_COLOR: Record<string, string> = {
    error: '#EF4444', warning: '#F59E0B', success: '#10B981', info: '#3B82F6',
};

function NotificationItem({ n, onRead, onDelete }: {
    n: AppNotification;
    onRead: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    const { t, i18n } = useTranslation();
    const meta = NOTIF_META[n.type] ?? { labelKey: n.type, color: 'info' as const };
    const dotColor = NOTIF_ICON_COLOR[meta.color];
    return (
        <Box
            onClick={() => !n.read && onRead(n.id)}
            sx={{
                px: 2, py: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1.5,
                cursor: n.read ? 'default' : 'pointer',
                bgcolor: n.read ? 'transparent' : theme => alpha(theme.palette.primary.main, 0.05),
                borderBottom: '1px solid', borderColor: 'divider',
                '&:hover': { bgcolor: 'action.hover' },
                transition: 'background 0.15s',
            }}
        >
            <Box sx={{ mt: 0.5, width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                bgcolor: n.read ? 'transparent' : dotColor, border: `2px solid ${dotColor}` }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" fontWeight={n.read ? 400 : 600} noWrap>{n.title}</Typography>
                {n.body && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{n.body}</Typography>
                )}
                <Stack direction="row" alignItems="center" justifyContent="space-between" mt={0.3}>
                    <Chip label={t(meta.labelKey)} size="small" color={meta.color}
                        sx={{ height: 16, fontSize: '0.6rem', '& .MuiChip-label': { px: 0.8 } }} />
                    <Typography variant="caption" color="text.disabled">{timeAgo(n.createdAt, i18n.language)}</Typography>
                </Stack>
            </Box>
            <IconButton size="small" sx={{ mt: -0.5, opacity: 0.4, '&:hover': { opacity: 1 } }}
                onClick={e => { e.stopPropagation(); onDelete(n.id); }}>
                <Close sx={{ fontSize: 14 }} />
            </IconButton>
        </Box>
    );
}

function NotificationPanel({ anchorEl, onClose }: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
}) {
    const qc = useQueryClient();
    const dispatch = useAppDispatch();
    const { t, i18n } = useTranslation();

    const { data, isLoading } = useQuery({
        queryKey: ['notifications'],
        queryFn: () => notificationsApi.list({ limit: 50 }),
        enabled: Boolean(anchorEl),
        refetchInterval: anchorEl ? 30_000 : false,
    });

    const notifications = data?.data ?? [];
    const unread = notifications.filter(n => !n.read).length;

    const readMut = useMutation({
        mutationFn: notificationsApi.markRead,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    });
    const readAllMut = useMutation({
        mutationFn: notificationsApi.markAllRead,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    });
    const deleteMut = useMutation({
        mutationFn: notificationsApi.delete,
        onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
    });

    return (
        <Popover
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            onClose={onClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { width: 380, maxHeight: 520, display: 'flex', flexDirection: 'column',
                borderRadius: 2, boxShadow: 6 } }}
        >
            {/* Header */}
            <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Typography variant="subtitle1" fontWeight={700}>{t('notifications.title')}</Typography>
                    {unread > 0 && (
                        <Chip label={unread} size="small" color="error"
                            sx={{ height: 18, fontSize: '0.65rem', '& .MuiChip-label': { px: 0.8 } }} />
                    )}
                </Stack>
                {unread > 0 && (
                    <Button size="small" onClick={() => readAllMut.mutate()} disabled={readAllMut.isPending}
                        sx={{ fontSize: '0.72rem' }}>
                        {t('layout.markAllRead')}
                    </Button>
                )}
            </Box>

            {/* List */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
                {isLoading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                        <CircularProgress size={28} />
                    </Box>
                ) : notifications.length === 0 ? (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                        <NotificationsNone sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                        <Typography variant="body2" color="text.secondary">{t('notifications.noNotifications')}</Typography>
                    </Box>
                ) : (
                    notifications.map(n => (
                        <NotificationItem key={n.id} n={n}
                            onRead={id => readMut.mutate(id)}
                            onDelete={id => deleteMut.mutate(id)} />
                    ))
                )}
            </Box>
        </Popover>
    );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardLayout() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const { t, i18n } = useTranslation();
    const sidebarOpen = useAppSelector((s) => s.ui.sidebarOpen);
    const colorMode = useAppSelector((s) => s.ui.colorMode);
    const user = useAppSelector((s) => s.auth.user);
    const managingOrgId = useAppSelector((s) => s.auth.managingOrgId);
    const managingOrgName = useAppSelector((s) => s.auth.managingOrgName);
    const isSwitched = !!managingOrgId && managingOrgId !== user?.organizationId;

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const [notifAnchor, setNotifAnchor] = useState<null | HTMLElement>(null);
    const [orgPickerOpen, setOrgPickerOpen] = useState(false);
    const [orgSearch, setOrgSearch] = useState('');

    // Auto-expand groups that contain the current path
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
        const s = new Set<string>();
        navStructure.forEach((e) => {
            if (e.kind === 'group' && e.children.some((c) => location.pathname.startsWith(c.path))) {
                s.add(e.id);
            }
        });
        return s;
    });

    const toggleGroup = (id: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // License stats for badge — highlight if any device expiring soon or expired
    const { data: licenseStats } = useQuery({
        queryKey: ['license-stats'],
        queryFn: () => import('@api/license.api').then(m => m.default.getStats()),
        enabled: user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN',
        staleTime: 5 * 60_000,
    });
    const licenseNeedsAttention = (licenseStats?.expiredDevices ?? 0) > 0 || (licenseStats?.expiringIn7 ?? 0) > 0;

    // Pending purchase requests badge for SUPER_ADMIN (license + storage combined)
    const { data: pendingLicenseCount = 0 } = useQuery({
        queryKey: ['license-requests-pending'],
        queryFn: () => import('@api/license.api').then(m =>
            m.default.getPurchaseRequests().then(list => list.filter(r => r.status === 'PENDING').length),
        ),
        enabled: user?.role === 'SUPER_ADMIN',
        staleTime: 2 * 60_000,
    });
    const { data: pendingStorageCount = 0 } = useQuery({
        queryKey: ['storage-pending-count'],
        queryFn: () => import('@api/storage-quota.api').then(m =>
            m.storageQuotaApi.listAllRequests('PENDING').then(list => list.length),
        ),
        enabled: user?.role === 'SUPER_ADMIN',
        staleTime: 2 * 60_000,
    });
    const { data: pendingTransferCount = 0 } = useQuery({
        queryKey: ['license-transfer-requests-pending'],
        queryFn: () => import('@api/license.api').then(m =>
            m.default.getTransferRequests().then(list => list.filter((r: { status: string }) => r.status === 'PENDING').length),
        ),
        enabled: user?.role === 'SUPER_ADMIN',
        staleTime: 2 * 60_000,
    });
    const pendingRequestCount = pendingLicenseCount + pendingStorageCount + pendingTransferCount;

    const { data: notifData } = useQuery({
        queryKey: ['notifications'],
        queryFn: () => notificationsApi.list({ limit: 50 }),
        refetchInterval: 60_000,
    });
    const unreadCount = notifData?.unreadCount ?? 0;

    const queryClient = useQueryClient();
    const { socket } = useSocket();
    const [screenshot, setScreenshot] = useState<{ deviceId: string; deviceName: string; url: string; timestamp: string } | null>(null);

    const { data: orgData } = useQuery({
        queryKey: ['org-me'],
        queryFn: organizationsApi.getMe,
        staleTime: 5 * 60_000,
    });

    const { data: allOrgs = [] } = useQuery({
        queryKey: ['super-admin-orgs'],
        queryFn: organizationsApi.listAll,
        enabled: user?.role === 'SUPER_ADMIN',
        staleTime: 2 * 60_000,
    });

    useEffect(() => {
        if (!socket) return;

        const invalidateContent = () => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
            queryClient.invalidateQueries({ queryKey: ['media'] });
        };

        const handleDeviceStatus = (data: { deviceId: string; status: string }) => {
            if (data.status === 'ONLINE' || data.status === 'OFFLINE') {
                queryClient.invalidateQueries({ queryKey: ['devices'] });
            }
        };

        const handleScreenshot = (data: { deviceId: string; deviceName: string; url: string; timestamp: string }) => {
            setScreenshot(data);
        };

        const handleDeviceError = (data: { deviceId: string; code: string; message: string }) => {
            dispatch(pushToast({
                severity: 'error',
                message: `Device ${data.deviceId.slice(0, 8)}: ${data.message}`,
            }));
        };

        const handleNewNotification = (data: AppNotification) => {
            queryClient.invalidateQueries({ queryKey: ['notifications'] });

            // Invalidate relevant data queries so lists refresh immediately
            if (data.type === 'LICENSE_REQUEST_NEW') {
                queryClient.invalidateQueries({ queryKey: ['license-requests'] });
                queryClient.invalidateQueries({ queryKey: ['license-requests-pending'] });
            }
            if (data.type === 'STORAGE_REQUEST_NEW') {
                queryClient.invalidateQueries({ queryKey: ['storage-requests-all'] });
                queryClient.invalidateQueries({ queryKey: ['storage-pending-count'] });
            }
            if (data.type === 'TRANSFER_REQUEST_NEW' || data.type === 'TRANSFER_REQUEST_APPROVED' || data.type === 'TRANSFER_REQUEST_REJECTED') {
                queryClient.invalidateQueries({ queryKey: ['license-transfer-requests'] });
                queryClient.invalidateQueries({ queryKey: ['license-transfer-requests-pending'] });
            }

            const meta = NOTIF_META[data.type];
            dispatch(pushToast({
                severity: meta?.color === 'error' ? 'error'
                    : meta?.color === 'warning' ? 'warning'
                    : meta?.color === 'success' ? 'success' : 'info',
                message: data.title,
            }));
        };

        socket.on('content.update', invalidateContent);
        socket.on('schedule.update', invalidateContent);
        socket.on('device.status', handleDeviceStatus);
        socket.on('device.screenshot', handleScreenshot);
        socket.on('device.error', handleDeviceError);
        socket.on('notification:new', handleNewNotification);

        return () => {
            socket.off('content.update', invalidateContent);
            socket.off('schedule.update', invalidateContent);
            socket.off('device.status', handleDeviceStatus);
            socket.off('device.screenshot', handleScreenshot);
            socket.off('device.error', handleDeviceError);
            socket.off('notification:new', handleNewNotification);
        };
    }, [socket, queryClient]);

    const drawerWidth = sidebarOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH;

    const handleLogout = async () => {
        try {
            await authApi.logout();
        } catch { /* ignore */ }
        dispatch(logout());
        queryClient.clear();
        navigate('/login', { replace: true, state: {} });
    };

    const handleSwitchOrg = (org: OrgWithStats) => {
        if (!org.isActive) return;
        const currentOrgId = managingOrgId ?? user?.organizationId;
        if (org.id === currentOrgId) { setOrgPickerOpen(false); return; }
        dispatch(setManagingOrg({ orgId: org.id, orgName: org.name }));
        queryClient.clear();
        setOrgPickerOpen(false);
        navigate('/dashboard');
    };

    const handleExitOrg = () => {
        dispatch(setManagingOrg(null));
        queryClient.clear();
        navigate('/dashboard');
    };

    const displayOrgName = isSwitched ? managingOrgName : (orgData?.name ?? '');

    // ── Nav rendering helpers ─────────────────────────────────────────────────

    const renderItem = (item: NavLeaf, indented = false) => {
        if (item.roles && !(user?.role && item.roles.includes(user.role))) return null;
        const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
        const isLicenseItem = item.path === '/license';
        const isLicenseMgmtItem = item.path === '/license-management';
        const showBadge = (isLicenseItem && licenseNeedsAttention) || (isLicenseMgmtItem && pendingRequestCount > 0);
        const badgeColor: 'error' | 'warning' = isLicenseMgmtItem ? 'error'
            : (licenseStats?.expiringIn7 ?? 0) > 0 ? 'warning' : 'error';

        return (
            <Tooltip key={item.path} title={!sidebarOpen ? item.label : ''} placement="right">
                <ListItemButton
                    selected={active}
                    onClick={() => navigate(item.path)}
                    sx={{
                        borderRadius: 2,
                        mb: 0.5,
                        minHeight: 44,
                        justifyContent: sidebarOpen ? 'flex-start' : 'center',
                        pl: sidebarOpen ? (indented ? 3.5 : 2) : 1.5,
                        pr: sidebarOpen ? 2 : 1.5,
                        '&.Mui-selected': {
                            background: 'linear-gradient(135deg, rgba(37,99,235,0.12), rgba(37,99,235,0.06))',
                            color: 'primary.main',
                            border: '1px solid',
                            borderColor: 'primary.main',
                            '& .MuiListItemIcon-root': { color: 'primary.main' },
                        },
                    }}
                >
                    <ListItemIcon sx={{ minWidth: sidebarOpen ? 40 : 0 }}>
                        <Badge
                            badgeContent={!isLicenseMgmtItem && sidebarOpen ? (pendingRequestCount || undefined) : undefined}
                            variant="dot"
                            color={badgeColor}
                            invisible={!showBadge}
                        >
                            {item.icon}
                        </Badge>
                    </ListItemIcon>
                    {sidebarOpen && (
                        <ListItemText
                            primary={item.label}
                            primaryTypographyProps={{ fontWeight: active ? 600 : 400, fontSize: indented ? '0.85rem' : undefined }}
                        />
                    )}
                </ListItemButton>
            </Tooltip>
        );
    };

    const renderGroup = (group: NavGroup) => {
        if (group.roles && !(user?.role && group.roles.includes(user.role))) return null;
        const isExpanded = expandedGroups.has(group.id);
        const isAnyChildActive = group.children.some((c) => location.pathname.startsWith(c.path));

        const handleGroupClick = () => {
            if (sidebarOpen) {
                toggleGroup(group.id);
            } else {
                // Collapsed: navigate to first child
                const firstChild = group.children[0];
                if (firstChild) navigate(firstChild.path);
            }
        };

        return (
            <Box key={group.id}>
                <Tooltip title={!sidebarOpen ? group.label : ''} placement="right">
                    <ListItemButton
                        onClick={handleGroupClick}
                        sx={{
                            borderRadius: 2,
                            mb: 0.5,
                            minHeight: 44,
                            justifyContent: sidebarOpen ? 'flex-start' : 'center',
                            px: sidebarOpen ? 2 : 1.5,
                            ...(isAnyChildActive && {
                                color: 'primary.main',
                                '& .MuiListItemIcon-root': { color: 'primary.main' },
                            }),
                        }}
                    >
                        <ListItemIcon sx={{ minWidth: sidebarOpen ? 40 : 0, color: isAnyChildActive ? 'primary.main' : 'text.secondary' }}>
                            {group.icon}
                        </ListItemIcon>
                        {sidebarOpen && (
                            <>
                                <ListItemText
                                    primary={group.label}
                                    primaryTypographyProps={{ fontWeight: isAnyChildActive ? 600 : 400 }}
                                />
                                {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                            </>
                        )}
                    </ListItemButton>
                </Tooltip>

                {sidebarOpen && (
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <List disablePadding sx={{ pl: 0.5 }}>
                            {group.children.map((child) => renderItem(child, true))}
                        </List>
                    </Collapse>
                )}
            </Box>
        );
    };

    // ── Org picker dialog ─────────────────────────────────────────────────────

    const orgPickerDialog = (
        <Dialog
            open={orgPickerOpen}
            onClose={() => { setOrgPickerOpen(false); setOrgSearch(''); }}
            maxWidth="xs"
            fullWidth
            PaperProps={{ sx: { borderRadius: 3 } }}
        >
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5 }}>
                <Box sx={{
                    width: 34, height: 34, borderRadius: 2, flexShrink: 0,
                    bgcolor: alpha('#6C63FF', 0.12),
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'primary.main',
                }}>
                    <SwapHoriz fontSize="small" />
                </Box>
                <Box flex={1}>
                    <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
                        {t('layout.switchOrg')}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {t('layout.orgCount', { count: allOrgs.length })}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={() => { setOrgPickerOpen(false); setOrgSearch(''); }}>
                    <Close fontSize="small" />
                </IconButton>
            </DialogTitle>
            <Divider />
            <Box sx={{ px: 2, py: 1.5 }}>
                <TextField
                    size="small"
                    fullWidth
                    placeholder={t('common.search') + '...'}
                    value={orgSearch}
                    onChange={e => setOrgSearch(e.target.value)}
                    autoFocus
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search sx={{ fontSize: 18, color: 'text.secondary' }} />
                            </InputAdornment>
                        ),
                        endAdornment: orgSearch ? (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setOrgSearch('')} edge="end">
                                    <Close sx={{ fontSize: 16 }} />
                                </IconButton>
                            </InputAdornment>
                        ) : null,
                    }}
                />
            </Box>
            <Divider />
            <DialogContent sx={{ p: 0, maxHeight: 340, overflowY: 'auto' }}>
                <List disablePadding>
                    {allOrgs
                        .filter(o => o.name.toLowerCase().includes(orgSearch.toLowerCase()) || o.slug?.toLowerCase().includes(orgSearch.toLowerCase()))
                        .map((org) => {
                        const isSelected = org.id === (managingOrgId ?? user?.organizationId);
                        const isOwn = org.id === user?.organizationId;
                        return (
                            <ListItemButton
                                key={org.id}
                                onClick={() => handleSwitchOrg(org)}
                                disabled={!org.isActive && !isOwn}
                                selected={isSelected}
                                sx={{
                                    px: 2.5, py: 1.25,
                                    '&.Mui-selected': {
                                        bgcolor: alpha('#6C63FF', 0.07),
                                        '&:hover': { bgcolor: alpha('#6C63FF', 0.11) },
                                    },
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 36 }}>
                                    <Business
                                        fontSize="small"
                                        sx={{ color: isSelected ? 'primary.main' : 'text.disabled' }}
                                    />
                                </ListItemIcon>
                                <ListItemText
                                    primary={org.name}
                                    secondary={org.slug}
                                    primaryTypographyProps={{
                                        fontWeight: isSelected ? 700 : 400,
                                        fontSize: '0.875rem',
                                        color: !org.isActive ? 'text.disabled' : 'text.primary',
                                    }}
                                    secondaryTypographyProps={{ fontSize: '0.72rem' }}
                                />
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1 }}>
                                    {isOwn && (
                                        <Chip
                                            label="own"
                                            size="small"
                                            sx={{ height: 18, fontSize: '0.65rem', fontWeight: 600 }}
                                        />
                                    )}
                                    {!org.isActive && (
                                        <Chip
                                            label="off"
                                            size="small"
                                            sx={{ height: 18, fontSize: '0.65rem', opacity: 0.5 }}
                                        />
                                    )}
                                    {isSelected && (
                                        <CheckCircle sx={{ fontSize: 16, color: 'primary.main' }} />
                                    )}
                                </Box>
                            </ListItemButton>
                        );
                    })}
                    {allOrgs.filter(o => o.name.toLowerCase().includes(orgSearch.toLowerCase()) || o.slug?.toLowerCase().includes(orgSearch.toLowerCase())).length === 0 && (
                        <Box sx={{ py: 4, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                                {t('layout.noOrgsFound')}
                            </Typography>
                        </Box>
                    )}
                </List>
            </DialogContent>
            {isSwitched && (
                <>
                    <Divider />
                    <DialogActions sx={{ px: 3, pb: 2 , pt:2}}>
                        <Button
                            size="small"
                            color="warning"
                            variant="outlined"
                            startIcon={<Close fontSize="small" />}
                            onClick={() => { handleExitOrg(); setOrgPickerOpen(false); }}
                            sx={{ borderRadius: 2 }}
                        >
                            {t('layout.exitManaging')}
                        </Button>
                    </DialogActions>
                </>
            )}
        </Dialog>
    );

    // ── Sidebar content ───────────────────────────────────────────────────────

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Logo */}
            <Toolbar sx={{ px: 2, minHeight: '64px !important' }}>
                {sidebarOpen ? (
                    <>
                        <Box sx={{ mr: 1.5, flexShrink: 0, display: 'flex', alignItems: 'center', height: 32 }}>
                            <img
                                src="/logo-icon.png"
                                alt="DMS Signage"
                                style={{ height: 32, width: 'auto', maxWidth: 120, objectFit: 'contain', display: 'block' }}
                                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                            />
                        </Box>
                        <Typography variant="h6" fontWeight={700} noWrap sx={{ flex: 1 }}>
                            DMS Signage
                        </Typography>
                        <IconButton size="small" onClick={() => dispatch(setSidebarOpen(false))}>
                            <ChevronLeft fontSize="small" />
                        </IconButton>
                    </>
                ) : (
                    <Box
                        sx={{ mx: 'auto', flexShrink: 0, display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                        onClick={() => dispatch(setSidebarOpen(true))}
                    >
                        <img
                            src="/logo-icon.png"
                            alt="DMS"
                            style={{ height: 32, width: 32, objectFit: 'contain', display: 'block' }}
                            onError={(e) => {
                                const el = e.currentTarget as HTMLImageElement;
                                el.style.display = 'none';
                                const fallback = el.nextElementSibling as HTMLElement | null;
                                if (fallback) fallback.style.display = 'flex';
                            }}
                        />
                        <Box sx={{
                            display: 'none', width: 32, height: 32, borderRadius: 2,
                            background: 'linear-gradient(135deg, #2563EB, #60A5FA)',
                            alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Typography sx={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>DMS</Typography>
                        </Box>
                    </Box>
                )}
            </Toolbar>
            <Divider />

            {/* Nav entries */}
            <List sx={{ flex: 1, px: sidebarOpen ? 1 : 0.5, py: 1, overflowY: 'auto', overflowX: 'hidden' }}>
                {navStructure.map((entry) => {
                    if (entry.kind === 'item') return renderItem(entry);
                    return renderGroup(entry);
                })}

                {/* Super Admin section */}
                {user?.role === 'SUPER_ADMIN' && (
                    <>
                        <Divider sx={{ my: 1 }} />
                        {sidebarOpen && (
                            <Typography
                                variant="caption" color="error.main" fontWeight={700}
                                sx={{ px: 2, py: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 1 }}
                            >
                                {t('nav.system')}
                            </Typography>
                        )}
                        {superAdminItems.map((item) => {
                            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
                            const isLicenseMgmt = item.path === '/license-management';
                            const showPendingBadge = isLicenseMgmt && pendingRequestCount > 0;
                            return (
                                <Tooltip key={item.path} title={!sidebarOpen ? item.label : ''} placement="right">
                                    <ListItemButton
                                        selected={active}
                                        onClick={() => navigate(item.path)}
                                        sx={{
                                            borderRadius: 2, mb: 0.5, minHeight: 44,
                                            justifyContent: sidebarOpen ? 'flex-start' : 'center',
                                            px: sidebarOpen ? 2 : 1.5,
                                            '&.Mui-selected': {
                                                background: 'linear-gradient(135deg, rgba(244,67,54,0.15), rgba(244,67,54,0.08))',
                                                color: 'error.main',
                                                border: '1px solid',
                                                borderColor: 'error.main',
                                                '& .MuiListItemIcon-root': { color: 'error.main' },
                                            },
                                        }}
                                    >
                                        <ListItemIcon sx={{
                                            minWidth: sidebarOpen ? 40 : 0,
                                            color: active ? 'error.main' : 'text.secondary',
                                        }}>
                                            <Badge
                                                badgeContent={!sidebarOpen && showPendingBadge ? pendingRequestCount : undefined}
                                                color="error"
                                                invisible={sidebarOpen || !showPendingBadge}
                                            >
                                                {item.icon}
                                            </Badge>
                                        </ListItemIcon>
                                        {sidebarOpen && (
                                            <ListItemText
                                                primary={item.label}
                                                primaryTypographyProps={{ fontWeight: active ? 600 : 400 }}
                                                secondary={showPendingBadge ? t('superAdmin.pendingRequests', { count: pendingRequestCount }) : undefined}
                                                secondaryTypographyProps={{ color: 'error.main', fontSize: '0.7rem', fontWeight: 600 }}
                                            />
                                        )}
                                    </ListItemButton>
                                </Tooltip>
                            );
                        })}
                    </>
                )}
            </List>

            <Divider />
            {/* User section */}
            <Box sx={{
                p: sidebarOpen ? 2 : 1,
                display: 'flex', alignItems: 'center', gap: 1.5,
                justifyContent: sidebarOpen ? 'flex-start' : 'center',
            }}>
                <Avatar
                    sx={{
                        width: 36, height: 36, minWidth: 36, minHeight: 36,
                        bgcolor: 'primary.main',
                        cursor: 'pointer', fontSize: '0.875rem', flexShrink: 0,
                    }}
                    onClick={(e) => setAnchorEl(e.currentTarget)}
                >
                    {user?.email?.[0]?.toUpperCase()}
                </Avatar>
                {sidebarOpen && (
                    <Box sx={{ overflow: 'hidden', flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                            {user?.email}
                        </Typography>
                        <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>
                            {user?.role}
                        </Typography>
                    </Box>
                )}
            </Box>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem onClick={handleLogout}>
                    <Logout fontSize="small" sx={{ mr: 1 }} /> {t('auth.logout')}
                </MenuItem>
            </Menu>
        </Box>
    );

    return (
        <>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            {/* Permanent sidebar (desktop) */}
            {!isMobile && (
                <Drawer
                    variant="permanent"
                    open
                    sx={{
                        width: drawerWidth,
                        flexShrink: 0,
                        '& .MuiDrawer-paper': {
                            width: drawerWidth,
                            overflowX: 'hidden',
                            transition: theme.transitions.create('width', {
                                easing: theme.transitions.easing.sharp,
                                duration: theme.transitions.duration.enteringScreen,
                            }),
                        },
                    }}
                >
                    {drawerContent}
                </Drawer>
            )}

            {/* Temporary sidebar (mobile) */}
            {isMobile && (
                <Drawer
                    variant="temporary"
                    open={sidebarOpen}
                    onClose={() => dispatch(setSidebarOpen(false))}
                    ModalProps={{ keepMounted: false }}
                    sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH, overflowX: 'hidden' } }}
                >
                    {drawerContent}
                </Drawer>
            )}

            {/* Main content */}
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                {/* Top app bar */}
                <AppBar position="sticky" elevation={0}>
                    <Toolbar sx={{ gap: 1 }}>
                        <IconButton
                            edge="start"
                            onClick={() => dispatch(setSidebarOpen(!sidebarOpen))}
                            sx={{ display: isMobile ? 'flex' : 'none' }}
                        >
                            <MenuIcon />
                        </IconButton>

                        <Typography variant="h6" fontWeight={600} sx={{ flex: 1 }}>
                            {findLabel([...navStructure, ...superAdminItems], location.pathname)}
                        </Typography>

                        {/* Org indicator */}
                        {displayOrgName && (
                            <Tooltip
                                title={
                                    user?.role === 'SUPER_ADMIN'
                                        ? isSwitched
                                            ? `${t('layout.managing')} — ${t('layout.switchOrg')}`
                                            : t('layout.switchOrg')
                                        : orgData?.name ?? ''
                                }
                                placement="bottom"
                            >
                                <Chip
                                    size="small"
                                    icon={<Business sx={{ fontSize: '14px !important' }} />}
                                    label={displayOrgName}
                                    variant="outlined"
                                    color={isSwitched ? 'warning' : 'default'}
                                    onClick={
                                        user?.role === 'SUPER_ADMIN'
                                            ? () => setOrgPickerOpen(true)
                                            : undefined
                                    }
                                    onDelete={
                                        user?.role === 'SUPER_ADMIN'
                                            ? isSwitched
                                                ? handleExitOrg
                                                : () => setOrgPickerOpen(true)
                                            : undefined
                                    }
                                    deleteIcon={
                                        isSwitched
                                            ? <Close sx={{ fontSize: '14px !important' }} />
                                            : <SwapHoriz sx={{ fontSize: '14px !important' }} />
                                    }
                                    sx={{
                                        height: 28,
                                        fontWeight: 500,
                                        fontSize: '0.75rem',
                                        cursor: user?.role === 'SUPER_ADMIN' ? 'pointer' : 'default',
                                        maxWidth: 200,
                                        '& .MuiChip-label': { px: 1 },
                                        ...(isSwitched && {
                                            borderColor: 'warning.main',
                                            bgcolor: alpha('#FF9800', 0.08),
                                            '& .MuiChip-icon': { color: 'warning.main' },
                                        }),
                                    }}
                                />
                            </Tooltip>
                        )}

                        {/* Language switcher */}
                        <Tooltip title={t('layout.language')}>
                            <IconButton
                                onClick={() => i18n.changeLanguage(i18n.language === 'vi' ? 'en' : 'vi')}
                                sx={{ fontSize: '0.8rem', fontWeight: 700, width: 36, height: 36 }}
                            >
                                <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.75rem', lineHeight: 1 }}>
                                    {i18n.language === 'vi' ? 'EN' : 'VI'}
                                </Typography>
                            </IconButton>
                        </Tooltip>

                        {/* Dark/light toggle */}
                        <Tooltip title={colorMode === 'dark' ? t('layout.lightMode') : t('layout.darkMode')}>
                            <IconButton onClick={() => dispatch(toggleColorMode())}>
                                {colorMode === 'dark' ? <LightMode /> : <DarkMode />}
                            </IconButton>
                        </Tooltip>

                        {/* Notifications */}
                        <Tooltip title={t('layout.notifications')}>
                            <IconButton onClick={e => setNotifAnchor(e.currentTarget)}>
                                <Badge badgeContent={unreadCount || undefined} color="error" max={99}>
                                    {unreadCount > 0 ? <NotificationsActive /> : <NotificationsNone />}
                                </Badge>
                            </IconButton>
                        </Tooltip>
                    </Toolbar>
                </AppBar>

                {/* Page content */}
                <Box
                    component="main"
                    sx={{ flex: 1, p: { xs: 2, md: 3 }, backgroundColor: 'background.default' }}
                >
                    <Outlet key={managingOrgId ?? 'own'} />
                </Box>
            </Box>
        </Box>

        {/* Org switcher dialog (SUPER_ADMIN only) */}
        {orgPickerDialog}

        {/* Notification panel */}
        <NotificationPanel anchorEl={notifAnchor} onClose={() => setNotifAnchor(null)} />

        {/* Screenshot dialog */}
        <Dialog open={Boolean(screenshot)} onClose={() => setScreenshot(null)} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pb: 1 }}>
                <Box>
                    <Typography variant="h6" fontWeight={700}>Device Screenshot</Typography>
                    <Typography variant="caption" color="text.secondary">
                        {screenshot?.deviceName ?? `Device ${screenshot?.deviceId?.slice(0, 8)}…`}
                        {screenshot?.timestamp ? ` · ${new Date(screenshot.timestamp).toLocaleString()}` : ''}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={() => setScreenshot(null)} sx={{ mt: -0.5 }}>
                    <Close fontSize="small" />
                </IconButton>
            </DialogTitle>
            <DialogContent sx={{ p: 0, bgcolor: 'grey.900' }}>
                {screenshot?.url ? (
                    <img
                        src={screenshot.url}
                        alt="Device screenshot"
                        style={{ width: '100%', display: 'block', maxHeight: '70vh', objectFit: 'contain' }}
                    />
                ) : (
                    <Box sx={{ p: 6, textAlign: 'center' }}>
                        <Typography color="grey.500">No screenshot URL received from device</Typography>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2, pt: 2 }}>
                {screenshot?.url && (
                    <Button
                        size="small"
                        startIcon={<Download />}
                        onClick={async () => {
                            try {
                                const res = await fetch(screenshot.url);
                                const blob = await res.blob();
                                const blobUrl = URL.createObjectURL(blob);
                                const d = new Date(screenshot.timestamp);
                                const pad = (n: number) => String(n).padStart(2, '0');
                                const ts = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
                                const a = document.createElement('a');
                                a.href = blobUrl;
                                a.download = `${screenshot.deviceName}_${ts}.png`;
                                a.click();
                                URL.revokeObjectURL(blobUrl);
                            } catch {
                                // ignore download errors
                            }
                        }}
                    >
                        Tải về
                    </Button>
                )}
                <Button size="small" onClick={() => setScreenshot(null)}>Close</Button>
            </DialogActions>
        </Dialog>
        </>
    );
}
