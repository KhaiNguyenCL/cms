import { useState } from 'react';
import {
    Box, Typography, Tabs, Tab, Stack, Chip, Card, CardContent,
    Table, TableBody, TableCell, TableHead, TableRow,
    CircularProgress, Button, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions,
    TextField, MenuItem, Tooltip, Alert, alpha,
} from '@mui/material';
import {
    AdminPanelSettings, Inventory2, CheckCircle,
    Cancel, HourglassEmpty, Edit, InfoOutlined,
    DevicesOther, History, DeleteOutline, EditCalendar,
    SwapHoriz, WorkspacePremium, Storage, BackupOutlined,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import licenseApi from '@api/license.api';
import type { OrgPoolRow, PurchaseRequestRow, TransferRequestRow, PackageType, DeviceLicenseRow, PoolBatch, LicenseHistoryRow } from '@api/license.api';
import { storageQuotaApi } from '@api/storage-quota.api';
import type { StoragePurchaseRequest } from '@api/storage-quota.api';
import { backupApi } from '@api/backup.api';
import type { BackupPlanRequest } from '@/types';
import { useTranslation } from 'react-i18next';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PKG_LABEL_KEYS: Record<PackageType, string> = {
    '12M': 'license.pkg12m', '24M': 'license.pkg24m', '36M': 'license.pkg36m',
};

function fmtDate(s: string | null) {
    if (!s) return '—';
    return new Date(s).toLocaleDateString('vi-VN');
}
function fmtDateTime(s: string | null) {
    if (!s) return '—';
    return new Date(s).toLocaleString('vi-VN');
}

function RequestStatusChip({ status }: { status: string }) {
    const { t } = useTranslation();
    if (status === 'APPROVED') return <Chip label={t('license.statusApproved')} size="small" color="success" />;
    if (status === 'REJECTED') return <Chip label={t('license.statusRejected')} size="small" color="error" />;
    return <Chip label={t('license.statusPending')} size="small" color="warning" icon={<HourglassEmpty fontSize="inherit" />} />;
}

// ─── Edit Pool Dialog ─────────────────────────────────────────────────────────

function EditPoolDialog({ org, onClose }: { org: OrgPoolRow; onClose: () => void }) {
    const qc = useQueryClient();
    const { t } = useTranslation();
    const [d12, setD12] = useState('0');
    const [d24, setD24] = useState('0');
    const [d36, setD36] = useState('0');

    const mut = useMutation({
        mutationFn: () => licenseApi.updateOrgPool(org.id, {
            pkg12m: parseInt(d12) || 0,
            pkg24m: parseInt(d24) || 0,
            pkg36m: parseInt(d36) || 0,
        }),
        onSuccess: () => {
            onClose();
            qc.invalidateQueries({ queryKey: ['admin-org-pools'] });
            qc.invalidateQueries({ queryKey: ['org-detail', org.id] });
        },
    });

    const clampWarning = (cur: number, val: string) => {
        const delta = parseInt(val) || 0;
        if (delta < 0 && cur + delta < 0) return t('license.editPoolWarning', { max: cur });
        return '';
    };

    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>{t('license.editPoolTitle', { org: org.name })}</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" color="text.secondary" mb={2}>
                    {t('license.editPoolHint')}
                </Typography>
                <Stack gap={2} pt={0.5}>
                    {(['12M', '24M', '36M'] as PackageType[]).map((pkg, i) => {
                        const cur  = [org.pkg12m, org.pkg24m, org.pkg36m][i];
                        const vals = [d12, d24, d36];
                        const sets = [setD12, setD24, setD36];
                        const warn = clampWarning(cur, vals[i]);
                        return (
                            <Box key={pkg}>
                                <TextField size="small" fullWidth type="number"
                                    label={t('license.editPoolPkg', { pkg: t(PKG_LABEL_KEYS[pkg]), cur })}
                                    value={vals[i]} onChange={e => sets[i](e.target.value)}
                                    error={!!warn} />
                                {warn && (
                                    <Typography variant="caption" color="warning.main" sx={{ mt: 0.5, display: 'block' }}>
                                        ⚠ {warn}
                                    </Typography>
                                )}
                            </Box>
                        );
                    })}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('common.cancel')}</Button>
                <Button disabled={mut.isPending} onClick={() => mut.mutate()}>{t('common.save')}</Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Action chip for history ──────────────────────────────────────────────────

function ActionChip({ action, detail }: { action: string; detail?: Record<string, unknown> | null }) {
    const { t } = useTranslation();
    const isAutoExpired = action === 'REVOKE' && detail?.auto === true;
    const map: Record<string, { labelKey: string; color: 'success' | 'error' | 'warning' | 'info' | 'default' }> = {
        ASSIGN:        { labelKey: 'license.actionAssign',       color: 'success' },
        TRANSFER:      { labelKey: 'license.actionTransfer',     color: 'info' },
        ADJUST_EXPIRY: { labelKey: 'license.actionAdjustExpiry', color: 'warning' },
        REVOKE:        { labelKey: isAutoExpired ? 'license.expired' : 'license.actionRevoke', color: isAutoExpired ? 'default' : 'error' },
    };
    const cfg = map[action] ?? { labelKey: action, color: 'default' as const };
    return <Chip label={t(cfg.labelKey)} size="small" color={cfg.color} />;
}

// ─── Org Detail Dialog ────────────────────────────────────────────────────────

function OrgDetailDialog({ org, onClose }: { org: OrgPoolRow; onClose: () => void }) {
    const qc = useQueryClient();
    const { t } = useTranslation();
    const [tab, setTab] = useState(0);

    // action dialogs
    const [revokeDevice,  setRevokeDevice]  = useState<DeviceLicenseRow | null>(null);
    const [adjustDevice,  setAdjustDevice]  = useState<DeviceLicenseRow | null>(null);
    const [transferDevice, setTransferDevice] = useState<DeviceLicenseRow | null>(null);
    const [newExpiry,  setNewExpiry]  = useState('');
    const [toDeviceId, setToDeviceId] = useState('');
    const [mutError,   setMutError]   = useState('');

    const { data, isLoading } = useQuery({
        queryKey: ['org-detail', org.id],
        queryFn: () => licenseApi.getOrgDetail(org.id),
        staleTime: 30_000,
    });

    const invalidate = () => {
        qc.invalidateQueries({ queryKey: ['org-detail', org.id] });
        qc.invalidateQueries({ queryKey: ['admin-org-pools'] });
    };

    const revokeMut = useMutation({
        mutationFn: () => licenseApi.adminRevokeLicense(org.id, revokeDevice!.deviceId),
        onSuccess: () => { setRevokeDevice(null); invalidate(); },
    });
    const adjustMut = useMutation({
        mutationFn: () => licenseApi.adminAdjustExpiry(org.id, adjustDevice!.deviceId, new Date(newExpiry).toISOString()),
        onSuccess: () => { setAdjustDevice(null); invalidate(); },
    });
    const transferMut = useMutation({
        mutationFn: () => licenseApi.adminTransferLicense(org.id, transferDevice!.deviceId, toDeviceId),
        onSuccess:  () => { setTransferDevice(null); setMutError(''); invalidate(); },
        onError:    (e: unknown) => setMutError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? t('license.errorRetry')),
    });

    const devices        = data?.devices        ?? [];
    const poolBatches    = data?.poolBatches    ?? [];
    const licenseHistory = data?.licenseHistory ?? [];

    // per-type stats — use live pool from query (not stale org prop)
    const livePool = data?.pool;
    const stats = (['12M', '24M', '36M'] as PackageType[]).map(pkg => {
        const poolKey = ({ '12M': 'pkg12m', '24M': 'pkg24m', '36M': 'pkg36m' } as const)[pkg];
        const assigned = devices.filter(d => d.packageType === pkg && d.expiresAt).length;
        const expired  = devices.filter(d => d.packageType === pkg && !d.isLicensed && d.expiresAt).length;
        const inPool   = livePool ? (livePool[poolKey] as number) : (org[poolKey] as number);
        return { type: pkg, inPool, assigned, expired, active: assigned - expired };
    });

    const licensedDevices = devices.filter(d => d.expiresAt);
    const activeCount     = licensedDevices.filter(d => d.isLicensed).length;

    // devices eligible as transfer target (all except source)
    const transferTargets = devices.filter(d => d.deviceId !== transferDevice?.deviceId);

    const rowBg = (d: DeviceLicenseRow) =>
        !d.isLicensed && d.expiresAt  ? alpha('#F44336', 0.06)
        : d.isLicensed && (d.daysRemaining ?? 999) <= 7  ? alpha('#FF9800', 0.10)
        : d.isLicensed && (d.daysRemaining ?? 999) <= 30 ? alpha('#FFC107', 0.06)
        : undefined;

    return (
        <>
        <Dialog open onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { minHeight: '75vh' } }}>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <InfoOutlined color="primary" />
                    {t('license.licenseDetailTitle', { org: org.name })}
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)}
                    sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Tab icon={<WorkspacePremium fontSize="small" />} iconPosition="start"
                        label={t('license.tabLicensesLabel', {
                            active: activeCount,
                            expiredSuffix: licensedDevices.length > activeCount
                                ? t('license.tabExpiredSuffix', { n: licensedDevices.length - activeCount })
                                : '',
                        })} />
                    <Tab icon={<DevicesOther fontSize="small" />} iconPosition="start"
                        label={t('license.tabDevicesCount', { count: devices.length })} />
                    <Tab icon={<History fontSize="small" />} iconPosition="start"
                        label={t('license.tabAssignHistory', { count: licenseHistory.length })} />
                    <Tab icon={<Inventory2 fontSize="small" />} iconPosition="start"
                        label={t('license.tabPoolHistory', { count: poolBatches.length })} />
                </Tabs>

                {isLoading ? (
                    <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress /></Box>
                ) : tab === 0 ? (
                    /* ══ Tab 0: Gói license ══════════════════════════════════ */
                    <Box sx={{ px: 2, pb: 2 }}>
                        {/* Summary cards */}
                        <Stack direction="row" gap={2} my={2} flexWrap="wrap">
                            {stats.map(s => (
                                <Card key={s.type} variant="outlined" sx={{ minWidth: 160, flex: 1 }}>
                                    <CardContent sx={{ pb: '12px !important' }}>
                                        <Typography variant="subtitle2" color="text.secondary" mb={1}>
                                            {t(PKG_LABEL_KEYS[s.type])}
                                        </Typography>
                                        <Stack direction="row" gap={1} flexWrap="wrap">
                                            <Chip label={t('license.poolCount', { n: s.inPool })} size="small"
                                                color={s.inPool > 0 ? 'success' : 'default'} />
                                            <Chip label={t('license.assignedCount', { n: s.assigned })} size="small" color="primary" />
                                            {s.expired > 0 && (
                                                <Chip label={t('license.expiredCount', { n: s.expired })} size="small" color="error" />
                                            )}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            ))}
                        </Stack>

                        {/* Assigned licenses detail */}
                        <Typography variant="subtitle2" color="text.secondary" mb={1}>
                            {t('license.assignedDetails')}
                        </Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('devices.title')}</TableCell>
                                    <TableCell>{t('license.package')}</TableCell>
                                    <TableCell>{t('license.activatedAt')}</TableCell>
                                    <TableCell>{t('license.activatedBy')}</TableCell>
                                    <TableCell>{t('license.expiresAt')}</TableCell>
                                    <TableCell align="center">{t('license.remaining')}</TableCell>
                                    <TableCell>{t('common.status')}</TableCell>
                                    <TableCell align="right">{t('common.actions')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {licensedDevices.map(d => (
                                    <TableRow key={d.deviceId} hover sx={{ bgcolor: rowBg(d) }}>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>{d.deviceName}</Typography>
                                            {d.transferredFromDeviceName && (
                                                <Typography variant="caption" color="text.secondary">
                                                    ← {d.transferredFromDeviceName}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {d.packageType ? t(PKG_LABEL_KEYS[d.packageType as PackageType] ?? d.packageType) : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption">{fmtDate(d.activatedAt)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption">{d.activatedByName ?? '—'}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{
                                                color: !d.isLicensed ? 'error.main'
                                                    : (d.daysRemaining ?? 999) <= 7  ? 'error.main'
                                                    : (d.daysRemaining ?? 999) <= 30 ? 'warning.main'
                                                    : 'success.main',
                                            }}>
                                                {fmtDate(d.expiresAt)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            {d.daysRemaining != null && d.isLicensed
                                                ? <Chip label={t('license.daysLeft', { days: d.daysRemaining })} size="small"
                                                    color={d.daysRemaining <= 7 ? 'error' : d.daysRemaining <= 30 ? 'warning' : 'success'} />
                                                : <Typography variant="caption" color="text.disabled">—</Typography>
                                            }
                                        </TableCell>
                                        <TableCell>
                                            {d.isLicensed
                                                ? <Chip label={t('license.active')} size="small" color="success" />
                                                : <Chip label={t('license.expired')} size="small" color="error" />
                                            }
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                                <Tooltip title={t('license.editExpiry')}>
                                                    <IconButton size="small"
                                                        onClick={() => { setAdjustDevice(d); setNewExpiry(d.expiresAt!.slice(0, 10)); }}>
                                                        <EditCalendar fontSize="inherit" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title={t('license.revokeLicenseTitle')}>
                                                    <IconButton size="small" color="error"
                                                        onClick={() => setRevokeDevice(d)}>
                                                        <DeleteOutline fontSize="inherit" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {licensedDevices.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                            {t('license.noAssigned')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Box>

                ) : tab === 1 ? (
                    /* ══ Tab 1: Tất cả thiết bị ══════════════════════════════ */
                    <Box sx={{ px: 2, pb: 2 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('devices.title')}</TableCell>
                                    <TableCell>{t('license.package')}</TableCell>
                                    <TableCell>{t('license.activatedAt')}</TableCell>
                                    <TableCell>{t('license.expiresAt')}</TableCell>
                                    <TableCell align="center">{t('license.remaining')}</TableCell>
                                    <TableCell>{t('common.status')}</TableCell>
                                    <TableCell align="right">{t('common.actions')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {devices.map(d => (
                                    <TableRow key={d.deviceId} hover sx={{ bgcolor: rowBg(d) }}>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>{d.deviceName}</Typography>
                                            <Typography variant="caption" color="text.secondary">{d.deviceStatus}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            {d.packageType ? t(PKG_LABEL_KEYS[d.packageType as PackageType] ?? d.packageType) : '—'}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption">{fmtDate(d.activatedAt)}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{
                                                color: !d.expiresAt ? 'text.disabled'
                                                    : !d.isLicensed ? 'error.main'
                                                    : (d.daysRemaining ?? 999) <= 7  ? 'error.main'
                                                    : (d.daysRemaining ?? 999) <= 30 ? 'warning.main'
                                                    : 'success.main',
                                            }}>
                                                {fmtDate(d.expiresAt)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="center">
                                            {d.daysRemaining != null && d.isLicensed
                                                ? <Chip label={t('license.daysLeft', { days: d.daysRemaining })} size="small"
                                                    color={d.daysRemaining <= 7 ? 'error' : d.daysRemaining <= 30 ? 'warning' : 'success'} />
                                                : <Typography variant="caption" color="text.disabled">—</Typography>
                                            }
                                        </TableCell>
                                        <TableCell>
                                            {!d.expiresAt
                                                ? <Chip label={t('license.noLicense')} size="small" />
                                                : d.isLicensed
                                                    ? <Chip label={t('license.active')} size="small" color="success" />
                                                    : <Chip label={t('license.expired')} size="small" color="error" />
                                            }
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                                {d.isLicensed && d.expiresAt && (
                                                    <Tooltip title={t('license.transferToOther')}>
                                                        <IconButton size="small" color="info"
                                                            onClick={() => { setTransferDevice(d); setToDeviceId(''); setMutError(''); }}>
                                                            <SwapHoriz fontSize="inherit" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {d.expiresAt && (
                                                    <Tooltip title={t('license.editExpiry')}>
                                                        <IconButton size="small"
                                                            onClick={() => { setAdjustDevice(d); setNewExpiry(d.expiresAt!.slice(0, 10)); }}>
                                                            <EditCalendar fontSize="inherit" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {d.expiresAt && (
                                                    <Tooltip title={t('license.revokeLicenseTitle')}>
                                                        <IconButton size="small" color="error"
                                                            onClick={() => setRevokeDevice(d)}>
                                                            <DeleteOutline fontSize="inherit" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {devices.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                            {t('license.noDevices')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Box>

                ) : tab === 2 ? (
                    /* ══ Tab 2: Lịch sử gán / chuyển / thu hồi ══════════════ */
                    <Box sx={{ px: 2, pb: 2 }}>
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
                                {licenseHistory.map((h: LicenseHistoryRow) => (
                                    <TableRow key={h.id} hover>
                                        <TableCell>
                                            <Typography variant="caption">{fmtDateTime(h.createdAt)}</Typography>
                                        </TableCell>
                                        <TableCell><ActionChip action={h.action} detail={h.detail} /></TableCell>
                                        <TableCell>{h.deviceName ?? '—'}</TableCell>
                                        <TableCell>
                                            <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                                {h.detail
                                                    ? JSON.stringify(h.detail).replace(/[{}"]/g, '').replace(/,/g, ' | ').slice(0, 90)
                                                    : '—'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="caption">{h.performedByName ?? '—'}</Typography>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {licenseHistory.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                            {t('license.noHistory')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Box>

                ) : (
                    /* ══ Tab 3: Lịch sử nạp gói ══════════════════════════════ */
                    <Box sx={{ px: 2, pb: 2 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', my: 1.5 }}>
                            {t('license.poolHistoryHint')}
                        </Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t('common.timestamp')}</TableCell>
                                    <TableCell align="center">{t('license.pkg12m')}</TableCell>
                                    <TableCell align="center">{t('license.pkg24m')}</TableCell>
                                    <TableCell align="center">{t('license.pkg36m')}</TableCell>
                                    <TableCell>Source</TableCell>
                                    <TableCell>{t('common.performer')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {poolBatches.map((b: PoolBatch) => {
                                    const src = b.source === 'PURCHASE_REQUEST' ? t('license.sourceApproved')
                                        : b.source ? b.source : t('license.sourceManual');
                                    return (
                                        <TableRow key={b.id} hover>
                                            <TableCell>
                                                <Typography variant="body2">{fmtDateTime(b.createdAt)}</Typography>
                                            </TableCell>
                                            {(['pkg12m', 'pkg24m', 'pkg36m'] as const).map(k => {
                                                const v = b.delta[k] ?? 0;
                                                return (
                                                    <TableCell key={k} align="center">
                                                        {v !== 0 ? (
                                                            <Chip label={v > 0 ? `+${v}` : `${v}`} size="small"
                                                                color={v > 0 ? 'success' : 'error'}
                                                                sx={{ fontWeight: 700, minWidth: 44 }} />
                                                        ) : (
                                                            <Typography variant="caption" color="text.disabled">—</Typography>
                                                        )}
                                                    </TableCell>
                                                );
                                            })}
                                            <TableCell>
                                                <Typography variant="caption">{src}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption">{b.performedByName ?? '—'}</Typography>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                                {poolBatches.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                            {t('license.noPoolHistory')}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>{t('common.close')}</Button>
            </DialogActions>
        </Dialog>

        {/* ── Transfer Dialog ─────────────────────────────────────────────── */}
        <Dialog open={!!transferDevice} onClose={() => { setTransferDevice(null); setMutError(''); }} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>{t('license.transferLicenseTitle', { device: transferDevice?.deviceName })}</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2" color="text.secondary" mb={2}>
                    {t('license.transferPackageInfo', {
                        pkg: transferDevice?.packageType ? t(PKG_LABEL_KEYS[transferDevice.packageType as PackageType]) : '',
                        date: fmtDate(transferDevice?.expiresAt ?? null),
                    })}
                </Typography>
                <TextField select fullWidth size="small" label={t('license.targetDevice')}
                    value={toDeviceId} onChange={e => { setToDeviceId(e.target.value); setMutError(''); }}>
                    {transferTargets.map(d => {
                        const hasLic = d.isLicensed && d.expiresAt;
                        return (
                            <MenuItem key={d.deviceId} value={d.deviceId}>
                                <Stack direction="row" justifyContent="space-between" width="100%" alignItems="center" gap={1}>
                                    <span>{d.deviceName}</span>
                                    {hasLic
                                        ? <Chip label={t('license.hasLicense')} size="small" color="warning" />
                                        : <Chip label={t('license.emptySlot')} size="small" color="default" />
                                    }
                                </Stack>
                            </MenuItem>
                        );
                    })}
                    {transferTargets.length === 0 && (
                        <MenuItem disabled>{t('license.noOtherDevices')}</MenuItem>
                    )}
                </TextField>
                {mutError && <Alert severity="error" sx={{ mt: 1.5 }}>{mutError}</Alert>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={() => { setTransferDevice(null); setMutError(''); }}>{t('common.cancel')}</Button>
                <Button size="small" color="info" disabled={!toDeviceId || transferMut.isPending}
                    onClick={() => transferMut.mutate()}>
                    {t('license.actionTransfer')}
                </Button>
            </DialogActions>
        </Dialog>

        {/* ── Revoke confirmation ─────────────────────────────────────────── */}
        <Dialog open={!!revokeDevice} onClose={() => setRevokeDevice(null)} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>{t('license.revokeLicenseTitle')}</DialogTitle>
            <DialogContent dividers>
                <Typography variant="body2">
                    {t('license.revokeConfirmMsg', { device: revokeDevice?.deviceName })}
                    {revokeDevice?.isLicensed && ` ${t('license.revokeReturnMsg')}`}
                </Typography>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={() => setRevokeDevice(null)}>{t('common.cancel')}</Button>
                <Button size="small" color="error" disabled={revokeMut.isPending}
                    onClick={() => revokeMut.mutate()}>
                    {t('license.actionRevoke')}
                </Button>
            </DialogActions>
        </Dialog>

        {/* ── Adjust expiry ───────────────────────────────────────────────── */}
        <Dialog open={!!adjustDevice} onClose={() => setAdjustDevice(null)} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>{t('license.editExpiryTitle', { device: adjustDevice?.deviceName })}</DialogTitle>
            <DialogContent dividers>
                <TextField fullWidth size="small" type="date" label={t('license.newExpiryDate')}
                    InputLabelProps={{ shrink: true }}
                    value={newExpiry} onChange={e => setNewExpiry(e.target.value)}
                    sx={{ mt: 0.5 }}
                    inputProps={{ min: new Date().toISOString().slice(0, 10) }} />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={() => setAdjustDevice(null)}>{t('common.cancel')}</Button>
                <Button size="small" disabled={!newExpiry || adjustMut.isPending}
                    onClick={() => adjustMut.mutate()}>
                    {t('common.save')}
                </Button>
            </DialogActions>
        </Dialog>
        </>
    );
}

// ─── Orgs Tab ─────────────────────────────────────────────────────────────────

function OrgsTab() {
    const { t } = useTranslation();
    const { data = [], isLoading } = useQuery({
        queryKey: ['admin-org-pools'],
        queryFn: licenseApi.getAllOrgPools,
    });
    const [editOrg,   setEditOrg]   = useState<OrgPoolRow | null>(null);
    const [detailOrg, setDetailOrg] = useState<OrgPoolRow | null>(null);

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;

    return (
        <Box>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('superAdmin.organizations')}</TableCell>
                        <TableCell align="center">{t('license.pkg12m')}</TableCell>
                        <TableCell align="center">{t('license.pkg24m')}</TableCell>
                        <TableCell align="center">{t('license.pkg36m')}</TableCell>
                        <TableCell align="center">{t('license.pool')}</TableCell>
                        <TableCell align="center">{t('devices.title')}</TableCell>
                        <TableCell align="center">{t('devices.licensed')}</TableCell>
                        <TableCell align="center">{t('license.expired')} ≤7d</TableCell>
                        <TableCell align="right">{t('common.actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map(org => {
                        const total = org.pkg12m + org.pkg24m + org.pkg36m;
                        return (
                            <TableRow key={org.id} hover>
                                <TableCell>
                                    <Typography variant="body2" fontWeight={600}>{org.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{org.slug}</Typography>
                                </TableCell>
                                <TableCell align="center">
                                    <Chip label={org.pkg12m} size="small"
                                        color={org.pkg12m > 0 ? 'success' : 'default'} sx={{ minWidth: 36 }} />
                                </TableCell>
                                <TableCell align="center">
                                    <Chip label={org.pkg24m} size="small"
                                        color={org.pkg24m > 0 ? 'success' : 'default'} sx={{ minWidth: 36 }} />
                                </TableCell>
                                <TableCell align="center">
                                    <Chip label={org.pkg36m} size="small"
                                        color={org.pkg36m > 0 ? 'success' : 'default'} sx={{ minWidth: 36 }} />
                                </TableCell>
                                <TableCell align="center">
                                    <Typography variant="body2" fontWeight={700}
                                        sx={{ color: total > 0 ? 'success.main' : 'text.disabled' }}>
                                        {total}
                                    </Typography>
                                </TableCell>
                                <TableCell align="center">{org.totalDevices}</TableCell>
                                <TableCell align="center">
                                    <Typography variant="body2"
                                        sx={{ color: org.licensedDevices > 0 ? 'success.main' : 'text.disabled' }}>
                                        {org.licensedDevices}
                                    </Typography>
                                </TableCell>
                                <TableCell align="center">
                                    {org.expiringIn7 > 0
                                        ? <Chip label={org.expiringIn7} size="small" color="warning" />
                                        : <Typography variant="caption" color="text.disabled">—</Typography>
                                    }
                                </TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                        <Tooltip title={t('license.viewDetail')}>
                                            <IconButton size="small" onClick={() => setDetailOrg(org)}>
                                                <InfoOutlined fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('license.editPoolBtn')}>
                                            <IconButton size="small" onClick={() => setEditOrg(org)}>
                                                <Edit fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                {t('license.noOrgs')}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            {editOrg   && <EditPoolDialog   org={editOrg}   onClose={() => setEditOrg(null)} />}
            {detailOrg && <OrgDetailDialog  org={detailOrg} onClose={() => setDetailOrg(null)} />}
        </Box>
    );
}

// ─── Requests Tab ─────────────────────────────────────────────────────────────

function RequestsTab() {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const { data = [], isLoading } = useQuery({
        queryKey: ['license-requests'],
        queryFn: licenseApi.getPurchaseRequests,
    });

    const [actionRow, setActionRow]   = useState<PurchaseRequestRow | null>(null);
    const [adminNote, setAdminNote]   = useState('');
    const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
    const [actionError, setActionError] = useState('');

    const actionMut = useMutation({
        mutationFn: () => actionType === 'approve'
            ? licenseApi.approvePurchaseRequest(actionRow!.id, adminNote || undefined)
            : licenseApi.rejectPurchaseRequest(actionRow!.id, adminNote || undefined),
        onSuccess: () => {
            setActionRow(null);
            setActionError('');
            qc.invalidateQueries({ queryKey: ['license-requests'] });
            qc.invalidateQueries({ queryKey: ['admin-org-pools'] });
            qc.invalidateQueries({ queryKey: ['license-requests-pending'] });
        },
        onError: (e: unknown) => {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setActionError(msg ?? t('license.errorRetry'));
        },
    });

    const pending = data.filter(r => r.status === 'PENDING').length;

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;

    return (
        <Box>
            {pending > 0 && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: alpha('#FF9800', 0.1), borderRadius: 1,
                    border: '1px solid', borderColor: 'warning.main' }}>
                    <Typography variant="body2" color="warning.main" fontWeight={600}>
                        {t('license.pendingCount', { count: pending })}
                    </Typography>
                </Box>
            )}

            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('superAdmin.organizations')}</TableCell>
                        <TableCell>{t('common.performer')}</TableCell>
                        <TableCell>{t('license.package')}</TableCell>
                        <TableCell align="center">{t('license.quantity')}</TableCell>
                        <TableCell>{t('common.note')}</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('common.createdAt')}</TableCell>
                        <TableCell align="right">{t('common.actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map(row => (
                        <TableRow key={row.id} hover
                            sx={row.status === 'PENDING' ? { bgcolor: alpha('#FF9800', 0.04) } : {}}>
                            <TableCell>
                                <Typography variant="body2" fontWeight={500}>{row.orgName ?? '—'}</Typography>
                            </TableCell>
                            <TableCell>{row.requestedByName ?? '—'}</TableCell>
                            <TableCell>{t(PKG_LABEL_KEYS[row.packageType as PackageType] ?? row.packageType)}</TableCell>
                            <TableCell align="center">{row.quantity}</TableCell>
                            <TableCell>
                                <Typography variant="caption">{row.note ?? '—'}</Typography>
                                {row.adminNote && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        → {row.adminNote}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell><RequestStatusChip status={row.status} /></TableCell>
                            <TableCell>
                                <Typography variant="caption">{fmtDate(row.createdAt)}</Typography>
                                {row.resolvedAt && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        {t('license.resolvedAt', { date: fmtDate(row.resolvedAt) })}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell align="right">
                                {row.status === 'PENDING' && (
                                    <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                        <Tooltip title={t('license.approveTooltip')}>
                                            <IconButton size="small" color="success"
                                                onClick={() => { setActionRow(row); setAdminNote(''); setActionType('approve'); }}>
                                                <CheckCircle fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('license.rejectTooltip')}>
                                            <IconButton size="small" color="error"
                                                onClick={() => { setActionRow(row); setAdminNote(''); setActionType('reject'); }}>
                                                <Cancel fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={8} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                {t('license.noRequestsAll')}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            {/* Approve/Reject dialog */}
            <Dialog open={!!actionRow} onClose={() => { setActionRow(null); setActionError(''); }} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>
                    {actionType === 'approve' ? t('license.approveRequest') : t('license.rejectRequest')}
                </DialogTitle>
                <DialogContent dividers>
                    {actionRow && (
                        <Typography variant="body2" mb={2}>
                            <strong>{actionRow.orgName}</strong> — {actionRow.quantity}×{' '}
                            {t(PKG_LABEL_KEYS[actionRow.packageType as PackageType] ?? actionRow.packageType)}
                        </Typography>
                    )}
                    <TextField fullWidth size="small" label={t('license.adminNoteOptional')}
                        multiline rows={2}
                        value={adminNote} onChange={e => setAdminNote(e.target.value)} />
                    {actionError && <Alert severity="error" sx={{ mt: 1.5 }}>{actionError}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => { setActionRow(null); setActionError(''); }}>{t('common.cancel')}</Button>
                    <Button size="small"
                        color={actionType === 'approve' ? 'success' : 'error'}
                        disabled={actionMut.isPending}
                        onClick={() => actionMut.mutate()}>
                        {actionType === 'approve' ? t('license.approveBtn') : t('license.rejectBtn')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─── Transfer Requests Admin Tab ─────────────────────────────────────────────

function TransferRequestsAdminTab() {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const { data = [], isLoading } = useQuery({
        queryKey: ['license-transfer-requests'],
        queryFn: licenseApi.getTransferRequests,
    });

    const [actionRow, setActionRow]     = useState<TransferRequestRow | null>(null);
    const [adminNote, setAdminNote]     = useState('');
    const [actionType, setActionType]   = useState<'approve' | 'reject'>('approve');
    const [actionError, setActionError] = useState('');

    const actionMut = useMutation({
        mutationFn: () => actionType === 'approve'
            ? licenseApi.approveTransferRequest(actionRow!.id, adminNote || undefined)
            : licenseApi.rejectTransferRequest(actionRow!.id, adminNote || undefined),
        onSuccess: () => {
            setActionRow(null);
            setActionError('');
            qc.invalidateQueries({ queryKey: ['license-transfer-requests'] });
            qc.invalidateQueries({ queryKey: ['license-transfer-requests-pending'] });
            // Refresh device license state for both org admin and super admin views
            qc.invalidateQueries({ queryKey: ['license-devices'] });
            qc.invalidateQueries({ queryKey: ['license-stats'] });
            qc.invalidateQueries({ queryKey: ['license-history'] });
            qc.invalidateQueries({ queryKey: ['admin-org-pools'] });
        },
        onError: (e: unknown) => {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setActionError(msg ?? t('license.errorRetry'));
        },
    });

    const pending = data.filter(r => r.status === 'PENDING').length;
    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;

    return (
        <Box>
            {pending > 0 && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: alpha('#FF9800', 0.1), borderRadius: 1,
                    border: '1px solid', borderColor: 'warning.main' }}>
                    <Typography variant="body2" color="warning.main" fontWeight={600}>
                        {t('license.pendingCount', { count: pending })}
                    </Typography>
                </Box>
            )}
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('common.org')}</TableCell>
                        <TableCell>{t('license.fromDevice')}</TableCell>
                        <TableCell>{t('license.toDevice')}</TableCell>
                        <TableCell>{t('common.requestedBy')}</TableCell>
                        <TableCell>{t('common.note')}</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('common.createdAt')}</TableCell>
                        <TableCell align="right">{t('common.actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map((row: TransferRequestRow) => (
                        <TableRow key={row.id} hover>
                            <TableCell><Typography variant="body2">{row.orgName ?? '—'}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{row.fromDeviceName}</Typography></TableCell>
                            <TableCell><Typography variant="body2">{row.toDeviceName}</Typography></TableCell>
                            <TableCell><Typography variant="caption">{row.requestedByName ?? '—'}</Typography></TableCell>
                            <TableCell><Typography variant="caption">{row.note ?? '—'}</Typography></TableCell>
                            <TableCell><RequestStatusChip status={row.status} /></TableCell>
                            <TableCell><Typography variant="body2">{fmtDate(row.createdAt)}</Typography></TableCell>
                            <TableCell align="right">
                                {row.status === 'PENDING' && (
                                    <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                        <Tooltip title={t('license.approveTooltip')}>
                                            <IconButton size="small" color="success"
                                                onClick={() => { setActionRow(row); setAdminNote(''); setActionType('approve'); }}>
                                                <CheckCircle fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('license.rejectTooltip')}>
                                            <IconButton size="small" color="error"
                                                onClick={() => { setActionRow(row); setAdminNote(''); setActionType('reject'); }}>
                                                <Cancel fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={8} align="center" sx={{ py: 3, color: 'text.disabled' }}>
                                {t('license.noRequestsAll')}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            <Dialog open={!!actionRow} onClose={() => setActionRow(null)} maxWidth="xs" fullWidth>
                <DialogTitle>
                    {actionType === 'approve' ? t('license.approveRequest') : t('license.rejectRequest')}
                </DialogTitle>
                <DialogContent dividers>
                    <Stack gap={2} pt={0.5}>
                        <Typography variant="body2">
                            {actionRow?.fromDeviceName} → {actionRow?.toDeviceName}
                        </Typography>
                        <TextField fullWidth multiline rows={2} size="small"
                            label={t('license.adminNote')}
                            value={adminNote} onChange={e => setAdminNote(e.target.value)} />
                        {actionError && <Alert severity="error" sx={{ py: 0.5 }}>{actionError}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button size="small" onClick={() => setActionRow(null)}>{t('common.cancel')}</Button>
                    <Button size="small"
                        color={actionType === 'approve' ? 'success' : 'error'}
                        disabled={actionMut.isPending}
                        onClick={() => actionMut.mutate()}>
                        {actionType === 'approve' ? t('license.approveBtn') : t('license.rejectBtn')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─── Storage Requests Tab ─────────────────────────────────────────────────────

function StorageRequestsTab() {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const { data = [], isLoading } = useQuery({
        queryKey: ['storage-requests-all'],
        queryFn: () => storageQuotaApi.listAllRequests(),
    });

    const [actionRow, setActionRow]     = useState<StoragePurchaseRequest | null>(null);
    const [adminNote, setAdminNote]     = useState('');
    const [actionType, setActionType]   = useState<'approve' | 'reject'>('approve');
    const [actionError, setActionError] = useState('');

    const actionMut = useMutation({
        mutationFn: () => actionType === 'approve'
            ? storageQuotaApi.approveRequest(actionRow!.id, adminNote || undefined)
            : storageQuotaApi.rejectRequest(actionRow!.id, adminNote || undefined),
        onSuccess: () => {
            setActionRow(null);
            setActionError('');
            qc.invalidateQueries({ queryKey: ['storage-requests-all'] });
            qc.invalidateQueries({ queryKey: ['storage-pending-count'] });
            qc.invalidateQueries({ queryKey: ['license-requests-pending'] });
        },
        onError: (e: unknown) => {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setActionError(msg ?? t('license.errorRetry'));
        },
    });

    const pending = data.filter(r => r.status === 'PENDING').length;

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;

    const PKG_LABEL: Record<number, string> = { 50: '+50 MB', 100: '+100 MB', 200: '+200 MB' };

    return (
        <Box>
            {pending > 0 && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: alpha('#FF9800', 0.1), borderRadius: 1,
                    border: '1px solid', borderColor: 'warning.main' }}>
                    <Typography variant="body2" color="warning.main" fontWeight={600}>
                        {t('license.pendingStorageCount', { count: pending })}
                    </Typography>
                </Box>
            )}

            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('superAdmin.organizations')}</TableCell>
                        <TableCell>{t('common.performer')}</TableCell>
                        <TableCell>{t('storage.title')}</TableCell>
                        <TableCell align="center">{t('license.quantity')}</TableCell>
                        <TableCell align="center">{t('common.total')}</TableCell>
                        <TableCell>{t('common.note')}</TableCell>
                        <TableCell>{t('common.status')}</TableCell>
                        <TableCell>{t('common.createdAt')}</TableCell>
                        <TableCell align="right">{t('common.actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.map(row => (
                        <TableRow key={row.id} hover
                            sx={row.status === 'PENDING' ? { bgcolor: alpha('#FF9800', 0.04) } : {}}>
                            <TableCell>
                                <Typography variant="body2" fontWeight={500}>{row.orgName ?? '—'}</Typography>
                            </TableCell>
                            <TableCell>{row.requestedByName ?? '—'}</TableCell>
                            <TableCell>{PKG_LABEL[row.packageMb] ?? `+${row.packageMb} MB`}</TableCell>
                            <TableCell align="center">{row.quantity}</TableCell>
                            <TableCell align="center">
                                <Chip label={`+${row.totalMb} MB`} size="small" color="info" />
                            </TableCell>
                            <TableCell>
                                <Typography variant="caption">{row.note ?? '—'}</Typography>
                                {row.adminNote && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        → {row.adminNote}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell><RequestStatusChip status={row.status} /></TableCell>
                            <TableCell>
                                <Typography variant="caption">{fmtDate(row.createdAt)}</Typography>
                                {row.resolvedAt && (
                                    <Typography variant="caption" color="text.secondary" display="block">
                                        {t('license.resolvedAt', { date: fmtDate(row.resolvedAt) })}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell align="right">
                                {row.status === 'PENDING' && (
                                    <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                        <Tooltip title={t('license.approveTooltip')}>
                                            <IconButton size="small" color="success"
                                                onClick={() => { setActionRow(row); setAdminNote(''); setActionType('approve'); }}>
                                                <CheckCircle fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('license.rejectTooltip')}>
                                            <IconButton size="small" color="error"
                                                onClick={() => { setActionRow(row); setAdminNote(''); setActionType('reject'); }}>
                                                <Cancel fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                    {data.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.disabled' }}>
                                {t('license.noStorageRequests')}
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            <Dialog open={!!actionRow} onClose={() => { setActionRow(null); setActionError(''); }} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>
                    {actionType === 'approve' ? t('license.approveStorageReq') : t('license.rejectStorageReq')}
                </DialogTitle>
                <DialogContent dividers>
                    {actionRow && (
                        <Typography variant="body2" mb={2}>
                            <strong>{actionRow.orgName}</strong> — {actionRow.quantity}×{' '}
                            {PKG_LABEL[actionRow.packageMb] ?? `+${actionRow.packageMb} MB`}
                            {' '}({t('license.storageTotalInfo', { mb: actionRow.totalMb })})
                        </Typography>
                    )}
                    <TextField fullWidth size="small" label={t('license.adminNoteOptional')}
                        multiline rows={2}
                        value={adminNote} onChange={e => setAdminNote(e.target.value)} />
                    {actionError && <Alert severity="error" sx={{ mt: 1.5 }}>{actionError}</Alert>}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => { setActionRow(null); setActionError(''); }}>{t('common.cancel')}</Button>
                    <Button size="small"
                        color={actionType === 'approve' ? 'success' : 'error'}
                        disabled={actionMut.isPending}
                        onClick={() => actionMut.mutate()}>
                        {actionType === 'approve' ? t('license.approveBtn') : t('license.rejectBtn')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─── Backup Plan Requests Tab ─────────────────────────────────────────────────

function BackupPlanRequestsTab() {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const { data = [], isLoading } = useQuery({
        queryKey: ['backup-plan-requests-all'],
        queryFn: () => backupApi.listPlanRequests(),
    });

    const [actionRow, setActionRow]   = useState<BackupPlanRequest | null>(null);
    const [adminNote, setAdminNote]   = useState('');
    const [actionType, setActionType] = useState<'approve' | 'reject'>('approve');
    const [actionError, setActionError] = useState('');

    const actionMut = useMutation({
        mutationFn: () => actionType === 'approve'
            ? backupApi.approvePlanRequest(actionRow!.id, adminNote || undefined)
            : backupApi.rejectPlanRequest(actionRow!.id, adminNote || undefined),
        onSuccess: () => {
            setActionRow(null);
            setActionError('');
            // Refresh tab data + badge count
            qc.invalidateQueries({ queryKey: ['backup-plan-requests-all'] });
            // Refresh org's plan view immediately (LicensePage RequestsTab)
            qc.invalidateQueries({ queryKey: ['backup-plan-own'] });
        },
        onError: (e: unknown) => {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
            setActionError(msg ?? t('license.errorRetry'));
        },
    });

    const pending = data.filter(r => r.status === 'PENDING').length;

    if (isLoading) return <CircularProgress sx={{ m: 3 }} />;

    return (
        <Box>
            {pending > 0 && (
                <Box sx={{ mb: 2, p: 1.5, bgcolor: alpha('#FF9800', 0.1), borderRadius: 1,
                    border: '1px solid', borderColor: 'warning.main' }}>
                    <Typography variant="body2" color="warning.main" fontWeight={600}>
                        {pending} yêu cầu gói backup đang chờ duyệt
                    </Typography>
                </Box>
            )}

            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>{t('superAdmin.organizations')}</TableCell>
                        <TableCell align="center">Gói yêu cầu</TableCell>
                        <TableCell>Người gửi</TableCell>
                        <TableCell>Ghi chú</TableCell>
                        <TableCell align="center">{t('common.status')}</TableCell>
                        <TableCell>{t('common.createdAt')}</TableCell>
                        <TableCell align="right">{t('common.actions')}</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {data.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                <Typography color="text.secondary">Không có yêu cầu nào</Typography>
                            </TableCell>
                        </TableRow>
                    ) : data.map((r: BackupPlanRequest) => (
                        <TableRow key={r.id} hover sx={r.status === 'PENDING' ? { bgcolor: alpha('#FF9800', 0.04) } : {}}>
                            <TableCell>
                                <Typography variant="body2" fontWeight={600}>{r.orgName}</Typography>
                            </TableCell>
                            <TableCell align="center">
                                <Chip label={`${r.requestedPlan} ngày`} size="small" color="primary" variant="outlined" sx={{ fontWeight: 700 }} />
                            </TableCell>
                            <TableCell>
                                <Typography variant="caption">{r.requestedByName ?? '—'}</Typography>
                            </TableCell>
                            <TableCell>
                                <Typography variant="caption" color="text.secondary">{r.note ?? '—'}</Typography>
                            </TableCell>
                            <TableCell align="center">
                                {r.status === 'APPROVED'
                                    ? <Chip label={t('license.statusApproved')} size="small" color="success" />
                                    : r.status === 'REJECTED'
                                    ? <Chip label={t('license.statusRejected')} size="small" color="error" />
                                    : <Chip label={t('license.statusPending')} size="small" color="warning" icon={<HourglassEmpty fontSize="inherit" />} />}
                            </TableCell>
                            <TableCell>
                                <Typography variant="body2">
                                    {new Date(r.createdAt).toLocaleDateString('vi-VN')}
                                </Typography>
                            </TableCell>
                            <TableCell align="right">
                                {r.status === 'PENDING' && (
                                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                                        <Tooltip title={t('license.approveBtn')}>
                                            <IconButton size="small" color="success"
                                                onClick={() => { setActionRow(r); setAdminNote(''); setActionType('approve'); }}>
                                                <CheckCircle fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('license.rejectBtn')}>
                                            <IconButton size="small" color="error"
                                                onClick={() => { setActionRow(r); setAdminNote(''); setActionType('reject'); }}>
                                                <Cancel fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                )}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* Approve / Reject dialog */}
            {actionRow && (
                <Dialog open onClose={() => setActionRow(null)} maxWidth="xs" fullWidth>
                    <DialogTitle fontWeight={700}>
                        {actionType === 'approve' ? 'Duyệt gói backup' : 'Từ chối gói backup'}
                    </DialogTitle>
                    <DialogContent dividers>
                        <Stack gap={2} pt={0.5}>
                            <Typography variant="body2">
                                {actionType === 'approve'
                                    ? `Duyệt gói ${actionRow.requestedPlan} ngày cho tổ chức "${actionRow.orgName}"? Tự động backup sẽ bắt đầu sau khi duyệt.`
                                    : `Từ chối yêu cầu gói backup của tổ chức "${actionRow.orgName}"?`}
                            </Typography>
                            <TextField
                                label={t('license.adminNoteOptional')}
                                value={adminNote}
                                onChange={e => setAdminNote(e.target.value)}
                                size="small"
                                fullWidth
                                multiline
                                rows={2}
                            />
                            {actionError && <Alert severity="error">{actionError}</Alert>}
                        </Stack>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button size="small" onClick={() => setActionRow(null)}>{t('common.cancel')}</Button>
                        <Button
                            size="small"
                            color={actionType === 'approve' ? 'success' : 'error'}
                            disabled={actionMut.isPending}
                            startIcon={actionMut.isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                            onClick={() => actionMut.mutate()}
                        >
                            {actionType === 'approve' ? t('license.approveBtn') : t('license.rejectBtn')}
                        </Button>
                    </DialogActions>
                </Dialog>
            )}
        </Box>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LicenseManagementPage() {
    const [tab, setTab] = useState(0);
    const { t } = useTranslation();

    const { data: licenseRequests = [] } = useQuery({
        queryKey: ['license-requests'],
        queryFn: licenseApi.getPurchaseRequests,
        staleTime: 60_000,
    });
    const pendingLicense = licenseRequests.filter(r => r.status === 'PENDING').length;

    const { data: storageRequests = [] } = useQuery({
        queryKey: ['storage-requests-all'],
        queryFn: () => storageQuotaApi.listAllRequests(),
        staleTime: 60_000,
    });
    const pendingStorage = storageRequests.filter(r => r.status === 'PENDING').length;

    const { data: backupPlanRequests = [] } = useQuery({
        queryKey: ['backup-plan-requests-all'],
        queryFn: () => backupApi.listPlanRequests(),
        // No staleTime — always refetch on mount so badge count is accurate
    });
    const pendingBackupPlan = backupPlanRequests.filter((r: BackupPlanRequest) => r.status === 'PENDING').length;

    const { data: transferRequests = [] } = useQuery({
        queryKey: ['license-transfer-requests'],
        queryFn: licenseApi.getTransferRequests,
        staleTime: 60_000,
    });
    const pendingTransfer = transferRequests.filter(r => r.status === 'PENDING').length;

    const totalPending = pendingLicense + pendingStorage + pendingBackupPlan + pendingTransfer;

    return (
        <Box>
            <Stack direction="row" alignItems="center" gap={1.5} mb={totalPending > 0 ? 1 : 3}>
                <AdminPanelSettings color="primary" />
                <Typography variant="h5" fontWeight={700}>{t('superAdmin.licenseManagement')}</Typography>
            </Stack>
            {totalPending > 0 && (
                <Typography variant="body2" color="warning.main" mb={3}>
                    {totalPending} yêu cầu đang chờ duyệt
                </Typography>
            )}

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab icon={<Inventory2 fontSize="small" />} iconPosition="start" label={t('superAdmin.organizations')} />
                <Tab
                    icon={<WorkspacePremium fontSize="small" />} iconPosition="start"
                    label={pendingLicense > 0 ? `${t('license.requestLicense')} (${pendingLicense})` : t('license.requestLicense')}
                    sx={pendingLicense > 0 ? { color: 'warning.main' } : {}}
                />
                <Tab
                    icon={<Storage fontSize="small" />} iconPosition="start"
                    label={pendingStorage > 0 ? `${t('license.requestStorage')} (${pendingStorage})` : t('license.requestStorage')}
                    sx={pendingStorage > 0 ? { color: 'error.main' } : {}}
                />
                <Tab
                    icon={<BackupOutlined fontSize="small" />} iconPosition="start"
                    label={pendingBackupPlan > 0 ? `Gói Backup (${pendingBackupPlan})` : 'Gói Backup'}
                    sx={pendingBackupPlan > 0 ? { color: 'warning.main' } : {}}
                />
                <Tab
                    icon={<SwapHoriz fontSize="small" />} iconPosition="start"
                    label={pendingTransfer > 0 ? `${t('license.transferRequestTitle')} (${pendingTransfer})` : t('license.transferRequestTitle')}
                    sx={pendingTransfer > 0 ? { color: 'warning.main' } : {}}
                />
            </Tabs>

            {tab === 0 && <OrgsTab />}
            {tab === 1 && <RequestsTab />}
            {tab === 2 && <StorageRequestsTab />}
            {tab === 3 && <BackupPlanRequestsTab />}
            {tab === 4 && <TransferRequestsAdminTab />}
        </Box>
    );
}
