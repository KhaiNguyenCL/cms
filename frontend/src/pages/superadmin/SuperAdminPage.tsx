import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    Box, Typography, Stack, Card, CardContent, Button, Chip, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, IconButton, Tooltip, Collapse, Skeleton, alpha, Divider,
    Dialog, DialogTitle, DialogContent, DialogActions,
} from '@mui/material';
import {
    Business, Tv, People, PermMedia, QueueMusic, CalendarMonth,
    KeyboardArrowDown, KeyboardArrowUp, CheckCircle, Cancel,
    Storage, PowerSettingsNew,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { pushToast } from '@store/slices/uiSlice';
import { organizationsApi, type OrgWithStats } from '@api/organizations.api';

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
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Media size</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmtBytes(org.totalMediaSizeBytes)}</Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Users (active/total)</Typography>
                    <Typography variant="body2" fontWeight={600}>{org.activeUsers} / {org.totalUsers}</Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Devices (online/total)</Typography>
                    <Typography variant="body2" fontWeight={600}>{org.onlineDevices} / {org.totalDevices}</Typography>
                </Box>
                <Box>
                    <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Ngày tạo</Typography>
                    <Typography variant="body2" fontWeight={600}>{fmtDate(org.createdAt)}</Typography>
                </Box>
            </Stack>
        </Box>
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

// ── Row ───────────────────────────────────────────────────────────────────────

function OrgRow({ org, onToggle, currentOrgId }: { org: OrgWithStats; onToggle: (org: OrgWithStats) => void; currentOrgId?: string }) {
    const [open, setOpen] = useState(false);

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
    const [confirmOrg, setConfirmOrg] = useState<OrgWithStats | null>(null);

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
                <Stack direction="row" alignItems="center" gap={1.5} mb={0.5}>
                    <Typography variant="h4" fontWeight={700}>Super Admin</Typography>
                    <Chip label="SUPER_ADMIN" color="error" size="small" sx={{ fontWeight: 700 }} />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                    Quản lý tất cả tổ chức trên hệ thống
                </Typography>
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
                                        <OrgRow key={org.id} org={org} onToggle={setConfirmOrg} currentOrgId={currentUser?.organizationId} />
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
        </Box>
    );
}
