import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    Box, Grid, Card, CardContent, Typography, Stack, Skeleton,
    ToggleButtonGroup, ToggleButton, TextField, Chip,
    Table, TableBody, TableCell, TableHead, TableRow,
    Tooltip as MuiTooltip, alpha, useTheme,
} from '@mui/material';
import {
    PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip as RTooltip,
} from 'recharts';
import {
    Tv, PlayArrow, CheckCircle, BarChart as BarChartIcon,
    Image, VideoFile, Language,
    TrendingUp, QueueMusic, CalendarMonth, Devices, VerifiedUser,
} from '@mui/icons-material';
import { analyticsApi, type PieSlice } from '@api/analytics.api';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' }); }
function fmtDateWeek(iso: string) { const d = new Date(iso); return `T${d.getMonth() + 1}/${d.getDate()}`; }
function fmtDateMonth(iso: string) { return new Date(iso).toLocaleDateString('vi-VN', { year: '2-digit', month: 'short' }); }
function toLocalDate(daysAgo: number) { const d = new Date(); d.setDate(d.getDate() - daysAgo); return d.toISOString().slice(0, 10); }

const PRESETS = [
    { label: '7 ngày', days: 7 },
    { label: '30 ngày', days: 30 },
    { label: '90 ngày', days: 90 },
] as const;

// ── Colour palettes ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    ONLINE:   '#4CAF50',
    SLEEP:    '#29B6F6',
    APP_EXIT: '#FFA726',
    OFFLINE:  '#9E9E9E',
    ERROR:    '#F44336',
};
const LICENSE_COLORS: Record<string, string> = {
    'Có license':  '#4CAF50',
    'Hết license': '#F44336',
};
const MODEL_PALETTE   = ['#29B6F6', '#FFA726', '#AB47BC', '#26A69A', '#EF5350', '#8D6E63'];
const VERSION_PALETTE = ['#42A5F5', '#66BB6A', '#FFCA28', '#FF7043', '#26C6DA', '#EC407A'];
const OS_PALETTE      = ['#26C6DA', '#AB47BC', '#FFA726', '#66BB6A', '#EF5350', '#8D6E63'];

// ── Pie label ─────────────────────────────────────────────────────────────────

function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
    if (percent < 0.06) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.55;
    const x = cx + r * Math.cos(-midAngle * (Math.PI / 180));
    const y = cy + r * Math.sin(-midAngle * (Math.PI / 180));
    return (
        <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: 11, fontWeight: 700 }}>
            {`${(percent * 100).toFixed(0)}%`}
        </text>
    );
}

// ── PieCard ────────────────────────────────────────────────────────────────────

function PieCard({ title, data, colors, loading, total }: {
    title: string; data: PieSlice[];
    colors: string[] | Record<string, string>;
    loading: boolean; total?: number;
}) {
    const theme = useTheme();
    const getColor = (name: string, idx: number) =>
        Array.isArray(colors) ? colors[idx % colors.length] : (colors[name] ?? '#9E9E9E');
    const isEmpty = !loading && data.every(d => d.value === 0);

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5, height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                    <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
                    {total !== undefined && (
                        <Typography variant="h5" fontWeight={800} color="primary.main">{total}</Typography>
                    )}
                </Stack>
                {loading ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Skeleton variant="circular" width={140} height={140} />
                    </Box>
                ) : isEmpty ? (
                    <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="body2" color="text.disabled">Chưa có dữ liệu</Typography>
                    </Box>
                ) : (
                    <ResponsiveContainer width="100%" height={240}>
                        <PieChart>
                            <Pie data={data} cx="50%" cy="44%" outerRadius={80}
                                dataKey="value" labelLine={false} label={<PieLabel />}>
                                {data.map((entry, idx) => (
                                    <Cell key={entry.name} fill={getColor(entry.name, idx)} />
                                ))}
                            </Pie>
                            <Tooltip
                                contentStyle={{
                                    background: theme.palette.background.paper,
                                    border: `1px solid ${theme.palette.divider}`,
                                    borderRadius: 8, fontSize: 12,
                                }}
                            />
                            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </CardContent>
        </Card>
    );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = '#6C63FF', loading = false }: {
    icon: React.ReactNode; label: string; value: string | number;
    sub?: string; color?: string; loading?: boolean;
}) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                        <Typography variant="caption" color="text.secondary"
                            sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {label}
                        </Typography>
                        {loading
                            ? <Skeleton width={70} height={32} sx={{ mt: 0.5 }} />
                            : <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, lineHeight: 1 }}>{value}</Typography>
                        }
                        {sub && !loading && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                {sub}
                            </Typography>
                        )}
                    </Box>
                    <Box sx={{
                        width: 40, height: 40, borderRadius: 2,
                        bgcolor: alpha(color, 0.15),
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color,
                    }}>
                        {icon}
                    </Box>
                </Stack>
            </CardContent>
        </Card>
    );
}

