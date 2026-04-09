/**
 * MUI Theme — clean, modern dashboard design.
 * Supports dark / light mode. All component overrides live here
 * so individual pages stay free of repetitive sx styling.
 */
import { createTheme, alpha, type PaletteMode } from '@mui/material/styles';

const FONT = '"Inter", "Roboto", "Helvetica", "Arial", sans-serif';

// ─── Palette tokens ───────────────────────────────────────────────────────────

const LIGHT = {
    primary:    { main: '#2563EB', light: '#60A5FA', dark: '#1D4ED8', contrastText: '#fff' },
    secondary:  { main: '#FF6584', light: '#FF92A9', dark: '#CC3D5C', contrastText: '#fff' },
    success:    { main: '#16A34A', light: '#22C55E', dark: '#15803D', contrastText: '#fff' },
    warning:    { main: '#D97706', light: '#F59E0B', dark: '#B45309', contrastText: '#fff' },
    error:      { main: '#DC2626', light: '#EF4444', dark: '#B91C1C', contrastText: '#fff' },
    info:       { main: '#0284C7', light: '#38BDF8', dark: '#0369A1', contrastText: '#fff' },
    background: { default: '#F5F7FA', paper: '#FFFFFF' },
    text:       { primary: '#111827', secondary: '#6B7280', disabled: '#9CA3AF' },
    divider:    'rgba(0,0,0,0.07)',
};

const DARK = {
    primary:    { main: '#3B82F6', light: '#93C5FD', dark: '#2563EB', contrastText: '#fff' },
    secondary:  { main: '#FF6584', light: '#FF92A9', dark: '#CC3D5C', contrastText: '#fff' },
    success:    { main: '#22C55E', light: '#4ADE80', dark: '#16A34A', contrastText: '#fff' },
    warning:    { main: '#F59E0B', light: '#FBBF24', dark: '#D97706', contrastText: '#fff' },
    error:      { main: '#EF4444', light: '#F87171', dark: '#DC2626', contrastText: '#fff' },
    info:       { main: '#38BDF8', light: '#7DD3FC', dark: '#0284C7', contrastText: '#fff' },
    background: { default: '#0F1117', paper: '#1A1D2E' },
    text:       { primary: '#F1F5F9', secondary: '#94A3B8', disabled: '#64748B' },
    divider:    'rgba(255,255,255,0.07)',
};

// ─── Theme factory ────────────────────────────────────────────────────────────

