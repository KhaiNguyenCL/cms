import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, TextField, Button,
    IconButton, InputAdornment, Alert, CircularProgress, Stack,
    ThemeProvider, createTheme,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';

const lightTheme = createTheme({ palette: { mode: 'light' } });
import { useTranslation } from 'react-i18next';
import { useAppDispatch } from '@store/hooks';
import { setCredentials } from '@store/slices/authSlice';
import { authApi } from '@api/auth.api';

export default function LoginPage() {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const from = '/dashboard';

    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [showPw, setShowPw]     = useState(false);
    const [loading, setLoading]   = useState(false);
    const [error, setError]       = useState('');

    const passwordRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !password) return;
        setLoading(true);
        setError('');
        try {
            const data = await authApi.login(email, password);
            dispatch(setCredentials({ user: data.user, accessToken: data.accessToken }));
            navigate(from, { replace: true });
        } catch (err: unknown) {
            const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
            setError(msg ?? t('auth.loginFailed'));
        } finally {
            setLoading(false);
        }
    };

    // Enter ở Email → focus Password
    const handleEmailKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            passwordRef.current?.focus();
        }
    };

    return (
        <Box sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1D4ED8 0%, #2563EB 40%, #3B82F6 70%, #60A5FA 100%)',
            p: 2,
        }}>
            {/* Form card — always light mode regardless of app theme */}
            <ThemeProvider theme={lightTheme}>
            <Box sx={{
                width: '100%',
                maxWidth: 400,
                bgcolor: '#fff',
                borderRadius: 3,
                border: '1.5px solid #e2e8f0',
                boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
                p: { xs: 3, sm: 4 },
            }}>
                {/* Logo + title */}
                <Stack alignItems="center" mb={3.5} spacing={1}>
                    <img src="/logo-icon.png" alt="DMS Signage"
                        style={{ height: 64, width: 'auto', objectFit: 'contain' }} />
                    <Typography variant="h5" fontWeight={700} color="common.black">
                        DMS Signage
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t('auth.login')}
                    </Typography>
                </Stack>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <form onSubmit={handleSubmit}>
                    <Stack spacing={2}>
                        <TextField
                            label={t('auth.email')}
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={handleEmailKeyDown}
                            fullWidth
                            required
                            autoComplete="email"
                            autoFocus
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    '& fieldset': { borderColor: '#000', borderWidth: 1.5 },
                                    '&:hover fieldset': { borderColor: '#2563EB' },
                                    '&.Mui-focused fieldset': { borderColor: '#2563EB', borderWidth: 2 },
                                },
                                '& .MuiInputBase-input': { color: '#000' },
                                '& .MuiInputLabel-root': { color: '#555' },
                                '& .MuiInputLabel-root.Mui-focused': { color: '#2563EB' },
                            }}
                        />

                        <TextField
                            label={t('auth.password')}
                            type={showPw ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            fullWidth
                            required
                            autoComplete="current-password"
                            inputRef={passwordRef}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setShowPw(!showPw)} edge="end">
                                            {showPw ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                                        </IconButton>
                                    </InputAdornment>
                                ),
                            }}
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    '& fieldset': { borderColor: '#000', borderWidth: 1.5 },
                                    '&:hover fieldset': { borderColor: '#2563EB' },
                                    '&.Mui-focused fieldset': { borderColor: '#2563EB', borderWidth: 2 },
                                },
                                '& .MuiInputBase-input': { color: '#000' },
                                '& .MuiInputLabel-root': { color: '#555' },
                                '& .MuiInputLabel-root.Mui-focused': { color: '#2563EB' },
                            }}
                        />

                        <Button
                            type="submit"
                            variant="contained"
                            fullWidth
                            size="large"
                            disabled={loading}
                            sx={{
                                mt: 0.5, py: 1.25,
                                bgcolor: '#2563EB',
                                '&:hover': { bgcolor: '#1D4ED8' },
                                fontWeight: 600,
                                borderRadius: 2,
                                boxShadow: 'none',
                                fontSize: '0.9375rem',
                            }}
                        >
                            {loading ? <CircularProgress size={22} color="inherit" /> : t('auth.loginButton')}
                        </Button>
                    </Stack>
                </form>

                <Typography variant="caption" color="text.disabled" display="block" textAlign="center" mt={3}>
                    DMS Signage © {new Date().getFullYear()}
                </Typography>
            </Box>
            </ThemeProvider>
        </Box>
    );
}
