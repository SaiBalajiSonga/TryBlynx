import { create } from 'zustand';

export interface Notification {
  id: string;
  type: 'match' | 'dm' | 'system';
  title: string;
  body: string;
  read: boolean;
  createdAt: Date;
}

interface UIState {
  sidebarOpen: boolean;
  activePanel: 'home' | 'chat' | 'video' | 'group' | 'dms' | 'notifications' | 'profile' | 'settings';
  notifications: Notification[];
  toasts: { id: string; type: 'success' | 'error' | 'info'; message: string; onClick?: () => void }[];
  setSidebarOpen: (v: boolean) => void;
  toggleSidebar: () => void;
  setActivePanel: (panel: UIState['activePanel']) => void;
  addNotification: (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markAllRead: () => void;
  showToast: (type: 'success' | 'error' | 'info', message: string, onClick?: () => void) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  activePanel: 'home',
  notifications: [],
  toasts: [],

  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setActivePanel: (panel) => set({ activePanel: panel, sidebarOpen: false }),

  addNotification: (n) => set((s) => ({
    notifications: [{
      ...n,
      id: Math.random().toString(36).slice(2),
      read: false,
      createdAt: new Date(),
    }, ...s.notifications].slice(0, 50),
  })),

  markAllRead: () => set((s) => ({
    notifications: s.notifications.map(n => ({ ...n, read: true })),
  })),

  showToast: (type, message, onClick) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, type, message, onClick }] }));
    setTimeout(() => get().dismissToast(id), 4000);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));
