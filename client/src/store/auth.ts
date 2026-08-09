import { create } from 'zustand';
import { api } from '../lib/api';
import { scheduleDailySync, syncWithCloud } from '../lib/sync';

export interface User {
  id: string;
  email: string;
  name: string;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  role: string;
  encryption_salt?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  loading: boolean;
  online: boolean;
  lastSync: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  bootstrap: () => Promise<void>;
  setTheme: (theme: User['theme']) => Promise<void>;
  syncNow: () => Promise<void>;
}

let syncTimer: number | undefined;

function applyTheme(theme: User['theme']) {
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  root.classList.toggle('dark', dark);
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('erc_token'),
  loading: true,
  online: navigator.onLine,
  lastSync: localStorage.getItem('erc_last_sync'),

  async login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('erc_token', data.token);
    set({ token: data.token, user: data.user });
    applyTheme(data.user.theme);
    await get().syncNow();
  },

  async register(name, email, password) {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('erc_token', data.token);
    set({ token: data.token, user: data.user });
    applyTheme(data.user.theme);
  },

  logout() {
    localStorage.removeItem('erc_token');
    if (syncTimer) window.clearInterval(syncTimer);
    set({ token: null, user: null });
  },

  async bootstrap() {
    window.addEventListener('online', () => set({ online: true }));
    window.addEventListener('offline', () => set({ online: false }));

    const token = localStorage.getItem('erc_token');
    if (!token) {
      set({ loading: false });
      return;
    }

    try {
      const { data } = await api.get('/auth/me');
      set({ user: data.user, token, loading: false });
      applyTheme(data.user.theme);
      syncTimer = scheduleDailySync(() => {
        void get().syncNow();
      });
      if (navigator.onLine) void get().syncNow();
    } catch {
      localStorage.removeItem('erc_token');
      set({ user: null, token: null, loading: false });
    }
  },

  async setTheme(theme) {
    applyTheme(theme);
    const { data } = await api.patch('/auth/me', { theme });
    set({ user: data.user });
  },

  async syncNow() {
    const { user, token } = get();
    if (!user?.encryption_salt || !token) return;
    const result = await syncWithCloud(user.encryption_salt, token);
    if (result.status === 'merged' || result.status === 'pushed') {
      const ts = new Date().toISOString();
      localStorage.setItem('erc_last_sync', ts);
      set({ lastSync: ts });
    }
  },
}));
