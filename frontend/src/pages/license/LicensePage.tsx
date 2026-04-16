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
    BackupOutlined, ArrowUpward, ArrowDownward,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import licenseApi from '@api/license.api';
import type { DeviceLicenseRow, LicenseHistoryRow, PurchaseRequestRow, TransferRequestRow, PackageType } from '@api/license.api';
import { devicesApi } from '@api/devices.api';
import { storageQuotaApi } from '@api/storage-quota.api';
import type { StoragePurchaseRequest } from '@api/storage-quota.api';
import { backupApi } from '@api/backup.api';
import type { BackupPlanRequest } from '@/types';
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PKG_LABEL_KEYS: Record<PackageType, string> = {
    '12M': 'license.pkg12m', '24M': 'license.pkg24m', '36M': 'license.pkg36m',
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
    const { t } = useTranslation();
    if (!row.expiresAt) return <Chip label={t('license.noLicense')} size="small" />;
    if (!row.isLicensed) return <Chip label={t('license.expired')} size="small" color="error" />;
    if ((row.daysRemaining ?? 0) <= 7)
        return <Chip label={t('license.daysLeft', { days: row.daysRemaining })} size="small" color="warning" />;
    return <Chip label={t('license.active')} size="small" color="success" icon={<CheckCircle fontSize="inherit" />} />;
}

function ActionChip({ action }: { action: string }) {
    const { t } = useTranslation();
    const map: Record<string, { labelKey: string; color: 'success' | 'error' | 'warning' | 'info' | 'default' }> = {
        ASSIGN:        { labelKey: 'license.actionAssign',       color: 'success' },
        TRANSFER:      { labelKey: 'license.actionTransfer',     color: 'info' },
        ADJUST_EXPIRY: { labelKey: 'license.actionAdjustExpiry', color: 'warning' },
        REVOKE:        { labelKey: 'license.actionRevoke',       color: 'error' },
        EDIT_POOL:     { labelKey: 'license.actionEditPool',     color: 'default' },
    };
    const cfg = map[action];
    const label = cfg ? t(cfg.labelKey) : action;
    const color = cfg?.color ?? 'default' as const;
    return <Chip label={label} size="small" color={color} />;
}

