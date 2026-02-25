import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Grid, Card, CardContent, Button,
    TextField, Divider, LinearProgress, Chip, Alert, Skeleton,
    alpha,
} from '@mui/material';
import {
    Business, Storage, Save, Person, Tv, Image,
    VideoFile, CalendarMonth, People, CheckCircle,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import { organizationsApi } from '@api/organizations.api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

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

    // Storage: use media size as proxy (device storage unknown until devices report health)
    const mediaBytes = stats?.totalMediaSizeBytes ?? 0;

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

                        {/* Storage bar */}
                        <Section
                            icon={<Storage />}
                            title="Dung lượng media"
                            subtitle="Tổng dung lượng file đã upload"
                        >
                            {loadingStats ? (
                                <Skeleton height={60} variant="rounded" />
                            ) : (
                                <Stack spacing={1.5}>
                                    <Stack direction="row" justifyContent="space-between">
                                        <Typography variant="body2" color="text.secondary">
                                            Đã dùng
                                        </Typography>
                                        <Typography variant="body2" fontWeight={700}>
                                            {fmtBytes(mediaBytes)}
                                        </Typography>
                                    </Stack>

                                    {/* Visual bar — hiển thị proportional nếu biết quota */}
                                    <Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={Math.min((mediaBytes / (10 * 1024 ** 3)) * 100, 100)}
                                            sx={{
                                                height: 10, borderRadius: 5,
                                                bgcolor: 'action.selected',
                                                '& .MuiLinearProgress-bar': {
                                                    borderRadius: 5,
                                                    background: 'linear-gradient(90deg, #6C63FF, #FF6584)',
                                                },
                                            }}
                                        />
                                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                            Ước tính trên tổng 10 GB quota
                                        </Typography>
                                    </Box>

                                    {/* Breakdown by count */}
                                    <Stack direction="row" gap={1.5} pt={0.5}>
                                        <Chip
                                            size="small"
                                            icon={<Image sx={{ fontSize: 12 }} />}
                                            label={`${stats?.totalMedia ?? 0} files`}
                                            sx={{ bgcolor: alpha('#4CAF82', 0.15), color: '#4CAF82', fontWeight: 600, fontSize: '0.65rem' }}
                                        />
                                        <Chip
                                            size="small"
                                            icon={<Storage sx={{ fontSize: 12 }} />}
                                            label={fmtBytes(mediaBytes)}
                                            sx={{ bgcolor: alpha('#6C63FF', 0.15), color: '#6C63FF', fontWeight: 600, fontSize: '0.65rem' }}
                                        />
                                    </Stack>
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
