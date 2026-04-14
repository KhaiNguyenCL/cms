import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Card, Button, TextField, Chip,
    Table, TableBody, TableCell, TableHead, TableRow, TablePagination,
    IconButton, Menu, MenuItem as MuiMenuItem, Dialog, DialogTitle,
    DialogContent, DialogActions, Select, FormControl, InputLabel,
    InputAdornment, Skeleton, Tooltip, Alert, alpha,
} from '@mui/material';
import {
    Search, PersonAdd, MoreVert, Edit, Block, DeleteForever,
    CheckCircle, Cancel, Person, Shield, Visibility, VisibilityOff, Info,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import { usersApi, type CreateUserPayload, type UpdateUserPayload } from '@api/users.api';
import { sitesApi } from '@api/sites.api';
import type { User, Site } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_CFG = {
    SUPER_ADMIN: {
        label: 'Super Admin', color: '#F44336', icon: <Shield sx={{ fontSize: 12 }} />,
        perms: ['users.permSuperAdminAll', 'users.permSuperAdminOrgs', 'users.permSuperAdminLicense'],
    },
    ADMIN: {
        label: 'Admin', color: '#FF6584', icon: <Shield sx={{ fontSize: 12 }} />,
        perms: ['users.permAdminAll', 'users.permAdminCrud', 'users.permAdminPlaylist', 'users.permAdminOta'],
    },
    MANAGER: {
        label: 'Manager', color: '#6C63FF', icon: <Person sx={{ fontSize: 12 }} />,
        perms: ['users.permManagerCrud', 'users.permManagerCmd', 'users.permManagerView', 'users.permManagerNoDelete'],
    },
    CONTENT_MANAGER: {
        label: 'Content Manager', color: '#A78BFA', icon: <Person sx={{ fontSize: 12 }} />,
        perms: ['users.permContentManagerMedia', 'users.permContentManagerPlaylist', 'users.permContentManagerSchedule', 'users.permContentManagerNoDevice'],
    },
    SITE_MANAGER: {
        label: 'Site Manager', color: '#34D399', icon: <Person sx={{ fontSize: 12 }} />,
        perms: ['users.permSiteManagerSite', 'users.permSiteManagerDevice', 'users.permSiteManagerNoDelete', 'users.permSiteManagerNoContent'],
    },
    VIEWER: {
        label: 'Viewer', color: '#29B6F6', icon: <Visibility sx={{ fontSize: 12 }} />,
        perms: ['users.permViewerView', 'users.permViewerNoEdit', 'users.permViewerNoDevice'],
    },
};

const STATUS_CFG = {
    ACTIVE:    { label: 'Active',    color: 'success' as const, icon: <CheckCircle sx={{ fontSize: 12 }} /> },
    INACTIVE:  { label: 'Inactive',  color: 'default' as const, icon: <Cancel sx={{ fontSize: 12 }} /> },
    SUSPENDED: { label: 'Suspended', color: 'error'   as const, icon: <Block sx={{ fontSize: 12 }} /> },
} as const;

// ── Site selector (for SITE_MANAGER) ─────────────────────────────────────────

function SiteSelect({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
    const { t } = useTranslation();
    const { data, isLoading } = useQuery({
        queryKey: ['sites-for-select'],
        queryFn: () => sitesApi.list({ limit: 200 }),
        staleTime: 60_000,
    });
    const sites: Site[] = data?.data ?? [];

    return (
        <FormControl fullWidth size="small" required>
            <InputLabel>{t('users.siteLabel')}</InputLabel>
            <Select
                value={value ?? ''}
                label={t('users.siteLabel')}
                onChange={e => onChange(e.target.value || null)}
                disabled={isLoading}
            >
                {isLoading && <MuiMenuItem value="" disabled>{t('common.loading')}</MuiMenuItem>}
                {sites.map(s => (
                    <MuiMenuItem key={s.id} value={s.id}>{s.name}</MuiMenuItem>
                ))}
            </Select>
        </FormControl>
    );
}

function RoleChip({ role }: { role: User['role'] }) {
    const { t } = useTranslation();
    const cfg = ROLE_CFG[role] ?? ROLE_CFG.VIEWER;
    return (
        <Tooltip
            title={
                <Box>
                    <Typography variant="caption" fontWeight={700} display="block" mb={0.5}>{cfg.label}</Typography>
                    {cfg.perms.map(p => (
                        <Typography key={p} variant="caption" display="block" sx={{ opacity: 0.9 }}>• {t(p)}</Typography>
                    ))}
                </Box>
            }
            arrow
        >
            <Chip
                label={cfg.label}
                size="small"
                sx={{
                    bgcolor: alpha(cfg.color, 0.15),
                    color: cfg.color,
                    fontWeight: 600,
                    fontSize: '0.65rem',
                    border: `1px solid ${alpha(cfg.color, 0.3)}`,
                    cursor: 'default',
                }}
            />
        </Tooltip>
    );
}

function RoleLegend() {
    const { t } = useTranslation();
    const roles = (['ADMIN', 'MANAGER', 'CONTENT_MANAGER', 'SITE_MANAGER', 'VIEWER'] as const);
    return (
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
            <Stack direction="row" alignItems="center" gap={0.5}>
                <Info sx={{ fontSize: 14, color: 'text.disabled' }} />
                <Typography variant="caption" color="text.secondary" fontWeight={600}>{t('users.roleLegendTitle')}</Typography>
            </Stack>
            {roles.map(role => {
                const cfg = ROLE_CFG[role];
                return (
                    <Tooltip
                        key={role}
                        arrow
                        title={
                            <Box>
                                {cfg.perms.map(p => (
                                    <Typography key={p} variant="caption" display="block" sx={{ opacity: 0.9 }}>• {t(p)}</Typography>
                                ))}
                            </Box>
                        }
                    >
                        <Box sx={{
                            display: 'flex', alignItems: 'center', gap: 0.75, cursor: 'default',
                            px: 1.25, py: 0.4, borderRadius: 1.5,
                            bgcolor: alpha(cfg.color, 0.08),
                            border: `1px solid ${alpha(cfg.color, 0.2)}`,
                        }}>
                            <Box sx={{ color: cfg.color, display: 'flex', fontSize: 12 }}>{cfg.icon}</Box>
                            <Typography variant="caption" sx={{ color: cfg.color, fontWeight: 600, fontSize: '0.68rem' }}>
                                {cfg.label}
                            </Typography>
                        </Box>
                    </Tooltip>
                );
            })}
        </Box>
    );
}

function StatusChip({ status }: { status: User['status'] }) {
    const cfg = STATUS_CFG[status] ?? STATUS_CFG.INACTIVE;
    return (
        <Chip
            label={cfg.label}
            color={cfg.color}
            size="small"
            icon={cfg.icon as any}
            sx={{ fontWeight: 600, fontSize: '0.65rem' }}
        />
    );
}

// ── Create User Dialog ─────────────────────────────────────────────────────────

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [form, setForm] = useState<CreateUserPayload>({ email: '', password: '', role: 'VIEWER', siteId: null });
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: () => usersApi.create(form),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] });
            dispatch(pushToast({ severity: 'success', message: t('users.createUser') }));
            handleClose();
        },
        onError: (e: any) => {
            setError(e?.response?.data?.message ?? t('users.createFailed'));
        },
    });

    const handleClose = () => {
        setForm({ email: '', password: '', role: 'VIEWER', siteId: null });
        setError('');
        setShowPw(false);
        onClose();
    };

    const valid = form.email.includes('@') && form.password.length >= 8
        && /[0-9]/.test(form.password) && /[^a-zA-Z0-9]/.test(form.password);

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>{t('users.createUser')}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5} component="form" autoComplete="off">
                    {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

                    {/* Hidden dummy fields prevent browser from autofilling the visible inputs */}
                    <input type="text" name="prevent_autofill_email" style={{ display: 'none' }} readOnly />
                    <input type="password" name="prevent_autofill_pw" style={{ display: 'none' }} readOnly />

                    <TextField
                        label={t('users.email')} type="email" fullWidth required size="small"
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        autoComplete="off"
                        inputProps={{ autoComplete: 'new-password' }}
                    />

                    <TextField
                        label={t('auth.password')} fullWidth required size="small"
                        type={showPw ? 'text' : 'password'}
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        helperText="Min 8 chars, include digit & special char"
                        autoComplete="new-password"
                        inputProps={{ autoComplete: 'new-password' }}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton size="small" onClick={() => setShowPw(s => !s)}>
                                        {showPw ? <Visibility sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18, opacity: 0.5 }} />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    <FormControl fullWidth size="small">
                        <InputLabel>{t('users.role')}</InputLabel>
                        <Select
                            value={form.role}
                            label={t('users.role')}
                            onChange={e => setForm(f => ({ ...f, role: e.target.value as CreateUserPayload['role'], siteId: null }))}
                        >
                            <MuiMenuItem value="ADMIN">{t('users.roleAdminDesc')}</MuiMenuItem>
                            <MuiMenuItem value="MANAGER">{t('users.roleManagerDesc')}</MuiMenuItem>
                            <MuiMenuItem value="CONTENT_MANAGER">{t('users.roleContentManagerDesc')}</MuiMenuItem>
                            <MuiMenuItem value="SITE_MANAGER">{t('users.roleSiteManagerDesc')}</MuiMenuItem>
                            <MuiMenuItem value="VIEWER">{t('users.roleViewerDesc')}</MuiMenuItem>
                        </Select>
                    </FormControl>

                    {form.role === 'SITE_MANAGER' && (
                        <SiteSelect value={form.siteId ?? null} onChange={id => setForm(f => ({ ...f, siteId: id }))} />
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={handleClose}>{t('common.cancel')}</Button>
                <Button
                    size="small"
                    disabled={!valid || mutation.isPending || (form.role === 'SITE_MANAGER' && !form.siteId)}
                    onClick={() => mutation.mutate()}
                >
                    {mutation.isPending ? t('common.creating') : t('users.createUser')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Edit User Dialog ───────────────────────────────────────────────────────────

function EditUserDialog({
    user, open, onClose, isSelf,
}: {
    user: User | null;
    open: boolean;
    onClose: () => void;
    isSelf: boolean;
}) {
    const { t } = useTranslation();
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [role, setRole] = useState<User['role']>(user?.role ?? 'VIEWER');
    const [siteId, setSiteId] = useState<string | null>(user?.siteId ?? null);
    const [status, setStatus] = useState<User['status']>(user?.status ?? 'ACTIVE');
    const [email, setEmail] = useState(user?.email ?? '');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: (payload: UpdateUserPayload) => usersApi.update(user!.id, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] });
            dispatch(pushToast({ severity: 'success', message: t('users.updateSuccess') }));
            onClose();
        },
        onError: (e: any) => {
            setError(e?.response?.data?.message ?? t('users.updateFailed'));
        },
    });

    if (!user) return null;

    const payload: UpdateUserPayload = {};
    if (email && email !== user.email) payload.email = email;
    if (password) payload.password = password;
    if (role !== user.role) payload.role = role;
    if (siteId !== (user.siteId ?? null)) payload.siteId = siteId;
    if (status !== user.status && (status === 'ACTIVE' || status === 'INACTIVE')) payload.status = status;
    const hasChange = Object.keys(payload).length > 0;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>{t('users.editUser')}</DialogTitle>
            <DialogContent dividers>
                <Stack spacing={2.5} pt={0.5}>
                    {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

                    <TextField
                        label="Email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        fullWidth size="small"
                        type="email"
                    />

                    <TextField
                        label={t('users.newPassword')}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        fullWidth size="small"
                        type={showPw ? 'text' : 'password'}
                        placeholder={t('users.passwordPlaceholder')}
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

                    <FormControl fullWidth size="small">
                        <InputLabel>{t('users.role')}</InputLabel>
                        <Select
                            value={role}
                            label={t('users.role')}
                            onChange={e => { setRole(e.target.value as User['role']); setSiteId(null); }}
                        >
                            <MuiMenuItem value="ADMIN">{t('users.roleAdminDesc')}</MuiMenuItem>
                            <MuiMenuItem value="MANAGER">{t('users.roleManagerDesc')}</MuiMenuItem>
                            <MuiMenuItem value="CONTENT_MANAGER">{t('users.roleContentManagerDesc')}</MuiMenuItem>
                            <MuiMenuItem value="SITE_MANAGER">{t('users.roleSiteManagerDesc')}</MuiMenuItem>
                            <MuiMenuItem value="VIEWER">{t('users.roleViewerDesc')}</MuiMenuItem>
                        </Select>
                    </FormControl>

                    {role === 'SITE_MANAGER' && (
                        <SiteSelect value={siteId} onChange={setSiteId} />
                    )}

                    <FormControl fullWidth size="small">
                        <InputLabel>{t('common.status')}</InputLabel>
                        <Select
                            value={status}
                            label={t('common.status')}
                            disabled={isSelf}
                            onChange={e => setStatus(e.target.value as User['status'])}
                        >
                            <MuiMenuItem value="ACTIVE">Active</MuiMenuItem>
                            <MuiMenuItem value="INACTIVE">Inactive</MuiMenuItem>
                        </Select>
                        {isSelf && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                {t('users.cannotDisableSelf')}
                            </Typography>
                        )}
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
                <Button size="small" onClick={onClose}>{t('common.cancel')}</Button>
                <Button
                    size="small"
                    disabled={!hasChange || mutation.isPending}
                    onClick={() => mutation.mutate(payload)}
                >
                    {mutation.isPending ? t('common.saving') : t('users.saveChanges')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Row actions menu ───────────────────────────────────────────────────────────

function UserActionsMenu({
    user, isSelf, isAdmin, onEdit, onHardDelete,
}: {
    user: User;
    isSelf: boolean;
    isAdmin: boolean;
    onEdit: () => void;
    onHardDelete: () => void;
}) {
    const { t } = useTranslation();
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);
    const open = Boolean(anchor);

    if (!isAdmin) return null;
    if (user.role === 'SUPER_ADMIN') return null;

    return (
        <>
            <IconButton size="small" onClick={e => setAnchor(e.currentTarget)}>
                <MoreVert fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}
                slotProps={{ paper: { sx: { minWidth: 180 } } }}>
                <MuiMenuItem onClick={() => { setAnchor(null); onEdit(); }}>
                    <Edit fontSize="small" sx={{ mr: 1.5 }} /> {t('common.edit')}
                </MuiMenuItem>
                <Tooltip title={isSelf ? t('users.cantDeleteSelf') : ''} placement="left">
                    <span>
                        <MuiMenuItem
                            onClick={() => { setAnchor(null); onHardDelete(); }}
                            disabled={isSelf}
                            sx={{ color: 'error.main' }}
                        >
                            <DeleteForever fontSize="small" sx={{ mr: 1.5 }} /> {t('users.deleteForeverAction')}
                        </MuiMenuItem>
                    </span>
                </Tooltip>
            </Menu>
        </>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function UsersPage() {
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const { t } = useTranslation();
    const currentUser = useAppSelector(s => s.auth.user);
    const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN';

    // Filters
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [page, setPage] = useState(0);
    const LIMIT = 15;

    // Dialogs
    const [createOpen, setCreateOpen] = useState(false);
    const [editUser, setEditUser] = useState<User | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['users', page, search, roleFilter, statusFilter],
        queryFn: () => usersApi.list({
            page: page + 1,
            limit: LIMIT,
            search: search || undefined,
            role: roleFilter || undefined,
            status: statusFilter || undefined,
        }),
    });

