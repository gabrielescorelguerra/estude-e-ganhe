import { describe, expect, it } from 'vitest';
import { goalFor, planRate, niceRate, addDays, defaultMarginPct } from './plan';
import { splitInt, applyStrategy } from './strategies';
import { elapsedSeconds, pauseSegments, resumeSegments, votesFor } from './timer';
import { streak } from './stats';
import { ufOfPlace, winnerOf, studyTally, allocKey } from './tally';
import type { Election } from './types';

describe('plano', () => {
  const r2 = { 13: 60345999, 22: 58206354 };
  it('2º turno: quem está atrás precisa cobrir a diferença + 1', () => {
    const g = goalFor(2, 22, r2, 0);
    expect(g.kind).toBe('vencer');
    expect(g.rivalNr).toBe(13);
    expect(g.needed).toBe(60345999 - 58206354 + 1);
  });
  it('2º turno: quem lidera só precisa da folga', () => {
    const g = goalFor(2, 13, r2, 3_000_000);
    expect(g.needed).toBe(3_000_000 - (60345999 - 58206354));
    expect(goalFor(2, 13, r2, 0).reached).toBe(true);
  });
  it('1º turno: fora do top-2 o objetivo é avançar', () => {
    const r1 = { 13: 57, 22: 51, 15: 5, 12: 3.6 };
    const g = goalFor(1, 15, r1, 0);
    expect(g.kind).toBe('avancar');
    expect(g.rivalNr).toBe(22);
    expect(g.needed).toBe(51 - 5 + 1);
  });
  it('taxa = faltante / minutos planejados, arredondada para cima', () => {
    const p = planRate(2_139_646, 30, 60);
    expect(p.totalMinutes).toBe(1800);
    expect(p.rate).toBe(niceRate(2_139_646 / 1800));
    expect(p.rate * 1800).toBeGreaterThanOrEqual(2_139_646);
  });
  it('folga padrão: 0 atrás, 2% se já lidera', () => {
    expect(defaultMarginPct(10)).toBe(0);
    expect(defaultMarginPct(-10)).toBe(2);
  });
  it('datas', () => expect(addDays('2026-02-27', 3)).toBe('2026-03-02'));
});

describe('timer', () => {
  it('soma só os trechos ativos', () => {
    let segs = [{ start: 0 }];
    segs = pauseSegments(segs, 10_000);
    segs = resumeSegments(segs, 50_000);
    expect(elapsedSeconds({ segments: segs }, 60_000)).toBe(20);
    expect(votesFor(60, 1200)).toBe(1200);
  });
});

describe('estratégias', () => {
  const election = {
    candidates: {}, rounds: [{ round: 1, candidates: [1, 2], totals: [] }, { round: 2, candidates: [1, 2], totals: [] }],
    places: [
      { id: 'AA', name: 'A', kind: 'uf', votes: [[0, 0], [100, 90]] },
      { id: 'BB', name: 'B', kind: 'uf', votes: [[0, 0], [100, 40]] },
      { id: 'CC', name: 'C', kind: 'uf', votes: [[0, 0], [10, 80]] },
    ],
  } as unknown as Election;
  const ctx = { election, round: 2 as const, focusNr: 2, campaign: { allocations: {} } };
  it('splitInt preserva a soma', () => {
    const p = splitInt(1000, [1, 1, 1]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(1000);
  });
  it('virar estados: enche o mais barato primeiro', () => {
    const { placements } = applyStrategy({ kind: 'virar' }, 30, ctx);
    // AA precisa de 11 (100-90+1), CC precisa de 1+... foco(2) já lidera CC (80>10); BB precisa 61
    expect(placements).toEqual([{ place: 'AA', nr: 2, votes: 11 }, { place: 'BB', nr: 2, votes: 19 }]);
  });
  it('rodízio avança o cursor', () => {
    const s = { kind: 'rodizio' as const, ufs: ['AA', 'BB'], cursor: 1 };
    const r = applyStrategy(s, 10, ctx);
    expect(r.placements[0].place).toBe('BB');
    expect(r.next).toMatchObject({ cursor: 0 });
  });
});

describe('tally', () => {
  it('município pertence à UF', () => expect(ufOfPlace('3550308')).toBe('SP'));
  it('estudo por UF inclui municípios', () => {
    const c = { allocations: { [allocKey('SP', 13)]: 5, [allocKey('3550308', 13)]: 7, [allocKey('RJ', 13)]: 1 } };
    expect(studyTally(c, 'SP')[13]).toBe(12);
    expect(studyTally(c, '3550308')[13]).toBe(7);
    expect(studyTally(c)[13]).toBe(13);
  });
  it('vencedor', () => expect(winnerOf({ 1: 60, 2: 40 })?.margin).toBeCloseTo(0.2));
});

describe('stats', () => {
  it('sequência', () => {
    const m = new Map([['2026-11-12', 3600], ['2026-11-13', 3600], ['2026-11-14', 0]]);
    expect(streak(m, 30, '2026-11-14')).toBe(2);
  });
});

import { settleLosses, penaltyVotes } from './penalty';
describe('oposição', () => {
  const base = { settledThrough: '2026-11-09', today: '2026-11-13', deadline: '2026-12-09', goalMin: 60, rate: 1000, rivalNr: 13, lastFreeDay: null as string | null };
  it('primeira falta da semana é folga; a seguinte custa metade da taxa', () => {
    const r = settleLosses({ ...base, studiedSeconds: (d) => (d === '2026-11-12' ? 3600 : 1800) });
    // 10, 11, 12(cumprido), -> dias apurados: 10, 11, 12
    expect(r.losses.map((l) => [l.day, l.free, l.votes])).toEqual([['2026-11-10', true, 0], ['2026-11-11', false, penaltyVotes(30, 1000)]]);
    expect(penaltyVotes(30, 1000)).toBe(15000);
    expect(r.settledThrough).toBe('2026-11-12');
    expect(r.lastFreeDay).toBe('2026-11-10');
  });
  it('a folga volta depois de 7 dias', () => {
    const r = settleLosses({ ...base, settledThrough: '2026-11-16', today: '2026-11-19', lastFreeDay: '2026-11-10', studiedSeconds: () => 0 });
    expect(r.losses.map((l) => l.free)).toEqual([true, false]);
  });
  it('não apura dias depois do prazo e nem o dia de hoje', () => {
    const r = settleLosses({ ...base, today: '2026-12-20', settledThrough: '2026-12-07', studiedSeconds: () => 0 });
    expect(r.losses.every((l) => l.day <= '2026-12-09')).toBe(true);
  });
});
