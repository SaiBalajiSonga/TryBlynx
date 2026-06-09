import { create } from 'zustand'

export interface ChatMessage {
  message_id: string;
  sender_id: string;
  sender_name: string;
  room_id: string;
  body: string;
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

  setWsStatus: (status: 'disconnected' | 'connecting' | 'connected') => void;
  setMatchStatus: (status: 'idle' | 'waiting' | 'matched' | 'cancelled', targetGender?: string) => void;
  setActiveRoomId: (roomId: string | null) => void;
  setMatchPeerId: (id: string | null) => void;
  addMessage: (roomId: string, message: ChatMessage) => void;
  addDMMessage: (conversationId: string, message: DMMessage) => void;
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
    const existing = state.dmMessages[conversationId] || [];
    if (existing.some(m => m.message_id === message.message_id)) return state;
    return {
      dmMessages: {
        ...state.dmMessages,
        [conversationId]: [...existing, message].slice(-500),
      }
    };
  }),

  clearChat: () => set({
    matchStatus: 'idle',
    targetGender: null,
    activeRoomId: null,
    matchPeerId: null,
    messages: {},
    dmMessages: {},
    // wsStatus intentionally NOT reset — connection stays alive
  }),
}));
