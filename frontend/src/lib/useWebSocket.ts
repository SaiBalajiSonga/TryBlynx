import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebRTCStore } from '../store/webrtcStore';

export function useWebSocket() {
  const token = useAuthStore((state) => state.token);
  const clearAuth = useAuthStore((state) => state.clearAuth);
  const { setWsStatus, setMatchStatus, setActiveRoomId, setMatchPeerId, addMessage, addDMMessage } = useChatStore();
  
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (!token) return;
    
    setWsStatus('connecting');
    const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080/ws';
    const wsUrl = `${WS_URL}?token=${token}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      setWsStatus('connected');
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch (err) {
        console.error('Failed to parse WS message', err);
      }
    };

    ws.current.onclose = (event) => {
      setWsStatus('disconnected');
      
      // Don't reconnect if it's an auth error (401)
      if (event.code === 4001 || event.reason.includes('authentication') || event.reason.includes('invalid')) {
        clearAuth();
        return;
      }
      
      // Auto reconnect
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket Error', error);
      ws.current?.close();
    };
  }, [token, setWsStatus, clearAuth]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((type: string, payload: any) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    } else {
      console.error('WebSocket is not connected');
    }
  }, []);

  const handleMessage = (data: any) => {
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
        sendMessage('chat.join', { room_id: data.payload.room_id });
        setMatchPeerId(data.payload.peer_id);
        break;
      case 'chat.joined':
        setActiveRoomId(data.payload.room_id);
        setMatchStatus('matched');
        break;
      case 'error':
        console.error('WS Error from server:', data.payload.message);
        break;
      case 'webrtc.offer':
      case 'webrtc.answer':
      case 'webrtc.ice':
        {
          const type = data.type.split('.')[1] as 'offer' | 'answer' | 'ice';
          useWebRTCStore.getState().addSignal({
            type,
            peer_id: data.payload.peer_id,
            sdp: data.payload.sdp,
            candidate: data.payload.candidate,
          });
          if (type === 'offer') {
            useWebRTCStore.getState().startVideo(data.payload.peer_id, false);
          }
        }
        break;
      default:
        console.log('Unhandled WS message:', data);
    }
  };

  return { sendMessage };
}
