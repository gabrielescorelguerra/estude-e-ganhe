import { addDays, dayKey, diffDays } from './plan';
import { parseAllocKey, ufOfPlace } from './tally';
import type { Campaign, DaySnap, FeedItem, Session } from './types';

/** soma por UF das alocações (inclui municípios), eventos e oposição */
export function snapOf(c: Pick<Campaign, 'allocations' | 'bonus' | 'opposition'>): DaySnap {
  const agg = (...maps: Record<string, number>[]) => {
    const out: Record<string, number> = {};
    for (const m of maps) for (const [k, v] of Object.entries(m ?? {})) {
      const { place, nr } = parseAllocKey(k);
      const key = `${ufOfPlace(place)}|${nr}`;
      out[key] = (out[key] ?? 0) + v;
    }
    return out;
  };
  return { s: agg(c.allocations, c.bonus), o: agg(c.opposition) };
}

export const sameSnap = (a: DaySnap | undefined, b: DaySnap) => !!a && JSON.stringify(a) === JSON.stringify(b);

export interface Frame {
  day: string;
  study: Record<string, number>;
  opp: Record<string, number>;
  minutes: number;
  votes: number;
  feed: FeedItem[];
}

const scale = (m: Record<string, number>, f: number) =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * f)]));

/**
 * Quadros da campanha, um por dia. Usa o histórico gravado; para campanhas antigas (sem histórico)
 * estima a evolução distribuindo o resultado atual pelo ritmo de votos ganhos.
 */
export function buildFrames(c: Campaign, sessions: Session[], today: string): { frames: Frame[]; estimated: boolean; estimatedUntil: string | null } {
  const first = dayKey(c.createdAt);
  const last = today < c.deadline ? today : c.deadline > first ? c.deadline : today;
  const n = Math.max(1, Math.min(240, diffDays(first, last) + 1));
  const days = Array.from({ length: n }, (_, i) => addDays(first, i));
  const mine = sessions.filter((s) => s.campaignId === c.id);
  const minutes: Record<string, number> = {};
  const votes: Record<string, number> = {};
  for (const s of mine) {
    const d = dayKey(s.start);
    minutes[d] = (minutes[d] ?? 0) + s.seconds / 60;
    votes[d] = (votes[d] ?? 0) + s.votes;
  }
  const cum: number[] = [];
  days.reduce((acc, d, i) => (cum[i] = acc + (votes[d] ?? 0)), 0);
  const total = cum[n - 1] || 1;

  const now = snapOf(c);
  const hist = Object.keys(c.history ?? {}).sort();
  // 1º dia com registro exato; antes dele (ou sempre, sem histórico) a evolução é estimada
  const exactFrom = hist.length ? Math.max(0, days.findIndex((d) => d >= hist[0])) : n - 1;
  const base = hist.length ? (c.history[hist[0]] ?? now) : now;
  const baseIdx = hist.length ? exactFrom : n - 1;
  const baseVotes = cum[baseIdx] || total;

  const frames = days.map((day, i) => {
    let snap: DaySnap;
    if (i < exactFrom || !hist.length) {
      const ref = hist.length ? base : now;
      const f = Math.min(1, cum[i] / (hist.length ? baseVotes : total));
      const g = (i + 1) / (hist.length ? baseIdx + 1 : n);
      snap = i === n - 1 && !hist.length ? now : { s: scale(ref.s, f), o: scale(ref.o, g) };
    } else {
      const k = [...hist].reverse().find((h) => h <= day);
      snap = i === n - 1 ? now : k ? c.history[k] : { s: {}, o: {} };
    }
    return {
      day, study: snap.s, opp: snap.o, minutes: Math.round(minutes[day] ?? 0), votes: votes[day] ?? 0,
      feed: (c.feed ?? []).filter((f) => f.day === day),
    };
  });
  const estimatedUntil = !hist.length ? days[n - 1] : exactFrom > 0 ? days[exactFrom - 1] : null;
  return { frames, estimated: estimatedUntil !== null, estimatedUntil };
}
