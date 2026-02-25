/**
 * Socket.io hook — connects to /admin namespace with the access token.
 * Auto-reconnects on token refresh. Returns socket instance and connection state.
 */
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@api/client';

export interface UseSocketReturn {
    socket: Socket | null;
    connected: boolean;
}

export function useSocket(): UseSocketReturn {
    const socketRef = useRef<Socket | null>(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;

        const socket = io('/admin', {
            auth: { token },
            transports: ['websocket'],
            reconnection: true,
            reconnectionDelay: 2000,
            reconnectionAttempts: 10,
        });

        socketRef.current = socket;

        socket.on('connect', () => setConnected(true));
        socket.on('disconnect', () => setConnected(false));
        socket.on('connect_error', (err) => {
            console.warn('[Socket] connect error:', err.message);
        });

        return () => {
            socket.disconnect();
            socketRef.current = null;
            setConnected(false);
        };
    }, []);

    return { socket: socketRef.current, connected };
}
