import { create } from 'zustand'
import { useAuthStore } from './authStore';

export interface MessageReaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface ChatMessage {
  message_id: string;
  sender_id: string;
  sender_name: string;
  room_id: string;
  body: string;
  is_edited: boolean;
  created_at: string;
  reply_to_id?: string;
  reactions?: MessageReaction[];
}

export interface DMMessage {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  is_edited?: boolean;
  created_at: string;
  reply_to_id?: string;
  reactions?: MessageReaction[];
}

export interface RecentMatch {
  peer_id: string;
  username: string;
  display_name?: string;
  matched_at: number;
}

interface ChatState {
  wsStatus: 'disconnected' | 'connecting' | 'connected';
  matchStatus: 'idle' | 'waiting' | 'matched' | 'cancelled';
  targetGender: string | null;
  activeRoomId: string | null;
  matchPeerId: string | null;
  isPeerDisconnected: boolean;
  messages: Record<string, ChatMessage[]>;
  dmMessages: Record<string, DMMessage[]>;
  dmUnreadCounts: Record<string, number>;
  recentMatches: RecentMatch[];

  setWsStatus: (status: 'disconnected' | 'connecting' | 'connected') => void;
  setMatchStatus: (status: 'idle' | 'waiting' | 'matched' | 'cancelled', targetGender?: string) => void;
  setActiveRoomId: (roomId: string | null) => void;
  setMatchPeerId: (id: string | null) => void;
  setIsPeerDisconnected: (val: boolean) => void;
  addMessage: (roomId: string, message: ChatMessage) => void;
  addDMMessage: (conversationId: string, message: DMMessage) => void;
  updateMessage: (roomId: string, messageId: string, newBody: string, isEdited: boolean) => void;
  deleteMessage: (roomId: string, messageId: string) => void;
  updateDMMessage: (conversationId: string, messageId: string, newBody: string, isEdited: boolean) => void;
  deleteDMMessage: (conversationId: string, messageId: string) => void;
  toggleReaction: (roomIdOrConvId: string, messageId: string, emoji: string, added: boolean, userId: string, isDM: boolean) => void;
  clearDMUnread: (conversationId: string) => void;
  addRecentMatch: (match: RecentMatch) => void;
  /** Clears only the matchmaking chat state; preserves DM history */
  clearMatchChat: () => void;
  /** Full reset including DMs — use sparingly (e.g. on logout) */
  clearChat: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  wsStatus: 'disconnected',
  matchStatus: 'idle',
  targetGender: null,
  activeRoomId: null,
  matchPeerId: null,
  isPeerDisconnected: false,
  messages: {},
  dmMessages: {},
  dmUnreadCounts: {},
  recentMatches: [],

