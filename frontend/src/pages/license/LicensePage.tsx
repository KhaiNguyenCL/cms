import { useQuery } from '@tanstack/react-query';
import {
    Box, Typography, Card, CardContent, Stack, Chip, LinearProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Skeleton, Alert, alpha,
} from '@mui/material';
import { WorkspacePremium } from '@mui/icons-material';
import { organizationsApi, type LicenseTransaction } from '@api/organizations.api';

// ── helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    return new Date(iso).toLocaleString('vi-VN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

const STATUS_CONFIG: Record<string, { label: string; color: 'primary' | 'success' | 'warning' | 'error' }> = {
    TRIAL:     { label: 'Dùng thử', color: 'primary' },
    ACTIVE:    { label: 'Hoạt động', color: 'success' },
    WARNING:   { label: 'Sắp hết', color: 'warning' },
    SUSPENDED: { label: 'Tạm ngừng', color: 'error' },
    EXPIRED:   { label: 'Hết hạn', color: 'error' },
};

const TX_CONFIG: Record<string, { label: string; color: string; prefix: string }> = {
    PURCHASE:         { label: 'Nạp points', color: '#4CAF82', prefix: '+' },
    DAILY_DEDUCTION:  { label: 'Khấu trừ hàng ngày', color: '#888', prefix: '-' },
    ADJUSTMENT:       { label: 'Điều chỉnh', color: '#2196F3', prefix: '±' },
};

// ── Stat card ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub: string; color: string }) {
    return (
        <Card sx={{ flex: '1 1 160px', minWidth: 160 }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="h4" fontWeight={700} sx={{ color }}>{value}</Typography>
                <Typography variant="body2" fontWeight={600}>{label}</Typography>
                <Typography variant="caption" color="text.secondary">{sub}</Typography>
            </CardContent>
        </Card>
    );
}

// ── Transaction row ────────────────────────────────────────────────────────────

