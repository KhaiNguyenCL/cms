import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Grid, Card, CardContent, Button,
    TextField, Divider, Chip, Alert, Skeleton,
    alpha, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Tooltip,
    CircularProgress,
} from '@mui/material';
import {
    Business, Storage, Save, Person, Tv, Image,
    VideoFile, CalendarMonth, People, CheckCircle, Lock,
    Backup, RestoreFromTrash, Delete, Add, WarningAmber,
} from '@mui/icons-material';

import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import { organizationsApi } from '@api/organizations.api';
import { backupApi } from '@api/backup.api';
import type { OrgBackup } from '@/types';

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ icon, title, subtitle, children }: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    children: React.ReactNode;
}) {
    return (
        <Card>
            <CardContent sx={{ p: 3 }}>
                <Stack direction="row" alignItems="flex-start" gap={1.5} mb={2.5}>
                    <Box sx={{
                        width: 38, height: 38, borderRadius: 2,
                        bgcolor: alpha('#6C63FF', 0.15),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'primary.main', flexShrink: 0, mt: 0.25,
                    }}>
                        {icon}
                    </Box>
                    <Box>
                        <Typography variant="h6" fontWeight={700}>{title}</Typography>
                        {subtitle && (
                            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
                        )}
                    </Box>
                </Stack>
                <Divider sx={{ mb: 2.5 }} />
                {children}
            </CardContent>
        </Card>
    );
}

// ── Stat row ──────────────────────────────────────────────────────────────────

function StatRow({ icon, label, value, color = 'text.secondary' }: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color?: string;
}) {
    return (
        <Stack direction="row" justifyContent="space-between" alignItems="center" py={1}>
            <Stack direction="row" alignItems="center" gap={1.25}>
                <Box sx={{ color: 'text.disabled', display: 'flex', fontSize: 18 }}>{icon}</Box>
                <Typography variant="body2" color="text.secondary">{label}</Typography>
            </Stack>
            <Typography variant="body2" fontWeight={700} color={color}>{value}</Typography>
        </Stack>
    );
}

// ── Backup Section ────────────────────────────────────────────────────────────

