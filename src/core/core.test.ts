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

import { counterAttack, COUNTER_FACTOR } from './rival';
import { rollEvent, rng, effectiveRate, EVENT_CHANCE } from './events';
import { BADGES } from './badges';
describe('contra-ataque', () => {
  it('reage nos estados onde você mais investiu desde a última apuração', () => {
    const prev = { 'SP|13': 1000 };
    const now = { 'SP|13': 3000, '3550308|13': 2000, 'RJ|13': 500, 'MG|13': 100, 'BA|13': 50, 'SP|99': 9999 };
    const c = counterAttack(prev, now, 13);
    expect(c.map((x) => x.place)).toEqual(['SP', 'RJ', 'MG']);
    expect(c[0].delta).toBe(4000);
    expect(c[0].votes).toBe(Math.round(4000 * COUNTER_FACTOR));
  });
  it('sem novos votos não há reação', () => expect(counterAttack({ 'SP|13': 5 }, { 'SP|13': 5 }, 13)).toEqual([]));
});
describe('eventos', () => {
  const ctx = { today: '2026-11-14', rate: 1000, goalMin: 60, focusName: 'A', rivalName: 'B', places: ['SP', 'RJ', 'MG', 'BA'].map((id) => ({ id, name: id })) };
  it('é determinístico', () => {
    for (let i = 0; i < 40; i++) expect(JSON.stringify(rollEvent('c|' + i, ctx, true))).toBe(JSON.stringify(rollEvent('c|' + i, ctx, true)));
    expect(rng('x')()).toBe(rng('x')());
  });
  it('frequência próxima da chance configurada, e quem cumpre a meta recebe mais boas notícias', () => {
    let n = 0, goodMet = 0, goodMissed = 0, totMet = 0, totMissed = 0;
    for (let i = 0; i < 4000; i++) {
      const a = rollEvent('s|' + i, ctx, true), b = rollEvent('s|' + i, ctx, false);
      if (a) { n++; totMet++; if (a.feed.tone === 'bom') goodMet++; }
      if (b) { totMissed++; if (b.feed.tone === 'bom') goodMissed++; }
    }
    expect(n / 4000).toBeGreaterThan(EVENT_CHANCE - 0.05);
    expect(n / 4000).toBeLessThan(EVENT_CHANCE + 0.05);
    expect(goodMet / totMet).toBeGreaterThan(goodMissed / totMissed + 0.2);
  });
  it('bônus de taxa vale até o dia indicado', () => {
    const c = { rate: 1000, boost: { mult: 2, until: '2026-11-14' } };
    expect(effectiveRate(c, '2026-11-14')).toBe(2000);
    expect(effectiveRate(c, '2026-11-15')).toBe(1000);
  });
});
describe('conquistas', () => {
  const base = { sessions: 0, totalSeconds: 0, streak: 0, longestSessionMin: 0, flips: 0, advanced: false, won: false, earlyBird: false, nightOwl: false, counters: 0, events: 0 };
  it('ids únicos e nada desbloqueado do zero', () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
    expect(BADGES.filter((b) => b.check(base))).toEqual([]);
  });
  it('desbloqueia por critério', () => {
    const got = BADGES.filter((b) => b.check({ ...base, sessions: 5, totalSeconds: 11 * 3600, streak: 7 })).map((b) => b.id);
    expect(got).toEqual(['primeira', 'cinco', 'dez-horas', 'semana']);
  });
});

