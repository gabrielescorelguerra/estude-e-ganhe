import { parseAllocKey, ufOfPlace } from './tally';

/** o adversário reage com esta fração do que você colocou num estado desde a última apuração */
export const COUNTER_FACTOR = 0.25;
export const COUNTER_STATES = 3;

export interface Counter {
  place: string;
  /** quanto você colocou ali desde a última apuração */
  delta: number;
  /** votos que o adversário ganha em resposta */
  votes: number;
}

/** contra-ataque: os estados onde você mais investiu desde `prev` recebem votos do adversário */
export function counterAttack(prev: Record<string, number>, now: Record<string, number>, focusNr: number): Counter[] {
  const byUf: Record<string, number> = {};
  const add = (m: Record<string, number>, sign: number) => {
    for (const [k, v] of Object.entries(m)) {
      const { place, nr } = parseAllocKey(k);
      if (nr !== focusNr) continue;
      const uf = ufOfPlace(place);
      byUf[uf] = (byUf[uf] ?? 0) + sign * v;
    }
  };
  add(now, 1);
  add(prev, -1);
  return Object.entries(byUf)
    .filter(([, d]) => d > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, COUNTER_STATES)
    .map(([place, delta]) => ({ place, delta, votes: Math.round(delta * COUNTER_FACTOR) }))
    .filter((c) => c.votes > 0);
}
