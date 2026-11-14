import type { Round, Tally } from './types';

export type GoalKind = 'avancar' | 'liderar' | 'vencer';

export interface Goal {
  kind: GoalKind;
  rivalNr: number;
  /** votos que ainda faltam para atingir o objetivo (0 = já atingido) */
  needed: number;
  /** diferença atual para o rival (positivo = atrás) */
  deficit: number;
  reached: boolean;
}

export const rank = (t: Tally): [number, number][] =>
  Object.entries(t).map(([nr, v]) => [Number(nr), v] as [number, number]).sort((a, b) => b[1] - a[1]);

/**
 * Objetivo do jogador:
 * - 1º turno, candidato fora do top-2: "avançar" (superar o 2º colocado);
 * - demais casos: superar o melhor rival com a folga pedida ("liderar" no 1º, "vencer" no 2º).
 */
export function goalFor(round: Round, focusNr: number, totals: Tally, margin: number): Goal {
  const r = rank(totals);
  const focus = totals[focusNr] ?? 0;
  const top2 = r.slice(0, 2).map(([nr]) => nr);
  if (round === 1 && !top2.includes(focusNr)) {
    const [rivalNr, rv] = r[1];
    const deficit = rv - focus;
    const needed = Math.max(0, deficit + 1);
    return { kind: 'avancar', rivalNr, needed, deficit, reached: needed === 0 };
  }
  const rival = r.find(([nr]) => nr !== focusNr)!;
  const deficit = rival[1] - focus;
  const needed = Math.max(0, deficit + Math.max(1, margin));
  return { kind: round === 1 ? 'liderar' : 'vencer', rivalNr: rival[0], needed, deficit, reached: needed === 0 };
}

/** folga padrão: 0 se o candidato está atrás; 2 % do total se já lidera (precisa de um desafio) */
export function defaultMarginPct(deficit: number): number {
  return deficit > 0 ? 0 : 2;
}

export const marginVotes = (pct: number, total: number) => Math.round((pct / 100) * total);

/** arredonda para cima a um valor "limpo" (centenas/dezenas) para a taxa ser legível */
export function niceRate(r: number): number {
  if (r <= 0) return 0;
  const step = r >= 5000 ? 100 : r >= 500 ? 50 : r >= 100 ? 10 : 1;
  return Math.ceil(r / step) * step;
}

export const MIN_RATE = 100;
export const FREE_RATE = 5000;

export interface RatePlan {
  rate: number;
  totalMinutes: number;
  perHour: number;
}

export function planRate(needed: number, days: number, minutesPerDay: number): RatePlan {
  const totalMinutes = Math.max(1, days * minutesPerDay);
  const rate = needed <= 0 ? FREE_RATE : Math.max(MIN_RATE, niceRate(needed / totalMinutes));
  return { rate, totalMinutes, perHour: rate * 60 };
}

/** "Quanto de estudo falta" na taxa atual */
export const minutesToGoal = (needed: number, rate: number) => (rate > 0 ? needed / rate : Infinity);

export type Difficulty = 'leve' | 'equilibrada' | 'intensa' | 'extrema';
/** Dificuldade percebida = estudo diário exigido, independente do cenário. */
export function difficulty(minutesPerDay: number): Difficulty {
  if (minutesPerDay <= 45) return 'leve';
  if (minutesPerDay <= 120) return 'equilibrada';
  if (minutesPerDay <= 240) return 'intensa';
  return 'extrema';
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  leve: 'Leve',
  equilibrada: 'Equilibrada',
  intensa: 'Intensa',
  extrema: 'Extrema',
};

// ---- datas (locais, sem fuso surpresa) ----
export const dayKey = (ts: number | Date): string => {
  const d = typeof ts === 'number' ? new Date(ts) : ts;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
export const parseDay = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (k: string, n: number): string => {
  const d = parseDay(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
export const diffDays = (a: string, b: string): number =>
  Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
