import { useState } from 'react';
import type { Election } from '../../core/types';
import { elapsedSeconds, fmtClock, fmtCompact, fmtDuration, fmtInt, isRunning, votesFor } from '../../core';
import { diffDays, dayKey, effectiveRate, minutesToGoal, penaltyVotes, STRATEGY_INFO, secondsByDay, streak } from '../../core';
import { useStore, useUi } from '../../state/store';
import { useGame } from '../../state/useGame';
import { useNow } from './useNow';
import { Count } from '../../ui/motion';
import { Avatar } from '../../ui/bits';

export function StudyPage({ election }: { election: Election }) {
  const game = useGame(election);
  const { active, start, pause, resume, finish, discard, setLabel, labels, sessions, dailyGoalMin } = useStore();
  const { openCampaign, setSummary, setTab } = useUi();
  const running = !!active && isRunning(active);
  const now = useNow(running);
  const [draft, setDraft] = useState('');

  const secs = active ? elapsedSeconds(active, now) : 0;
  const liveVotes = active ? votesFor(secs, active.rate) : 0;

  const today = dayKey(now);
  const byDay = secondsByDay(sessions);
  const todaySecs = (byDay.get(today) ?? 0) + secs;
  const goalSecs = dailyGoalMin * 60;
  const sk = streak(byDay, dailyGoalMin, today);

  const onFinish = () => {
    const s = finish();
    setDraft('');
    if (s) setSummary(s);
  };

  const c = game?.campaign;
  const focus = c ? election.candidates[c.focusNr] : null;
  const rival = game ? election.candidates[game.goal.rivalNr] : null;

  return (
    <div className="study-page">
      <section className="clock-wrap" aria-label="Cronômetro">
        <p className="caps" style={{ minHeight: 16 }}>
          {active ? (running ? 'Estudando' : 'Em pausa') : 'Nova sessão'}
        </p>
        <div className={`clock num${active ? '' : ' idle'}`} role="timer" aria-live="off">{fmtClock(secs)}</div>

        {active ? (
          <input className="label-input" value={active.label} onChange={(e) => setLabel(e.target.value)}
            placeholder="O que você está estudando?" aria-label="Matéria" />
        ) : (
          <>
            <input className="label-input" value={draft} onChange={(e) => setDraft(e.target.value)}
              placeholder="O que você vai estudar? (opcional)" aria-label="Matéria"
              onKeyDown={(e) => e.key === 'Enter' && start(draft)} />
            {labels.length > 0 && (
              <div className="label-chips">
                {labels.slice(0, 5).map((l) => <button key={l} onClick={() => setDraft(l)}>{l}</button>)}
              </div>
            )}
          </>
        )}

        <div className="controls">
          {!active && <button className="btn" onClick={() => start(draft)}>Iniciar</button>}
          {active && running && <button className="btn ghost" onClick={pause}>Pausar</button>}
          {active && !running && <button className="btn" onClick={resume}>Retomar</button>}
          {active && <button className="btn study" onClick={onFinish}>Finalizar</button>}
        </div>
        {active && (
          <button className="link small" onClick={() => confirm('Descartar esta sessão sem contabilizar votos?') && discard()}>
            Descartar sessão
          </button>
        )}

        {c && c.boost && c.boost.until >= today && (
          <span className={`boost-chip${c.boost.mult < 1 ? ' ruim' : ''}`}>{c.boost.label}: votos ×{c.boost.mult.toLocaleString('pt-BR')} até {new Date(c.boost.until + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span>
        )}
        <div className="live-votes" aria-live="polite">
          {active && c ? (
            <>+{fmtInt(liveVotes)} votos<small>{focus?.name} · {fmtInt(active.rate)} por minuto</small></>
          ) : c ? (
            <span className="small muted">1 minuto de estudo = <b className="num study-text">{fmtInt(effectiveRate(c, today))}</b> votos para {focus?.name}</span>
          ) : null}
        </div>
      </section>

      {game && c && focus && rival && (
        <>
          <section className="goal-row">
            <div className="goal-head">
              <h2>
                {c.status === 'derrota' ? 'Prazo encerrado' : game.goal.reached ? 'Objetivo atingido'
                  : game.goal.kind === 'avancar' ? `Chegar ao 2º turno`
                  : game.goal.kind === 'liderar' ? 'Liderar o 1º turno' : 'Vencer o 2º turno'}
              </h2>
              <button className="link small" onClick={() => openCampaign('replanejar')}>Replanejar</button>
            </div>
            <div className="bar study" aria-hidden>
              <i style={{ width: `${Math.min(100, Math.max(0, c.baseNeeded > 0 ? (1 - game.goal.needed / c.baseNeeded) * 100 : 100))}%` }} />
            </div>
            <div className="small muted" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar c={focus} /> <span>{focus.name} contra {rival.name}.</span>
              {game.goal.reached
                ? <b>Você superou {rival.name}.</b>
                : <span>Faltam <b className="num"><Count value={game.goal.needed} fmt={fmtCompact} /></b> votos
                  (≈ {fmtDuration(minutesToGoal(game.goal.needed, c.rate) * 60)} de estudo).</span>}
            </div>
            {c.penalty && c.status === 'ativa' && (() => {
              const mine = secondsByDay(sessions.filter((s) => s.campaignId === c.id));
              const todayS = (mine.get(today) ?? 0) + secs;
              const shortMin = Math.max(0, c.dailyGoalMin - todayS / 60);
              const lastLoss = c.losses.find((l) => !l.free && l.votes > 0);
              return (
                <>
                  {shortMin >= 1 && (
                    <div className="banner">
                      Faltam <b className="num">{Math.ceil(shortMin)} min</b> hoje. Se o dia acabar assim, {rival.name} ganha{' '}
                      <b className="num opp-text">{fmtInt(penaltyVotes(shortMin, c.rate))}</b> votos
                      {c.lastFreeDay && diffDays(c.lastFreeDay, today) < 7 ? '' : ' (hoje você ainda tem a folga da semana)'}.
                    </div>
                  )}
                  {lastLoss && (
                    <p className="small muted">
                      Último dia perdido: {new Date(lastLoss.day + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}, faltaram {lastLoss.shortMin} min
                      e {rival.name} ganhou <b className="opp-text num">{fmtInt(lastLoss.votes)}</b> votos.
                    </p>
                  )}
                </>
              );
            })()}
            {game.expired && (
              <div className="banner">
                O prazo de {c.days} dias terminou antes do objetivo. <button className="link" onClick={() => openCampaign('replanejar')}>Definir novo prazo</button>
              </div>
            )}
          </section>

          <section className="facts" aria-label="Resumo">
            <div className="fact">
              <span className="caps">Hoje</span>
              <span className="v num">{fmtDuration(todaySecs)}</span>
              <div className="bar" aria-hidden><i style={{ width: `${Math.min(100, (todaySecs / goalSecs) * 100)}%` }} /></div>
              <span className="s">meta de {dailyGoalMin} min{todaySecs >= goalSecs ? ' · cumprida' : ''}</span>
            </div>
            <div className="fact">
              <span className="caps">Prazo</span>
              <span className="v num">{Math.max(0, game.daysLeft)} {Math.abs(game.daysLeft) === 1 ? 'dia' : 'dias'}</span>
              <span className="s">até {new Date(c.deadline + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}</span>
            </div>
            <div className="fact">
              <span className="caps">Sequência</span>
              <span className="v num">{sk} {sk === 1 ? 'dia' : 'dias'}</span>
              <span className="s">batendo a meta diária</span>
            </div>
          </section>

          <section className="wallet-row">
            <div>
              <div className="caps">Saldo para distribuir</div>
              <b className="num">{fmtInt(game.wallet + (active ? liveVotes : 0))}</b> <span className="muted small">votos de estudo</span>
              <div className="small muted">Distribuição: {STRATEGY_INFO[c.strategy.kind].name}
                {' · '}<button className="link" onClick={() => openCampaign('estrategia')}>alterar</button></div>
            </div>
            <button className="btn" onClick={() => setTab('mapa')}>Abrir o mapa</button>
          </section>
        </>
      )}
    </div>
  );
}
