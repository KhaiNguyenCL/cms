import { useEffect } from 'react';
import { Alert, Snackbar, Stack } from '@mui/material';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { removeToast } from '@store/slices/uiSlice';

export function ToastContainer() {
    const dispatch = useAppDispatch();
    const toasts = useAppSelector((s) => s.ui.toasts);

    return (
        <Stack
            spacing={1}
            sx={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, maxWidth: 400 }}
        >
            {toasts.map((toast) => (
                <Snackbar
                    key={toast.id}
                    open
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                    autoHideDuration={4000}
                    onClose={() => dispatch(removeToast(toast.id))}
                    sx={{ position: 'relative', mb: 0 }}
                >
                    <Alert
                        severity={toast.severity}
                        onClose={() => dispatch(removeToast(toast.id))}
                        variant="filled"
                        sx={{ width: '100%', borderRadius: 2, fontWeight: 500 }}
                    >
                        {toast.message}
                    </Alert>
                </Snackbar>
            ))}
        </Stack>
    );
}