export function createAppTheme(mode: PaletteMode) {
    const isDark = mode === 'dark';
    const p = isDark ? DARK : LIGHT;

    return createTheme({
        palette: { mode, ...p },

        // ── Typography ────────────────────────────────────────────────────────
        typography: {
            fontFamily: FONT,
            h4: { fontSize: '1.375rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 },
            h5: { fontSize: '1.125rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.4 },
            h6: { fontSize: '1rem',     fontWeight: 600, lineHeight: 1.4 },
            subtitle1: { fontSize: '0.9375rem', fontWeight: 600, lineHeight: 1.5 },
            subtitle2: { fontSize: '0.875rem',  fontWeight: 600, lineHeight: 1.5 },
            body1:   { fontSize: '0.9375rem', lineHeight: 1.6 },
            body2:   { fontSize: '0.875rem',  lineHeight: 1.55 },
            caption: { fontSize: '0.75rem',   lineHeight: 1.5, letterSpacing: '0.01em' },
            overline:{ fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.09em', lineHeight: 1.4 },
        },

        shape: { borderRadius: 10 },

        // ── Shadows — only 3 levels needed ───────────────────────────────────
        shadows: [
            'none',
            isDark
                ? '0 1px 3px rgba(0,0,0,0.4)'
                : '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
            isDark
                ? '0 4px 12px rgba(0,0,0,0.5)'
                : '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
            isDark
                ? '0 8px 24px rgba(0,0,0,0.6)'
                : '0 8px 24px rgba(0,0,0,0.10)',
            ...Array(21).fill('none'),
        ] as any,

        // ── Component overrides ───────────────────────────────────────────────
        components: {

            // ── Scrollbar ──────────────────────────────────────────────────
            MuiCssBaseline: {
                styleOverrides: `
                    * { box-sizing: border-box; }
                    ::-webkit-scrollbar { width: 5px; height: 5px; }
                    ::-webkit-scrollbar-track { background: transparent; }
                    ::-webkit-scrollbar-thumb { background: ${alpha('#2563EB', 0.28)}; border-radius: 4px; }
                    ::-webkit-scrollbar-thumb:hover { background: ${alpha('#2563EB', 0.55)}; }
                    html { scroll-behavior: smooth; }
                `,
            },

            // ── Button ─────────────────────────────────────────────────────
            MuiButton: {
                defaultProps: { disableElevation: true, disableRipple: false, variant: 'outlined' },
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                        fontWeight: 500,
                        borderRadius: 8,
                        letterSpacing: '0.01em',
                        transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                    },
                    sizeSmall: {
                        fontSize: '0.8125rem',
                        padding: '5px 14px',
                        '& .MuiButton-startIcon': { marginRight: 5 },
                    },
                    sizeMedium: { fontSize: '0.875rem', padding: '7px 18px' },
                    sizeLarge:  { fontSize: '0.9375rem', padding: '10px 24px' },

                    // Contained
                    containedPrimary: ({ theme }) => ({
                        backgroundColor: theme.palette.primary.main,
                        '&:hover': { backgroundColor: theme.palette.primary.dark },
                        '&:active': { backgroundColor: theme.palette.primary.dark },
                    }),
                    containedError: ({ theme }) => ({
                        backgroundColor: theme.palette.error.main,
                        '&:hover': { backgroundColor: theme.palette.error.dark },
                    }),
                    containedSuccess: ({ theme }) => ({
                        backgroundColor: theme.palette.success.main,
                        '&:hover': { backgroundColor: theme.palette.success.dark },
                    }),

                    // Outlined
                    outlinedPrimary: ({ theme }) => ({
                        borderColor: alpha(theme.palette.primary.main, 0.45),
                        color: theme.palette.primary.main,
                        '&:hover': {
                            borderColor: theme.palette.primary.main,
                            backgroundColor: alpha(theme.palette.primary.main, 0.05),
                        },
                    }),
                    outlinedError: ({ theme }) => ({
                        borderColor: alpha(theme.palette.error.main, 0.45),
                        '&:hover': { borderColor: theme.palette.error.main, backgroundColor: alpha(theme.palette.error.main, 0.05) },
                    }),

                    // Text
                    textPrimary: ({ theme }) => ({
                        '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.06) },
                    }),
                    textError: ({ theme }) => ({
                        '&:hover': { backgroundColor: alpha(theme.palette.error.main, 0.06) },
                    }),
                },
            },

            // ── Icon Button ────────────────────────────────────────────────
            MuiIconButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 8,
                        transition: 'background-color 0.15s ease',
                        '&:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.06) },
                    }),
                    sizeSmall: { padding: 5 },
                    sizeMedium: { padding: 8 },
                },
            },

            // ── Card ───────────────────────────────────────────────────────
            MuiCard: {
                defaultProps: { variant: 'outlined' },
                styleOverrides: {
                    root: {
                        borderRadius: 12,
                        backgroundImage: 'none',
                        transition: 'box-shadow 0.2s ease',
                    },
                },
            },

            // ── Paper ──────────────────────────────────────────────────────
            MuiPaper: {
                styleOverrides: {
                    root: { backgroundImage: 'none' },
                    rounded: { borderRadius: 12 },
                    outlined: ({ theme }) => ({
                        borderColor: theme.palette.divider,
                    }),
                    elevation1: { boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.06)' },
                    elevation2: { boxShadow: isDark ? '0 4px 16px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.09)' },
                },
            },

            // ── Chip ───────────────────────────────────────────────────────
            MuiChip: {
                styleOverrides: {
                    root: {
                        fontWeight: 500,
                        borderRadius: 6,
                        fontSize: '0.75rem',
                        letterSpacing: '0.01em',
                    },
                    sizeSmall: { height: 22, fontSize: '0.7rem' },
                    // Make filled chips a bit softer — less saturated bg
                    colorSuccess: ({ theme }) => ({
                        '&.MuiChip-filled': {
                            backgroundColor: alpha(theme.palette.success.main, isDark ? 0.18 : 0.12),
                            color: theme.palette.success[isDark ? 'light' : 'dark'],
                        },
                    }),
                    colorWarning: ({ theme }) => ({
                        '&.MuiChip-filled': {
                            backgroundColor: alpha(theme.palette.warning.main, isDark ? 0.18 : 0.12),
                            color: theme.palette.warning[isDark ? 'light' : 'dark'],
                        },
                    }),
                    colorError: ({ theme }) => ({
                        '&.MuiChip-filled': {
                            backgroundColor: alpha(theme.palette.error.main, isDark ? 0.18 : 0.10),
                            color: theme.palette.error[isDark ? 'light' : 'dark'],
                        },
                    }),
                    colorPrimary: ({ theme }) => ({
                        '&.MuiChip-filled': {
                            backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.2 : 0.1),
                            color: theme.palette.primary[isDark ? 'light' : 'dark'],
                        },
                    }),
                },
            },

            // ── Table — the centrepiece ────────────────────────────────────
            MuiTableHead: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        '& .MuiTableCell-root': {
                            fontWeight: 700,
                            fontSize: '0.6875rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.07em',
                            color: isDark ? 'rgba(255,255,255,0.75)' : '#111827',
                            backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.022)',
                            borderBottom: `1px solid ${theme.palette.divider}`,
                            padding: '10px 16px',
                            whiteSpace: 'nowrap',
                            lineHeight: 1.4,
                        },
                    }),
                },
            },

            MuiTableBody: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        '& .MuiTableRow-root': {
                            transition: 'background-color 0.1s ease',
                        },
                        '& .MuiTableRow-root:hover': {
                            backgroundColor: isDark
                                ? 'rgba(255,255,255,0.03)'
                                : 'rgba(37,99,235,0.032)',
                        },
                        // No border on very last row
                        '& .MuiTableRow-root:last-child .MuiTableCell-root': {
                            borderBottom: 'none',
                        },
                    }),
                },
            },

            MuiTableCell: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderBottom: `1px solid ${theme.palette.divider}`,
                        padding: '10px 16px',
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        // All Typography inside body cells inherits cell font size
                        // except caption used intentionally for secondary sub-text
                        '& .MuiTypography-body2': { fontSize: '0.875rem' },
                        // Empty dash helper — add data-empty attr on TableCell
                        '&[data-empty]': {
                            textAlign: 'center',
                            color: theme.palette.text.disabled,
                        },
                    }),
                },
            },

            MuiTableRow: {
                styleOverrides: {
                    root: { '&.Mui-selected': { backgroundColor: alpha(p.primary.main, isDark ? 0.18 : 0.07) } },
                },
            },

            MuiTableSortLabel: {
                styleOverrides: {
                    root: {
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                    },
                },
            },

            // ── Inputs ─────────────────────────────────────────────────────
            MuiTextField: {
                defaultProps: { variant: 'outlined', size: 'small' },
            },

            MuiOutlinedInput: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 8,
                        fontSize: '0.875rem',
                        transition: 'box-shadow 0.15s ease',
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderWidth: 1.5,
                            borderColor: theme.palette.primary.main,
                            boxShadow: `0 0 0 3px ${alpha(theme.palette.primary.main, 0.12)}`,
                        },
                        '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: alpha(theme.palette.primary.main, 0.55),
                        },
                    }),
                    input: {
                        padding: '8px 12px',
                        '&::placeholder': { opacity: 0.55 },
                    },
                    sizeSmall: { '& input': { padding: '6.5px 12px' } },
                },
            },

            MuiInputLabel: {
                styleOverrides: {
                    root: { fontSize: '0.875rem' },
                    sizeSmall: { fontSize: '0.8125rem' },
                },
            },

            MuiSelect: {
                styleOverrides: {
                    outlined: { borderRadius: 8 },
                },
            },

            MuiAutocomplete: {
                styleOverrides: {
                    paper: { borderRadius: 10, boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.12)' },
                    listbox: { padding: '4px' },
                    option: ({ theme }) => ({
                        borderRadius: 6,
                        margin: '1px 4px',
                        fontSize: '0.875rem',
                        padding: '7px 10px',
                        '&[aria-selected="true"]': {
                            fontWeight: 600,
                            backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.2 : 0.08),
                        },
                    }),
                },
            },

            // ── Dialog ─────────────────────────────────────────────────────
            MuiDialog: {
                styleOverrides: {
                    paper: { borderRadius: 14, backgroundImage: 'none' },
                },
            },

            MuiDialogTitle: {
                styleOverrides: {
                    root: { fontSize: '1rem', fontWeight: 700, padding: '20px 24px 0' },
                },
            },

            MuiDialogContent: {
                styleOverrides: {
                    root: { padding: '16px 24px' },
                    dividers: {
                        padding: '20px 24px',
                        borderTop: 'none',
                        borderBottom: 'none',
                    },
                },
            },

            MuiDialogActions: {
                styleOverrides: {
                    root: {
                        padding: '0 24px 20px',
                        '& > :not(:first-of-type)': { marginLeft: 8 },
                    },
                },
            },

            // ── Drawer & AppBar ─────────────────────────────────────────────
            MuiDrawer: {
                styleOverrides: {
                    paper: {
                        borderRight: 'none',
                        background: isDark ? '#12152A' : '#FFFFFF',
                        boxShadow: isDark ? 'none' : `1px 0 0 ${LIGHT.divider}`,
                    },
                },
            },

            MuiAppBar: {
                styleOverrides: {
                    root: {
                        backgroundImage: 'none',
                        background: isDark ? DARK.background.paper : LIGHT.background.paper,
                        color: isDark ? DARK.text.primary : LIGHT.text.primary,
                        boxShadow: `0 1px 0 ${isDark ? DARK.divider : LIGHT.divider}`,
                    },
                },
            },

            // ── Feedback ───────────────────────────────────────────────────
            MuiAlert: {
                styleOverrides: {
                    root: { borderRadius: 8, fontSize: '0.875rem', alignItems: 'center' },
                    standardSuccess: { fontWeight: 500 },
                    outlinedSuccess: { fontWeight: 500 },
                },
            },

            MuiTooltip: {
                defaultProps: { arrow: true, enterDelay: 300 },
                styleOverrides: {
                    tooltip: ({ theme }) => ({
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        borderRadius: 6,
                        padding: '5px 10px',
                        backgroundColor: isDark ? '#2D3149' : theme.palette.grey[800],
                    }),
                    arrow: ({ theme }) => ({
                        color: isDark ? '#2D3149' : theme.palette.grey[800],
                    }),
                },
            },

            MuiLinearProgress: {
                styleOverrides: {
                    root: { borderRadius: 4, height: 6 },
                },
            },

            MuiCircularProgress: {
                defaultProps: { thickness: 3.5 },
            },

            MuiSkeleton: {
                defaultProps: { animation: 'wave' },
                styleOverrides: {
                    root: { borderRadius: 6 },
                },
            },

            // ── Misc ───────────────────────────────────────────────────────
            MuiDivider: {
                styleOverrides: {
                    root: ({ theme }) => ({ borderColor: theme.palette.divider }),
                },
            },

            MuiPopover: {
                styleOverrides: {
                    paper: {
                        borderRadius: 10,
                        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.12)',
                    },
                },
            },

            MuiMenu: {
                styleOverrides: {
                    paper: {
                        borderRadius: 10,
                        boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.12)',
                    },
                    list: { padding: '4px' },
                },
            },

            MuiMenuItem: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 6,
                        fontSize: '0.875rem',
                        margin: '1px 4px',
                        padding: '6px 10px',
                        '&:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.05) },
                        '&.Mui-selected': {
                            fontWeight: 600,
                            backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.18 : 0.07),
                            '&:hover': { backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.24 : 0.10) },
                        },
                    }),
                },
            },

            MuiListItemButton: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        borderRadius: 8,
                        '&:hover': { backgroundColor: alpha(theme.palette.text.primary, 0.05) },
                        '&.Mui-selected': {
                            backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.18 : 0.08),
                            '&:hover': { backgroundColor: alpha(theme.palette.primary.main, isDark ? 0.24 : 0.12) },
                        },
                    }),
                },
            },

            MuiTab: {
                styleOverrides: {
                    root: {
                        textTransform: 'none',
                        fontWeight: 500,
                        fontSize: '0.875rem',
                        minHeight: 44,
                    },
                },
            },

            MuiTabs: {
                styleOverrides: {
                    indicator: { height: 2, borderRadius: '2px 2px 0 0' },
                },
            },

            MuiPagination: {
                defaultProps: { variant: 'outlined', shape: 'rounded', size: 'small' },
            },

            MuiBadge: {
                styleOverrides: {
                    badge: { fontSize: '0.65rem', fontWeight: 700, minWidth: 18, height: 18, padding: '0 4px' },
                },
            },

            // ── SvgIcon — ensure icons follow theme text color in dark mode ──
            MuiSvgIcon: {
                styleOverrides: {
                    root: ({ theme }) => ({
                        color: 'inherit',
                        // When no explicit color context, fallback to text.primary
                        '.MuiBox-root > &, .MuiStack-root > &': {
                            color: theme.palette.text.primary,
                        },
                    }),
                },
            },
        },
    });
}
