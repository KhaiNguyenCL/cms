import { useState } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, TextField, Button,
    IconButton, InputAdornment, Alert, CircularProgress, Stack,
} from '@mui/material';
import { Visibility, VisibilityOff, LockOutlined } from '@mui/icons-material';
import { useAppDispatch } from '@store/hooks';
import { setCredentials } from '@store/slices/authSlice';
import { authApi } from '@api/auth.api';

export default function LoginPage() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        setError('');
        try {
            const data = await authApi.login(email, password);
            dispatch(setCredentials({
                user: data.user,
                accessToken: data.accessToken,
            }));
            navigate(from, { replace: true });
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(msg ?? 'Email hoặc mật khẩu không đúng');
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
                position: 'absolute', top: '15%', left: '10%', width: 300, height: 300,
                borderRadius: '50%', background: 'rgba(108,99,255,0.12)', filter: 'blur(80px)', pointerEvents: 'none',
            }} />
            <Box sx={{
                position: 'absolute', bottom: '15%', right: '10%', width: 250, height: 250,
                borderRadius: '50%', background: 'rgba(255,101,132,0.1)', filter: 'blur(80px)', pointerEvents: 'none',
            }} />

            <Card
                sx={{
                    width: '100%', maxWidth: 420, position: 'relative',
                    background: 'rgba(26,29,46,0.9)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(108,99,255,0.2)',
                }}
            >
                <CardContent sx={{ p: 4 }}>
                    {/* Logo */}
                    <Stack alignItems="center" mb={4} spacing={1.5}>
                        <Box
                            sx={{
                                width: 56, height: 56, borderRadius: 3,
                                background: 'linear-gradient(135deg, #6C63FF, #FF6584)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <LockOutlined sx={{ color: '#fff', fontSize: 28 }} />
                        </Box>
                        <Typography variant="h5" fontWeight={700} color="white">
                            SignageCMS
                        </Typography>
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                            Đăng nhập để tiếp tục
                        </Typography>
                    </Stack>

                    {error && (
                        <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                            {error}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        <Stack spacing={2.5}>
                            <TextField
                                label="Email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                fullWidth
                                required
                                autoComplete="email"
                                autoFocus
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: 'white',
                                        '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                                        '&:hover fieldset': { borderColor: 'rgba(108,99,255,0.5)' },
                                        '&.Mui-focused fieldset': { borderColor: '#6C63FF' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
                                    '& .MuiInputLabel-root.Mui-focused': { color: '#6C63FF' },
                                }}
                            />

                            <TextField
                                label="Password"
                                type={showPw ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                fullWidth
                                required
                                autoComplete="current-password"
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
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: 'white',
                                        '& fieldset': { borderColor: 'rgba(255,255,255,0.15)' },
                                        '&:hover fieldset': { borderColor: 'rgba(108,99,255,0.5)' },
                                        '&.Mui-focused fieldset': { borderColor: '#6C63FF' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.5)' },
                                    '& .MuiInputLabel-root.Mui-focused': { color: '#6C63FF' },
                                }}
                            />

                            <Button
                                type="submit"
                                variant="contained"
                                fullWidth
                                size="large"
                                disabled={loading}
                                sx={{ mt: 1, py: 1.5, fontSize: '1rem' }}
                            >
                                {loading ? <CircularProgress size={22} color="inherit" /> : 'Đăng nhập'}
                            </Button>
                        </Stack>
                    </form>

                {/* Link to register */}
                <Stack direction="row" justifyContent="center" mt={3} gap={0.5}>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        Chưa có tài khoản?
                    </Typography>
                    <Typography
                        component={RouterLink}
                        to="/register"
                        variant="body2"
                        sx={{ color: '#6C63FF', textDecoration: 'none', fontWeight: 600, '&:hover': { textDecoration: 'underline' } }}
                    >
                        Tạo tổ chức mới
                    </Typography>
                </Stack>
                </CardContent>
            </Card>
        </Box>
    );
}
