import type { ActiveSession, Segment } from './types';

export const elapsedMs = (s: Pick<ActiveSession, 'segments'>, now: number): number =>
  s.segments.reduce((sum, seg) => sum + Math.max(0, (seg.end ?? now) - seg.start), 0);

export const elapsedSeconds = (s: Pick<ActiveSession, 'segments'>, now: number) =>
  Math.floor(elapsedMs(s, now) / 1000);

export const isRunning = (s: Pick<ActiveSession, 'segments'>): boolean => {
  const last = s.segments[s.segments.length - 1];
  return !!last && last.end === undefined;
};

export function pauseSegments(segs: Segment[], now: number): Segment[] {
  return segs.map((g, i) => (i === segs.length - 1 && g.end === undefined ? { ...g, end: now } : g));
}

export function resumeSegments(segs: Segment[], now: number): Segment[] {
  const last = segs[segs.length - 1];
  if (last && last.end === undefined) return segs;
  return [...segs, { start: now }];
}

/** votos de um tempo (em segundos) a uma taxa (votos/min). Aritmética em segundos para o contador "correr". */
export const votesFor = (seconds: number, rate: number) => Math.round((seconds / 60) * rate);
