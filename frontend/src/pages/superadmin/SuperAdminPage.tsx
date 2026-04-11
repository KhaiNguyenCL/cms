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
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Ngày tạo</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmtDate(org.createdAt)}</Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Thiết bị được cấp phép</Typography>
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
        { label: 'Ít nhất 8 ký tự', ok: pw.length >= 8 },
        { label: 'Chứa chữ số (0-9)', ok: /[0-9]/.test(pw) },
        { label: 'Chứa ký tự đặc biệt', ok: /[^a-zA-Z0-9]/.test(pw) },
    ];
}

// ── Create Org dialog ─────────────────────────────────────────────────────────

function CreateOrgDialog({ onClose }: { onClose: () => void }) {
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
            dispatch(pushToast({ severity: 'success', message: `Đã tạo tổ chức "${orgName.trim()}"` }));
            onClose();
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Tạo tổ chức thất bại' }));
        },
    });

    const canSubmit = orgName.trim().length >= 2 && slugValid && email.includes('@') && allPwOk && confirmOk && !mutation.isPending;

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Business color="primary" />
                    Tạo tổ chức mới
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField
                        label="Tên tổ chức"
                        value={orgName}
                        onChange={e => setOrgName(e.target.value)}
                        fullWidth autoFocus required
                        inputProps={{ maxLength: 100 }}
                        helperText="Tên hiển thị của tổ chức"
                        size="small"
                    />
                    <Tooltip title="Slug là định danh duy nhất, chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang" placement="right">
                        <TextField
                            label="Slug tổ chức"
                            value={slug}
                            onChange={e => { setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setSlugEdited(true); }}
                            fullWidth required
                            inputProps={{ maxLength: 50 }}
                            error={slug.length > 0 && !slugValid}
                            helperText={slug.length > 0 && !slugValid ? 'Chỉ được dùng chữ thường, số và dấu -' : 'Tự động tạo từ tên — không thể đổi sau khi tạo'}
                            size="small"
                        />
                    </Tooltip>
                    <TextField
                        label="Email Admin"
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        fullWidth required
                        helperText="Tài khoản Admin đầu tiên của tổ chức"
                        size="small"
                    />
                    <Box>
                        <TextField
                            label="Mật khẩu"
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
                                        <Stack key={c.label} direction="row" alignItems="center" gap={0.75}>
                                            {c.ok
                                                ? <CheckCircle sx={{ fontSize: 12, color: 'success.main' }} />
                                                : <Cancel sx={{ fontSize: 12, color: 'text.disabled' }} />
                                            }
                                            <Typography variant="caption" color={c.ok ? 'success.main' : 'text.disabled'}>{c.label}</Typography>
                                        </Stack>
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </Box>
                    <TextField
                        label="Xác nhận mật khẩu"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        fullWidth required size="small"
                        error={confirmPw.length > 0 && !confirmOk}
                        helperText={confirmPw.length > 0 && !confirmOk ? 'Mật khẩu không khớp' : ''}
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
                <Button onClick={onClose} size="small">Hủy</Button>
                <Button
                    size="small"
                    disabled={!canSubmit}
                    onClick={() => mutation.mutate()}
                    startIcon={<Add />}
                >
                    {mutation.isPending ? 'Đang tạo…' : 'Tạo tổ chức'}
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
    const action = org.isActive ? 'tắt' : 'bật';
    const color = org.isActive ? 'error' : 'success';
    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>Xác nhận {action} tổ chức</DialogTitle>
            <DialogContent>
                <Typography variant="body2">
                    Bạn muốn <strong>{action}</strong> tổ chức <strong>{org.name}</strong>?
                </Typography>
                {org.isActive && (
                    <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
                        Tắt tổ chức sẽ ngăn mọi thành viên đăng nhập.
                    </Alert>
                )}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} size="small">Hủy</Button>
                <Button
                   
                    color={color}
                    size="small"
                    onClick={onConfirm}
                    startIcon={<PowerSettingsNew />}
                >
                    {action.charAt(0).toUpperCase() + action.slice(1)}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Delete Org dialog ─────────────────────────────────────────────────────────

