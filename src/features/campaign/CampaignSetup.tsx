import { useState } from 'react';
import type { Election, Round } from '../../core/types';
import {
  DIFFICULTY_LABEL, FREE_RATE, addDays, dayKey, difficulty, fmtCompact, fmtDuration, fmtInt, fmtPct,
  goalFor, marginVotes, officialTally, planRate, sum,
} from '../../core';
import { useStore, useUi } from '../../state/store';
import type { Game } from '../../state/useGame';
import { Avatar, Modal } from '../../ui/bits';

type Mode = 'novo' | 'avancar' | 'replanejar';

export function CampaignSetup({ election, mode, game }: { election: Election; mode: Mode; game: Game | null }) {
  const { openCampaign } = useUi();
  const { addCampaign, patchCampaign, setDailyGoal, dailyGoalMin, campaigns } = useStore();
  const cancellable = campaigns.length > 0;
  const replan = mode === 'replanejar' && game;
  const prev = game?.campaign;

  const [round, setRound] = useState<Round>(replan ? prev!.round : mode === 'avancar' ? 2 : 2);
  const r2 = election.rounds[1].candidates;
  const [focus, setFocus] = useState<number>(() => {
    if (replan) return prev!.focusNr;
    if (mode === 'avancar') return r2.includes(prev?.focusNr ?? -1) ? prev!.focusNr : r2[0];
    return election.rounds[1].candidates[1];
  });
  const [days, setDays] = useState(replan ? Math.max(7, Math.min(180, game!.daysLeft > 0 ? game!.daysLeft : 30)) : 30);
  const [minutes, setMinutes] = useState(replan ? prev!.dailyGoalMin : dailyGoalMin);
  const [marginPct, setMarginPct] = useState(replan ? prev!.marginPct || 2 : 2);
  const [penalty, setPenalty] = useState(replan ? prev!.penalty : true);
  const [free, setFree] = useState(replan ? prev!.mode === 'livre' : false);
  const [freeRate, setFreeRate] = useState(replan && prev!.mode === 'livre' ? prev!.rate : FREE_RATE);

  const roundCands = election.rounds[round - 1].candidates;
  const focusNr = roundCands.includes(focus) ? focus : roundCands[0];

  // base de cálculo: oficial (nova campanha) ou situação simulada atual (replanejar)
  const base = replan ? game!.simulated : officialTally(election, round);
  const total = sum(replan ? game!.official : base);
  const g0 = goalFor(round, focusNr, base, 0);
  const leading = g0.deficit <= 0 && g0.kind !== 'avancar';
  const effMargin = leading ? marginPct : 0;
  const goal = goalFor(round, focusNr, base, marginVotes(effMargin, total));
  const plan = planRate(goal.needed, days, minutes);
  const rate = free ? Math.max(1, Math.round(freeRate)) : plan.rate;
  const diff = difficulty(minutes);
  const rival = election.candidates[goal.rivalNr];
  const me = election.candidates[focusNr];
  const stuck = !free && goal.needed <= 0;

  const submit = () => {
    const common = { days, deadline: addDays(dayKey(Date.now()), days), dailyGoalMin: minutes, marginPct: effMargin, rate, baseNeeded: goal.needed };
    setDailyGoal(minutes);
    if (replan) {
      patchCampaign(prev!.id, { ...common, mode: free ? 'livre' : 'plano', penalty: penalty && !free, status: 'ativa', settledThrough: addDays(dayKey(Date.now()), -1) });
    } else {
      addCampaign({ electionId: election.id, round, focusNr, mode: free ? 'livre' : 'plano', penalty: penalty && !free, ...common });
    }
    openCampaign(null);
  };

  const title = replan ? 'Replanejar a campanha' : mode === 'avancar' ? 'Rumo ao 2º turno' : 'Nova campanha';
  const goalText =
    goal.kind === 'avancar' ? `Passar ${rival.name} e chegar ao 2º turno`
    : goal.kind === 'liderar' ? `Superar ${rival.name} e liderar o 1º turno` : `Vencer ${rival.name} no 2º turno`;

  return (
    <Modal title={title} wide onClose={cancellable ? () => openCampaign(null) : undefined}>
      {!cancellable && !replan && (
        <p className="muted">
          Escolha uma disputa real do passado. Cada minuto de estudo vira votos fictícios, separados da apuração oficial do TSE.
          Você define o prazo e a meta diária, e o app calcula quantos votos cada minuto vale para a vitória ser alcançável.
        </p>
      )}
      <div className="steps">
        {!replan && mode === 'novo' && (
          <>
            <div className="sect">
              <div className="step-h"><span className="n">1</span><span className="lbl">Eleição</span></div>
              <div className="choice">
                <button aria-pressed><b>Presidente · 2022</b><span className="small muted">Dados oficiais do TSE</span></button>
                <button disabled><b>Mais eleições</b><span className="small muted">Em breve: outros anos e cargos</span></button>
              </div>
            </div>
            <div className="sect">
              <div className="step-h"><span className="n">2</span><span className="lbl">Turno</span></div>
              <div className="choice">
                <button aria-pressed={round === 1} onClick={() => setRound(1)}><b>1º turno</b><span className="small muted">11 candidatos. Se chegar ao 2º turno, você avança.</span></button>
                <button aria-pressed={round === 2} onClick={() => setRound(2)}><b>2º turno</b><span className="small muted">Lula × Bolsonaro, disputa direta.</span></button>
              </div>
            </div>
          </>
        )}

        {!replan && (
          <div className="sect">
            <div className="step-h"><span className="n">{mode === 'novo' ? 3 : 1}</span><span className="lbl">{mode === 'avancar' ? 'Quem você apoia no 2º turno?' : 'Seu candidato'}</span></div>
            <div className="cands" role="group">
              {roundCands.map((nr) => {
                const c = election.candidates[nr];
                const t = election.rounds[round - 1].totals[roundCands.indexOf(nr)];
                return (
                  <button key={nr} aria-pressed={focusNr === nr} onClick={() => setFocus(nr)}>
                    <Avatar c={c} lg />
                    <span><b>{c.name}</b><br /><span className="small muted">{c.party} · {fmtPct(t / election.rounds[round - 1].totals.reduce((a, b) => a + b, 0))} oficial</span></span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="sect">
          {!replan && <div className="step-h"><span className="n">{mode === 'novo' ? 4 : 2}</span><span className="lbl">Prazo e meta</span></div>}
          <div className="sliders">
            <div className="slider-row">
              <div className="top"><span className="lbl">Prazo para o objetivo</span><b className="num">{days} dias</b></div>
              <input type="range" min={7} max={180} value={days} onChange={(e) => setDays(+e.target.value)} aria-label="Prazo em dias" />
            </div>
            <div className="slider-row">
              <div className="top"><span className="lbl">Meta de estudo por dia</span><b className="num">{fmtDuration(minutes * 60)}</b></div>
              <input type="range" min={15} max={360} step={5} value={minutes} onChange={(e) => setMinutes(+e.target.value)} aria-label="Meta diária em minutos" />
            </div>
            {leading && !free && (
              <div className="slider-row">
                <div className="top"><span className="lbl">{me.name} já lidera; folga que você quer construir</span><b className="num">{marginPct.toLocaleString('pt-BR')}% ≈ {fmtCompact(marginVotes(marginPct, total))} votos</b></div>
                <input type="range" min={0.5} max={10} step={0.5} value={marginPct} onChange={(e) => setMarginPct(+e.target.value)} aria-label="Folga em porcentagem" />
              </div>
            )}
          </div>
        </div>

        {!free && (
          <label className="sect" style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'start', gap: 10, display: 'grid', cursor: 'pointer' }}>
            <input type="checkbox" checked={penalty} onChange={(e) => setPenalty(e.target.checked)} style={{ marginTop: 4 }} />
            <span>
              <b>Oposição ativa</b>
              <span className="small muted" style={{ display: 'block' }}>
                Cada minuto da meta diária que você não estuda dá votos ao adversário: metade do que você ganharia (≈ {fmtInt(rate / 2)} por minuto).
                Uma folga por semana, sem punição. Se o prazo acabar sem o objetivo, você perde.
              </span>
            </span>
          </label>
        )}

        <div className="plan" aria-live="polite">
          <span className="caps">Objetivo</span>
          <span className="serif" style={{ fontSize: 19 }}>{free ? `Estudar livremente por ${me.name}` : goalText}</span>
          {!free && <span className="small muted">
            {goal.needed > 0 ? <>Faltam <b className="num">{fmtInt(goal.needed)}</b> votos{replan ? ' (já descontados os votos que você alocou)' : ''}.</> : 'Seu candidato já cumpre este objetivo.'}
          </span>}
          <span className="big num">1 min = {fmtInt(rate)} votos</span>
          <span className="small muted">
            {fmtInt(rate * 60)} votos por hora de estudo
            {!free && <> · {fmtDuration(plan.totalMinutes * 60)} planejados em {days} dias · dificuldade <b>{DIFFICULTY_LABEL[diff]}</b></>}
          </span>
          {stuck && <span className="small study-text">Aumente a folga, ou escolha outro candidato, para criar um desafio.</span>}
        </div>

        <details>
          <summary className="small muted" style={{ cursor: 'pointer' }}>Modo livre: definir a taxa manualmente</summary>
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} /> Usar taxa fixa, sem objetivo calculado
            </label>
            {free && (
              <div className="field"><label htmlFor="fr">Votos por minuto</label>
                <input id="fr" className="in" type="number" min={1} value={freeRate} onChange={(e) => setFreeRate(+e.target.value)} /></div>
            )}
          </div>
        </details>
      </div>
      <div className="actions">
        {(cancellable || replan) && <button className="btn ghost" onClick={() => openCampaign(null)}>Cancelar</button>}
        <button className="btn" disabled={stuck} onClick={submit}>{replan ? 'Aplicar novo plano' : 'Começar campanha'}</button>
      </div>
    </Modal>
  );
}
