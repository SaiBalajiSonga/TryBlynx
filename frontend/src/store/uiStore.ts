import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  activePanel: 'home' | 'chat' | 'video' | 'group' | 'dms' | 'notifications' | 'profile' | 'settings';
  toasts: { id: string; type: 'success' | 'error' | 'info'; message: string; onClick?: () => void }[];
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  setActivePanel: (panel: UIState['activePanel']) => void;
  showToast: (type: 'success' | 'error' | 'info', message: string, onClick?: () => void) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  activePanel: 'home',
  toasts: [],

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActivePanel: (panel) => set({ activePanel: panel, sidebarOpen: false }),

  showToast: (type, message, onClick) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, type, message, onClick }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