function DeleteOrgDialog({ org, onClose }: { org: OrgWithStats; onClose: () => void }) {
    const qc = useQueryClient();
    const dispatch = useAppDispatch();
    const [confirmText, setConfirmText] = useState('');

    const mutation = useMutation({
        mutationFn: () => organizationsApi.delete(org.id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['super-admin-orgs'] });
            dispatch(pushToast({ severity: 'success', message: `Đã xóa tổ chức "${org.name}"` }));
            onClose();
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Xóa tổ chức thất bại' }));
        },
    });

    const canDelete = confirmText === org.name && !mutation.isPending;

    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700} sx={{ color: 'error.main' }}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <DeleteForever />
                    Xóa tổ chức vĩnh viễn
                </Stack>
            </DialogTitle>
            <DialogContent>
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                    Hành động này <strong>không thể hoàn tác</strong>. Toàn bộ dữ liệu bao gồm devices, media, playlists, schedules và users sẽ bị xóa vĩnh viễn.
                </Alert>
                <Typography variant="body2" mb={1.5}>
                    Nhập <strong>{org.name}</strong> để xác nhận:
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
                <Button onClick={onClose} size="small">Hủy</Button>
                <Button
                   
                    color="error"
                    size="small"
                    disabled={!canDelete}
                    onClick={() => mutation.mutate()}
                    startIcon={<DeleteForever />}
                >
                    {mutation.isPending ? 'Đang xóa…' : 'Xóa vĩnh viễn'}
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
                            {managingOrgId === org.id ? 'Đang quản lý' : 'Quản lý'}
                        </Button>

                        <Tooltip title={org.id === currentOrgId ? 'Không thể tắt tổ chức của chính mình' : org.isActive ? 'Tắt tổ chức' : 'Bật tổ chức'}>
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
                        <Tooltip title={org.id === currentOrgId ? 'Không thể xóa tổ chức của chính mình' : 'Xóa tổ chức'}>
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
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Tạo thất bại' }));
        },
    });

    const canSubmit = name.trim().length >= 2 && email.includes('@') && password.length >= 8 && !mutation.isPending;

    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <AdminPanelSettings color="error" />
                    Thêm Platform Admin
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField label="Tên" value={name} onChange={e => setName(e.target.value)} fullWidth autoFocus size="small" required />
                    <TextField label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} fullWidth size="small" required />
                    <TextField
                        label="Mật khẩu" type={showPw ? 'text' : 'password'}
                        value={password} onChange={e => setPassword(e.target.value)}
                        fullWidth size="small" required
                        helperText="Ít nhất 8 ký tự"
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
                <Button onClick={onClose} size="small">Hủy</Button>
                <Button color="error" size="small" disabled={!canSubmit} onClick={() => mutation.mutate()} startIcon={<Add />}>
                    {mutation.isPending ? 'Đang tạo…' : 'Tạo'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function ChangePasswordDialog({ admin, onClose }: { admin: PlatformAdmin; onClose: () => void }) {
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
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Đổi mật khẩu thất bại' })),
    });

    const valid = pw.length >= 8 && pw === confirm;

    return (
        <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Lock color="warning" />
                    Đổi mật khẩu — {admin.name}
                </Stack>
            </DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    <TextField
                        label="Mật khẩu mới" type={show ? 'text' : 'password'}
                        value={pw} onChange={e => setPw(e.target.value)}
                        fullWidth size="small" autoFocus helperText="Ít nhất 8 ký tự"
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
                        label="Nhập lại mật khẩu" type={show ? 'text' : 'password'}
                        value={confirm} onChange={e => setConfirm(e.target.value)}
                        fullWidth size="small"
                        error={confirm.length > 0 && pw !== confirm}
                        helperText={confirm.length > 0 && pw !== confirm ? 'Mật khẩu không khớp' : ''}
                    />
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose} size="small">Hủy</Button>
                <Button color="warning" size="small"
                    disabled={!valid || mutation.isPending}
                    onClick={() => mutation.mutate()}>
                    {mutation.isPending ? 'Đang lưu…' : 'Đổi mật khẩu'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

function PlatformAdminsSection({ currentAdminId }: { currentAdminId?: string }) {
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
            dispatch(pushToast({ severity: 'success', message: `Đã ${admin.isActive ? 'tắt' : 'bật'} "${admin.name}"` }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Thao tác thất bại' }));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => platformAuthApi.deleteAdmin(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['platform-admins'] });
            dispatch(pushToast({ severity: 'success', message: 'Đã xóa platform admin' }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Xóa thất bại' }));
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
                            Tài khoản quản trị hệ thống — không thuộc tổ chức nào
                        </Typography>
                    </Box>
                </Stack>
                <Button variant="outlined" color="error" size="small" startIcon={<Add />} onClick={() => setCreateOpen(true)}>
                    Thêm
                </Button>
            </Stack>

            <Card>
                <TableContainer component={Paper} elevation={0}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>Tên</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Email</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Đăng nhập lần cuối</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Ngày tạo</TableCell>
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
                                                <Typography color="text.secondary">Chưa có platform admin nào</Typography>
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
                                                        <Chip label="Bạn" size="small" color="default"
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
                                                            ? 'Không thể đổi mật khẩu tài khoản root'
                                                            : 'Đổi mật khẩu'
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
                                                        admin.isRoot ? 'Tài khoản root không thể tắt' :
                                                        admin.id === currentAdminId ? 'Không thể tắt chính mình' :
                                                        admin.isActive ? 'Tắt' : 'Bật'
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
                                                        admin.isRoot ? 'Không thể xóa tài khoản root' :
                                                        admin.id === currentAdminId ? 'Không thể xóa chính mình' :
                                                        'Xóa'
                                                    }>
                                                        <span>
                                                            <IconButton size="small" color="error"
                                                                onClick={() => {
                                                                    if (!window.confirm(`Xóa admin "${admin.name}"?`)) return;
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
            <DialogTitle fontWeight={700}>Quản lý phiên bản ứng dụng</DialogTitle>
            <DialogContent dividers>
                {otaMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setOtaMsg('')}>{otaMsg}</Alert>}

                {latest && (
                    <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" color="text.secondary">
                            Phiên bản mới nhất: <strong>{latest.versionName}</strong>
                        </Typography>
                        <Button
                            size="small" startIcon={<Send />}
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
                                    <TableCell>{v.createdAt ? new Date(v.createdAt).toLocaleString('vi-VN', { hour12: false }) : '—'}</TableCell>
                                    <TableCell align="center">
                                        <Tooltip title={v.isLatest ? 'Đang là latest' : 'Đặt làm latest'}>
                                            <span>
                                                <IconButton size="small" disabled={v.isLatest || setLatestMut.isPending}
                                                    onClick={() => setLatestMut.mutate(v.id)}>
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
                        <Typography variant="subtitle2">Thêm phiên bản mới</Typography>
                        <Stack direction="row" gap={1}>
                            <TextField label="Tên phiên bản" size="small" required
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
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>Đóng</Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Summary cards ─────────────────────────────────────────────────────────────

function SummaryCards({ orgs }: { orgs: OrgWithStats[] }) {
    const total = orgs.length;
    const active = orgs.filter(o => o.isActive).length;
    const totalUsers = orgs.reduce((s, o) => s + o.totalUsers, 0);
    const totalDevices = orgs.reduce((s, o) => s + o.totalDevices, 0);
    const totalMedia = orgs.reduce((s, o) => s + o.totalMedia, 0);
    const totalBytes = orgs.reduce((s, o) => s + o.totalMediaSizeBytes, 0);

    const cards = [
        { label: 'Tổ chức', value: `${active} / ${total}`, sub: 'active / tổng', icon: <Business />, color: '#6C63FF' },
        { label: 'Users', value: totalUsers, sub: 'toàn hệ thống', icon: <People />, color: '#4CAF82' },
        { label: 'Devices', value: totalDevices, sub: 'toàn hệ thống', icon: <Tv />, color: '#FF9800' },
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
            dispatch(pushToast({ severity: 'success', message: editing ? 'Đã cập nhật cấu hình' : 'Đã tạo cấu hình mail' }));
            setFormOpen(false);
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? 'Thao tác thất bại' })),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => mailConfigApi.delete(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['mail-configs'] }); dispatch(pushToast({ severity: 'success', message: 'Đã xoá cấu hình' })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? 'Xoá thất bại' })),
    });

    const activateMutation = useMutation({
        mutationFn: (id: string) => mailConfigApi.activate(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['mail-configs'] }); dispatch(pushToast({ severity: 'success', message: 'Đã kích hoạt cấu hình' })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? 'Thao tác thất bại' })),
    });

    const canSave = form.name && form.host && form.port && form.username && form.fromAddress && (editing || form.password);

    return (
        <>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="small" startIcon={<Add />} onClick={openCreate} variant="outlined">Thêm SMTP</Button>
            </Box>
            {isLoading ? (
                <Box px={2}>{[1,2].map(i => <Skeleton key={i} height={56} sx={{ mb: 1 }} />)}</Box>
            ) : configs.length === 0 ? (
                <Box textAlign="center" py={6}>
                    <Email sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">Chưa có cấu hình SMTP nào</Typography>
                </Box>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tên</TableCell>
                            <TableCell>Host / Port</TableCell>
                            <TableCell>Username</TableCell>
                            <TableCell>From</TableCell>
                            <TableCell>Trạng thái</TableCell>
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
                                        ? <Chip size="small" icon={<CheckCircle sx={{ fontSize: '14px !important' }} />} label="Đang dùng" color="success" />
                                        : <Chip size="small" label="Không dùng" variant="outlined" color="default" />}
                                </TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                                        {!c.isActive && (
                                            <Tooltip title="Kích hoạt">
                                                <IconButton size="small" color="success" onClick={() => activateMutation.mutate(c.id)} disabled={activateMutation.isPending}>
                                                    <CheckCircleOutlined fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                        <Tooltip title="Chỉnh sửa">
                                            <IconButton size="small" onClick={() => openEdit(c)}><Edit fontSize="small" /></IconButton>
                                        </Tooltip>
                                        {!c.isActive && (
                                            <Tooltip title="Xoá">
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
                <DialogTitle fontWeight={700}>{editing ? 'Chỉnh sửa SMTP' : 'Thêm cấu hình SMTP'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} pt={0.5}>
                        <TextField size="small" label="Tên cấu hình *" value={form.name} onChange={e => set('name', e.target.value)} fullWidth autoFocus />
                        <Stack direction="row" gap={2}>
                            <TextField size="small" label="SMTP Host *" value={form.host} onChange={e => set('host', e.target.value)} fullWidth />
                            <TextField size="small" label="Port *" type="number" value={form.port} onChange={e => set('port', Number(e.target.value))} sx={{ width: 120 }} />
                        </Stack>
                        <Stack direction="row" gap={2} alignItems="center">
                            <Typography variant="body2" color="text.secondary">Giao thức:</Typography>
                            {(['STARTTLS (587)', 'SSL/TLS (465)'] as const).map((label, i) => (
                                <Chip key={label} label={label} size="small"
                                    color={form.secure === (i === 1) ? 'primary' : 'default'}
                                    variant={form.secure === (i === 1) ? 'filled' : 'outlined'}
                                    onClick={() => set('secure', i === 1)} sx={{ cursor: 'pointer' }} />
                            ))}
                        </Stack>
                        <TextField size="small" label="Username *" value={form.username} onChange={e => set('username', e.target.value)} fullWidth />
                        <TextField size="small"
                            label={editing ? 'Mật khẩu (để trống = giữ nguyên)' : 'Mật khẩu *'}
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
                        <TextField size="small" label="Tên hiển thị (From Name) *" value={form.fromName} onChange={e => set('fromName', e.target.value)} fullWidth />
                        <TextField size="small" label="Địa chỉ gửi (From Address) *" type="email" value={form.fromAddress} onChange={e => set('fromAddress', e.target.value)} fullWidth />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setFormOpen(false)}>Huỷ</Button>
                    <Button size="small" variant="contained" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                        {saveMutation.isPending ? <CircularProgress size={16} /> : editing ? 'Lưu' : 'Tạo'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ── Templates Tab ──────────────────────────────────────────────────────────────

function TemplatesTab({ open }: { open: boolean }) {
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
    const openEdit = (t: MailTemplate) => {
        setEditing(t);
        setForm({ name: t.name, subject: t.subject, bodyHtml: t.bodyHtml, description: t.description ?? '' });
        setFormOpen(true);
    };

    const saveMutation = useMutation({
        mutationFn: () => editing ? mailTemplateApi.update(editing.id, form) : mailTemplateApi.create(form),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['mail-templates'] });
            dispatch(pushToast({ severity: 'success', message: editing ? 'Đã cập nhật template' : 'Đã tạo template' }));
            setFormOpen(false);
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? 'Thao tác thất bại' })),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => mailTemplateApi.delete(id),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['mail-templates'] }); dispatch(pushToast({ severity: 'success', message: 'Đã xoá template' })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? 'Xoá thất bại' })),
    });

    const canSave = form.name.trim() && form.subject.trim() && form.bodyHtml.trim();

    // Known variables for reference
    const allVars = ['{{recipientName}}', '{{deviceName}}', '{{siteName}}', '{{orgName}}', '{{offlineAt}}', '{{errorAt}}', '{{expiresAt}}', '{{email}}', '{{role}}', '{{deviceCount}}'];

    return (
        <>
            <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button size="small" startIcon={<Add />} onClick={openCreate} variant="outlined">Thêm template</Button>
            </Box>
            {isLoading ? (
                <Box px={2}>{[1,2].map(i => <Skeleton key={i} height={56} sx={{ mb: 1 }} />)}</Box>
            ) : templates.length === 0 ? (
                <Box textAlign="center" py={6}>
                    <Email sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">Chưa có template nào</Typography>
                </Box>
            ) : (
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tên template</TableCell>
                            <TableCell>Subject</TableCell>
                            <TableCell>Mô tả</TableCell>
                            <TableCell align="right" />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {templates.map(t => (
                            <TableRow key={t.id} hover>
                                <TableCell><Typography variant="body2" fontWeight={600}>{t.name}</Typography></TableCell>
                                <TableCell><Typography variant="body2">{t.subject}</Typography></TableCell>
                                <TableCell><Typography variant="body2" color="text.secondary">{t.description ?? '—'}</Typography></TableCell>
                                <TableCell align="right">
                                    <Stack direction="row" justifyContent="flex-end" gap={0.5}>
                                        <Tooltip title="Chỉnh sửa">
                                            <IconButton size="small" onClick={() => openEdit(t)}><Edit fontSize="small" /></IconButton>
                                        </Tooltip>
                                        <Tooltip title="Xoá">
                                            <IconButton size="small" color="error" onClick={() => deleteMutation.mutate(t.id)} disabled={deleteMutation.isPending}>
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
                <DialogTitle fontWeight={700}>{editing ? 'Chỉnh sửa template' : 'Thêm template'}</DialogTitle>
                <DialogContent dividers>
                    <Stack spacing={2} pt={0.5}>
                        <Stack direction="row" gap={2}>
                            <TextField size="small" label="Tên template *" value={form.name} onChange={e => set('name', e.target.value)} fullWidth autoFocus />
                            <TextField size="small" label="Mô tả" value={form.description} onChange={e => set('description', e.target.value)} fullWidth />
                        </Stack>
                        <TextField size="small" label="Subject *" value={form.subject} onChange={e => set('subject', e.target.value)} fullWidth />
                        <Box>
                            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>
                                Biến có thể dùng:
                            </Typography>
                            <Stack direction="row" flexWrap="wrap" gap={0.5} mb={1}>
                                {allVars.map(v => (
                                    <Chip key={v} label={v} size="small" variant="outlined"
                                        onClick={() => set('bodyHtml', (form.bodyHtml ?? '') + v)}
                                        sx={{ cursor: 'pointer', fontFamily: 'monospace', fontSize: '0.7rem' }} />
                                ))}
                            </Stack>
                            <TextField
                                label="Nội dung HTML *"
                                value={form.bodyHtml}
                                onChange={e => set('bodyHtml', e.target.value)}
                                fullWidth multiline minRows={10} maxRows={20}
                                inputProps={{ style: { fontFamily: 'monospace', fontSize: '0.8rem' } }}
                            />
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button size="small" onClick={() => setFormOpen(false)}>Huỷ</Button>
                    <Button size="small" variant="contained" disabled={!canSave || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                        {saveMutation.isPending ? <CircularProgress size={16} /> : editing ? 'Lưu' : 'Tạo'}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

// ── Mail Settings Tab ─────────────────────────────────────────────────────────

function MailSettingsTab({ open }: { open: boolean }) {
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
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['mail-settings'] }); dispatch(pushToast({ severity: 'success', message: 'Đã cập nhật' })); },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? 'Thao tác thất bại' })),
    });

    const settingMap = new Map(settings.map(s => [s.eventType, s]));

    if (isLoading) return <Box p={2}>{[1,2,3,4].map(i => <Skeleton key={i} height={72} sx={{ mb: 1 }} />)}</Box>;

    return (
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell sx={{ fontWeight: 700 }}>Sự kiện</TableCell>
                    <TableCell>Template</TableCell>
                    <TableCell>Cấu hình SMTP</TableCell>
                    <TableCell align="center">Bật</TableCell>
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
                                        <MenuItem value=""><em>— Không dùng —</em></MenuItem>
                                        {templates.map(t => <MenuItem key={t.id} value={t.id}>{t.name}</MenuItem>)}
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
                                        <MenuItem value=""><em>— Mặc định —</em></MenuItem>
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
        onSuccess: (res) => dispatch(pushToast({ severity: 'success', message: res.message ?? 'Đã gửi email test' })),
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? 'Gửi thất bại' })),
    });

    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());

    return (
        <Box sx={{ p: 3, maxWidth: 480 }}>
            <Typography variant="subtitle1" fontWeight={700} mb={2}>Gửi email test</Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
                Dùng để kiểm tra cấu hình SMTP có hoạt động đúng không. Email sẽ được gửi ngay đến địa chỉ bạn nhập.
            </Typography>
            <Stack spacing={2}>
                <TextField
                    size="small"
                    label="Địa chỉ email nhận *"
                    type="email"
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    placeholder="example@company.com"
                    fullWidth
                    autoFocus
                    error={to.length > 0 && !isValidEmail}
                    helperText={to.length > 0 && !isValidEmail ? 'Email không hợp lệ' : ''}
                />
                <FormControl size="small" fullWidth>
                    <InputLabel>Dùng cấu hình SMTP</InputLabel>
                    <Select
                        label="Dùng cấu hình SMTP"
                        value={configId}
                        onChange={e => setConfigId(e.target.value)}
                    >
                        <MenuItem value=""><em>— Dùng cấu hình đang active —</em></MenuItem>
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
                    {sendMutation.isPending ? 'Đang gửi...' : 'Gửi test'}
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
        delayLabel: 'Chờ trước khi gửi (tránh cảnh báo nhầm khi mạng chập chờn ngắn)',
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
            dispatch(pushToast({ severity: 'success', message: 'Đã lưu cấu hình' }));
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.error ?? 'Thao tác thất bại' })),
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
                Cấu hình <strong>thời điểm</strong> và <strong>tần suất</strong> gửi mail tự động cho từng sự kiện. Bật/tắt và chọn template ở tab <em>Cài đặt gửi</em>.
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
                                        <Chip size="small" label={s.isEnabled ? 'Bật' : 'Tắt'} color={s.isEnabled ? 'success' : 'default'} variant="outlined" />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">{et.description}</Typography>
                                </Box>
                            </Stack>

                            {!hasAnyControl && (
                                <Typography variant="caption" color="text.secondary" fontStyle="italic">
                                    Sự kiện này gửi ngay lập tức khi xảy ra, không có cấu hình thêm.
                                </Typography>
                            )}

                            {meta.hasDelay && (
                                <Box mb={2}>
                                    <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                                        <TextField
                                            select size="small" label="Độ trễ trước khi gửi"
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
                                                <MenuItem key={v} value={v}>{v === 0 ? 'Ngay lập tức' : `${v} phút`}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                            size="small" label="Hoặc nhập số phút" type="number"
                                            value={lv.triggerDelayMin}
                                            onChange={e => setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, triggerDelayMin: Math.max(0, Math.min(60, Number(e.target.value))) } }))}
                                            onBlur={() => commit(et.key)}
                                            disabled={!s.isEnabled}
                                            inputProps={{ min: 0, max: 60 }}
                                            sx={{ width: 160 }}
                                            InputProps={{ endAdornment: <InputAdornment position="end">phút</InputAdornment> }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>{meta.delayLabel}</Typography>
                                </Box>
                            )}

                            {meta.hasCooldown && (
                                <Box>
                                    <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                                        <TextField
                                            select size="small" label="Cooldown giữa 2 lần cảnh báo"
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
                                                <MenuItem key={v} value={v}>{v === 0 ? 'Không giới hạn' : `${v} giờ`}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                            size="small" label="Hoặc nhập số giờ" type="number"
                                            value={lv.cooldownHours}
                                            onChange={e => setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, cooldownHours: Math.max(0, Math.min(168, Number(e.target.value))) } }))}
                                            onBlur={() => commit(et.key)}
                                            disabled={!s.isEnabled}
                                            inputProps={{ min: 0, max: 168 }}
                                            sx={{ width: 160 }}
                                            InputProps={{ endAdornment: <InputAdornment position="end">giờ</InputAdornment> }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                        Không gửi lặp lại cho cùng thiết bị trong vòng {lv.cooldownHours === 0 ? 'bất kỳ thời gian nào' : `${lv.cooldownHours} giờ`}
                                    </Typography>
                                </Box>
                            )}

                            {meta.hasAdvanceDays && (
                                <Box>
                                    <Stack direction="row" alignItems="center" gap={2} flexWrap="wrap">
                                        <TextField
                                            select size="small" label="Gửi trước khi hết hạn"
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
                                                <MenuItem key={v} value={v}>{v} ngày</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField
                                            size="small" label="Hoặc nhập số ngày" type="number"
                                            value={lv.advanceDays}
                                            onChange={e => setLocalVals(prev => ({ ...prev, [et.key]: { ...lv, advanceDays: Math.max(1, Math.min(365, Number(e.target.value))) } }))}
                                            onBlur={() => commit(et.key)}
                                            disabled={!s.isEnabled}
                                            inputProps={{ min: 1, max: 365 }}
                                            sx={{ width: 160 }}
                                            InputProps={{ endAdornment: <InputAdornment position="end">ngày</InputAdornment> }}
                                        />
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                        Kiểm tra hàng ngày lúc 08:00, gửi cảnh báo khi license còn ≤ {lv.advanceDays} ngày
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
    const [tab, setTab] = useState(0);

    return (
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
            <DialogTitle fontWeight={700}>
                <Stack direction="row" alignItems="center" gap={1}>
                    <Email color="primary" />
                    Cấu hình Mail
                </Stack>
            </DialogTitle>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
                <Tabs value={tab} onChange={(_, v) => setTab(v)}>
                    <Tab label="SMTP" />
                    <Tab label="Templates" />
                    <Tab label="Cài đặt gửi" />
                    <Tab label="Tự động" />
                    <Tab label="Test mail" />
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
                <Button onClick={onClose}>Đóng</Button>
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
            dispatch(pushToast({ severity: 'success', message: 'Đã cập nhật pool dung lượng' }));
            onClose();
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Thao tác thất bại' })),
    });

    const previewBase = parseInt(baseMb) || stat.storageBaseMb;
    const previewTotal = previewBase
        + (stat.ext50mb + (parseInt(d50) || 0)) * 50
        + (stat.ext100mb + (parseInt(d100) || 0)) * 100
        + (stat.ext200mb + (parseInt(d200) || 0)) * 200;

    return (
        <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>Điều chỉnh dung lượng — {stat.name}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2} pt={0.5}>
                    <TextField label="Base (MB)" type="number" value={baseMb} onChange={e => setBaseMb(e.target.value)} size="small" fullWidth
                        helperText="Dung lượng cơ bản của tổ chức" />
                    <Stack direction="row" gap={1.5}>
                        <TextField label="Delta +50 MB" type="number" value={d50} onChange={e => setD50(e.target.value)} size="small" fullWidth
                            helperText={`Hiện: ${stat.ext50mb} gói`} />
                        <TextField label="Delta +100 MB" type="number" value={d100} onChange={e => setD100(e.target.value)} size="small" fullWidth
                            helperText={`Hiện: ${stat.ext100mb} gói`} />
                        <TextField label="Delta +200 MB" type="number" value={d200} onChange={e => setD200(e.target.value)} size="small" fullWidth
                            helperText={`Hiện: ${stat.ext200mb} gói`} />
                    </Stack>
                    <TextField label="Ghi chú" value={note} onChange={e => setNote(e.target.value)} size="small" fullWidth multiline rows={2} />
                    <Alert severity="info" icon={false}>
                        Sau điều chỉnh: tổng quota = <strong>{fmtMb(previewTotal)}</strong>
                    </Alert>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button onClick={onClose}>Hủy</Button>
                <Button variant="contained" onClick={() => mutation.mutate()} disabled={mutation.isPending}>Lưu</Button>
            </DialogActions>
        </Dialog>
    );
}

