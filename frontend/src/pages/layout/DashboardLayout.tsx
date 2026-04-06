import { useState, useEffect, type ReactNode } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useSocket } from '@hooks/useSocket';
import {
    Box, Drawer, AppBar, Toolbar, Typography, IconButton, Avatar,
    List, ListItemButton, ListItemIcon, ListItemText, Tooltip,
    Divider, Menu, MenuItem, Badge, useTheme, useMediaQuery,
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    Chip, alpha, Collapse, TextField, InputAdornment,
} from '@mui/material';
import {
    Dashboard, PermMedia, QueueMusic, CalendarMonth, BarChart,
    People, Settings, Menu as MenuIcon, LightMode, DarkMode,
    NotificationsNone, Logout, ChevronLeft, AdminPanelSettings, Close,
    SwapHoriz, Business, CheckCircle, WorkspacePremium, Search,
    Storefront, DashboardCustomize, Slideshow, Today, History,
    NotificationsActive, PlayCircleOutline, SystemUpdate, TouchApp,
    Assignment, ExpandMore, ExpandLess, DevicesOther, PhotoLibrary, LibraryBooks,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { toggleColorMode, setSidebarOpen, pushToast } from '@store/slices/uiSlice';
import { logout, setManagingOrg } from '@store/slices/authSlice';
import { authApi } from '@api/auth.api';
import { platformAuthApi } from '@api/platform-auth.api';
import { organizationsApi, type OrgWithStats } from '@api/organizations.api';

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
    { kind: 'item', label: 'Dashboard', icon: <Dashboard />, path: '/dashboard', roles: null },
    { kind: 'item', label: 'Sites Management', icon: <Storefront />, path: '/sites', roles: null },
    { kind: 'item', label: 'Device Management', icon: <DevicesOther />, path: '/device-management', roles: null },
    {
        kind: 'group', id: 'content-management', label: 'Content Management', icon: <PhotoLibrary />,
        children: [
            { kind: 'item', label: 'Media Library', icon: <PermMedia />, path: '/media', roles: null },
            { kind: 'item', label: 'Playlist', icon: <QueueMusic />, path: '/playlists', roles: null },
            { kind: 'item', label: 'Schedule', icon: <Today />, path: '/schedules', roles: null },
            { kind: 'item', label: 'Schedule Assignment', icon: <CalendarMonth />, path: '/schedule-assignment', roles: null },
        ],
    },
    {
        kind: 'group', id: 'history', label: 'History', icon: <History />,
        roles: ['SUPER_ADMIN'],
        children: [
            { kind: 'item', label: 'Status Alarm', icon: <NotificationsActive />, path: '/history/alarm', roles: null },
            { kind: 'item', label: 'Content History', icon: <PlayCircleOutline />, path: '/history/content', roles: null },
            { kind: 'item', label: 'Software History', icon: <SystemUpdate />, path: '/history/software', roles: null },
            { kind: 'item', label: 'Action History', icon: <Assignment />, path: '/history/action', roles: null },
        ],
    },
    { kind: 'item', label: 'Users', icon: <People />, path: '/users', roles: ['SUPER_ADMIN'] },
    { kind: 'item', label: 'License', icon: <WorkspacePremium />, path: '/license', roles: ['ADMIN', 'MANAGER', 'SUPER_ADMIN'] },
    { kind: 'item', label: 'Settings', icon: <Settings />, path: '/settings', roles: ['SUPER_ADMIN'] },
];

