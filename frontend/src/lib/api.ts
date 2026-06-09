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
  getProfile: () => fetchWithAuth('/profile'),
  getUserProfile: (id: string) => fetchWithAuth(`/profile/${id}`),
  updateProfile: (data: Partial<import('../store/authStore').UserProfile>) =>
    fetchWithAuth('/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getFeed: (cursor?: string) =>
    fetchWithAuth(cursor ? `/feed?cursor=${encodeURIComponent(cursor)}` : '/feed'),
  createPost: (body: string) =>
    fetchWithAuth('/feed', { method: 'POST', body: JSON.stringify({ body }) }),
  getGroups: () => fetchWithAuth('/groups'),
  getGroupMembers: (id: string) => fetchWithAuth(`/groups/${id}/members`),
  blockUser: (userId: string) => fetchWithAuth('/moderation/block', { method: 'POST', body: JSON.stringify({ blocked_id: userId }) }),
  unblockUser: (userId: string) => fetchWithAuth('/moderation/unblock', { method: 'POST', body: JSON.stringify({ blocked_id: userId }) }),
  reportUser: (userId: string, reason: string, messageId?: string) => fetchWithAuth('/moderation/report', { method: 'POST', body: JSON.stringify({ reported_id: userId, reason, message_id: messageId }) }),
  getDMs: () => fetchWithAuth('/dm/list'),
  getMessages: (conversationId: string, cursor?: string) =>
    fetchWithAuth(cursor ? `/dm/${conversationId}?cursor=${encodeURIComponent(cursor)}` : `/dm/${conversationId}`),
  sendMessage: (conversationId: string, body: string) =>
    fetchWithAuth(`/dm/${conversationId}`, { method: 'POST', body: JSON.stringify({ body }) }),
  searchUsers: (query: string) => fetchWithAuth(`/users/search?q=${encodeURIComponent(query)}`),
  reportStrike: () => fetchWithAuth('/moderation/strike', { method: 'POST' }),

  // Admin Group Management
  adminCreateGroup: (data: { name: string, description: string, is_nsfw: boolean, slowmode_seconds: number }) =>
    fetchWithAuth('/admin/groups', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdateGroup: (id: string, data: { name: string, description: string, is_nsfw: boolean, slowmode_seconds: number }) =>
    fetchWithAuth(`/admin/groups/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminDeleteGroup: (id: string) =>
    fetchWithAuth(`/admin/groups/${id}`, { method: 'DELETE' }),
};
