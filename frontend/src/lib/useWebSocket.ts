import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebRTCStore } from '../store/webrtcStore';

// Singleton WebSocket — one per app session, not per component mount
// FIX: Storing WS in a module-level ref prevents double-connection from
// multiple useWebSocket() callers (e.g. Dashboard + ChatRoom + VideoRoom)
let globalWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;

// Expose sendMessage globally so any component can call it without
// creating a new connection
let globalSendMessage: ((type: string, payload: unknown) => void) | null = null;

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { setWsStatus, setMatchStatus, setActiveRoomId, setMatchPeerId, addMessage, addDMMessage } = useChatStore();
  const wsStatusRef = useRef<string>('disconnected');

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'chat.message':
        addMessage(data.payload.room_id, data.payload);
        break;
      case 'dm.message':
        addDMMessage(data.payload.conversation_id, data.payload);
        break;
      case 'match.queued':
        setMatchStatus('waiting', data.payload.target_gender);
        break;
      case 'match.cancelled':
        setMatchStatus('idle');
        break;
      case 'match.found':
        // FIX: call sendMessage directly on globalWs, not via stale closure
        if (globalWs && globalWs.readyState === WebSocket.OPEN) {
          globalWs.send(JSON.stringify({ type: 'chat.join', payload: { room_id: data.payload.room_id } }));
        }
        setMatchPeerId(data.payload.peer_id);
        break;
      case 'chat.joined':
        setActiveRoomId(data.payload.room_id);
        setMatchStatus('matched');
        break;
      case 'error':
        console.error('WS server error:', data.payload.message);
        break;
      case 'webrtc.offer':
      case 'webrtc.answer':
      case 'webrtc.ice': {
        const sigType = data.type.split('.')[1] as 'offer' | 'answer' | 'ice';
        useWebRTCStore.getState().addSignal({
          type: sigType,
          peer_id: data.payload.peer_id,
          sdp: data.payload.sdp,
          candidate: data.payload.candidate,
        });
        if (sigType === 'offer') {
          useWebRTCStore.getState().startVideo(data.payload.peer_id, false);
        }
        break;
      }
      default:
        console.log('Unhandled WS message:', data);
    }
  }, [addMessage, addDMMessage, setMatchStatus, setActiveRoomId, setMatchPeerId]);

  const connect = useCallback(() => {
    if (!token) return;
    if (isConnecting) return;
    if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) return;

    isConnecting = true;
    setWsStatus('connecting');
    wsStatusRef.current = 'connecting';

    const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080/ws';
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    globalWs = ws;

    ws.onopen = () => {
      isConnecting = false;
      setWsStatus('connected');
      wsStatusRef.current = 'connected';
    };

    ws.onmessage = (event) => {
      try {
        handleMessage(JSON.parse(event.data));
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    ws.onclose = (event) => {
      isConnecting = false;
      setWsStatus('disconnected');
      wsStatusRef.current = 'disconnected';

      if (globalWs === ws) globalWs = null;

      // Auth errors — don't reconnect
      if (event.code === 4001 || event.reason?.includes('authentication') || event.reason?.includes('invalid')) {
        clearAuth();
        return;
      }

      // FIX: Exponential backoff, not immediate reconnect loop
      const delay = Math.min(3000 + Math.random() * 2000, 15000);
      reconnectTimer = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      isConnecting = false;
      ws.close();
    };
  }, [token, clearAuth, setWsStatus, handleMessage]);

  useEffect(() => {
    connect();
    return () => {
      // Don't close on unmount — the WS is a singleton
      // Only clear reconnect timer
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
  }, [connect]);

  // FIX: sendMessage uses globalWs directly, not a stale ref
  const sendMessage = useCallback((type: string, payload: unknown) => {
    if (globalWs && globalWs.readyState === WebSocket.OPEN) {
      globalWs.send(JSON.stringify({ type, payload }));
    } else {
      console.warn('WebSocket not connected, cannot send:', type);
    }
  }, []);

  globalSendMessage = sendMessage;

  return { sendMessage };
}

// Exported for use in useWebRTC without creating a new WS connection
export function getSendMessage() {
  return globalSendMessage;
}
