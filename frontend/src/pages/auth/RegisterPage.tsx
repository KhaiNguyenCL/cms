import { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, TextField, Button,
    IconButton, InputAdornment, Alert, CircularProgress, Stack,
    LinearProgress, Tooltip,
} from '@mui/material';
import {
    Visibility, VisibilityOff, Business, CheckCircle, Cancel,
} from '@mui/icons-material';
import { useAppDispatch } from '@store/hooks';
import { setCredentials } from '@store/slices/authSlice';
import { authApi } from '@api/auth.api';

// ── helpers ───────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')    // strip diacritics
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 50);
}

interface PwCheck { label: string; ok: boolean }
function getPwChecks(pw: string): PwCheck[] {
    return [
        { label: 'Ít nhất 8 ký tự', ok: pw.length >= 8 },
        { label: 'Chứa chữ số (0-9)', ok: /[0-9]/.test(pw) },
        { label: 'Chứa ký tự đặc biệt', ok: /[^a-zA-Z0-9]/.test(pw) },
    ];
}

function pwStrength(checks: PwCheck[]): number {
    const passed = checks.filter(c => c.ok).length;
    return Math.round((passed / checks.length) * 100);
}

const STRENGTH_COLOR = ['error', 'warning', 'warning', 'success'] as const;

// ── dark field sx ─────────────────────────────────────────────────────────────
const darkField = {
    '& .MuiOutlinedInput-root': {
        color: 'white',
        '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
        '&:hover fieldset': { borderColor: 'rgba(108,99,255,0.5)' },
        '&.Mui-focused fieldset': { borderColor: '#6C63FF' },
        '&.Mui-disabled': { color: 'rgba(255,255,255,0.4)' },
        '&.Mui-disabled fieldset': { borderColor: 'rgba(255,255,255,0.08)' },
    },
    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
    '& .MuiInputLabel-root.Mui-focused': { color: '#6C63FF' },
    '& .MuiInputLabel-root.Mui-disabled': { color: 'rgba(255,255,255,0.3)' },
    '& .MuiFormHelperText-root': { color: 'rgba(255,255,255,0.4)' },
};

// ── component ─────────────────────────────────────────────────────────────────

