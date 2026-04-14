import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Card, CardContent, Button, Chip, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, IconButton, Tooltip, Collapse, Skeleton, alpha, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    InputAdornment, LinearProgress, CircularProgress, Badge,
    Tab, Tabs, Switch, FormControlLabel, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import {
    Business, Tv, People, PermMedia, QueueMusic, CalendarMonth,
    KeyboardArrowDown, KeyboardArrowUp, CheckCircle, Cancel,
    Storage, PowerSettingsNew, ManageAccounts, AddCircle, WorkspacePremium,
    Visibility, VisibilityOff, Add, DeleteForever, AdminPanelSettings,
    Edit, Block, CheckCircleOutline, Lock, Shield,
    Star, StarBorder, Delete, Send, SystemUpdate,
    Email, CheckCircleOutlined,
} from '@mui/icons-material';
import softwareHistoryApi, { type AppVersion } from '@api/software-history.api';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import { setManagingOrg } from '@store/slices/authSlice';
import { organizationsApi, type OrgWithStats } from '@api/organizations.api';
import { authApi } from '@api/auth.api';
import { platformAuthApi, type PlatformAdmin } from '@api/platform-auth.api';
import {
    mailConfigApi, mailTemplateApi, mailSettingsApi,
    type MailConfig, type MailConfigPayload,
    type MailTemplate, type MailTemplatePayload,
    type MailSetting, type EventTypeInfo,
} from '@api/mail-config.api';
import { storageQuotaApi, type OrgStorageStat, type StoragePurchaseRequest } from '@api/storage-quota.api';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ icon, value, color }: { icon: React.ReactNode; value: string | number; color: string }) {
    return (
        <Chip
            icon={<Box sx={{ color, display: 'flex', fontSize: 14 }}>{icon}</Box>}
            label={value}
            size="small"
            variant="outlined"
            sx={{ borderColor: alpha(color, 0.3), color, fontWeight: 600, fontSize: '0.72rem' }}
        />
    );
}

// ── Expanded detail row ───────────────────────────────────────────────────────


function DetailRow({ org }: { org: OrgWithStats }) {
    const { t } = useTranslation();
    return (
        <Box sx={{ px: 3, py: 2, bgcolor: 'action.hover' }}>
            <Stack direction="row" gap={3} flexWrap="wrap">
                <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Org ID</Typography>
                    <Typography variant="body2" fontFamily="monospace" fontSize="0.75rem" color="text.secondary">
                        {org.id}
                    </Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Slug</Typography>
                    <Typography variant="body2" fontWeight={600}>{org.slug}</Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{t('common.createdAt')}</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmtDate(org.createdAt)}</Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>{t('superAdmin.detailLicensedDevices')}</Typography>
                    <Typography variant="body2" fontWeight={600}>{org.licensedDevices ?? 0} / {org.totalDevices}</Typography>
                </Box>
            </Stack>
        </Box>
    );
}

// ── helpers ───────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
    return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/[^a-z0-9\s-]/g, '').trim()
        .replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 50);
}

const STRENGTH_COLOR = ['error', 'warning', 'warning', 'success'] as const;
function getPwChecks(pw: string) {
    return [
        { labelKey: 'superAdmin.pwCheck1', ok: pw.length >= 8 },
        { labelKey: 'superAdmin.pwCheck2', ok: /[0-9]/.test(pw) },
        { labelKey: 'superAdmin.pwCheck3', ok: /[^a-zA-Z0-9]/.test(pw) },
    ];
}

// ── Create Org dialog ─────────────────────────────────────────────────────────

function CreateOrgDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const dispatch = useAppDispatch();
    const [orgName, setOrgName] = useState('');
    const [slug, setSlug] = useState('');
    const [slugEdited, setSlugEdited] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    useEffect(() => {
        if (!slugEdited) setSlug(toSlug(orgName));
    }, [orgName, slugEdited]);

    const pwChecks = getPwChecks(password);
    const strength = Math.round((pwChecks.filter(c => c.ok).length / pwChecks.length) * 100);
    const allPwOk = pwChecks.every(c => c.ok);
    const confirmOk = confirmPw.length > 0 && confirmPw === password;
    const slugValid = /^[a-z0-9-]+$/.test(slug) && slug.length >= 2;

    const mutation = useMutation({
        mutationFn: () => authApi.register({
            organizationName: orgName.trim(),
            organizationSlug: slug,
            email: email.trim(),
            password,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['super-admin-orgs'] });
            dispatch(pushToast({ severity: 'success', message: `${t('superAdmin.createOrg')}: "${orgName.trim()}"` }));
            onClose();
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') }));
        },
    });

    const canSubmit = orgName.trim().length >= 2 && slugValid && email.includes('@') && allPwOk && confirmOk && !mutation.isPending;

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Business color="primary" />
                    {t('superAdmin.createOrgTitle')}
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField
                        label={t('superAdmin.orgNameLabel')}
                        value={orgName}
                        onChange={e => setOrgName(e.target.value)}
                        fullWidth autoFocus required
                        inputProps={{ maxLength: 100 }}
                        helperText={t('superAdmin.orgNameHelper')}
                        size="small"
                    />
                    <Tooltip title={t('superAdmin.orgSlugTooltip')} placement="right">
                        <TextField
                            label={t('superAdmin.orgSlugLabel')}
                            value={slug}
                            onChange={e => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugEdited(true); }}
                            fullWidth required
                            inputProps={{ maxLength: 50 }}
                            error={slug.length > 0 && !slugValid}
                            helperText={slug.length > 0 && !slugValid ? t('superAdmin.orgSlugError') : t('superAdmin.orgSlugHelper')}
                            size="small"
                        />
                    </Tooltip>
                    <TextField
                        label={t('superAdmin.adminEmailLabel')}
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        fullWidth required
                        helperText={t('superAdmin.adminEmailHelper')}
                        size="small"
                    />
                    <Box>
                        <TextField
                            label={t('auth.password')}
                            type={showPw ? 'text' : 'password'}
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            fullWidth required size="small"
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setShowPw(!showPw)} edge="end">
                                            {showPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                        />
                        {password.length > 0 && (
                            <Box mt={1}>
                                <LinearProgress variant="determinate" value={strength}
                                    color={STRENGTH_COLOR[Math.floor(strength / 34)]}
                                    sx={{ height: 4, borderRadius: 2 }} />
                                <Stack mt={0.75} spacing={0.25}>
                                    {pwChecks.map(c => (
                                        <Stack key={c.labelKey} direction="row" alignItems="center" gap={0.75}>
                                            {c.ok
                                                ? <CheckCircle sx={{ fontSize: 12, color: 'success.main' }} />
                                                : <Cancel sx={{ fontSize: 12, color: 'text.disabled' }} />
                                            }
                                            <Typography variant="caption" color={c.ok ? 'success.main' : 'text.disabled'}>{t(c.labelKey)}</Typography>
                                        </Stack>
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </Box>
                    <TextField
                        label={t('superAdmin.confirmPasswordLabel')}
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        fullWidth required size="small"
                        error={confirmPw.length > 0 && !confirmOk}
                        helperText={confirmPw.length > 0 && !confirmOk ? t('superAdmin.passwordMismatch') : ''}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setShowConfirm(!showConfirm)} edge="end">
                                        {showConfirm ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} size="small">{t('common.cancel')}</Button>
                <Button
                    size="small"
                    disabled={!canSubmit}
                    onClick={() => mutation.mutate()}
                    startIcon={<Add />}
                >
                    {mutation.isPending ? t('common.creating') : t('superAdmin.createOrg')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}


// ── Confirm toggle dialog ─────────────────────────────────────────────────────

function ConfirmDialog({ org, onConfirm, onClose }: {
    org: OrgWithStats;
    onConfirm: () => void;
    onClose: () => void;
}) {
    const { t } = useTranslation();
    const actionKey = org.isActive ? 'superAdmin.actionOff' : 'superAdmin.actionOn';
    const action = t(actionKey);
    const color = org.isActive ? 'error' : 'success';
    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>{t('superAdmin.confirmToggleTitle', { action })}</DialogTitle>
            <DialogContent>
                <Typography variant="body2">
                    {t('common.confirm')} <strong>{action}</strong> {t('superAdmin.organizations').toLowerCase()} <strong>{org.name}</strong>?
                </Typography>
                {org.isActive && (
                    <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
                        {t('superAdmin.toggleWarn')}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} size="small">{t('common.cancel')}</Button>
                <Button

                    color={color}
                    size="small"
                    onClick={onConfirm}
                    startIcon={<PowerSettingsNew />}
                >
                    {action}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Delete Org dialog ─────────────────────────────────────────────────────────

function DeleteOrgDialog({ org, onClose }: { org: OrgWithStats; onClose: () => void }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const dispatch = useAppDispatch();
    const [confirmText, setConfirmText] = useState('');

    const mutation = useMutation({
        mutationFn: () => organizationsApi.delete(org.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['super-admin-orgs'] });
            dispatch(pushToast({ severity: 'success', message: `${t('superAdmin.deleteOrgBtn')}: "${org.name}"` }));
            onClose();
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') }));
        },
    });

    const canDelete = confirmText === org.name && !mutation.isPending;

    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700} sx={{ color: 'error.main' }}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <DeleteForever />
                    {t('superAdmin.deleteOrgTitle')}
                </Stack>
            </DialogTitle>
            <DialogContent>
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                    {t('superAdmin.deleteOrgAlert')}
                </Alert>
                <Typography variant="body2" mb={1.5}>
                    {t('superAdmin.deleteOrgConfirmMsg', { name: org.name })}
                </Typography>
                <TextField
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder={org.name}
                    fullWidth
                    size="small"
                    autoFocus
                    error={confirmText.length > 0 && confirmText !== org.name}
                />
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} size="small">{t('common.cancel')}</Button>
                <Button

                    color="error"
                    size="small"
                    disabled={!canDelete}
                    onClick={() => mutation.mutate()}
                    startIcon={<DeleteForever />}
                >
                    {mutation.isPending ? t('common.deleting') : t('superAdmin.deleteOrgBtn')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Row ───────────────────────────────────────────────────────────────────────

function OrgRow({ org, onToggle, onManage, onDelete, currentOrgId }: {
    org: OrgWithStats;
    onToggle: (org: OrgWithStats) => void;
    onManage: (org: OrgWithStats) => void;
    onDelete: (org: OrgWithStats) => void;
    currentOrgId?: string;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const managingOrgId = useAppSelector(s => s.auth.managingOrgId);

    return (
        <>
            <TableRow hover sx={{ '& > *': { borderBottom: open ? 'none' : undefined } }}>
                <TableCell sx={{ width: 36, px: 1 }}>
                    <IconButton size="small" onClick={() => setOpen(!open)}>
                        {open ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                    </IconButton>
                </TableCell>

                <TableCell>
                    <Stack direction="row" alignItems="center" gap={1.5}>
                        <Box sx={{
                            width: 34, height: 34, borderRadius: 2, flexShrink: 0,
                            bgcolor: alpha('#6C63FF', 0.15),
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: 'primary.main',
                        }}>
                            <Business fontSize="small" />
                        </Box>
                        <Box>
                            <Typography variant="body2" fontWeight={700}>{org.name}</Typography>
                            <Typography variant="caption" color="text.secondary">{org.slug}</Typography>
                        </Box>
                    </Stack>
                </TableCell>

                <TableCell>
                    <Chip
                        size="small"
                        label={org.isActive ? 'Active' : 'Inactive'}
                        color={org.isActive ? 'success' : 'default'}
                        icon={org.isActive
                            ? <CheckCircle sx={{ fontSize: '12px !important' }} />
                            : <Cancel sx={{ fontSize: '12px !important' }} />
                        }
                    />
                </TableCell>

                <TableCell>
                    <Stack direction="row" gap={0.75} flexWrap="wrap">
                        <StatChip icon={<People fontSize="inherit" />} value={`${org.activeUsers}/${org.totalUsers}`} color="#6C63FF" />
                        <StatChip icon={<Tv fontSize="inherit" />} value={`${org.onlineDevices}/${org.totalDevices}`} color="#4CAF82" />
                        <StatChip icon={<PermMedia fontSize="inherit" />} value={org.totalMedia} color="#FF9800" />
                        <StatChip icon={<QueueMusic fontSize="inherit" />} value={org.totalPlaylists} color="#2196F3" />
                        <StatChip icon={<CalendarMonth fontSize="inherit" />} value={org.totalSchedules} color="#E91E63" />
                    </Stack>
                </TableCell>

                <TableCell>
                    <Stack direction="row" alignItems="center" gap={0.5}>
                        <Storage sx={{ fontSize: 14, color: 'text.disabled' }} />
                        <Typography variant="caption" color="text.secondary">
                            {fmtBytes(org.totalMediaSizeBytes)}
                        </Typography>
                    </Stack>
                </TableCell>

                <TableCell>
                    <Typography variant="caption" color="text.secondary">
                        {fmtDate(org.createdAt)}
                    </Typography>
                </TableCell>

                <TableCell align="right">
                    <Stack direction="row" alignItems="center" gap={0.5} justifyContent="flex-end">
                        <Button
                            size="small"
                            variant={managingOrgId === org.id ? 'contained' : 'outlined'}
                            color="primary"
                            startIcon={<ManageAccounts fontSize="small" />}
                            onClick={() => onManage(org)}
                            disabled={!org.isActive && org.id !== currentOrgId}
                            sx={{ fontSize: '0.72rem' }}
                        >
                            {managingOrgId === org.id ? t('superAdmin.managing') : t('superAdmin.manageOrg')}
                        </Button>

                        <Tooltip title={org.id === currentOrgId ? t('superAdmin.cantDeactivateOwn') : org.isActive ? t('superAdmin.deactivateOrgTooltip') : t('superAdmin.activateOrgTooltip')}>
                            <span>
                                <IconButton
                                    size="small"
                                    color={org.isActive ? 'error' : 'success'}
                                    onClick={() => onToggle(org)}
                                    disabled={org.id === currentOrgId}
                                >
                                    <PowerSettingsNew fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={org.id === currentOrgId ? t('superAdmin.cantDeleteOwn') : t('superAdmin.deleteOrgTooltip')}>
                            <span>
                                <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => onDelete(org)}
                                    disabled={org.id === currentOrgId}
                                >
                                    <DeleteForever fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                </TableCell>
            </TableRow>

            {/* Expanded detail */}
            <TableRow>
                <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                    <Collapse in={open} unmountOnExit>
                        <DetailRow org={org} />
                        <Divider />
                    </Collapse>
                </TableCell>
            </TableRow>
        </>
    );
}

// ── Platform Admins section ───────────────────────────────────────────────────

function CreatePlatformAdminDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const dispatch = useAppDispatch();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);

    const mutation = useMutation({
        mutationFn: () => platformAuthApi.createAdmin({ name: name.trim(), email: email.trim(), password }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['platform-admins'] });
            dispatch(pushToast({ severity: 'success', message: `Đã tạo platform admin "${name.trim()}"` }));
            onClose();
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') }));
        },
    });

    const canSubmit = name.trim().length >= 2 && email.includes('@') && password.length >= 8 && !mutation.isPending;

    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <AdminPanelSettings color="error" />
                    {t('superAdmin.addPlatformAdminTitle')}
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField label={t('common.name')} value={name} onChange={e => setName(e.target.value)} fullWidth autoFocus size="small" required />
                    <TextField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} fullWidth size="small" required />
                    <TextField
                        label={t('auth.password')} type={showPw ? 'text' : 'password'}
                        value={password} onChange={e => setPassword(e.target.value)}
                        fullWidth size="small" required
                        helperText={t('superAdmin.pwMin8Helper')}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setShowPw(!showPw)} edge="end">
                                        {showPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} size="small">{t('common.cancel')}</Button>
                <Button color="error" size="small" disabled={!canSubmit} onClick={() => mutation.mutate()} startIcon={<Add />}>
                    {mutation.isPending ? t('common.creating') : t('common.create')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function ChangePasswordDialog({ admin, onClose }: { admin: PlatformAdmin; onClose: () => void }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [pw, setPw] = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow] = useState(false);

    const mutation = useMutation({
        mutationFn: () => platformAuthApi.updateAdmin(admin.id, { password: pw }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['platform-admins'] });
            dispatch(pushToast({ severity: 'success', message: `Đã đổi mật khẩu "${admin.name}"` }));
            onClose();
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') })),
    });

    const valid = pw.length >= 8 && pw === confirm;

    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Lock color="warning" />
                    {t('superAdmin.changePwTitle', { name: admin.name })}
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField
                        label={t('superAdmin.newPasswordLabel')} type={show ? 'text' : 'password'}
                        value={pw} onChange={e => setPw(e.target.value)}
                        fullWidth size="small" autoFocus helperText={t('superAdmin.pwMin8Helper')}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setShow(s => !s)} edge="end">
                                        {show ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />
                    <TextField
                        label={t('superAdmin.repeatPasswordLabel')} type={show ? 'text' : 'password'}
                        value={confirm} onChange={e => setConfirm(e.target.value)}
                        fullWidth size="small"
                        error={confirm.length > 0 && pw !== confirm}
                        helperText={confirm.length > 0 && pw !== confirm ? t('superAdmin.passwordMismatch') : ''}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} size="small">{t('common.cancel')}</Button>
                <Button color="warning" size="small"
                    disabled={!valid || mutation.isPending}
                    onClick={() => mutation.mutate()}>
                    {mutation.isPending ? t('common.saving') : t('superAdmin.changePwBtn')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function PlatformAdminsSection({ currentAdminId }: { currentAdminId?: string }) {
    const { t } = useTranslation();
    const qc = useQueryClient();
    const dispatch = useAppDispatch();
    const [createOpen, setCreateOpen] = useState(false);
    const [changePwTarget, setChangePwTarget] = useState<PlatformAdmin | null>(null);

    const { data: admins = [], isLoading } = useQuery({
        queryKey: ['platform-admins'],
        queryFn: platformAuthApi.listAdmins,
        staleTime: 60_000,
    });

    const currentAdmin = admins.find(a => a.id === currentAdminId);
    const iCurrentRoot = currentAdmin?.isRoot ?? false;

    const toggleMutation = useMutation({
        mutationFn: (admin: PlatformAdmin) => platformAuthApi.updateAdmin(admin.id, { isActive: !admin.isActive }),
        onSuccess: (_, admin) => {
            qc.invalidateQueries({ queryKey: ['platform-admins'] });
            dispatch(pushToast({ severity: 'success', message: `${admin.isActive ? t('superAdmin.actionOff') : t('superAdmin.actionOn')}: "${admin.name}"` }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') }));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => platformAuthApi.deleteAdmin(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['platform-admins'] });
            dispatch(pushToast({ severity: 'success', message: t('common.delete') }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') }));
        },
    });

    const canChangePassword = (target: PlatformAdmin) => {
        if (target.id === currentAdminId) return true;          // can change own password
        if (target.isRoot) return false;                         // cannot change root's password
        return true;                                             // can change others' password
    };

    const canToggleActive = (target: PlatformAdmin) =>
        target.id !== currentAdminId && !target.isRoot;

    const canDelete = (target: PlatformAdmin) =>
        target.id !== currentAdminId && !target.isRoot;

    return (
        <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
                <Stack direction="row" alignItems="center" gap={1.5}>
                    <AdminPanelSettings sx={{ color: 'error.main' }} />
                    <Box>
                        <Typography variant="h6" fontWeight={700}>Platform Admins</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {t('superAdmin.platformAdminsDesc')}
                        </Typography>
                    </Box>
                </Stack>
                <Button variant="outlined" color="error" size="small" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                    {t('common.add')}
                </Button>
            </Stack>

            <Card>
                <TableContainer component={Paper} elevation={0}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>{t('common.name')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('common.status')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('users.lastLogin')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('common.createdAt')}</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading
                                ? [...Array(2)].map((_, i) => (
                                    <TableRow key={i}>
                                        {[...Array(6)].map((__, j) => <TableCell key={j}><Skeleton height={28} /></TableCell>)}
                                    </TableRow>
                                ))
                                : admins.length === 0
                                    ? (
                                        <TableRow>
                                            <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">{t('superAdmin.noPlatformAdmins')}</Typography>
                                            </TableCell>
                                        </TableRow>
                                    )
                                    : admins.map(admin => (
                                        <TableRow key={admin.id} hover
                                            sx={{ bgcolor: admin.isRoot ? alpha('#c0392b', 0.04) : undefined }}>
                                            <TableCell>
                                                <Stack direction="row" alignItems="center" gap={1}>
                                                    <Box sx={{
                                                        width: 30, height: 30, borderRadius: 2, flexShrink: 0,
                                                        bgcolor: admin.isRoot ? alpha('#c0392b', 0.18) : alpha('#c0392b', 0.10),
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: 'error.main', fontSize: 13, fontWeight: 700,
                                                    }}>
                                                        {admin.isRoot
                                                            ? <Shield sx={{ fontSize: 16 }} />
                                                            : admin.name[0]?.toUpperCase()
                                                        }
                                                    </Box>
                                                    <Typography variant="body2" fontWeight={600}>{admin.name}</Typography>
                                                    {admin.isRoot && (
                                                        <Chip label="Root" size="small" color="error" variant="filled"
                                                            sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }} />
                                                    )}
                                                    {admin.id === currentAdminId && (
                                                        <Chip label={t('common.you')} size="small" color="default"
                                                            sx={{ height: 18, fontSize: '0.62rem' }} />
                                                    )}
                                                </Stack>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">{admin.email}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={admin.isRoot ? 'Root · Active' : admin.isActive ? 'Active' : 'Inactive'}
                                                    color={admin.isActive ? 'success' : 'default'}
                                                    icon={admin.isActive
                                                        ? <CheckCircle sx={{ fontSize: '12px !important' }} />
                                                        : <Cancel sx={{ fontSize: '12px !important' }} />}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption" color="text.secondary">
                                                    {admin.lastLoginAt ? fmtDate(admin.lastLoginAt) : '—'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="caption" color="text.secondary">{fmtDate(admin.createdAt)}</Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" gap={0.5} justifyContent="flex-end">
                                                    {/* Change password */}
                                                    <Tooltip title={
                                                        !canChangePassword(admin)
                                                            ? t('superAdmin.cantChangePwRoot')
                                                            : t('superAdmin.changePwTooltip')
                                                    }>
                                                        <span>
                                                            <IconButton size="small" color="warning"
                                                                disabled={!canChangePassword(admin)}
                                                                onClick={() => setChangePwTarget(admin)}>
                                                                <Lock fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    {/* Toggle active */}
                                                    <Tooltip title={
                                                        admin.isRoot ? t('superAdmin.rootCantDeactivate') :
                                                        admin.id === currentAdminId ? t('superAdmin.cantDeactivateSelf') :
                                                        admin.isActive ? t('superAdmin.actionOff') : t('superAdmin.actionOn')
                                                    }>
                                                        <span>
                                                            <IconButton size="small"
                                                                color={admin.isActive ? 'error' : 'success'}
                                                                onClick={() => toggleMutation.mutate(admin)}
                                                                disabled={!canToggleActive(admin)}>
                                                                {admin.isActive ? <Block fontSize="small" /> : <CheckCircleOutline fontSize="small" />}
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    {/* Delete */}
                                                    <Tooltip title={
                                                        admin.isRoot ? t('superAdmin.rootCantDelete') :
                                                        admin.id === currentAdminId ? t('superAdmin.cantDeleteSelf') :
                                                        t('common.delete')
                                                    }>
                                                        <span>
                                                            <IconButton size="small" color="error"
                                                                onClick={() => {
                                                                    if (!window.confirm(`${t('common.delete')} admin "${admin.name}"?`)) return;
                                                                    deleteMutation.mutate(admin.id);
                                                                }}
                                                                disabled={!canDelete(admin) || deleteMutation.isPending}>
                                                                <DeleteForever fontSize="small" />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))
                            }
                        </TableBody>
                    </Table>
                </TableContainer>
            </Card>

            {createOpen && <CreatePlatformAdminDialog onClose={() => setCreateOpen(false)} />}
            {changePwTarget && <ChangePasswordDialog admin={changePwTarget} onClose={() => setChangePwTarget(null)} />}
        </Box>
    );
}

// ── Version Manager ───────────────────────────────────────────────────────────

function VersionManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
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
        onSuccess: (data) => setOtaMsg(t('superAdmin.pushOtaTooltip') + `: ${data.pushed}`),
    });

    const latest = versions.find(v => v.isLatest);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle fontWeight={700}>{t('superAdmin.versionManagerTitle')}</DialogTitle>
            <DialogContent dividers>
                {otaMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setOtaMsg('')}>{otaMsg}</Alert>}

                {latest && (
                    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            {t('superAdmin.latestVersion')} <strong>{latest.versionName}</strong>
                        </Typography>
                        <Button
                            size="small" startIcon={<Send />}
                            disabled={pushAllMut.isPending}
                            onClick={() => pushAllMut.mutate(latest.id)}
                        >
                            {t('superAdmin.updateAllOutdated')}
                        </Button>
                    </Box>
                )}

                {isLoading ? <CircularProgress size={24} /> : (
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('devices.appVersion')}</TableCell>
                                <TableCell>Code</TableCell>
                                <TableCell>{t('common.note')}</TableCell>
                                <TableCell>{t('common.createdAt')}</TableCell>
                                <TableCell align="center">Latest</TableCell>
                                <TableCell align="center">OTA All</TableCell>
                                <TableCell align="center">{t('common.delete')}</TableCell>
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
                                    <TableCell>{v.createdAt ? new Date(v.createdAt).toLocaleString('vi-VN', { hour12: false }) : '—'}</TableCell>
                                    <TableCell align="center">
                                        <Tooltip title={v.isLatest ? t('superAdmin.alreadyLatest') : t('superAdmin.setLatestTooltip')}>
                                            <span>
                                                <IconButton size="small" disabled={v.isLatest || setLatestMut.isPending}
                                                    onClick={() => setLatestMut.mutate(v.id)}>
                                                    {v.isLatest ? <Star color="warning" /> : <StarBorder />}
                                                </IconButton>
                                            </span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title={t('superAdmin.pushOtaTooltip')}>
                                            <IconButton size="small" disabled={pushAllMut.isPending} onClick={() => pushAllMut.mutate(v.id)}>
                                                <Send fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Tooltip title={v.organizationId === null ? t('superAdmin.globalVersionCantDelete') : t('common.delete')}>
                                            <span>
                                                <IconButton size="small" color="error"
                                                    disabled={v.organizationId === null || deleteMut.isPending}
                                                    onClick={() => deleteMut.mutate(v.id)}>
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
                        <Typography variant="subtitle2">{t('superAdmin.addVersionSubtitle')}</Typography>
                        <Stack direction="row" gap={1}>
                            <TextField label={t('superAdmin.versionNameLabel')} size="small" required
                                value={form.versionName}
                                onChange={e => setForm(f => ({ ...f, versionName: e.target.value }))} />
                            <TextField label="Version code" size="small" type="number" required
                                value={form.versionCode}
                                onChange={e => setForm(f => ({ ...f, versionCode: e.target.value }))} />
                        </Stack>
                        <TextField label="Download URL" size="small" required fullWidth
                            value={form.downloadUrl}
                            onChange={e => setForm(f => ({ ...f, downloadUrl: e.target.value }))} />
                        <TextField label="Release notes" size="small" multiline rows={2} fullWidth
                            value={form.releaseNotes}
                            onChange={e => setForm(f => ({ ...f, releaseNotes: e.target.value }))} />
                        <Stack direction="row" gap={1}>
                            <Button size="small"
                                disabled={!form.versionName || !form.versionCode || !form.downloadUrl || createMut.isPending}
                                onClick={() => createMut.mutate({
                                    versionName: form.versionName,
                                    versionCode: Number(form.versionCode),
                                    downloadUrl: form.downloadUrl,
                                    releaseNotes: form.releaseNotes || undefined,
                                    isLatest: form.isLatest,
                                })}>
                                {t('common.save')}
                            </Button>
                            <Button size="small" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
                        </Stack>
                    </Stack>
                ) : (
                    <Button startIcon={<Add />} size="small" onClick={() => setAdding(true)}>
                        {t('superAdmin.addVersionBtn')}
                    </Button>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>{t('common.close')}</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ orgs }: { orgs: OrgWithStats[] }) {
    const { t } = useTranslation();
    const total = orgs.length;
    const active = orgs.filter(o => o.isActive).length;
    const totalUsers = orgs.reduce((s, o) => s + o.totalUsers, 0);
    const totalDevices = orgs.reduce((s, o) => s + o.totalDevices, 0);
    const totalMedia = orgs.reduce((s, o) => s + o.totalMedia, 0);
    const totalBytes = orgs.reduce((s, o) => s + o.totalMediaSizeBytes, 0);

    const cards = [
        { label: t('superAdmin.organizations'), value: `${active} / ${total}`, sub: t('superAdmin.cardActiveTotalSub'), icon: <Business />, color: '#6C63FF' },
        { label: 'Users', value: totalUsers, sub: t('superAdmin.cardSystemwideSub'), icon: <People />, color: '#4CAF82' },
        { label: 'Devices', value: totalDevices, sub: t('superAdmin.cardSystemwideSub'), icon: <Tv />, color: '#FF9800' },
        { label: 'Media', value: totalMedia, sub: fmtBytes(totalBytes), icon: <PermMedia />, color: '#2196F3' },
    ];

    return (
        <Stack direction="row" gap={2} flexWrap="wrap">
            {cards.map(c => (
                <Card key={c.label} sx={{ flex: '1 1 160px', minWidth: 160 }}>
                    <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                        <Stack direction="row" alignItems="center" gap={1.5}>
                            <Box sx={{
                                width: 38, height: 38, borderRadius: 2, flexShrink: 0,
                                bgcolor: alpha(c.color, 0.15),
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: c.color,
                            }}>
                                {c.icon}
                            </Box>
                            <Box>
                                <Typography variant="h6" fontWeight={700} lineHeight={1}>{c.value}</Typography>
                                <Typography variant="caption" color="text.secondary">{c.label}</Typography>
                                <Typography variant="caption" color="text.disabled" display="block">{c.sub}</Typography>
                            </Box>
                        </Stack>
                    </CardContent>
                </Card>
            ))}
        </Stack>
    );
}