function StoragePurchaseRequestsTab() {
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
            dispatch(pushToast({ severity: 'success', message: vars.action === 'approve' ? 'Đã duyệt yêu cầu' : 'Đã từ chối yêu cầu' }));
            setNoteDialog(null);
            setAdminNote('');
        },
        onError: (e: any) => dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Thao tác thất bại' })),
    });

    const PKG_COLOR: Record<number, 'default' | 'primary' | 'secondary'> = { 50: 'default', 100: 'primary', 200: 'secondary' };

    return (
        <Box>
            <Stack direction="row" gap={1} mb={2}>
                {['PENDING', 'APPROVED', 'REJECTED', ''].map(s => (
                    <Chip key={s} label={s || 'Tất cả'} size="small" clickable
                        variant={statusFilter === s ? 'filled' : 'outlined'}
                        color={s === 'PENDING' ? 'warning' : s === 'APPROVED' ? 'success' : s === 'REJECTED' ? 'error' : 'default'}
                        onClick={() => setStatusFilter(s)} />
                ))}
            </Stack>
            <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700 }}>Tổ chức</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Gói</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>SL</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Tổng</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                            <TableCell sx={{ fontWeight: 700 }}>Ngày tạo</TableCell>
                            <TableCell />
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {isLoading ? [...Array(3)].map((_, i) => (
                            <TableRow key={i}>{[...Array(7)].map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                        )) : requests.length === 0 ? (
                            <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                <Typography color="text.secondary">Không có yêu cầu nào</Typography>
                            </TableCell></TableRow>
                        ) : requests.map(r => (
                            <TableRow key={r.id} hover>
                                <TableCell><Typography variant="body2" fontWeight={600}>{r.orgName}</Typography></TableCell>
                                <TableCell><Chip label={`+${r.packageMb} MB`} size="small" color={PKG_COLOR[r.packageMb] ?? 'default'} /></TableCell>
                                <TableCell>{r.quantity}</TableCell>
                                <TableCell><Typography variant="body2" fontWeight={600}>{fmtMb(r.totalMb)}</Typography></TableCell>
                                <TableCell>
                                    <Chip size="small"
                                        label={r.status === 'PENDING' ? 'Chờ duyệt' : r.status === 'APPROVED' ? 'Đã duyệt' : 'Từ chối'}
                                        color={r.status === 'PENDING' ? 'warning' : r.status === 'APPROVED' ? 'success' : 'error'} />
                                </TableCell>
                                <TableCell>{fmtDate(r.createdAt)}</TableCell>
                                <TableCell align="right">
                                    {r.status === 'PENDING' && (
                                        <Stack direction="row" gap={0.5}>
                                            <Tooltip title="Duyệt">
                                                <IconButton size="small" color="success" onClick={() => { setNoteDialog({ id: r.id, action: 'approve' }); setAdminNote(''); }}>
                                                    <CheckCircle fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Từ chối">
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
                        {noteDialog.action === 'approve' ? 'Duyệt yêu cầu' : 'Từ chối yêu cầu'}
                    </DialogTitle>
                    <DialogContent>
                        <TextField label="Ghi chú admin" value={adminNote} onChange={e => setAdminNote(e.target.value)}
                            fullWidth multiline rows={2} size="small" sx={{ mt: 1 }} />
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2 }}>
                        <Button onClick={() => setNoteDialog(null)}>Hủy</Button>
                        <Button variant="contained"
                            color={noteDialog.action === 'approve' ? 'success' : 'error'}
                            disabled={resolveMutation.isPending}
                            onClick={() => resolveMutation.mutate({ id: noteDialog.id, action: noteDialog.action, note: adminNote })}>
                            {noteDialog.action === 'approve' ? 'Duyệt' : 'Từ chối'}
                        </Button>
                    </DialogActions>
                </Dialog>
            )}
        </Box>
    );
}

function StorageManagerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
                    Quản lý dung lượng
                </Stack>
            </DialogTitle>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Tab label="Tổ chức" />
                <Tab label="Yêu cầu mua" />
            </Tabs>
            <DialogContent sx={{ pt: 2 }}>
                {tab === 0 && (
                    <TableContainer component={Paper} variant="outlined">
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 700 }}>Tổ chức</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Sử dụng</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Cấu hình pool</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Yêu cầu</TableCell>
                                    <TableCell />
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {isLoading ? [...Array(3)].map((_, i) => (
                                    <TableRow key={i}>{[...Array(5)].map((__, j) => <TableCell key={j}><Skeleton /></TableCell>)}</TableRow>
                                )) : stats.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">Chưa có tổ chức nào</Typography>
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
                <Button onClick={onClose}>Đóng</Button>
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
            const action = org.isActive ? 'tắt' : 'bật';
            dispatch(pushToast({ severity: 'success', message: `Đã ${action} tổ chức "${org.name}"` }));
            setConfirmOrg(null);
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Thao tác thất bại' }));
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
                            Quản lý tất cả tổ chức trên hệ thống
                        </Typography>
                    </Box>
                    <Stack direction="row" gap={1}>
                        <Button variant="outlined" startIcon={<Email />} onClick={() => setMailConfigOpen(true)}>
                            Cấu hình mail
                        </Button>
                        <Badge badgeContent={pendingStorageCount || undefined} color="error">
                            <Button variant="outlined" startIcon={<Storage />} onClick={() => setStorageOpen(true)}>
                                Dung lượng
                            </Button>
                        </Badge>
                        <Button variant="outlined" startIcon={<SystemUpdate />} onClick={() => setVersionMgrOpen(true)}>
                            Phiên bản app
                        </Button>
                        <Button startIcon={<Add />} onClick={() => setCreateOrgOpen(true)}>
                            Tạo tổ chức
                        </Button>
                    </Stack>
                </Stack>
            </Box>

            {isError && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                    Không thể tải danh sách tổ chức.
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
                                <TableCell sx={{ fontWeight: 700 }}>Tổ chức</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Trạng thái</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Tài nguyên</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Media size</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Ngày tạo</TableCell>
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
                                                <Typography color="text.secondary">Chưa có tổ chức nào</Typography>
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