const hardDeleteMutation = useMutation({
        mutationFn: (id: string) => usersApi.hardDelete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] });
            dispatch(pushToast({ severity: 'success', message: t('common.success') }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? t('common.failedAction') }));
        },
    });

    const [confirmUserId, setConfirmUserId] = useState<{ id: string; action: 'disable' | 'delete' } | null>(null);

const handleHardDelete = (user: User) => {
        setConfirmUserId({ id: user.id, action: 'delete' });
    };

    const handleConfirm = () => {
        if (!confirmUserId) return;
        hardDeleteMutation.mutate(confirmUserId.id);
        setConfirmUserId(null);
    };

    const users = data?.data ?? [];

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>{t('users.title')}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {data?.total ?? 0} {t('users.title').toLowerCase()}
                    </Typography>
                </Box>
                {isAdmin && (
                    <Button startIcon={<PersonAdd />} onClick={() => setCreateOpen(true)}>
                        {t('users.createUser')}
                    </Button>
                )}
            </Stack>

            {/* Filters */}
            <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
                <TextField
                    placeholder={t('users.searchPlaceholder')}
                    value={search}
                    onChange={e => { setSearch(e.target.value); setPage(0); }}
                    size="small"
                    sx={{ width: 260 }}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search sx={{ fontSize: 20, color: 'text.secondary' }} />
                            </InputAdornment>
                        ),
                    }}
                />
                <FormControl size="small" sx={{ width: 140 }}>
                    <InputLabel>Role</InputLabel>
                    <Select value={roleFilter} label={t('users.role')} onChange={e => { setRoleFilter(e.target.value); setPage(0); }}>
                        <MuiMenuItem value="">{t('common.all')}</MuiMenuItem>
                        <MuiMenuItem value="ADMIN">Admin</MuiMenuItem>
                        <MuiMenuItem value="MANAGER">Manager</MuiMenuItem>
                        <MuiMenuItem value="CONTENT_MANAGER">{t('users.roleContentManager')}</MuiMenuItem>
                        <MuiMenuItem value="SITE_MANAGER">{t('users.roleSiteManager')}</MuiMenuItem>
                        <MuiMenuItem value="VIEWER">Viewer</MuiMenuItem>
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ width: 140 }}>
                    <InputLabel>{t('common.status')}</InputLabel>
                    <Select value={statusFilter} label={t('common.status')} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
                        <MuiMenuItem value="">{t('common.all')}</MuiMenuItem>
                        <MuiMenuItem value="ACTIVE">Active</MuiMenuItem>
                        <MuiMenuItem value="INACTIVE">Inactive</MuiMenuItem>
                    </Select>
                </FormControl>
            </Stack>

            {/* Role legend */}
            <Box mb={2}><RoleLegend /></Box>

            {/* Table */}
            <Card>
                <Box sx={{ overflowX: 'auto' }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                {['Email', t('users.role'), t('common.status'), t('common.createdAt'), ''].map(h => (
                                    <TableCell key={h} sx={{ color: 'text.secondary', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        {h}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading
                                ? Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        {Array.from({ length: 5 }).map((_, j) => (
                                            <TableCell key={j}><Skeleton height={24} /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                                : users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                                            {t('users.noUsersFound')}
                                        </TableCell>
                                    </TableRow>
                                )
                                : users.map(user => {
                                    const isSelf = user.id === currentUser?.id;
                                    return (
                                        <TableRow key={user.id} hover sx={{ opacity: user.status === 'INACTIVE' ? 0.55 : 1 }}>
                                            <TableCell>
                                                <Stack direction="row" alignItems="center" gap={1.5}>
                                                    {/* Avatar placeholder */}
                                                    <Box sx={{
                                                        width: 34, height: 34, borderRadius: '50%',
                                                        bgcolor: alpha(ROLE_CFG[user.role]?.color ?? '#888', 0.2),
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        fontSize: '0.85rem', fontWeight: 700,
                                                        color: ROLE_CFG[user.role]?.color ?? '#888',
                                                        flexShrink: 0,
                                                    }}>
                                                        {user.email[0].toUpperCase()}
                                                    </Box>
                                                    <Box>
                                                        <Typography variant="body2" fontWeight={600} component="div">
                                                            {user.email}
                                                            {isSelf && (
                                                                <Chip label={t('users.youLabel')} size="small" sx={{ ml: 1, height: 16, fontSize: '0.6rem' }} />
                                                            )}
                                                        </Typography>
                                                        <Typography variant="caption" color="text.secondary">
                                                            ID: {user.id.slice(0, 8)}…
                                                        </Typography>
                                                    </Box>
                                                </Stack>
                                            </TableCell>
                                            <TableCell><RoleChip role={user.role} /></TableCell>
                                            <TableCell><StatusChip status={user.status} /></TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">
                                                    {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                {confirmUserId?.id === user.id ? (
                                                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end">
                                                        <Typography variant="caption" color={confirmUserId.action === 'delete' ? 'error' : 'warning.main'}>
                                                            {confirmUserId.action === 'delete' ? t('users.deleteForever') : 'Disable?'}
                                                        </Typography>
                                                        <Button size="small" color={confirmUserId.action === 'delete' ? 'error' : 'warning'} onClick={handleConfirm}>{t('common.yes')}</Button>
                                                        <Button size="small" onClick={() => setConfirmUserId(null)}>{t('common.no')}</Button>
                                                    </Stack>
                                                ) : (
                                                    <UserActionsMenu
                                                        user={user}
                                                        isSelf={isSelf}
                                                        isAdmin={isAdmin}
                                                        onEdit={() => setEditUser(user)}
                                                        onHardDelete={() => handleHardDelete(user)}
                                                    />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            }
                        </TableBody>
                    </Table>
                </Box>

                {(data?.totalPages ?? 0) > 1 && (
                    <TablePagination
                        component="div"
                        count={data?.total ?? 0}
                        page={page}
                        onPageChange={(_, p) => setPage(p)}
                        rowsPerPage={LIMIT}
                        rowsPerPageOptions={[LIMIT]}
                        labelDisplayedRows={({ from, to, count }) => t('common.displayedRows', { from, to, count })}
                    />
                )}
            </Card>

            {/* Dialogs */}
            <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
            <EditUserDialog
                user={editUser}
                open={Boolean(editUser)}
                onClose={() => setEditUser(null)}
                isSelf={editUser?.id === currentUser?.id}
            />
        </Box>
    );
}