function TxRow({ tx }: { tx: LicenseTransaction }) {
    const cfg = TX_CONFIG[tx.type] ?? { label: tx.type, color: '#888', prefix: '' };
    return (
        <TableRow hover>
            <TableCell>
                <Typography variant="caption" color="text.secondary">{fmtDate(tx.createdAt)}</Typography>
            </TableCell>
            <TableCell>
                <Chip
                    label={cfg.label}
                    size="small"
                    sx={{
                        bgcolor: alpha(cfg.color, 0.12),
                        color: cfg.color,
                        fontWeight: 600,
                        fontSize: '0.7rem',
                        border: `1px solid ${alpha(cfg.color, 0.3)}`,
                    }}
                />
            </TableCell>
            <TableCell align="right">
                <Typography
                    variant="body2"
                    fontWeight={700}
                    sx={{ color: cfg.color, fontFamily: 'monospace' }}
                >
                    {cfg.prefix === '-' ? cfg.prefix : cfg.prefix === '+' ? '+' : ''}
                    {Math.abs(tx.points)}
                </Typography>
            </TableCell>
            <TableCell align="center">
                <Typography variant="body2" color="text.secondary">
                    {tx.deviceCount != null ? tx.deviceCount : '—'}
                </Typography>
            </TableCell>
            <TableCell>
                <Typography variant="caption" color="text.secondary">
                    {tx.description ?? '—'}
                </Typography>
            </TableCell>
        </TableRow>
    );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function LicensePage() {
    const { data, isLoading, isError } = useQuery({
        queryKey: ['org-license'],
        queryFn: organizationsApi.getLicenseInfo,
        staleTime: 60_000,
    });

    const statusCfg = STATUS_CONFIG[data?.licenseStatus ?? 'TRIAL'];
    const usedPct = data ? Math.min((data.pointsUsed / Math.max(data.pointsTotal, 1)) * 100, 100) : 0;
    const progressColor = usedPct > 90 ? 'error' : usedPct > 75 ? 'warning' : 'primary';

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" alignItems="center" gap={1.5} mb={3}>
                <WorkspacePremium sx={{ fontSize: 28, color: 'primary.main' }} />
                <Box>
                    <Typography variant="h4" fontWeight={700}>License</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Quản lý gói điểm và lịch sử giao dịch
                    </Typography>
                </Box>
            </Stack>

            {isError && (
                <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                    Không thể tải thông tin license.
                </Alert>
            )}

            {/* 1. Status Card */}
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    {isLoading ? (
                        <Skeleton height={80} />
                    ) : data ? (
                        <>
                            <Stack direction="row" alignItems="center" gap={1.5} mb={1.5}>
                                <Chip
                                    label={statusCfg.label}
                                    color={statusCfg.color}
                                    size="small"
                                    sx={{ fontWeight: 700 }}
                                />
                                <Typography variant="h6" fontWeight={700}>Gói License</Typography>
                            </Stack>
                            <Typography variant="body2" color="text.secondary" mb={1.5}>
                                Còn lại: <strong>{data.pointsRemaining} points</strong>
                                {data.licensedDevices > 0 && (
                                    <span> (~{data.daysRemaining} ngày với {data.licensedDevices} thiết bị)</span>
                                )}
                            </Typography>
                            <Box sx={{ maxWidth: 480 }}>
                                <Stack direction="row" justifyContent="space-between" mb={0.5}>
                                    <Typography variant="caption" color="text.secondary">Đã dùng</Typography>
                                    <Typography variant="caption" fontWeight={700}>
                                        {data.pointsUsed} / {data.pointsTotal} points
                                    </Typography>
                                </Stack>
                                <LinearProgress
                                    variant="determinate"
                                    value={usedPct}
                                    color={progressColor}
                                    sx={{ height: 8, borderRadius: 4, bgcolor: 'action.selected',
                                          '& .MuiLinearProgress-bar': { borderRadius: 4 } }}
                                />
                            </Box>
                            {(data.licenseStatus === 'SUSPENDED' || data.licenseStatus === 'EXPIRED') && (
                                <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
                                    {data.licenseStatus === 'EXPIRED'
                                        ? 'License đã hết hạn. Nội dung hiện không được hiển thị trên các thiết bị.'
                                        : 'License tạm ngừng. Liên hệ admin để nạp thêm points.'}
                                </Alert>
                            )}
                            {data.licenseStatus === 'WARNING' && (
                                <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
                                    Points sắp hết ({data.daysRemaining} ngày còn lại). Hãy nạp thêm points sớm.
                                </Alert>
                            )}
                        </>
                    ) : null}
                </CardContent>
            </Card>

            {/* 2. Points dashboard */}
            {isLoading ? (
                <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
                    {[1, 2, 3].map(i => <Skeleton key={i} variant="rounded" sx={{ flex: '1 1 160px', height: 90 }} />)}
                </Stack>
            ) : data && (
                <Stack direction="row" gap={2} mb={3} flexWrap="wrap">
                    <StatCard label="Tổng points" value={data.pointsTotal} sub="Tổng cộng đã được cấp" color="#6C63FF" />
                    <StatCard label="Đã dùng" value={data.pointsUsed} sub="Đã khấu trừ" color="#FF9800" />
                    <StatCard label="Còn lại" value={data.pointsRemaining} sub={`~${data.daysRemaining} ngày còn lại`} color="#4CAF82" />
                </Stack>
            )}

            {/* 3. Device license status */}
            {data && (
                <Card sx={{ mb: 3 }}>
                    <CardContent>
                        <Typography variant="subtitle1" fontWeight={700} mb={1}>
                            Thiết bị đang tính phí
                        </Typography>
                        <Typography variant="body2" color="text.secondary" mb={1.5}>
                            {data.licensedDevices} thiết bị đang được đăng ký (mỗi ngày tốn {data.licensedDevices} point)
                        </Typography>
                    </CardContent>
                </Card>
            )}

            {/* 4. Transaction history */}
            <Card>
                <CardContent sx={{ pb: '8px !important' }}>
                    <Typography variant="subtitle1" fontWeight={700} mb={0}>
                        Lịch sử giao dịch
                    </Typography>
                </CardContent>
                <TableContainer component={Paper} elevation={0}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ fontWeight: 700 }}>Thời gian</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Loại</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="right">Points</TableCell>
                                <TableCell sx={{ fontWeight: 700 }} align="center">Số thiết bị</TableCell>
                                <TableCell sx={{ fontWeight: 700 }}>Mô tả</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {isLoading
                                ? Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        {[1, 2, 3, 4, 5].map(j => (
                                            <TableCell key={j}><Skeleton height={24} /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                                : (data?.recentTransactions ?? []).length === 0
                                    ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                                                <Typography color="text.secondary">Chưa có giao dịch nào</Typography>
                                            </TableCell>
                                        </TableRow>
                                    )
                                    : (data?.recentTransactions ?? []).map(tx => (
                                        <TxRow key={tx.id} tx={tx} />
                                    ))
                            }
                        </TableBody>
                    </Table>
                </TableContainer>
            </Card>
        </Box>
    );
}
