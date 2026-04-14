import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Grid, Card, CardContent,
    ToggleButtonGroup, ToggleButton, TextField, Chip,
    Table, TableBody, TableCell, TableHead, TableRow,
    LinearProgress, Skeleton, Tooltip, alpha,
} from '@mui/material';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
    Tv, PlayArrow, CheckCircle, BarChart as BarChartIcon,
    Storage, Image, VideoFile, Language, FiberManualRecord,
    TrendingUp, MonitorHeart, Memory,
} from '@mui/icons-material';
import { analyticsApi } from '@api/analytics.api';
import type { DeviceHealthStat } from '@/types';

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
    { labelKey: 'analytics.last7d', days: 7 },
    { labelKey: 'analytics.last30d', days: 30 },
    { labelKey: 'analytics.last90d', days: 90 },
] as const;

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub, color = '#6C63FF', loading = false }: {
    icon: React.ReactNode; label: string; value: string | number;
    sub?: string; color?: string; loading?: boolean;
}) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                        <Typography variant="caption" color="text.secondary"
                            sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            {label}
                        </Typography>
                        {loading
                            ? <Skeleton width={80} height={36} sx={{ mt: 0.5 }} />
                            : <Typography variant="h4" fontWeight={700} sx={{ mt: 0.5, lineHeight: 1 }}>{value}</Typography>
                        }
                        {sub && !loading && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>{sub}</Typography>
                        )}
                    </Box>
                    <Box sx={{
                        width: 44, height: 44, borderRadius: 2,
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

// ── Section title ─────────────────────────────────────────────────────────────

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <Stack direction="row" alignItems="center" gap={1} mb={2}>
            <Box sx={{ color: 'primary.main', display: 'flex' }}>{icon}</Box>
            <Typography variant="h6" fontWeight={700}>{title}</Typography>
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

// ── Playback chart tooltip ────────────────────────────────────────────────────

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

// ── Health metric bar ─────────────────────────────────────────────────────────

function HealthBar({ label, value, warnAt, errColor, okColor, suffix = '%', tooltip }: {
    label: string; value: number | null; warnAt: number;
    errColor: string; okColor: string; suffix?: string; tooltip?: string;
}) {
    const v = value ?? 0;
    const bar = (
        <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
            <Typography variant="caption" color="text.secondary" sx={{ width: 48, flexShrink: 0 }}>{label}</Typography>
            <LinearProgress variant="determinate" value={Math.min(v, 100)}
                sx={{
                    flex: 1, height: 6, borderRadius: 3, bgcolor: 'action.selected',
                    '& .MuiLinearProgress-bar': { bgcolor: v > warnAt ? errColor : okColor },
                }} />
            <Typography variant="caption" color="text.secondary" sx={{ width: 42, textAlign: 'right' }}>
                {value === null ? '—' : `${v.toFixed(1)}${suffix}`}
            </Typography>
        </Stack>
    );
    return tooltip
        ? <Tooltip title={tooltip} placement="right" arrow>{bar}</Tooltip>
        : bar;
}

// ── Device health card ────────────────────────────────────────────────────────

function DeviceHealthCard({ dh }: { dh: DeviceHealthStat }) {
    const { t } = useTranslation();
    const hasProcessCpu = dh.processCpuPercent !== null && dh.processCpuPercent !== undefined;

    return (
        <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Stack direction="row" alignItems="center" gap={0.75}>
                    <FiberManualRecord sx={{ fontSize: 10, color: dh.isOnline ? 'success.main' : 'text.disabled' }} />
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 160 }}>
                        {dh.deviceName}
                    </Typography>
                    <Chip label={dh.networkType || '—'} size="small"
                        sx={{ fontSize: '0.6rem', height: 16, px: 0.5, bgcolor: 'action.selected' }} />
                </Stack>
                <Typography variant="caption" color="text.secondary">
                    {dh.reportedAt
                        ? new Date(dh.reportedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                </Typography>
            </Stack>

            {/* CPU system-wide */}
            <HealthBar label={t('analytics.cpuSystem')} value={dh.cpuUsage} warnAt={80}
                errColor="error.main" okColor="primary.main"
                tooltip="CPU toàn máy (/proc/loadavg)" />

            {/* CPU process player — only if reported */}
            {hasProcessCpu && (
                <HealthBar label={t('analytics.cpuProcess')} value={dh.processCpuPercent!} warnAt={60}
                    errColor="warning.main" okColor="info.main"
                    tooltip="CPU riêng process player (/proc/[pid]/stat)" />
            )}

            {/* RAM */}
            <HealthBar label="RAM" value={dh.memoryUsage} warnAt={80}
                errColor="warning.main" okColor="info.main" />

            {/* Disk */}
            <HealthBar label="Disk" value={dh.storagePercent} warnAt={90}
                errColor="error.main" okColor="success.main"
                tooltip={`${fmtBytes(dh.storageUsed)} / ${fmtBytes(dh.storageTotal)}`} />
        </Box>
    );
}

// ── Main Analytics Page ───────────────────────────────────────────────────────

export default function AnalyticsPage() {
    const { t } = useTranslation();
    const [preset, setPreset]       = useState<number>(30);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo]   = useState('');
    const [groupBy, setGroupBy]     = useState<'day' | 'week' | 'month'>('day');

    const { dateFrom, dateTo } = useMemo(() => {
        if (customFrom && customTo) return { dateFrom: customFrom, dateTo: customTo };
        return { dateFrom: toLocalDate(preset), dateTo: toLocalDate(0) };
    }, [preset, customFrom, customTo]);

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
        refetchInterval: 30_000,
    });

    const fmtPeriod = groupBy === 'month' ? fmtDateMonth : groupBy === 'week' ? fmtDateWeek : fmtDate;
    const chartData = playback.map(p => ({
        period: fmtPeriod(p.period),
        plays: p.plays,
        completed: p.completed ?? 0,
    }));

    const devOnline  = overview?.devices.online ?? 0;
    const devTotal   = overview?.devices.total ?? 0;
    const onlineRate = devTotal > 0 ? Math.round((devOnline / devTotal) * 100) : 0;

    // Devices reporting process CPU
    const withProcessCpu = deviceHealth.filter(d => d.processCpuPercent !== null).length;

    return (
        <Box>
            {/* ── Header ──────────────────────────────────────────────────────── */}
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between"
                alignItems={{ sm: 'center' }} gap={2} mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Analytics</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('analytics.statsTitle', { from: dateFrom, to: dateTo })}
                    </Typography>
                </Box>

                <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
                    <ToggleButtonGroup exclusive size="small"
                        value={customFrom ? null : preset}
                        onChange={(_, v) => { if (v !== null) { setPreset(v); setCustomFrom(''); setCustomTo(''); } }}>
                        {PRESETS.map(p => (
                            <ToggleButton key={p.days} value={p.days} sx={{ px: 1.5, fontSize: '0.75rem' }}>
                                {t(p.labelKey)}
                            </ToggleButton>
                        ))}
                    </ToggleButtonGroup>
                    <TextField type="date" size="small" label={t('common.fromDate')} value={customFrom}
                        onChange={e => setCustomFrom(e.target.value)}
                        InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
                    <TextField type="date" size="small" label={t('common.toDate')} value={customTo}
                        onChange={e => setCustomTo(e.target.value)}
                        InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
                </Stack>
            </Stack>

            {/* ── KPI cards ───────────────────────────────────────────────────── */}
            <Grid container spacing={2} mb={3}>
                {[
                    { icon: <Tv />, label: t('analytics.onlineDevices'), color: '#4CAF82',
                      value: loadingOverview ? '…' : `${devOnline}/${devTotal}`,
                      sub: `${onlineRate}% online` },
                    { icon: <PlayArrow />, label: t('analytics.playsLabel'), color: '#6C63FF',
                      value: loadingOverview ? '…' : (overview?.playback.totalPlays ?? 0).toLocaleString(),
                      sub: `${overview?.playback.totalMinutes ?? 0} ${t('analytics.minutes')}` },
                    { icon: <CheckCircle />, label: t('analytics.completionRate'), color: '#29B6F6',
                      value: loadingOverview ? '…' : `${overview?.playback.completionRate ?? 0}%`,
                      sub: t('analytics.completedLabel') },
                    { icon: <BarChartIcon />, label: 'Media', color: '#FF6584',
                      value: loadingOverview ? '…' : (overview?.media.count ?? 0),
                      sub: fmtBytes(overview?.media.totalSizeBytes ?? 0) },
                    { icon: <Storage />, label: t('analytics.totalStorage'), color: '#FFA726',
                      value: loadingOverview ? '…' : fmtBytes(overview?.storage.usedBytes ?? 0),
                      sub: '' },
                    { icon: <TrendingUp />, label: 'Schedules', color: '#AB47BC',
                      value: loadingOverview ? '…' : `${overview?.schedules.active ?? 0}/${overview?.schedules.total ?? 0}`,
                      sub: '' },
                ].map((card, i) => (
                    <Grid key={i} size={{ xs: 6, sm: 4, md: 2 }}>
                        <KpiCard {...card} loading={loadingOverview} />
                    </Grid>
                ))}
            </Grid>

            {/* ── Playback chart ───────────────────────────────────────────────── */}
            <Card sx={{ mb: 3 }}>
                <CardContent sx={{ p: 2.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <SectionTitle icon={<BarChartIcon />} title={t('analytics.playsOverTime')} />
                        <ToggleButtonGroup exclusive size="small" value={groupBy}
                            onChange={(_, v) => { if (v) setGroupBy(v); }}>
                            <ToggleButton value="day"   sx={{ px: 1.5, fontSize: '0.72rem' }}>{t('analytics.byDay')}</ToggleButton>
                            <ToggleButton value="week"  sx={{ px: 1.5, fontSize: '0.72rem' }}>{t('analytics.byWeek')}</ToggleButton>
                            <ToggleButton value="month" sx={{ px: 1.5, fontSize: '0.72rem' }}>{t('analytics.byMonth')}</ToggleButton>
                        </ToggleButtonGroup>
                    </Stack>
                    {loadingPlayback ? (
                        <Skeleton variant="rounded" height={260} />
                    ) : chartData.length === 0 ? (
                        <Box sx={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography color="text.secondary" variant="body2">{t('analytics.noPlayData')}</Typography>
                        </Box>
                    ) : (
                        <ResponsiveContainer width="100%" height={260}>
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
                                <Area type="monotone" dataKey="plays" name={t('analytics.playsLabel')} stroke="#6C63FF" strokeWidth={2} fill="url(#gPlays)" dot={false} activeDot={{ r: 4 }} />
                                <Area type="monotone" dataKey="completed" name={t('analytics.completedLabel')} stroke="#4CAF82" strokeWidth={2} fill="url(#gDone)" dot={false} activeDot={{ r: 4 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </CardContent>
            </Card>

            {/* ── Bottom: Top content + Device health ─────────────────────────── */}
            <Grid container spacing={2}>
                {/* Top content */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <SectionTitle icon={<PlayArrow />} title={t('analytics.topContent')} />
                            {loadingTop ? (
                                <Stack gap={1}>{[...Array(5)].map((_, i) => <Skeleton key={i} height={48} variant="rounded" />)}</Stack>
                            ) : topContent.length === 0 ? (
                                <Box py={6} textAlign="center">
                                    <Typography color="text.secondary" variant="body2">{t('analytics.noPlayData')}</Typography>
                                </Box>
                            ) : (
                                <Box sx={{ overflowX: 'auto' }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                {['#', t('analytics.colFileName'), t('common.type'), t('analytics.colPlays'), t('analytics.colCompleted'), t('analytics.colMinutes')].map((h, i) => (
                                                    <TableCell key={h} align={i >= 3 ? 'right' : 'left'}
                                                        sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase' }}>
                                                        {h}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {topContent.map((item, idx) => {
                                                const pct = item.plays > 0 ? Math.round((item.completed ?? 0) / item.plays * 100) : 0;
                                                return (
                                                    <TableRow key={item.mediaId} hover>
                                                        <TableCell><Typography variant="caption" color="text.secondary" fontWeight={700}>{idx + 1}</Typography></TableCell>
                                                        <TableCell>
                                                            <Tooltip title={item.title}>
                                                                <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>{item.title}</Typography>
                                                            </Tooltip>
                                                        </TableCell>
                                                        <TableCell><TypeChip type={item.type} /></TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" fontWeight={700} color="primary.main">{item.plays.toLocaleString()}</Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color={pct >= 80 ? 'success.main' : pct >= 50 ? 'warning.main' : 'error.main'}>{pct}%</Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography variant="body2" color="text.secondary">{Number(item.totalMinutes).toFixed(1)}</Typography>
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

                {/* Device health */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent sx={{ p: 2.5 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                                <SectionTitle icon={<MonitorHeart />} title={t('analytics.healthTitle')} />
                                {withProcessCpu > 0 && (
                                    <Chip icon={<Memory sx={{ fontSize: 14 }} />}
                                        label={t('analytics.withCpuDevices', { count: withProcessCpu })}
                                        size="small" color="info" variant="outlined"
                                        sx={{ fontSize: '0.65rem' }} />
                                )}
                            </Stack>
                            {loadingHealth ? (
                                <Stack gap={1}>{[...Array(3)].map((_, i) => <Skeleton key={i} height={96} variant="rounded" />)}</Stack>
                            ) : deviceHealth.length === 0 ? (
                                <Box py={6} textAlign="center">
                                    <Typography color="text.secondary" variant="body2">{t('analytics.noHealthData')}</Typography>
                                </Box>
                            ) : (
                                <Stack gap={1.5}>
                                    {deviceHealth.map(dh => <DeviceHealthCard key={dh.deviceId} dh={dh} />)}
                                </Stack>
                            )}
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
}
