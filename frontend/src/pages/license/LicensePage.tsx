import { useState } from 'react';
import {
    Box, Typography, Tabs, Tab, Stack, Chip, Card, CardContent,
    Table, TableBody, TableCell, TableHead, TableRow,
    CircularProgress, Button, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Tooltip, Alert, alpha,
} from '@mui/material';
import {
    WorkspacePremium, DevicesOther, PlayArrow,
    SwapHoriz, Add, Refresh, CheckCircle,
    HourglassEmpty, History, Inventory2, ManageSearch,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import licenseApi from '@api/license.api';
import type { DeviceLicenseRow, LicenseHistoryRow, PurchaseRequestRow, PackageType } from '@api/license.api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PKG_LABELS: Record<PackageType, string> = {
    '12M': '12 tháng', '24M': '24 tháng', '36M': '36 tháng',
};
const PKG_TYPES: PackageType[] = ['12M', '24M', '36M'];

function fmtDate(s: string | null) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('vi-VN');
}
function fmtDateTime(s: string | null) {
    if (!s) return '—';
    return new Date(s).toLocaleString('vi-VN');
}

function LicenseStatusChip({ row }: { row: DeviceLicenseRow }) {
    if (!row.expiresAt) return <Chip label="Chưa có" size="small" />;
    if (!row.isLicensed) return <Chip label="Hết hạn" size="small" color="error" />;
    if ((row.daysRemaining ?? 0) <= 7)
        return <Chip label={`${row.daysRemaining}d`} size="small" color="warning" />;
    return <Chip label="Active" size="small" color="success" icon={<CheckCircle fontSize="inherit" />} />;
}

function ActionChip({ action }: { action: string }) {
    const map: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default' }> = {
        ASSIGN:        { label: 'Cấp',         color: 'success' },
        TRANSFER:      { label: 'Chuyển',       color: 'info' },
        ADJUST_EXPIRY: { label: 'Sửa hạn',      color: 'warning' },
        REVOKE:        { label: 'Thu hồi',       color: 'error' },
        EDIT_POOL:     { label: 'Sửa kho',       color: 'default' },
    };
    const cfg = map[action] ?? { label: action, color: 'default' as const };
    return <Chip label={cfg.label} size="small" color={cfg.color} />;
}

