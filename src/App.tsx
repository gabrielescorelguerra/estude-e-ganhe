import type { ReactElement } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Count } from './ui/motion';
import { useEffect, useState } from 'react';
import type { Election } from './core/types';
import { applyStrategy, dayKey, elapsedSeconds, fmtClock, isRunning, secondsByDay, settleLosses, splitInt, sum, officialTally } from './core';
import { loadElection } from './data/loader';
import { useStore, useUi, type Tab } from './state/store';
import { useGame } from './state/useGame';
import { HomePage } from './features/home/HomePage';
import { SettingsPage } from './features/settings/SettingsPage';
import { IconChart, IconGear, IconHome, IconMap, IconTimer } from './ui/icons';
import { StudyPage } from './features/timer/StudyPage';
import { useNow } from './features/timer/useNow';
import { MapPage } from './features/map/MapPage';
import { ProgressPage } from './features/progress/ProgressPage';
import { CampaignSetup } from './features/campaign/CampaignSetup';
import { DefeatModal, StrategyModal, SummaryModal, VictoryModal } from './features/campaign/Modals';

const TABS: [Tab, string, () => ReactElement][] = [
  ['inicio', 'Início', IconHome], ['estudar', 'Estudar', IconTimer], ['mapa', 'Mapa', IconMap],
  ['progresso', 'Progresso', IconChart], ['ajustes', 'Ajustes', IconGear],
];

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
  return <MotionConfig reducedMotion="user"><Shell election={election} /></MotionConfig>;
}

function Shell({ election }: { election: Election }) {
  const { tab, setTab, campaignModal, openCampaign } = useUi();
  const game = useGame(election);
  const theme = useStore((s) => s.theme);
  useEffect(() => {
    const r = document.documentElement;
    if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme === 'claro' ? 'light' : 'dark');
  }, [theme]);
  const { place, setStrategy, patchCampaign, campaigns, settle, sessions } = useStore();
  const [today, setToday] = useState(() => dayKey(Date.now()));
  useEffect(() => {
    const id = setInterval(() => setToday(dayKey(Date.now())), 30000);
    return () => clearInterval(id);
  }, []);

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

  // oposição ativa: apura os dias encerrados e dá os votos do adversário
  const camp = game?.campaign;
  useEffect(() => {
    if (!game || !camp || !camp.penalty || camp.status !== 'ativa' || camp.mode === 'livre') return;
    if (game.goal.reached) return;
    const mine = secondsByDay(sessions.filter((s) => s.campaignId === camp.id));
    const r = settleLosses({
      settledThrough: camp.settledThrough, today, deadline: camp.deadline, goalMin: camp.dailyGoalMin,
      rate: camp.rate, rivalNr: game.goal.rivalNr, lastFreeDay: camp.lastFreeDay,
      studiedSeconds: (d) => mine.get(d) ?? 0,
    });
    if (r.settledThrough === camp.settledThrough) return;
    const total = r.losses.reduce((a, l) => a + l.votes, 0);
    const places = election.places.map((p) => p.id);
    const parts = total > 0 ? splitInt(total, places.map((id) => sum(officialTally(election, camp.round, id)))) : [];
    settle(camp.id, r, places.map((id, i) => ({ place: id, nr: game.goal.rivalNr, votes: parts[i] ?? 0 })).filter((p) => p.votes > 0));
  }, [camp, game, sessions, today, election, settle]);

  // prazo encerrado sem o objetivo: derrota
  const lost = game?.expired && game.campaign.status === 'ativa' && game.campaign.mode !== 'livre';
  useEffect(() => {
    if (!game || !lost) return;
    patchCampaign(game.campaign.id, { status: 'derrota' });
    openCampaign('derrota');
  }, [lost, game, patchCampaign, openCampaign]);

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
          <span className="brand">
            <svg viewBox="0 0 512 512" aria-hidden><rect width="512" height="512" rx="112" fill="#17171a" /><circle cx="256" cy="246" r="150" fill="none" stroke="#f0b52e" strokeWidth="32" /><path d="M256 246V140M256 246l72 44" fill="none" stroke="#f1f1ee" strokeWidth="32" strokeLinecap="round" /></svg>
            <span className="bt">Estude <i>&amp;</i> Ganhe</span>
          </span>
          <nav className="nav" aria-label="Seções">
            {TABS.map(([t, l]) => (
              <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
                {tab === t && <motion.i layoutId="navpill" className="navpill" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}
                <span>{l}</span>
              </button>
            ))}
          </nav>
          <div className="header-right">
            {game && (
              <>
                <span className="small muted hide-m">Saldo <b className="num study-text"><Count value={Math.max(0, game.wallet)} /></b></span>
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
        <motion.div key={tab} className="view" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
          {game && tab === 'inicio' && <HomePage election={election} />}
          {tab === 'ajustes' && <SettingsPage election={election} />}
          {game && tab === 'estudar' && <StudyPage election={election} />}
          {game && tab === 'mapa' && <MapPage election={election} game={game} />}
          {tab === 'progresso' && <ProgressPage election={election} />}
          {!game && <div className="loading">Crie sua primeira campanha para começar</div>}
        </motion.div>
      </main>

      <Dock election={election} />
      <nav className="tabbar" aria-label="Seções">
        {TABS.map(([t, l, Icon]) => <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{tab === t && <motion.i layoutId="tabmark" className="tabmark" transition={{ type: 'spring', stiffness: 500, damping: 36 }} />}<Icon /><span>{l}</span></button>)}
      </nav>

      {(campaignModal === 'novo' || campaignModal === 'avancar' || (campaignModal === 'replanejar' && game)) && (
        <CampaignSetup election={election} mode={campaignModal} game={game} />
      )}
      {campaignModal === 'estrategia' && game && <StrategyModal game={game} />}
      {campaignModal === 'vitoria' && game && <VictoryModal election={election} game={game} />}
      {campaignModal === 'derrota' && game && <DefeatModal election={election} game={game} />}
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
  const show = !!active && tab !== 'estudar';
  return (
    <AnimatePresence>
      {show && active && (
    <motion.div className="dock" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
      <span className="t num">{fmtClock(elapsedSeconds(active, now))}</span>
      <span className="grow small muted">{running ? 'Estudando' : 'Em pausa'}{active.label ? ` · ${active.label}` : ''} · {election.year}</span>
      {running ? <button className="btn ghost small" onClick={pause}>Pausar</button> : <button className="btn small" onClick={resume}>Retomar</button>}
      <button className="btn study small" onClick={() => { const s = finish(); if (s) setSummary(s); }}>Finalizar</button>
      <button className="link small hide-m" onClick={() => setTab('estudar')}>Abrir</button>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
