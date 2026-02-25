import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Grid, Card, CardContent,
    ToggleButtonGroup, ToggleButton, TextField, Chip,
    Table, TableBody, TableCell, TableHead, TableRow,
    LinearProgress, Skeleton, Tooltip, alpha,
} from '@mui/material';
import {
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
    Tv, PlayArrow, CheckCircle, BarChart as BarChartIcon,
    Storage, Image, VideoFile, Language, FiberManualRecord,
    TrendingUp, MonitorHeart,
} from '@mui/icons-material';
import { analyticsApi } from '@api/analytics.api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' });
}

function fmtDateWeek(iso: string): string {
    const d = new Date(iso);
    return `T${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDateMonth(iso: string): string {
    return new Date(iso).toLocaleDateString('vi-VN', { year: '2-digit', month: 'short' });
}

function toLocalDate(daysAgo: number): string {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
}

// ── Date range preset ──────────────────────────────────────────────────────────

const PRESETS = [
    { label: '7 ngày', days: 7 },
    { label: '30 ngày', days: 30 },
    { label: '90 ngày', days: 90 },
] as const;

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
    icon, label, value, sub, color = '#6C63FF', loading = false,
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    sub?: string;
    color?: string;
    loading?: boolean;
}) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {label}
                        </Typography>
                        {loading ? (
                            <Skeleton width={80} height={36} sx={{ mt: 0.5 }} />
                        ) : (
                            <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, lineHeight: 1 }}>
                                {value}
                            </Typography>
                        )}
                        {sub && !loading && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                {sub}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{
                        width: 44, height: 44, borderRadius: 2,
                        bgcolor: alpha(color, 0.15),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color,
                    }}>
                        {icon}
                    </Box>
                </Stack>
            </CardContent>
        </Card>
    );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <Stack direction="row" alignItems="center" gap={1} mb={2}>
            <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
            <Typography variant="h6" fontWeight={700}>{title}</Typography>
        </Stack>
    );
}

// ── Media type chip ────────────────────────────────────────────────────────────

function TypeChip({ type }: { type: string }) {
    const cfg: Record<string, { icon: React.ReactNode; color: string }> = {
        VIDEO: { icon: <VideoFile sx={{ fontSize: 12 }} />, color: '#FF6584' },
        IMAGE: { icon: <Image sx={{ fontSize: 12 }} />, color: '#4CAF82' },
        HTML:  { icon: <Language sx={{ fontSize: 12 }} />, color: '#29B6F6' },
    };
    const c = cfg[type] ?? cfg.IMAGE;
    return (
        <Chip
            label={type}
            size="small"
            icon={c.icon as any}
            sx={{ bgcolor: alpha(c.color, 0.15), color: c.color, fontWeight: 600, fontSize: '0.6rem', border: `1px solid ${alpha(c.color, 0.3)}` }}
        />
    );
}

// ── Playback chart custom tooltip ──────────────────────────────────────────────

function PlaybackTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <Box sx={{ bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 1.5, minWidth: 160 }}>
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{label}</Typography>
            {payload.map((p: any) => (
                <Stack key={p.dataKey} direction="row" justifyContent="space-between" gap={2}>
                    <Typography variant="caption" sx={{ color: p.color }}>{p.name}</Typography>
                    <Typography variant="caption" fontWeight={700}>{p.value}</Typography>
                </Stack>
            ))}
        </Box>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
    // Date range state
    const [preset, setPreset] = useState<number>(30);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day');

    const { dateFrom, dateTo } = useMemo(() => {
        if (customFrom && customTo) return { dateFrom: customFrom, dateTo: customTo };
        return { dateFrom: toLocalDate(preset), dateTo: toLocalDate(0) };
    }, [preset, customFrom, customTo]);

    // Queries
    const { data: overview, isLoading: loadingOverview } = useQuery({
        queryKey: ['analytics-overview', dateFrom, dateTo],
        queryFn: () => analyticsApi.overview({ startDate: dateFrom, endDate: dateTo }),
    });

    const { data: playback = [], isLoading: loadingPlayback } = useQuery({
        queryKey: ['analytics-playback', dateFrom, dateTo, groupBy],
        queryFn: () => analyticsApi.playbackStats({ startDate: dateFrom, endDate: dateTo, groupBy }),
    });

    const { data: topContent = [], isLoading: loadingTop } = useQuery({
        queryKey: ['analytics-top-content', dateFrom, dateTo],
        queryFn: () => analyticsApi.topContent({ startDate: dateFrom, endDate: dateTo, limit: 10 }),
    });

    const { data: deviceHealth = [], isLoading: loadingHealth } = useQuery({
        queryKey: ['analytics-device-health'],
        queryFn: () => analyticsApi.deviceHealth(),
        refetchInterval: 60_000,
    });

    // Format period label for chart
    const fmtPeriod = groupBy === 'month' ? fmtDateMonth : groupBy === 'week' ? fmtDateWeek : fmtDate;

    const chartData = playback.map(p => ({
        period: fmtPeriod(p.period),
        'Lượt phát': p.plays,
        'Hoàn thành': p.completed ?? 0,
    }));

    // Derived KPI values
    const devOnline = overview?.devices.online ?? 0;
    const devTotal = overview?.devices.total ?? 0;
    const onlineRate = devTotal > 0 ? Math.round((devOnline / devTotal) * 100) : 0;
    const storageUsed = overview?.storage.usedBytes ?? 0;
    const mediaSize = overview?.media.totalSizeBytes ?? 0;

    return (
        <Box>
            {/* ── Header ────────────────────────────────────────────────────── */}
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={2} mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Analytics</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Thống kê {dateFrom} → {dateTo}
                    </Typography>
                </Box>

                {/* Date controls */}
                <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
                    {/* Quick presets */}
                    <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={customFrom ? null : preset}
                        onChange={(_, v) => { if (v !== null) { setPreset(v); setCustomFrom(''); setCustomTo(''); } }}
                    >
                        {PRESETS.map(p => (
                            <ToggleButton key={p.days} value={p.days} sx={{ px: 1.5, fontSize: '0.75rem' }}>
                                {p.label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>

                    {/* Custom date range */}
                    <TextField
                        type="date" size="small" label="Từ ngày"
                        value={customFrom}
                        onChange={e => { setCustomFrom(e.target.value); }}
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: 150 }}
                    />
                    <TextField
                        type="date" size="small" label="Đến ngày"
                        value={customTo}
                        onChange={e => { setCustomTo(e.target.value); }}
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: 150 }}
                    />
                </Stack>
            </Stack>

            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <Grid container spacing={2} mb={3}>
                {[
                    {
                        icon: <Tv />, label: 'Thiết bị online', color: '#4CAF82',
                        value: loadingOverview ? '…' : `${devOnline}/${devTotal}`,
                        sub: `${onlineRate}% online`,
                    },
                    {
                        icon: <PlayArrow />, label: 'Lượt phát', color: '#6C63FF',
                        value: loadingOverview ? '…' : (overview?.playback.totalPlays ?? 0).toLocaleString(),
                        sub: `${overview?.playback.totalMinutes ?? 0} phút`,
                    },
                    {
                        icon: <CheckCircle />, label: 'Hoàn thành', color: '#29B6F6',
                        value: loadingOverview ? '…' : `${overview?.playback.completionRate ?? 0}%`,
                        sub: 'tỷ lệ xem hết',
                    },
                    {
                        icon: <BarChartIcon />, label: 'Media', color: '#FF6584',
                        value: loadingOverview ? '…' : (overview?.media.count ?? 0),
                        sub: fmtBytes(mediaSize),
                    },
                    {
                        icon: <Storage />, label: 'Storage device', color: '#FFA726',
                        value: loadingOverview ? '…' : fmtBytes(storageUsed),
                        sub: 'tổng dung lượng thiết bị',
                    },
                    {
                        icon: <TrendingUp />, label: 'Schedules', color: '#AB47BC',
                        value: loadingOverview ? '…' : `${overview?.schedules.active ?? 0}/${overview?.schedules.total ?? 0}`,
                        sub: 'đang kích hoạt',
                    },
                ].map((card, i) => (
                    <Grid key={i} size={{ xs: 6, sm: 4, md: 2 }}>
                        <KpiCard {...card} loading={loadingOverview} />
                    </Grid>
                ))}
            </Grid>

            {/* ── Playback Chart ─────────────────────────────────────────────── */}
            <Card sx={{ mb: 3 }}>
                <CardContent sx={{ p: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <SectionTitle icon={<BarChartIcon />} title="Lượt phát theo thời gian" />
                        <ToggleButtonGroup
                            exclusive size="small"
                            value={groupBy}
                            onChange={(_, v) => { if (v) setGroupBy(v); }}
                        >
                            <ToggleButton value="day" sx={{ px: 1.5, fontSize: '0.72rem' }}>Ngày</ToggleButton>
                            <ToggleButton value="week" sx={{ px: 1.5, fontSize: '0.72rem' }}>Tuần</ToggleButton>
                            <ToggleButton value="month" sx={{ px: 1.5, fontSize: '0.72rem' }}>Tháng</ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>

                    {loadingPlayback ? (
                        <Skeleton variant="rounded" height={260} />
                    ) : chartData.length === 0 ? (
                        <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography color="text.secondary" variant="body2">Chưa có dữ liệu phát trong khoảng thời gian này</Typography>
                        </Box>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
                            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gradPlays" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6C63FF" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6C63FF" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gradDone" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4CAF82" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#4CAF82" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <RTooltip content={<PlaybackTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                                <Area type="monotone" dataKey="Lượt phát" stroke="#6C63FF" strokeWidth={2} fill="url(#gradPlays)" dot={false} activeDot={{ r: 4 }} />
                                <Area type="monotone" dataKey="Hoàn thành" stroke="#4CAF82" strokeWidth={2} fill="url(#gradDone)" dot={false} activeDot={{ r: 4 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* ── Bottom two columns ──────────────────────────────────────────── */}
            <Grid container spacing={2}>

                {/* Top Content */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <SectionTitle icon={<PlayArrow />} title="Nội dung phát nhiều nhất" />
                            {loadingTop ? (
                                <Stack gap={1}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={48} variant="rounded" />)}</Stack>
                            ) : topContent.length === 0 ? (
                                <Box py={6} textAlign="center">
                                    <Typography color="text.secondary" variant="body2">Chưa có dữ liệu phát trong khoảng thời gian này</Typography>
                                </Box>
                            ) : (
                                <Box sx={{ overflowX: 'auto' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>#</TableCell>
                                                <TableCell sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Tên file</TableCell>
                                                <TableCell sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Loại</TableCell>
                                                <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Lượt phát</TableCell>
                                                <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Hoàn thành</TableCell>
                                                <TableCell align="right" sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>Phút</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {topContent.map((item, idx) => {
                                                const completionPct = item.plays > 0
                                                    ? Math.round((item.completed ?? 0) / item.plays * 100)
                                                    : 0;
                                                return (
                                                    <TableRow key={item.mediaId} hover>
                                                        <TableCell>
                                                            <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                                                {idx + 1}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell>
                                                            <Tooltip title={item.title}>
                                                                <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
                                                                    {item.title}
                                                                </Typography>
                                                            </Tooltip>
                                                        </TableCell>
                                                        <TableCell><TypeChip type={item.type} /></TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" fontWeight={700} color="primary.main">
                                                                {item.plays.toLocaleString()}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={completionPct >= 80 ? 'success.main' : completionPct >= 50 ? 'warning.main' : 'error.main'}>
                                                                {completionPct}%
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color="text.secondary">
                                                                {Number(item.totalMinutes).toFixed(1)}
                                                            </Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </Box>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Device Health */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <SectionTitle icon={<MonitorHeart />} title="Sức khoẻ thiết bị" />
                            {loadingHealth ? (
                                <Stack gap={1}>{[...Array(3)].map((_, i) => <Skeleton key={i} height={80} variant="rounded" />)}</Stack>
                            ) : deviceHealth.length === 0 ? (
                                <Box py={6} textAlign="center">
                                    <Typography color="text.secondary" variant="body2">Chưa có dữ liệu health từ thiết bị</Typography>
                                </Box>
                            ) : (
                                <Stack gap={1.5}>
                                    {deviceHealth.map((dh) => (
                                        <Box key={dh.deviceId} sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
                                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                                                <Stack direction="row" alignItems="center" gap={0.75}>
                                                    <FiberManualRecord sx={{ fontSize: 10, color: dh.isOnline ? 'success.main' : 'text.disabled' }} />
                                                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 140 }}>
                                                        {dh.deviceName}
                                                    </Typography>
                                                </Stack>
                                                <Typography variant="caption" color="text.secondary">
                                                    {dh.reportedAt ? new Date(dh.reportedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </Typography>
                                            </Stack>
                                            {/* CPU */}
                                            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                                                <Typography variant="caption" color="text.secondary" sx={{ width: 36 }}>CPU</Typography>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={Math.min(dh.cpuUsage ?? 0, 100)}
                                                    sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: 'action.selected', '& .MuiLinearProgress-bar': { bgcolor: (dh.cpuUsage ?? 0) > 80 ? 'error.main' : 'primary.main' } }}
                                                />
                                                <Typography variant="caption" color="text.secondary" sx={{ width: 32, textAlign: 'right' }}>{(dh.cpuUsage ?? 0).toFixed(0)}%</Typography>
                                            </Stack>
                                            {/* RAM */}
                                            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                                                <Typography variant="caption" color="text.secondary" sx={{ width: 36 }}>RAM</Typography>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={Math.min(dh.memoryUsage ?? 0, 100)}
                                                    sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: 'action.selected', '& .MuiLinearProgress-bar': { bgcolor: (dh.memoryUsage ?? 0) > 80 ? 'warning.main' : 'info.main' } }}
                                                />
                                                <Typography variant="caption" color="text.secondary" sx={{ width: 32, textAlign: 'right' }}>{(dh.memoryUsage ?? 0).toFixed(0)}%</Typography>
                                            </Stack>
                                            {/* Storage */}
                                            <Stack direction="row" alignItems="center" gap={1}>
                                                <Typography variant="caption" color="text.secondary" sx={{ width: 36 }}>Disk</Typography>
                                                <LinearProgress
                                                    variant="determinate"
                                                    value={Math.min(dh.storagePercent ?? 0, 100)}
                                                    sx={{ flex: 1, height: 5, borderRadius: 3, bgcolor: 'action.selected', '& .MuiLinearProgress-bar': { bgcolor: (dh.storagePercent ?? 0) > 90 ? 'error.main' : 'success.main' } }}
                                                />
                                                <Typography variant="caption" color="text.secondary" sx={{ width: 32, textAlign: 'right' }}>{(dh.storagePercent ?? 0).toFixed(0)}%</Typography>
                                            </Stack>
                                        </Box>
                                    ))}
                                </Stack>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
