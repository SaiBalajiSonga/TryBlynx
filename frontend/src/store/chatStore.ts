import { create } from 'zustand'

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

interface ChatState {
  wsStatus: 'disconnected' | 'connecting' | 'connected';
  matchStatus: 'idle' | 'waiting' | 'matched' | 'cancelled';
  targetGender: string | null;
  activeRoomId: string | null;
  matchPeerId: string | null;
  messages: Record<string, ChatMessage[]>;
  dmMessages: Record<string, DMMessage[]>;
  dmUnreadCounts: Record<string, number>;

  setWsStatus: (status: 'disconnected' | 'connecting' | 'connected') => void;
  setMatchStatus: (status: 'idle' | 'waiting' | 'matched' | 'cancelled', targetGender?: string) => void;
  setActiveRoomId: (roomId: string | null) => void;
  setMatchPeerId: (id: string | null) => void;
  addMessage: (roomId: string, message: ChatMessage) => void;
  addDMMessage: (conversationId: string, message: DMMessage) => void;
  updateMessage: (roomId: string, messageId: string, newBody: string, isEdited: boolean) => void;
  deleteMessage: (roomId: string, messageId: string) => void;
  clearDMUnread: (conversationId: string) => void;
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
    return {
      dmMessages: {
        ...state.dmMessages,
        [conversationId]: [...existing, message].slice(-500),
      },
      dmUnreadCounts: {
        ...state.dmUnreadCounts,
        [conversationId]: (state.dmUnreadCounts[conversationId] ?? 0) + 1,
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

  clearMatchChat: () => set({
    matchStatus: 'idle',
    targetGender: null,
    activeRoomId: null,
    matchPeerId: null,
    messages: {},
    // dmMessages and dmUnreadCounts intentionally preserved
  }),

  clearChat: () => set({
    matchStatus: 'idle',
    targetGender: null,
    activeRoomId: null,
    matchPeerId: null,
    messages: {},
    dmMessages: {},
    dmUnreadCounts: {},
    // wsStatus intentionally NOT reset — connection stays alive
  }),
}));
