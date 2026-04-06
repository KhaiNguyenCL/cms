import { useState, useMemo } from 'react';
import {
    Box, Typography, Chip, Button, Stack, TextField,
    Table, TableBody, TableCell, TableHead, TableRow,
    CircularProgress, Tooltip, InputAdornment,
    Dialog, DialogTitle, DialogContent, DialogActions,
    IconButton, Divider, Alert, LinearProgress,
} from '@mui/material';
import {
    Search, SystemUpdate, CheckCircle, Warning, Help,
    Add, Delete, Star, StarBorder, Send,
    History as HistoryIcon, MoreVert, DevicesOther,
    Refresh,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import softwareHistoryApi from '@api/software-history.api';
import type { SoftwareDevice, AppVersion, VersionLog } from '@api/software-history.api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDateTime(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('vi-VN', { hour12: false });
}

function statusColor(status: string): 'success' | 'default' | 'warning' | 'error' {
    if (status === 'ONLINE') return 'success';
    if (status === 'SLEEP')  return 'warning';
    if (status === 'OFFLINE' || status === 'APP_EXIT') return 'error';
    return 'default';
}

function methodLabel(m: string): { label: string; color: 'primary' | 'error' | 'default' } {
    if (m === 'OTA')      return { label: 'OTA Push', color: 'primary' };
    if (m === 'ROLLBACK') return { label: 'Rollback',  color: 'error'  };
    return { label: 'Heartbeat', color: 'default' };
}

// ─── Version Manager Dialog ───────────────────────────────────────────────────

function VersionManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const qc = useQueryClient();
    const [form, setForm] = useState({ versionName: '', versionCode: '', downloadUrl: '', releaseNotes: '', isLatest: false });
    const [adding, setAdding] = useState(false);
    const [otaMsg, setOtaMsg] = useState('');

    const { data: versions = [], isLoading } = useQuery<AppVersion[]>({
        queryKey: ['sw-versions'],
        queryFn: softwareHistoryApi.listVersions,
        enabled: open,
    });

    const createMut = useMutation({
        mutationFn: softwareHistoryApi.createVersion,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sw-versions'] });
            qc.invalidateQueries({ queryKey: ['sw-devices'] });
            setForm({ versionName: '', versionCode: '', downloadUrl: '', releaseNotes: '', isLatest: false });
            setAdding(false);
        },
    });

    const setLatestMut = useMutation({
        mutationFn: softwareHistoryApi.setLatest,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sw-versions'] });
            qc.invalidateQueries({ queryKey: ['sw-devices'] });
        },
    });

    const deleteMut = useMutation({
        mutationFn: softwareHistoryApi.deleteVersion,
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sw-versions'] });
            qc.invalidateQueries({ queryKey: ['sw-devices'] });
        },
    });

    const pushAllMut = useMutation({
        mutationFn: (versionId: string) => softwareHistoryApi.pushOtaAll(versionId),
        onSuccess: (data) => setOtaMsg(`Đã gửi OTA đến ${data.pushed} thiết bị`),
    });

    const latest = versions.find(v => v.isLatest);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle>Quản lý phiên bản ứng dụng</DialogTitle>
            <DialogContent dividers>
                {otaMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setOtaMsg('')}>{otaMsg}</Alert>}

                {latest && (
                    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Phiên bản mới nhất: <strong>{latest.versionName}</strong>
                        </Typography>
                        <Button
                            size="small" variant="contained" startIcon={<Send />}
                            disabled={pushAllMut.isPending}
                            onClick={() => pushAllMut.mutate(latest.id)}
                        >
                            Cập nhật tất cả thiết bị lỗi thời
                        </Button>
                    </Box>
                )}

                {isLoading ? <CircularProgress size={24} /> : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Phiên bản</TableCell>
                                <TableCell>Code</TableCell>
                                <TableCell>Ghi chú</TableCell>
                                <TableCell>Ngày tạo</TableCell>
                                <TableCell align="center">Latest</TableCell>
                                <TableCell align="center">OTA All</TableCell>
                                <TableCell align="center">Xóa</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {versions.map(v => (
                                <TableRow key={v.id} selected={v.isLatest}>
                                    <TableCell>
                                        <Stack direction="row" alignItems="center" gap={0.5}>
                                            {v.versionName}
                                            {v.isLatest && <Chip label="Latest" size="small" color="success" />}
                                        </Stack>
                                    </TableCell>
                                    <TableCell>{v.versionCode}</TableCell>
                                    <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <Tooltip title={v.releaseNotes ?? ''}><span>{v.releaseNotes ?? '—'}</span></Tooltip>
                                    </TableCell>
                                    <TableCell>{fmtDateTime(v.createdAt)}</TableCell>
                                    <TableCell align="center">
                                        <Tooltip title={v.isLatest ? 'Đang là latest' : 'Đặt làm latest'}>
                                            <span>
                                                <IconButton
                                                    size="small"
                                                    disabled={v.isLatest || setLatestMut.isPending}
                                                    onClick={() => setLatestMut.mutate(v.id)}
                                                >
                                                    {v.isLatest ? <Star color="warning" /> : <StarBorder />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title="Push OTA tất cả thiết bị lỗi thời">
                                            <IconButton size="small" disabled={pushAllMut.isPending} onClick={() => pushAllMut.mutate(v.id)}>
                                                <Send fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title={v.organizationId === null ? 'Phiên bản global — không thể xóa' : 'Xóa'}>
                                            <span>
                                                <IconButton
                                                    size="small" color="error"
                                                    disabled={v.organizationId === null || deleteMut.isPending}
                                                    onClick={() => deleteMut.mutate(v.id)}
                                                >
                                                    <Delete fontSize="small" />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}

                <Divider sx={{ my: 2 }} />

                {adding ? (
                    <Stack gap={1.5}>
                        <Typography variant="subtitle2">Thêm phiên bản mới</Typography>
                        <Stack direction="row" gap={1}>
                            <TextField
                                label="Tên phiên bản" size="small" required
                                value={form.versionName}
                                onChange={e => setForm(f => ({ ...f, versionName: e.target.value }))}
                            />
                            <TextField
                                label="Version code" size="small" type="number" required
                                value={form.versionCode}
                                onChange={e => setForm(f => ({ ...f, versionCode: e.target.value }))}
                            />
                        </Stack>
                        <TextField
                            label="Download URL" size="small" required fullWidth
                            value={form.downloadUrl}
                            onChange={e => setForm(f => ({ ...f, downloadUrl: e.target.value }))}
                        />
                        <TextField
                            label="Release notes" size="small" multiline rows={2} fullWidth
                            value={form.releaseNotes}
                            onChange={e => setForm(f => ({ ...f, releaseNotes: e.target.value }))}
                        />
                        <Stack direction="row" gap={1}>
                            <Button
                                variant="contained" size="small"
                                disabled={!form.versionName || !form.versionCode || !form.downloadUrl || createMut.isPending}
                                onClick={() => createMut.mutate({
                                    versionName: form.versionName,
                                    versionCode: Number(form.versionCode),
                                    downloadUrl: form.downloadUrl,
                                    releaseNotes: form.releaseNotes || undefined,
                                    isLatest: form.isLatest,
                                })}
                            >
                                Lưu
                            </Button>
                            <Button size="small" onClick={() => setAdding(false)}>Hủy</Button>
                        </Stack>
                    </Stack>
                ) : (
                    <Button startIcon={<Add />} size="small" onClick={() => setAdding(true)}>
                        Thêm phiên bản
                    </Button>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Đóng</Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Device Logs Panel ────────────────────────────────────────────────────────

function DeviceLogsPanel({ device }: { device: SoftwareDevice }) {
    const qc = useQueryClient();

    const { data: logs = [], isLoading } = useQuery<VersionLog[]>({
        queryKey: ['sw-logs', device.id],
        queryFn: () => softwareHistoryApi.getDeviceLogs(device.id, { limit: 100 }),
    });

    const { data: versions = [] } = useQuery<AppVersion[]>({
        queryKey: ['sw-versions'],
        queryFn: softwareHistoryApi.listVersions,
    });

    const pushOtaMut = useMutation({
        mutationFn: (versionId: string) => softwareHistoryApi.pushOta(device.id, versionId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['sw-logs', device.id] });
            qc.invalidateQueries({ queryKey: ['sw-devices'] });
        },
    });

    const latest = versions.find(v => v.isLatest);

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                        <Typography variant="subtitle1" fontWeight={600}>{device.name}</Typography>
                        <Stack direction="row" gap={1} mt={0.5} flexWrap="wrap">
                            <Chip label={device.status} size="small" color={statusColor(device.status)} />
                            {device.appVersion
                                ? <Chip label={`v${device.appVersion}`} size="small" variant="outlined" />
                                : <Chip label="Chưa rõ phiên bản" size="small" />
                            }
                            {device.isOutdated && (
                                <Chip icon={<Warning />} label="Lỗi thời" size="small" color="warning" />
                            )}
                        </Stack>
                    </Box>
                    {device.isOutdated && latest && (
                        <Button
                            variant="contained" size="small" startIcon={<SystemUpdate />}
                            disabled={pushOtaMut.isPending}
                            onClick={() => pushOtaMut.mutate(latest.id)}
                        >
                            Cập nhật lên {latest.versionName}
                        </Button>
                    )}
                </Stack>
                {device.model && (
                    <Typography variant="caption" color="text.secondary">
                        {device.model} · OS {device.osVersion ?? '—'} · {device.storeName ?? 'Chưa gán store'}
                    </Typography>
                )}
                {pushOtaMut.isSuccess && (
                    <Alert severity="success" sx={{ mt: 1 }}>
                        Đã gửi lệnh OTA. Thiết bị sẽ tự động cập nhật.
                    </Alert>
                )}
                {pushOtaMut.isError && (
                    <Alert severity="error" sx={{ mt: 1 }}>Gửi OTA thất bại.</Alert>
                )}
            </Box>

            {/* Timeline */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                <Typography variant="overline" color="text.secondary">Lịch sử phiên bản</Typography>
                {isLoading && <CircularProgress size={20} sx={{ ml: 1 }} />}
                {!isLoading && logs.length === 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Chưa có lịch sử cập nhật.
                    </Typography>
                )}
                <Stack gap={0} sx={{ mt: 1 }}>
                    {logs.map((log, i) => {
                        const m = methodLabel(log.method);
                        return (
                            <Box key={log.id} sx={{ display: 'flex', gap: 1.5 }}>
                                {/* Timeline dot + line */}
                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                                    <Box sx={{
                                        width: 10, height: 10, borderRadius: '50%', mt: '10px', flexShrink: 0,
                                        bgcolor: log.method === 'OTA' ? 'primary.main'
                                               : log.method === 'ROLLBACK' ? 'error.main' : 'grey.400',
                                    }} />
                                    {i < logs.length - 1 && (
                                        <Box sx={{ width: 2, flex: 1, bgcolor: 'grey.200', minHeight: 20 }} />
                                    )}
                                </Box>
                                <Box sx={{ pb: 2 }}>
                                    <Stack direction="row" alignItems="center" gap={0.5} flexWrap="wrap">
                                        <Chip label={m.label} size="small" color={m.color} />
                                        <Typography variant="body2">
                                            {log.fromVersion ? `${log.fromVersion} → ` : '(mới) → '}
                                            <strong>{log.toVersion}</strong>
                                        </Typography>
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">
                                        {fmtDateTime(log.occurredAt)}
                                        {log.triggeredBy ? ` · bởi ${log.triggeredBy}` : ''}
                                    </Typography>
                                </Box>
                            </Box>
                        );
                    })}
                </Stack>
            </Box>
        </Box>
    );
}

// ─── Report Summary (inline in left panel) ───────────────────────────────────

function ReportSummary() {
    const { data: report } = useQuery({
        queryKey: ['sw-report'],
        queryFn: softwareHistoryApi.getReport,
        refetchInterval: 60_000,
    });

    if (!report || report.total === 0) return null;

    const upPct  = Math.round((report.upToDate / report.total) * 100);
    const outPct = Math.round((report.outdated  / report.total) * 100);

    return (
        <Box sx={{ mb: 1 }}>
            {report.latestVersion && (
                <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5 }}>
                    Latest: <strong>{report.latestVersion}</strong> · {report.total} thiết bị
                </Typography>
            )}
            <Stack gap={0.5}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <CheckCircle fontSize="small" color="success" />
                    <LinearProgress variant="determinate" value={upPct} color="success" sx={{ flex: 1, borderRadius: 1 }} />
                    <Typography variant="caption" sx={{ width: 28 }}>{report.upToDate}</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Warning fontSize="small" color="warning" />
                    <LinearProgress variant="determinate" value={outPct} color="warning" sx={{ flex: 1, borderRadius: 1 }} />
                    <Typography variant="caption" sx={{ width: 28 }}>{report.outdated}</Typography>
                </Stack>
            </Stack>
        </Box>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type FilterKey = 'all' | 'outdated' | 'ok' | 'unknown';

export default function SoftwareHistoryPage() {
    const [search, setSearch]           = useState('');
    const [selected, setSelected]       = useState<SoftwareDevice | null>(null);
    const [versionMgrOpen, setVersionMgrOpen] = useState(false);
    const [filter, setFilter]           = useState<FilterKey>('all');

    const { data: devices = [], isLoading, refetch } = useQuery<SoftwareDevice[]>({
        queryKey: ['sw-devices'],
        queryFn: softwareHistoryApi.getDevices,
        refetchInterval: 60_000,
    });

    const filtered = useMemo(() => {
        let list = devices;
        if (filter === 'outdated') list = list.filter(d => d.isOutdated);
        else if (filter === 'ok')  list = list.filter(d => !d.isOutdated && !!d.appVersion);
        else if (filter === 'unknown') list = list.filter(d => !d.appVersion);
        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(d =>
                d.name.toLowerCase().includes(q) ||
                (d.appVersion ?? '').toLowerCase().includes(q) ||
                (d.storeName ?? '').toLowerCase().includes(q)
            );
        }
        return list;
    }, [devices, search, filter]);

    const outdatedCount = devices.filter(d => d.isOutdated).length;
    const okCount       = devices.filter(d => !d.isOutdated && !!d.appVersion).length;
    const unknownCount  = devices.filter(d => !d.appVersion).length;

    const filterLabels: Record<FilterKey, string> = {
        all:     `Tất cả (${devices.length})`,
        outdated: `Lỗi thời (${outdatedCount})`,
        ok:      `Đã cập nhật (${okCount})`,
        unknown: `Chưa rõ (${unknownCount})`,
    };

    return (
        <Box sx={{ display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
            {/* ── Left Panel ── */}
            <Box sx={{
                width: 380, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                borderRight: '1px solid', borderColor: 'divider',
                overflow: 'hidden',
            }}>
                <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                        <Typography variant="h6" fontWeight={700}>Software History</Typography>
                        <Stack direction="row" gap={0.5}>
                            <Tooltip title="Làm mới">
                                <IconButton size="small" onClick={() => refetch()}>
                                    <Refresh fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Button size="small" variant="outlined" startIcon={<MoreVert />} onClick={() => setVersionMgrOpen(true)}>
                                Phiên bản
                            </Button>
                        </Stack>
                    </Stack>

                    <ReportSummary />

                    <TextField
                        fullWidth size="small" placeholder="Tìm thiết bị..."
                        value={search} onChange={e => setSearch(e.target.value)}
                        sx={{ mb: 1 }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                    />

                    <Stack direction="row" gap={0.5} flexWrap="wrap">
                        {(['all', 'outdated', 'ok', 'unknown'] as FilterKey[]).map(f => (
                            <Chip
                                key={f}
                                label={filterLabels[f]}
                                size="small"
                                variant={filter === f ? 'filled' : 'outlined'}
                                color={f === 'outdated' ? 'warning' : f === 'ok' ? 'success' : 'default'}
                                onClick={() => setFilter(f)}
                            />
                        ))}
                    </Stack>
                </Box>

                <Box sx={{ flex: 1, overflow: 'auto' }}>
                    {isLoading && <CircularProgress size={24} sx={{ m: 2 }} />}
                    {filtered.map(d => (
                        <Box
                            key={d.id}
                            onClick={() => setSelected(d)}
                            sx={{
                                p: 1.5, cursor: 'pointer',
                                borderBottom: '1px solid', borderColor: 'divider',
                                bgcolor: selected?.id === d.id ? 'action.selected' : 'transparent',
                                '&:hover': { bgcolor: 'action.hover' },
                            }}
                        >
                            <Stack direction="row" alignItems="center" gap={1}>
                                <DevicesOther fontSize="small" color={d.isOutdated ? 'warning' : 'disabled'} />
                                <Box flex={1} minWidth={0}>
                                    <Stack direction="row" alignItems="center" gap={0.5} flexWrap="wrap">
                                        <Typography variant="body2" fontWeight={500} noWrap>{d.name}</Typography>
                                        <Chip label={d.status} size="small" color={statusColor(d.status)} sx={{ height: 16, fontSize: 10 }} />
                                    </Stack>
                                    <Stack direction="row" gap={0.5} mt={0.25} flexWrap="wrap" alignItems="center">
                                        {d.appVersion
                                            ? <Typography variant="caption" color="text.secondary">v{d.appVersion}</Typography>
                                            : <Typography variant="caption" color="text.disabled">Chưa rõ</Typography>
                                        }
                                        {d.isOutdated && d.latestVersion && (
                                            <Typography variant="caption" color="warning.main">→ {d.latestVersion}</Typography>
                                        )}
                                        {d.storeName && (
                                            <Typography variant="caption" color="text.disabled">· {d.storeName}</Typography>
                                        )}
                                    </Stack>
                                </Box>
                                {d.isOutdated      && <Warning color="warning" fontSize="small" />}
                                {!d.isOutdated && d.appVersion  && <CheckCircle color="success" fontSize="small" />}
                                {!d.appVersion     && <Help color="disabled" fontSize="small" />}
                            </Stack>
                        </Box>
                    ))}
                    {!isLoading && filtered.length === 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                            Không tìm thấy thiết bị.
                        </Typography>
                    )}
                </Box>
            </Box>

            {/* ── Right Panel ── */}
            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                {selected ? (
                    <DeviceLogsPanel device={selected} />
                ) : (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 1, color: 'text.disabled' }}>
                        <HistoryIcon sx={{ fontSize: 64 }} />
                        <Typography>Chọn thiết bị để xem lịch sử phiên bản</Typography>
                    </Box>
                )}
            </Box>

            <VersionManagerDialog open={versionMgrOpen} onClose={() => setVersionMgrOpen(false)} />
        </Box>
    );
}