const superAdminItems: NavLeaf[] = [
    { kind: 'item', label: 'Super Admin',        icon: <AdminPanelSettings />, path: '/super-admin' },
    { kind: 'item', label: 'License Management', icon: <WorkspacePremium />,   path: '/license-management' },
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function DashboardLayout() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const sidebarOpen = useAppSelector((s) => s.ui.sidebarOpen);
    const colorMode = useAppSelector((s) => s.ui.colorMode);
    const user = useAppSelector((s) => s.auth.user);
    const isPlatformAdmin = useAppSelector((s) => s.auth.isPlatformAdmin);
    const platformAdmin = useAppSelector((s) => s.auth.platformAdmin);
    const managingOrgId = useAppSelector((s) => s.auth.managingOrgId);
    const managingOrgName = useAppSelector((s) => s.auth.managingOrgName);
    const isSwitched = !!managingOrgId && managingOrgId !== user?.organizationId;

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
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

    // Pending purchase requests badge for SUPER_ADMIN
    const { data: pendingRequestCount = 0 } = useQuery({
        queryKey: ['license-requests-pending'],
        queryFn: () => import('@api/license.api').then(m =>
            m.default.getPurchaseRequests().then(list => list.filter(r => r.status === 'PENDING').length),
        ),
        enabled: user?.role === 'SUPER_ADMIN',
        staleTime: 2 * 60_000,
    });

    const queryClient = useQueryClient();
    const { socket } = useSocket();
    const [screenshot, setScreenshot] = useState<{ deviceId: string; url: string; timestamp: string } | null>(null);

    const { data: orgData } = useQuery({
        queryKey: ['org-me'],
        queryFn: organizationsApi.getMe,
        staleTime: 5 * 60_000,
    });

    const { data: allOrgs = [] } = useQuery({
        queryKey: ['super-admin-orgs'],
        queryFn: organizationsApi.listAll,
        enabled: user?.role === 'SUPER_ADMIN' || isPlatformAdmin,
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

        const handleScreenshot = (data: { deviceId: string; url: string; timestamp: string }) => {
            setScreenshot(data);
        };

        const handleDeviceError = (data: { deviceId: string; code: string; message: string }) => {
            dispatch(pushToast({
                severity: 'error',
                message: `Device ${data.deviceId.slice(0, 8)}: ${data.message}`,
            }));
        };

        socket.on('content.update', invalidateContent);
        socket.on('schedule.update', invalidateContent);
        socket.on('device.status', handleDeviceStatus);
        socket.on('device.screenshot', handleScreenshot);
        socket.on('device.error', handleDeviceError);

        return () => {
            socket.off('content.update', invalidateContent);
            socket.off('schedule.update', invalidateContent);
            socket.off('device.status', handleDeviceStatus);
            socket.off('device.screenshot', handleScreenshot);
            socket.off('device.error', handleDeviceError);
        };
    }, [socket, queryClient]);

    const drawerWidth = sidebarOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH;

    const handleLogout = async () => {
        try {
            if (isPlatformAdmin) {
                await platformAuthApi.logout();
            } else {
                await authApi.logout();
            }
        } catch { /* ignore */ }
        dispatch(logout());
        queryClient.clear();
        navigate(isPlatformAdmin ? '/platform/login' : '/login', { replace: true, state: {} });
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
        const active = location.pathname.startsWith(item.path);
        const isLicenseItem = item.path === '/license';
        const isLicenseMgmtItem = item.path === '/license-management';
        const showBadge = (isLicenseItem && licenseNeedsAttention) || (isLicenseMgmtItem && pendingRequestCount > 0);
        const badgeColor = isLicenseMgmtItem ? 'warning'
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
                            background: 'linear-gradient(135deg, rgba(108,99,255,0.2), rgba(108,99,255,0.1))',
                            color: 'primary.main',
                            '& .MuiListItemIcon-root': { color: 'primary.main' },
                        },
                    }}
                >
                    <ListItemIcon sx={{ minWidth: sidebarOpen ? 40 : 0, color: 'text.secondary' }}>
                        <Badge
                            badgeContent={isLicenseMgmtItem && sidebarOpen ? (pendingRequestCount || undefined) : undefined}
                            variant={isLicenseMgmtItem && sidebarOpen ? 'standard' : 'dot'}
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
                        Chuyển tổ chức
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        {allOrgs.length} tổ chức
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
                    placeholder="Tìm tổ chức..."
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
                                Không tìm thấy tổ chức nào
                            </Typography>
                        </Box>
                    )}
                </List>
            </DialogContent>
            {isSwitched && (
                <>
                    <Divider />
                    <DialogActions sx={{ px: 2.5, py: 1.5 }}>
                        <Button
                            size="small"
                            color="warning"
                            variant="outlined"
                            startIcon={<Close fontSize="small" />}
                            onClick={() => { handleExitOrg(); setOrgPickerOpen(false); }}
                            sx={{ borderRadius: 2 }}
                        >
                            Thoát quản lý
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
                        <Box sx={{
                            width: 32, height: 32, borderRadius: 2,
                            background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
                            mr: 1.5, flexShrink: 0,
                        }} />
                        <Typography variant="h6" fontWeight={700} noWrap sx={{ flex: 1 }}>
                            SignageCMS
                        </Typography>
                        <IconButton size="small" onClick={() => dispatch(setSidebarOpen(false))}>
                            <ChevronLeft fontSize="small" />
                        </IconButton>
                    </>
                ) : (
                    <Box
                        sx={{
                            width: 32, height: 32, minWidth: 32, borderRadius: 2, mx: 'auto',
                            flexShrink: 0,
                            background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
                            cursor: 'pointer',
                        }}
                        onClick={() => dispatch(setSidebarOpen(true))}
                    />
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
                {(user?.role === 'SUPER_ADMIN' || isPlatformAdmin) && (
                    <>
                        <Divider sx={{ my: 1 }} />
                        {sidebarOpen && (
                            <Typography
                                variant="caption" color="error.main" fontWeight={700}
                                sx={{ px: 2, py: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 1 }}
                            >
                                System
                            </Typography>
                        )}
                        {superAdminItems.map((item) => {
                            const active = location.pathname.startsWith(item.path);
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
                                                '& .MuiListItemIcon-root': { color: 'error.main' },
                                            },
                                        }}
                                    >
                                        <ListItemIcon sx={{
                                            minWidth: sidebarOpen ? 40 : 0,
                                            color: active ? 'error.main' : 'text.secondary',
                                        }}>
                                            {item.icon}
                                        </ListItemIcon>
                                        {sidebarOpen && (
                                            <ListItemText
                                                primary={item.label}
                                                primaryTypographyProps={{ fontWeight: active ? 600 : 400 }}
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
                        bgcolor: isPlatformAdmin ? '#c0392b' : 'primary.main',
                        cursor: 'pointer', fontSize: '0.875rem', flexShrink: 0,
                    }}
                    onClick={(e) => setAnchorEl(e.currentTarget)}
                >
                    {isPlatformAdmin
                        ? (platformAdmin?.name?.[0] ?? 'P').toUpperCase()
                        : user?.email?.[0]?.toUpperCase()}
                </Avatar>
                {sidebarOpen && (
                    <Box sx={{ overflow: 'hidden', flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                            {isPlatformAdmin ? platformAdmin?.name : user?.email}
                        </Typography>
                        <Typography variant="caption" noWrap
                            sx={{ color: isPlatformAdmin ? 'error.main' : 'text.secondary', fontWeight: isPlatformAdmin ? 700 : 400 }}>
                            {isPlatformAdmin ? 'PLATFORM ADMIN' : user?.role}
                        </Typography>
                    </Box>
                )}
            </Box>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem onClick={handleLogout}>
                    <Logout fontSize="small" sx={{ mr: 1 }} /> Logout
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
                                            ? 'Đang quản lý org này — click để đổi'
                                            : 'Chuyển tổ chức'
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

                        {/* Dark/light toggle */}
                        <Tooltip title={colorMode === 'dark' ? 'Light mode' : 'Dark mode'}>
                            <IconButton onClick={() => dispatch(toggleColorMode())}>
                                {colorMode === 'dark' ? <LightMode /> : <DarkMode />}
                            </IconButton>
                        </Tooltip>

                        {/* Notifications (placeholder) */}
                        <Tooltip title="Notifications">
                            <IconButton>
                                <Badge badgeContent={0} color="error">
                                    <NotificationsNone />
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

        {/* Screenshot dialog */}
        <Dialog open={Boolean(screenshot)} onClose={() => setScreenshot(null)} maxWidth="md" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pb: 1 }}>
                <Box>
                    <Typography variant="h6" fontWeight={700}>Device Screenshot</Typography>
                    <Typography variant="caption" color="text.secondary">
                        Device {screenshot?.deviceId?.slice(0, 8)}…
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
            <DialogActions sx={{ p: 2 }}>
                <Button onClick={() => setScreenshot(null)}>Close</Button>
            </DialogActions>
        </Dialog>
        </>
    );
}
