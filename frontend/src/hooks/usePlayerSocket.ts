/**
 * Socket.IO hook for the web player — connects to /device namespace.
 * Listens for content/schedule update events and triggers a sync callback.
 * Also exposes an emit() function so the player can push logs/errors to the server.
 */
import { useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface SyncStateEvent {
    storeId: string;
    startEpoch: number | null;
    totalDurationMs: number | null;
    playlistId: string | null;
}

export function usePlayerSocket(
    token: string | null,
    onSync: () => void,
    onSyncState?: (state: SyncStateEvent) => void,
): { emit: (event: string, data?: Record<string, unknown>) => void } {
    const socketRef = useRef<Socket | null>(null);
    const onSyncRef = useRef(onSync);
    const onSyncStateRef = useRef(onSyncState);
    onSyncRef.current = onSync;
    onSyncStateRef.current = onSyncState;

    useEffect(() => {
        if (!token) return;

        const socket = io('/device', {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionAttempts: Infinity,
        });

        socketRef.current = socket;

        // Add random jitter (0–3s) so devices don't all hit /api/device/sync
        // at the same millisecond after a broadcast. Kept small for fast UX.
        const handleSync = () => {
            const jitter = Math.random() * 3_000;
            setTimeout(() => onSyncRef.current(), jitter);
        };
        // Immediate reload on explicit command — no jitter needed
        const handleReload = () => onSyncRef.current();
        // sync.state: admin started/restarted/stopped a sync group
        // Player must immediately recalculate position or exit sync mode
        const handleSyncState = (data: SyncStateEvent) => {
            onSyncStateRef.current?.(data);
        };

        socket.on('content.update', handleSync);
        socket.on('schedule.update', handleSync);
        socket.on('command.reload_content', handleReload);
        socket.on('sync.state', handleSyncState);

        return () => {
            socket.off('content.update', handleSync);
            socket.off('schedule.update', handleSync);
            socket.off('command.reload_content', handleReload);
            socket.off('sync.state', handleSyncState);
            socket.disconnect();
            socketRef.current = null;
        };
    }, [token]);

    const emit = useCallback((event: string, data?: Record<string, unknown>) => {
        socketRef.current?.emit(event, data ?? {});
    }, []);

    return { emit };
}