function RequestStatusChip({ status }: { status: string }) {
    if (status === 'APPROVED') return <Chip label="Đã duyệt" size="small" color="success" />;
    if (status === 'REJECTED') return <Chip label="Từ chối"  size="small" color="error" />;
    return <Chip label="Chờ duyệt" size="small" color="warning" icon={<HourglassEmpty fontSize="inherit" />} />;
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
    const { data: stats, isLoading } = useQuery({
        queryKey: ['license-stats'], queryFn: licenseApi.getStats,
    });
    const { data: requests = [] } = useQuery({
        queryKey: ['license-requests'], queryFn: licenseApi.getPurchaseRequests, staleTime: 60_000,
    });
    const [sortAsc, setSortAsc] = useState(false);

    const recentlyResolved = requests
        .filter(r =>
            (r.status === 'APPROVED' || r.status === 'REJECTED') &&
            r.resolvedAt &&
            Date.now() - new Date(r.resolvedAt).getTime() < 3 * 24 * 60 * 60 * 1000,
        )
        .sort((a, b) => {
            const ta = new Date(a.resolvedAt!).getTime();
            const tb = new Date(b.resolvedAt!).getTime();
            return sortAsc ? ta - tb : tb - ta;
        });

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;
    if (!stats)    return null;

    const pool = stats.pool;

    return (
        <Box>
            {/* Pool counts */}
            <Typography variant="subtitle2" color="text.secondary" mb={1}>Kho gói</Typography>
            <Stack direction="row" gap={2} flexWrap="wrap" mb={3}>
                {([['12M', pool.pkg12m], ['24M', pool.pkg24m], ['36M', pool.pkg36m]] as [PackageType, number][]).map(([t, n]) => (
                    <Card key={t} variant="outlined" sx={{ minWidth: 130 }}>
                        <CardContent sx={{ pb: '12px !important' }}>
                            <Typography variant="caption" color="text.secondary">Gói {PKG_LABELS[t]}</Typography>
                            <Typography variant="h4" fontWeight={700}
                                sx={{ color: n > 0 ? 'success.main' : 'text.disabled' }}>{n}</Typography>
                            <Typography variant="caption" color="text.secondary">trong kho</Typography>
                        </CardContent>
                    </Card>
                ))}
            </Stack>

            {/* Device stats */}
            <Typography variant="subtitle2" color="text.secondary" mb={1}>Trạng thái thiết bị</Typography>
            <Stack direction="row" gap={2} flexWrap="wrap" mb={3}>
                {[
                    { label: 'Tổng',         value: stats.totalDevices,      color: 'text.primary' },
                    { label: 'Active',       value: stats.activeDevices,     color: '#4CAF50' },
                    { label: 'Hết hạn',      value: stats.expiredDevices,    color: '#F44336' },
                    { label: 'Chưa có lic',  value: stats.unlicensedDevices, color: '#9E9E9E' },
                    { label: 'Hết hạn ≤7d',  value: stats.expiringIn7,       color: '#FF9800' },
                    { label: 'Hết hạn ≤30d', value: stats.expiringIn30,      color: '#FFC107' },
                ].map(({ label, value, color }) => (
                    <Box key={label} sx={{ textAlign: 'center', minWidth: 80 }}>
                        <Typography variant="h5" fontWeight={700} sx={{ color }}>{value}</Typography>
                        <Typography variant="caption" color="text.secondary">{label}</Typography>
                    </Box>
                ))}
            </Stack>

            {/* Request alerts */}
            {recentlyResolved.length > 0 && (
                <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Thông báo yêu cầu mua ({recentlyResolved.length})
                        </Typography>
                        <Tooltip title={sortAsc ? 'Đang xếp: cũ trước — bấm để đảo' : 'Đang xếp: mới trước — bấm để đảo'}>
                            <Chip
                                label={sortAsc ? '↑ Cũ trước' : '↓ Mới trước'}
                                size="small"
                                onClick={() => setSortAsc(v => !v)}
                                sx={{ cursor: 'pointer' }}
                            />
                        </Tooltip>
                    </Stack>
                    <Stack gap={1}>
                        {recentlyResolved.map(r => (
                            <Alert key={r.id} severity={r.status === 'APPROVED' ? 'success' : 'warning'} variant="outlined">
                                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
                                    <Box>
                                        Yêu cầu <strong>{r.quantity}× {PKG_LABELS[r.packageType as PackageType] ?? r.packageType}</strong>
                                        {' '}{r.status === 'APPROVED' ? 'đã được duyệt' : 'bị từ chối'}
                                        {r.adminNote ? ` — "${r.adminNote}"` : ''}.
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', mt: 0.2 }}>
                                        {fmtDateTime(r.resolvedAt)}
                                    </Typography>
                                </Stack>
                            </Alert>
                        ))}
                    </Stack>
                </Box>
            )}
        </Box>
    );
}

// ─── Devices Tab ──────────────────────────────────────────────────────────────

