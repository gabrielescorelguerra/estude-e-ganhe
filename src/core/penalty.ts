import { addDays, diffDays } from './plan';
import type { Loss } from './types';

/** o adversário ganha esta fração do que você deixou de estudar (em votos, na taxa da campanha) */
export const PENALTY_FACTOR = 0.5;
export const FREE_DAY_EVERY = 7;

export interface SettleInput {
  settledThrough: string;
  /** hoje (ainda em andamento, não entra) */
  today: string;
  deadline: string;
  goalMin: number;
  rate: number;
  rivalNr: number;
  lastFreeDay: string | null;
  studiedSeconds: (day: string) => number;
}

export const penaltyVotes = (shortMin: number, rate: number) => Math.round(shortMin * rate * PENALTY_FACTOR);

/** apura os dias que terminaram desde a última apuração */
export function settleLosses(i: SettleInput): { losses: Loss[]; settledThrough: string; lastFreeDay: string | null } {
  const losses: Loss[] = [];
  let last = i.lastFreeDay;
  let through = i.settledThrough;
  for (let d = addDays(i.settledThrough, 1); d < i.today; d = addDays(d, 1)) {
    through = d;
    if (d > i.deadline) break;
    const shortMin = Math.max(0, i.goalMin - i.studiedSeconds(d) / 60);
    if (shortMin < 1) continue;
    const free = last === null || diffDays(last, d) >= FREE_DAY_EVERY;
    if (free) last = d;
    losses.push({ day: d, shortMin: Math.round(shortMin), votes: free ? 0 : penaltyVotes(shortMin, i.rate), free, rivalNr: i.rivalNr });
  }
  return { losses, settledThrough: through, lastFreeDay: last };
}
