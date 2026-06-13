// ─────────────────────────────────────────────────────────────
// notificationStore.ts — Real-time notification state
// Fetches from REST on mount, receives WS pushes via useWebSocket
// ─────────────────────────────────────────────────────────────
import { create } from 'zustand';
import { api } from '../lib/api';
import { useAuthStore } from './authStore';

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
  allRequests: any[];
  pendingFriendsCount: number;
  unseenPendingFriends: boolean;
  fetchPendingFriendsCount: () => Promise<void>;
  incrementPendingFriends: () => void;
  decrementPendingFriends: () => void;
  markPendingFriendsSeen: () => void;
  friendRequestsVersion: number;
  incrementFriendRequestsVersion: () => void;
  handledActorId: string | null;
  setHandledActorId: (id: string | null) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
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
    set(state => {
      if (state.notifications.some(existing => existing.id === n.id)) return state;
      if (n.type === 'friend_request' && state.notifications.some(existing => existing.type === 'friend_request' && existing.actor_id === n.actor_id)) return state;
      return {
        notifications: [n, ...state.notifications].slice(0, 50),
        unreadCount: state.unreadCount + (n.is_read ? 0 : 1),
      };
    });
  },

  setUnreadCount: (count: number) => set({ unreadCount: count }),

  allRequests: [],
  pendingFriendsCount: 0,
  unseenPendingFriends: false,
  fetchPendingFriendsCount: async () => {
    try {
      const data = await api.getFriendRequests();
      // count only incoming requests
      const user = useAuthStore.getState().user;
      const incoming = (data.requests || []).filter((r: any) => r.addressee_id === user?.id);
      set((state) => ({ 
        allRequests: data.requests || [],
        pendingFriendsCount: incoming.length,
        unseenPendingFriends: incoming.length > state.pendingFriendsCount ? true : (incoming.length === 0 ? false : state.unseenPendingFriends)
      }));
    } catch {}
  },
  incrementPendingFriends: () => set(state => ({ 
    pendingFriendsCount: state.pendingFriendsCount + 1,
    unseenPendingFriends: true
  })),
  decrementPendingFriends: () => set(state => ({ 
    pendingFriendsCount: Math.max(0, state.pendingFriendsCount - 1) 
  })),
  markPendingFriendsSeen: () => set({ unseenPendingFriends: false }),
  friendRequestsVersion: 0,
  incrementFriendRequestsVersion: () => set(state => ({ friendRequestsVersion: state.friendRequestsVersion + 1 })),
  handledActorId: null,
  setHandledActorId: (id) => set({ handledActorId: id }),
}));
