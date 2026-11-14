import { addDays, dayKey, diffDays } from './plan';
import type { Session } from './types';

export function secondsByDay(sessions: Session[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sessions) {
    const k = dayKey(s.start);
    m.set(k, (m.get(k) ?? 0) + s.seconds);
  }
  return m;
}

/** dias consecutivos (terminando hoje ou ontem) em que a meta diária foi cumprida */
export function streak(byDay: Map<string, number>, goalMin: number, today: string): number {
  const ok = (k: string) => (byDay.get(k) ?? 0) >= goalMin * 60;
  let k = ok(today) ? today : addDays(today, -1);
  let n = 0;
  while (ok(k)) {
    n++;
    k = addDays(k, -1);
  }
  return n;
}

export function lastDays(byDay: Map<string, number>, today: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const k = addDays(today, i - (n - 1));
    return { key: k, seconds: byDay.get(k) ?? 0 };
  });
}

export const sumSeconds = (sessions: Session[]) => sessions.reduce((a, s) => a + s.seconds, 0);

export const daysBetween = diffDays;
