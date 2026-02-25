import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

type ColorMode = 'light' | 'dark';

interface Toast {
    id: string;
    severity: 'success' | 'error' | 'warning' | 'info';
    message: string;
}

interface UiState {
    colorMode: ColorMode;
    sidebarOpen: boolean;
    toasts: Toast[];
}

const initialState: UiState = {
    colorMode: (localStorage.getItem('colorMode') as ColorMode) ?? 'dark',
    sidebarOpen: true,
    toasts: [],
};

const uiSlice = createSlice({
    name: 'ui',
    initialState,
    reducers: {
        toggleColorMode(state) {
            state.colorMode = state.colorMode === 'light' ? 'dark' : 'light';
            localStorage.setItem('colorMode', state.colorMode);
        },
        setSidebarOpen(state, action: PayloadAction<boolean>) {
            state.sidebarOpen = action.payload;
        },
        pushToast(state, action: PayloadAction<Omit<Toast, 'id'>>) {
            state.toasts.push({ id: Date.now().toString(), ...action.payload });
        },
        removeToast(state, action: PayloadAction<string>) {
            state.toasts = state.toasts.filter((t) => t.id !== action.payload);
        },
    },
});

export const { toggleColorMode, setSidebarOpen, pushToast, removeToast } = uiSlice.actions;
export default uiSlice.reducer;
