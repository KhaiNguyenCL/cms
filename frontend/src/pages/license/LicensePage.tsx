import { useState } from 'react';
import {
    Box, Typography, Tabs, Tab, Stack, Chip, Card, CardContent,
    Table, TableBody, TableCell, TableHead, TableRow, TablePagination,
    CircularProgress, Button, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Tooltip, Alert, alpha, Divider,
    LinearProgress,
} from '@mui/material';
import {
    DevicesOther, PlayArrow,
    SwapHoriz, Add, Refresh, CheckCircle,
    HourglassEmpty, History, Inventory2, ManageSearch, Storage,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import licenseApi from '@api/license.api';
import type { DeviceLicenseRow, LicenseHistoryRow, PurchaseRequestRow, PackageType } from '@api/license.api';
import { storageQuotaApi } from '@api/storage-quota.api';
import type { StoragePurchaseRequest } from '@api/storage-quota.api';

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
        ASSIGN:        { label: 'Cấp',     color: 'success' },
        TRANSFER:      { label: 'Chuyển',  color: 'info' },
        ADJUST_EXPIRY: { label: 'Sửa hạn', color: 'warning' },
        REVOKE:        { label: 'Thu hồi', color: 'error' },
        EDIT_POOL:     { label: 'Sửa kho', color: 'default' },
    };
    const cfg = map[action] ?? { label: action, color: 'default' as const };
    return <Chip label={cfg.label} size="small" color={cfg.color} />;
}

