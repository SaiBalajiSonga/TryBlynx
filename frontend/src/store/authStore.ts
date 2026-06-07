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

    // Actions
    setAuth: (token: string, user: UserProfile) => void;
    updateUser: (user: Partial<UserProfile>) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    token: null,
    user: null,

    setAuth: (token, user) => set({ token, user }),
    updateUser: (updatedFields) => set((state) => ({ user: state.user ? { ...state.user, ...updatedFields } : null })),
    clearAuth: () => set({ token: null, user: null }),
}))