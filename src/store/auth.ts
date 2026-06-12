import { create } from 'zustand';
import { api } from '@/lib/api';
import type { User } from '@/lib/api';

export interface RegisterData {
  username: string;
  password: string;
  name: string;
  phone: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
  isAdmin: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('token'),
  loading: true,

  login: async (username: string, password: string) => {
    const data = await api.post<{ token: string; user: User }>('/auth/login', {
      username,
      password,
    });
    localStorage.setItem('token', data.token);
    set({ token: data.token, user: data.user });
  },

  register: async (data: RegisterData) => {
    await api.post<User>('/auth/register', data);
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, token: null });
  },

  fetchMe: async () => {
    const token = get().token;
    if (!token) {
      set({ loading: false });
      return;
    }
    try {
      const user = await api.get<User>('/auth/me');
      set({ user, loading: false });
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, loading: false });
    }
  },

  isAdmin: () => {
    return get().user?.role === 'admin';
  },
}));