// ── Mail Config Dialog ────────────────────────────────────────────────────────

const EMPTY_SMTP_FORM: MailConfigPayload = {
    name: '', host: '', port: 587, secure: false,
    username: '', password: '', fromName: '', fromAddress: '',
};
const EMPTY_TMPL_FORM: MailTemplatePayload = { name: '', subject: '', bodyHtml: '', description: '' };

// ── SMTP Tab ───────────────────────────────────────────────────────────────────

function SmtpTab({ open }: { open: boolean }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [editing, setEditing] = useState<MailConfig | null>(null);
    const [form, setForm] = useState<MailConfigPayload>(EMPTY_SMTP_FORM);
    const [showPass, setShowPass] = useState(false);
    const [formOpen, setFormOpen] = useState(false);

    const { data: configs = [], isLoading } = useQuery({
        queryKey: ['mail-configs'],
        queryFn: mailConfigApi.list,
        enabled: open,
    });

    const set = (k: keyof MailConfigPayload, v: unknown) => setForm(f => ({ ...f, [k]: v }));
    const openCreate = () => { setEditing(null); setForm(EMPTY_SMTP_FORM); setShowPass(false); setFormOpen(true); };
    const openEdit = (c: MailConfig) => {
        setEditing(c);
        setForm({ name: c.name, host: c.host, port: c.port, secure: c.secure, username: c.username, password: '', fromName: c.fromName, fromAddress: c.fromAddress });
        setShowPass(false);
        setFormOpen(true);
    };

    const saveMutation = useMutation({
        mutationFn: () => editing
            ? mailConfigApi.update(editing.id, form.password ? form : { ...form, password: undefined })
            : mailConfigApi.create(form),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['mail-configs'] });
            dispatch(pushToast({ severity: 'success', message: editing ? t('common.save') : t('superAdmin.addSmtp') }));
            setFormOpen(false);
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? t('common.failedAction') })),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => mailConfigApi.delete(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['mail-configs'] }); dispatch(pushToast({ severity: 'success', message: t('common.delete') })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? t('common.failedAction') })),
    });

    const activateMutation = useMutation({
        mutationFn: (id: string) => mailConfigApi.activate(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['mail-configs'] }); dispatch(pushToast({ severity: 'success', message: t('superAdmin.activateTooltip') })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? t('common.failedAction') })),
    });

    const canSave = form.name && form.host && form.port && form.username && form.fromAddress && (editing || form.password);

    return (
        <>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="small" startIcon={<Add />} onClick={openCreate} variant="outlined">{t('superAdmin.addSmtp')}</Button>
            </Box>
            {isLoading ? (
                <Box px={2}>{[1,2].map(i => <Skeleton key={i} height={56} sx={{ mb: 1 }} />)}</Box>
            ) : configs.length === 0 ? (
                <Box textAlign="center" py={6}>
                    <Email sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">{t('superAdmin.noSmtpConfigs')}</Typography>
                </Box>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>{t('common.name')}</TableCell>
                            <TableCell>Host / Port</TableCell>
                            <TableCell>Username</TableCell>
                            <TableCell>From</TableCell>
                            <TableCell>{t('common.status')}</TableCell>
                            <TableCell align="right" />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {configs.map(c => (
                            <TableRow key={c.id} hover sx={{ bgcolor: c.isActive ? 'action.selected' : undefined }}>
                                <TableCell>
                                    <Typography variant="body2" fontWeight={600}>{c.name}</Typography>
                                    <Typography variant="caption" color="text.secondary">{c.secure ? 'SSL/TLS' : 'STARTTLS'}</Typography>
                                </TableCell>
                                <TableCell><Typography variant="body2" fontFamily="monospace">{c.host}:{c.port}</Typography></TableCell>
                                <TableCell><Typography variant="body2">{c.username}</Typography></TableCell>
                                <TableCell>
                                    <Typography variant="body2">{c.fromName}</Typography>
                                    <Typography variant="caption" color="text.secondary">{c.fromAddress}</Typography>
                                </TableCell>
                                <TableCell>
                                    {c.isActive
                                        ? <Chip size="small" icon={<CheckCircle sx={{ fontSize: '14px !important' }} />} label={t('superAdmin.smtpInUse')} color="success" />
                                        : <Chip size="small" label={t('superAdmin.smtpNotInUse')} variant="outlined" color="default" />}
                                </TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                                        {!c.isActive && (
                                            <Tooltip title={t('superAdmin.activateTooltip')}>
                                                <IconButton size="small" color="success" onClick={() => activateMutation.mutate(c.id)} disabled={activateMutation.isPending}>
                                                    <CheckCircleOutlined fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        <Tooltip title={t('common.edit')}>
                                            <IconButton size="small" onClick={() => openEdit(c)}><Edit fontSize="small" /></IconButton>
                                        </Tooltip>
                                        {!c.isActive && (
                                            <Tooltip title={t('common.delete')}>
                                                <IconButton size="small" color="error" onClick={() => deleteMutation.mutate(c.id)} disabled={deleteMutation.isPending}>
                                                    <Delete fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle fontWeight={700}>{editing ? t('superAdmin.editSmtpTitle') : t('superAdmin.addSmtpTitle')}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} pt={0.5}>
                        <TextField size="small" label={t('superAdmin.configNameLabel')} value={form.name} onChange={e => set('name', e.target.value)} fullWidth autoFocus />
                        <Stack direction="row" gap={2}>
                            <TextField size="small" label="SMTP Host *" value={form.host} onChange={e => set('host', e.target.value)} fullWidth />
                            <TextField size="small" label="Port *" type="number" value={form.port} onChange={e => set('port', Number(e.target.value))} sx={{ width: 120 }} />
                        </Stack>
                        <Stack direction="row" gap={2} alignItems="center">
                            <Typography variant="body2" color="text.secondary">{t('superAdmin.protocolLabel')}</Typography>
                            {(['STARTTLS (587)', 'SSL/TLS (465)'] as const).map((label, i) => (
                                <Chip key={label} label={label} size="small"
                                    color={form.secure === (i === 1) ? 'primary' : 'default'}
                                    variant={form.secure === (i === 1) ? 'filled' : 'outlined'}
                                    onClick={() => set('secure', i === 1)} sx={{ cursor: 'pointer' }} />
                            ))}
                        </Stack>
                        <TextField size="small" label="Username *" value={form.username} onChange={e => set('username', e.target.value)} fullWidth />
                        <TextField size="small"
                            label={editing ? t('superAdmin.passwordEditLabel') : t('superAdmin.passwordReqLabel')}
                            type={showPass ? 'text' : 'password'}
                            value={form.password} onChange={e => set('password', e.target.value)} fullWidth
                            InputProps={{ endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setShowPass(v => !v)}>
                                        {showPass ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                    </IconButton>
                                </InputAdornment>
                            )}} />
                        <Divider />
                        <TextField size="small" label={t('superAdmin.fromNameLabel')} value={form.fromName} onChange={e => set('fromName', e.target.value)} fullWidth />
                        <TextField size="small" label={t('superAdmin.fromAddressLabel')} type="email" value={form.fromAddress} onChange={e => set('fromAddress', e.target.value)} fullWidth />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
                    <Button size="small" variant="contained" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                        {saveMutation.isPending ? <CircularProgress size={16} /> : editing ? t('common.save') : t('common.create')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ── Templates Tab ──────────────────────────────────────────────────────────────

function TemplatesTab({ open }: { open: boolean }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [editing, setEditing] = useState<MailTemplate | null>(null);
    const [form, setForm] = useState<MailTemplatePayload>(EMPTY_TMPL_FORM);
    const [formOpen, setFormOpen] = useState(false);

    const { data: templates = [], isLoading } = useQuery({
        queryKey: ['mail-templates'],
        queryFn: mailTemplateApi.list,
        enabled: open,
    });

    const set = (k: keyof MailTemplatePayload, v: string) => setForm(f => ({ ...f, [k]: v }));
    const openCreate = () => { setEditing(null); setForm(EMPTY_TMPL_FORM); setFormOpen(true); };
    const openEdit = (tmpl: MailTemplate) => {
        setEditing(tmpl);
        setForm({ name: tmpl.name, subject: tmpl.subject, bodyHtml: tmpl.bodyHtml, description: tmpl.description ?? '' });
        setFormOpen(true);
    };

    const saveMutation = useMutation({
        mutationFn: () => editing ? mailTemplateApi.update(editing.id, form) : mailTemplateApi.create(form),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['mail-templates'] });
            dispatch(pushToast({ severity: 'success', message: editing ? t('common.save') : t('superAdmin.addTemplate') }));
            setFormOpen(false);
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? t('common.failedAction') })),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => mailTemplateApi.delete(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['mail-templates'] }); dispatch(pushToast({ severity: 'success', message: t('common.delete') })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? t('common.failedAction') })),
    });

    const canSave = form.name.trim() && form.subject.trim() && form.bodyHtml.trim();

    // Known variables for reference
    const allVars = ['{{recipientName}}', '{{deviceName}}', '{{siteName}}', '{{orgName}}', '{{offlineAt}}', '{{errorAt}}', '{{expiresAt}}', '{{email}}', '{{role}}', '{{deviceCount}}'];

    return (
        <>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="small" startIcon={<Add />} onClick={openCreate} variant="outlined">{t('superAdmin.addTemplate')}</Button>
            </Box>
            {isLoading ? (
                <Box px={2}>{[1,2].map(i => <Skeleton key={i} height={56} sx={{ mb: 1 }} />)}</Box>
            ) : templates.length === 0 ? (
                <Box textAlign="center" py={6}>
                    <Email sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">{t('superAdmin.noTemplates')}</Typography>
                </Box>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>{t('common.name')}</TableCell>
                            <TableCell>Subject</TableCell>
                            <TableCell>{t('common.description')}</TableCell>
                            <TableCell align="right" />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {templates.map(tmpl => (
                            <TableRow key={tmpl.id} hover>
                                <TableCell><Typography variant="body2" fontWeight={600}>{tmpl.name}</Typography></TableCell>
                                <TableCell><Typography variant="body2">{tmpl.subject}</Typography></TableCell>
                                <TableCell><Typography variant="body2" color="text.secondary">{tmpl.description ?? '—'}</Typography></TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                                        <Tooltip title={t('common.edit')}>
                                            <IconButton size="small" onClick={() => openEdit(tmpl)}><Edit fontSize="small" /></IconButton>
                                        </Tooltip>
                                        <Tooltip title={t('common.delete')}>
                                            <IconButton size="small" color="error" onClick={() => deleteMutation.mutate(tmpl.id)} disabled={deleteMutation.isPending}>
                                                <Delete fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    </Stack>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="md" fullWidth>
                <DialogTitle fontWeight={700}>{editing ? t('superAdmin.editTemplateTitle') : t('superAdmin.addTemplateTitle')}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} pt={0.5}>
                        <Stack direction="row" gap={2}>
                            <TextField size="small" label={t('superAdmin.templateNameLabel')} value={form.name} onChange={e => set('name', e.target.value)} fullWidth autoFocus />
                            <TextField size="small" label={t('common.description')} value={form.description} onChange={e => set('description', e.target.value)} fullWidth />
                        </Stack>
                        <TextField size="small" label="Subject *" value={form.subject} onChange={e => set('subject', e.target.value)} fullWidth />
                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                {t('superAdmin.templateVarsLabel')}
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" gap={0.5} mb={1}>
                                {allVars.map(v => (
                                    <Chip key={v} label={v} size="small" variant="outlined"
                                        onClick={() => set('bodyHtml', (form.bodyHtml ?? '') + v)}
                                        sx={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem' }} />
                                ))}
                            </Stack>
                            <TextField
                                label={t('superAdmin.bodyHtmlLabel')}
                                value={form.bodyHtml}
                                onChange={e => set('bodyHtml', e.target.value)}
                                fullWidth multiline minRows={10} maxRows={20}
                                inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                            />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setFormOpen(false)}>{t('common.cancel')}</Button>
                    <Button size="small" variant="contained" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                        {saveMutation.isPending ? <CircularProgress size={16} /> : editing ? t('common.save') : t('common.create')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ── Mail Settings Tab ─────────────────────────────────────────────────────────

function MailSettingsTab({ open }: { open: boolean }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['mail-settings'],
        queryFn: mailSettingsApi.list,
        enabled: open,
    });
    const { data: templates = [] } = useQuery({
        queryKey: ['mail-templates'],
        queryFn: mailTemplateApi.list,
        enabled: open,
    });
    const { data: configs = [] } = useQuery({
        queryKey: ['mail-configs'],
        queryFn: mailConfigApi.list,
        enabled: open,
    });

    const settings: MailSetting[] = data?.data ?? [];
    const eventTypes: EventTypeInfo[] = data?.eventTypes ?? [];

    const updateMutation = useMutation({
        mutationFn: ({ eventType, payload }: { eventType: string; payload: Parameters<typeof mailSettingsApi.update>[1] }) =>
            mailSettingsApi.update(eventType, payload),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['mail-settings'] }); dispatch(pushToast({ severity: 'success', message: t('common.save') })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? t('common.failedAction') })),
    });

    const settingMap = new Map(settings.map(s => [s.eventType, s]));

    if (isLoading) return <Box p={2}>{[1,2,3,4].map(i => <Skeleton key={i} height={72} sx={{ mb: 1 }} />)}</Box>;

    return (
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Event</TableCell>
                    <TableCell>Template</TableCell>
                    <TableCell>SMTP</TableCell>
                    <TableCell align="center">{t('common.enabled')}</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {eventTypes.map(et => {
                    const s = settingMap.get(et.key);
                    if (!s) return null;
                    return (
                        <TableRow key={et.key} hover>
                            <TableCell>
                                <Typography variant="body2" fontWeight={600}>{et.label}</Typography>
                                <Typography variant="caption" color="text.secondary">{et.description}</Typography>
                            </TableCell>
                            <TableCell sx={{ minWidth: 200 }}>
                                <FormControl size="small" fullWidth>
                                    <InputLabel>Template</InputLabel>
                                    <Select
                                        label="Template"
                                        value={s.templateId ?? ''}
                                        onChange={e => updateMutation.mutate({ eventType: et.key, payload: { templateId: e.target.value || null } })}
                                    >
                                        <MenuItem value=""><em>—</em></MenuItem>
                                        {templates.map(tmpl => <MenuItem key={tmpl.id} value={tmpl.id}>{tmpl.name}</MenuItem>)}
                                    </Select>
                                </FormControl>
                                {s.templateId && (
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                        Variables: {eventTypes.find(e => e.key === et.key)?.variables.join(', ')}
                                    </Typography>
                                )}
                            </TableCell>
                            <TableCell sx={{ minWidth: 200 }}>
                                <FormControl size="small" fullWidth>
                                    <InputLabel>SMTP</InputLabel>
                                    <Select
                                        label="SMTP"
                                        value={s.mailConfigId ?? ''}
                                        onChange={e => updateMutation.mutate({ eventType: et.key, payload: { mailConfigId: e.target.value || null } })}
                                    >
                                        <MenuItem value=""><em>{t('superAdmin.smtpDefault')}</em></MenuItem>
                                        {configs.map(c => (
                                            <MenuItem key={c.id} value={c.id}>
                                                {c.name} {c.isActive ? '(active)' : ''}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </TableCell>
                            <TableCell align="center">
                                <Switch
                                    size="small"
                                    checked={s.isEnabled}
                                    onChange={e => updateMutation.mutate({ eventType: et.key, payload: { isEnabled: e.target.checked } })}
                                    disabled={updateMutation.isPending}
                                />
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

// ── Test Mail Tab ─────────────────────────────────────────────────────────────

function TestMailTab({ open }: { open: boolean }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const [to, setTo] = useState('');
    const [configId, setConfigId] = useState('');

    const { data: configs = [] } = useQuery({
        queryKey: ['mail-configs'],
        queryFn: mailConfigApi.list,
        enabled: open,
    });

    const sendMutation = useMutation({
        mutationFn: () => mailConfigApi.testMail(to.trim(), configId || undefined),
        onSuccess: (res) => dispatch(pushToast({ severity: 'success', message: res.message ?? t('superAdmin.sendTestBtn') })),
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? t('common.failedAction') })),
    });

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

    return (
        <Box sx={{ p: 3, maxWidth: 480 }}>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>{t('superAdmin.testMailTitle')}</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
                {t('superAdmin.testMailDesc')}
            </Typography>
            <Stack spacing={2}>
                <TextField
                    size="small"
                    label={t('superAdmin.recipientEmailLabel')}
                    type="email"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    placeholder="example@company.com"
                    fullWidth
                    autoFocus
                    error={to.length > 0 && !isValidEmail}
                    helperText={to.length > 0 && !isValidEmail ? t('superAdmin.emailInvalid') : ''}
                />
                <FormControl size="small" fullWidth>
                    <InputLabel>{t('superAdmin.smtpConfigLabel')}</InputLabel>
                    <Select
                        label={t('superAdmin.smtpConfigLabel')}
                        value={configId}
                        onChange={e => setConfigId(e.target.value)}
                    >
                        <MenuItem value=""><em>{t('superAdmin.useActiveSmtp')}</em></MenuItem>
                        {configs.map(c => (
                            <MenuItem key={c.id} value={c.id}>
                                {c.name}
                                {c.isActive && <Chip size="small" label="active" color="success" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <Button
                    variant="contained"
                    startIcon={sendMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <Send />}
                    disabled={!isValidEmail || sendMutation.isPending}
                    onClick={() => sendMutation.mutate()}
                    sx={{ alignSelf: 'flex-start' }}
                >
                    {sendMutation.isPending ? t('common.sending') : t('superAdmin.sendTestBtn')}
                </Button>
            </Stack>
        </Box>
    );
}

// ── Auto Config Tab ───────────────────────────────────────────────────────────

const EVENT_TRIGGER_META: Record<string, {
    icon: React.ReactNode;
    color: string;
    hasDelay: boolean;
    hasCooldown: boolean;
    hasAdvanceDays: boolean;
    delayLabel: string;
}> = {
    DEVICE_OFFLINE: {
        icon: <span>📵</span>,
        color: '#f44336',
        hasDelay: true,
        hasCooldown: true,
        hasAdvanceDays: false,
        delayLabel: '',
    },
    DEVICE_ERROR: {
        icon: <span>⚠️</span>,
        color: '#ff9800',
        hasDelay: false,
        hasCooldown: true,
        hasAdvanceDays: false,
        delayLabel: '',
    },
    LICENSE_EXPIRY: {
        icon: <span>🔑</span>,
        color: '#9c27b0',
        hasDelay: false,
        hasCooldown: false,
        hasAdvanceDays: true,
        delayLabel: '',
    },
    USER_WELCOME: {
        icon: <span>👋</span>,
        color: '#2196f3',
        hasDelay: false,
        hasCooldown: false,
        hasAdvanceDays: false,
        delayLabel: '',
    },
};

function AutoConfigTab({ open }: { open: boolean }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['mail-settings'],
        queryFn: mailSettingsApi.list,
        enabled: open,
    });

    const settings: MailSetting[] = data?.data ?? [];
    const eventTypes: EventTypeInfo[] = data?.eventTypes ?? [];

    const updateMutation = useMutation({
        mutationFn: ({ eventType, payload }: { eventType: string; payload: Parameters<typeof mailSettingsApi.update>[1] }) =>
            mailSettingsApi.update(eventType, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['mail-settings'] });
            dispatch(pushToast({ severity: 'success', message: t('common.save') }));
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? t('common.failedAction') })),
    });

    const settingMap = new Map(settings.map(s => [s.eventType, s]));

    const [localVals, setLocalVals] = useState<Record<string, { triggerDelayMin: number; cooldownHours: number; advanceDays: number }>>({});

    // Sync localVals when data loads
    const initDone = React.useRef(false);
    if (!initDone.current && settings.length > 0) {
        initDone.current = true;
        const init: typeof localVals = {};
        for (const s of settings) {
            init[s.eventType] = {
                triggerDelayMin: s.triggerDelayMin,
                cooldownHours: s.cooldownHours,
                advanceDays: s.advanceDays,
            };
        }
        setLocalVals(init);
    }

    const commit = (eventType: string) => {
        const v = localVals[eventType];
        if (!v) return;
        updateMutation.mutate({ eventType, payload: v });
    };

    if (isLoading) return <Box p={3}>{[1, 2, 3, 4].map(i => <Skeleton key={i} height={120} sx={{ mb: 2 }} />)}</Box>;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" mb={3}>
                {t('superAdmin.autoConfigDesc')}
            </Typography>
            <Stack spacing={3}>
                {eventTypes.map(et => {
                    const s = settingMap.get(et.key);
                    const meta = EVENT_TRIGGER_META[et.key];
                    const lv = localVals[et.key] ?? { triggerDelayMin: 5, cooldownHours: 4, advanceDays: 30 };
                    if (!s || !meta) return null;

                    const hasAnyControl = meta.hasDelay || meta.hasCooldown || meta.hasAdvanceDays;

                    return (
                        <Paper key={et.key} variant="outlined" sx={{ p: 2.5, borderColor: s.isEnabled ? meta.color : undefined, opacity: s.isEnabled ? 1 : 0.6 }}>
                            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={hasAnyControl ? 2 : 0}>
                                <Box>
                                    <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
                                        <Typography fontSize="1.1rem">{meta.icon}</Typography>
                                        <Typography variant="subtitle2" fontWeight={700}>{et.label}</Typography>
                                        <Chip size="small" label={s.isEnabled ? t('superAdmin.actionOn') : t('superAdmin.actionOff')} color={s.isEnabled ? 'success' : 'default'} variant="outlined" />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">{et.description}</Typography>
                                </Box>
                            </Stack>

                            {!hasAnyControl && (
                                <Typography variant="caption" color="text.secondary" fontStyle="italic">
                                    {t('superAdmin.instantEvent')}
                                </Typography>
                            )}

                            {meta.hasDelay && (
                                <Box mb={2}>
                                    <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                                        <TextField
                                            select size="small" label={t('superAdmin.delayFieldLabel')}
                                            value={lv.triggerDelayMin}
                                            onChange={e => {
                                                const v = Number(e.target.value);
                                                setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, triggerDelayMin: v } }));
                                                updateMutation.mutate({ eventType: et.key, payload: { triggerDelayMin: v } });
                                            }}
                                            disabled={!s.isEnabled}
                                            sx={{ minWidth: 200 }}
                                        >
                                            {[0,1,2,3,5,10,15,20,30].map(v => (
                                                <MenuItem key={v} value={v}>{v === 0 ? t('superAdmin.immediately') : `${v} ${t('common.minutes')}`}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                            size="small" label={t('superAdmin.orEnterMinutes')} type="number"
                                            value={lv.triggerDelayMin}
                                            onChange={e => setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, triggerDelayMin: Math.max(0, Math.min(60, Number(e.target.value))) } }))}
                                            onBlur={() => commit(et.key)}
                                            disabled={!s.isEnabled}
                                            inputProps={{ min: 0, max: 60 }}
                                            sx={{ width: 160 }}
                                            InputProps={{ endAdornment: <InputAdornment position="end">{t('common.minutes')}</InputAdornment> }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>{t('superAdmin.delayOfflineHelp')}</Typography>
                                </Box>
                            )}

                            {meta.hasCooldown && (
                                <Box>
                                    <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                                        <TextField
                                            select size="small" label={t('superAdmin.cooldownFieldLabel')}
                                            value={lv.cooldownHours}
                                            onChange={e => {
                                                const v = Number(e.target.value);
                                                setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, cooldownHours: v } }));
                                                updateMutation.mutate({ eventType: et.key, payload: { cooldownHours: v } });
                                            }}
                                            disabled={!s.isEnabled}
                                            sx={{ minWidth: 200 }}
                                        >
                                            {[0,1,2,4,6,8,12,24].map(v => (
                                                <MenuItem key={v} value={v}>{v === 0 ? t('superAdmin.noLimit') : `${v} ${t('common.hours')}`}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                            size="small" label={t('superAdmin.orEnterHours')} type="number"
                                            value={lv.cooldownHours}
                                            onChange={e => setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, cooldownHours: Math.max(0, Math.min(168, Number(e.target.value))) } }))}
                                            onBlur={() => commit(et.key)}
                                            disabled={!s.isEnabled}
                                            inputProps={{ min: 0, max: 168 }}
                                            sx={{ width: 160 }}
                                            InputProps={{ endAdornment: <InputAdornment position="end">{t('common.hours')}</InputAdornment> }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                        {lv.cooldownHours === 0 ? t('superAdmin.cooldownHelpUnlimited') : t('superAdmin.cooldownHelp', { hours: lv.cooldownHours })}
                                    </Typography>
                                </Box>
                            )}

                            {meta.hasAdvanceDays && (
                                <Box>
                                    <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                                        <TextField
                                            select size="small" label={t('superAdmin.advanceDaysFieldLabel')}
                                            value={lv.advanceDays}
                                            onChange={e => {
                                                const v = Number(e.target.value);
                                                setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, advanceDays: v } }));
                                                updateMutation.mutate({ eventType: et.key, payload: { advanceDays: v } });
                                            }}
                                            disabled={!s.isEnabled}
                                            sx={{ minWidth: 200 }}
                                        >
                                            {[7,14,30,45,60,90].map(v => (
                                                <MenuItem key={v} value={v}>{v} {t('common.days')}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                            size="small" label={t('superAdmin.orEnterDays')} type="number"
                                            value={lv.advanceDays}
                                            onChange={e => setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, advanceDays: Math.max(1, Math.min(365, Number(e.target.value))) } }))}
                                            onBlur={() => commit(et.key)}
                                            disabled={!s.isEnabled}
                                            inputProps={{ min: 1, max: 365 }}
                                            sx={{ width: 160 }}
                                            InputProps={{ endAdornment: <InputAdornment position="end">{t('common.days')}</InputAdornment> }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                        {t('superAdmin.advanceDaysHelp', { days: lv.advanceDays })}
                                    </Typography>
                                </Box>
                            )}
                        </Paper>
                    );
                })}
            </Stack>
        </Box>
    );
}

