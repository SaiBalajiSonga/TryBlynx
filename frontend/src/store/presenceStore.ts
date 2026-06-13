import { create } from 'zustand';

interface PresenceState {
  onlineUsers: Set<string>;
  lastActiveMap: Map<string, string>;
  setOnline: (userId: string, online: boolean, lastActiveAt?: string) => void;
  initializePresence: (users: { id: string; is_online: boolean; last_active_at?: string }[]) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  onlineUsers: new Set(),
  lastActiveMap: new Map(),

  setOnline: (userId, online, lastActiveAt) => set((state) => {
    const newOnline = new Set(state.onlineUsers);
    const newLastActive = new Map(state.lastActiveMap);

    if (online) {
      newOnline.add(userId);
    } else {
      newOnline.delete(userId);
      if (lastActiveAt) {
        newLastActive.set(userId, lastActiveAt);
      }
    }
    return { onlineUsers: newOnline, lastActiveMap: newLastActive };
  }),

  initializePresence: (users) => set((state) => {
    const newOnline = new Set(state.onlineUsers);
    const newLastActive = new Map(state.lastActiveMap);

    users.forEach(u => {
      if (u.is_online) {
        newOnline.add(u.id);
      } else if (u.last_active_at) {
        newLastActive.set(u.id, u.last_active_at);
      }
    });

    return { onlineUsers: newOnline, lastActiveMap: newLastActive };
  })
}));
