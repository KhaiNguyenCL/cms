import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { setAccessToken, setManagingOrgId } from '@api/client';
import type { User } from '@/types';

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    managingOrgId: string | null;
    managingOrgName: string | null;
}

const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,  // true khi khởi động, đến khi check token xong
    managingOrgId: null,
    managingOrgName: null,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setCredentials(state, action: PayloadAction<{ user: User; accessToken: string }>) {
            state.user = action.payload.user;
            state.isAuthenticated = true;
            state.isLoading = false;
            setAccessToken(action.payload.accessToken);
            // Refresh token do server set qua HttpOnly cookie — không cần xử lý ở đây
        },
        logout(state) {
            state.user = null;
            state.isAuthenticated = false;
            state.isLoading = false;
            state.managingOrgId = null;
            state.managingOrgName = null;
            setAccessToken(null);
            setManagingOrgId(null);
            // Cookie sẽ bị xóa bởi server khi gọi POST /api/auth/logout
        },
        setLoading(state, action: PayloadAction<boolean>) {
            state.isLoading = action.payload;
        },
        setManagingOrg(state, action: PayloadAction<{ orgId: string; orgName: string } | null>) {
            state.managingOrgId = action.payload?.orgId ?? null;
            state.managingOrgName = action.payload?.orgName ?? null;
            setManagingOrgId(action.payload?.orgId ?? null);
        },
    },
});

export const { setCredentials, logout, setLoading, setManagingOrg } = authSlice.actions;
export default authSlice.reducer;
