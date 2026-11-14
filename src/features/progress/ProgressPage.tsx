import type { Election } from '../../core/types';
import { addDays, dayKey, fmtDate, fmtDuration, fmtHours, fmtInt, fmtTime, lastDays, secondsByDay, streak, sumSeconds } from '../../core';
import { useStore, useUi } from '../../state/store';

export function ProgressPage({ election }: { election: Election }) {
  const { sessions, dailyGoalMin, setDailyGoal, deleteSession, campaigns, activeCampaignId, selectCampaign, deleteCampaign } = useStore();
  const { openCampaign } = useUi();
  const today = dayKey(Date.now());
  const byDay = secondsByDay(sessions);
  const week = lastDays(byDay, today, 7);
  const max = Math.max(dailyGoalMin * 60, ...week.map((d) => d.seconds), 1);
  const goalS = dailyGoalMin * 60;
  const sk = streak(byDay, dailyGoalMin, today);
  const weekTotal = week.reduce((a, d) => a + d.seconds, 0);
  const bestDay = Math.max(0, ...byDay.values());

  // heatmap: 17 semanas terminando hoje, colunas = semanas (domingo→sábado)
  const dow = new Date().getDay();
  const start = addDays(today, -(16 * 7 + dow));
  const cells = Array.from({ length: 17 * 7 }, (_, i) => {
    const k = addDays(start, i);
    return { k, s: k > today ? -1 : byDay.get(k) ?? 0 };
  });
  const lvl = (s: number) => (s <= 0 ? '' : s < goalS * 0.34 ? 'l1' : s < goalS * 0.67 ? 'l2' : s < goalS ? 'l3' : 'l4');

  return (
    <div className="page">
      <header style={{ display: 'grid', gap: 6 }}>
        <span className="caps">Seu progresso</span>
        <h1>{fmtHours(sumSeconds(sessions))} estudadas</h1>
        <p className="muted">{sessions.length} {sessions.length === 1 ? 'sessão' : 'sessões'} · melhor dia: {fmtDuration(bestDay)} · sequência atual: {sk} {sk === 1 ? 'dia' : 'dias'}</p>
      </header>

      <section className="sect">
        <div className="sect-title"><h2 style={{ fontSize: 22 }}>Meta diária</h2><b className="num">{fmtDuration(goalS)}</b></div>
        <input type="range" min={15} max={360} step={5} value={dailyGoalMin} onChange={(e) => setDailyGoal(+e.target.value)} aria-label="Meta diária em minutos" />
        <p className="small muted">A meta alimenta a sequência de dias e é a base do plano das campanhas novas. Replanejar uma campanha usa a meta dela.</p>
      </section>

      <section className="sect">
        <div className="sect-title"><h2 style={{ fontSize: 22 }}>Últimos 7 dias</h2><span className="small muted">{fmtDuration(weekTotal)} no total</span></div>
        <div className="week-wrap">
          <div className="week" role="img" aria-label="Estudo por dia nos últimos 7 dias">
            {week.map((d) => (
              <div className="col" key={d.key}>
                <div className={`b${d.seconds >= goalS ? ' hit' : ''}`} style={{ height: `${(d.seconds / max) * 100}%` }} title={fmtDuration(d.seconds)} />
                <span className="small faint">{new Date(d.key + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'narrow' })}</span>
              </div>
            ))}
          </div>
        </div>
        <p className="small faint">Barras douradas: meta cumprida.</p>
      </section>

      <section className="sect">
        <h2 style={{ fontSize: 22 }}>Últimas 17 semanas</h2>
        <div className="heat" role="img" aria-label="Mapa de calor de estudo">
          {cells.map((c) => <i key={c.k} className={lvl(c.s)} style={c.s < 0 ? { visibility: 'hidden' } : undefined} title={`${c.k}: ${fmtDuration(Math.max(0, c.s))}`} />)}
        </div>
      </section>

      <section className="sect">
        <div className="sect-title"><h2 style={{ fontSize: 22 }}>Campanhas</h2><button className="btn ghost small" onClick={() => openCampaign('novo')}>Nova campanha</button></div>
        {campaigns.map((c) => {
          const cand = election.candidates[c.focusNr];
          const earned = sessions.reduce((a, s) => a + (s.campaignId === c.id ? s.votes : 0), 0);
          return (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--rule)' }}>
              <div>
                <b>{cand?.name ?? '—'}</b> <span className="muted">· {c.round}º turno · {c.status}</span>
                <div className="small muted num">{fmtInt(earned)} votos ganhos · 1 min = {fmtInt(c.rate)}</div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {c.id === activeCampaignId ? <span className="tag study">Ativa</span> : <button className="link small" onClick={() => selectCampaign(c.id)}>Ativar</button>}
                <button className="link small" onClick={() => confirm('Excluir esta campanha e suas alocações? As sessões de estudo são mantidas.') && deleteCampaign(c.id)}>Excluir</button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="sect">
        <h2 style={{ fontSize: 22 }}>Histórico</h2>
        {sessions.length === 0 ? <p className="muted">Nenhuma sessão ainda. Comece a estudar na aba Estudar.</p> : (
          <table className="hist">
            <thead><tr><th>Quando</th><th>Matéria</th><th className="r">Tempo</th><th className="r">Votos</th><th /></tr></thead>
            <tbody>
              {sessions.slice(0, 40).map((s) => (
                <tr key={s.id}>
                  <td>{fmtDate(s.start)} · {fmtTime(s.start)}</td>
                  <td>{s.label || <span className="faint">sem rótulo</span>}</td>
                  <td className="r num">{fmtDuration(s.seconds)}</td>
                  <td className="r num study-text">+{fmtInt(s.votes)}</td>
                  <td className="r"><button className="link small" onClick={() => confirm('Excluir esta sessão? Os votos dela saem do saldo.') && deleteSession(s.id)}>excluir</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {sessions.length > 40 && <p className="small faint">Mostrando as 40 mais recentes.</p>}
      </section>

      <section className="sect">
        <h2 style={{ fontSize: 22 }}>Sobre os dados</h2>
        <p className="small muted">
          <b>Oficial:</b> resultados do {election.source.publisher}, conjunto “{election.source.dataset}”, licença {election.source.license},
          snapshot de {new Date(election.source.generatedAt + 'T12:00').toLocaleDateString('pt-BR')}. {election.source.note}{' '}
          <a href={election.source.url} target="_blank" rel="noreferrer">Fonte</a>.
        </p>
        <p className="small muted"><b>Fictício:</b> os votos de estudo existem só neste app, ficam no seu aparelho e nunca alteram nem representam a apuração oficial.</p>
        <p className="small muted"><b>Mapas:</b> {election.source.geometry}. Alguns municípios criados depois dessa malha não aparecem no mapa, mas contam nos totais do estado.</p>
      </section>
    </div>
  );
}