function DevicesTab() {
    const qc = useQueryClient();
    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['license-devices'] });
        qc.invalidateQueries({ queryKey: ['license-stats'] });
        qc.invalidateQueries({ queryKey: ['license-history'] });
    };

    const { data = [], isLoading } = useQuery({
        queryKey: ['license-devices'], queryFn: licenseApi.getDeviceLicenses,
    });
    const { data: pool } = useQuery({
        queryKey: ['license-stats'], queryFn: licenseApi.getStats, select: d => d.pool,
    });

    // Dialogs state
    const [assignDev, setAssignDev]     = useState<DeviceLicenseRow | null>(null);
    const [transferDev, setTransferDev] = useState<DeviceLicenseRow | null>(null);
    const [historyDev, setHistoryDev]   = useState<DeviceLicenseRow | null>(null);
    const [selPkg, setSelPkg]           = useState<PackageType>('12M');
    const [toDeviceId, setToDeviceId]   = useState('');

    const { data: devHistory = [], isLoading: histLoading } = useQuery({
        queryKey: ['license-history-device', historyDev?.deviceId],
        queryFn: () => licenseApi.getHistory(50, historyDev!.deviceId),
        enabled: !!historyDev,
        staleTime: 30_000,
    });

    const assignMut = useMutation({
        mutationFn: () => licenseApi.assignLicense(assignDev!.deviceId, selPkg),
        onSuccess: () => { setAssignDev(null); invalidate(); },
    });
    const transferMut = useMutation({
        mutationFn: () => licenseApi.transferLicense(transferDev!.deviceId, toDeviceId),
        onSuccess: () => { setTransferDev(null); invalidate(); },
    });
    const availableTargets = data.filter(d => d.deviceId !== transferDev?.deviceId && (!d.isLicensed || !d.expiresAt));

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;

    return (
        <Box>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Thiết bị</TableCell>
                        <TableCell>Trạng thái</TableCell>
                        <TableCell>Gói</TableCell>
                        <TableCell>Kích hoạt</TableCell>
                        <TableCell>Hết hạn</TableCell>
                        <TableCell align="right">Thao tác</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map(row => (
                        <TableRow key={row.deviceId} hover
                            sx={{
                                bgcolor: !row.isLicensed && row.expiresAt ? alpha('#F44336', 0.07)
                                    : row.isLicensed && (row.daysRemaining ?? 999) <= 7 ? alpha('#FF9800', 0.10)
                                    : row.isLicensed && (row.daysRemaining ?? 999) <= 30 ? alpha('#FFC107', 0.06)
                                    : undefined,
                            }}>
                            <TableCell>
                                <Typography variant="body2" fontWeight={500}>{row.deviceName}</Typography>
                                {row.transferredFromDeviceName && (
                                    <Typography variant="caption" color="text.secondary">
                                        ← {row.transferredFromDeviceName}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell><LicenseStatusChip row={row} /></TableCell>
                            <TableCell>
                                {row.packageType ? PKG_LABELS[row.packageType as PackageType] ?? row.packageType : '—'}
                            </TableCell>
                            <TableCell>
                                <Typography variant="caption">{fmtDate(row.activatedAt)}</Typography>
                                {row.activatedByName && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        bởi {row.activatedByName}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell>
                                <Typography
                                    variant="body2"
                                    sx={{
                                        color: !row.expiresAt ? 'text.disabled'
                                            : !row.isLicensed ? 'error.main'
                                            : (row.daysRemaining ?? 999) <= 7 ? 'error.main'
                                            : (row.daysRemaining ?? 999) <= 30 ? 'warning.main'
                                            : 'success.main',
                                    }}
                                >
                                    {row.expiresAt ? fmtDate(row.expiresAt) : '—'}
                                </Typography>
                                {row.daysRemaining != null && row.isLicensed && (
                                    <Typography variant="caption" color="text.secondary">
                                        còn {row.daysRemaining}d
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell align="right">
                                <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                    {/* Assign — if no active license */}
                                    {(!row.expiresAt || !row.isLicensed) && pool && (
                                        <Tooltip title="Cấp license">
                                            <span>
                                                <IconButton size="small" color="success"
                                                    disabled={(pool.pkg12m + pool.pkg24m + pool.pkg36m) === 0}
                                                    onClick={() => { setAssignDev(row); setSelPkg('12M'); }}>
                                                    <PlayArrow fontSize="inherit" />
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    )}
                                    {/* Transfer — if has active license */}
                                    {row.isLicensed && row.expiresAt && (
                                        <Tooltip title="Chuyển sang thiết bị khác">
                                            <IconButton size="small"
                                                onClick={() => { setTransferDev(row); setToDeviceId(''); }}>
                                                <SwapHoriz fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    {/* History */}
                                    <Tooltip title="Lịch sử license">
                                        <IconButton size="small" onClick={() => setHistoryDev(row)}>
                                            <ManageSearch fontSize="inherit" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            </TableCell>
                        </TableRow>
                    ))}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                Không có thiết bị
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            {/* Assign Dialog */}
            <Dialog open={!!assignDev} onClose={() => setAssignDev(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Cấp license: {assignDev?.deviceName}</DialogTitle>
                <DialogContent>
                    <TextField select fullWidth label="Chọn gói" value={selPkg}
                        onChange={e => setSelPkg(e.target.value as PackageType)} sx={{ mt: 2 }}>
                        {PKG_TYPES.map(t => {
                            const cnt = pool ? { '12M': pool.pkg12m, '24M': pool.pkg24m, '36M': pool.pkg36m }[t] : 0;
                            return (
                                <MenuItem key={t} value={t} disabled={cnt === 0}>
                                    {PKG_LABELS[t]} — còn {cnt} gói
                                </MenuItem>
                            );
                        })}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAssignDev(null)}>Hủy</Button>
                    <Button variant="contained" disabled={assignMut.isPending} onClick={() => assignMut.mutate()}>
                        Cấp
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Transfer Dialog */}
            <Dialog open={!!transferDev} onClose={() => setTransferDev(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Chuyển license từ {transferDev?.deviceName}</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary" mb={2}>
                        License ({transferDev?.packageType && PKG_LABELS[transferDev.packageType as PackageType]}) sẽ được chuyển sang thiết bị đích.
                        Hết hạn: {fmtDate(transferDev?.expiresAt ?? null)}
                    </Typography>
                    <TextField select fullWidth label="Thiết bị đích" value={toDeviceId}
                        onChange={e => setToDeviceId(e.target.value)} size="small">
                        {availableTargets.map(d => (
                            <MenuItem key={d.deviceId} value={d.deviceId}>{d.deviceName}</MenuItem>
                        ))}
                        {availableTargets.length === 0 && (
                            <MenuItem disabled>Không có thiết bị đủ điều kiện</MenuItem>
                        )}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTransferDev(null)}>Hủy</Button>
                    <Button variant="contained" disabled={!toDeviceId || transferMut.isPending}
                        onClick={() => transferMut.mutate()}>
                        Chuyển
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Device License History Dialog */}
            <Dialog open={!!historyDev} onClose={() => setHistoryDev(null)} maxWidth="md" fullWidth>
                <DialogTitle>
                    <Stack direction="row" alignItems="center" gap={1}>
                        <History fontSize="small" color="primary" />
                        Lịch sử license — {historyDev?.deviceName}
                    </Stack>
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    {/* Active license summary */}
                    {historyDev?.expiresAt && (
                        <Box sx={{
                            mx: 2, mt: 2, mb: 1, p: 1.5, borderRadius: 1,
                            bgcolor: historyDev.isLicensed ? alpha('#4CAF50', 0.08) : alpha('#F44336', 0.08),
                            border: '1px solid',
                            borderColor: historyDev.isLicensed
                                ? (historyDev.daysRemaining ?? 999) <= 7 ? 'warning.main' : 'success.main'
                                : 'error.main',
                        }}>
                            <Typography variant="subtitle2" fontWeight={600} mb={0.5}>
                                License hiện tại
                            </Typography>
                            <Stack direction="row" gap={2} flexWrap="wrap">
                                <Typography variant="body2">
                                    Gói: <strong>{historyDev.packageType ? PKG_LABELS[historyDev.packageType as PackageType] : '—'}</strong>
                                </Typography>
                                <Typography variant="body2">
                                    Kích hoạt: <strong>{fmtDate(historyDev.activatedAt)}</strong>
                                </Typography>
                                <Typography variant="body2">
                                    Hết hạn: <strong>{fmtDate(historyDev.expiresAt)}</strong>
                                </Typography>
                                {historyDev.daysRemaining != null && historyDev.isLicensed && (
                                    <Chip label={`Còn ${historyDev.daysRemaining} ngày`} size="small"
                                        color={historyDev.daysRemaining <= 7 ? 'error' : historyDev.daysRemaining <= 30 ? 'warning' : 'success'} />
                                )}
                                {!historyDev.isLicensed && <Chip label="Đã hết hạn" size="small" color="error" />}
                            </Stack>
                            {historyDev.activatedByName && (
                                <Typography variant="caption" color="text.secondary">
                                    Cấp bởi: {historyDev.activatedByName}
                                    {historyDev.transferredFromDeviceName && ` (chuyển từ ${historyDev.transferredFromDeviceName})`}
                                </Typography>
                            )}
                        </Box>
                    )}
                    {!historyDev?.expiresAt && (
                        <Box sx={{ mx: 2, mt: 2, mb: 1, p: 1.5, borderRadius: 1, bgcolor: alpha('#9E9E9E', 0.08) }}>
                            <Typography variant="body2" color="text.secondary">Thiết bị chưa có license</Typography>
                        </Box>
                    )}

                    {/* History table */}
                    <Box sx={{ px: 2, pb: 2 }}>
                        <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1.5, mb: 1 }}>
                            Lịch sử thay đổi
                        </Typography>
                        {histLoading ? <CircularProgress size={24} sx={{ m: 2 }} /> : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Thời gian</TableCell>
                                        <TableCell>Hành động</TableCell>
                                        <TableCell>Chi tiết</TableCell>
                                        <TableCell>Người thực hiện</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {devHistory.map((h: LicenseHistoryRow) => (
                                        <TableRow key={h.id} hover>
                                            <TableCell>
                                                <Typography variant="caption">{fmtDateTime(h.createdAt)}</Typography>
                                            </TableCell>
                                            <TableCell><ActionChip action={h.action} /></TableCell>
                                            <TableCell>
                                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                    {h.detail
                                                        ? JSON.stringify(h.detail).replace(/[{}"]/g, '').replace(/,/g, ' | ').slice(0, 80)
                                                        : '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption">{h.performedByName ?? 'Hệ thống'}</Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {devHistory.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.disabled' }}>
                                                Chưa có lịch sử
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setHistoryDev(null)}>Đóng</Button>
                </DialogActions>
            </Dialog>

        </Box>
    );
}

// ─── Requests Tab ─────────────────────────────────────────────────────────────

function RequestsTab() {
    const qc = useQueryClient();
    const { data = [], isLoading } = useQuery({
        queryKey: ['license-requests'], queryFn: licenseApi.getPurchaseRequests,
    });

    const [newOpen, setNewOpen] = useState(false);
    const [selPkg, setSelPkg]   = useState<PackageType>('12M');
    const [qty, setQty]         = useState('1');
    const [note, setNote]       = useState('');

    const createMut = useMutation({
        mutationFn: () => licenseApi.createPurchaseRequest({
            packageType: selPkg, quantity: parseInt(qty), note: note || undefined,
        }),
        onSuccess: () => {
            setNewOpen(false);
            qc.invalidateQueries({ queryKey: ['license-requests'] });
        },
    });

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;

    return (
        <Box>
            <Stack direction="row" justifyContent="flex-end" mb={2}>
                <Button variant="outlined" size="small" startIcon={<Add />}
                    onClick={() => { setSelPkg('12M'); setQty('1'); setNote(''); setNewOpen(true); }}>
                    Tạo yêu cầu mua
                </Button>
            </Stack>

            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Gói</TableCell>
                        <TableCell>Số lượng</TableCell>
                        <TableCell>Ghi chú</TableCell>
                        <TableCell>Trạng thái</TableCell>
                        <TableCell>Phản hồi admin</TableCell>
                        <TableCell>Ngày tạo</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map(row => (
                        <TableRow key={row.id} hover>
                            <TableCell>{PKG_LABELS[row.packageType as PackageType] ?? row.packageType}</TableCell>
                            <TableCell>{row.quantity}</TableCell>
                            <TableCell><Typography variant="caption">{row.note ?? '—'}</Typography></TableCell>
                            <TableCell><RequestStatusChip status={row.status} /></TableCell>
                            <TableCell>
                                <Typography variant="caption" color="text.secondary">
                                    {row.adminNote ?? '—'}
                                </Typography>
                            </TableCell>
                            <TableCell><Typography variant="caption">{fmtDate(row.createdAt)}</Typography></TableCell>
                        </TableRow>
                    ))}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                Chưa có yêu cầu nào
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            {/* Create Request Dialog */}
            <Dialog open={newOpen} onClose={() => setNewOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Tạo yêu cầu mua gói</DialogTitle>
                <DialogContent>
                    <Stack gap={2} mt={1}>
                        <TextField select fullWidth label="Loại gói" value={selPkg}
                            onChange={e => setSelPkg(e.target.value as PackageType)} size="small">
                            {PKG_TYPES.map(t => <MenuItem key={t} value={t}>{PKG_LABELS[t]}</MenuItem>)}
                        </TextField>
                        <TextField fullWidth label="Số lượng" type="number" size="small"
                            value={qty} onChange={e => setQty(e.target.value)}
                            inputProps={{ min: 1, max: 100 }} />
                        <TextField fullWidth label="Ghi chú / Lý do" size="small" multiline rows={2}
                            value={note} onChange={e => setNote(e.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNewOpen(false)}>Hủy</Button>
                    <Button variant="contained" disabled={!qty || createMut.isPending}
                        onClick={() => createMut.mutate()}>
                        Gửi yêu cầu
                    </Button>
                </DialogActions>
            </Dialog>

        </Box>
    );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
    const [limit, setLimit] = useState(100);
    const { data = [], isLoading, refetch } = useQuery({
        queryKey: ['license-history', limit],
        queryFn: () => licenseApi.getHistory(limit),
    });

    return (
        <Box>
            <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={1} mb={2}>
                <TextField select size="small" value={limit} onChange={e => setLimit(Number(e.target.value))}
                    sx={{ width: 120 }}>
                    {[50, 100, 200, 500].map(v => (
                        <MenuItem key={v} value={v}>{v} dòng</MenuItem>
                    ))}
                </TextField>
                <IconButton size="small" onClick={() => refetch()} disabled={isLoading}>
                    <Refresh fontSize="small" />
                </IconButton>
            </Stack>

            {isLoading ? <CircularProgress sx={{ m: 3 }} /> : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Thời gian</TableCell>
                            <TableCell>Hành động</TableCell>
                            <TableCell>Thiết bị</TableCell>
                            <TableCell>Chi tiết</TableCell>
                            <TableCell>Người thực hiện</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {data.map((row: LicenseHistoryRow) => (
                            <TableRow key={row.id} hover>
                                <TableCell>
                                    <Typography variant="caption">{fmtDateTime(row.createdAt)}</Typography>
                                </TableCell>
                                <TableCell><ActionChip action={row.action} /></TableCell>
                                <TableCell>{row.deviceName ?? '—'}</TableCell>
                                <TableCell>
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'pre' }}>
                                        {row.detail ? JSON.stringify(row.detail, null, 0)
                                            .replace(/[{}"]/g, '').replace(/,/g, ' | ')
                                            .slice(0, 80) : '—'}
                                    </Typography>
                                </TableCell>
                                <TableCell>{row.performedByName ?? '—'}</TableCell>
                            </TableRow>
                        ))}
                        {data.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                    Chưa có lịch sử
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            )}
        </Box>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LicensePage() {
    const [tab, setTab] = useState(0);

    return (
        <Box>
            <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
                <WorkspacePremium color="primary" />
                <Typography variant="h5" fontWeight={700}>License</Typography>
            </Stack>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab icon={<Inventory2 fontSize="small" />} iconPosition="start" label="Tổng quan" />
                <Tab icon={<DevicesOther fontSize="small" />} iconPosition="start" label="Thiết bị" />
                <Tab icon={<Add fontSize="small" />} iconPosition="start" label="Yêu cầu mua" />
                <Tab icon={<History fontSize="small" />} iconPosition="start" label="Lịch sử" />
            </Tabs>

            {tab === 0 && <OverviewTab />}
            {tab === 1 && <DevicesTab />}
            {tab === 2 && <RequestsTab />}
            {tab === 3 && <HistoryTab />}
        </Box>
    );
}
