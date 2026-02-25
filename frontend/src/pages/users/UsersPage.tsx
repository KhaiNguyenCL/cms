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
    CheckCircle, Cancel, Person, Shield, Visibility,
} from '@mui/icons-material';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import { usersApi, type CreateUserPayload, type UpdateUserPayload } from '@api/users.api';
import type { User } from '@/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_CFG = {
    SUPER_ADMIN: { label: 'Super Admin', color: '#F44336', icon: <Shield sx={{ fontSize: 12 }} /> },
    ADMIN:       { label: 'Admin',       color: '#FF6584', icon: <Shield sx={{ fontSize: 12 }} /> },
    MANAGER:     { label: 'Manager',     color: '#6C63FF', icon: <Person sx={{ fontSize: 12 }} /> },
    VIEWER:      { label: 'Viewer',      color: '#29B6F6', icon: <Visibility sx={{ fontSize: 12 }} /> },
} as const;

const STATUS_CFG = {
    ACTIVE:   { label: 'Active',   color: 'success' as const, icon: <CheckCircle sx={{ fontSize: 12 }} /> },
    INACTIVE: { label: 'Inactive', color: 'default' as const, icon: <Cancel sx={{ fontSize: 12 }} /> },
} as const;

function RoleChip({ role }: { role: User['role'] }) {
    const cfg = ROLE_CFG[role] ?? ROLE_CFG.VIEWER;
    return (
        <Chip
            label={cfg.label}
            size="small"
            icon={cfg.icon as any}
            sx={{
                bgcolor: alpha(cfg.color, 0.15),
                color: cfg.color,
                fontWeight: 600,
                fontSize: '0.65rem',
                border: `1px solid ${alpha(cfg.color, 0.3)}`,
            }}
        />
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
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [form, setForm] = useState<CreateUserPayload>({ email: '', password: '', role: 'VIEWER' });
    const [showPw, setShowPw] = useState(false);
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: () => usersApi.create(form),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] });
            dispatch(pushToast({ severity: 'success', message: 'Tạo user thành công' }));
            handleClose();
        },
        onError: (e: any) => {
            setError(e?.response?.data?.message ?? 'Tạo user thất bại');
        },
    });

    const handleClose = () => {
        setForm({ email: '', password: '', role: 'VIEWER' });
        setError('');
        setShowPw(false);
        onClose();
    };

    const valid = form.email.includes('@') && form.password.length >= 8
        && /[0-9]/.test(form.password) && /[^a-zA-Z0-9]/.test(form.password);

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
            <DialogTitle>Tạo user mới</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                    {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

                    <TextField
                        label="Email" type="email" fullWidth required
                        value={form.email}
                        onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                        autoFocus
                    />

                    <TextField
                        label="Mật khẩu" fullWidth required
                        type={showPw ? 'text' : 'password'}
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        helperText="Tối thiểu 8 ký tự, có số và ký tự đặc biệt"
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

                    <FormControl fullWidth>
                        <InputLabel>Role</InputLabel>
                        <Select
                            value={form.role}
                            label="Role"
                            onChange={e => setForm(f => ({ ...f, role: e.target.value as CreateUserPayload['role'] }))}
                        >
                            <MuiMenuItem value="ADMIN">Admin — toàn quyền</MuiMenuItem>
                            <MuiMenuItem value="MANAGER">Manager — quản lý nội dung</MuiMenuItem>
                            <MuiMenuItem value="VIEWER">Viewer — chỉ xem</MuiMenuItem>
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={handleClose}>Huỷ</Button>
                <Button
                    variant="contained"
                    disabled={!valid || mutation.isPending}
                    onClick={() => mutation.mutate()}
                >
                    {mutation.isPending ? 'Đang tạo...' : 'Tạo user'}
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
    const dispatch = useAppDispatch();
    const qc = useQueryClient();
    const [role, setRole] = useState<User['role']>(user?.role ?? 'VIEWER');
    const [status, setStatus] = useState<User['status']>(user?.status ?? 'ACTIVE');
    const [error, setError] = useState('');

    const mutation = useMutation({
        mutationFn: (payload: UpdateUserPayload) => usersApi.update(user!.id, payload),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] });
            dispatch(pushToast({ severity: 'success', message: 'Cập nhật user thành công' }));
            onClose();
        },
        onError: (e: any) => {
            setError(e?.response?.data?.message ?? 'Cập nhật thất bại');
        },
    });

    if (!user) return null;

    const payload: UpdateUserPayload = {};
    if (role !== user.role) payload.role = role;
    if (status !== user.status) payload.status = status;
    const hasChange = Object.keys(payload).length > 0;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>Chỉnh sửa user</DialogTitle>
            <DialogContent>
                <Stack spacing={2.5} sx={{ mt: 1 }}>
                    {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

                    <TextField
                        label="Email" value={user.email} fullWidth disabled
                        helperText="Email không thể thay đổi"
                    />

                    <FormControl fullWidth>
                        <InputLabel>Role</InputLabel>
                        <Select
                            value={role}
                            label="Role"
                            onChange={e => setRole(e.target.value as User['role'])}
                        >
                            <MuiMenuItem value="ADMIN">Admin — toàn quyền</MuiMenuItem>
                            <MuiMenuItem value="MANAGER">Manager — quản lý nội dung</MuiMenuItem>
                            <MuiMenuItem value="VIEWER">Viewer — chỉ xem</MuiMenuItem>
                        </Select>
                    </FormControl>

                    <FormControl fullWidth>
                        <InputLabel>Trạng thái</InputLabel>
                        <Select
                            value={status}
                            label="Trạng thái"
                            disabled={isSelf}
                            onChange={e => setStatus(e.target.value as User['status'])}
                        >
                            <MuiMenuItem value="ACTIVE">Active</MuiMenuItem>
                            <MuiMenuItem value="INACTIVE">Inactive</MuiMenuItem>
                        </Select>
                        {isSelf && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                Không thể tự vô hiệu hoá tài khoản của mình
                            </Typography>
                        )}
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
                <Button onClick={onClose}>Huỷ</Button>
                <Button
                    variant="contained"
                    disabled={!hasChange || mutation.isPending}
                    onClick={() => mutation.mutate(payload)}
                >
                    {mutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ── Row actions menu ───────────────────────────────────────────────────────────

function UserActionsMenu({
    user, isSelf, isAdmin, onEdit, onDelete,
}: {
    user: User;
    isSelf: boolean;
    isAdmin: boolean;
    onEdit: () => void;
    onDelete: () => void;
}) {
    const [anchor, setAnchor] = useState<null | HTMLElement>(null);
    const open = Boolean(anchor);

    if (!isAdmin) return null;
    // SUPER_ADMIN không thể bị chỉnh sửa hoặc xoá từ Users page
    if (user.role === 'SUPER_ADMIN') return null;

    return (
        <>
            <IconButton size="small" onClick={e => setAnchor(e.currentTarget)}>
                <MoreVert fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={open} onClose={() => setAnchor(null)}
                slotProps={{ paper: { sx: { minWidth: 160 } } }}>
                <MuiMenuItem onClick={() => { setAnchor(null); onEdit(); }}>
                    <Edit fontSize="small" sx={{ mr: 1.5 }} /> Chỉnh sửa
                </MuiMenuItem>
                <Tooltip title={isSelf ? 'Không thể xoá chính mình' : ''} placement="left">
                    <span>
                        <MuiMenuItem
                            onClick={() => { setAnchor(null); onDelete(); }}
                            disabled={isSelf}
                            sx={{ color: 'error.main' }}
                        >
                            <DeleteForever fontSize="small" sx={{ mr: 1.5 }} /> Xoá user
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

    const deleteMutation = useMutation({
        mutationFn: (id: string) => usersApi.delete(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['users'] });
            dispatch(pushToast({ severity: 'success', message: 'Đã xoá user' }));
        },
        onError: (e: any) => {
            dispatch(pushToast({ severity: 'error', message: e?.response?.data?.message ?? 'Xoá thất bại' }));
        },
    });

    const handleDelete = (user: User) => {
        if (window.confirm(`Xoá user "${user.email}"? Hành động này không thể hoàn tác.`)) {
            deleteMutation.mutate(user.id);
        }
    };

    const users = data?.data ?? [];

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                <Box>
                    <Typography variant="h4" fontWeight={700}>Users</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {data?.total ?? 0} người dùng trong tổ chức
                    </Typography>
                </Box>
                {isAdmin && (
                    <Button variant="contained" startIcon={<PersonAdd />} onClick={() => setCreateOpen(true)}>
                        Tạo user
                    </Button>
                )}
            </Stack>

            {/* Filters */}
            <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
                <TextField
                    placeholder="Tìm theo email..."
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
                    <Select value={roleFilter} label="Role" onChange={e => { setRoleFilter(e.target.value); setPage(0); }}>
                        <MuiMenuItem value="">Tất cả</MuiMenuItem>
                        <MuiMenuItem value="ADMIN">Admin</MuiMenuItem>
                        <MuiMenuItem value="MANAGER">Manager</MuiMenuItem>
                        <MuiMenuItem value="VIEWER">Viewer</MuiMenuItem>
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ width: 140 }}>
                    <InputLabel>Trạng thái</InputLabel>
                    <Select value={statusFilter} label="Trạng thái" onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
                        <MuiMenuItem value="">Tất cả</MuiMenuItem>
                        <MuiMenuItem value="ACTIVE">Active</MuiMenuItem>
                        <MuiMenuItem value="INACTIVE">Inactive</MuiMenuItem>
                    </Select>
                </FormControl>
            </Stack>

            {/* Table */}
            <Card>
                <Box sx={{ overflowX: 'auto' }}>
                    <Table>
                        <TableHead>
                            <TableRow>
                                {['Email', 'Role', 'Trạng thái', 'Ngày tạo', ''].map(h => (
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
                                            Không tìm thấy user nào
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
                                                        <Typography variant="body2" fontWeight={600}>
                                                            {user.email}
                                                            {isSelf && (
                                                                <Chip label="Bạn" size="small" sx={{ ml: 1, height: 16, fontSize: '0.6rem' }} />
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
                                                <UserActionsMenu
                                                    user={user}
                                                    isSelf={isSelf}
                                                    isAdmin={isAdmin}
                                                    onEdit={() => setEditUser(user)}
                                                    onDelete={() => handleDelete(user)}
                                                />
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
                        labelDisplayedRows={({ from, to, count }) => `${from}–${to} / ${count}`}
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
