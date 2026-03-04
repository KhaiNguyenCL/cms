import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Grid, Card, CardContent, Button,
    TextField, Divider, Chip, Alert, Skeleton,
    alpha,
} from '@mui/material';
import {
    Business, Storage, Save, Person, Tv, Image,
    VideoFile, CalendarMonth, People, CheckCircle, Lock,
} from '@mui/icons-material';

import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import { organizationsApi } from '@api/organizations.api';

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon, title, subtitle, children }: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="flex-start" gap={1.5} mb={2.5}>
                    <Box sx={{
                        width: 38, height: 38, borderRadius: 2,
                        bgcolor: alpha('#6C63FF', 0.15),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'primary.main', flexShrink: 0, mt: 0.25,
                    }}>
                        {icon}
                    </Box>
                    <Box>
                        <Typography variant="h6" fontWeight={700}>{title}</Typography>
                        {subtitle && (
                            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
                        )}
                    </Box>
                </Stack>
                <Divider sx={{ mb: 2.5 }} />
                {children}
            </CardContent>
        </Card>
    );
}

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatRow({ icon, label, value, color = 'text.secondary' }: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color?: string;
}) {
    return (
        <Stack direction="row" justifyContent="space-between" alignItems="center" py={1}>
            <Stack direction="row" alignItems="center" gap={1.25}>
                <Box sx={{ color: 'text.disabled', display: 'flex', fontSize: 18 }}>{icon}</Box>
                <Typography variant="body2" color="text.secondary">{label}</Typography>
            </Stack>
            <Typography variant="body2" fontWeight={700} color={color}>{value}</Typography>
        </Stack>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const currentUser = useAppSelector(s => s.auth.user);
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

    // Org data
    const { data: org, isLoading: loadingOrg } = useQuery({
        queryKey: ['org-me'],
        queryFn: organizationsApi.getMe,
    });

    const { data: stats, isLoading: loadingStats } = useQuery({
        queryKey: ['org-stats'],
        queryFn: organizationsApi.getStats,
    });

    // Edit org name
    const [orgName, setOrgName] = useState('');
    useEffect(() => { if (org) setOrgName(org.name); }, [org]);

    const saveMutation = useMutation({
        mutationFn: () => organizationsApi.updateMe({ name: orgName.trim() }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['org-me'] });
            dispatch(pushToast({ severity: 'success', message: 'Đã lưu thông tin tổ chức' }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Lưu thất bại' }));
        },
    });

    const nameChanged = orgName.trim() !== (org?.name ?? '');
    const nameValid = orgName.trim().length >= 2;

    // Device admin PIN
    const [newPin, setNewPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const pinValid = /^\d{4,8}$/.test(newPin);

    const pinMutation = useMutation({
        mutationFn: () => organizationsApi.updateDevicePin(newPin),
        onSuccess: () => {
            setNewPin('');
            dispatch(pushToast({ severity: 'success', message: 'PIN thiết bị đã được cập nhật' }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Cập nhật PIN thất bại' }));
        },
    });

    return (
        <Box>
            {/* Header */}
            <Box mb={3}>
                <Typography variant="h4" fontWeight={700}>Settings</Typography>
                <Typography variant="body2" color="text.secondary">
                    Cài đặt tổ chức và thông tin tài khoản
                </Typography>
            </Box>

            <Grid container spacing={3}>

                {/* ── Left column ─────────────────────────────────────────── */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Stack spacing={3}>

                        {/* Organization Profile */}
                        <Section
                            icon={<Business />}
                            title="Thông tin tổ chức"
                            subtitle="Tên hiển thị và thông tin cơ bản"
                        >
                            <Stack spacing={2.5}>
                                <TextField
                                    label="Tên tổ chức"
                                    value={orgName}
                                    onChange={e => setOrgName(e.target.value)}
                                    fullWidth
                                    disabled={!isAdmin || loadingOrg}
                                    helperText={!isAdmin ? 'Chỉ Admin mới có thể chỉnh sửa' : ''}
                                    inputProps={{ maxLength: 100 }}
                                />

                                <TextField
                                    label="Slug"
                                    value={loadingOrg ? '…' : (org?.slug ?? '')}
                                    fullWidth disabled
                                    helperText="Slug không thể thay đổi sau khi tạo"
                                />

                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Stack direction="row" gap={1}>
                                        <Chip
                                            label={org?.isActive ? 'Active' : 'Inactive'}
                                            color={org?.isActive ? 'success' : 'default'}
                                            size="small"
                                            icon={<CheckCircle sx={{ fontSize: 12 }} />}
                                        />
                                        <Chip
                                            label={`Tạo: ${org ? new Date(org.createdAt).toLocaleDateString('vi-VN') : '…'}`}
                                            size="small"
                                            variant="outlined"
                                        />
                                    </Stack>

                                    {isAdmin && (
                                        <Button
                                            variant="contained"
                                            startIcon={<Save />}
                                            disabled={!nameChanged || !nameValid || saveMutation.isPending}
                                            onClick={() => saveMutation.mutate()}
                                            size="small"
                                        >
                                            {saveMutation.isPending ? 'Đang lưu…' : 'Lưu'}
                                        </Button>
                                    )}
                                </Stack>
                            </Stack>
                        </Section>

                        {/* Account Info */}
                        <Section
                            icon={<Person />}
                            title="Tài khoản của bạn"
                            subtitle="Thông tin tài khoản đang đăng nhập"
                        >
                            <Stack spacing={2}>
                                <TextField
                                    label="Email"
                                    value={currentUser?.email ?? ''}
                                    fullWidth disabled
                                />
                                <Stack direction="row" gap={2}>
                                    <TextField
                                        label="Role"
                                        value={currentUser?.role ?? ''}
                                        sx={{ flex: 1 }} disabled
                                    />
                                    <TextField
                                        label="Trạng thái"
                                        value={currentUser?.status ?? ''}
                                        sx={{ flex: 1 }} disabled
                                    />
                                </Stack>

                                {!isAdmin && (
                                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                                        Bạn không có quyền Admin — một số cài đặt bị ẩn.
                                    </Alert>
                                )}
                            </Stack>
                        </Section>

                        {/* Device Admin PIN */}
                        {isAdmin && (
                            <Section
                                icon={<Lock />}
                                title="PIN admin thiết bị"
                                subtitle="PIN để thoát kiosk mode trên TV (4–8 chữ số)"
                            >
                                <Stack spacing={2}>
                                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                                        PIN được đồng bộ tự động đến tất cả thiết bị trong lần heartbeat tiếp theo.
                                        Mặc định: <strong>0000</strong>
                                    </Alert>
                                    <Stack direction="row" gap={1.5} alignItems="flex-start">
                                        <TextField
                                            label="PIN mới"
                                            value={newPin}
                                            onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                            type={showPin ? 'text' : 'password'}
                                            inputProps={{ maxLength: 8, inputMode: 'numeric' }}
                                            helperText="4–8 chữ số"
                                            error={newPin.length > 0 && !pinValid}
                                            sx={{ flex: 1 }}
                                        />
                                        <Button
                                            variant="outlined"
                                            onClick={() => setShowPin(s => !s)}
                                            sx={{ mt: 0.5, minWidth: 80 }}
                                            size="small"
                                        >
                                            {showPin ? 'Ẩn' : 'Hiện'}
                                        </Button>
                                        <Button
                                            variant="contained"
                                            disabled={!pinValid || pinMutation.isPending}
                                            onClick={() => pinMutation.mutate()}
                                            sx={{ mt: 0.5 }}
                                            size="small"
                                        >
                                            {pinMutation.isPending ? 'Đang lưu…' : 'Cập nhật PIN'}
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Section>
                        )}

                    </Stack>
                </Grid>

                {/* ── Right column ─────────────────────────────────────────── */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Stack spacing={3}>

                        {/* Usage stats */}
                        <Section
                            icon={<Storage />}
                            title="Tài nguyên sử dụng"
                            subtitle="Thống kê nội dung trong tổ chức"
                        >
                            {loadingStats ? (
                                <Stack gap={1.5}>
                                    {[...Array(6)].map((_, i) => <Skeleton key={i} height={32} />)}
                                </Stack>
                            ) : (
                                <Stack divider={<Divider />}>
                                    <StatRow
                                        icon={<Tv fontSize="inherit" />}
                                        label="Thiết bị"
                                        value={`${stats?.onlineDevices ?? 0} online / ${stats?.totalDevices ?? 0} tổng`}
                                        color={(stats?.onlineDevices ?? 0) > 0 ? 'success.main' : 'text.secondary'}
                                    />
                                    <StatRow
                                        icon={<People fontSize="inherit" />}
                                        label="Users"
                                        value={`${stats?.activeUsers ?? 0} active / ${stats?.totalUsers ?? 0} tổng`}
                                    />
                                    <StatRow
                                        icon={<Image fontSize="inherit" />}
                                        label="Media"
                                        value={`${stats?.totalMedia ?? 0} file`}
                                    />
                                    <StatRow
                                        icon={<VideoFile fontSize="inherit" />}
                                        label="Playlists"
                                        value={stats?.totalPlaylists ?? 0}
                                    />
                                    <StatRow
                                        icon={<CalendarMonth fontSize="inherit" />}
                                        label="Schedules"
                                        value={stats?.totalSchedules ?? 0}
                                    />
                                </Stack>
                            )}
                        </Section>

                        {/* System info */}
                        <Card sx={{ bgcolor: alpha('#FF6584', 0.05), border: '1px solid', borderColor: alpha('#FF6584', 0.15) }}>
                            <CardContent sx={{ p: 2.5 }}>
                                <Typography variant="subtitle2" fontWeight={700} color="error.main" mb={1.5}>
                                    Thông tin hệ thống
                                </Typography>
                                <Stack spacing={0.75}>
                                    {[
                                        { label: 'Org ID', value: org?.id?.slice(0, 16) + '…' },
                                        { label: 'Version', value: 'SignageCMS v1.0' },
                                        { label: 'Backend', value: 'Node.js + PostgreSQL' },
                                        { label: 'Môi trường', value: import.meta.env.MODE },
                                    ].map(({ label, value }) => (
                                        <Stack key={label} direction="row" justifyContent="space-between">
                                            <Typography variant="caption" color="text.secondary">{label}</Typography>
                                            <Typography variant="caption" fontWeight={600} color="text.primary">
                                                {loadingOrg && label === 'Org ID' ? '…' : value}
                                            </Typography>
                                        </Stack>
                                    ))}
                                </Stack>
                            </CardContent>
                        </Card>

                    </Stack>
                </Grid>

            </Grid>
        </Box>
    );
}