import { advance, skipBreak, newPomo, pomoView, phaseEndAt, DEFAULT_POMODORO } from './pomodoro';
import type { ActiveSession } from './types';
describe('pomodoro', () => {
  const cfg = { ...DEFAULT_POMODORO, on: true, focusMin: 25, breakMin: 5, longBreakMin: 15, cycles: 4 };
  const t0 = 1_000_000_000_000;
  const MIN = 60000;
  const mk = (): ActiveSession => ({ id: 'a', label: '', campaignId: null, rate: 1000, segments: [{ start: t0 }], pomo: newPomo() });
  it('troca para a pausa no instante exato do fim do bloco, mesmo que o app tenha ficado em segundo plano', () => {
    const r = advance(mk(), cfg, t0 + 40 * MIN); // 25 foco + 5 pausa + 10 foco
    expect(r.events.map((e) => e.to)).toEqual(['pausa', 'foco']);
    expect(r.events[0].at).toBe(t0 + 25 * MIN);
    expect(r.events[1].at).toBe(t0 + 30 * MIN);
    // estudado: 25 + 10 min; a pausa não conta
    expect(elapsedSeconds(r.session, t0 + 40 * MIN)).toBe(35 * 60);
    expect(r.session.pomo).toMatchObject({ phase: 'foco', blocks: 1 });
  });
  it('a 4ª pausa é longa', () => {
    let s = mk();
    let now = t0;
    for (let i = 0; i < 4; i++) { now += 25 * MIN; s = advance(s, cfg, now).session; if (i < 3) { now += 5 * MIN; s = advance(s, cfg, now).session; } }
    expect(s.pomo).toMatchObject({ phase: 'pausa', blocks: 4, long: true });
    expect(pomoView(s, cfg, now + 60000)?.remainingSec).toBe(14 * 60);
  });
  it('pausar manualmente congela o bloco; pular a pausa volta ao foco', () => {
    let s = mk();
    s = { ...s, segments: [{ start: t0, end: t0 + 10 * MIN }] };
    expect(advance(s, cfg, t0 + 90 * MIN).events).toEqual([]);
    expect(phaseEndAt(s, cfg, t0 + 20 * MIN)).toBeNull();
    const br = advance(mk(), cfg, t0 + 26 * MIN).session;
    expect(br.pomo?.phase).toBe('pausa');
    const back = skipBreak(br, t0 + 27 * MIN);
    expect(back.pomo?.phase).toBe('foco');
    expect(elapsedSeconds(back, t0 + 29 * MIN)).toBe(27 * 60);
  });
});

import { buildFrames, snapOf } from './timelapse';
import type { Campaign, Session } from './types';
describe('retrospectiva', () => {
  const mkC = (extra: Partial<Campaign> = {}): Campaign => ({
    id: 'c', createdAt: new Date('2026-11-10T12:00:00').getTime(), deadline: '2026-12-10', allocations: { 'SP|22': 600, '3550308|22': 400, 'RJ|22': 100 },
    bonus: { 'SP|22': 100 }, opposition: { 'MG|13': 50 }, feed: [], history: {}, ...extra,
  } as unknown as Campaign);
  const sess = (day: string, votes: number): Session => ({ id: day, campaignId: 'c', label: '', start: new Date(day + 'T10:00:00').getTime(), end: 0, seconds: 3600, rate: 1, votes });
  it('agrega por estado, incluindo municípios e bônus', () => {
    expect(snapOf(mkC())).toEqual({ s: { 'SP|22': 1100, 'RJ|22': 100 }, o: { 'MG|13': 50 } });
  });
  it('sem histórico: estima pela curva de votos ganhos e termina no resultado atual', () => {
    const r = buildFrames(mkC(), [sess('2026-11-10', 100), sess('2026-11-12', 300)], '2026-11-13');
    expect(r.estimated).toBe(true);
    expect(r.estimatedUntil).toBe('2026-11-13');
    expect(r.frames.map((f) => f.day)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(r.frames[0].study['SP|22']).toBe(Math.round(1100 * 0.25));
    expect(r.frames[3].study['SP|22']).toBe(1100);
    expect(r.frames[3].opp['MG|13']).toBe(50);
    expect(r.frames[2].minutes).toBe(60);
  });
  it('com histórico: usa o último retrato até cada dia', () => {
    const history = { '2026-11-10': { s: { 'SP|22': 10 }, o: {} }, '2026-11-12': { s: { 'SP|22': 500 }, o: {} } };
    const r = buildFrames(mkC({ history }), [], '2026-11-13');
    expect(r.estimated).toBe(false);
    expect(r.frames.map((f) => f.study['SP|22'])).toEqual([10, 10, 500, 1100]);
    expect(r.estimatedUntil).toBeNull();
  });
  it('histórico que começa no meio: estima só os dias anteriores', () => {
    const history = { '2026-11-12': { s: { 'SP|22': 800 }, o: {} } };
    const r = buildFrames(mkC({ history }), [sess('2026-11-10', 100), sess('2026-11-11', 100), sess('2026-11-12', 200)], '2026-11-13');
    expect(r.estimatedUntil).toBe('2026-11-11');
    expect(r.frames[0].study['SP|22']).toBe(200);
    expect(r.frames[1].study['SP|22']).toBe(400);
    expect(r.frames[2].study['SP|22']).toBe(800);
    expect(r.frames[3].study['SP|22']).toBe(1100);
  });
});
