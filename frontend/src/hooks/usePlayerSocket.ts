/**
 * Socket.IO hook for the web player — connects to /device namespace.
 * Listens for content/schedule update events and triggers a sync callback.
 * Also exposes an emit() function so the player can push logs/errors to the server.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

export interface SyncStateEvent {
    siteId: string;
    startEpoch: number | null;
    totalDurationMs: number | null;
    playlistId: string | null;
}

export type ContentUpdateType = 'CONTENT' | 'META';

export function usePlayerSocket(
    token: string | null,
    onSync: (updateType: ContentUpdateType) => void,
    onSyncState?: (state: SyncStateEvent) => void,
): { emit: (event: string, data?: Record<string, unknown>) => void; isConnected: boolean } {
    const socketRef = useRef<Socket | null>(null);
    const onSyncRef = useRef(onSync);
    const onSyncStateRef = useRef(onSyncState);
    onSyncRef.current = onSync;
    onSyncStateRef.current = onSyncState;

    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!token) { setIsConnected(false); return; }

        const socket = io('/device', {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionAttempts: Infinity,
        });

        socketRef.current = socket;

        // Debounce: collapse rapid-fire content.update events into a single doSync call.
        // If any event in the burst is CONTENT, the whole batch is treated as CONTENT.
        // Random jitter prevents thundering-herd when many devices receive the same broadcast.
        let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
        let pendingUpdateType: ContentUpdateType = 'META';
        const handleSync = (data?: { updateType?: ContentUpdateType }) => {
            // Escalate: once CONTENT is seen, keep it even if later events are META
            if ((data?.updateType ?? 'CONTENT') === 'CONTENT') pendingUpdateType = 'CONTENT';
            if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
            const jitter = Math.random() * 500; // 0–0.5s jitter within the debounce window
            syncDebounceTimer = setTimeout(() => {
                syncDebounceTimer = null;
                const type = pendingUpdateType;
                pendingUpdateType = 'META'; // reset for next burst
                onSyncRef.current(type);
            }, 1500 + jitter); // 1.5–2s debounce: waits for burst to settle
        };
        // Immediate reload on explicit command — always treat as CONTENT
        const handleReload = () => onSyncRef.current('CONTENT');
        // sync.state: admin started/restarted/stopped a sync group
        // Player must immediately recalculate position or exit sync mode
        const handleSyncState = (data: SyncStateEvent) => {
            onSyncStateRef.current?.(data);
        };

        socket.on('connect',    () => setIsConnected(true));
        socket.on('disconnect', () => setIsConnected(false));
        socket.on('content.update', handleSync);
        socket.on('schedule.update', handleSync);
        socket.on('command.reload_content', handleReload);
        socket.on('sync.state', handleSyncState);

        return () => {
            if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
            socket.off('connect');
            socket.off('disconnect');
            socket.off('content.update', handleSync);
            socket.off('schedule.update', handleSync);
            socket.off('command.reload_content', handleReload);
            socket.off('sync.state', handleSyncState);
            socket.disconnect();
            socketRef.current = null;
            setIsConnected(false);
        };
    }, [token]);

    const emit = useCallback((event: string, data?: Record<string, unknown>) => {
        socketRef.current?.emit(event, data ?? {});
    }, []);

    return { emit, isConnected };
}
