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

const ORG_ID_KEY   = 'cms_managing_org_id';
const ORG_NAME_KEY = 'cms_managing_org_name';

const initialState: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    managingOrgId:   localStorage.getItem(ORG_ID_KEY),
    managingOrgName: localStorage.getItem(ORG_NAME_KEY),
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
        },
        logout(state) {
            state.user = null;
            state.isAuthenticated = false;
            state.isLoading = false;
            state.managingOrgId = null;
            state.managingOrgName = null;
            setAccessToken(null);
            setManagingOrgId(null);
            localStorage.removeItem(ORG_ID_KEY);
            localStorage.removeItem(ORG_NAME_KEY);
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

export const { setCredentials, logout, setLoading, setManagingOrg } = authSlice.actions;
export default authSlice.reducer;
