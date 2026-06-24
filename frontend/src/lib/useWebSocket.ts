import { useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useWebRTCStore } from '../store/webrtcStore';
import { useNotificationStore } from '../store/notificationStore';
import { usePresenceStore } from '../store/presenceStore';
import { useUIStore } from '../store/uiStore';
import { useNavigate } from 'react-router-dom';
import { isEncrypted, loadPrivateKey, decryptMessage } from './crypto';

// Singleton WebSocket — one per app session, not per component mount
let globalWs: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;
let globalSendMessage: ((type: string, payload: unknown) => void) | null = null;
// Module-level navigate ref so toast onClick closures always dispatch
// via the latest router instance, even after re-renders.
let globalNavigate: ((path: string) => void) | null = null;
// Module-level connect ref so the reconnect timer closure always calls
// the latest connect function (avoids stale-token edge case on re-render).
let connectRef: { current: (() => Promise<void>) | null } = { current: null };

export function useWebSocket() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const {
    setWsStatus, setMatchStatus, setActiveRoomId, setMatchPeerId,
    addMessage, addDMMessage, updateMessage, deleteMessage,
    updateDMMessage, deleteDMMessage, toggleReaction,
  } = useChatStore();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const handleMessageRef = useRef<((data: any) => void) | null>(null);

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'chat.message':
      case 'match.message':
        addMessage(data.payload.room_id, data.payload);
        break;
      case 'chat.edit':
        updateMessage(data.payload.room_id, data.payload.message_id, data.payload.body, data.payload.is_edited);
        break;
      case 'chat.delete':
        deleteMessage(data.payload.room_id, data.payload.message_id);
        break;
      case 'dm.message': {
        addDMMessage(data.payload.conversation_id, data.payload);
        const myId = useAuthStore.getState().user?.id;
        if (data.payload.sender_id !== myId) {
          const isLookingAtChat = window.location.pathname.includes(`/app/dms/${data.payload.conversation_id}`);
          if (document.visibilityState === 'hidden' || !isLookingAtChat) {
            (async () => {
              let bodyText = data.payload.body;
              if (isEncrypted(bodyText)) {
                const privJwk = myId ? loadPrivateKey(myId) : null;
                if (privJwk) {
                  try {
                    // decryptMessage takes (ciphertext, privJwk, isSender)
                    bodyText = await decryptMessage(bodyText, privJwk, data.payload.sender_id === myId);
                  } catch (e) {
                    bodyText = '🔒 Encrypted message';
                  }
                } else {
                  bodyText = '🔒 Encrypted message';
                }
              }

              // Show native notification
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`New message from ${data.payload.sender_name}`, {
                  body: bodyText
                });
              }
              // Show in-app toast — use globalNavigate so the click handler
              // always dispatches through the live router, not a stale closure.
              useUIStore.getState().showToast(
                'info',
                `${data.payload.sender_name}:\n${bodyText.substring(0, 50)}${bodyText.length > 50 ? '...' : ''}`,
                () => {
                  useUIStore.getState().setActivePanel('dms');
                  globalNavigate?.(`/app/dms/${data.payload.conversation_id}`);
                }
              );
            })();
          }
        }
        break;
      }
      case 'dm.edit':
        updateDMMessage(data.payload.conversation_id, data.payload.message_id, data.payload.body, data.payload.is_edited);
        window.dispatchEvent(new CustomEvent('blynx:dm-edit', { detail: data.payload }));
        break;
      case 'dm.delete':
        deleteDMMessage(data.payload.conversation_id, data.payload.message_id);
        window.dispatchEvent(new CustomEvent('blynx:dm-delete', { detail: data.payload }));
        break;
      case 'dm.react':
        toggleReaction(data.payload.conversation_id, data.payload.message_id, data.payload.emoji, data.payload.added, data.payload.user_id, true);
        window.dispatchEvent(new CustomEvent('blynx:dm-react', { detail: data.payload }));
        break;
      case 'chat.react':
        toggleReaction(data.payload.room_id, data.payload.message_id, data.payload.emoji, data.payload.added, data.payload.user_id, false);
        break;
      case 'dm.typing': {
        // Broadcast to the DMs component via a custom event
        window.dispatchEvent(new CustomEvent('blynx:dm-typing', {
          detail: {
            sender_id: data.payload.sender_id,
            conversation_id: data.payload.conversation_id,
            typing: data.payload.typing,
          }
        }));
        break;
      }
      case 'match.queued':
        setMatchStatus('waiting', data.payload.target_gender);
        break;
      case 'match.cancelled':
        setMatchStatus('idle');
        break;
      case 'match.found':
        // Ephemeral P2P chat: set peer/room directly without joining a DB room
        useChatStore.getState().setIsPeerDisconnected(false);
        setMatchPeerId(data.payload.peer_id);
        setActiveRoomId(data.payload.room_id);
        setTimeout(() => setMatchStatus('matched', undefined), 0);
        break;
      case 'chat.joined':
        // Set activeRoomId first, then switch status in next tick
        // so ChatRoom never renders with null activeRoomId
        useChatStore.getState().setIsPeerDisconnected(false);
        setActiveRoomId(data.payload.room_id);
        setTimeout(() => setMatchStatus('matched', undefined), 0);
        break;
      case 'chat.left':
        // Acknowledgment that we successfully left a room. Ignore.
        break;
      case 'chat.peer_left':
        // Peer left — mark as disconnected so ChatRoom can show "Stranger has disconnected"
        useChatStore.getState().setIsPeerDisconnected(true);
        break;
      case 'notification.push': {
        // Real-time notification pushed by the server
        const n = data.payload;
        if (n) {
          addNotification(n);
          useUIStore.getState().showToast('info', n.title || 'New Notification');
        }
        break;
      }
      case 'friend_request_received':
        // A new incoming request arrived — increment the badge immediately
        // without a REST round-trip. fetchPendingFriendsCount is guarded
        // by pendingFriendsInitialized and won't re-fetch here.
        useNotificationStore.getState().incrementPendingFriends();
        useNotificationStore.getState().incrementFriendRequestsVersion();
        const actorName = data.payload?.actor_name ? ` from ${data.payload.actor_name}` : '';
        useUIStore.getState().showToast('info', `New friend request${actorName}!`);
        break;
      case 'friend_request_handled':
        // Someone accepted OR declined one of our outgoing requests.
        // Re-fetch the authoritative count rather than blindly decrementing (which only applies to incoming).
        useNotificationStore.getState().fetchPendingFriendsCount();
        useNotificationStore.getState().incrementFriendRequestsVersion();
        if (data.payload?.actor_id) {
          useNotificationStore.getState().setHandledActorId(data.payload.actor_id);
        }
        break;
      case 'error':
        console.error('WS server error:', data.payload?.message);
        break;
      case 'presence.update':
        usePresenceStore.getState().setOnline(
          data.payload.user_id,
          data.payload.online,
          data.payload.last_active_at
        );
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
  }, [addMessage, addDMMessage, updateMessage, deleteMessage, updateDMMessage, deleteDMMessage, toggleReaction,
      setMatchStatus, setActiveRoomId, setMatchPeerId, addNotification]);

  // Always keep the ref pointing to the latest handleMessage
  handleMessageRef.current = handleMessage;

  const connect = useCallback(async () => {
    if (!token) return;
    if (isConnecting || globalWs?.readyState === WebSocket.OPEN) return;

    isConnecting = true;
    setWsStatus('connecting');

    const WS_URL = ((import.meta as any).env?.VITE_WS_URL || 'ws://localhost:8080/ws');
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    globalWs = ws;

    ws.onopen = () => {
      isConnecting = false;
      setWsStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
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

      // Exponential backoff reconnect
      const delay = Math.min(3000 + Math.random() * 2000, 15000);
      reconnectTimer = setTimeout(() => connectRef.current?.(), delay);
    };

    ws.onerror = () => {
      isConnecting = false;
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clearAuth, setWsStatus]);

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
  // Keep the module-level ref in sync with the latest navigate instance.
  globalNavigate = navigate;
  // Keep the module-level connect ref in sync so the reconnect timer
  // closure always dispatches through the latest token-aware function.
  connectRef.current = connect;

  return { sendMessage };
}

export function getSendMessage() {
  return globalSendMessage;
}
