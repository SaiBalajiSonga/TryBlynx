// ─────────────────────────────────────────────────────────────
// api.ts — Typed REST client for all TryBlynx API endpoints
// ─────────────────────────────────────────────────────────────
import { useAuthStore } from '../store/authStore';

const API_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8080/api';

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token;

  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (response.status === 401) {
    useAuthStore.getState().clearAuth();
    throw new Error('Session expired, please sign in again.');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Request failed with status ${response.status}`);
  return data;
}

export const api = {
  // ── Auth ────────────────────────────────────────────────────
  guestLogin: () =>
    fetch(`${API_URL}/guest`, { method: 'POST' }).then(r => r.json()),

  // ── Profile ─────────────────────────────────────────────────
  getProfile: () => fetchWithAuth('/profile'),
  getUserProfile: (id: string) => fetchWithAuth(`/profile/${id}`),
  updateProfile: (data: Partial<import('../store/authStore').UserProfile>) =>
    fetchWithAuth('/profile', { method: 'PUT', body: JSON.stringify(data) }),

  // ── Feed ────────────────────────────────────────────────────
  getFeed: (cursor?: string) =>
    fetchWithAuth(cursor ? `/feed?cursor=${encodeURIComponent(cursor)}` : '/feed'),
  createPost: (body: string) =>
    fetchWithAuth('/feed', { method: 'POST', body: JSON.stringify({ body }) }),

  // ── Groups ──────────────────────────────────────────────────
  getGroups: () => fetchWithAuth('/groups'),
  getGroupMembers: (id: string) => fetchWithAuth(`/groups/${id}/members`),

  // ── Moderation ──────────────────────────────────────────────
  blockUser: (userId: string) =>
    fetchWithAuth('/moderation/block', { method: 'POST', body: JSON.stringify({ blocked_id: userId }) }),
  unblockUser: (userId: string) =>
    fetchWithAuth('/moderation/unblock', { method: 'POST', body: JSON.stringify({ blocked_id: userId }) }),
  reportUser: (userId: string, reason: string, messageId?: string) =>
    fetchWithAuth('/moderation/report', { method: 'POST', body: JSON.stringify({ reported_id: userId, reason, message_id: messageId }) }),
  reportStrike: () =>
    fetchWithAuth('/moderation/strike', { method: 'POST' }),

  // ── Direct Messages ─────────────────────────────────────────
  getDMs: () => fetchWithAuth('/dm/list'),
  /** Returns { conversation_id } for a DM with recipient. Throws { error: 'not_friends' } if not friends. */
  startDM: (recipientId: string) =>
    fetchWithAuth(`/dm/start?recipient_id=${encodeURIComponent(recipientId)}`),
  getMessages: (conversationId: string, cursor?: string) =>
    fetchWithAuth(cursor ? `/dm/${conversationId}?cursor=${encodeURIComponent(cursor)}` : `/dm/${conversationId}`),
  /** Send a DM. Backend uses recipient_id + body at /api/dm/send */
  sendDM: (recipientId: string, body: string) =>
    fetchWithAuth('/dm/send', { method: 'POST', body: JSON.stringify({ recipient_id: recipientId, body }) }),
  /** Legacy alias — kept for group chat which POSTs to /dm/{id} */
  sendMessage: (_conversationId: string, body: string) =>
    fetchWithAuth('/dm/send', { method: 'POST', body: JSON.stringify({ body }) }),

  // ── User Search ─────────────────────────────────────────────
  searchUsers: (query: string) => fetchWithAuth(`/users/search?q=${encodeURIComponent(query)}`),

  // ── Friends ─────────────────────────────────────────────────
  getFriends: () => fetchWithAuth('/friends'),
  getFriendRequests: () => fetchWithAuth('/friends/requests'),
  getFriendStatus: (userId: string) => fetchWithAuth(`/friends/status/${userId}`),
  sendFriendRequest: (userId: string) =>
    fetchWithAuth('/friends/request', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  acceptFriendRequest: (userId: string) =>
    fetchWithAuth('/friends/accept', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  declineFriendRequest: (userId: string) =>
    fetchWithAuth('/friends/decline', { method: 'POST', body: JSON.stringify({ user_id: userId }) }),
  removeFriend: (userId: string) =>
    fetchWithAuth(`/friends/${userId}`, { method: 'DELETE' }),

  // ── Notifications ───────────────────────────────────────────
  getNotifications: (limit?: number) =>
    fetchWithAuth(limit ? `/notifications?limit=${limit}` : '/notifications'),
  markNotificationsRead: () =>
    fetchWithAuth('/notifications/read', { method: 'POST' }),

  // ── Mod Queue / Log ─────────────────────────────────────────
  getModQueue: () => fetchWithAuth('/mod/queue'),
  getModLog: (limit?: number) =>
    fetchWithAuth(limit ? `/mod/log?limit=${limit}` : '/mod/log'),
  approveProfileReview: (id: string) =>
    fetchWithAuth(`/mod/reviews/${id}/approve`, { method: 'POST' }),
  rejectProfileReview: (id: string, reason: string) =>
    fetchWithAuth(`/mod/reviews/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // ── Admin Group Management ───────────────────────────────────
  adminCreateGroup: (data: { name: string; description: string; is_nsfw: boolean; slowmode_seconds: number }) =>
    fetchWithAuth('/admin/groups', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateGroup: (id: string, data: { name: string; description: string; is_nsfw: boolean; slowmode_seconds: number }) =>
    fetchWithAuth(`/admin/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminDeleteGroup: (id: string) =>
    fetchWithAuth(`/admin/groups/${id}`, { method: 'DELETE' }),

  // ── Stripe ───────────────────────────────────────────────────
  createCheckout: () =>
    fetchWithAuth('/checkout', { method: 'POST' }),
};
