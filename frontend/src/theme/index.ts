/**
 * MUI Theme — dark/light mode with custom palette, typography (Inter).
 * Call createAppTheme(mode) to get a Theme object.
 */
import { createTheme, type PaletteMode } from '@mui/material/styles';

const FONT_FAMILY = '"Inter", "Roboto", "Helvetica", "Arial", sans-serif';

export function createAppTheme(mode: PaletteMode) {
    return createTheme({
        palette: {
            mode,
            ...(mode === 'dark'
                ? {
                    primary: { main: '#6C63FF', light: '#9B94FF', dark: '#4B44CC' },
                    secondary: { main: '#FF6584', light: '#FF92A9', dark: '#CC3D5C' },
                    success: { main: '#4CAF82' },
                    warning: { main: '#FFB547' },
                    error: { main: '#FF5C5C' },
                    info: { main: '#29B6F6' },
                    background: { default: '#0F1117', paper: '#1A1D2E' },
                    text: { primary: '#E8EBF0', secondary: '#8B92A5' },
                    divider: 'rgba(255,255,255,0.08)',
                }
                : {
                    primary: { main: '#6C63FF', light: '#9B94FF', dark: '#4B44CC' },
                    secondary: { main: '#FF6584', light: '#FF92A9', dark: '#CC3D5C' },
                    success: { main: '#2E7D32' },
                    warning: { main: '#ED6C02' },
                    error: { main: '#D32F2F' },
                    info: { main: '#0288D1' },
                    background: { default: '#F5F6FA', paper: '#FFFFFF' },
                    text: { primary: '#1A1D2E', secondary: '#5A6278' },
                    divider: 'rgba(0,0,0,0.08)',
                }),
        },

        typography: {
            fontFamily: FONT_FAMILY,
            h1: { fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em' },
            h2: { fontSize: '1.875rem', fontWeight: 700, letterSpacing: '-0.01em' },
            h3: { fontSize: '1.5rem', fontWeight: 600 },
            h4: { fontSize: '1.25rem', fontWeight: 600 },
            h5: { fontSize: '1.125rem', fontWeight: 600 },
            h6: { fontSize: '1rem', fontWeight: 600 },
            body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
            body2: { fontSize: '0.875rem', lineHeight: 1.57 },
            caption: { fontSize: '0.75rem', lineHeight: 1.5 },
        },

        shape: { borderRadius: 12 },

        components: {
            MuiCssBaseline: {
                styleOverrides: `
          * { box-sizing: border-box; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: transparent; }
          ::-webkit-scrollbar-thumb { background: rgba(108,99,255,0.4); border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: rgba(108,99,255,0.7); }
        `,
            },

            MuiButton: {
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 10,
                        boxShadow: 'none',
                        '&:hover': { boxShadow: 'none' },
                    },
                    containedPrimary: {
                        background: 'linear-gradient(135deg, #6C63FF 0%, #9B94FF 100%)',
                        '&:hover': {
                            background: 'linear-gradient(135deg, #5A52E0 0%, #8880E8 100%)',
                        },
                    },
                },
            },

            MuiCard: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 16,
                        boxShadow: theme.palette.mode === 'dark'
                            ? '0 4px 24px rgba(0,0,0,0.4)'
                            : '0 4px 24px rgba(108,99,255,0.08)',
                        backgroundImage: 'none',
                    }),
                },
            },

            MuiChip: {
                styleOverrides: {
                    root: { fontWeight: 600, borderRadius: 8 },
                },
            },

            MuiTableHead: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        '& .MuiTableCell-root': {
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.06em',
                            color: theme.palette.text.secondary,
                            borderBottom: `2px solid ${theme.palette.divider}`,
                        },
                    }),
                },
            },

            MuiTextField: {
                defaultProps: { variant: 'outlined', size: 'small' },
                styleOverrides: {
                    root: { '& .MuiOutlinedInput-root': { borderRadius: 10 } },
                },
            },

            MuiDrawer: {
                styleOverrides: {
                    paper: ({ theme }) => ({
                        borderRight: 'none',
                        background: theme.palette.mode === 'dark' ? '#12152a' : '#FFFFFF',
                    }),
                },
            },

            MuiAppBar: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        backgroundImage: 'none',
                        background: theme.palette.mode === 'dark' ? '#1A1D2E' : '#FFFFFF',
                        color: theme.palette.text.primary,
                        boxShadow: `0 1px 0 ${theme.palette.divider}`,
                    }),
                },
            },

            MuiTooltip: {
                defaultProps: { arrow: true },
            },
        },
    });
}