  setWsStatus: (status) => set({ wsStatus: status }),
  setMatchStatus: (status, targetGender) => set({ matchStatus: status, targetGender: targetGender ?? null }),
  setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),
  setMatchPeerId: (id) => set({ matchPeerId: id }),
  setIsPeerDisconnected: (val) => set({ isPeerDisconnected: val }),

  addMessage: (roomId, message) => set((state) => {
    const existing = state.messages[roomId] || [];
    // FIX: Deduplicate — REST history load + WS delivery can both fire for the same msg
    if (existing.some(m => m.message_id === message.message_id)) return state;
    return {
      messages: {
        ...state.messages,
        // Cap per-room at 500 messages for memory efficiency at scale
        [roomId]: [...existing, message].slice(-500),
      }
    };
  }),

  addDMMessage: (conversationId, message) => set((state) => {
    const existing = state.dmMessages[conversationId] ?? [];
    // Deduplicate using message_id (backend field) OR id (optimistic local field)
    const isDup = existing.some(
      m => m.message_id === message.message_id || (message as any).id === m.message_id
    );
    if (isDup) return state;

    const myId = useAuthStore.getState().user?.id;
    const isMine = message.sender_id === myId;
    const currentUnread = state.dmUnreadCounts[conversationId] ?? 0;
    const newUnread = isMine ? currentUnread : currentUnread + 1;

    return {
      dmMessages: {
        ...state.dmMessages,
        [conversationId]: [...existing, message].slice(-500),
      },
      dmUnreadCounts: {
        ...state.dmUnreadCounts,
        [conversationId]: newUnread,
      },
    };
  }),

  updateMessage: (roomId, messageId, newBody, isEdited) => set((state) => {
    const existing = state.messages[roomId];
    if (!existing) return state;
    return {
      messages: {
        ...state.messages,
        [roomId]: existing.map(m => m.message_id === messageId ? { ...m, body: newBody, is_edited: isEdited } : m)
      }
    };
  }),

  deleteMessage: (roomId, messageId) => set((state) => {
    const existing = state.messages[roomId];
    if (!existing) return state;
    return {
      messages: {
        ...state.messages,
        [roomId]: existing.filter(m => m.message_id !== messageId)
      }
    };
  }),

  updateDMMessage: (conversationId, messageId, newBody, isEdited) => set((state) => {
    const existing = state.dmMessages[conversationId];
    if (!existing) return state;
    return {
      dmMessages: {
        ...state.dmMessages,
        [conversationId]: existing.map(m => m.message_id === messageId ? { ...m, body: newBody, is_edited: isEdited } : m)
      }
    };
  }),

  deleteDMMessage: (conversationId, messageId) => set((state) => {
    const existing = state.dmMessages[conversationId];
    if (!existing) return state;
    return {
      dmMessages: {
        ...state.dmMessages,
        [conversationId]: existing.filter(m => m.message_id !== messageId)
      }
    };
  }),

  toggleReaction: (roomIdOrConvId, messageId, emoji, added, userId, isDM) => set((state) => {
    const targetMap = isDM ? state.dmMessages : state.messages;
    const existing = targetMap[roomIdOrConvId];
    if (!existing) return state;

    const myId = useAuthStore.getState().user?.id;
    const isMe = userId === myId;

    const updated = existing.map(m => {
      if (m.message_id !== messageId) return m;
      let rx = [...(m.reactions || [])];
      const rIdx = rx.findIndex(r => r.emoji === emoji);
      
      if (rIdx >= 0) {
        if (added) {
          rx[rIdx] = { ...rx[rIdx], count: rx[rIdx].count + 1, me: isMe ? true : rx[rIdx].me };
        } else {
          const newCount = rx[rIdx].count - 1;
          if (newCount <= 0) {
            rx.splice(rIdx, 1);
          } else {
            rx[rIdx] = { ...rx[rIdx], count: newCount, me: isMe ? false : rx[rIdx].me };
          }
        }
      } else if (added) {
        rx.push({ emoji, count: 1, me: isMe });
      }

      return { ...m, reactions: rx };
    });

    return isDM ? { dmMessages: { ...state.dmMessages, [roomIdOrConvId]: updated } } 
                : { messages: { ...state.messages, [roomIdOrConvId]: updated } };
  }),

  clearDMUnread: (conversationId) => set((state) => ({
    dmUnreadCounts: { ...state.dmUnreadCounts, [conversationId]: 0 },
  })),

  addRecentMatch: (match) => set((state) => {
    // Avoid duplicate insertions if the same peer_id already exists in this session
    if (state.recentMatches.some(m => m.peer_id === match.peer_id)) return state;
    return { recentMatches: [match, ...state.recentMatches].slice(0, 50) };
  }),

  clearMatchChat: () => set((state) => {
    const newMessages = { ...state.messages };
    // Always clean up the active room's messages if we have one.
    // The old guard (matchStatus === 'matched') caused a memory leak:
    // if the peer disconnected first, matchStatus may have already
    // transitioned away from 'matched' before clearMatchChat ran,
    // leaving stale ephemeral-room message arrays in the store forever.
    if (state.activeRoomId) {
      delete newMessages[state.activeRoomId];
    }
    return {
      matchStatus: 'idle',
      targetGender: null,
      activeRoomId: null,
      matchPeerId: null,
      isPeerDisconnected: false,
      messages: newMessages,
      // dmMessages and dmUnreadCounts intentionally preserved
    };
  }),

  clearChat: () => set({
    matchStatus: 'idle',
    targetGender: null,
    activeRoomId: null,
    matchPeerId: null,
    isPeerDisconnected: false,
    messages: {},
    dmMessages: {},
    dmUnreadCounts: {},
    recentMatches: [],
    // wsStatus intentionally NOT reset — connection stays alive
  }),
}));
