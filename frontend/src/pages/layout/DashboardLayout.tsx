import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@hooks/useSocket';
import {
    Box, Drawer, AppBar, Toolbar, Typography, IconButton, Avatar,
    List, ListItemButton, ListItemIcon, ListItemText, Tooltip,
    Divider, Menu, MenuItem, Badge, useTheme, useMediaQuery,
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
} from '@mui/material';
import {
    Dashboard, Tv, PermMedia, QueueMusic, CalendarMonth, BarChart,
    People, Settings, Menu as MenuIcon, LightMode, DarkMode,
    NotificationsNone, Logout, ChevronLeft, AdminPanelSettings, Close,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { toggleColorMode, setSidebarOpen } from '@store/slices/uiSlice';
import { logout } from '@store/slices/authSlice';
import { authApi } from '@api/auth.api';

const DRAWER_WIDTH = 240;
const COLLAPSED_WIDTH = 72;

const navItems = [
    { label: 'Dashboard', icon: <Dashboard />, path: '/dashboard' },
    { label: 'Devices', icon: <Tv />, path: '/devices' },
    { label: 'Media', icon: <PermMedia />, path: '/media' },
    { label: 'Playlists', icon: <QueueMusic />, path: '/playlists' },
    { label: 'Schedules', icon: <CalendarMonth />, path: '/schedules' },
    { label: 'Analytics', icon: <BarChart />, path: '/analytics' },
    { label: 'Users', icon: <People />, path: '/users' },
    { label: 'Settings', icon: <Settings />, path: '/settings' },
];

const superAdminItems = [
    { label: 'Super Admin', icon: <AdminPanelSettings />, path: '/super-admin' },
];

export default function DashboardLayout() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const sidebarOpen = useAppSelector((s) => s.ui.sidebarOpen);
    const colorMode = useAppSelector((s) => s.ui.colorMode);
    const user = useAppSelector((s) => s.auth.user);

    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

    // Real-time: connect to /admin Socket.IO namespace and invalidate cache on content changes
    const queryClient = useQueryClient();
    const { socket } = useSocket();
    const [screenshot, setScreenshot] = useState<{ deviceId: string; url: string; timestamp: string } | null>(null);

    useEffect(() => {
        if (!socket) return;

        const invalidateContent = () => {
            queryClient.invalidateQueries({ queryKey: ['playlists'] });
            queryClient.invalidateQueries({ queryKey: ['schedules'] });
            queryClient.invalidateQueries({ queryKey: ['media'] });
        };

        // Refresh device list only on meaningful status transitions (not every heartbeat)
        const handleDeviceStatus = (data: { deviceId: string; status: string }) => {
            if (data.status === 'ONLINE' || data.status === 'OFFLINE') {
                queryClient.invalidateQueries({ queryKey: ['devices'] });
            }
        };

        const handleScreenshot = (data: { deviceId: string; url: string; timestamp: string }) => {
            setScreenshot(data);
        };

        socket.on('content.update', invalidateContent);
        socket.on('schedule.update', invalidateContent);
        socket.on('device.status', handleDeviceStatus);
        socket.on('device.screenshot', handleScreenshot);

        return () => {
            socket.off('content.update', invalidateContent);
            socket.off('schedule.update', invalidateContent);
            socket.off('device.status', handleDeviceStatus);
            socket.off('device.screenshot', handleScreenshot);
        };
    }, [socket, queryClient]);

    const drawerWidth = sidebarOpen ? DRAWER_WIDTH : COLLAPSED_WIDTH;

    const handleLogout = async () => {
        try { await authApi.logout(); } catch { /* ignore */ }
        dispatch(logout());
        navigate('/login', { replace: true });
    };

    const drawerContent = (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Logo */}
            <Toolbar sx={{ px: 2, minHeight: '64px !important' }}>
                {sidebarOpen ? (
                    <>
                        <Box
                            sx={{
                                width: 32, height: 32, borderRadius: 2,
                                background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
                                mr: 1.5, flexShrink: 0,
                            }}
                        />
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
                            width: 32, height: 32, borderRadius: 2, mx: 'auto',
                            background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
                            cursor: 'pointer',
                        }}
                        onClick={() => dispatch(setSidebarOpen(true))}
                    />
                )}
            </Toolbar>
            <Divider />

            {/* Nav items */}
            <List sx={{ flex: 1, px: sidebarOpen ? 1 : 0.5, py: 1 }}>
                {navItems.map(({ label, icon, path }) => {
                    const active = location.pathname.startsWith(path);
                    return (
                        <Tooltip key={path} title={!sidebarOpen ? label : ''} placement="right">
                            <ListItemButton
                                selected={active}
                                onClick={() => navigate(path)}
                                sx={{
                                    borderRadius: 2, mb: 0.5,
                                    minHeight: 44,
                                    justifyContent: sidebarOpen ? 'flex-start' : 'center',
                                    px: sidebarOpen ? 2 : 1.5,
                                    '&.Mui-selected': {
                                        background: 'linear-gradient(135deg, rgba(108,99,255,0.2), rgba(108,99,255,0.1))',
                                        color: 'primary.main',
                                        '& .MuiListItemIcon-root': { color: 'primary.main' },
                                    },
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: sidebarOpen ? 40 : 0, color: 'text.secondary' }}>
                                    {icon}
                                </ListItemIcon>
                                {sidebarOpen && <ListItemText primary={label} primaryTypographyProps={{ fontWeight: active ? 600 : 400 }} />}
                            </ListItemButton>
                        </Tooltip>
                    );
                })}

                {/* Super Admin section — only for SUPER_ADMIN role */}
                {user?.role === 'SUPER_ADMIN' && (
                    <>
                        <Divider sx={{ my: 1 }} />
                        {sidebarOpen && (
                            <Typography variant="caption" color="error.main" fontWeight={700}
                                sx={{ px: 2, py: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: 1 }}>
                                System
                            </Typography>
                        )}
                        {superAdminItems.map(({ label, icon, path }) => {
                            const active = location.pathname.startsWith(path);
                            return (
                                <Tooltip key={path} title={!sidebarOpen ? label : ''} placement="right">
                                    <ListItemButton
                                        selected={active}
                                        onClick={() => navigate(path)}
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
                                        <ListItemIcon sx={{ minWidth: sidebarOpen ? 40 : 0, color: active ? 'error.main' : 'text.secondary' }}>
                                            {icon}
                                        </ListItemIcon>
                                        {sidebarOpen && <ListItemText primary={label} primaryTypographyProps={{ fontWeight: active ? 600 : 400 }} />}
                                    </ListItemButton>
                                </Tooltip>
                            );
                        })}
                    </>
                )}
            </List>

            <Divider />
            {/* User section */}
            <Box sx={{ p: sidebarOpen ? 2 : 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Avatar
                    sx={{ width: 36, height: 36, bgcolor: 'primary.main', cursor: 'pointer', fontSize: '0.875rem', flexShrink: 0 }}
                    onClick={(e) => setAnchorEl(e.currentTarget)}
                >
                    {user?.firstName?.[0]}{user?.lastName?.[0]}
                </Avatar>
                {sidebarOpen && (
                    <Box sx={{ overflow: 'hidden', flex: 1 }}>
                        <Typography variant="body2" fontWeight={600} noWrap>
                            {user?.firstName} {user?.lastName}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                            {user?.role}
                        </Typography>
                    </Box>
                )}
            </Box>
            <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
                <MenuItem onClick={handleLogout}><Logout fontSize="small" sx={{ mr: 1 }} /> Logout</MenuItem>
            </Menu>
        </Box>
    );

    return (
        <>
        <Box sx={{ display: 'flex', minHeight: '100vh' }}>
            {/* ── Permanent sidebar (desktop) ── */}
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

            {/* ── Temporary sidebar (mobile) — keepMounted:false prevents aria-hidden focus warning ── */}
            {isMobile && (
                <Drawer
                    variant="temporary"
                    open={sidebarOpen}
                    onClose={() => dispatch(setSidebarOpen(false))}
                    ModalProps={{ keepMounted: false }}
                    sx={{
                        '& .MuiDrawer-paper': { width: DRAWER_WIDTH, overflowX: 'hidden' },
                    }}
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
                            {[...navItems, ...superAdminItems].find((n) => location.pathname.startsWith(n.path))?.label ?? 'Dashboard'}
                        </Typography>

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
                    <Outlet />
                </Box>
            </Box>
        </Box>

        {/* Screenshot dialog — shown when a device pushes a screenshot result */}
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
