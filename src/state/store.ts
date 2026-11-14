import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ActiveSession, Campaign, Loss, Session, StrategyConfig } from '../core/types';
import { addDays, dayKey } from '../core/plan';
import { elapsedSeconds, isRunning, pauseSegments, resumeSegments, votesFor } from '../core/timer';
import { allocKey, allocatedTotal } from '../core/tally';
import type { Placement } from '../core/strategies';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export interface PersistedState {
  sessions: Session[];
  active: ActiveSession | null;
  campaigns: Campaign[];
  activeCampaignId: string | null;
  dailyGoalMin: number;
  labels: string[];
}

interface Actions {
  start: (label: string) => void;
  pause: () => void;
  resume: () => void;
  finish: () => Session | null;
  discard: () => void;
  setLabel: (label: string) => void;
  deleteSession: (id: string) => void;
  setDailyGoal: (min: number) => void;

  addCampaign: (c: Omit<Campaign, 'id' | 'createdAt' | 'allocations' | 'status' | 'strategy' | 'opposition' | 'settledThrough' | 'lastFreeDay' | 'losses'> & Partial<Pick<Campaign, 'strategy'>>) => string;
  settle: (campaignId: string, r: { losses: Loss[]; settledThrough: string; lastFreeDay: string | null }, placements: Placement[]) => void;
  selectCampaign: (id: string) => void;
  patchCampaign: (id: string, patch: Partial<Campaign>) => void;
  deleteCampaign: (id: string) => void;
  place: (campaignId: string, placements: Placement[]) => void;
  unplace: (campaignId: string, key: string) => void;
  setStrategy: (campaignId: string, s: StrategyConfig) => void;
}

