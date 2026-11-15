import { addDays } from './plan';
import { splitInt } from './strategies';
import type { FeedItem } from './types';

/** chance de um dia ter evento, e intervalo mínimo entre eventos */
export const EVENT_CHANCE = 0.3;
export const EVENT_MIN_GAP_DAYS = 2;

/** gerador pseudoaleatório determinístico: o mesmo dia/campanha sempre sorteia o mesmo resultado */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = (h ^ (h >>> 16)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface EventCtx {
  /** dia (YYYY-MM-DD) em que o evento é aplicado, para validade do bônus */
  today: string;
  rate: number;
  goalMin: number;
  focusName: string;
  rivalName: string;
  /** só UFs (lugares onde dá para colocar votos) */
  places: { id: string; name: string }[];
}

export interface Placement { place: string; votes: number }

export interface EventResult {
  feed: Omit<FeedItem, 'id' | 'day' | 'kind'>;
  boost?: { mult: number; until: string; label: string };
  focus?: Placement[];
  rival?: Placement[];
}

type Maker = (c: EventCtx, r: () => number) => EventResult;

const pick = <T,>(arr: T[], r: () => number, n: number): T[] => {
  const pool = [...arr];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
};
const names = (ps: { name: string }[]) => ps.map((p) => p.name).join(', ');

/** um "dia-base" = quantos votos a meta diária rende */
const dayVotes = (c: EventCtx) => Math.round(c.rate * c.goalMin);
const spread = (c: EventCtx, r: () => number, n: number, total: number) => {
  const ps = pick(c.places, r, n);
  const parts = splitInt(total, ps.map(() => 1));
  return { ps, list: ps.map((p, i) => ({ place: p.id, votes: parts[i] })) };
};

export const GOOD: Record<string, Maker> = {
  debate: (c) => ({
    feed: { tone: 'bom', title: 'Debate na TV', text: `${c.focusName} foi bem no debate. Hoje cada minuto de estudo vale o dobro.` },
    boost: { mult: 2, until: c.today, label: 'Debate na TV' },
  }),
  apoio: (c, r) => {
    const { ps, list } = spread(c, r, 1, Math.round(dayVotes(c) * 0.6));
    return { feed: { tone: 'bom', title: 'Apoio de uma liderança local', text: `${c.focusName} ganhou ${list[0].votes.toLocaleString('pt-BR')} votos em ${names(ps)}.` }, focus: list };
  },
  escandalo: (c, r) => {
    const { ps, list } = spread(c, r, 3, Math.round(dayVotes(c) * 0.8));
    return { feed: { tone: 'bom', title: `Escândalo atinge ${c.rivalName}`, text: `${c.focusName} ganhou votos em ${names(ps)}.` }, focus: list };
  },
};

export const BAD: Record<string, Maker> = {
  fake: (c, r) => {
    const { ps, list } = spread(c, r, 2, Math.round(dayVotes(c) * 0.5));
    return { feed: { tone: 'ruim', title: `Boato contra ${c.focusName}`, text: `${c.rivalName} ganhou votos em ${names(ps)}.` }, rival: list };
  },
  greve: (c) => ({
    feed: { tone: 'ruim', title: 'Greve de transporte', text: 'Ficou difícil estudar: hoje e amanhã os votos por minuto caem pela metade.' },
    boost: { mult: 0.5, until: addDays(c.today, 1), label: 'Greve de transporte' },
  }),
  pesquisa: (c, r) => {
    const { ps, list } = spread(c, r, 3, Math.round(dayVotes(c) * 0.6));
    return { feed: { tone: 'ruim', title: 'Pesquisa desfavorável', text: `${c.rivalName} cresceu em ${names(ps)}.` }, rival: list };
  },
};

/**
 * Sorteia (de forma reproduzível) o evento de um dia. Quem cumpriu a meta tem mais chance de boas notícias.
 * Retorna null se o dia não tem evento.
 */
export function rollEvent(seed: string, ctx: EventCtx, metGoal: boolean): EventResult | null {
  const r = rng(seed);
  if (r() >= EVENT_CHANCE) return null;
  const good = r() < (metGoal ? 0.7 : 0.3);
  const table = good ? GOOD : BAD;
  const keys = Object.keys(table);
  const key = keys[Math.floor(r() * keys.length)];
  return table[key](ctx, r);
}

/** taxa efetiva com um possível bônus/penalidade temporária */
export const effectiveRate = (c: { rate: number; boost: { mult: number; until: string } | null }, today: string) =>
  c.boost && c.boost.until >= today ? Math.max(1, Math.round(c.rate * c.boost.mult)) : c.rate;
