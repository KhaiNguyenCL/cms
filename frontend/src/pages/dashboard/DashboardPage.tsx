import { useQuery } from '@tanstack/react-query';
import {
    Box, Grid, Card, CardContent, Typography, Stack, Chip,
    LinearProgress, Skeleton, Divider, Avatar, List, ListItem,
    ListItemAvatar, ListItemText, useTheme,
} from '@mui/material';
import {
    Tv, PermMedia, QueueMusic, CalendarMonth,
    TrendingUp, Storage, CheckCircle, Error as ErrorIcon,
} from '@mui/icons-material';
import { analyticsApi } from '@api/analytics.api';
import { devicesApi } from '@api/devices.api';

// ── Stat card component ───────────────────────────────────────────────────────

interface StatCardProps {
    label: string;
    value: string | number;
    icon: React.ReactNode;
    color: string;
    sub?: string;
    loading?: boolean;
}

function StatCard({ label, value, icon, color, sub, loading }: StatCardProps) {
    return (
        <Card>
            <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={2}>
                    <Box>
                        {loading ? (
                            <Skeleton width={80} height={48} />
                        ) : (
                            <Typography variant="h3" fontWeight={800}>
                                {value}
                            </Typography>
                        )}
                        <Typography variant="body2" color="text.secondary" mt={0.5}>
                            {label}
                        </Typography>
                    </Box>
                    <Box
                        sx={{
                            width: 52, height: 52, borderRadius: 3,
                            background: `${color}22`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color,
                        }}
                    >
                        {icon}
                    </Box>
                </Stack>
                {sub && (
                    <Typography variant="caption" color="text.secondary">
                        {sub}
                    </Typography>
                )}
            </CardContent>
        </Card>
    );
}

// ── Device status row ─────────────────────────────────────────────────────────