// ── Playback tooltip ──────────────────────────────────────────────────────────

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

// ── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
            <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
            <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
        </Stack>
    );
}

// ── Media type chip ───────────────────────────────────────────────────────────

function TypeChip({ type }: { type: string }) {
    const cfg: Record<string, { icon: React.ReactNode; color: string }> = {
        VIDEO: { icon: <VideoFile sx={{ fontSize: 12 }} />, color: '#FF6584' },
        IMAGE: { icon: <Image sx={{ fontSize: 12 }} />, color: '#4CAF82' },
        HTML:  { icon: <Language sx={{ fontSize: 12 }} />, color: '#29B6F6' },
    };
    const c = cfg[type] ?? cfg.IMAGE;
    return (
        <Chip label={type} size="small" icon={c.icon as any}
            sx={{ bgcolor: alpha(c.color, 0.15), color: c.color, fontWeight: 600, fontSize: '0.6rem', border: `1px solid ${alpha(c.color, 0.3)}` }} />
    );
}

// ── Main Dashboard Page ────────────────────────────────────────────────────────

export default function DashboardPage() {
    const [preset, setPreset]     = useState<number>(30);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo]   = useState('');
    const [groupBy, setGroupBy]   = useState<'day' | 'week' | 'month'>('day');

    const { dateFrom, dateTo } = useMemo(() => {
        if (customFrom && customTo) return { dateFrom: customFrom, dateTo: customTo };
        return { dateFrom: toLocalDate(preset), dateTo: toLocalDate(0) };
    }, [preset, customFrom, customTo]);

    const { data: charts, isLoading: loadingCharts } = useQuery({
        queryKey: ['analytics', 'device-charts'],
        queryFn: () => analyticsApi.deviceCharts(),
        refetchInterval: 30_000,
    });

    const { data: overview, isLoading: loadingOverview } = useQuery({
        queryKey: ['analytics-overview', dateFrom, dateTo],
        queryFn: () => analyticsApi.overview({ startDate: dateFrom, endDate: dateTo }),
        refetchInterval: 60_000,
    });

    const { data: playback = [], isLoading: loadingPlayback } = useQuery({
        queryKey: ['analytics-playback', dateFrom, dateTo, groupBy],
        queryFn: () => analyticsApi.playbackStats({ startDate: dateFrom, endDate: dateTo, groupBy }),
        refetchInterval: 60_000,
    });

    const { data: topContent = [], isLoading: loadingTop } = useQuery({
        queryKey: ['analytics-top-content', dateFrom, dateTo],
        queryFn: () => analyticsApi.topContent({ startDate: dateFrom, endDate: dateTo, limit: 10 }),
        refetchInterval: 60_000,
    });

    const { data: topPlaylists = [], isLoading: loadingTopPl } = useQuery({
        queryKey: ['analytics-top-playlists', dateFrom, dateTo],
        queryFn: () => analyticsApi.topPlaylists({ startDate: dateFrom, endDate: dateTo, limit: 10 }),
        refetchInterval: 60_000,
    });

    const { data: topSchedules = [], isLoading: loadingTopSc } = useQuery({
        queryKey: ['analytics-top-schedules', dateFrom, dateTo],
        queryFn: () => analyticsApi.topSchedules({ startDate: dateFrom, endDate: dateTo, limit: 10 }),
        refetchInterval: 60_000,
    });

    const fmtPeriod = groupBy === 'month' ? fmtDateMonth : groupBy === 'week' ? fmtDateWeek : fmtDate;
    const chartData = playback.map(p => ({
        period: fmtPeriod(p.period),
        'Lượt phát': p.plays,
        'Hoàn thành': p.completed ?? 0,
    }));

    const devOnline   = overview?.devices.online ?? 0;
    const devTotal    = overview?.devices.total ?? 0;
    const onlineRate  = devTotal > 0 ? Math.round((devOnline / devTotal) * 100) : 0;
    const totalDevices = (charts?.status ?? []).reduce((s, d) => s + d.value, 0);
    const licensedCount = (charts?.license ?? []).find(l => l.name === 'Có license')?.value ?? 0;

    return (
        <Box>
            {/* ── Header ────────────────────────────────────────────────────── */}
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
                alignItems={{ sm: 'center' }} gap={2} mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Dashboard</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Tổng quan mạng lưới · {dateFrom} → {dateTo}
                    </Typography>
                </Box>

                <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
                    <ToggleButtonGroup exclusive size="small"
                        value={customFrom ? null : preset}
                        onChange={(_, v) => { if (v !== null) { setPreset(v); setCustomFrom(''); setCustomTo(''); } }}>
                        {PRESETS.map(p => (
                            <ToggleButton key={p.days} value={p.days} sx={{ px: 1.5, fontSize: '0.75rem' }}>
                                {p.label}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    <TextField type="date" size="small" label="Từ ngày" value={customFrom}
                        onChange={e => setCustomFrom(e.target.value)}
                        InputLabelProps={{ shrink: true }} sx={{ width: 148 }} />
                    <TextField type="date" size="small" label="Đến ngày" value={customTo}
                        onChange={e => setCustomTo(e.target.value)}
                        InputLabelProps={{ shrink: true }} sx={{ width: 148 }} />
                </Stack>
            </Stack>

            {/* ── Pie charts ────────────────────────────────────────────────── */}
            <Grid container spacing={2} mb={2.5}>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <PieCard title="Trạng thái" data={charts?.status ?? []}
                        colors={STATUS_COLORS} loading={loadingCharts} total={totalDevices} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <PieCard title="Model" data={charts?.model ?? []}
                        colors={MODEL_PALETTE} loading={loadingCharts} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <PieCard title="Version" data={charts?.version ?? []}
                        colors={VERSION_PALETTE} loading={loadingCharts} />
                </Grid>
            </Grid>

            {/* ── KPI cards ─────────────────────────────────────────────────── */}
            <Box sx={{ display: 'flex', gap: 2, flexWrap: { xs: 'wrap', md: 'nowrap' }, mb: 2.5 }}>
                {[
                    { icon: <Tv />,          label: 'Online',     color: '#4CAF82',
                      value: loadingOverview ? '…' : `${devOnline}/${devTotal}`,
                      sub: `${onlineRate}% online` },
                    { icon: <PlayArrow />,   label: 'Lượt phát', color: '#6C63FF',
                      value: loadingOverview ? '…' : (overview?.playback.totalPlays ?? 0).toLocaleString(),
                      sub: `${overview?.playback.totalMinutes ?? 0} phút` },
                    { icon: <CheckCircle />, label: 'Hoàn thành', color: '#29B6F6',
                      value: loadingOverview ? '…' : `${overview?.playback.completionRate ?? 0}%`,
                      sub: 'tỷ lệ xem hết' },
                    { icon: <BarChartIcon />, label: 'Media',     color: '#FF6584',
                      value: loadingOverview ? '…' : (overview?.media.count ?? 0),
                      sub: fmtBytes(overview?.media.totalSizeBytes ?? 0) },
                    { icon: <QueueMusic />,  label: 'Playlist',   color: '#FFA726',
                      value: loadingOverview ? '…' : (overview?.playlists.total ?? 0),
                      sub: 'danh sách phát' },
                    { icon: <CalendarMonth />, label: 'Schedule', color: '#AB47BC',
                      value: loadingOverview ? '…' : `${overview?.schedules.active ?? 0}/${overview?.schedules.total ?? 0}`,
                      sub: 'đang kích hoạt' },
                    { icon: <VerifiedUser />, label: 'License active', color: '#4CAF50',
                      value: loadingCharts ? '…' : `${licensedCount}/${totalDevices}`,
                      sub: totalDevices > 0 ? `${Math.round(licensedCount / totalDevices * 100)}% thiết bị` : '—' },
                ].map((card, i) => (
                    <Box key={i} sx={{ flex: '1 1 0', minWidth: { xs: 'calc(50% - 8px)', sm: 'calc(33% - 8px)', md: 0 } }}>
                        <KpiCard {...card} loading={loadingOverview} />
                    </Box>
                ))}
            </Box>

            {/* ── Playback chart ────────────────────────────────────────────── */}
            <Card sx={{ mb: 2.5 }}>
                <CardContent sx={{ p: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1.5}>
                        <SectionTitle icon={<BarChartIcon />} title="Lượt phát theo thời gian" />
                        <ToggleButtonGroup exclusive size="small" value={groupBy}
                            onChange={(_, v) => { if (v) setGroupBy(v); }}>
                            <ToggleButton value="day"   sx={{ px: 1.5, fontSize: '0.72rem' }}>Ngày</ToggleButton>
                            <ToggleButton value="week"  sx={{ px: 1.5, fontSize: '0.72rem' }}>Tuần</ToggleButton>
                            <ToggleButton value="month" sx={{ px: 1.5, fontSize: '0.72rem' }}>Tháng</ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>
                    {loadingPlayback ? (
                        <Skeleton variant="rounded" height={240} />
                    ) : chartData.length === 0 ? (
                        <Box sx={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography color="text.secondary" variant="body2">Chưa có dữ liệu phát trong khoảng thời gian này</Typography>
                        </Box>
                    ) : (
                        <ResponsiveContainer width="100%" height={240}>
                            <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="gPlays" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6C63FF" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#6C63FF" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="gDone" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4CAF82" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#4CAF82" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: '#888' }} tickLine={false} axisLine={false} allowDecimals={false} />
                                <RTooltip content={<PlaybackTooltip />} />
                                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                                <Area type="monotone" dataKey="Lượt phát" stroke="#6C63FF" strokeWidth={2} fill="url(#gPlays)" dot={false} activeDot={{ r: 4 }} />
                                <Area type="monotone" dataKey="Hoàn thành" stroke="#4CAF82" strokeWidth={2} fill="url(#gDone)" dot={false} activeDot={{ r: 4 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* ── Top media + Top playlists + Top schedules ─────────────────── */}
            <Grid container spacing={2}>
                {/* Top media */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <SectionTitle icon={<PlayArrow />} title="Media phát nhiều nhất" />
                            {loadingTop ? (
                                <Stack gap={1}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={36} variant="rounded" />)}</Stack>
                            ) : topContent.length === 0 ? (
                                <Box py={4} textAlign="center"><Typography color="text.secondary" variant="body2">Chưa có dữ liệu</Typography></Box>
                            ) : (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            {['#', 'Tên', 'Loại', 'Lượt', '%'].map((h, i) => (
                                                <TableCell key={h} align={i >= 3 ? 'right' : 'left'}
                                                    sx={{ color: 'text.secondary', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', py: 0.5 }}>{h}</TableCell>
                                            ))}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {topContent.map((item, idx) => {
                                            const pct = item.plays > 0 ? Math.round((item.completed ?? 0) / item.plays * 100) : 0;
                                            return (
                                                <TableRow key={item.mediaId} hover>
                                                    <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary" fontWeight={700}>{idx + 1}</Typography></TableCell>
                                                    <TableCell sx={{ py: 0.5 }}>
                                                        <MuiTooltip title={item.title}>
                                                            <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 130 }}>{item.title}</Typography>
                                                        </MuiTooltip>
                                                    </TableCell>
                                                    <TableCell sx={{ py: 0.5 }}><TypeChip type={item.type} /></TableCell>
                                                    <TableCell align="right" sx={{ py: 0.5 }}><Typography variant="body2" fontWeight={700} color="primary.main">{item.plays}</Typography></TableCell>
                                                    <TableCell align="right" sx={{ py: 0.5 }}><Typography variant="body2" color={pct >= 80 ? 'success.main' : pct >= 50 ? 'warning.main' : 'error.main'}>{pct}%</Typography></TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Top playlists */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <SectionTitle icon={<QueueMusic />} title="Playlist phát nhiều nhất" />
                            {loadingTopPl ? (
                                <Stack gap={1}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={36} variant="rounded" />)}</Stack>
                            ) : topPlaylists.length === 0 ? (
                                <Box py={4} textAlign="center"><Typography color="text.secondary" variant="body2">Chưa có dữ liệu</Typography></Box>
                            ) : (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            {['#', 'Tên', 'Lượt', '%'].map((h, i) => (
                                                <TableCell key={h} align={i >= 2 ? 'right' : 'left'}
                                                    sx={{ color: 'text.secondary', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', py: 0.5 }}>{h}</TableCell>
                                            ))}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {topPlaylists.map((item, idx) => {
                                            const pct = item.plays > 0 ? Math.round(item.completed / item.plays * 100) : 0;
                                            return (
                                                <TableRow key={item.playlistId} hover>
                                                    <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary" fontWeight={700}>{idx + 1}</Typography></TableCell>
                                                    <TableCell sx={{ py: 0.5 }}>
                                                        <MuiTooltip title={item.name}>
                                                            <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>{item.name}</Typography>
                                                        </MuiTooltip>
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ py: 0.5 }}><Typography variant="body2" fontWeight={700} color="primary.main">{item.plays}</Typography></TableCell>
                                                    <TableCell align="right" sx={{ py: 0.5 }}><Typography variant="body2" color={pct >= 80 ? 'success.main' : pct >= 50 ? 'warning.main' : 'error.main'}>{pct}%</Typography></TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Top schedules */}
                <Grid size={{ xs: 12, md: 4 }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <SectionTitle icon={<CalendarMonth />} title="Schedule phát nhiều nhất" />
                            {loadingTopSc ? (
                                <Stack gap={1}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={36} variant="rounded" />)}</Stack>
                            ) : topSchedules.length === 0 ? (
                                <Box py={4} textAlign="center"><Typography color="text.secondary" variant="body2">Chưa có dữ liệu</Typography></Box>
                            ) : (
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            {['#', 'Tên', 'Lượt', '%'].map((h, i) => (
                                                <TableCell key={h} align={i >= 2 ? 'right' : 'left'}
                                                    sx={{ color: 'text.secondary', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', py: 0.5 }}>{h}</TableCell>
                                            ))}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {topSchedules.map((item, idx) => {
                                            const pct = item.plays > 0 ? Math.round(item.completed / item.plays * 100) : 0;
                                            return (
                                                <TableRow key={item.scheduleId} hover>
                                                    <TableCell sx={{ py: 0.5 }}><Typography variant="caption" color="text.secondary" fontWeight={700}>{idx + 1}</Typography></TableCell>
                                                    <TableCell sx={{ py: 0.5 }}>
                                                        <MuiTooltip title={item.name}>
                                                            <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>{item.name}</Typography>
                                                        </MuiTooltip>
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ py: 0.5 }}><Typography variant="body2" fontWeight={700} color="primary.main">{item.plays}</Typography></TableCell>
                                                    <TableCell align="right" sx={{ py: 0.5 }}><Typography variant="body2" color={pct >= 80 ? 'success.main' : pct >= 50 ? 'warning.main' : 'error.main'}>{pct}%</Typography></TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
