import type { ReactElement } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { Count } from './ui/motion';
import { useEffect, useState } from 'react';
import type { Election } from './core/types';
import { applyStrategy, dayKey, elapsedSeconds, fmtClock, isRunning, secondsByDay, streak, winnerOf, addTallies, officialTally, studyTally, oppTally, BADGES, type BadgeStats } from './core';
import { runSettlement } from './state/settle';
import { pomoView } from './core';
import { Toasts } from './ui/Toasts';
import { Retrospective } from './features/retro/Retrospective';
import { snapOf, sameSnap } from './core';
import { chime } from './ui/sound';
import { onServiceButton, setKeepAwake, syncPhaseAlarm, syncReminders, syncSessionService } from './platform/native';
import { DEFAULT_ELECTION, loadElection } from './data/loader';
import { selectCampaign, useStore, useUi, type Tab } from './state/store';
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
  // a eleição carregada acompanha a campanha ativa (cada campanha tem a sua)
  const wanted = useStore((s) => selectCampaign(s)?.electionId ?? DEFAULT_ELECTION);
  const load = () => { setErr(false); loadElection(wanted).then(setElection).catch(() => setErr(true)); };
  useEffect(load, [wanted]);

  if (err) return (
    <div className="error">
      <h2>Não foi possível carregar os dados eleitorais</h2>
      <p className="muted">O app embarca um snapshot dos dados oficiais, então isso normalmente indica um problema de instalação ou de rede ao abrir pela primeira vez.</p>
      <button className="btn" onClick={load}>Tentar de novo</button>
    </div>
  );
  if (!election || election.id !== wanted) return <div className="loading">Carregando eleição…</div>;
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
  const { place, setStrategy, patchCampaign, campaigns, applySettlement, sessions, badges, unlockBadges, dailyGoalMin } = useStore();
  const toast = useUi((u) => u.toast);
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

  // ---- Pomodoro, segundo plano, lembretes ----
  const active = useStore((s) => s.active);
  const pomodoro = useStore((s) => s.pomodoro);
  const reminders = useStore((s) => s.reminders);
  const prefs = useStore((s) => s.prefs);
  const setSummary = useUi((u) => u.setSummary);
  const focusName = election.candidates[game?.campaign.focusNr ?? -1]?.name ?? '';
  const rivalName = election.candidates[game?.goal.rivalNr ?? -1]?.name ?? '';

  // troca de fase: confere a cada segundo e ao voltar para o app
  const hasPomo = !!active?.pomo;
  useEffect(() => {
    if (!hasPomo) return;
    const run = () => {
      for (const ev of useStore.getState().tick(Date.now())) {
        const toBreak = ev.to !== 'foco';
        if (Date.now() - ev.at < 20000) {
          if (prefs.sound) chime(toBreak ? 'pausa' : 'foco');
          if (prefs.sound) navigator.vibrate?.(toBreak ? [120, 80, 120] : 200);
          toast({ title: toBreak ? (ev.to === 'pausa-longa' ? 'Pausa longa' : 'Hora da pausa') : 'De volta ao foco', text: toBreak ? 'Bloco concluído. Respire um pouco.' : 'Pausa terminou. Próximo bloco.', tone: toBreak ? 'bom' : 'neutro' });
        }
      }
    };
    run();
    const id = setInterval(run, 1000);
    document.addEventListener('visibilitychange', run);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', run); };
  }, [hasPomo, prefs.sound, toast]);

  // notificação fixa + alarme do fim da fase
  const phaseKey = active ? `${active.id}|${active.label}|${active.pomo?.phase}|${active.pomo?.blocks}|${active.segments.length}|${active.segments[active.segments.length - 1]?.end ?? 'run'}` : 'none';
  useEffect(() => {
    void syncSessionService(active, pomodoro, { focusName, rate: active?.rate ?? 0, enabled: prefs.foreground });
    void syncPhaseAlarm(active, pomodoro);
  }, [phaseKey, prefs.foreground]); // eslint-disable-line react-hooks/exhaustive-deps

  // botões da notificação (pausar/retomar/pular, finalizar)
  useEffect(() => {
    let off = () => {};
    void onServiceButton((id) => {
      const st = useStore.getState();
      if (id === 2) { const s = st.finish(); if (s) setSummary(s); return; }
      const a = st.active;
      if (!a) return;
      if (a.pomo?.phase === 'pausa') st.skipBreak();
      else if (a.segments[a.segments.length - 1].end === undefined) st.pause();
      else st.resume();
    }).then((o) => { off = o; });
    return () => off();
  }, [setSummary]);

  // tela ligada enquanto estuda
  useEffect(() => {
    const want = !!active && prefs.keepAwake;
    const apply = () => void setKeepAwake(want && document.visibilityState === 'visible');
    apply();
    document.addEventListener('visibilitychange', apply);
    return () => { document.removeEventListener('visibilitychange', apply); void setKeepAwake(false); };
  }, [active, prefs.keepAwake]);

  // lembretes
  const studiedToday = secondsByDay(sessions.filter((s) => s.campaignId === game?.campaign.id)).get(today) ?? 0;
  useEffect(() => {
    if (!game || game.campaign.status !== 'ativa') { void syncReminders({ cfg: { ...reminders, daily: false, risk: false }, now: Date.now(), today, goalMin: 0, studiedTodaySec: 0, focusName, rivalName, penalty: false, rate: 0 }); return; }
    void syncReminders({
      cfg: reminders, now: Date.now(), today, goalMin: game.campaign.dailyGoalMin, studiedTodaySec: studiedToday,
      focusName, rivalName, penalty: game.campaign.penalty, rate: game.campaign.rate,
    });
  }, [reminders, today, Math.floor(studiedToday / 60), game?.campaign.id, game?.campaign.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // fechamento dos dias: metas não cumpridas, contra-ataque e eventos
  const camp = game?.campaign;
  useEffect(() => {
    if (!game || !camp || camp.status !== 'ativa' || camp.mode === 'livre' || game.goal.reached) return;
    if (!camp.penalty && !camp.reactive && !camp.eventsOn) return;
    const s = runSettlement({ campaign: camp, sessions, election, today, rivalNr: game.goal.rivalNr });
    if (!s) return;
    applySettlement(camp.id, s);
    // avisa dos fatos mais recentes (no máximo 2)
    s.feed.filter((f) => f.kind !== 'perda' || f.tone === 'ruim').slice(0, 2)
      .forEach((f) => toast({ title: f.title, text: f.text, tone: f.tone }));
  }, [camp, game, sessions, today, election, applySettlement, toast]);

  // prazo encerrado sem o objetivo: derrota
  const lost = game?.expired && game.campaign.status === 'ativa' && game.campaign.mode !== 'livre';
  useEffect(() => {
    if (!game || !lost) return;
    patchCampaign(game.campaign.id, { status: 'derrota' });
    openCampaign('derrota');
  }, [lost, game, patchCampaign, openCampaign]);

  // histórico diário (alimenta a retrospectiva)
  const recordHistory = useStore((s) => s.recordHistory);
  useEffect(() => {
    if (!camp) return;
    const snap = snapOf(camp);
    if (!sameSnap(camp.history?.[today], snap)) recordHistory(camp.id, today, snap);
  }, [camp?.allocations, camp?.bonus, camp?.opposition, camp?.id, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // conquistas
  useEffect(() => {
    if (!game) return;
    const byDay = secondsByDay(sessions);
    let flips = 0;
    for (const p of election.places) {
      const off = officialTally(election, game.campaign.round, p.id);
      const sim = addTallies(addTallies(off, studyTally(game.campaign, p.id)), oppTally(game.campaign, p.id));
      if (p.kind === 'uf' && winnerOf(sim)?.nr !== winnerOf(off)?.nr) flips++;
    }
    const hour = (ts: number) => new Date(ts).getHours();
    const stats: BadgeStats = {
      sessions: sessions.length,
      totalSeconds: sessions.reduce((a, x) => a + x.seconds, 0),
      streak: streak(byDay, dailyGoalMin, today),
      longestSessionMin: Math.max(0, ...sessions.map((x) => x.seconds / 60)),
      flips,
      advanced: campaigns.some((c) => c.round === 1 && c.status === 'vencida'),
      won: campaigns.some((c) => c.round === 2 && c.status === 'vencida'),
      earlyBird: sessions.some((x) => hour(x.start) >= 4 && hour(x.start) < 6),
      nightOwl: sessions.some((x) => hour(x.start) >= 23),
      counters: campaigns.reduce((a, c) => a + c.feed.filter((f) => f.kind === 'contra').length, 0),
      events: campaigns.reduce((a, c) => a + c.feed.filter((f) => f.kind === 'evento').length, 0),
    };
    const fresh = BADGES.filter((b) => !badges[b.id] && b.check(stats));
    if (!fresh.length) return;
    unlockBadges(fresh.map((b) => b.id));
    fresh.slice(0, 2).forEach((b) => toast({ title: `Conquista: ${b.name}`, text: b.desc, tone: 'conquista' }));
  }, [sessions, campaigns, game, election, badges, dailyGoalMin, today, unlockBadges, toast]);

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

      <Toasts />
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
      {campaignModal === 'retro' && game && <Retrospective election={election} game={game} />}
      <SummaryModal election={election} game={game} />
    </div>
  );
}

/** mini-cronômetro nas telas que não são "Estudar" */
function Dock({ election }: { election: Election }) {
  const { active, pause, resume, finish } = useStore();
  const { tab, setTab, setSummary } = useUi();
  const running = !!active && isRunning(active);
  const pomodoro = useStore((s) => s.pomodoro);
  const now = useNow(!!active);
  const dv = active ? pomoView(active, pomodoro, now) : null;
  const show = !!active && tab !== 'estudar';
  return (
    <AnimatePresence>
      {show && active && (
    <motion.div className="dock" initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 34 }}>
      <span className="t num">{fmtClock(dv ? dv.remainingSec : elapsedSeconds(active, now))}</span>
      <span className="grow small muted">{dv ? (dv.phase === 'foco' ? `Foco ${dv.blockInCycle}/${pomodoro.cycles}` : 'Pausa') : running ? 'Estudando' : 'Em pausa'}{active.label ? ` · ${active.label}` : ''} · {election.year}</span>
      {dv && dv.phase !== 'foco' ? <button className="btn ghost small" onClick={useStore.getState().skipBreak}>Pular pausa</button> : running ? <button className="btn ghost small" onClick={pause}>Pausar</button> : <button className="btn small" onClick={resume}>Retomar</button>}
      <button className="btn study small" onClick={() => { const s = finish(); if (s) setSummary(s); }}>Finalizar</button>
      <button className="link small hide-m" onClick={() => setTab('estudar')}>Abrir</button>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
