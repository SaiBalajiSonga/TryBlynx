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
  setMatchStatus: (status, targetGender) => set({ matchStatus: status, targetGender: targetGender || null }),
  setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),
  setMatchPeerId: (id) => set({ matchPeerId: id }),
  addMessage: (roomId, message) => set((state) => ({
    messages: {
      ...state.messages,
      [roomId]: [...(state.messages[roomId] || []), message]
    }
  })),
  addDMMessage: (conversationId, message) => set((state) => ({
    dmMessages: {
      ...state.dmMessages,
      [conversationId]: [...(state.dmMessages[conversationId] || []), message]
    }
  })),
  clearChat: () => set({
    // FIX: Do NOT reset wsStatus here — the WebSocket connection is
    // still alive when leaving a chat. Only reset chat-specific state.
    matchStatus: 'idle',
    targetGender: null,
    activeRoomId: null,
    matchPeerId: null,
    messages: {},
    dmMessages: {}
  })
}));
