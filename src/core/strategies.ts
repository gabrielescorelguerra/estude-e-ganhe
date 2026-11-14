import type { Election, Round, StrategyConfig, Tally } from './types';
import { addTallies, officialTally, oppTally, studyTally, sum } from './tally';
import type { Campaign } from './types';

export interface Placement {
  place: string;
  nr: number;
  votes: number;
}

export const STRATEGY_INFO: Record<StrategyConfig['kind'], { name: string; desc: string }> = {
  manual: { name: 'Manual', desc: 'Os votos ficam no saldo até você distribuí-los no mapa.' },
  concentrar: { name: 'Concentrar', desc: 'Divide cada sessão igualmente entre os estados que você escolher.' },
  proporcional: { name: 'Proporcional', desc: 'Reparte entre todos os estados conforme o tamanho do eleitorado.' },
  virar: { name: 'Virar estados', desc: 'Prioriza os estados mais baratos de virar a favor do seu candidato.' },
  rodizio: { name: 'Rodízio', desc: 'Cada sessão vai para um estado da sua lista, em sequência.' },
};

/** divide `amount` em partes inteiras proporcionais a `weights` (a soma é exata) */
export function splitInt(amount: number, weights: number[]): number[] {
  const tot = weights.reduce((a, b) => a + b, 0);
  if (amount <= 0 || tot <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / tot);
  const out = raw.map(Math.floor);
  let rest = amount - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k][1]]++;
  return out;
}

export interface StrategyCtx {
  election: Election;
  round: Round;
  focusNr: number;
  /** alocações atuais (para "virar estados" saber o que já foi gasto) */
  campaign: Pick<Campaign, 'allocations'> & Partial<Pick<Campaign, 'opposition'>>;
}

function ufTallies(ctx: StrategyCtx): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const p of ctx.election.places) {
    out[p.id] = addTallies(addTallies(officialTally(ctx.election, ctx.round, p.id), studyTally(ctx.campaign, p.id)), oppTally({ opposition: ctx.campaign.opposition ?? {} }, p.id));
  }
  return out;
}

/** gasta `amount` votos conforme a estratégia; retorna onde colocar e a estratégia atualizada (rodízio avança) */
export function applyStrategy(
  s: StrategyConfig,
  amount: number,
  ctx: StrategyCtx,
): { placements: Placement[]; next: StrategyConfig } {
  const f = ctx.focusNr;
  const place = (ids: string[], parts: number[]): Placement[] =>
    ids.map((id, i) => ({ place: id, nr: f, votes: parts[i] })).filter((p) => p.votes > 0);

  if (amount <= 0 || s.kind === 'manual') return { placements: [], next: s };

  if (s.kind === 'concentrar') {
    if (!s.ufs.length) return { placements: [], next: s };
    return { placements: place(s.ufs, splitInt(amount, s.ufs.map(() => 1))), next: s };
  }

  if (s.kind === 'proporcional') {
    const ids = ctx.election.places.map((p) => p.id);
    const w = ids.map((id) => sum(officialTally(ctx.election, ctx.round, id)));
    return { placements: place(ids, splitInt(amount, w)), next: s };
  }

  if (s.kind === 'rodizio') {
    if (!s.ufs.length) return { placements: [], next: s };
    const i = s.cursor % s.ufs.length;
    return {
      placements: [{ place: s.ufs[i], nr: f, votes: amount }],
      next: { ...s, cursor: (i + 1) % s.ufs.length },
    };
  }

  // virar: preenche, do mais barato ao mais caro, o que falta para o candidato ultrapassar o líder do estado
  const tallies = ufTallies(ctx);
  const gaps = Object.entries(tallies)
    .map(([id, t]) => {
      const mine = t[f] ?? 0;
      const other = Math.max(0, ...Object.entries(t).filter(([nr]) => Number(nr) !== f).map(([, v]) => v));
      return { id, gap: Math.max(0, other - mine + 1) };
    })
    .filter((g) => g.gap > 0)
    .sort((a, b) => a.gap - b.gap);
  const acc: Record<string, number> = {};
  let left = amount;
  for (const g of gaps) {
    if (left <= 0) break;
    const put = Math.min(left, g.gap);
    acc[g.id] = (acc[g.id] ?? 0) + put;
    left -= put;
  }
  if (left > 0) {
    // todos os estados já virados: reforça proporcionalmente
    const ids = ctx.election.places.map((p) => p.id);
    const parts = splitInt(left, ids.map((id) => sum(tallies[id])));
    ids.forEach((id, i) => (acc[id] = (acc[id] ?? 0) + parts[i]));
  }
  return { placements: Object.entries(acc).map(([id, v]) => ({ place: id, nr: f, votes: v })), next: s };
}
