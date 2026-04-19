import { create } from 'zustand';
import type { CurrentUser } from '../types';
import { api } from '../lib/api';

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  token: string | null;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, avatarId: number, language: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: CurrentUser | null) => void;
  setError: (e: string | null) => void;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  loading: true,
  token: localStorage.getItem('neon-xo-token'),
  error: null,

  async login(username, password) {
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.login(username, password);
      localStorage.setItem('neon-xo-token', token);
      set({ user, token, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      throw err;
    }
  },

  async register(username, password, avatarId, language) {
    set({ loading: true, error: null });
    try {
      const { token, user } = await api.register(username, password, avatarId, language);
      localStorage.setItem('neon-xo-token', token);
      set({ user, token, loading: false });
    } catch (err) {
      set({ loading: false, error: (err as Error).message });
      throw err;
    }
  },

  async logout() {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    localStorage.removeItem('neon-xo-token');
    set({ user: null, token: null });
  },

  async refresh() {
    const t = localStorage.getItem('neon-xo-token');
    if (!t) {
      set({ user: null, loading: false });
      return;
    }
    try {
      const { user } = await api.me();
      set({ user, loading: false });
    } catch {
      localStorage.removeItem('neon-xo-token');
      set({ user: null, token: null, loading: false });
    }
  },

  setUser: (u) => set({ user: u }),
  setError: (e) => set({ error: e }),
}));
