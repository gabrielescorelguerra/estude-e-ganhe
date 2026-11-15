import type { Campaign, Election, FeedItem, Session } from '../core/types';
import { addDays, diffDays } from '../core/plan';
import { settleLosses } from '../core/penalty';
import { counterAttack } from '../core/rival';
import { EVENT_MIN_GAP_DAYS, rollEvent } from '../core/events';
import type { Placement } from '../core/strategies';
import { officialTally, sum } from '../core/tally';
import { splitInt } from '../core/strategies';
import { secondsByDay } from '../core/stats';
import type { Settlement } from './store';

const fmt = (n: number) => Math.round(n).toLocaleString('pt-BR');

/**
 * Fecha os dias encerrados da campanha: perdas por meta não cumprida, contra-ataque do adversário e eventos.
 * Retorna null se não há dia novo para apurar.
 */
export function runSettlement(a: {
  campaign: Campaign; sessions: Session[]; election: Election; today: string; rivalNr: number;
}): Settlement | null {
  const { campaign: c, election, today, rivalNr } = a;
  const mine = secondsByDay(a.sessions.filter((s) => s.campaignId === c.id));
  const r = settleLosses({
    settledThrough: c.settledThrough, today, deadline: c.deadline, goalMin: c.dailyGoalMin, rate: c.rate, rivalNr,
    lastFreeDay: c.lastFreeDay, studiedSeconds: (d) => mine.get(d) ?? 0,
  });
  if (r.settledThrough === c.settledThrough) return null;

  const focus = election.candidates[c.focusNr].name;
  const rival = election.candidates[rivalNr].name;
  const ufs = election.places.filter((p) => p.kind === 'uf');
  const weights = election.places.map((p) => sum(officialTally(election, c.round, p.id)));
  const feed: FeedItem[] = [];
  const opposition: Placement[] = [];
  const bonus: Placement[] = [];
  let id = 0;
  const push = (day: string, kind: FeedItem['kind'], x: Omit<FeedItem, 'id' | 'day' | 'kind'>) =>
    feed.push({ id: `${c.id}-${day}-${kind}-${id++}`, day, kind, ...x });

  // 1) metas não cumpridas
  const losses = c.penalty ? r.losses : [];
  const lossVotes = losses.reduce((s, l) => s + l.votes, 0);
  if (lossVotes > 0) {
    const parts = splitInt(lossVotes, weights);
    election.places.forEach((p, i) => parts[i] > 0 && opposition.push({ place: p.id, nr: rivalNr, votes: parts[i] }));
  }
  for (const l of losses) {
    push(l.day, 'perda', l.free
      ? { tone: 'neutro', title: 'Folga da semana', text: `Faltaram ${l.shortMin} min na meta, mas a folga da semana cobriu o dia.` }
      : { tone: 'ruim', title: 'Meta não cumprida', text: `Faltaram ${l.shortMin} min e ${rival} ganhou ${fmt(l.votes)} votos.` });
  }

  // 2) contra-ataque
  const lastDay = r.settledThrough;
  if (c.reactive) {
    for (const k of counterAttack(c.snapshot, c.allocations, c.focusNr)) {
      opposition.push({ place: k.place, nr: rivalNr, votes: k.votes });
      const name = election.places.find((p) => p.id === k.place)?.name ?? k.place;
      push(lastDay, 'contra', { tone: 'ruim', title: `${rival} reagiu em ${name}`, text: `Você colocou ${fmt(k.delta)} votos ali e o adversário respondeu com ${fmt(k.votes)}.` });
    }
  }

  // 3) eventos (no máximo nos 3 últimos dias fechados, respeitando o intervalo mínimo)
  let boost: Campaign['boost'] = null;
  let lastEventDay = c.lastEventDay;
  if (c.eventsOn) {
    const days: string[] = [];
    for (let d = addDays(c.settledThrough, 1); d <= r.settledThrough; d = addDays(d, 1)) days.push(d);
    for (const d of days.slice(-3)) {
      if (lastEventDay && diffDays(lastEventDay, d) < EVENT_MIN_GAP_DAYS) continue;
      const met = (mine.get(d) ?? 0) >= c.dailyGoalMin * 60;
      const ev = rollEvent(`${c.id}|${d}`, {
        today, rate: c.rate, goalMin: c.dailyGoalMin, focusName: focus, rivalName: rival,
        places: ufs.map((p) => ({ id: p.id, name: p.name })),
      }, met);
      if (!ev) continue;
      lastEventDay = d;
      push(d, 'evento', ev.feed);
      ev.focus?.forEach((p) => bonus.push({ place: p.place, nr: c.focusNr, votes: p.votes }));
      ev.rival?.forEach((p) => opposition.push({ place: p.place, nr: rivalNr, votes: p.votes }));
      if (ev.boost) boost = ev.boost;
    }
  }

  return {
    losses, settledThrough: r.settledThrough, lastFreeDay: r.lastFreeDay,
    opposition, bonus,
    feed: feed.sort((x, y) => y.day.localeCompare(x.day)), boost, snapshot: { ...c.allocations }, lastEventDay,
  };
}
