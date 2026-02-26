/**
 * Socket.IO hook for the web player — connects to /device namespace.
 * Listens for content/schedule update events and triggers a sync callback.
 * Separate from useSocket (which connects to /admin namespace).
 */
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

export function usePlayerSocket(
    token: string | null,
    onSync: () => void,
): void {
    const socketRef = useRef<Socket | null>(null);
    // Keep onSync in a ref so the effect doesn't re-run when the callback identity changes
    const onSyncRef = useRef(onSync);
    onSyncRef.current = onSync;

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

        const handleSync = () => onSyncRef.current();
        socket.on('content.update', handleSync);
        socket.on('schedule.update', handleSync);
        socket.on('command.reload_content', handleSync);

        return () => {
            socket.disconnect();
            socketRef.current = null;
        };
    }, [token]);
}