export type Store = PersistedState & Actions;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      sessions: [],
      active: null,
      campaigns: [],
      activeCampaignId: null,
      dailyGoalMin: 90,
      labels: [],

      start: (label) => {
        if (get().active) return;
        const c = get().campaigns.find((x) => x.id === get().activeCampaignId) ?? null;
        const now = Date.now();
        set({
          active: { id: uid(), label: label.trim(), campaignId: c?.id ?? null, rate: c?.rate ?? 0, segments: [{ start: now }] },
        });
      },
      pause: () => {
        const a = get().active;
        if (a && isRunning(a)) set({ active: { ...a, segments: pauseSegments(a.segments, Date.now()) } });
      },
      resume: () => {
        const a = get().active;
        if (a && !isRunning(a)) set({ active: { ...a, segments: resumeSegments(a.segments, Date.now()) } });
      },
      setLabel: (label) => {
        const a = get().active;
        if (a) set({ active: { ...a, label } });
      },
      finish: () => {
        const a = get().active;
        if (!a) return null;
        const now = Date.now();
        const seconds = elapsedSeconds(a, now);
        const first = a.segments[0].start;
        const session: Session = {
          id: a.id, campaignId: a.campaignId, label: a.label, start: first, end: now,
          seconds, rate: a.rate, votes: votesFor(seconds, a.rate),
        };
        const labels = a.label ? [a.label, ...get().labels.filter((l) => l !== a.label)].slice(0, 8) : get().labels;
        // sessões muito curtas (< 5 s) são descartadas: provavelmente toque acidental
        set({ active: null, labels, sessions: seconds >= 5 ? [session, ...get().sessions] : get().sessions });
        return seconds >= 5 ? session : null;
      },
      discard: () => set({ active: null }),
      deleteSession: (id) => set({ sessions: get().sessions.filter((s) => s.id !== id) }),
      setDailyGoal: (min) => set({ dailyGoalMin: Math.max(5, Math.min(720, Math.round(min))) }),

      addCampaign: (c) => {
        const id = uid();
        const camp: Campaign = {
          ...c, strategy: c.strategy ?? { kind: 'manual' }, id, createdAt: Date.now(), allocations: {}, status: 'ativa',
          opposition: {}, losses: [], lastFreeDay: null, settledThrough: addDays(dayKey(Date.now()), -1),
        };
        set({ campaigns: [camp, ...get().campaigns], activeCampaignId: id });
        return id;
      },
      settle: (campaignId, r, placements) =>
        set({
          campaigns: get().campaigns.map((c) => {
            if (c.id !== campaignId) return c;
            const opposition = { ...c.opposition };
            for (const p of placements) opposition[allocKey(p.place, p.nr)] = (opposition[allocKey(p.place, p.nr)] ?? 0) + p.votes;
            return { ...c, opposition, losses: [...r.losses, ...c.losses].slice(0, 200), settledThrough: r.settledThrough, lastFreeDay: r.lastFreeDay };
          }),
        }),
      selectCampaign: (id) => set({ activeCampaignId: id }),
      patchCampaign: (id, patch) =>
        set({ campaigns: get().campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
      deleteCampaign: (id) => {
        const campaigns = get().campaigns.filter((c) => c.id !== id);
        set({
          campaigns,
          sessions: get().sessions.map((s) => (s.campaignId === id ? { ...s, campaignId: null } : s)),
          activeCampaignId: get().activeCampaignId === id ? campaigns[0]?.id ?? null : get().activeCampaignId,
        });
      },
      place: (campaignId, placements) =>
        set({
          campaigns: get().campaigns.map((c) => {
            if (c.id !== campaignId) return c;
            const allocations = { ...c.allocations };
            for (const p of placements) {
              if (p.votes <= 0) continue;
              const k = allocKey(p.place, p.nr);
              allocations[k] = (allocations[k] ?? 0) + p.votes;
            }
            return { ...c, allocations };
          }),
        }),
      unplace: (campaignId, key) =>
        set({
          campaigns: get().campaigns.map((c) => {
            if (c.id !== campaignId) return c;
            const allocations = { ...c.allocations };
            delete allocations[key];
            return { ...c, allocations };
          }),
        }),
      setStrategy: (campaignId, strategy) =>
        set({ campaigns: get().campaigns.map((c) => (c.id === campaignId ? { ...c, strategy } : c)) }),
    }),
    {
      name: 'estude-e-ganhe/v1',
      version: 2,
      migrate: (persisted) => {
        const st = persisted as PersistedState;
        const today = dayKey(Date.now());
        st.campaigns = (st.campaigns ?? []).map((c) => ({
          ...c,
          penalty: c.penalty ?? false, opposition: c.opposition ?? {}, losses: c.losses ?? [], lastFreeDay: c.lastFreeDay ?? null,
          settledThrough: c.settledThrough ?? addDays(today, -1),
          status: (c.status as string) === 'expirada' ? 'derrota' : c.status,
        }));
        return st;
      },
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        sessions: s.sessions, active: s.active, campaigns: s.campaigns,
        activeCampaignId: s.activeCampaignId, dailyGoalMin: s.dailyGoalMin, labels: s.labels,
      }),
    },
  ),
);

export const selectCampaign = (s: PersistedState): Campaign | null =>
  s.campaigns.find((c) => c.id === s.activeCampaignId) ?? null;

export const earnedVotes = (sessions: Session[], campaignId: string) =>
  sessions.reduce((a, s) => a + (s.campaignId === campaignId ? s.votes : 0), 0);

export const walletOf = (s: PersistedState, c: Campaign) => earnedVotes(s.sessions, c.id) - allocatedTotal(c);

// ---- UI efêmera ----
export type Tab = 'estudar' | 'mapa' | 'progresso';
export type MapMode = 'simulado' | 'oficial' | 'estudo';

interface UiState {
  tab: Tab;
  setTab: (t: Tab) => void;
  uf: string | null;
  mun: string | null;
  select: (uf: string | null, mun?: string | null) => void;
  mode: MapMode;
  setMode: (m: MapMode) => void;
  campaignModal: null | 'novo' | 'replanejar' | 'avancar' | 'estrategia' | 'vitoria' | 'derrota';
  openCampaign: (m: UiState['campaignModal']) => void;
  summary: Session | null;
  setSummary: (s: Session | null) => void;
}

export const useUi = create<UiState>((set) => ({
  tab: 'estudar',
  setTab: (tab) => set({ tab }),
  uf: null,
  mun: null,
  select: (uf, mun = null) => set({ uf, mun }),
  mode: 'simulado',
  setMode: (mode) => set({ mode }),
  campaignModal: null,
  openCampaign: (campaignModal) => set({ campaignModal }),
  summary: null,
  setSummary: (summary) => set({ summary }),
}));
