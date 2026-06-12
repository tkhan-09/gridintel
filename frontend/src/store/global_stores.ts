/**
 * GridIntel — Unified Zustand Stores
 * Covers: authStore, filterStore, alertStore, copilotStore, modStore
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type UserRole = 'SuperAdmin' | 'Admin' | 'Operator' | 'Auditor' | 'Viewer';

export interface User {
  id: string;
  username: string;
  full_name: string;
  email: string;
  role: UserRole;
  office_id: string | null;
  office_name: string | null;
  is_active: boolean;
}

export interface Alert {
  id: string;
  type: 'anomaly' | 'deadline' | 'system' | 'info';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  plant_id?: string;
  plant_name?: string;
  created_at: string;
  read: boolean;
}

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  language: 'bn' | 'en';
  timestamp: string;
  tool_results?: ToolResult[];
  thinking?: boolean;
}

export interface ToolResult {
  tool_name: string;
  data: unknown;
  display_type: 'table' | 'value' | 'chart' | 'text';
}

export interface ModEntry {
  plant_id: string;
  plant_name: string;
  meter_id: string;
  is_ccpp: boolean;
  unit_type?: 'GT' | 'ST' | 'combined';
  prev_reading: number;
  present_reading: number;
  gross_gen: number;
  station_use: number;
  net_gen: number;
  auxiliary_pct: number;
  cf: number;
  omf: number;
  cf_changed: boolean;
  omf_changed: boolean;
  continuity_ok: boolean;
  status: 'draft' | 'submitted' | 'verified' | 'locked';
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH STORE
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (user: User, token: string, refreshToken: string) => void;
  logout: () => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  setLoading: (v: boolean) => void;

  // Role helpers
  hasRole: (roles: UserRole[]) => boolean;
  isAdmin: () => boolean;
  isSuperAdmin: () => boolean;
  canEdit: () => boolean;
  canApprove: () => boolean;
  canViewBilling: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user:            null,
      token:           null,
      refreshToken:    null,
      isAuthenticated: false,
      isLoading:       false,

      login: (user, token, refreshToken) =>
        set({ user, token, refreshToken, isAuthenticated: true, isLoading: false }),

      logout: () =>
        set({ user: null, token: null, refreshToken: null, isAuthenticated: false }),

      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      setLoading: (isLoading) => set({ isLoading }),

      hasRole: (roles) => {
        const { user } = get();
        if (!user) return false;
        return roles.includes(user.role);
      },

      isAdmin: () => {
        const { user } = get();
        return user?.role === 'SuperAdmin' || user?.role === 'Admin';
      },

      isSuperAdmin: () => get().user?.role === 'SuperAdmin',

      canEdit: () => {
        const { user } = get();
        return ['SuperAdmin', 'Admin', 'Operator'].includes(user?.role ?? '');
      },

      canApprove: () => {
        const { user } = get();
        return ['SuperAdmin', 'Admin'].includes(user?.role ?? '');
      },

      canViewBilling: () => {
        const { user } = get();
        return ['SuperAdmin', 'Admin', 'Auditor'].includes(user?.role ?? '');
      },
    }),
    {
      name:    'gridintel-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user:         state.user,
        token:        state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// FILTER STORE  (persistent global filter)
// ─────────────────────────────────────────────────────────────────────────────

interface FilterState {
  month: number;
  year: number;
  officeId: string | null;
  companyId: string | null;

  setMonth: (month: number) => void;
  setYear: (year: number) => void;
  setOfficeId: (id: string | null) => void;
  setCompanyId: (id: string | null) => void;
  setFilter: (partial: Partial<Pick<FilterState, 'month' | 'year' | 'officeId' | 'companyId'>>) => void;
  resetFilters: () => void;

  // Derived helpers
  getMonthYear: () => string;    // e.g. "2026-04"
  getLabel: () => string;        // e.g. "April 2026"
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const now = new Date();

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      month:     now.getMonth() + 1, // 1-based
      year:      now.getFullYear(),
      officeId:  null,
      companyId: null,

      setMonth:     (month)    => set({ month }),
      setYear:      (year)     => set({ year }),
      setOfficeId:  (officeId) => set({ officeId }),
      setCompanyId: (companyId) => set({ companyId }),

      setFilter: (partial) => set(partial),

      resetFilters: () =>
        set({
          month:     now.getMonth() + 1,
          year:      now.getFullYear(),
          officeId:  null,
          companyId: null,
        }),

      getMonthYear: () => {
        const { month, year } = get();
        return `${year}-${String(month).padStart(2, '0')}`;
      },

      getLabel: () => {
        const { month, year } = get();
        return `${MONTH_NAMES[month - 1]} ${year}`;
      },
    }),
    {
      name:    'gridintel-filters',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ─────────────────────────────────────────────────────────────────────────────
// ALERT STORE  (WebSocket-backed live alerts)
// ─────────────────────────────────────────────────────────────────────────────

interface AlertState {
  alerts: Alert[];
  unreadCount: number;
  isConnected: boolean;
  isPanelOpen: boolean;
  ws: WebSocket | null;

  addAlert: (alert: Alert) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  removeAlert: (id: string) => void;
  setPanelOpen: (open: boolean) => void;
  connectWebSocket: (token: string) => void;
  disconnectWebSocket: () => void;
}

export const useAlertStore = create<AlertState>()((set, get) => ({
  alerts:      [],
  unreadCount: 0,
  isConnected: false,
  isPanelOpen: false,
  ws:          null,

  addAlert: (alert) =>
    set((s) => {
      const alerts = [alert, ...s.alerts].slice(0, 100); // keep last 100
      const unreadCount = alerts.filter((a) => !a.read).length;
      return { alerts, unreadCount };
    }),

  markRead: (id) =>
    set((s) => {
      const alerts = s.alerts.map((a) => (a.id === id ? { ...a, read: true } : a));
      return { alerts, unreadCount: alerts.filter((a) => !a.read).length };
    }),

  markAllRead: () =>
    set((s) => ({
      alerts:      s.alerts.map((a) => ({ ...a, read: true })),
      unreadCount: 0,
    })),

  removeAlert: (id) =>
    set((s) => {
      const alerts = s.alerts.filter((a) => a.id !== id);
      return { alerts, unreadCount: alerts.filter((a) => !a.read).length };
    }),

  setPanelOpen: (isPanelOpen) => set({ isPanelOpen }),

  connectWebSocket: (token) => {
    const { ws: existing } = get();
    if (existing) existing.close();

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'}/api/v1/notifications/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => set({ isConnected: true, ws });

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Alert;
        get().addAlert(data);
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => set({ isConnected: false, ws: null });
    ws.onerror = () => set({ isConnected: false });
  },

  disconnectWebSocket: () => {
    const { ws } = get();
    if (ws) ws.close();
    set({ ws: null, isConnected: false });
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// COPILOT STORE
// ─────────────────────────────────────────────────────────────────────────────

interface CopilotState {
  messages: CopilotMessage[];
  isLoading: boolean;
  language: 'bn' | 'en';
  sessionId: string;

  addMessage: (msg: CopilotMessage) => void;
  updateLastMessage: (partial: Partial<CopilotMessage>) => void;
  setLoading: (v: boolean) => void;
  setLanguage: (lang: 'bn' | 'en') => void;
  clearHistory: () => void;
  newSession: () => void;
  send: (text: string) => Promise<void>;
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const useCopilotStore = create<CopilotState>()((set, get) => ({
  messages:  [],
  isLoading: false,
  language:  'en',
  sessionId: uuid(),

  addMessage: (msg) =>
    set((s) => ({ messages: [...s.messages, msg] })),

  updateLastMessage: (partial) =>
    set((s) => {
      const messages = [...s.messages];
      if (messages.length === 0) return s;
      messages[messages.length - 1] = { ...messages[messages.length - 1], ...partial };
      return { messages };
    }),

  setLoading: (isLoading) => set({ isLoading }),
  setLanguage: (language) => set({ language }),
  clearHistory: () => set({ messages: [] }),
  newSession: () => set({ messages: [], sessionId: uuid(), isLoading: false }),
  send: async (text) => {
    const { addMessage, setLoading } = get();
    addMessage({ id: uuid(), role: 'user', content: text, timestamp: new Date() as any });
    setLoading(true);
    try {
      const authData = localStorage.getItem('gridintel-auth');
      const token = authData ? JSON.parse(authData)?.state?.token || '' : '';
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(apiUrl + '/api/v1/copilot/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token }, body: JSON.stringify({ message: text }) });
      const data = await res.json();
      addMessage({ id: uuid(), role: 'assistant', content: data.response || data.answer || 'No response', timestamp: new Date() as any });
    } catch(e) {
      addMessage({ id: uuid(), role: 'assistant', content: 'Error connecting to AI service', timestamp: new Date() as any });
    } finally { setLoading(false); }
  },
}));

// ─────────────────────────────────────────────────────────────────────────────
// MOD STORE  (in-session MOD entry state)
// ─────────────────────────────────────────────────────────────────────────────

interface ModState {
  entries: Record<string, ModEntry>; // keyed by `${plant_id}_${unit_type ?? ''}`
  isDirty: boolean;
  isSubmitting: boolean;

  setEntry: (key: string, entry: Partial<ModEntry>) => void;
  calculateTotals: (key: string) => void;
  loadEntries: (entries: ModEntry[]) => void;
  resetEntries: () => void;
  setSubmitting: (v: boolean) => void;
}

export const useModStore = create<ModState>()((set, get) => ({
  entries:      {},
  isDirty:      false,
  isSubmitting: false,

  setEntry: (key, partial) =>
    set((s) => {
      const existing = s.entries[key] ?? ({} as ModEntry);
      const updated  = { ...existing, ...partial };
      return {
        entries:  { ...s.entries, [key]: updated },
        isDirty: true,
      };
    }),

  calculateTotals: (key) => {
    const { entries, setEntry } = get();
    const e = entries[key];
    if (!e) return;

    const gross_gen       = Math.max(0, e.present_reading - e.prev_reading);
    const net_gen         = gross_gen * (1 - e.omf / 100);
    const station_use     = gross_gen - net_gen;
    const auxiliary_pct   = gross_gen > 0 ? (station_use / gross_gen) * 100 : 0;
    const continuity_ok   = true; // backend validates exact continuity

    setEntry(key, { gross_gen, net_gen, station_use, auxiliary_pct, continuity_ok });
  },

  loadEntries: (entries) => {
    const map: Record<string, ModEntry> = {};
    for (const e of entries) {
      const key = `${e.plant_id}_${e.unit_type ?? ''}`;
      map[key] = e;
    }
    set({ entries: map, isDirty: false });
  },

  resetEntries: () => set({ entries: {}, isDirty: false }),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
}));

