import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebRTCStore } from '../store/webrtcStore';

// Singleton WebSocket — one per app session, not per component mount
let globalWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;
let globalSendMessage: ((type: string, payload: unknown) => void) | null = null;

export function useWebSocket() {
  const token = useAuthStore((s) => s.token);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const { setWsStatus, setMatchStatus, setActiveRoomId, setMatchPeerId, addMessage, addDMMessage, updateMessage, deleteMessage, clearChat } = useChatStore();
  const handleMessageRef = useRef<((data: any) => void) | null>(null);

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'chat.message':
        addMessage(data.payload.room_id, data.payload);
        break;
      case 'chat.edit':
        updateMessage(data.payload.room_id, data.payload.message_id, data.payload.body, data.payload.is_edited);
        break;
      case 'chat.delete':
        deleteMessage(data.payload.room_id, data.payload.message_id);
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
        // FIX: Set peer ID before joining so it's available when ChatRoom mounts
        setMatchPeerId(data.payload.peer_id);
        // Send chat.join directly on globalWs to avoid stale closure
        if (globalWs && globalWs.readyState === WebSocket.OPEN) {
          globalWs.send(JSON.stringify({
            type: 'chat.join',
            payload: { room_id: data.payload.room_id }
          }));
        }
        break;
      case 'chat.joined':
        // FIX: Set activeRoomId first, then switch status in next tick
        // so ChatRoom never renders with null activeRoomId
        setActiveRoomId(data.payload.room_id);
        setTimeout(() => setMatchStatus('matched', undefined), 0);
        break;
      case 'chat.peer_left':
        // Peer disconnected or left the room
        clearChat();
        break;
      case 'error':
        console.error('WS server error:', data.payload?.message);
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
        console.log('Unhandled WS message:', data.type, data);
    }
  }, [addMessage, addDMMessage, updateMessage, deleteMessage, setMatchStatus, setActiveRoomId, setMatchPeerId, clearChat]);

  // Always keep the ref pointing to the latest handleMessage
  handleMessageRef.current = handleMessage;

  const connect = useCallback(() => {
    if (!token) return;
    if (isConnecting) return;
    if (globalWs && (globalWs.readyState === WebSocket.OPEN || globalWs.readyState === WebSocket.CONNECTING)) return;

    isConnecting = true;
    setWsStatus('connecting');

    const WS_URL = (import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080/ws';
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    globalWs = ws;

    ws.onopen = () => {
      isConnecting = false;
      setWsStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        // Use ref so we always call the latest version without re-creating ws
        handleMessageRef.current?.(JSON.parse(event.data));
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    ws.onclose = (event) => {
      isConnecting = false;
      setWsStatus('disconnected');
      if (globalWs === ws) globalWs = null;

      // Auth errors — don't reconnect
      if (event.code === 4001 || event.reason?.includes('authentication') || event.reason?.includes('invalid')) {
        clearAuth();
        return;
      }

      // Exponential backoff
      const delay = Math.min(3000 + Math.random() * 2000, 15000);
      reconnectTimer = setTimeout(() => connect(), delay);
    };

    ws.onerror = () => {
      isConnecting = false;
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clearAuth, setWsStatus]);
  // NOTE: handleMessage intentionally excluded from deps — we use the ref pattern instead
  // to avoid recreating the WebSocket connection on every render

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };
  }, [connect]);

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

export function getSendMessage() {
  return globalSendMessage;
}
