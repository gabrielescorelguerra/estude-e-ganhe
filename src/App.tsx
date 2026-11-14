import { useEffect, useState } from 'react';
import type { Election } from './core/types';
import { applyStrategy, elapsedSeconds, fmtClock, fmtInt, isRunning } from './core';
import { loadElection } from './data/loader';
import { useStore, useUi, type Tab } from './state/store';
import { useGame } from './state/useGame';
import { StudyPage } from './features/timer/StudyPage';
import { useNow } from './features/timer/useNow';
import { MapPage } from './features/map/MapPage';
import { ProgressPage } from './features/progress/ProgressPage';
import { CampaignSetup } from './features/campaign/CampaignSetup';
import { StrategyModal, SummaryModal, VictoryModal } from './features/campaign/Modals';

const TABS: [Tab, string][] = [['estudar', 'Estudar'], ['mapa', 'Mapa'], ['progresso', 'Progresso']];

export default function App() {
  const [election, setElection] = useState<Election | null>(null);
  const [err, setErr] = useState(false);
  const load = () => { setErr(false); loadElection().then(setElection).catch(() => setErr(true)); };
  useEffect(load, []);

  if (err) return (
    <div className="error">
      <h2>Não foi possível carregar os dados eleitorais</h2>
      <p className="muted">O app embarca um snapshot dos dados oficiais, então isso normalmente indica um problema de instalação ou de rede ao abrir pela primeira vez.</p>
      <button className="btn" onClick={load}>Tentar de novo</button>
    </div>
  );
  if (!election) return <div className="loading">Carregando eleição…</div>;
  return <Shell election={election} />;
}

function Shell({ election }: { election: Election }) {
  const { tab, setTab, campaignModal, openCampaign } = useUi();
  const game = useGame(election);
  const { place, setStrategy, patchCampaign, campaigns } = useStore();

  // sem campanha: onboarding obrigatório
  useEffect(() => { if (campaigns.length === 0) openCampaign('novo'); }, [campaigns.length, openCampaign]);

  // distribuição automática do saldo
  const wallet = game?.wallet ?? 0;
  const strat = game?.campaign.strategy;
  useEffect(() => {
    if (!game || wallet <= 0 || !strat || strat.kind === 'manual') return;
    const c = game.campaign;
    const { placements, next } = applyStrategy(strat, wallet, { election, round: c.round, focusNr: c.focusNr, campaign: c });
    if (placements.length) place(c.id, placements);
    if (next !== strat) setStrategy(c.id, next);
  }, [wallet, strat, game, election, place, setStrategy]);

  // objetivo atingido: marca a campanha e celebra uma única vez
  const reached = game?.goal.reached && game.campaign.status === 'ativa';
  useEffect(() => {
    if (!game || !reached || game.campaign.mode === 'livre') return;
    patchCampaign(game.campaign.id, { status: 'vencida' });
    openCampaign('vitoria');
  }, [reached, game, patchCampaign, openCampaign]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-in">
          <span className="brand">Estude <i>&amp;</i> Ganhe</span>
          <nav className="nav" aria-label="Seções">
            {TABS.map(([t, l]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{l}</button>)}
          </nav>
          <div className="header-right">
            {game && (
              <>
                <span className="small muted hide-m">Saldo <b className="num study-text">{fmtInt(Math.max(0, game.wallet))}</b></span>
                <button className="chip" onClick={() => openCampaign('replanejar')} title="Replanejar campanha">
                  <span className="dot" style={{ background: election.candidates[game.campaign.focusNr].color }} />
                  {election.candidates[game.campaign.focusNr].name} · {game.campaign.round}º turno
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="main">
        {game && tab === 'estudar' && <StudyPage election={election} />}
        {game && tab === 'mapa' && <MapPage election={election} game={game} />}
        {tab === 'progresso' && <ProgressPage election={election} />}
        {!game && <div className="loading">Crie sua primeira campanha para começar</div>}
      </main>

      <Dock election={election} />
      <nav className="tabbar" aria-label="Seções">
        {TABS.map(([t, l]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{l}</button>)}
      </nav>

      {(campaignModal === 'novo' || campaignModal === 'avancar' || (campaignModal === 'replanejar' && game)) && (
        <CampaignSetup election={election} mode={campaignModal} game={game} />
      )}
      {campaignModal === 'estrategia' && game && <StrategyModal game={game} />}
      {campaignModal === 'vitoria' && game && <VictoryModal election={election} game={game} />}
      <SummaryModal election={election} game={game} />
    </div>
  );
}

/** mini-cronômetro nas telas que não são "Estudar" */
function Dock({ election }: { election: Election }) {
  const { active, pause, resume, finish } = useStore();
  const { tab, setTab, setSummary } = useUi();
  const running = !!active && isRunning(active);
  const now = useNow(running);
  if (!active || tab === 'estudar') return null;
  return (
    <div className="dock">
      <span className="t num">{fmtClock(elapsedSeconds(active, now))}</span>
      <span className="grow small muted">{running ? 'Estudando' : 'Em pausa'}{active.label ? ` · ${active.label}` : ''} · {election.year}</span>
      {running ? <button className="btn ghost small" onClick={pause}>Pausar</button> : <button className="btn small" onClick={resume}>Retomar</button>}
      <button className="btn study small" onClick={() => { const s = finish(); if (s) setSummary(s); }}>Finalizar</button>
      <button className="link small hide-m" onClick={() => setTab('estudar')}>Abrir</button>
    </div>
  );
}