function DeviceStatusRow({ online, total }: { online: number; total: number }) {
    const pct = total > 0 ? Math.round((online / total) * 100) : 0;
    return (
        <Card>
            <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Typography variant="h6" fontWeight={600}>Device Online Rate</Typography>
                    <Chip
                        label={`${pct}%`}
                        color={pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'error'}
                        size="small"
                        sx={{ fontWeight: 700 }}
                    />
                </Stack>
                <LinearProgress
                    variant="determinate"
                    value={pct}
                    sx={{
                        height: 8, borderRadius: 4, mb: 1.5,
                        backgroundColor: 'divider',
                        '& .MuiLinearProgress-bar': {
                            background: pct >= 80
                                ? 'linear-gradient(90deg,#4CAF82,#66BB6A)'
                                : pct >= 50
                                    ? 'linear-gradient(90deg,#FFB547,#FFA726)'
                                    : 'linear-gradient(90deg,#FF5C5C,#EF5350)',
                        },
                    }}
                />
                <Stack direction="row" justifyContent="space-between">
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        <CheckCircle sx={{ fontSize: 14, color: 'success.main' }} />
                        <Typography variant="caption" color="text.secondary">{online} online</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        <ErrorIcon sx={{ fontSize: 14, color: 'error.main' }} />
                        <Typography variant="caption" color="text.secondary">{total - online} offline</Typography>
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
}

// ── Storage card ──────────────────────────────────────────────────────────────

function StorageCard({ used, total }: { used: number; total: number }) {
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    const toGB = (b: number) => (b / 1024 ** 3).toFixed(1);

    return (
        <Card>
            <CardContent sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                    <Typography variant="h6" fontWeight={600}>Storage</Typography>
                    <Storage sx={{ color: 'primary.main' }} />
                </Stack>
                <Typography variant="h4" fontWeight={700} mb={0.5}>
                    {toGB(used)} <Typography component="span" variant="body2" color="text.secondary">/ {toGB(total)} GB</Typography>
                </Typography>
                <LinearProgress
                    variant="determinate" value={pct}
                    sx={{
                        height: 8, borderRadius: 4, mb: 1,
                        backgroundColor: 'divider',
                        '& .MuiLinearProgress-bar': {
                            background: 'linear-gradient(90deg, #6C63FF, #9B94FF)',
                        },
                    }}
                />
                <Typography variant="caption" color="text.secondary">{pct}% used</Typography>
            </CardContent>
        </Card>
    );
}

// ── Recent devices list ───────────────────────────────────────────────────────

function RecentDevices() {
    const { data, isLoading } = useQuery({
        queryKey: ['devices', 'recent'],
        queryFn: () => devicesApi.list({ limit: 6, page: 1 }),
    });

    return (
        <Card>
            <CardContent sx={{ p: 3 }}>
                <Typography variant="h6" fontWeight={600} mb={2}>Recent Devices</Typography>
                {isLoading ? (
                    [1, 2, 3, 4].map((i) => <Skeleton key={i} height={56} sx={{ mb: 0.5, borderRadius: 2 }} />)
                ) : (
                    <List disablePadding>
                        {(data?.data ?? []).map((device, idx) => (
                            <Box key={device.id}>
                                <ListItem disablePadding sx={{ py: 1 }}>
                                    <ListItemAvatar>
                                        <Avatar sx={{
                                            width: 36, height: 36,
                                            bgcolor: device.status === 'ONLINE' ? 'success.main' : 'error.main',
                                            fontSize: '0.75rem',
                                        }}>
                                            <Tv sx={{ fontSize: 18 }} />
                                        </Avatar>
                                    </ListItemAvatar>
                                    <ListItemText
                                        primary={
                                            <Typography variant="body2" fontWeight={600}>{device.name}</Typography>
                                        }
                                        secondary={
                                            <Typography variant="caption" color="text.secondary">
                                                {device.location ?? 'No location'} · {device.status}
                                            </Typography>
                                        }
                                    />
                                    <Chip
                                        label={device.status}
                                        size="small"
                                        color={device.status === 'ONLINE' ? 'success' : 'default'}
                                        sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                                    />
                                </ListItem>
                                {idx < (data?.data.length ?? 0) - 1 && <Divider />}
                            </Box>
                        ))}
                        {!data?.data.length && (
                            <Typography variant="body2" color="text.secondary" textAlign="center" py={3}>
                                No devices registered yet
                            </Typography>
                        )}
                    </List>
                )}
            </CardContent>
        </Card>
    );
}

// ── Main Dashboard Page ───────────────────────────────────────────────────────

export default function DashboardPage() {
    const theme = useTheme();

    const { data: overview, isLoading } = useQuery({
        queryKey: ['analytics', 'overview'],
        queryFn: () => analyticsApi.overview(),
        refetchInterval: 30_000,
    });

    const stats = [
        {
            label: 'Total Devices', value: overview?.devices.total ?? 0,
            icon: <Tv />, color: theme.palette.primary.main,
            sub: `${overview?.devices.online ?? 0} currently online`,
        },
        {
            label: 'Media Files', value: overview?.media.count ?? 0,
            icon: <PermMedia />, color: '#4CAF82',
            sub: 'Ready to play',
        },
        {
            label: 'Playlists', value: overview?.playlists.total ?? 0,
            icon: <QueueMusic />, color: '#FFB547',
            sub: 'Active playlists',
        },
        {
            label: 'Schedules', value: overview?.schedules.total ?? 0,
            icon: <CalendarMonth />, color: '#FF6584',
            sub: `${overview?.schedules.active ?? 0} active`,
        },
        {
            label: 'Total Plays', value: overview?.playback.totalPlays ?? 0,
            icon: <TrendingUp />, color: '#29B6F6',
            sub: `${Math.round((overview?.playback.totalMinutes ?? 0) / 60)} hrs total`,
        },
    ];

    return (
        <Box>
            <Typography variant="h4" fontWeight={700} gutterBottom>
                Dashboard
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
                Overview of your digital signage network
            </Typography>

            {/* Stat cards */}
            <Grid container spacing={3} mb={3}>
                {stats.map((s) => (
                    <Grid key={s.label} size={{ xs: 12, sm: 6, md: 4, lg: 2.4 }}>
                        <StatCard {...s} loading={isLoading} />
                    </Grid>
                ))}
            </Grid>

            {/* Second row */}
            <Grid container spacing={3}>
                <Grid size={{ xs: 12, md: 4 }}>
                    <DeviceStatusRow
                        online={overview?.devices.online ?? 0}
                        total={overview?.devices.total ?? 0}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <StorageCard
                        used={overview?.storage.usedBytes ?? 0}
                        total={overview?.storage.totalBytes ?? 1}
                    />
                </Grid>
                <Grid size={{ xs: 12, md: 4 }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 3 }}>
                            <Typography variant="h6" fontWeight={600} mb={2}>Completion Rate</Typography>
                            <Typography variant="h3" fontWeight={800} color="primary.main">
                                {overview?.playback.completionRate ?? 0}%
                            </Typography>
                            <Typography variant="body2" color="text.secondary" mt={1}>
                                Average playback completion across all devices
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Device list */}
            <Box mt={3}>
                <RecentDevices />
            </Box>
        </Box>
    );
}
