import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Card, CardContent, Button, Chip, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, IconButton, Tooltip, Collapse, Skeleton, alpha, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    InputAdornment, LinearProgress,
} from '@mui/material';
import {
    Business, Tv, People, PermMedia, QueueMusic, CalendarMonth,
    KeyboardArrowDown, KeyboardArrowUp, CheckCircle, Cancel,
    Storage, PowerSettingsNew, ManageAccounts, AddCircle, WorkspacePremium,
    Visibility, VisibilityOff, Add, DeleteForever, AdminPanelSettings,
    Edit, Block, CheckCircleOutline, Lock, Shield,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import { setManagingOrg } from '@store/slices/authSlice';
import { organizationsApi, type OrgWithStats } from '@api/organizations.api';
import { authApi } from '@api/auth.api';
import { platformAuthApi, type PlatformAdmin } from '@api/platform-auth.api';

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
                    variant="contained" size="small"
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
                    variant="contained"
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
                    variant="contained"
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
                <Button variant="contained" color="error" size="small" disabled={!canSubmit} onClick={() => mutation.mutate()} startIcon={<Add />}>
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
                <Button variant="contained" color="warning" size="small"
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
                    <Button variant="contained" startIcon={<Add />} onClick={() => setCreateOrgOpen(true)}>
                        Tạo tổ chức
                    </Button>
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
