import { create } from 'zustand'

export interface UserProfile {
  id: string;
  username: string;
  email: string;
  is_vip: boolean;
  is_admin: boolean;
  is_moderator: boolean;
  is_developer: boolean;
  is_anonymous?: boolean;
  expires_at?: string | null;
  display_name?: string;
  avatar_url?: string;
  bio?: string;
  gender?: string;
  location?: string;
  language?: string;
  interests?: string[];
  public_key?: string;
  // Non-secret salt used to derive the Master History Key (MHK)
  // stored in the user profile so any device can derive the same MHK from password
  mhk_salt?: string;
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
    const token = localStorage.getItem('lynxus_token');
    const userRaw = localStorage.getItem('lynxus_user');
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
    localStorage.setItem('lynxus_token', token);
    localStorage.setItem('lynxus_user', JSON.stringify(user));
    set({ token, user });
  },
  updateUser: (updatedFields) => set((state) => {
    const user = state.user ? { ...state.user, ...updatedFields } : null;
    if (user) localStorage.setItem('lynxus_user', JSON.stringify(user));
    return { user };
  }),
  clearAuth: () => {
    localStorage.removeItem('lynxus_token');
    localStorage.removeItem('lynxus_user');
    // Clear the in-memory Master History Key so it cannot be read after logout
    import('../lib/crypto').then(c => c.clearSessionMHK());
    set({ token: null, user: null });
  },
}));
