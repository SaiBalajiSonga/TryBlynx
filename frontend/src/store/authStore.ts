import { create } from 'zustand'

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  is_vip: boolean;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  gender?: string;
  location?: string;
  language?: string;
  interests?: string[];
}

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  setAuth: (token: string, user: UserProfile) => void;
  updateUser: (user: Partial<UserProfile>) => void;
  clearAuth: () => void;
}

// FIX: Persist token + user to localStorage so refresh doesn't log out
function loadPersistedAuth(): { token: string | null; user: UserProfile | null } {
  try {
    const token = localStorage.getItem('tryblynx_token');
    const userRaw = localStorage.getItem('tryblynx_user');
    if (token && userRaw) {
      return { token, user: JSON.parse(userRaw) };
    }
  } catch {}
  return { token: null, user: null };
}

const persisted = loadPersistedAuth();

export const useAuthStore = create<AuthState>((set) => ({
  token: persisted.token,
  user: persisted.user,

  setAuth: (token, user) => {
    localStorage.setItem('tryblynx_token', token);
    localStorage.setItem('tryblynx_user', JSON.stringify(user));
    set({ token, user });
  },
  updateUser: (updatedFields) => set((state) => {
    const user = state.user ? { ...state.user, ...updatedFields } : null;
    if (user) localStorage.setItem('tryblynx_user', JSON.stringify(user));
    return { user };
  }),
  clearAuth: () => {
    localStorage.removeItem('tryblynx_token');
    localStorage.removeItem('tryblynx_user');
    set({ token: null, user: null });
  },
}));