function RequestStatusChip({ status }: { status: string }) {
    if (status === 'APPROVED') return <Chip label="Đã duyệt" size="small" color="success" />;
    if (status === 'REJECTED') return <Chip label="Từ chối"  size="small" color="error" />;
    return <Chip label="Chờ duyệt" size="small" color="warning" icon={<HourglassEmpty fontSize="inherit" />} />;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
    label, value, sub, accent,
}: {
    label: string; value: string | number; sub?: string; accent?: string;
}) {
    return (
        <Card
            variant="outlined"
            sx={{
                flex: '1 1 130px',
                transition: 'box-shadow 0.2s, transform 0.2s',
                cursor: 'default',
                '&:hover': { boxShadow: 3, transform: 'translateY(-2px)' },
            }}
        >
            <CardContent sx={{ pb: '12px !important', pt: 1.5, px: 2 }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    {label}
                </Typography>
                <Typography variant="h4" fontWeight={700} sx={{ color: accent ?? 'text.primary', lineHeight: 1.2 }}>
                    {value}
                </Typography>
                {sub && (
                    <Typography variant="caption" color="text.secondary">{sub}</Typography>
                )}
            </CardContent>
        </Card>
    );
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
            <Typography variant="overline" color="text.secondary" display="block" mb={1}>
                Kho gói
            </Typography>
            <Stack direction="row" gap={1.5} flexWrap="wrap" mb={3}>
                {([['12M', pool.pkg12m], ['24M', pool.pkg24m], ['36M', pool.pkg36m]] as [PackageType, number][]).map(([t, n]) => (
                    <StatCard
                        key={t}
                        label={`Gói ${PKG_LABELS[t]}`}
                        value={n}
                        sub="trong kho"
                        accent={n > 0 ? 'success.main' : undefined}
                    />
                ))}
            </Stack>

            {/* Device stats */}
            <Typography variant="overline" color="text.secondary" display="block" mb={1}>
                Trạng thái thiết bị
            </Typography>
            <Stack direction="row" gap={1.5} flexWrap="wrap" mb={3}>
                <StatCard label="Tổng thiết bị"  value={stats.totalDevices}      />
                <StatCard label="Active"          value={stats.activeDevices}     accent="#16A34A" />
                <StatCard label="Hết hạn"         value={stats.expiredDevices}    accent="#DC2626" />
                <StatCard label="Chưa có license" value={stats.unlicensedDevices} accent="text.disabled" />
                <StatCard label="Hết hạn ≤ 7 ngày"  value={stats.expiringIn7}    accent="#D97706" />
                <StatCard label="Hết hạn ≤ 30 ngày" value={stats.expiringIn30}   accent="#F59E0B" />
            </Stack>

            {/* Request alerts */}
            {recentlyResolved.length > 0 && (
                <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                        <Typography variant="overline" color="text.secondary">
                            Thông báo yêu cầu ({recentlyResolved.length})
                        </Typography>
                        <Chip
                            label={sortAsc ? '↑ Cũ trước' : '↓ Mới trước'}
                            size="small"
                            onClick={() => setSortAsc(v => !v)}
                            sx={{ cursor: 'pointer' }}
                        />
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

    const [assignDev, setAssignDev]     = useState<DeviceLicenseRow | null>(null);
    const [transferDev, setTransferDev] = useState<DeviceLicenseRow | null>(null);
    const [historyDev, setHistoryDev]   = useState<DeviceLicenseRow | null>(null);
    const [selPkg, setSelPkg]           = useState<PackageType>('12M');
    const [toDeviceId, setToDeviceId]   = useState('');
    const [page, setPage]               = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

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

    const pagedDevices = data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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
                    {pagedDevices.map(row => (
                        <TableRow key={row.deviceId} hover
                            sx={{
                                bgcolor: !row.isLicensed && row.expiresAt ? alpha('#DC2626', 0.05)
                                    : row.isLicensed && (row.daysRemaining ?? 999) <= 7  ? alpha('#D97706', 0.07)
                                    : row.isLicensed && (row.daysRemaining ?? 999) <= 30 ? alpha('#F59E0B', 0.05)
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
                                <Typography variant="body2">
                                    {row.packageType ? PKG_LABELS[row.packageType as PackageType] ?? row.packageType : '—'}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant="body2">{fmtDate(row.activatedAt)}</Typography>
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
                                            : (row.daysRemaining ?? 999) <= 7  ? 'error.main'
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
                                    {row.isLicensed && row.expiresAt && (
                                        <Tooltip title="Chuyển sang thiết bị khác">
                                            <IconButton size="small"
                                                onClick={() => { setTransferDev(row); setToDeviceId(''); }}>
                                                <SwapHoriz fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
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
            <TablePagination
                component="div"
                count={data.length}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                rowsPerPageOptions={[5, 10, 25, 50]}
                labelRowsPerPage="Mỗi trang:"
                labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
            />

            {/* Assign Dialog */}
            <Dialog open={!!assignDev} onClose={() => setAssignDev(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Cấp license — {assignDev?.deviceName}</DialogTitle>
                <DialogContent dividers>
                    <TextField select fullWidth label="Chọn gói" value={selPkg}
                        onChange={e => setSelPkg(e.target.value as PackageType)} size="small" sx={{ mt: 0.5 }}>
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
                    <Button size="small" onClick={() => setAssignDev(null)}>Hủy</Button>
                    <Button size="small" disabled={assignMut.isPending} onClick={() => assignMut.mutate()}>Cấp</Button>
                </DialogActions>
            </Dialog>

            {/* Transfer Dialog */}
            <Dialog open={!!transferDev} onClose={() => setTransferDev(null)} maxWidth="xs" fullWidth>
                <DialogTitle>Chuyển license — {transferDev?.deviceName}</DialogTitle>
                <DialogContent dividers>
                    <Stack gap={2} pt={0.5}>
                        <Typography variant="body2" color="text.secondary">
                            Gói {transferDev?.packageType && PKG_LABELS[transferDev.packageType as PackageType]},
                            hết hạn {fmtDate(transferDev?.expiresAt ?? null)} sẽ được chuyển sang thiết bị đích.
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
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setTransferDev(null)}>Hủy</Button>
                    <Button size="small" disabled={!toDeviceId || transferMut.isPending} onClick={() => transferMut.mutate()}>Chuyển</Button>
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
                    {historyDev?.expiresAt ? (
                        <Box sx={{
                            mx: 2, mt: 2, mb: 1, p: 1.5, borderRadius: 1,
                            bgcolor: historyDev.isLicensed ? alpha('#16A34A', 0.07) : alpha('#DC2626', 0.07),
                            border: '1px solid',
                            borderColor: historyDev.isLicensed
                                ? (historyDev.daysRemaining ?? 999) <= 7 ? 'warning.main' : 'success.main'
                                : 'error.main',
                        }}>
                            <Typography variant="subtitle2" fontWeight={600} mb={0.5}>License hiện tại</Typography>
                            <Stack direction="row" gap={2} flexWrap="wrap">
                                <Typography variant="body2">Gói: <strong>{historyDev.packageType ? PKG_LABELS[historyDev.packageType as PackageType] : '—'}</strong></Typography>
                                <Typography variant="body2">Kích hoạt: <strong>{fmtDate(historyDev.activatedAt)}</strong></Typography>
                                <Typography variant="body2">Hết hạn: <strong>{fmtDate(historyDev.expiresAt)}</strong></Typography>
                                {historyDev.daysRemaining != null && historyDev.isLicensed && (
                                    <Chip label={`Còn ${historyDev.daysRemaining} ngày`} size="small"
                                        color={historyDev.daysRemaining <= 7 ? 'error' : historyDev.daysRemaining <= 30 ? 'warning' : 'success'} />
                                )}
                                {!historyDev.isLicensed && <Chip label="Đã hết hạn" size="small" color="error" />}
                            </Stack>
                            {historyDev.activatedByName && (
                                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                                    Cấp bởi: {historyDev.activatedByName}
                                    {historyDev.transferredFromDeviceName && ` (chuyển từ ${historyDev.transferredFromDeviceName})`}
                                </Typography>
                            )}
                        </Box>
                    ) : (
                        <Box sx={{ mx: 2, mt: 2, mb: 1, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                            <Typography variant="body2" color="text.secondary">Thiết bị chưa có license</Typography>
                        </Box>
                    )}
                    <Box sx={{ px: 2, pb: 2 }}>
                        <Typography variant="overline" color="text.secondary" display="block" sx={{ mt: 1.5, mb: 1 }}>
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
                                            <TableCell><Typography variant="caption">{fmtDateTime(h.createdAt)}</Typography></TableCell>
                                            <TableCell><ActionChip action={h.action} /></TableCell>
                                            <TableCell>
                                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                    {h.detail
                                                        ? JSON.stringify(h.detail).replace(/[{}"]/g, '').replace(/,/g, ' | ').slice(0, 80)
                                                        : '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell><Typography variant="caption">{h.performedByName ?? 'Hệ thống'}</Typography></TableCell>
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
                    <Button size="small" onClick={() => setHistoryDev(null)}>Đóng</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

const STORAGE_PACKAGES = [50, 100, 200] as const;
type StoragePackageMb = typeof STORAGE_PACKAGES[number];

function fmtMb(mb: number) {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

// ─── Requests Tab ─────────────────────────────────────────────────────────────

function RequestsTab() {
    const qc = useQueryClient();

    // ── License requests ──────────────────────────────────────────────────────
    const { data: licReqs = [], isLoading: licLoading } = useQuery({
        queryKey: ['license-requests'], queryFn: licenseApi.getPurchaseRequests,
    });
    const [licOpen, setLicOpen]   = useState(false);
    const [selPkg, setSelPkg]     = useState<PackageType>('12M');
    const [licQty, setLicQty]     = useState('1');
    const [licNote, setLicNote]   = useState('');
    const [licPage, setLicPage]   = useState(0);
    const LIC_PER_PAGE = 5;

    const licCreateMut = useMutation({
        mutationFn: () => licenseApi.createPurchaseRequest({
            packageType: selPkg, quantity: parseInt(licQty), note: licNote || undefined,
        }),
        onSuccess: () => {
            setLicOpen(false);
            qc.invalidateQueries({ queryKey: ['license-requests'] });
        },
    });

    // ── Storage requests ──────────────────────────────────────────────────────
    const { data: storReqs = [], isLoading: storLoading } = useQuery({
        queryKey: ['storage-own-requests'], queryFn: storageQuotaApi.listOwnRequests,
    });
    const { data: storUsage } = useQuery({
        queryKey: ['storage-usage'], queryFn: storageQuotaApi.getUsage, staleTime: 30_000,
    });
    const [storOpen, setStorOpen]     = useState(false);
    const [storPkg, setStorPkg]       = useState<StoragePackageMb>(50);
    const [storQty, setStorQty]       = useState('1');
    const [storNote, setStorNote]     = useState('');
    const [storPage, setStorPage]     = useState(0);
    const STOR_PER_PAGE = 5;

    const storCreateMut = useMutation({
        mutationFn: () => storageQuotaApi.createRequest({
            packageMb: storPkg, quantity: parseInt(storQty), note: storNote || undefined,
        }),
        onSuccess: () => {
            setStorOpen(false);
            qc.invalidateQueries({ queryKey: ['storage-own-requests'] });
        },
    });

    const storPreviewMb = storPkg * parseInt(storQty || '1');
    const currentUsedMb = storUsage?.usedMb ?? 0;
    const currentQuotaMb = storUsage?.totalQuotaMb ?? 0;
    const afterMb = currentQuotaMb + storPreviewMb;

    const pagedLicReqs  = licReqs.slice(licPage  * LIC_PER_PAGE,  licPage  * LIC_PER_PAGE  + LIC_PER_PAGE);
    const pagedStorReqs = storReqs.slice(storPage * STOR_PER_PAGE, storPage * STOR_PER_PAGE + STOR_PER_PAGE);

    return (
        <Box>
            {/* ── License purchase requests ── */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Inventory2 fontSize="small" color="primary" />
                    <Typography variant="subtitle1" fontWeight={700}>Yêu cầu mua gói License</Typography>
                </Stack>
                <Button size="small" startIcon={<Add />}
                    onClick={() => { setSelPkg('12M'); setLicQty('1'); setLicNote(''); setLicOpen(true); }}>
                    Tạo yêu cầu
                </Button>
            </Stack>

            {licLoading ? <CircularProgress size={24} sx={{ m: 2 }} /> : (
                <>
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
                        {pagedLicReqs.map((row: PurchaseRequestRow) => (
                            <TableRow key={row.id} hover>
                                <TableCell><Typography variant="body2">{PKG_LABELS[row.packageType as PackageType] ?? row.packageType}</Typography></TableCell>
                                <TableCell><Typography variant="body2">{row.quantity}</Typography></TableCell>
                                <TableCell><Typography variant="caption">{row.note ?? '—'}</Typography></TableCell>
                                <TableCell><RequestStatusChip status={row.status} /></TableCell>
                                <TableCell><Typography variant="caption" color="text.secondary">{row.adminNote ?? '—'}</Typography></TableCell>
                                <TableCell><Typography variant="body2">{fmtDate(row.createdAt)}</Typography></TableCell>
                            </TableRow>
                        ))}
                        {licReqs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.disabled' }}>
                                    Chưa có yêu cầu nào
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                <TablePagination
                    component="div"
                    count={licReqs.length}
                    page={licPage}
                    onPageChange={(_, p) => setLicPage(p)}
                    rowsPerPage={LIC_PER_PAGE}
                    onRowsPerPageChange={() => {}}
                    rowsPerPageOptions={[LIC_PER_PAGE]}
                    labelRowsPerPage=""
                    labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
                />
                </>
            )}

            <Divider sx={{ my: 4 }} />

            {/* ── Storage purchase requests ── */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Storage fontSize="small" color="primary" />
                    <Typography variant="subtitle1" fontWeight={700}>Yêu cầu mua gói Dung lượng</Typography>
                </Stack>
                <Button size="small" startIcon={<Add />}
                    onClick={() => { setStorPkg(50); setStorQty('1'); setStorNote(''); setStorOpen(true); }}>
                    Tạo yêu cầu
                </Button>
            </Stack>

            {/* Current usage summary */}
            {storUsage && (
                <Box sx={{ mb: 2, p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Typography variant="caption" color="text.secondary">Dung lượng hiện tại</Typography>
                        <Typography variant="caption" fontWeight={700}
                            color={storUsage.percentUsed >= 90 ? 'error.main' : storUsage.percentUsed >= 70 ? 'warning.main' : 'text.primary'}>
                            {fmtMb(storUsage.usedMb)} / {fmtMb(storUsage.totalQuotaMb)} · {storUsage.percentUsed}%
                        </Typography>
                    </Stack>
                    <LinearProgress variant="determinate" value={Math.min(storUsage.percentUsed, 100)}
                        color={storUsage.percentUsed >= 90 ? 'error' : storUsage.percentUsed >= 70 ? 'warning' : 'primary'}
                        sx={{ height: 5, borderRadius: 2 }} />
                </Box>
            )}

            {storLoading ? <CircularProgress size={24} sx={{ m: 2 }} /> : (
                <>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Gói</TableCell>
                            <TableCell>Số lượng</TableCell>
                            <TableCell>Tổng</TableCell>
                            <TableCell>Ghi chú</TableCell>
                            <TableCell>Trạng thái</TableCell>
                            <TableCell>Phản hồi admin</TableCell>
                            <TableCell>Ngày tạo</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pagedStorReqs.map((row: StoragePurchaseRequest) => (
                            <TableRow key={row.id} hover>
                                <TableCell><Chip label={`+${row.packageMb} MB`} size="small" variant="outlined" /></TableCell>
                                <TableCell><Typography variant="body2">{row.quantity}</Typography></TableCell>
                                <TableCell><Typography variant="body2" fontWeight={600}>{fmtMb(row.totalMb)}</Typography></TableCell>
                                <TableCell><Typography variant="caption">{row.note ?? '—'}</Typography></TableCell>
                                <TableCell><RequestStatusChip status={row.status} /></TableCell>
                                <TableCell><Typography variant="caption" color="text.secondary">{row.adminNote ?? '—'}</Typography></TableCell>
                                <TableCell><Typography variant="body2">{fmtDate(row.createdAt)}</Typography></TableCell>
                            </TableRow>
                        ))}
                        {storReqs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} align="center" sx={{ py: 3, color: 'text.disabled' }}>
                                    Chưa có yêu cầu nào
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                <TablePagination
                    component="div"
                    count={storReqs.length}
                    page={storPage}
                    onPageChange={(_, p) => setStorPage(p)}
                    rowsPerPage={STOR_PER_PAGE}
                    onRowsPerPageChange={() => {}}
                    rowsPerPageOptions={[STOR_PER_PAGE]}
                    labelRowsPerPage=""
                    labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
                />
                </>
            )}

            {/* ── Dialog: tạo yêu cầu license ── */}
            <Dialog open={licOpen} onClose={() => setLicOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Tạo yêu cầu mua gói License</DialogTitle>
                <DialogContent dividers>
                    <Stack gap={2} pt={0.5}>
                        <TextField select fullWidth label="Loại gói" value={selPkg}
                            onChange={e => setSelPkg(e.target.value as PackageType)} size="small">
                            {PKG_TYPES.map(t => <MenuItem key={t} value={t}>{PKG_LABELS[t]}</MenuItem>)}
                        </TextField>
                        <TextField fullWidth label="Số lượng" type="number" size="small"
                            value={licQty} onChange={e => setLicQty(e.target.value)}
                            inputProps={{ min: 1, max: 100 }} />
                        <TextField fullWidth label="Ghi chú / Lý do" size="small" multiline rows={2}
                            value={licNote} onChange={e => setLicNote(e.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setLicOpen(false)}>Hủy</Button>
                    <Button size="small" disabled={!licQty || licCreateMut.isPending}
                        onClick={() => licCreateMut.mutate()}>Gửi yêu cầu</Button>
                </DialogActions>
            </Dialog>

            {/* ── Dialog: tạo yêu cầu storage ── */}
            <Dialog open={storOpen} onClose={() => setStorOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>
                    <Stack direction="row" alignItems="center" gap={1}>
                        <Storage fontSize="small" />
                        Tạo yêu cầu mua Dung lượng
                    </Stack>
                </DialogTitle>
                <DialogContent dividers>
                    <Stack gap={2} pt={0.5}>
                        <TextField select fullWidth label="Gói dung lượng" value={storPkg}
                            onChange={e => setStorPkg(Number(e.target.value) as StoragePackageMb)} size="small">
                            {STORAGE_PACKAGES.map(mb => (
                                <MenuItem key={mb} value={mb}>+{mb} MB</MenuItem>
                            ))}
                        </TextField>
                        <TextField fullWidth label="Số lượng" type="number" size="small"
                            value={storQty} onChange={e => setStorQty(e.target.value)}
                            inputProps={{ min: 1, max: 100 }}
                            helperText={`Tổng: +${fmtMb(storPreviewMb)}`} />
                        <TextField fullWidth label="Ghi chú / Lý do" size="small" multiline rows={2}
                            value={storNote} onChange={e => setStorNote(e.target.value)} />
                        {storUsage && (
                            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                                    Sau khi duyệt
                                </Typography>
                                <Typography variant="body2" fontWeight={600}>
                                    {fmtMb(currentUsedMb)} / <span style={{ color: '#16A34A' }}>{fmtMb(afterMb)}</span>
                                    {' '}({Math.round((currentUsedMb / afterMb) * 100)}% đã dùng)
                                </Typography>
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setStorOpen(false)}>Hủy</Button>
                    <Button size="small" disabled={!storQty || storCreateMut.isPending}
                        onClick={() => storCreateMut.mutate()}>Gửi yêu cầu</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
    const [page, setPage]               = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const { data = [], isLoading, refetch } = useQuery({
        queryKey: ['license-history'],
        queryFn: () => licenseApi.getHistory(500),
    });

    const paged = data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    return (
        <Box>
            <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={1} mb={2}>
                <IconButton size="small" onClick={() => refetch()} disabled={isLoading}>
                    <Refresh fontSize="small" />
                </IconButton>
            </Stack>

            {isLoading ? <CircularProgress sx={{ m: 3 }} /> : (
                <>
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
                        {paged.map((row: LicenseHistoryRow) => (
                            <TableRow key={row.id} hover>
                                <TableCell><Typography variant="caption">{fmtDateTime(row.createdAt)}</Typography></TableCell>
                                <TableCell><ActionChip action={row.action} /></TableCell>
                                <TableCell><Typography variant="body2">{row.deviceName ?? '—'}</Typography></TableCell>
                                <TableCell>
                                    <Typography variant="caption" sx={{ fontFamily: 'monospace', whiteSpace: 'pre' }}>
                                        {row.detail ? JSON.stringify(row.detail, null, 0)
                                            .replace(/[{}"]/g, '').replace(/,/g, ' | ')
                                            .slice(0, 80) : '—'}
                                    </Typography>
                                </TableCell>
                                <TableCell><Typography variant="body2">{row.performedByName ?? '—'}</Typography></TableCell>
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
                <TablePagination
                    component="div"
                    count={data.length}
                    page={page}
                    onPageChange={(_, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                    rowsPerPageOptions={[10, 25, 50, 100]}
                    labelRowsPerPage="Mỗi trang:"
                    labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
                />
                </>
            )}
        </Box>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LicensePage() {
    const [tab, setTab] = useState(0);

    return (
        <Box sx={{ p: 3 }}>
            {/* Header — consistent with other pages */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>License</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Quản lý giấy phép thiết bị
                    </Typography>
                </Box>
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
