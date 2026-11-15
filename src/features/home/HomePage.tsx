import type { Election } from '../../core/types';
import {
  dayKey, diffDays, elapsedSeconds, fmtClock, fmtCompact, fmtDate, fmtDuration, fmtInt, fmtTime, isRunning,
  lastDays, minutesToGoal, secondsByDay, streak,
} from '../../core';
import { useStore, useUi } from '../../state/store';
import { useGame } from '../../state/useGame';
import { useNow } from '../timer/useNow';
import { ResultBars } from '../../ui/bits';
import { Count } from '../../ui/motion';
import { IconPlay } from '../../ui/icons';

const greeting = () => {
  const h = new Date().getHours();
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
};

export function HomePage({ election }: { election: Election }) {
  const game = useGame(election);
  const { sessions, dailyGoalMin, active } = useStore();
  const { setTab, openCampaign } = useUi();
  const running = !!active && isRunning(active);
  const now = useNow(!!active);
  if (!game) return null;
  const c = game.campaign;
  const focus = election.candidates[c.focusNr];
  const rival = election.candidates[game.goal.rivalNr];
  const today = dayKey(now);
  const byDay = secondsByDay(sessions);
  const todayS = (byDay.get(today) ?? 0) + (active ? elapsedSeconds(active, now) : 0);
  const goalS = dailyGoalMin * 60;
  const sk = streak(byDay, dailyGoalMin, today);
  const week = lastDays(byDay, today, 7);
  const weekMax = Math.max(goalS, ...week.map((d) => d.seconds), 1);
  const pct = c.baseNeeded > 0 ? Math.min(100, Math.max(0, (1 - game.goal.needed / c.baseNeeded) * 100)) : 100;
  const dayN = Math.max(1, Math.min(c.days, c.days - game.daysLeft + 1));
  const recent = sessions.slice(0, 4);
  const goalTitle =
    c.status === 'derrota' ? 'Prazo encerrado'
    : game.goal.reached ? 'Objetivo atingido'
    : game.goal.kind === 'avancar' ? 'Chegar ao 2º turno'
    : game.goal.kind === 'liderar' ? 'Liderar o 1º turno' : 'Vencer o 2º turno';
  const lastLoss = c.penalty ? c.losses.find((l) => !l.free && l.votes > 0) : undefined;

  return (
    <div className="page home">
      <header className="home-head">
        <span className="caps">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <h1>{greeting()}.</h1>
      </header>

      <section className="card hero">
        <div className="hero-top">
          <div>
            <span className="caps">Campanha · {election.title} · {c.round}º turno</span>
            <h2>{goalTitle}</h2>
            <p className="muted">
              <b>{focus.name}</b> contra <b>{rival.name}</b>
              {game.goal.reached ? '. Você superou o adversário.' : <>. Faltam <b className="num"><Count value={game.goal.needed} fmt={fmtCompact} /></b> votos, ≈ {fmtDuration(minutesToGoal(game.goal.needed, c.rate) * 60)} de estudo.</>}
            </p>
          </div>
          <div className="hero-day num"><span>Dia</span><b>{dayN}</b><span>de {c.days}</span></div>
        </div>
        <div className="bar study" aria-label={`Progresso ${Math.round(pct)}%`}><i style={{ width: `${pct}%` }} /></div>
        <div className="hero-actions">
          <button className="btn lg" onClick={() => setTab('estudar')}>
            {active ? <>{running ? 'Continuar sessão' : 'Retomar sessão'} · <span className="num">{fmtClock(elapsedSeconds(active, now))}</span></> : <><IconPlay /> Começar a estudar</>}
          </button>
          <button className="btn ghost" onClick={() => setTab('mapa')}>Abrir o mapa</button>
          <button className="btn ghost" onClick={() => openCampaign('retro')}>Retrospectiva</button>
        </div>
        {lastLoss && (
          <p className="small hero-warn">Último dia perdido ({fmtDate(new Date(lastLoss.day + 'T12:00').getTime())}): {rival.name} ganhou <b className="num opp-text">{fmtInt(lastLoss.votes)}</b> votos.</p>
        )}
        {game.expired && <p className="small hero-warn">O prazo acabou. <button className="link" onClick={() => openCampaign('replanejar')}>Definir novo prazo</button></p>}
      </section>

      <section className="stats">
        <div className="card stat">
          <span className="caps">Hoje</span>
          <b className="num">{fmtDuration(todayS)}</b>
          <div className="bar" aria-hidden><i style={{ width: `${Math.min(100, (todayS / goalS) * 100)}%` }} /></div>
          <span className="small muted">meta de {fmtDuration(goalS)}{todayS >= goalS ? ' · cumprida' : ''}</span>
        </div>
        <div className="card stat">
          <span className="caps">Sequência</span>
          <b className="num">{sk} {sk === 1 ? 'dia' : 'dias'}</b>
          <div className="spark" aria-hidden>
            {week.map((d) => <i key={d.key} className={d.seconds >= goalS ? 'hit' : ''} style={{ height: `${Math.max(6, (d.seconds / weekMax) * 100)}%` }} />)}
          </div>
          <span className="small muted">últimos 7 dias</span>
        </div>
        <div className="card stat">
          <span className="caps">Prazo</span>
          <b className="num">{Math.max(0, game.daysLeft)} {Math.abs(game.daysLeft) === 1 ? 'dia' : 'dias'}</b>
          <span className="small muted">1 min = <b className="num study-text">{fmtInt(c.rate)}</b> votos</span>
          <span className="small muted">Saldo: <b className="num study-text"><Count value={Math.max(0, game.wallet)} /></b></span>
        </div>
      </section>

      <div className="home-cols">
        <section className="card">
          <div className="sect-title"><h3>Placar nacional</h3><button className="link small" onClick={() => setTab('mapa')}>ver no mapa</button></div>
          <ResultBars election={election} order={election.rounds[c.round - 1].candidates} official={game.official} study={game.study} opp={game.opp} mode="simulado" focusNr={c.focusNr} limit={c.round === 1 ? 4 : 2} />
        </section>
        <section className="card">
          <div className="sect-title"><h3>Últimas sessões</h3><button className="link small" onClick={() => setTab('progresso')}>histórico</button></div>
          {recent.length === 0 ? <p className="muted small">Nenhuma sessão ainda. Sua primeira sessão aparece aqui.</p> : (
            <ul className="mini-list">
              {recent.map((s) => (
                <li key={s.id}>
                  <span><b>{s.label || 'Sessão de estudo'}</b><span className="small muted"> · {fmtDate(s.start)}, {fmtTime(s.start)}</span></span>
                  <span className="num small"><b>{fmtDuration(s.seconds)}</b> <span className="study-text">+{fmtCompact(s.votes)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {c.feed.length > 0 && (
        <section className="card">
          <div className="sect-title"><h3>Notícias da campanha</h3><span className="small faint">{c.feed.length} no total</span></div>
          <ul className="feed">
            {c.feed.slice(0, 5).map((f) => (
              <li key={f.id} className={f.tone}>
                <i className="mk" />
                <span><b>{f.title}</b><span className="small muted">{f.text}</span><span className="small faint"> · {fmtDate(new Date(f.day + 'T12:00').getTime())}</span></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="small faint" style={{ textAlign: 'center' }}>{diffDays(dayKey(c.createdAt), today)} dias de campanha · dados eleitorais oficiais do TSE; votos de estudo são fictícios.</p>
    </div>
  );
}