export default function RegisterPage() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();

    const [orgName, setOrgName] = useState('');
    const [slug, setSlug] = useState('');
    const [slugEdited, setSlugEdited] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPw, setConfirmPw] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    // Auto-generate slug when org name changes (unless user has manually edited it)
    useEffect(() => {
        if (!slugEdited) {
            setSlug(toSlug(orgName));
        }
    }, [orgName, slugEdited]);

    const pwChecks = getPwChecks(password);
    const strength = pwStrength(pwChecks);
    const allPwOk = pwChecks.every(c => c.ok);
    const confirmOk = confirmPw.length > 0 && confirmPw === password;
    const slugValid = /^[a-z0-9-]+$/.test(slug) && slug.length >= 2;

    const canSubmit =
        orgName.trim().length >= 2 &&
        slugValid &&
        email.includes('@') &&
        allPwOk &&
        confirmOk &&
        !loading;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setLoading(true);
        setError('');
        try {
            const data = await authApi.register({
                organizationName: orgName.trim(),
                organizationSlug: slug,
                email: email.trim(),
                password,
            });
            dispatch(setCredentials({
                user: data.user,
                accessToken: data.accessToken,
            }));
            navigate('/dashboard', { replace: true });
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(msg ?? 'Đăng ký thất bại, vui lòng thử lại');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #0F1117 0%, #1A1D2E 50%, #12152a 100%)',
                p: 2,
            }}
        >
            {/* Decorative blobs */}
            <Box sx={{
                position: 'absolute', top: '10%', left: '8%', width: 350, height: 350,
                borderRadius: '50%', background: 'rgba(108,99,255,0.1)', filter: 'blur(90px)', pointerEvents: 'none',
            }} />
            <Box sx={{
                position: 'absolute', bottom: '10%', right: '8%', width: 280, height: 280,
                borderRadius: '50%', background: 'rgba(255,101,132,0.08)', filter: 'blur(80px)', pointerEvents: 'none',
            }} />

            <Card
                sx={{
                    width: '100%', maxWidth: 480, position: 'relative',
                    background: 'rgba(26,29,46,0.92)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(108,99,255,0.2)',
                }}
            >
                <CardContent sx={{ p: 4 }}>
                    {/* Logo */}
                    <Stack alignItems="center" mb={3.5} spacing={1.5}>
                        <Box sx={{
                            width: 56, height: 56, borderRadius: 3,
                            background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Business sx={{ color: '#fff', fontSize: 28 }} />
                        </Box>
                        <Typography variant="h5" fontWeight={700} color="white">
                            Tạo tổ chức mới
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                            Đăng ký để bắt đầu quản lý màn hình
                        </Typography>
                    </Stack>

                    {error && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <Stack spacing={2.5}>

                            {/* Org name */}
                            <TextField
                                label="Tên tổ chức"
                                value={orgName}
                                onChange={e => setOrgName(e.target.value)}
                                fullWidth
                                required
                                autoFocus
                                inputProps={{ maxLength: 100 }}
                                helperText="Tên hiển thị của tổ chức bạn"
                                sx={darkField}
                            />

                            {/* Slug */}
                            <Tooltip
                                title="Slug là định danh duy nhất, chỉ gồm chữ thường a-z, số 0-9 và dấu gạch ngang"
                                placement="right"
                            >
                                <TextField
                                    label="Slug tổ chức"
                                    value={slug}
                                    onChange={e => {
                                        setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                                        setSlugEdited(true);
                                    }}
                                    fullWidth
                                    required
                                    inputProps={{ maxLength: 50 }}
                                    error={slug.length > 0 && !slugValid}
                                    helperText={
                                        slug.length > 0 && !slugValid
                                            ? 'Chỉ được dùng chữ thường, số và dấu -'
                                            : 'Tự động tạo từ tên — không thể đổi sau khi tạo'
                                    }
                                    sx={darkField}
                                />
                            </Tooltip>

                            {/* Email */}
                            <TextField
                                label="Email Admin"
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                fullWidth
                                required
                                autoComplete="email"
                                helperText="Tài khoản Admin đầu tiên của tổ chức"
                                sx={darkField}
                            />

                            {/* Password */}
                            <Box>
                                <TextField
                                    label="Mật khẩu"
                                    type={showPw ? 'text' : 'password'}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    fullWidth
                                    required
                                    autoComplete="new-password"
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end">
                                                <IconButton
                                                    onClick={() => setShowPw(!showPw)}
                                                    edge="end"
                                                    sx={{ color: 'rgba(255,255,255,0.4)' }}
                                                >
                                                    {showPw ? <VisibilityOff /> : <Visibility />}
                                                </IconButton>
                                            </InputAdornment>
                                        ),
                                    }}
                                    sx={darkField}
                                />

                                {/* Password strength bar */}
                                {password.length > 0 && (
                                    <Box mt={1.25}>
                                        <LinearProgress
                                            variant="determinate"
                                            value={strength}
                                            color={STRENGTH_COLOR[Math.floor(strength / 34)]}
                                            sx={{ height: 4, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.08)' }}
                                        />
                                        <Stack mt={0.75} spacing={0.5}>
                                            {pwChecks.map(c => (
                                                <Stack key={c.label} direction="row" alignItems="center" gap={0.75}>
                                                    {c.ok
                                                        ? <CheckCircle sx={{ fontSize: 13, color: 'success.main' }} />
                                                        : <Cancel sx={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }} />
                                                    }
                                                    <Typography variant="caption" sx={{ color: c.ok ? 'success.main' : 'rgba(255,255,255,0.4)' }}>
                                                        {c.label}
                                                    </Typography>
                                                </Stack>
                                            ))}
                                        </Stack>
                                    </Box>
                                )}
                            </Box>

                            {/* Confirm password */}
                            <TextField
                                label="Xác nhận mật khẩu"
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPw}
                                onChange={e => setConfirmPw(e.target.value)}
                                fullWidth
                                required
                                autoComplete="new-password"
                                error={confirmPw.length > 0 && !confirmOk}
                                helperText={confirmPw.length > 0 && !confirmOk ? 'Mật khẩu không khớp' : ''}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                onClick={() => setShowConfirm(!showConfirm)}
                                                edge="end"
                                                sx={{ color: 'rgba(255,255,255,0.4)' }}
                                            >
                                                {showConfirm ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                                sx={darkField}
                            />

                            <Button
                                type="submit"
                                variant="contained"
                                fullWidth
                                size="large"
                                disabled={!canSubmit}
                                sx={{ mt: 0.5, py: 1.5, fontSize: '1rem' }}
                            >
                                {loading ? <CircularProgress size={22} color="inherit" /> : 'Tạo tổ chức'}
                            </Button>
                        </Stack>
                    </form>

                    {/* Link to login */}
                    <Stack direction="row" justifyContent="center" mt={3} gap={0.5}>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                            Đã có tài khoản?
                        </Typography>
                        <Typography
                            component={RouterLink}
                            to="/login"
                            variant="body2"
                            sx={{ color: '#6C63FF', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
                        >
                            Đăng nhập
                        </Typography>
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
}