// ── MailConfigDialog (tabbed) ─────────────────────────────────────────────────

function MailConfigDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState(0);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Email color="primary" />
                    {t('superAdmin.mailConfigTitle')}
                </Stack>
            </DialogTitle>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                    <Tab label="SMTP" />
                    <Tab label="Templates" />
                    <Tab label={t('superAdmin.mailTabSendSettings')} />
                    <Tab label={t('superAdmin.mailTabAuto')} />
                    <Tab label={t('superAdmin.mailTabTestMail')} />
                </Tabs>
            </Box>
            <DialogContent dividers sx={{ p: 0, minHeight: 400 }}>
                {tab === 0 && <SmtpTab open={open} />}
                {tab === 1 && <TemplatesTab open={open} />}
                {tab === 2 && <MailSettingsTab open={open} />}
                {tab === 3 && <AutoConfigTab open={open} />}
                {tab === 4 && <TestMailTab open={open} />}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>{t('common.close')}</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Storage Manager Dialog ────────────────────────────────────────────────────

function fmtMb(mb: number): string {
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${mb} MB`;
}

function StorageOrgRow({ stat, onAdjust }: { stat: OrgStorageStat; onAdjust: (stat: OrgStorageStat) => void }) {
    const usedMb = Math.round(stat.usedBytes / (1024 * 1024) * 100) / 100;
    const pct = stat.totalQuotaMb > 0 ? Math.round((usedMb / stat.totalQuotaMb) * 100) : 0;
    return (
        <TableRow hover>
            <TableCell>
                <Typography variant="body2" fontWeight={600}>{stat.name}</Typography>
                <Typography variant="caption" color="text.secondary">{stat.slug}</Typography>
            </TableCell>
            <TableCell>
                <Typography variant="body2">{fmtMb(usedMb)} / {fmtMb(stat.totalQuotaMb)}</Typography>
                <LinearProgress variant="determinate" value={Math.min(pct, 100)}
                    color={pct >= 90 ? 'error' : pct >= 70 ? 'warning' : 'primary'}
                    sx={{ mt: 0.5, borderRadius: 1 }} />
            </TableCell>
            <TableCell>
                <Typography variant="caption" color="text.secondary">
                    Base: {stat.storageBaseMb}MB · +50×{stat.ext50mb} · +100×{stat.ext100mb} · +200×{stat.ext200mb}
                </Typography>
            </TableCell>
            <TableCell>
                {stat.pendingRequests > 0 && (
                    <Chip label={`${stat.pendingRequests} pending`} color="warning" size="small" />
                )}
            </TableCell>
            <TableCell align="right">
                <IconButton size="small" onClick={() => onAdjust(stat)}><Edit fontSize="small" /></IconButton>
            </TableCell>
        </TableRow>
    );
}

function AdjustPoolDialog({ stat, onClose }: { stat: OrgStorageStat; onClose: () => void }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [baseMb, setBaseMb] = useState(String(stat.storageBaseMb));
    const [d50, setD50] = useState('0');
    const [d100, setD100] = useState('0');
    const [d200, setD200] = useState('0');
    const [note, setNote] = useState('');

    const mutation = useMutation({
        mutationFn: () => storageQuotaApi.adjustPool(stat.id, {
            storageBaseMb: parseInt(baseMb) || stat.storageBaseMb,
            delta50mb: parseInt(d50) || 0,
            delta100mb: parseInt(d100) || 0,
            delta200mb: parseInt(d200) || 0,
            note: note || undefined,
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['storage-org-stats'] });
            dispatch(pushToast({ severity: 'success', message: t('superAdmin.storageManagerTitle') }));
            onClose();
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') })),
    });

    const previewBase = parseInt(baseMb) || stat.storageBaseMb;
    const previewTotal = previewBase
        + (stat.ext50mb + (parseInt(d50) || 0)) * 50
        + (stat.ext100mb + (parseInt(d100) || 0)) * 100
        + (stat.ext200mb + (parseInt(d200) || 0)) * 200;

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>{t('superAdmin.adjustPoolTitle', { name: stat.name })}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} pt={0.5}>
                    <TextField label="Base (MB)" type="number" value={baseMb} onChange={e => setBaseMb(e.target.value)} size="small" fullWidth
                        helperText={t('superAdmin.baseMbHelper')} />
                    <Stack direction="row" gap={1.5}>
                        <TextField label="Delta +50 MB" type="number" value={d50} onChange={e => setD50(e.target.value)} size="small" fullWidth
                            helperText={`Hiện: ${stat.ext50mb} gói`} />
                        <TextField label="Delta +100 MB" type="number" value={d100} onChange={e => setD100(e.target.value)} size="small" fullWidth
                            helperText={`Hiện: ${stat.ext100mb} gói`} />
                        <TextField label="Delta +200 MB" type="number" value={d200} onChange={e => setD200(e.target.value)} size="small" fullWidth
                            helperText={`Hiện: ${stat.ext200mb} gói`} />
                    </Stack>
                    <TextField label={t('common.note')} value={note} onChange={e => setNote(e.target.value)} size="small" fullWidth multiline rows={2} />
                    <Alert severity="info" icon={false}>
                        {t('superAdmin.afterAdjust')} <strong>{fmtMb(previewTotal)}</strong>
                    </Alert>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>{t('common.cancel')}</Button>
                <Button variant="contained" onClick={() => mutation.mutate()} disabled={mutation.isPending}>{t('common.save')}</Button>
            </DialogActions>
        </Dialog>
    );
}

function StoragePurchaseRequestsTab() {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [statusFilter, setStatusFilter] = useState<string>('PENDING');
    const [noteDialog, setNoteDialog] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
    const [adminNote, setAdminNote] = useState('');

    const { data: requests = [], isLoading } = useQuery({
        queryKey: ['storage-purchase-requests', statusFilter],
        queryFn: () => storageQuotaApi.listAllRequests(statusFilter || undefined),
    });

    const resolveMutation = useMutation({
        mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note: string }) =>
            action === 'approve' ? storageQuotaApi.approveRequest(id, note) : storageQuotaApi.rejectRequest(id, note),
        onSuccess: (_, vars) => {
            qc.invalidateQueries({ queryKey: ['storage-purchase-requests'] });
            qc.invalidateQueries({ queryKey: ['storage-org-stats'] });
            dispatch(pushToast({ severity: 'success', message: vars.action === 'approve' ? t('license.approveStorageReq') : t('license.rejectStorageReq') }));
            setNoteDialog(null);
            setAdminNote('');
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') })),
    });

    const PKG_COLOR: Record<number, 'default' | 'primary' | 'secondary'> = { 50: 'default', 100: 'primary', 200: 'secondary' };

    return (
        <Box>
            <Stack direction="row" gap={1} mb={2}>
                {['PENDING', 'APPROVED', 'REJECTED', ''].map(s => (
                    <Chip key={s} label={s === 'PENDING' ? t('common.pending') : s === 'APPROVED' ? t('common.approved') : s === 'REJECTED' ? t('common.rejected') : t('common.all')} size="small" clickable
                        variant={statusFilter === s ? 'filled' : 'outlined'}
                        color={s === 'PENDING' ? 'warning' : s === 'APPROVED' ? 'success' : s === 'REJECTED' ? 'error' : 'default'}
                        onClick={() => setStatusFilter(s)} />
                ))}
            </Stack>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>{t('superAdmin.organizations')}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>{t('license.package')}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>{t('license.quantity')}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>{t('common.total')}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>{t('common.status')}</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>{t('common.createdAt')}</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoading ? [...Array(3)].map((_, i) => (
                            <TableRow key={i}>{[...Array(7)].map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                        )) : requests.length === 0 ? (
                            <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                <Typography color="text.secondary">{t('license.noStorageRequests')}</Typography>
                            </TableCell></TableRow>
                        ) : requests.map(r => (
                            <TableRow key={r.id} hover>
                                <TableCell><Typography variant="body2" fontWeight={600}>{r.orgName}</Typography></TableCell>
                                <TableCell><Chip label={`+${r.packageMb} MB`} size="small" color={PKG_COLOR[r.packageMb] ?? 'default'} /></TableCell>
                                <TableCell>{r.quantity}</TableCell>
                                <TableCell><Typography variant="body2" fontWeight={600}>{fmtMb(r.totalMb)}</Typography></TableCell>
                                <TableCell>
                                    <Chip size="small"
                                        label={r.status === 'PENDING' ? t('common.pending') : r.status === 'APPROVED' ? t('common.approved') : t('common.rejected')}
                                        color={r.status === 'PENDING' ? 'warning' : r.status === 'APPROVED' ? 'success' : 'error'} />
                                </TableCell>
                                <TableCell>{fmtDate(r.createdAt)}</TableCell>
                                <TableCell align="right">
                                    {r.status === 'PENDING' && (
                                        <Stack direction="row" gap={0.5}>
                                            <Tooltip title={t('common.approve')}>
                                                <IconButton size="small" color="success" onClick={() => { setNoteDialog({ id: r.id, action: 'approve' }); setAdminNote(''); }}>
                                                    <CheckCircle fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title={t('common.reject')}>
                                                <IconButton size="small" color="error" onClick={() => { setNoteDialog({ id: r.id, action: 'reject' }); setAdminNote(''); }}>
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
            </TableContainer>

            {noteDialog && (
                <Dialog open onClose={() => setNoteDialog(null)} maxWidth="xs" fullWidth>
                    <DialogTitle fontWeight={700}>
                        {noteDialog.action === 'approve' ? t('license.approveStorageReq') : t('license.rejectStorageReq')}
                    </DialogTitle>
                    <DialogContent>
                        <TextField label={t('license.adminNoteOptional')} value={adminNote} onChange={e => setAdminNote(e.target.value)}
                            fullWidth multiline rows={2} size="small" sx={{ mt: 1 }} />
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setNoteDialog(null)}>{t('common.cancel')}</Button>
                        <Button variant="contained"
                            color={noteDialog.action === 'approve' ? 'success' : 'error'}
                            disabled={resolveMutation.isPending}
                            onClick={() => resolveMutation.mutate({ id: noteDialog.id, action: noteDialog.action, note: adminNote })}>
                            {noteDialog.action === 'approve' ? t('common.approve') : t('common.reject')}
                        </Button>
                    </DialogActions>
                </Dialog>
            )}
        </Box>
    );
}

function StorageManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const [tab, setTab] = useState(0);
    const [adjustStat, setAdjustStat] = useState<OrgStorageStat | null>(null);

    const { data: stats = [], isLoading } = useQuery({
        queryKey: ['storage-org-stats'],
        queryFn: storageQuotaApi.getAllOrgStats,
        enabled: open,
    });

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Storage color="primary" />
                    {t('superAdmin.storageManagerTitle')}
                </Stack>
            </DialogTitle>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Tab label={t('superAdmin.storageTabOrgs')} />
                <Tab label={t('superAdmin.storageTabRequests')} />
            </Tabs>
            <DialogContent sx={{ pt: 2 }}>
                {tab === 0 && (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('superAdmin.organizations')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('storage.used')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('storage.title')}</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>{t('license.requests')}</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading ? [...Array(3)].map((_, i) => (
                                    <TableRow key={i}>{[...Array(5)].map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                                )) : stats.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">{t('superAdmin.noOrgsYet')}</Typography>
                                    </TableCell></TableRow>
                                ) : stats.map(s => (
                                    <StorageOrgRow key={s.id} stat={s} onAdjust={setAdjustStat} />
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
                {tab === 1 && <StoragePurchaseRequestsTab />}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>{t('common.close')}</Button>
            </DialogActions>

            {adjustStat && <AdjustPoolDialog stat={adjustStat} onClose={() => setAdjustStat(null)} />}
        </Dialog>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SuperAdminPage() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const qc = useQueryClient();
    const { t } = useTranslation();
    const currentUser = useAppSelector(s => s.auth.user);
    const isPlatformAdmin = useAppSelector(s => s.auth.isPlatformAdmin);
    const platformAdmin = useAppSelector(s => s.auth.platformAdmin);
    const [confirmOrg, setConfirmOrg] = useState<OrgWithStats | null>(null);
    const [deleteOrg, setDeleteOrg] = useState<OrgWithStats | null>(null);
    const [createOrgOpen, setCreateOrgOpen] = useState(false);
    const [versionMgrOpen, setVersionMgrOpen] = useState(false);
    const [mailConfigOpen, setMailConfigOpen] = useState(false);
    const [storageOpen, setStorageOpen] = useState(false);

    const handleManage = (org: OrgWithStats) => {
        dispatch(setManagingOrg({ orgId: org.id, orgName: org.name }));
        qc.clear();
        navigate('/dashboard');
    };

    if (currentUser?.role !== 'SUPER_ADMIN') {
        navigate('/dashboard', { replace: true });
        return null;
    }

    const { data: orgs = [], isLoading, isError } = useQuery({
        queryKey: ['super-admin-orgs'],
        queryFn: organizationsApi.listAll,
    });

    const { data: pendingStorageCount = 0 } = useQuery({
        queryKey: ['storage-pending-count'],
        queryFn: () => storageQuotaApi.listAllRequests('PENDING').then(r => r.length),
        staleTime: 60_000,
    });

    const toggleMutation = useMutation({
        mutationFn: (org: OrgWithStats) => organizationsApi.setStatus(org.id, !org.isActive),
        onSuccess: (_, org) => {
            qc.invalidateQueries({ queryKey: ['super-admin-orgs'] });
            const action = org.isActive ? t('superAdmin.actionOff') : t('superAdmin.actionOn');
            dispatch(pushToast({ severity: 'success', message: `${action}: "${org.name}"` }));
            setConfirmOrg(null);
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') }));
            setConfirmOrg(null);
        },
    });

    return (
        <Box>
            {/* Header */}
            <Box mb={3}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Box>
                        <Stack direction="row" alignItems="center" gap={1.5} mb={0.5}>
                            <Typography variant="h4" fontWeight={700}>
                                {isPlatformAdmin ? 'Platform Admin' : 'Super Admin'}
                            </Typography>
                            <Chip
                                label={isPlatformAdmin ? 'PLATFORM ADMIN' : 'SUPER_ADMIN'}
                                color="error" size="small" sx={{ fontWeight: 700 }}
                            />
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            {t('superAdmin.subtitle')}
                        </Typography>
                    </Box>
                    <Stack direction="row" gap={1}>
                        <Button variant="outlined" startIcon={<Email />} onClick={() => setMailConfigOpen(true)}>
                            {t('superAdmin.mailConfig')}
                        </Button>
                        <Badge badgeContent={pendingStorageCount || undefined} color="error">
                            <Button variant="outlined" startIcon={<Storage />} onClick={() => setStorageOpen(true)}>
                                {t('superAdmin.storage')}
                            </Button>
                        </Badge>
                        <Button variant="outlined" startIcon={<SystemUpdate />} onClick={() => setVersionMgrOpen(true)}>
                            {t('superAdmin.appVersion')}
                        </Button>
                        <Button startIcon={<Add />} onClick={() => setCreateOrgOpen(true)}>
                            {t('superAdmin.createOrg')}
                        </Button>
                    </Stack>
                </Stack>
            </Box>

            {isError && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                    {t('superAdmin.cantLoadOrgs')}
                </Alert>
            )}

            {/* Summary cards */}
            {isLoading ? (
                <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} variant="rounded" sx={{ flex: '1 1 160px', height: 80 }} />)}
                </Stack>
            ) : (
                <Box mb={3}><SummaryCards orgs={orgs} /></Box>
            )}

            {/* Table */}
            <Card>
                <TableContainer component={Paper} elevation={0}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: 36 }} />
                                <TableCell sx={{ fontWeight: 700 }}>{t('superAdmin.organizations')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('common.status')}</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Resources</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Media size</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>{t('common.createdAt')}</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading
                                ? [...Array(4)].map((_, i) => (
                                    <TableRow key={i}>
                                        {[...Array(7)].map((__, j) => (
                                            <TableCell key={j}><Skeleton height={32} /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                                : orgs.length === 0
                                    ? (
                                        <TableRow>
                                            <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                                                <Typography color="text.secondary">{t('superAdmin.noOrgsYet')}</Typography>
                                            </TableCell>
                                        </TableRow>
                                    )
                                    : orgs.map(org => (
                                        <OrgRow key={org.id} org={org} onToggle={setConfirmOrg} onManage={handleManage} onDelete={setDeleteOrg} currentOrgId={currentUser?.organizationId} />
                                    ))
                            }
                        </TableBody>
                    </Table>
                </TableContainer>
            </Card>

            {/* Confirm dialog */}
            {confirmOrg && (
                <ConfirmDialog
                    org={confirmOrg}
                    onConfirm={() => toggleMutation.mutate(confirmOrg)}
                    onClose={() => setConfirmOrg(null)}
                />
            )}


            {/* Create org dialog */}
            {createOrgOpen && (
                <CreateOrgDialog onClose={() => setCreateOrgOpen(false)} />
            )}

            {/* Delete org dialog */}
            {deleteOrg && (
                <DeleteOrgDialog
                    org={deleteOrg}
                    onClose={() => setDeleteOrg(null)}
                />
            )}

            {/* Version manager dialog */}
            <VersionManagerDialog open={versionMgrOpen} onClose={() => setVersionMgrOpen(false)} />

            {/* Mail config dialog */}
            <MailConfigDialog open={mailConfigOpen} onClose={() => setMailConfigOpen(false)} />

            {/* Storage manager dialog */}
            <StorageManagerDialog open={storageOpen} onClose={() => {
                setStorageOpen(false);
                qc.invalidateQueries({ queryKey: ['storage-pending-count'] });
            }} />

            {/* Platform Admins section — visible to root account only */}
            {currentUser?.isRoot && (
                <Box mt={4}>
                    <Divider sx={{ mb: 4 }} />
                    <PlatformAdminsSection currentAdminId={currentUser.id} />
                </Box>
            )}
        </Box>
    );
}
