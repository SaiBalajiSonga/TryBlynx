import { create } from 'zustand';

export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice';
  peer_id: string;
  sdp?: any;
  candidate?: any;
}

interface WebRTCState {
  incomingSignals: WebRTCSignal[];
  isVideoActive: boolean;
  activePeerId: string | null;
  isInitiator: boolean;
  addSignal: (signal: WebRTCSignal) => void;
  clearSignals: () => void;
  startVideo: (peerId: string, isInitiator: boolean) => void;
  endVideo: () => void;
}

export const useWebRTCStore = create<WebRTCState>((set) => ({
  incomingSignals: [],
  isVideoActive: false,
  activePeerId: null,
  isInitiator: false,
  addSignal: (signal) => set((state) => ({ incomingSignals: [...state.incomingSignals, signal] })),
  clearSignals: () => set({ incomingSignals: [] }),
  startVideo: (peerId, isInitiator) => set({ isVideoActive: true, activePeerId: peerId, isInitiator }),
  endVideo: () => set({ isVideoActive: false, activePeerId: null, isInitiator: false, incomingSignals: [] }),
}));
