/**
 * Socket.io hook — connects to /admin namespace with the access token.
 * Auto-reconnects on token refresh. Returns socket instance and connection state.
 *
 * When SUPER_ADMIN is managing another org (managingOrgId), passes that ID
 * in socket auth so the server joins the managed org's room — enabling
 * device events (screenshot, status) from that org to reach this client.
 */
import { useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@api/client';
import type { RootState } from '@/store';

export interface UseSocketReturn {
    socket: Socket | null;
    connected: boolean;
}

export function useSocket(): UseSocketReturn {
    const socketRef = useRef<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const managingOrgId = useSelector((state: RootState) => state.auth.managingOrgId);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) return;

        const socket = io('/admin', {
            auth: { token, managingOrgId: managingOrgId ?? undefined },
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
    }, [managingOrgId]); // reconnect khi đổi org đang quản lý

    return { socket: socketRef.current, connected };
}
