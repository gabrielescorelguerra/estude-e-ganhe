import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import { motion } from 'motion/react';
import type { Election, Tally } from '../../core/types';
import {
  buildFrames, fmtCompact, fmtDuration, fmtInt, officialTally, winnerOf, addTallies, dayKey, sum, type Frame,
} from '../../core';
import { loadUfGeo, type GeoFC } from '../../data/loader';
import type { Game } from '../../state/useGame';
import { useStore, useUi } from '../../state/store';
import { ResultBars } from '../../ui/bits';
import { IconPlay } from '../../ui/icons';

const tallyOf = (m: Record<string, number>, uf?: string): Tally => {
  const t: Tally = {};
  for (const [k, v] of Object.entries(m)) {
    const [u, nr] = k.split('|');
    if (uf && u !== uf) continue;
    t[+nr] = (t[+nr] ?? 0) + v;
  }
  return t;
};

const fmtDay = (d: string) => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Retrospective({ election, game }: { election: Election; game: Game }) {
  const { openCampaign } = useUi();
  const sessions = useStore((s) => s.sessions);
  const c = game.campaign;
  const today = dayKey(Date.now());
  const { frames, estimated, estimatedUntil } = useMemo(() => buildFrames(c, sessions, today), [c, sessions, today]);
  const last = frames.length - 1;

  const [idx, setIdx] = useState(reduced() ? last : 0);
  const [playing, setPlaying] = useState(!reduced() && last > 0);
  const [speed, setSpeed] = useState(1);
  const [geo, setGeo] = useState<GeoFC | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 500, h: 500 });

  useEffect(() => { loadUfGeo().then(setGeo).catch(() => setGeo(null)); }, []);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!playing) return;
    if (idx >= last) { setPlaying(false); return; }
    const id = setTimeout(() => setIdx((i) => Math.min(last, i + 1)), 750 / speed);
    return () => clearTimeout(id);
  }, [playing, idx, last, speed]);

  const paths = useMemo(() => {
    if (!geo) return [];
    const pad = 12;
    const p = geoMercator().fitExtent([[pad, pad], [Math.max(size.w - pad, 40), Math.max(size.h - pad, 40)]], geo);
    const gp = geoPath(p);
    return geo.features.map((f) => ({ id: f.properties.id, d: gp(f) ?? '' }));
  }, [geo, size]);

  const order = election.rounds[c.round - 1].candidates;
  const offByUf = useMemo(() => Object.fromEntries(election.places.map((p) => [p.id, officialTally(election, c.round, p.id)])), [election, c.round]);
  const offNat = useMemo(() => officialTally(election, c.round), [election, c.round]);

  const at = (f: Frame, uf: string) => addTallies(addTallies(offByUf[uf], tallyOf(f.study, uf)), tallyOf(f.opp, uf));
  const f = frames[idx];
  const prev = frames[Math.max(0, idx - 1)];
  const flips = (fr: Frame) => election.places.filter((p) => p.kind === 'uf' && winnerOf(at(fr, p.id))?.nr !== winnerOf(offByUf[p.id])?.nr).length;

  const natStudy = tallyOf(f.study);
  const natOpp = tallyOf(f.opp);
  const natNow = addTallies(addTallies(offNat, natStudy), natOpp);
  const lead = winnerOf(natNow);
  const isEnd = idx === last;

  // relatório
  const mine = sessions.filter((s) => s.campaignId === c.id);
  const totalSec = mine.reduce((a, s) => a + s.seconds, 0);
  const bestDay = Math.max(0, ...frames.map((x) => x.minutes));
  const activeDays = frames.filter((x) => x.minutes > 0).length;
  const offWin = winnerOf(offNat);

  return (
    <motion.div className="retro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} role="dialog" aria-modal="true" aria-label="Retrospectiva da campanha">
      <header className="retro-head">
        <div>
          <span className="caps">Retrospectiva · {election.title} · {c.round}º turno</span>
          <h2>Dia {idx + 1} de {frames.length} <span className="muted">· {fmtDay(f.day)}</span></h2>
        </div>
        <button className="btn ghost small" onClick={() => openCampaign(null)}>Fechar</button>
      </header>

      <div className="retro-body">
        <div className="retro-map" ref={wrap}>
          <svg viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label="Mapa da campanha neste dia">
            {paths.map((p) => {
              const t = at(f, p.id);
              const w = winnerOf(t);
              const changed = idx > 0 && winnerOf(at(prev, p.id))?.nr !== w?.nr;
              return (
                <path key={`${p.id}-${changed ? idx : 'x'}`} d={p.d} className={`rt-uf${changed ? ' blink' : ''}`}
                  fill={w ? election.candidates[w.nr].color : 'var(--map-empty)'} fillOpacity={w ? 0.42 + Math.min(0.58, w.margin * 2.4) : 1} />
              );
            })}
          </svg>
        </div>

        <aside className="retro-side">
          {estimated && idx <= frames.findIndex((x) => x.day === estimatedUntil) && (
            <p className="small banner">Estes dias são uma estimativa a partir do seu ritmo de estudo: a campanha foi criada antes do registro diário. Do dia seguinte em diante o histórico é exato.</p>
          )}
          <ResultBars election={election} order={order} official={offNat} study={natStudy} opp={natOpp} mode="simulado" focusNr={c.focusNr} limit={c.round === 1 ? 4 : 2} />
          <div className="retro-day">
            <div className="caps">Neste dia</div>
            <p><b className="num">{fmtDuration(f.minutes * 60)}</b> de estudo{f.votes > 0 && <> · <b className="num study-text">+{fmtInt(f.votes)}</b> votos</>}</p>
            {f.feed.length > 0 && (
              <ul className="feed">
                {f.feed.map((x) => <li key={x.id} className={x.tone}><i className="mk" /><span><b>{x.title}</b><span className="small muted">{x.text}</span></span></li>)}
              </ul>
            )}
            <p className="small muted">{flips(f)} {flips(f) === 1 ? 'estado virado' : 'estados virados'} em relação ao resultado oficial.</p>
          </div>

          {isEnd && (
            <motion.div className="retro-report" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <div className="caps">Relatório</div>
              <ul className="report-list">
                <li><span>Estudo total</span><b className="num">{fmtDuration(totalSec)}</b></li>
                <li><span>Dias estudados</span><b className="num">{activeDays} de {frames.length}</b></li>
                <li><span>Melhor dia</span><b className="num">{fmtDuration(bestDay * 60)}</b></li>
                <li><span>Votos de estudo</span><b className="num study-text">{fmtCompact(sum(natStudy))}</b></li>
                <li><span>Estados virados</span><b className="num">{flips(f)}</b></li>
                <li><span>Oficial</span><b>{offWin ? election.candidates[offWin.nr].name : '—'}</b></li>
                <li><span>Com seus votos</span><b>{lead ? election.candidates[lead.nr].name : '—'}</b></li>
              </ul>
            </motion.div>
          )}
        </aside>
      </div>

      <footer className="retro-controls">
        <button className="btn" onClick={() => { if (isEnd) { setIdx(0); setPlaying(true); } else setPlaying(!playing); }} aria-label={playing ? 'Pausar' : 'Reproduzir'}>
          {playing ? 'Pausar' : isEnd ? 'Rever' : <><IconPlay /> Reproduzir</>}
        </button>
        <input type="range" min={0} max={last} value={idx} onChange={(e) => { setPlaying(false); setIdx(+e.target.value); }} aria-label="Dia da campanha" />
        <div className="seg" role="group" aria-label="Velocidade">
          {[1, 2, 4].map((s) => <button key={s} aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}
        </div>
      </footer>
    </motion.div>
  );
}
