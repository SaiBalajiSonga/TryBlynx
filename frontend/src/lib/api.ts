import { useAuthStore } from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';

export async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
  const token = useAuthStore.getState().token;
  
  const headers = new Headers(options.headers);
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    useAuthStore.getState().clearAuth();
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }

  return data;
}

export const api = {
  getProfile: () => fetchWithAuth('/profile'),
  updateProfile: (data: Partial<import('../store/authStore').UserProfile>) => fetchWithAuth('/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  getFeed: (cursor?: string) => fetchWithAuth(cursor ? `/feed?cursor=${encodeURIComponent(cursor)}` : '/feed'),
};
