import { create } from 'zustand'
import { useAuthStore } from './authStore';

export interface ChatMessage {
  message_id: string;
  sender_id: string;
  sender_name: string;
  room_id: string;
  body: string;
  is_edited: boolean;
  created_at: string;
}

export interface DMMessage {
  message_id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  body: string;
  created_at: string;
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
  messages: Record<string, ChatMessage[]>;
  dmMessages: Record<string, DMMessage[]>;
  dmUnreadCounts: Record<string, number>;
  recentMatches: RecentMatch[];

  setWsStatus: (status: 'disconnected' | 'connecting' | 'connected') => void;
  setMatchStatus: (status: 'idle' | 'waiting' | 'matched' | 'cancelled', targetGender?: string) => void;
  setActiveRoomId: (roomId: string | null) => void;
  setMatchPeerId: (id: string | null) => void;
  addMessage: (roomId: string, message: ChatMessage) => void;
  addDMMessage: (conversationId: string, message: DMMessage) => void;
  updateMessage: (roomId: string, messageId: string, newBody: string, isEdited: boolean) => void;
  deleteMessage: (roomId: string, messageId: string) => void;
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
  messages: {},
  dmMessages: {},
  dmUnreadCounts: {},
  recentMatches: [],

  setWsStatus: (status) => set({ wsStatus: status }),
  setMatchStatus: (status, targetGender) => set({ matchStatus: status, targetGender: targetGender ?? null }),
  setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),
  setMatchPeerId: (id) => set({ matchPeerId: id }),

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
    if (state.activeRoomId && state.matchStatus === 'matched') {
      delete newMessages[state.activeRoomId];
    }
    return {
      matchStatus: 'idle',
      targetGender: null,
      activeRoomId: null,
      matchPeerId: null,
      messages: newMessages,
      // dmMessages and dmUnreadCounts intentionally preserved
    };
  }),

  clearChat: () => set({
    matchStatus: 'idle',
    targetGender: null,
    activeRoomId: null,
    matchPeerId: null,
    messages: {},
    dmMessages: {},
    dmUnreadCounts: {},
    recentMatches: [],
    // wsStatus intentionally NOT reset — connection stays alive
  }),
}));
