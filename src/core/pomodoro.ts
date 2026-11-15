import type { ActiveSession, PomoState } from './types';
import { elapsedMs, isRunning, resumeSegments } from './timer';

export interface PomodoroConfig {
  on: boolean;
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
  /** blocos de foco até a pausa longa */
  cycles: number;
}

export const DEFAULT_POMODORO: PomodoroConfig = { on: false, focusMin: 25, breakMin: 5, longBreakMin: 15, cycles: 4 };

export type PhaseName = 'foco' | 'pausa' | 'pausa-longa';
export interface PhaseEvent { at: number; to: PhaseName }

const MIN = 60000;

/** tempo estudado no bloco de foco atual */
export const focusElapsedMs = (a: ActiveSession, now: number) =>
  a.pomo ? elapsedMs({ segments: a.segments.slice(a.pomo.blockSeg) }, now) : 0;

export const newPomo = (): PomoState => ({ phase: 'foco', blocks: 0, blockSeg: 0 });

const breakMs = (p: PomoState, c: PomodoroConfig) => (p.long ? c.longBreakMin : c.breakMin) * MIN;

/**
 * Aplica as trocas de fase que já deveriam ter acontecido até `now`.
 * Os horários são exatos (mesmo que o app tenha ficado minutos em segundo plano): o tempo de pausa nunca é contado como estudo.
 */
export function advance(a: ActiveSession, c: PomodoroConfig, now: number): { session: ActiveSession; events: PhaseEvent[] } {
  if (!a.pomo) return { session: a, events: [] };
  let s: ActiveSession = { ...a, segments: a.segments.map((x) => ({ ...x })), pomo: { ...a.pomo } };
  const events: PhaseEvent[] = [];
  for (let guard = 0; guard < 40; guard++) {
    const p = s.pomo!;
    if (p.phase === 'foco') {
      if (!isRunning(s)) break;
      const el = focusElapsedMs(s, now);
      const need = c.focusMin * MIN;
      if (el < need) break;
      const end = now - (el - need);
      s.segments[s.segments.length - 1].end = end;
      const blocks = p.blocks + 1;
      const long = blocks % c.cycles === 0;
      s.pomo = { phase: 'pausa', blocks, blockSeg: p.blockSeg, breakStart: end, long };
      events.push({ at: end, to: long ? 'pausa-longa' : 'pausa' });
    } else {
      const end = (p.breakStart ?? now) + breakMs(p, c);
      if (now < end) break;
      s.segments = resumeSegments(s.segments, end);
      s.pomo = { phase: 'foco', blocks: p.blocks, blockSeg: s.segments.length - 1 };
      events.push({ at: end, to: 'foco' });
    }
  }
  return { session: events.length ? s : a, events };
}

/** pular a pausa e voltar ao foco agora */
export function skipBreak(a: ActiveSession, now: number): ActiveSession {
  const p = a.pomo;
  if (!p || p.phase !== 'pausa') return a;
  const segments = resumeSegments(a.segments, now);
  return { ...a, segments, pomo: { phase: 'foco', blocks: p.blocks, blockSeg: segments.length - 1 } };
}

export interface PomoView {
  phase: PhaseName;
  /** contagem regressiva da fase atual */
  remainingSec: number;
  running: boolean;
  /** bloco de foco em andamento (1, 2, 3…) dentro do ciclo */
  blockInCycle: number;
  blocks: number;
}

export function pomoView(a: ActiveSession, c: PomodoroConfig, now: number): PomoView | null {
  const p = a.pomo;
  if (!p) return null;
  if (p.phase === 'pausa') {
    const left = Math.max(0, (p.breakStart ?? now) + breakMs(p, c) - now);
    return { phase: p.long ? 'pausa-longa' : 'pausa', remainingSec: Math.ceil(left / 1000), running: true, blockInCycle: p.blocks % c.cycles || c.cycles, blocks: p.blocks };
  }
  const left = Math.max(0, c.focusMin * MIN - focusElapsedMs(a, now));
  return { phase: 'foco', remainingSec: Math.ceil(left / 1000), running: isRunning(a), blockInCycle: (p.blocks % c.cycles) + 1, blocks: p.blocks };
}

/** instante em que a fase atual termina (null se está pausada manualmente) */
export function phaseEndAt(a: ActiveSession, c: PomodoroConfig, now: number): number | null {
  const p = a.pomo;
  if (!p) return null;
  if (p.phase === 'pausa') return (p.breakStart ?? now) + breakMs(p, c);
  if (!isRunning(a)) return null;
  return now + Math.max(0, c.focusMin * MIN - focusElapsedMs(a, now));
}
