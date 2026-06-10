// ─────────────────────────────────────────────────────────────
// notificationStore.ts — Real-time notification state
// Fetches from REST on mount, receives WS pushes via useWebSocket
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { api } from '../lib/api';

export interface AppNotification {
  id: string;
  user_id: string;
  type: 'friend_request' | 'friend_accepted' | 'profile_approved' | 'mod_action';
  actor_id?: string;
  actor_name?: string;
  actor_avatar?: string;
  data: Record<string, any>;
  is_read: boolean;
  created_at: string;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (n: AppNotification) => void;
  setUnreadCount: (count: number) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,

  fetchNotifications: async () => {
    set({ loading: true });
    try {
      const data = await api.getNotifications();
      set({
        notifications: data.notifications || [],
        unreadCount: data.unread_count || 0,
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },

  markAllRead: async () => {
    try {
      await api.markNotificationsRead();
      set(state => ({
        notifications: state.notifications.map(n => ({ ...n, is_read: true })),
        unreadCount: 0,
      }));
    } catch {}
  },

  addNotification: (n: AppNotification) => {
    set(state => ({
      notifications: [n, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + (n.is_read ? 0 : 1),
    }));
  },

  setUnreadCount: (count: number) => set({ unreadCount: count }),
}));