function RequestStatusChip({ status }: { status: string }) {
    const { t } = useTranslation();
    if (status === 'APPROVED') return <Chip label={t('license.statusApproved')} size="small" color="success" />;
    if (status === 'REJECTED') return <Chip label={t('license.statusRejected')} size="small" color="error" />;
    return <Chip label={t('license.statusPending')} size="small" color="warning" icon={<HourglassEmpty fontSize="inherit" />} />;
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
    const { t } = useTranslation();
    const { data: stats, isLoading } = useQuery({
        queryKey: ['license-stats'], queryFn: licenseApi.getStats,
    });
    const { data: requests = [] } = useQuery({
        queryKey: ['license-requests'], queryFn: licenseApi.getPurchaseRequests, staleTime: 60_000,
    });
    const [sortAsc, setSortAsc]   = useState(false);
    const [showAllAlerts, setShowAllAlerts] = useState(false);
    const ALERTS_COLLAPSED = 5;

    const allResolved = requests
        .filter(r => (r.status === 'APPROVED' || r.status === 'REJECTED') && r.resolvedAt)
        .sort((a, b) => {
            const ta = new Date(a.resolvedAt!).getTime();
            const tb = new Date(b.resolvedAt!).getTime();
            return sortAsc ? ta - tb : tb - ta;
        });

    const visibleAlerts = showAllAlerts ? allResolved : allResolved.slice(0, ALERTS_COLLAPSED);

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;
    if (!stats)    return null;

    const pool = stats.pool;

    return (
        <Box>
            {/* Pool counts */}
            <Typography variant="overline" color="text.secondary" display="block" mb={1}>
                {t('license.pool')}
            </Typography>
            <Stack direction="row" gap={1.5} flexWrap="wrap" mb={3}>
                {([['12M', pool.pkg12m], ['24M', pool.pkg24m], ['36M', pool.pkg36m]] as [PackageType, number][]).map(([pkg, n]) => (
                    <StatCard
                        key={pkg}
                        label={`${t('license.package')} ${t(PKG_LABEL_KEYS[pkg])}`}
                        value={n}
                        sub={t('license.inPool')}
                        accent={n > 0 ? 'success.main' : undefined}
                    />
                ))}
            </Stack>

            {/* Device stats */}
            <Typography variant="overline" color="text.secondary" display="block" mb={1}>
                {t('common.status')}
            </Typography>
            <Stack direction="row" gap={1.5} flexWrap="wrap" mb={3}>
                <StatCard label={t('common.total')}         value={stats.totalDevices}      />
                <StatCard label={t('license.active')}       value={stats.activeDevices}     accent="#16A34A" />
                <StatCard label={t('license.expired')}      value={stats.expiredDevices}    accent="#DC2626" />
                <StatCard label={t('license.noLicense')}    value={stats.unlicensedDevices} accent="text.disabled" />
                <StatCard label={`${t('license.expired')} ≤ 7d`}  value={stats.expiringIn7}    accent="#D97706" />
                <StatCard label={`${t('license.expired')} ≤ 30d`} value={stats.expiringIn30}   accent="#F59E0B" />
            </Stack>

            {/* Request alerts — all resolved, no time limit */}
            {allResolved.length > 0 && (
                <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                        <Typography variant="overline" color="text.secondary">
                            {t('license.requestAlerts', { count: allResolved.length })}
                        </Typography>
                        <Chip
                            label={sortAsc ? t('license.sortOldFirst') : t('license.sortNewFirst')}
                            size="small"
                            onClick={() => setSortAsc(v => !v)}
                            sx={{ cursor: 'pointer' }}
                        />
                    </Stack>
                    <Stack gap={1}>
                        {visibleAlerts.map(r => (
                            <Alert key={r.id} severity={r.status === 'APPROVED' ? 'success' : 'warning'} variant="outlined">
                                <Stack direction="row" alignItems="flex-start" justifyContent="space-between" gap={2}>
                                    <Box>
                                        {t('license.requests')}: <strong>{r.quantity}× {t(PKG_LABEL_KEYS[r.packageType as PackageType] ?? r.packageType)}</strong>
                                        {' '}{r.status === 'APPROVED' ? t('license.statusApproved') : t('license.statusRejected')}
                                        {r.adminNote ? ` — "${r.adminNote}"` : ''}.
                                    </Box>
                                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap', mt: 0.2 }}>
                                        {fmtDateTime(r.resolvedAt)}
                                    </Typography>
                                </Stack>
                            </Alert>
                        ))}
                    </Stack>
                    {allResolved.length > ALERTS_COLLAPSED && (
                        <Button
                            size="small"
                            variant="text"
                            onClick={() => setShowAllAlerts(v => !v)}
                            sx={{ mt: 1 }}
                        >
                            {showAllAlerts
                                ? t('common.showLess')
                                : t('common.showMore', { count: allResolved.length - ALERTS_COLLAPSED })}
                        </Button>
                    )}
                </Box>
            )}
        </Box>
    );
}

// ─── Devices Tab ──────────────────────────────────────────────────────────────

