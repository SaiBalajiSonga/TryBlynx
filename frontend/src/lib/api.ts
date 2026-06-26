// ─────────────────────────────────────────────────────────────
// api.ts — Typed REST client for all Lynxus API endpoints
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
  checkUsername: async (username: string): Promise<{available: boolean, suggestions?: string[]}> => {
    const response = await fetch(`${API_URL}/auth/check-username?username=${encodeURIComponent(username)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'Failed to check username');
    return data;
  },


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
  reportUser: (userId: string, reason: string, messageId?: string, proofUrl?: string) =>
    fetchWithAuth('/moderation/report', { method: 'POST', body: JSON.stringify({ reported_id: userId, reason, message_id: messageId, proof_url: proofUrl }) }),
  reportStrike: () =>
    fetchWithAuth('/moderation/strike', { method: 'POST' }),

  // ── Direct Messages ─────────────────────────────────────────
  getDMs: () => fetchWithAuth('/dm/list'),
  /** Returns { conversation_id } for a DM with recipient. Throws { error: 'not_friends' } if not friends. */
  startDM: (recipientId: string) =>
    fetchWithAuth(`/dm/start?recipient_id=${encodeURIComponent(recipientId)}`),
  getMessages: (conversationId: string, cursor?: string) =>
    fetchWithAuth(cursor ? `/dm/${conversationId}?cursor=${encodeURIComponent(cursor)}` : `/dm/${conversationId}`),
  clearDMMessages: (conversationId: string) =>
    fetchWithAuth(`/dm/${conversationId}`, { method: 'DELETE' }),
  /** Send a DM. Backend uses recipient_id + body at /api/dm/send */
  sendDM: (recipientId: string, body: string) =>
    fetchWithAuth('/dm/send', { method: 'POST', body: JSON.stringify({ recipient_id: recipientId, body }) }),
  /** Send a message to a group conversation via WS — REST fallback uses conversation_id correctly. */
  sendMessage: (conversationId: string, body: string) =>
    fetchWithAuth(`/dm/${conversationId}`, { method: 'POST', body: JSON.stringify({ body }) }),

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
  /** Cancel an *outgoing* pending friend request that the caller sent. */
  cancelFriendRequest: (userId: string) =>
    fetchWithAuth(`/friends/request/${userId}`, { method: 'DELETE' }),
  removeFriend: async (userId: string) => {
    const res = await fetchWithAuth(`/friends/${userId}`, { method: 'DELETE' });
    window.dispatchEvent(new CustomEvent('blynx:friend-removed', { detail: { userId } }));
    return res;
  },

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

  deleteAccount: () =>
    fetchWithAuth('/account/delete', { method: 'DELETE' }),

  getDMMessages: (conversationId: string, cursor?: string) =>
    fetchWithAuth(cursor
      ? `/dm/${conversationId}?cursor=${encodeURIComponent(cursor)}`
      : `/dm/${conversationId}`),
};

// Key backup endpoints (passphrase-encrypted private key blob)
export const saveKeyBackup = (blob: string) =>
  fetchWithAuth('/key-backup', { method: 'PUT', body: JSON.stringify({ blob }) });
export const getKeyBackup = () => fetchWithAuth('/key-backup');

// Account deletion
export const deleteAccountApi = () =>
  fetchWithAuth('/account/delete', { method: 'DELETE' });

// ── PQXDH Pre-Key Bundle ─────────────────────────────────────────────────────
// Upload this device's key bundle so peers can initiate PQXDH sessions.
export const uploadPreKeys = (data: {
  device_label: string;
  identity_key: string;
  signed_pre_key: string;
  signed_pre_key_id: number;
  signed_pre_key_sig: string;
  one_time_keys: Array<{ key_id: number; public_key: string }>;
  pq_keys: Array<{ key_id: number; public_key: string }>;
}) =>
  fetchWithAuth('/keys/upload', { method: 'POST', body: JSON.stringify(data) });

// Fetch a peer's key bundle to initiate a PQXDH handshake with them.
export const fetchPreKeyBundle = (userId: string) =>
  fetchWithAuth(`/keys/fetch/${encodeURIComponent(userId)}`);

// ── Master History Key (MHK) Cloud History ───────────────────────────────────
// Push one MHK-encrypted message copy to the cloud for cross-device history.
export const pushHistory = (entry: {
  conversation_id: string;
  message_id: string;
  iv: string;
  ct: string;
  sent_at: string; // ISO-8601
}) =>
  fetchWithAuth('/history/push', { method: 'POST', body: JSON.stringify(entry) });

// Fetch paginated MHK-encrypted history for a conversation.
// cursor: ISO-8601 timestamp (only messages before this are returned)
export const getHistory = (conversationId: string, cursor?: string) =>
  fetchWithAuth(
    cursor
      ? `/history/${encodeURIComponent(conversationId)}?cursor=${encodeURIComponent(cursor)}`
      : `/history/${encodeURIComponent(conversationId)}`,
  );

// ── 12-Word Mnemonic Recovery Blob ──────────────────────────────────────────
// Save the mnemonic-encrypted MHK blob (called once at signup).
export const saveRecoveryBlob = (blob: string) =>
  fetchWithAuth('/recovery/blob', { method: 'PUT', body: JSON.stringify({ blob }) });

// Fetch the recovery blob (used during Scenario B password recovery).
export const getRecoveryBlob = () => fetchWithAuth('/recovery/blob');

