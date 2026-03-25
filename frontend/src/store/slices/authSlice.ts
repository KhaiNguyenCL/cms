import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { setAccessToken, setManagingOrgId, setIsPlatformAdmin } from '@api/client';
import type { User } from '@/types';

export interface PlatformAdminInfo {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    lastLoginAt: string | null;
    createdAt: string;
    updatedAt: string;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    managingOrgId: string | null;
    managingOrgName: string | null;
    // Platform admin session (separate from regular user session)
    isPlatformAdmin: boolean;
    platformAdmin: PlatformAdminInfo | null;
}

const ORG_ID_KEY   = 'cms_managing_org_id';
const ORG_NAME_KEY = 'cms_managing_org_name';

const PA_KEY = 'cms_is_platform_admin';

const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    // Restore from localStorage so org context survives page reload
    managingOrgId:   localStorage.getItem(ORG_ID_KEY),
    managingOrgName: localStorage.getItem(ORG_NAME_KEY),
    isPlatformAdmin: localStorage.getItem(PA_KEY) === '1',
    platformAdmin: null,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        setCredentials(state, action: PayloadAction<{ user: User; accessToken: string }>) {
            state.user = action.payload.user;
            state.isAuthenticated = true;
            state.isLoading = false;
            state.isPlatformAdmin = false;
            state.platformAdmin = null;
            setAccessToken(action.payload.accessToken);
            setIsPlatformAdmin(false);
            localStorage.removeItem(PA_KEY);
        },
        setPlatformAdminCredentials(state, action: PayloadAction<{ admin: PlatformAdminInfo; accessToken: string }>) {
            state.platformAdmin = action.payload.admin;
            state.isAuthenticated = true;
            state.isLoading = false;
            state.isPlatformAdmin = true;
            state.user = null;
            setAccessToken(action.payload.accessToken);
            setIsPlatformAdmin(true);
            localStorage.setItem(PA_KEY, '1');
        },
        logout(state) {
            state.user = null;
            state.platformAdmin = null;
            state.isAuthenticated = false;
            state.isLoading = false;
            state.isPlatformAdmin = false;
            state.managingOrgId = null;
            state.managingOrgName = null;
            setAccessToken(null);
            setManagingOrgId(null);
            setIsPlatformAdmin(false);
            localStorage.removeItem(ORG_ID_KEY);
            localStorage.removeItem(ORG_NAME_KEY);
            localStorage.removeItem(PA_KEY);
            // Cookie sẽ bị xóa bởi server khi gọi POST /api/auth/logout hoặc /api/platform/logout
        },
        setLoading(state, action: PayloadAction<boolean>) {
            state.isLoading = action.payload;
        },
        setManagingOrg(state, action: PayloadAction<{ orgId: string; orgName: string } | null>) {
            state.managingOrgId = action.payload?.orgId ?? null;
            state.managingOrgName = action.payload?.orgName ?? null;
            setManagingOrgId(action.payload?.orgId ?? null);
            if (action.payload) {
                localStorage.setItem(ORG_ID_KEY, action.payload.orgId);
                localStorage.setItem(ORG_NAME_KEY, action.payload.orgName);
            } else {
                localStorage.removeItem(ORG_ID_KEY);
                localStorage.removeItem(ORG_NAME_KEY);
            }
        },
    },
});

export const { setCredentials, setPlatformAdminCredentials, logout, setLoading, setManagingOrg } = authSlice.actions;
export default authSlice.reducer;