function DevicesTab() {
    const qc = useQueryClient();
    const dispatch = useAppDispatch();
    const { t } = useTranslation();
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

    const [assignDev, setAssignDev]       = useState<DeviceLicenseRow | null>(null);
    const [transferReqDev, setTransferReqDev] = useState<DeviceLicenseRow | null>(null);
    const [historyDev, setHistoryDev]     = useState<DeviceLicenseRow | null>(null);
    const [selPkg, setSelPkg]             = useState<PackageType>('12M');
    const [toDeviceId, setToDeviceId]     = useState('');
    const [transferNote, setTransferNote] = useState('');
    const [page, setPage]                 = useState(0);
    const [rowsPerPage, setRowsPerPage]   = useState(10);

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
    const { data: allDevices = [] } = useQuery({
        queryKey: ['devices-all-for-transfer'],
        queryFn: () => devicesApi.list({ limit: 200 }).then(r => r.data),
        enabled: !!transferReqDev,
        staleTime: 30_000,
    });

    const transferReqMut = useMutation({
        mutationFn: () => licenseApi.createTransferRequest(transferReqDev!.deviceId, toDeviceId, transferNote || undefined),
        onSuccess: () => {
            setTransferReqDev(null);
            setToDeviceId('');
            setTransferNote('');
            qc.invalidateQueries({ queryKey: ['license-transfer-requests'] });
            dispatch(pushToast({ severity: 'success', message: 'Đã gửi yêu cầu chuyển license' }));
        },
        onError: (err: any) => dispatch(pushToast({
            severity: 'error',
            message: err?.response?.data?.error ?? t('common.failedAction'),
        })),
    });

    const licensedDeviceIds = new Set(data.filter(d => d.isLicensed).map(d => d.deviceId));
    const availableTargets = allDevices.filter(d => d.id !== transferReqDev?.deviceId);
    const selectedTargetHasLicense = toDeviceId ? licensedDeviceIds.has(toDeviceId) : false;

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;

    const pagedDevices = data.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    return (
        <Box>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('devices.title')}</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('license.package')}</TableCell>
                        <TableCell>{t('license.activatedAt')}</TableCell>
                        <TableCell>{t('license.expiresAt')}</TableCell>
                        <TableCell align="right">{t('common.actions')}</TableCell>
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
                                    {row.packageType ? t(PKG_LABEL_KEYS[row.packageType as PackageType] ?? row.packageType) : '—'}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant="body2">{fmtDate(row.activatedAt)}</Typography>
                                {row.activatedByName && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        {t('license.activatedBy')}: {row.activatedByName}
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
                                        {t('license.daysLeft', { days: row.daysRemaining })}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell align="right">
                                <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                    {(!row.expiresAt || !row.isLicensed) && pool && (
                                        <Tooltip title={t('license.assignLicense')}>
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
                                        <Tooltip title={t('license.requestTransfer')}>
                                            <IconButton size="small"
                                                onClick={() => { setTransferReqDev(row); setToDeviceId(''); setTransferNote(''); }}>
                                                <SwapHoriz fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    <Tooltip title={t('license.licenseHistory')}>
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
                                {t('license.noDevices')}
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
                labelRowsPerPage={t("common.perPage")}
                labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
            />

            {/* Assign Dialog */}
            <Dialog open={!!assignDev} onClose={() => setAssignDev(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('license.assign')} — {assignDev?.deviceName}</DialogTitle>
                <DialogContent dividers>
                    <TextField select fullWidth label={t('license.packageType')} value={selPkg}
                        onChange={e => setSelPkg(e.target.value as PackageType)} size="small" sx={{ mt: 0.5 }}>
                        {PKG_TYPES.map(pkg => {
                            const cnt = pool ? { '12M': pool.pkg12m, '24M': pool.pkg24m, '36M': pool.pkg36m }[pkg] : 0;
                            return (
                                <MenuItem key={pkg} value={pkg} disabled={cnt === 0}>
                                    {t(PKG_LABEL_KEYS[pkg])} — {t('license.remaining')}: {cnt}
                                </MenuItem>
                            );
                        })}
                    </TextField>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setAssignDev(null)}>{t('common.cancel')}</Button>
                    <Button size="small" disabled={assignMut.isPending} onClick={() => assignMut.mutate()}>{t('common.assign')}</Button>
                </DialogActions>
            </Dialog>

            {/* Request Transfer Dialog */}
            <Dialog open={!!transferReqDev} onClose={() => setTransferReqDev(null)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('license.requestTransfer')} — {transferReqDev?.deviceName}</DialogTitle>
                <DialogContent dividers>
                    <Stack gap={2} pt={0.5}>
                        <Typography variant="body2" color="text.secondary">
                            {t('license.package')}: {transferReqDev?.packageType && t(PKG_LABEL_KEYS[transferReqDev.packageType as PackageType])},
                            {t('license.expiresAt')}: {fmtDate(transferReqDev?.expiresAt ?? null)}
                        </Typography>
                        <TextField select fullWidth label={t('license.targetDevice')} value={toDeviceId}
                            onChange={e => setToDeviceId(e.target.value)} size="small">
                            {availableTargets.map(d => (
                                <MenuItem key={d.id} value={d.id}>
                                    {d.name}
                                    {licensedDeviceIds.has(d.id) && (
                                        <Typography component="span" variant="caption" color="warning.main" sx={{ ml: 1 }}>
                                            (đang có license)
                                        </Typography>
                                    )}
                                </MenuItem>
                            ))}
                            {availableTargets.length === 0 && (
                                <MenuItem disabled>{t('common.noData')}</MenuItem>
                            )}
                        </TextField>
                        {selectedTargetHasLicense && (
                            <Alert severity="warning" sx={{ py: 0.5 }}>
                                Thiết bị này đang có license. License hiện tại sẽ bị thay thế nếu yêu cầu được duyệt.
                            </Alert>
                        )}
                        <TextField
                            fullWidth multiline rows={2} size="small"
                            label={t('license.requestNote')}
                            value={transferNote}
                            onChange={e => setTransferNote(e.target.value)}
                            placeholder={t('license.requestNotePlaceholder')}
                        />
                        {transferReqMut.isError && (
                            <Alert severity="error" sx={{ py: 0.5 }}>
                                {(transferReqMut.error as any)?.response?.data?.error ?? t('common.failedAction')}
                            </Alert>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setTransferReqDev(null)}>{t('common.cancel')}</Button>
                    <Button size="small" disabled={!toDeviceId || transferReqMut.isPending}
                        onClick={() => transferReqMut.mutate()}>
                        {t('license.submitRequest')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Device License History Dialog */}
            <Dialog open={!!historyDev} onClose={() => setHistoryDev(null)} maxWidth="md" fullWidth>
                <DialogTitle>
                    <Stack direction="row" alignItems="center" gap={1}>
                        <History fontSize="small" color="primary" />
                        {t('license.history')} — {historyDev?.deviceName}
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
                            <Typography variant="subtitle2" fontWeight={600} mb={0.5}>{t('license.active')}</Typography>
                            <Stack direction="row" gap={2} flexWrap="wrap">
                                <Typography variant="body2">{t('license.package')}: <strong>{historyDev.packageType ? t(PKG_LABEL_KEYS[historyDev.packageType as PackageType]) : '—'}</strong></Typography>
                                <Typography variant="body2">{t('license.activatedAt')}: <strong>{fmtDate(historyDev.activatedAt)}</strong></Typography>
                                <Typography variant="body2">{t('license.expiresAt')}: <strong>{fmtDate(historyDev.expiresAt)}</strong></Typography>
                                {historyDev.daysRemaining != null && historyDev.isLicensed && (
                                    <Chip label={t('license.daysRemaining', { days: historyDev.daysRemaining })} size="small"
                                        color={historyDev.daysRemaining <= 7 ? 'error' : historyDev.daysRemaining <= 30 ? 'warning' : 'success'} />
                                )}
                                {!historyDev.isLicensed && <Chip label={t('license.expired')} size="small" color="error" />}
                            </Stack>
                            {historyDev.activatedByName && (
                                <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
                                    {t('license.activatedBy')}: {historyDev.activatedByName}
                                    {historyDev.transferredFromDeviceName && ` (${t('license.transferredFrom', { device: historyDev.transferredFromDeviceName })})`}
                                </Typography>
                            )}
                        </Box>
                    ) : (
                        <Box sx={{ mx: 2, mt: 2, mb: 1, p: 1.5, borderRadius: 1, bgcolor: 'action.hover' }}>
                            <Typography variant="body2" color="text.secondary">{t('license.noDeviceLicense')}</Typography>
                        </Box>
                    )}
                    <Box sx={{ px: 2, pb: 2 }}>
                        <Typography variant="overline" color="text.secondary" display="block" sx={{ mt: 1.5, mb: 1 }}>
                            {t('license.changeHistory')}
                        </Typography>
                        {histLoading ? <CircularProgress size={24} sx={{ m: 2 }} /> : (
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('common.timestamp')}</TableCell>
                                        <TableCell>{t('common.actionCol')}</TableCell>
                                        <TableCell>{t('common.detail')}</TableCell>
                                        <TableCell>{t('common.performer')}</TableCell>
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
                                            <TableCell><Typography variant="caption">{h.performedByName ?? t('common.system')}</Typography></TableCell>
                                        </TableRow>
                                    ))}
                                    {devHistory.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ py: 3, color: 'text.disabled' }}>
                                                {t('license.noDeviceHistory')}
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setHistoryDev(null)}>{t('common.close')}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

