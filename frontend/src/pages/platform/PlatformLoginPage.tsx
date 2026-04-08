import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, TextField, Button,
    IconButton, InputAdornment, Alert, CircularProgress, Stack, Chip,
} from '@mui/material';
import { Visibility, VisibilityOff, AdminPanelSettings } from '@mui/icons-material';
import { useAppDispatch } from '@store/hooks';
import { setPlatformAdminCredentials } from '@store/slices/authSlice';
import { platformAuthApi } from '@api/platform-auth.api';

export default function PlatformLoginPage() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();

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
            const result = await platformAuthApi.login(email, password);
            dispatch(setPlatformAdminCredentials({
                admin: result.admin,
                accessToken: result.accessToken,
            }));
            navigate('/super-admin', { replace: true });
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
                background: 'linear-gradient(135deg, #0D0D12 0%, #12101A 50%, #0D1220 100%)',
                p: 2,
            }}
        >
            {/* Decorative blobs */}
            <Box sx={{
                position: 'absolute', top: '15%', left: '10%', width: 300, height: 300,
                borderRadius: '50%', background: 'rgba(255,50,50,0.08)', filter: 'blur(80px)', pointerEvents: 'none',
            }} />
            <Box sx={{
                position: 'absolute', bottom: '15%', right: '10%', width: 250, height: 250,
                borderRadius: '50%', background: 'rgba(200,50,255,0.07)', filter: 'blur(80px)', pointerEvents: 'none',
            }} />

            <Card
                sx={{
                    width: '100%', maxWidth: 420, position: 'relative',
                    background: 'rgba(18,16,26,0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(220,50,50,0.25)',
                }}
            >
                <CardContent sx={{ p: 4 }}>
                    <Stack alignItems="center" mb={4} spacing={1.5}>
                        <Box
                            sx={{
                                width: 56, height: 56, borderRadius: 3,
                                background: 'linear-gradient(135deg, #c0392b, #8e44ad)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                        >
                            <AdminPanelSettings sx={{ color: '#fff', fontSize: 28 }} />
                        </Box>
                        <Typography variant="h5" fontWeight={700} color="white">
                            Platform Admin
                        </Typography>
                        <Chip
                            label="SYSTEM ACCESS"
                            size="small"
                            sx={{
                                bgcolor: 'rgba(220,50,50,0.15)',
                                color: '#ff6b6b',
                                border: '1px solid rgba(220,50,50,0.3)',
                                fontWeight: 700,
                                fontSize: '0.65rem',
                                letterSpacing: 1,
                            }}
                        />
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                            Đăng nhập quản trị hệ thống
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
                                fullWidth required autoFocus autoComplete="email"
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: 'white',
                                        '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
                                        '&:hover fieldset': { borderColor: 'rgba(200,50,50,0.5)' },
                                        '&.Mui-focused fieldset': { borderColor: '#c0392b' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.45)' },
                                    '& .MuiInputLabel-root.Mui-focused': { color: '#e74c3c' },
                                }}
                            />

                            <TextField
                                label="Password"
                                type={showPw ? 'text' : 'password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                fullWidth required autoComplete="current-password"
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowPw(!showPw)} edge="end"
                                                sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                                {showPw ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                                sx={{
                                    '& .MuiOutlinedInput-root': {
                                        color: 'white',
                                        '& fieldset': { borderColor: 'rgba(255,255,255,0.12)' },
                                        '&:hover fieldset': { borderColor: 'rgba(200,50,50,0.5)' },
                                        '&.Mui-focused fieldset': { borderColor: '#c0392b' },
                                    },
                                    '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.45)' },
                                    '& .MuiInputLabel-root.Mui-focused': { color: '#e74c3c' },
                                }}
                            />

                            <Button
                                type="submit"
                               
                                fullWidth size="large"
                                disabled={loading}
                                sx={{
                                    mt: 1, py: 1.5, fontSize: '1rem',
                                    background: 'linear-gradient(135deg, #c0392b, #8e44ad)',
                                    '&:hover': { background: 'linear-gradient(135deg, #e74c3c, #9b59b6)' },
                                }}
                            >
                                {loading ? <CircularProgress size={22} color="inherit" /> : 'Đăng nhập'}
                            </Button>
                        </Stack>
                    </form>
                </CardContent>
            </Card>
        </Box>
    );
}
