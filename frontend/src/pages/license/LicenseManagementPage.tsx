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
    SwapHoriz, WorkspacePremium,
} from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import licenseApi from '@api/license.api';
import type { OrgPoolRow, PurchaseRequestRow, PackageType, DeviceLicenseRow, PoolBatch, LicenseHistoryRow } from '@api/license.api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PKG_LABELS: Record<PackageType, string> = {
    '12M': '12 tháng', '24M': '24 tháng', '36M': '36 tháng',
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
    if (status === 'APPROVED') return <Chip label="Đã duyệt" size="small" color="success" />;
    if (status === 'REJECTED') return <Chip label="Từ chối"  size="small" color="error" />;
    return <Chip label="Chờ duyệt" size="small" color="warning" icon={<HourglassEmpty fontSize="inherit" />} />;
}

// ─── Edit Pool Dialog ─────────────────────────────────────────────────────────

function EditPoolDialog({ org, onClose }: { org: OrgPoolRow; onClose: () => void }) {
    const qc = useQueryClient();
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
        if (delta < 0 && cur + delta < 0) return `Chỉ trừ được tối đa ${cur}, phần còn lại sẽ bị bỏ qua`;
        return '';
    };

    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Sửa kho license — {org.name}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" mb={2}>
                    Nhập số dương để cộng thêm, số âm để trừ bớt.
                </Typography>
                <Stack gap={2} mt={1}>
                    {(['12M', '24M', '36M'] as PackageType[]).map((t, i) => {
                        const cur  = [org.pkg12m, org.pkg24m, org.pkg36m][i];
                        const vals = [d12, d24, d36];
                        const sets = [setD12, setD24, setD36];
                        const warn = clampWarning(cur, vals[i]);
                        return (
                            <Box key={t}>
                                <TextField size="small" fullWidth type="number"
                                    label={`Gói ${PKG_LABELS[t]} (hiện: ${cur})`}
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
                <Button onClick={onClose}>Hủy</Button>
                <Button variant="contained" disabled={mut.isPending} onClick={() => mut.mutate()}>Lưu</Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Action chip for history ──────────────────────────────────────────────────

function ActionChip({ action, detail }: { action: string; detail?: Record<string, unknown> | null }) {
    const isAutoExpired = action === 'REVOKE' && detail?.auto === true;
    const map: Record<string, { label: string; color: 'success' | 'error' | 'warning' | 'info' | 'default' }> = {
        ASSIGN:        { label: 'Cấp',        color: 'success' },
        TRANSFER:      { label: 'Chuyển',     color: 'info' },
        ADJUST_EXPIRY: { label: 'Sửa hạn',   color: 'warning' },
        REVOKE:        { label: isAutoExpired ? 'Hết hạn TĐ' : 'Thu hồi', color: isAutoExpired ? 'default' : 'error' },
    };
    const cfg = map[action] ?? { label: action, color: 'default' as const };
    return <Chip label={cfg.label} size="small" color={cfg.color} />;
}

// ─── Org Detail Dialog ────────────────────────────────────────────────────────

function OrgDetailDialog({ org, onClose }: { org: OrgPoolRow; onClose: () => void }) {
    const qc = useQueryClient();
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
        onError:    (e: unknown) => setMutError((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Lỗi không xác định'),
    });

    const devices        = data?.devices        ?? [];
    const poolBatches    = data?.poolBatches    ?? [];
    const licenseHistory = data?.licenseHistory ?? [];

    // per-type stats — use live pool from query (not stale org prop)
    const livePool = data?.pool;
    const stats = (['12M', '24M', '36M'] as PackageType[]).map(t => {
        const poolKey = ({ '12M': 'pkg12m', '24M': 'pkg24m', '36M': 'pkg36m' } as const)[t];
        const assigned = devices.filter(d => d.packageType === t && d.expiresAt).length;
        const expired  = devices.filter(d => d.packageType === t && !d.isLicensed && d.expiresAt).length;
        const inPool   = livePool ? (livePool[poolKey] as number) : (org[poolKey] as number);
        return { type: t, inPool, assigned, expired, active: assigned - expired };
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
            <DialogTitle>
                <Stack direction="row" alignItems="center" gap={1}>
                    <InfoOutlined color="primary" />
                    Chi tiết license — <strong>{org.name}</strong>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ p: 0 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)}
                    sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Tab icon={<WorkspacePremium fontSize="small" />} iconPosition="start"
                        label={`Gói license (${activeCount} active${licensedDevices.length > activeCount ? ` / ${licensedDevices.length - activeCount} hết hạn` : ''})`} />
                    <Tab icon={<DevicesOther fontSize="small" />} iconPosition="start"
                        label={`Thiết bị (${devices.length})`} />
                    <Tab icon={<History fontSize="small" />} iconPosition="start"
                        label={`Lịch sử gán (${licenseHistory.length})`} />
                    <Tab icon={<Inventory2 fontSize="small" />} iconPosition="start"
                        label={`Lịch sử nạp (${poolBatches.length})`} />
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
                                            Gói {PKG_LABELS[s.type]}
                                        </Typography>
                                        <Stack direction="row" gap={1} flexWrap="wrap">
                                            <Chip label={`Kho: ${s.inPool}`}  size="small"
                                                color={s.inPool > 0 ? 'success' : 'default'} />
                                            <Chip label={`Gán: ${s.assigned}`} size="small" color="primary" />
                                            {s.expired > 0 && (
                                                <Chip label={`Hết: ${s.expired}`} size="small" color="error" />
                                            )}
                                        </Stack>
                                    </CardContent>
                                </Card>
                            ))}
                        </Stack>

                        {/* Assigned licenses detail */}
                        <Typography variant="subtitle2" color="text.secondary" mb={1}>
                            Chi tiết license đã gán
                        </Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Thiết bị</TableCell>
                                    <TableCell>Gói</TableCell>
                                    <TableCell>Ngày cấp</TableCell>
                                    <TableCell>Người cấp</TableCell>
                                    <TableCell>Hết hạn</TableCell>
                                    <TableCell align="center">Còn lại</TableCell>
                                    <TableCell>Trạng thái</TableCell>
                                    <TableCell align="right">Thao tác</TableCell>
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
                                            {d.packageType ? PKG_LABELS[d.packageType as PackageType] ?? d.packageType : '—'}
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
                                                ? <Chip label={`${d.daysRemaining}d`} size="small"
                                                    color={d.daysRemaining <= 7 ? 'error' : d.daysRemaining <= 30 ? 'warning' : 'success'} />
                                                : <Typography variant="caption" color="text.disabled">—</Typography>
                                            }
                                        </TableCell>
                                        <TableCell>
                                            {d.isLicensed
                                                ? <Chip label="Active" size="small" color="success" />
                                                : <Chip label="Hết hạn" size="small" color="error" />
                                            }
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                                <Tooltip title="Sửa ngày hết hạn">
                                                    <IconButton size="small"
                                                        onClick={() => { setAdjustDevice(d); setNewExpiry(d.expiresAt!.slice(0, 10)); }}>
                                                        <EditCalendar fontSize="inherit" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Thu hồi license">
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
                                            Chưa có license nào được gán
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
                                    <TableCell>Thiết bị</TableCell>
                                    <TableCell>Gói</TableCell>
                                    <TableCell>Ngày cấp</TableCell>
                                    <TableCell>Hết hạn</TableCell>
                                    <TableCell align="center">Còn lại</TableCell>
                                    <TableCell>Trạng thái</TableCell>
                                    <TableCell align="right">Thao tác</TableCell>
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
                                            {d.packageType ? PKG_LABELS[d.packageType as PackageType] ?? d.packageType : '—'}
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
                                                ? <Chip label={`${d.daysRemaining}d`} size="small"
                                                    color={d.daysRemaining <= 7 ? 'error' : d.daysRemaining <= 30 ? 'warning' : 'success'} />
                                                : <Typography variant="caption" color="text.disabled">—</Typography>
                                            }
                                        </TableCell>
                                        <TableCell>
                                            {!d.expiresAt
                                                ? <Chip label="Chưa có" size="small" />
                                                : d.isLicensed
                                                    ? <Chip label="Active" size="small" color="success" />
                                                    : <Chip label="Hết hạn" size="small" color="error" />
                                            }
                                        </TableCell>
                                        <TableCell align="right">
                                            <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                                {d.isLicensed && d.expiresAt && (
                                                    <Tooltip title="Chuyển license sang thiết bị khác">
                                                        <IconButton size="small" color="info"
                                                            onClick={() => { setTransferDevice(d); setToDeviceId(''); setMutError(''); }}>
                                                            <SwapHoriz fontSize="inherit" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {d.expiresAt && (
                                                    <Tooltip title="Sửa ngày hết hạn">
                                                        <IconButton size="small"
                                                            onClick={() => { setAdjustDevice(d); setNewExpiry(d.expiresAt!.slice(0, 10)); }}>
                                                            <EditCalendar fontSize="inherit" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                                {d.expiresAt && (
                                                    <Tooltip title="Thu hồi license">
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
                                            Không có thiết bị
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
                                    <TableCell>Thời gian</TableCell>
                                    <TableCell>Hành động</TableCell>
                                    <TableCell>Thiết bị</TableCell>
                                    <TableCell>Chi tiết</TableCell>
                                    <TableCell>Người thực hiện</TableCell>
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
                                            Chưa có lịch sử
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
                            Mỗi hàng là một lần chỉnh kho (dương = cộng, âm = trừ)
                        </Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Thời gian</TableCell>
                                    <TableCell align="center">Gói 12T</TableCell>
                                    <TableCell align="center">Gói 24T</TableCell>
                                    <TableCell align="center">Gói 36T</TableCell>
                                    <TableCell>Nguồn</TableCell>
                                    <TableCell>Người thực hiện</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {poolBatches.map((b: PoolBatch) => {
                                    const src = b.source === 'PURCHASE_REQUEST' ? 'Duyệt yêu cầu'
                                        : b.source ? b.source : 'Thủ công';
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
                                            Chưa có lịch sử nạp gói
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Box>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Đóng</Button>
            </DialogActions>
        </Dialog>

        {/* ── Transfer Dialog ─────────────────────────────────────────────── */}
        <Dialog open={!!transferDevice} onClose={() => { setTransferDevice(null); setMutError(''); }} maxWidth="xs" fullWidth>
            <DialogTitle>Chuyển license — {transferDevice?.deviceName}</DialogTitle>
            <DialogContent>
                <Typography variant="body2" color="text.secondary" mb={2}>
                    Gói {transferDevice?.packageType && PKG_LABELS[transferDevice.packageType as PackageType]},
                    hết hạn {fmtDate(transferDevice?.expiresAt ?? null)}
                </Typography>
                <TextField select fullWidth size="small" label="Thiết bị đích"
                    value={toDeviceId} onChange={e => { setToDeviceId(e.target.value); setMutError(''); }}>
                    {transferTargets.map(d => {
                        const hasLic = d.isLicensed && d.expiresAt;
                        return (
                            <MenuItem key={d.deviceId} value={d.deviceId}>
                                <Stack direction="row" justifyContent="space-between" width="100%" alignItems="center" gap={1}>
                                    <span>{d.deviceName}</span>
                                    {hasLic
                                        ? <Chip label="Đang có lic" size="small" color="warning" />
                                        : <Chip label="Trống" size="small" color="default" />
                                    }
                                </Stack>
                            </MenuItem>
                        );
                    })}
                    {transferTargets.length === 0 && (
                        <MenuItem disabled>Không có thiết bị khác</MenuItem>
                    )}
                </TextField>
                {mutError && <Alert severity="error" sx={{ mt: 1.5 }}>{mutError}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => { setTransferDevice(null); setMutError(''); }}>Hủy</Button>
                <Button variant="contained" color="info" disabled={!toDeviceId || transferMut.isPending}
                    onClick={() => transferMut.mutate()}>
                    Chuyển
                </Button>
            </DialogActions>
        </Dialog>

        {/* ── Revoke confirmation ─────────────────────────────────────────── */}
        <Dialog open={!!revokeDevice} onClose={() => setRevokeDevice(null)} maxWidth="xs" fullWidth>
            <DialogTitle>Thu hồi license</DialogTitle>
            <DialogContent>
                <Typography variant="body2">
                    Thu hồi license của <strong>{revokeDevice?.deviceName}</strong>?
                    {revokeDevice?.isLicensed && ' Gói còn hiệu lực sẽ được hoàn về kho.'}
                </Typography>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setRevokeDevice(null)}>Hủy</Button>
                <Button variant="contained" color="error" disabled={revokeMut.isPending}
                    onClick={() => revokeMut.mutate()}>
                    Thu hồi
                </Button>
            </DialogActions>
        </Dialog>

        {/* ── Adjust expiry ───────────────────────────────────────────────── */}
        <Dialog open={!!adjustDevice} onClose={() => setAdjustDevice(null)} maxWidth="xs" fullWidth>
            <DialogTitle>Sửa ngày hết hạn — {adjustDevice?.deviceName}</DialogTitle>
            <DialogContent>
                <TextField fullWidth type="date" label="Ngày hết hạn mới"
                    InputLabelProps={{ shrink: true }}
                    value={newExpiry} onChange={e => setNewExpiry(e.target.value)}
                    sx={{ mt: 2 }}
                    inputProps={{ min: new Date().toISOString().slice(0, 10) }} />
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setAdjustDevice(null)}>Hủy</Button>
                <Button variant="contained" disabled={!newExpiry || adjustMut.isPending}
                    onClick={() => adjustMut.mutate()}>
                    Lưu
                </Button>
            </DialogActions>
        </Dialog>
        </>
    );
}

// ─── Orgs Tab ─────────────────────────────────────────────────────────────────

function OrgsTab() {
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
                        <TableCell>Tổ chức</TableCell>
                        <TableCell align="center">Gói 12T</TableCell>
                        <TableCell align="center">Gói 24T</TableCell>
                        <TableCell align="center">Gói 36T</TableCell>
                        <TableCell align="center">Tổng kho</TableCell>
                        <TableCell align="center">Thiết bị</TableCell>
                        <TableCell align="center">Đã cấp phép</TableCell>
                        <TableCell align="center">Hết hạn ≤7d</TableCell>
                        <TableCell align="right">Thao tác</TableCell>
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
                                        <Tooltip title="Xem chi tiết">
                                            <IconButton size="small" onClick={() => setDetailOrg(org)}>
                                                <InfoOutlined fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Sửa kho gói">
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
                                Không có tổ chức
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
            setActionError(msg ?? 'Có lỗi xảy ra, vui lòng thử lại');
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
                        {pending} yêu cầu đang chờ duyệt
                    </Typography>
                </Box>
            )}

            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Tổ chức</TableCell>
                        <TableCell>Người yêu cầu</TableCell>
                        <TableCell>Gói</TableCell>
                        <TableCell align="center">Số lượng</TableCell>
                        <TableCell>Ghi chú</TableCell>
                        <TableCell>Trạng thái</TableCell>
                        <TableCell>Ngày tạo</TableCell>
                        <TableCell align="right">Thao tác</TableCell>
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
                            <TableCell>{PKG_LABELS[row.packageType as PackageType] ?? row.packageType}</TableCell>
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
                                        xử lý: {fmtDate(row.resolvedAt)}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell align="right">
                                {row.status === 'PENDING' && (
                                    <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                        <Tooltip title="Duyệt">
                                            <IconButton size="small" color="success"
                                                onClick={() => { setActionRow(row); setAdminNote(''); setActionType('approve'); }}>
                                                <CheckCircle fontSize="inherit" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Từ chối">
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
                                Không có yêu cầu
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>

            {/* Approve/Reject dialog */}
            <Dialog open={!!actionRow} onClose={() => { setActionRow(null); setActionError(''); }} maxWidth="xs" fullWidth>
                <DialogTitle>
                    {actionType === 'approve' ? 'Duyệt yêu cầu' : 'Từ chối yêu cầu'}
                </DialogTitle>
                <DialogContent>
                    {actionRow && (
                        <Typography variant="body2" mb={2}>
                            <strong>{actionRow.orgName}</strong> — {actionRow.quantity}×{' '}
                            {PKG_LABELS[actionRow.packageType as PackageType] ?? actionRow.packageType}
                        </Typography>
                    )}
                    <TextField fullWidth size="small" label="Ghi chú admin (tùy chọn)"
                        multiline rows={2}
                        value={adminNote} onChange={e => setAdminNote(e.target.value)} />
                    {actionError && <Alert severity="error" sx={{ mt: 1.5 }}>{actionError}</Alert>}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setActionRow(null); setActionError(''); }}>Hủy</Button>
                    <Button variant="contained"
                        color={actionType === 'approve' ? 'success' : 'error'}
                        disabled={actionMut.isPending}
                        onClick={() => actionMut.mutate()}>
                        {actionType === 'approve' ? 'Duyệt' : 'Từ chối'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LicenseManagementPage() {
    const [tab, setTab] = useState(0);

    const { data: requests = [] } = useQuery({
        queryKey: ['license-requests'],
        queryFn: licenseApi.getPurchaseRequests,
        staleTime: 60_000,
    });
    const pendingCount = requests.filter(r => r.status === 'PENDING').length;

    return (
        <Box>
            <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
                <AdminPanelSettings color="primary" />
                <Typography variant="h5" fontWeight={700}>Quản lý License (Admin)</Typography>
            </Stack>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
                <Tab icon={<Inventory2 fontSize="small" />} iconPosition="start" label="Tổ chức" />
                <Tab
                    label={pendingCount > 0 ? `Yêu cầu mua (${pendingCount})` : 'Yêu cầu mua'}
                    sx={pendingCount > 0 ? { color: 'warning.main' } : {}}
                />
            </Tabs>

            {tab === 0 && <OrgsTab />}
            {tab === 1 && <RequestsTab />}
        </Box>
    );
}