const STORAGE_PACKAGES = [50, 100, 200] as const;
type StoragePackageMb = typeof STORAGE_PACKAGES[number];

const BACKUP_PLAN_OPTIONS = [3, 7, 10] as const;

function backupPlanChangeType(current: number | null, requested: number): 'register' | 'upgrade' | 'downgrade' {
    if (current === null) return 'register';
    return requested > current ? 'upgrade' : 'downgrade';
}

function BackupPlanStatusChip({ status }: { status: BackupPlanRequest['status'] }) {
    const { t } = useTranslation();
    if (status === 'APPROVED') return <Chip label={t('common.approved')} size="small" color="success" />;
    if (status === 'REJECTED') return <Chip label={t('common.rejected')} size="small" color="error" />;
    return <Chip label={t('common.pending')} size="small" color="warning" icon={<HourglassEmpty fontSize="inherit" />} />;
}

function BackupPlanRequestSection() {
    const qc = useQueryClient();

    const { data: planData, isLoading } = useQuery({
        queryKey: ['backup-plan-own'],
        queryFn: backupApi.getPlan,
        // No staleTime — refetch on mount so plan status updates immediately after admin approval
        refetchOnWindowFocus: true,
    });

    const [open, setOpen]   = useState(false);
    const [selPlan, setSelPlan] = useState<number>(7);
    const [note, setNote]   = useState('');
    const [page, setPage]   = useState(0);
    const PER_PAGE = 5;

    const createMut = useMutation({
        mutationFn: () => backupApi.requestPlan(selPlan, note || undefined),
        onSuccess: () => {
            setOpen(false);
            setNote('');
            qc.invalidateQueries({ queryKey: ['backup-plan-own'] });
        },
    });

    const currentPlan  = planData?.backupPlan ?? null;
    const requests     = planData?.requests ?? [];
    const hasPending   = requests.some(r => r.status === 'PENDING');
    const paged        = requests.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

    const changeType   = backupPlanChangeType(currentPlan, selPlan);

    return (
        <>
            <Divider sx={{ my: 4 }} />

            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <BackupOutlined fontSize="small" color="primary" />
                    <Typography variant="subtitle1" fontWeight={700}>{t('license.autoPlanTitle')}</Typography>
                    {currentPlan ? (
                        <Chip label={`Gói ${currentPlan} ngày`} size="small" color="success" sx={{ fontWeight: 700 }} />
                    ) : (
                        <Chip label={t('license.noPlan')} size="small" variant="outlined" />
                    )}
                </Stack>
                <Button
                    size="small"
                    startIcon={<Add />}
                    disabled={hasPending}
                    onClick={() => { setSelPlan(currentPlan ?? 7); setNote(''); setOpen(true); }}
                >
                    {currentPlan ? t('license.changePlan') : t('license.registerPlan')}
                </Button>
            </Stack>

            {hasPending && (
                <Alert severity="info" sx={{ mb: 2, borderRadius: 1.5, py: 0.5 }}>
                    {t('license.pendingApprovalAlert')}
                </Alert>
            )}

            {isLoading ? <CircularProgress size={24} sx={{ m: 2 }} /> : (
                <>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('license.requestedPlan')}</TableCell>
                                <TableCell>{t('common.note')}</TableCell>
                                <TableCell>{t('common.status')}</TableCell>
                                <TableCell>{t('license.adminNote')}</TableCell>
                                <TableCell>{t('license.submittedAt')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paged.map((r: BackupPlanRequest) => (
                                <TableRow key={r.id} hover>
                                    <TableCell>
                                        <Chip
                                            label={`${r.requestedPlan} ngày`}
                                            size="small"
                                            color="primary"
                                            variant="outlined"
                                            sx={{ fontWeight: 700 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption">{r.note ?? '—'}</Typography>
                                    </TableCell>
                                    <TableCell><BackupPlanStatusChip status={r.status} /></TableCell>
                                    <TableCell>
                                        <Typography variant="caption" color="text.secondary">{r.adminNote ?? '—'}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">{fmtDate(r.createdAt)}</Typography>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {requests.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.disabled' }}>
                                        Chưa có yêu cầu nào
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    {requests.length > PER_PAGE && (
                        <TablePagination
                            component="div"
                            count={requests.length}
                            page={page}
                            onPageChange={(_, p) => setPage(p)}
                            rowsPerPage={PER_PAGE}
                            onRowsPerPageChange={() => {}}
                            rowsPerPageOptions={[PER_PAGE]}
                            labelRowsPerPage=""
                            labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
                        />
                    )}
                </>
            )}

            {/* Dialog request */}
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>
                    <Stack direction="row" alignItems="center" gap={1}>
                        <BackupOutlined fontSize="small" />
                        {currentPlan ? t('license.changePlanTitle') : t('license.registerPlanTitle')}
                    </Stack>
                </DialogTitle>
                <DialogContent dividers>
                    <Stack gap={2} pt={0.5}>
                        {currentPlan && (
                            <Alert severity="info" sx={{ borderRadius: 1.5, py: 0.5 }}>
                                Gói hiện tại: <strong>{currentPlan} ngày</strong>. Mỗi tổ chức chỉ có thể dùng một gói tại một thời điểm.
                            </Alert>
                        )}
                        <Typography variant="body2" color="text.secondary">
                            Chọn gói backup. Hệ thống tự động tạo snapshot mỗi ngày lúc 02:30 UTC và lưu theo số ngày của gói.
                        </Typography>
                        <Stack direction="row" gap={1}>
                            {BACKUP_PLAN_OPTIONS.map(days => {
                                const type = backupPlanChangeType(currentPlan, days);
                                const isSelected = selPlan === days;
                                const isCurrent  = currentPlan === days;
                                return (
                                    <Button
                                        key={days}
                                        variant={isSelected ? 'contained' : 'outlined'}
                                        size="small"
                                        disabled={isCurrent}
                                        onClick={() => setSelPlan(days)}
                                        sx={{ flex: 1, fontWeight: 700 }}
                                        startIcon={
                                            isCurrent ? undefined :
                                            type === 'upgrade' ? <ArrowUpward sx={{ fontSize: 14 }} /> :
                                            type === 'downgrade' ? <ArrowDownward sx={{ fontSize: 14 }} /> : undefined
                                        }
                                    >
                                        {days} ngày{isCurrent ? ' (hiện tại)' : ''}
                                    </Button>
                                );
                            })}
                        </Stack>
                        {currentPlan !== null && selPlan !== currentPlan && (
                            <Alert
                                severity={changeType === 'upgrade' ? 'success' : 'warning'}
                                sx={{ borderRadius: 1.5, py: 0.5 }}
                                icon={changeType === 'upgrade' ? <ArrowUpward fontSize="small" /> : <ArrowDownward fontSize="small" />}
                            >
                                {changeType === 'upgrade'
                                    ? t('license.upgradePlan', { from: currentPlan, to: selPlan })
                                    : t('license.downgradePlan', { from: currentPlan, to: selPlan })}
                            </Alert>
                        )}
                        <TextField fullWidth label={t('license.noteOptional')} size="small" multiline rows={2}
                            value={note} onChange={e => setNote(e.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                    <Button size="small"
                        disabled={selPlan === currentPlan || createMut.isPending}
                        onClick={() => createMut.mutate()}>
                        {t('license.submitRequest')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

function fmtMb(mb: number) {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

// ─── Transfer Requests Section ────────────────────────────────────────────────

function TransferRequestsSection() {
    const { t } = useTranslation();
    const { data: reqs = [], isLoading } = useQuery({
        queryKey: ['license-transfer-requests'],
        queryFn: licenseApi.getTransferRequests,
        staleTime: 30_000,
    });
    const [page, setPage] = useState(0);
    const PER_PAGE = 5;
    const paged = reqs.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

    return (
        <>
            <Stack direction="row" alignItems="center" gap={1} mb={2}>
                <SwapHoriz fontSize="small" color="primary" />
                <Typography variant="subtitle1" fontWeight={700}>{t('license.transferRequestTitle')}</Typography>
            </Stack>
            <Alert severity="info" sx={{ mb: 2, py: 0.5, borderRadius: 1.5 }}>
                {t('license.transferRequestInfo')}
            </Alert>
            {isLoading ? <CircularProgress size={24} sx={{ m: 2 }} /> : (
                <>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('license.fromDevice')}</TableCell>
                            <TableCell>{t('license.toDevice')}</TableCell>
                            <TableCell>{t('common.note')}</TableCell>
                            <TableCell>{t('common.status')}</TableCell>
                            <TableCell>{t('license.adminNote')}</TableCell>
                            <TableCell>{t('common.createdAt')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {paged.map((row: TransferRequestRow) => (
                            <TableRow key={row.id} hover>
                                <TableCell><Typography variant="body2">{row.fromDeviceName}</Typography></TableCell>
                                <TableCell><Typography variant="body2">{row.toDeviceName}</Typography></TableCell>
                                <TableCell><Typography variant="caption">{row.note ?? '—'}</Typography></TableCell>
                                <TableCell><RequestStatusChip status={row.status} /></TableCell>
                                <TableCell><Typography variant="caption" color="text.secondary">{row.adminNote ?? '—'}</Typography></TableCell>
                                <TableCell><Typography variant="body2">{fmtDate(row.createdAt)}</Typography></TableCell>
                            </TableRow>
                        ))}
                        {reqs.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 3, color: 'text.disabled' }}>
                                    {t('license.noRequests')}
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
                <TablePagination
                    component="div"
                    count={reqs.length}
                    page={page}
                    onPageChange={(_, p) => setPage(p)}
                    rowsPerPage={PER_PAGE}
                    onRowsPerPageChange={() => {}}
                    rowsPerPageOptions={[PER_PAGE]}
                    labelRowsPerPage=""
                    labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                />
                </>
            )}
        </>
    );
}

// ─── Requests Tab ─────────────────────────────────────────────────────────────

function RequestsTab() {
    const qc = useQueryClient();
    const { t } = useTranslation();

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
                    <Typography variant="subtitle1" fontWeight={700}>{t('license.requestLicenseTitle')}</Typography>
                </Stack>
                <Button size="small" startIcon={<Add />}
                    onClick={() => { setSelPkg('12M'); setLicQty('1'); setLicNote(''); setLicOpen(true); }}>
                    {t('license.createRequest')}
                </Button>
            </Stack>

            {licLoading ? <CircularProgress size={24} sx={{ m: 2 }} /> : (
                <>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>{t('license.package')}</TableCell>
                            <TableCell>{t('license.quantity')}</TableCell>
                            <TableCell>{t('common.note')}</TableCell>
                            <TableCell>{t('common.status')}</TableCell>
                            <TableCell>{t('license.adminNote')}</TableCell>
                            <TableCell>{t('common.createdAt')}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pagedLicReqs.map((row: PurchaseRequestRow) => (
                            <TableRow key={row.id} hover>
                                <TableCell><Typography variant="body2">{t(PKG_LABEL_KEYS[row.packageType as PackageType] ?? row.packageType)}</Typography></TableCell>
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
                                    {t('license.noRequests')}
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
                    labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                />
                </>
            )}

            <Divider sx={{ my: 4 }} />

            {/* ── Transfer requests ── */}
            <TransferRequestsSection />

            <Divider sx={{ my: 4 }} />

            {/* ── Storage purchase requests ── */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Storage fontSize="small" color="primary" />
                    <Typography variant="subtitle1" fontWeight={700}>{t('license.requestStorageTitle')}</Typography>
                </Stack>
                <Button size="small" startIcon={<Add />}
                    onClick={() => { setStorPkg(50); setStorQty('1'); setStorNote(''); setStorOpen(true); }}>
                    {t('license.createRequest')}
                </Button>
            </Stack>

            {/* Current usage summary */}
            {storUsage && (
                <Box sx={{ mb: 2, p: 1.5, borderRadius: 1.5, border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Typography variant="caption" color="text.secondary">{t('license.currentStorage')}</Typography>
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
                            <TableCell>{t('license.package')}</TableCell>
                            <TableCell>{t('license.quantity')}</TableCell>
                            <TableCell>{t('common.total')}</TableCell>
                            <TableCell>{t('common.note')}</TableCell>
                            <TableCell>{t('common.status')}</TableCell>
                            <TableCell>{t('license.adminNote')}</TableCell>
                            <TableCell>{t('common.createdAt')}</TableCell>
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
                                    {t('license.noRequests')}
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
                    labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                />
                </>
            )}

            {/* ── Dialog: tạo yêu cầu license ── */}
            <Dialog open={licOpen} onClose={() => setLicOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>{t('license.requestLicense')}</DialogTitle>
                <DialogContent dividers>
                    <Stack gap={2} pt={0.5}>
                        <TextField select fullWidth label={t('license.packageType')} value={selPkg}
                            onChange={e => setSelPkg(e.target.value as PackageType)} size="small">
                            {PKG_TYPES.map(pkg => <MenuItem key={pkg} value={pkg}>{t(PKG_LABEL_KEYS[pkg])}</MenuItem>)}
                        </TextField>
                        <TextField fullWidth label={t('license.quantity')} type="number" size="small"
                            value={licQty} onChange={e => setLicQty(e.target.value)}
                            inputProps={{ min: 1, max: 100 }} />
                        <TextField fullWidth label={t('common.note')} size="small" multiline rows={2}
                            value={licNote} onChange={e => setLicNote(e.target.value)} />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setLicOpen(false)}>{t('common.cancel')}</Button>
                    <Button size="small" disabled={!licQty || licCreateMut.isPending}
                        onClick={() => licCreateMut.mutate()}>{t('common.send')}</Button>
                </DialogActions>
            </Dialog>

            {/* ── Backup Plan section ── */}
            <BackupPlanRequestSection />

            {/* ── Dialog: tạo yêu cầu storage ── */}
            <Dialog open={storOpen} onClose={() => setStorOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle>
                    <Stack direction="row" alignItems="center" gap={1}>
                        <Storage fontSize="small" />
                        {t('license.requestStorage')}
                    </Stack>
                </DialogTitle>
                <DialogContent dividers>
                    <Stack gap={2} pt={0.5}>
                        <TextField select fullWidth label={t('license.storagePackage')} value={storPkg}
                            onChange={e => setStorPkg(Number(e.target.value) as StoragePackageMb)} size="small">
                            {STORAGE_PACKAGES.map(mb => (
                                <MenuItem key={mb} value={mb}>+{mb} MB</MenuItem>
                            ))}
                        </TextField>
                        <TextField fullWidth label={t('license.quantity')} type="number" size="small"
                            value={storQty} onChange={e => setStorQty(e.target.value)}
                            inputProps={{ min: 1, max: 100 }}
                            helperText={t('license.storageTotal', { size: fmtMb(storPreviewMb) })} />
                        <TextField fullWidth label={t('common.note')} size="small" multiline rows={2}
                            value={storNote} onChange={e => setStorNote(e.target.value)} />
                        {storUsage && (
                            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover', border: '1px solid', borderColor: 'divider' }}>
                                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                                    {t('license.afterApproval')}
                                </Typography>
                                <Typography variant="body2" fontWeight={600}>
                                    {fmtMb(currentUsedMb)} / <span style={{ color: '#16A34A' }}>{fmtMb(afterMb)}</span>
                                    {' '}({t('license.usedPct', { pct: Math.round((currentUsedMb / afterMb) * 100) })})
                                </Typography>
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setStorOpen(false)}>{t('common.cancel')}</Button>
                    <Button size="small" disabled={!storQty || storCreateMut.isPending}
                        onClick={() => storCreateMut.mutate()}>{t('common.send')}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
    const { t } = useTranslation();
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
                            <TableCell>{t('common.timestamp')}</TableCell>
                            <TableCell>{t('common.actionCol')}</TableCell>
                            <TableCell>{t('devices.title')}</TableCell>
                            <TableCell>{t('common.detail')}</TableCell>
                            <TableCell>{t('common.performer')}</TableCell>
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
                                    {t('license.noHistory')}
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
                    labelRowsPerPage={t("common.perPage")}
                    labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                />
                </>
            )}
        </Box>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LicensePage() {
    const [tab, setTab] = useState(0);
    const { t } = useTranslation();

    return (
        <Box sx={{ p: 3 }}>
            {/* Header — consistent with other pages */}
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>{t('license.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('license.subtitle')}
                    </Typography>
                </Box>
            </Stack>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab icon={<Inventory2 fontSize="small" />} iconPosition="start" label={t('license.overview')} />
                <Tab icon={<DevicesOther fontSize="small" />} iconPosition="start" label={t('license.devices')} />
                <Tab icon={<Add fontSize="small" />} iconPosition="start" label={t('license.requests')} />
                <Tab icon={<History fontSize="small" />} iconPosition="start" label={t('license.history')} />
            </Tabs>

            {tab === 0 && <OverviewTab />}
            {tab === 1 && <DevicesTab />}
            {tab === 2 && <RequestsTab />}
            {tab === 3 && <HistoryTab />}
        </Box>
    );
}