function BackupSection() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const { t } = useTranslation();

    const { data: backups = [], isLoading } = useQuery({
        queryKey: ['backups'],
        queryFn: backupApi.list,
        staleTime: 30_000,
    });

    const [labelInput, setLabelInput] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const [confirmTarget, setConfirmTarget] = useState<{ backup: OrgBackup; action: 'restore' | 'delete' } | null>(null);

    const createMutation = useMutation({
        mutationFn: () => backupApi.create(labelInput.trim() || undefined),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['backups'] });
            setCreateOpen(false);
            setLabelInput('');
            dispatch(pushToast({ severity: 'success', message: 'Snapshot tạo thành công' }));
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') })),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => backupApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['backups'] });
            setConfirmTarget(null);
            dispatch(pushToast({ severity: 'success', message: 'Đã xóa snapshot' }));
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') })),
    });

    const restoreMutation = useMutation({
        mutationFn: (id: string) => backupApi.restore(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['backups'] });
            setConfirmTarget(null);
            dispatch(pushToast({ severity: 'success', message: 'Restore thành công. Thiết bị sẽ re-sync trong giây lát.' }));
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') })),
    });

    const isPending = deleteMutation.isPending || restoreMutation.isPending;

    return (
        <>
            <Section
                icon={<Backup />}
                title="Backup & Restore"
                subtitle="Tạo snapshot dữ liệu và khôi phục về bất kỳ thời điểm nào."
            >
                <Stack spacing={2}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="body2" color="text.secondary">
                            {backups.length} snapshot{backups.length !== 1 ? 's' : ''} · AUTO tự động mỗi ngày lúc 02:30 UTC nếu có gói backup.
                        </Typography>
                        <Button size="small" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                            Tạo snapshot
                        </Button>
                    </Stack>

                    {isLoading ? (
                        <Stack spacing={1}>{[...Array(3)].map((_, i) => <Skeleton key={i} height={40} />)}</Stack>
                    ) : backups.length === 0 ? (
                        <Alert severity="info" sx={{ borderRadius: 2 }}>Chưa có snapshot nào. Tạo snapshot đầu tiên để bắt đầu.</Alert>
                    ) : (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>Tên</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700 }}>Loại</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700 }}>Ngày tạo</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700 }}>Thao tác</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {backups.map((b) => (
                                        <TableRow key={b.id} hover>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600}>{b.label}</Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Chip
                                                    label={b.type === 'AUTO' ? 'Auto' : 'Manual'}
                                                    size="small"
                                                    color={b.type === 'AUTO' ? 'default' : 'primary'}
                                                    variant={b.type === 'AUTO' ? 'outlined' : 'filled'}
                                                    sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Typography variant="caption" color="text.secondary">
                                                    {new Date(b.createdAt).toLocaleString('vi-VN')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Stack direction="row" justifyContent="center" spacing={0.5}>
                                                    <Tooltip title="Restore về snapshot này">
                                                        <IconButton size="small" color="warning" onClick={() => setConfirmTarget({ backup: b, action: 'restore' })}>
                                                            <RestoreFromTrash sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Xóa snapshot">
                                                        <IconButton size="small" color="error" onClick={() => setConfirmTarget({ backup: b, action: 'delete' })}>
                                                            <Delete sx={{ fontSize: 16 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Stack>
            </Section>

            {/* Create snapshot dialog */}
            <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>Tạo snapshot mới</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} pt={0.5}>
                        <TextField
                            label="Tên snapshot (tùy chọn)"
                            value={labelInput}
                            onChange={e => setLabelInput(e.target.value)}
                            size="small"
                            fullWidth
                            placeholder={`Backup ${new Date().toLocaleDateString('vi-VN')}`}
                            autoFocus
                        />
                        <Alert severity="info" sx={{ borderRadius: 1.5 }}>
                            Snapshot sẽ lưu toàn bộ thiết bị, media, playlist, schedule và site hiện tại của tổ chức.
                        </Alert>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
                    <Button size="small" disabled={createMutation.isPending}
                        startIcon={createMutation.isPending ? <CircularProgress size={14} color="inherit" /> : <Backup />}
                        onClick={() => createMutation.mutate()}>
                        Tạo snapshot
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Confirm dialog (restore / delete) */}
            <Dialog open={!!confirmTarget} onClose={isPending ? undefined : () => setConfirmTarget(null)} maxWidth="xs" fullWidth>
                <DialogTitle fontWeight={700}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        {confirmTarget?.action === 'restore'
                            ? <><WarningAmber color="warning" /><span>Xác nhận restore</span></>
                            : <><Delete color="error" /><span>Xóa snapshot</span></>}
                    </Stack>
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2">
                        {confirmTarget?.action === 'restore'
                            ? `Playlists, schedules, sites và các thiết bị/media có trong snapshot "${confirmTarget?.backup.label}" (${confirmTarget?.backup.createdAt ? new Date(confirmTarget.backup.createdAt).toLocaleString('vi-VN') : ''}) sẽ được khôi phục. Thiết bị và media được thêm sau ngày snapshot sẽ được giữ nguyên. Tiếp tục?`
                            : `Xóa snapshot "${confirmTarget?.backup.label}"? Thao tác này không thể hoàn tác.`}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setConfirmTarget(null)} disabled={isPending}>{t('common.cancel')}</Button>
                    <Button
                        size="small"
                        color={confirmTarget?.action === 'restore' ? 'warning' : 'error'}
                        disabled={isPending}
                        startIcon={isPending ? <CircularProgress size={14} color="inherit" /> : undefined}
                        onClick={() => {
                            if (!confirmTarget) return;
                            if (confirmTarget.action === 'restore') restoreMutation.mutate(confirmTarget.backup.id);
                            else deleteMutation.mutate(confirmTarget.backup.id);
                        }}
                    >
                        {confirmTarget?.action === 'restore' ? 'Restore ngay' : 'Xóa snapshot'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const { t } = useTranslation();
    const currentUser = useAppSelector(s => s.auth.user);
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

    // Org data
    const { data: org, isLoading: loadingOrg } = useQuery({
        queryKey: ['org-me'],
        queryFn: organizationsApi.getMe,
    });

    const { data: stats, isLoading: loadingStats } = useQuery({
        queryKey: ['org-stats'],
        queryFn: organizationsApi.getStats,
    });

    // Edit org name
    const [orgName, setOrgName] = useState('');
    useEffect(() => { if (org) setOrgName(org.name); }, [org]);

    const saveMutation = useMutation({
        mutationFn: () => organizationsApi.updateMe({ name: orgName.trim() }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['org-me'] });
            dispatch(pushToast({ severity: 'success', message: t('settings.orgSaved') }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') }));
        },
    });

    const nameChanged = orgName.trim() !== (org?.name ?? '');
    const nameValid = orgName.trim().length >= 2;

    // Device admin PIN
    const [newPin, setNewPin] = useState('');
    const [showPin, setShowPin] = useState(false);
    const pinValid = /^\d{4,8}$/.test(newPin);

    const pinMutation = useMutation({
        mutationFn: () => organizationsApi.updateDevicePin(newPin),
        onSuccess: () => {
            setNewPin('');
            dispatch(pushToast({ severity: 'success', message: t('settings.pinUpdated') }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('settings.pinFailed') }));
        },
    });

    return (
        <Box>
            {/* Header */}
            <Box mb={3}>
                <Typography variant="h4" fontWeight={700}>{t('settings.title')}</Typography>
                <Typography variant="body2" color="text.secondary">
                    {t('settings.subtitle')}
                </Typography>
            </Box>

            <Grid container spacing={3}>

                {/* ── Left column ─────────────────────────────────────────── */}
                <Grid size={{ xs: 12, md: 7 }}>
                    <Stack spacing={3}>

                        {/* Organization Profile */}
                        <Section
                            icon={<Business />}
                            title={t('settings.orgInfo')}
                            subtitle={t('settings.orgInfoSub')}
                        >
                            <Stack spacing={2.5}>
                                <TextField
                                    label={t('settings.orgName')}
                                    value={orgName}
                                    onChange={e => setOrgName(e.target.value)}
                                    fullWidth
                                    disabled={!isAdmin || loadingOrg}
                                    helperText={!isAdmin ? t('settings.adminOnly') : ''}
                                    inputProps={{ maxLength: 100 }}
                                />

                                <TextField
                                    label="Slug"
                                    value={loadingOrg ? '…' : (org?.slug ?? '')}
                                    fullWidth disabled
                                    helperText={t('settings.slugNote')}
                                />

                                <Stack direction="row" justifyContent="space-between" alignItems="center">
                                    <Stack direction="row" gap={1}>
                                        <Chip
                                            label={org?.isActive ? 'Active' : 'Inactive'}
                                            color={org?.isActive ? 'success' : 'default'}
                                            size="small"
                                            icon={<CheckCircle sx={{ fontSize: 12 }} />}
                                        />
                                        <Chip
                                            label={t('settings.createdChip', { date: org ? new Date(org.createdAt).toLocaleDateString() : '…' })}
                                            size="small"
                                            variant="outlined"
                                        />
                                    </Stack>

                                    {isAdmin && (
                                        <Button

                                            startIcon={<Save />}
                                            disabled={!nameChanged || !nameValid || saveMutation.isPending}
                                            onClick={() => saveMutation.mutate()}
                                            size="small"
                                        >
                                            {saveMutation.isPending ? t('common.loading') : t('settings.saveSettings')}
                                        </Button>
                                    )}
                                </Stack>
                            </Stack>
                        </Section>

                        {/* Account Info */}
                        <Section
                            icon={<Person />}
                            title={t('settings.accountInfo')}
                            subtitle={t('settings.accountInfoSub')}
                        >
                            <Stack spacing={2}>
                                <TextField
                                    label="Email"
                                    value={currentUser?.email ?? ''}
                                    fullWidth disabled
                                />
                                <Stack direction="row" gap={2}>
                                    <TextField
                                        label="Role"
                                        value={currentUser?.role ?? ''}
                                        sx={{ flex: 1 }} disabled
                                    />
                                    <TextField
                                        label={t('common.status')}
                                        value={currentUser?.status ?? ''}
                                        sx={{ flex: 1 }} disabled
                                    />
                                </Stack>

                                {!isAdmin && (
                                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                                        {t('settings.noAdminAlert')}
                                    </Alert>
                                )}
                            </Stack>
                        </Section>

                        {/* Backup & Restore */}
                        {isAdmin && <BackupSection />}

                        {/* Device Admin PIN */}
                        {isAdmin && (
                            <Section
                                icon={<Lock />}
                                title={t('settings.pinSection')}
                                subtitle={t('settings.pinSectionSub')}
                            >
                                <Stack spacing={2}>
                                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                                        {t('settings.pinSyncNote', { default: '0000' })}
                                    </Alert>
                                    <Stack direction="row" gap={1.5} alignItems="flex-start">
                                        <TextField
                                            label={t('settings.updatePin')}
                                            value={newPin}
                                            onChange={e => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                                            type={showPin ? 'text' : 'password'}
                                            inputProps={{ maxLength: 8, inputMode: 'numeric' }}
                                            helperText={t('settings.pinHelperText')}
                                            error={newPin.length > 0 && !pinValid}
                                            sx={{ flex: 1 }}
                                        />
                                        <Button
                                            variant="outlined"
                                            onClick={() => setShowPin(s => !s)}
                                            sx={{ mt: 0.5, minWidth: 80 }}
                                            size="small"
                                        >
                                            {showPin ? t('settings.hidePin') : t('settings.showPin')}
                                        </Button>
                                        <Button

                                            disabled={!pinValid || pinMutation.isPending}
                                            onClick={() => pinMutation.mutate()}
                                            sx={{ mt: 0.5 }}
                                            size="small"
                                        >
                                            {pinMutation.isPending ? t('common.saving') : t('settings.updatePin')}
                                        </Button>
                                    </Stack>
                                </Stack>
                            </Section>
                        )}

                    </Stack>
                </Grid>

                {/* ── Right column ─────────────────────────────────────────── */}
                <Grid size={{ xs: 12, md: 5 }}>
                    <Stack spacing={3}>

                        {/* Usage stats */}
                        <Section
                            icon={<Storage />}
                            title={t('settings.resourceUsage')}
                            subtitle={t('settings.resourceUsageSub')}
                        >
                            {loadingStats ? (
                                <Stack gap={1.5}>
                                    {[...Array(6)].map((_, i) => <Skeleton key={i} height={32} />)}
                                </Stack>
                            ) : (
                                <Stack divider={<Divider />}>
                                    <StatRow
                                        icon={<Tv fontSize="inherit" />}
                                        label={t('settings.devicesLabel')}
                                        value={`${stats?.onlineDevices ?? 0} online / ${stats?.totalDevices ?? 0} ${t('common.total')}`}
                                        color={(stats?.onlineDevices ?? 0) > 0 ? 'success.main' : 'text.secondary'}
                                    />
                                    <StatRow
                                        icon={<People fontSize="inherit" />}
                                        label="Users"
                                        value={`${stats?.activeUsers ?? 0} active / ${stats?.totalUsers ?? 0} ${t('common.total')}`}
                                    />
                                    <StatRow
                                        icon={<Image fontSize="inherit" />}
                                        label="Media"
                                        value={`${stats?.totalMedia ?? 0} file`}
                                    />
                                    <StatRow
                                        icon={<VideoFile fontSize="inherit" />}
                                        label="Playlists"
                                        value={stats?.totalPlaylists ?? 0}
                                    />
                                    <StatRow
                                        icon={<CalendarMonth fontSize="inherit" />}
                                        label="Schedules"
                                        value={stats?.totalSchedules ?? 0}
                                    />
                                </Stack>
                            )}
                        </Section>

                        {/* System info */}
                        {/* <Card sx={{ bgcolor: alpha('#FF6584', 0.05), border: '1px solid', borderColor: alpha('#FF6584', 0.15) }}>
                            <CardContent sx={{ p: 2.5 }}>
                                <Typography variant="subtitle2" fontWeight={700} color="error.main" mb={1.5}>
                                    {t('settings.sysInfo')}
                                </Typography>
                                <Stack spacing={0.75}>
                                    {[
                                        { label: 'Org ID', value: org?.id?.slice(0, 16) + '…' },
                                        { label: 'Version', value: 'DMS Signage v1.0' },
                                        { label: 'Backend', value: 'Node.js + PostgreSQL' },
                                        { label: t('settings.environment'), value: import.meta.env.MODE },
                                    ].map(({ label, value }) => (
                                        <Stack key={label} direction="row" justifyContent="space-between">
                                            <Typography variant="caption" color="text.secondary">{label}</Typography>
                                            <Typography variant="caption" fontWeight={600} color="text.primary">
                                                {loadingOrg && label === 'Org ID' ? '…' : value}
                                            </Typography>
                                        </Stack>
                                    ))}
                                </Stack>
                            </CardContent>
                        </Card> */}

                    </Stack>
                </Grid>

            </Grid>
        </Box>
    );
}
