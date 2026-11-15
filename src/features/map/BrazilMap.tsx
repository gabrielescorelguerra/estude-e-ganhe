import { useEffect, useMemo, useRef, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import type { Election, Tally } from '../../core/types';
import { addTallies, fmtPct, officialTally, oppTally, studyTally, winnerOf, sum } from '../../core';
import { loadMunGeo, loadMunVotes, loadUfGeo, type GeoFC, type MunRow } from '../../data/loader';
import type { Game } from '../../state/useGame';
import { useUi, type MapMode } from '../../state/store';

interface Props { election: Election; game: Game }

/** cor + opacidade de um lugar conforme o modo (oficial / simulado / só estudo) */
function paint(t: Tally, mode: MapMode, election: Election, maxStudy: number) {
  const w = winnerOf(t);
  if (!w) return { fill: 'var(--map-empty)', opacity: 1 };
  if (mode === 'estudo') {
    return { fill: election.candidates[w.nr].color, opacity: 0.25 + 0.75 * Math.min(1, maxStudy ? sum(t) / maxStudy : 0) };
  }
  return { fill: election.candidates[w.nr].color, opacity: 0.42 + Math.min(0.58, w.margin * 2.4) };
}

export function BrazilMap({ election, game }: Props) {
  const { uf, mun, select, mode } = useUi();
  const { campaign } = game;
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 600 });
  const [ufGeo, setUfGeo] = useState<GeoFC | null>(null);
  const [munGeo, setMunGeo] = useState<GeoFC | null>(null);
  const [munRows, setMunRows] = useState<MunRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: [string, string] } | null>(null);

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => { loadUfGeo().then(setUfGeo).catch((e) => setErr(String(e))); }, []);

  const selUf = uf && uf !== 'ZZ' ? uf : null;
  useEffect(() => {
    setMunGeo(null); setMunRows(null);
    if (!selUf) return;
    let alive = true;
    Promise.all([loadMunGeo(selUf), loadMunVotes('2022/presidente', selUf)])
      .then(([g, r]) => { if (alive) { setMunGeo(g); setMunRows(r); } })
      .catch((e) => alive && setErr(String(e)));
    return () => { alive = false; };
  }, [selUf]);

  const proj = useMemo(() => {
    if (!ufGeo) return null;
    const pad = size.w < 520 ? 8 : 28;
    const p = geoMercator().fitExtent([[pad, pad + 44], [Math.max(size.w - pad, pad + 10), Math.max(size.h - pad - 24, pad + 40)]], ufGeo);
    return { p, path: geoPath(p) };
  }, [ufGeo, size]);

  const ufPaths = useMemo(() => proj && ufGeo ? ufGeo.features.map((f) => ({ id: f.properties.id, name: f.properties.name ?? f.properties.id, d: proj.path(f) ?? '' })) : [], [proj, ufGeo]);
  const munPaths = useMemo(() => proj && munGeo ? munGeo.features.map((f) => ({ id: f.properties.id, d: proj.path(f) ?? '' })) : [], [proj, munGeo]);

  // tallies por UF
  const ufTally = useMemo(() => {
    const out: Record<string, { off: Tally; study: Tally; opp: Tally; sim: Tally }> = {};
    for (const p of election.places) {
      const off = officialTally(election, campaign.round, p.id);
      const study = studyTally(campaign, p.id);
      const opp = oppTally(campaign, p.id);
      out[p.id] = { off, study, opp, sim: addTallies(addTallies(off, study), opp) };
    }
    return out;
  }, [election, campaign]);
  const maxStudy = useMemo(() => Math.max(1, ...Object.values(ufTally).map((x) => sum(x.study))), [ufTally]);

  const munTally = useMemo(() => {
    const out: Record<string, { name: string; off: Tally; study: Tally; sim: Tally }> = {};
    if (!munRows) return out;
    const cands = election.rounds[campaign.round - 1].candidates;
    for (const r of munRows) {
      const arr = r[campaign.round + 1] as number[];
      const off: Tally = {};
      cands.forEach((nr, i) => (off[nr] = arr[i]));
      const study = studyTally(campaign, r[0]);
      out[r[0]] = { name: r[1], off, study, sim: addTallies(off, study) };
    }
    return out;
  }, [munRows, election, campaign]);
  const maxMunStudy = useMemo(() => Math.max(1, ...Object.values(munTally).map((x) => sum(x.study))), [munTally]);

  // câmera: enquadra o estado selecionado
  const cam = useMemo(() => {
    if (!proj || !selUf || !ufGeo) return { k: 1, x: 0, y: 0 };
    const f = ufGeo.features.find((g) => g.properties.id === selUf);
    if (!f) return { k: 1, x: 0, y: 0 };
    const [[x0, y0], [x1, y1]] = proj.path.bounds(f);
    const pad = 44;
    const k = Math.min((size.w - pad * 2) / (x1 - x0), (size.h - pad * 2 - 40) / (y1 - y0), 60);
    return { k, x: size.w / 2 - (k * (x0 + x1)) / 2, y: size.h / 2 + 14 - (k * (y0 + y1)) / 2 };
  }, [proj, selUf, ufGeo, size]);

  const move = (e: React.MouseEvent, text: [string, string]) => {
    const r = wrap.current!.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text });
  };
  const describe = (t: Tally | undefined): string => {
    const w = t && winnerOf(t);
    return w ? `${election.candidates[w.nr].name} · ${fmtPct(w.share)}` : 'sem votos';
  };

  const flipped = (id: string) => {
    const t = ufTally[id];
    return !!t && sum(t.study) + sum(t.opp) > 0 && winnerOf(t.sim)?.nr !== winnerOf(t.off)?.nr;
  };

  return (
    <div className="map-area" ref={wrap} onMouseLeave={() => setTip(null)}>
      {err && <div className="error">Não foi possível carregar o mapa. <button className="btn ghost small" onClick={() => location.reload()}>Tentar de novo</button></div>}
      {!ufGeo && !err && <div className="loading">Carregando mapa…</div>}
      {proj && (
        <svg className="map-svg" viewBox={`0 0 ${size.w} ${size.h}`} role="img" aria-label="Mapa do Brasil por estado"
          onClick={(e) => e.target === e.currentTarget && select(null)}>
          <g style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})`, transformOrigin: '0 0', transition: 'transform 0.55s cubic-bezier(.3,.7,.2,1)' }}>
            {ufPaths.map((u, i) => {
              const t = ufTally[u.id];
              const pa = paint(mode === 'oficial' ? t.off : mode === 'estudo' ? t.study : t.sim, mode, election, maxStudy);
              const isSel = selUf === u.id;
              const hide = isSel && munPaths.length > 0;
              return (
                <path key={u.id} d={u.d} fill={pa.fill} fillOpacity={hide ? 0 : pa.opacity}
                  style={{ animationDelay: `${i * 14}ms` }} className={`uf reveal${isSel ? ' sel' : ''}${selUf && !isSel ? ' dim' : ''}${mode === 'simulado' && flipped(u.id) ? ' flipped' : ''}`}
                  onClick={() => select(isSel ? null : u.id)}
                  onMouseMove={(e) => move(e, [u.name, describe(mode === 'oficial' ? t.off : mode === 'estudo' ? t.study : t.sim)])}
                  onMouseLeave={() => setTip(null)} />
              );
            })}
            {munPaths.map((m, i) => {
              const t = munTally[m.id];
              if (!t) return <path key={m.id} d={m.d} fill="var(--map-empty)" className="mun" />;
              const pa = paint(mode === 'oficial' ? t.off : mode === 'estudo' ? t.study : t.sim, mode, election, maxMunStudy);
              return (
                <path key={m.id} d={m.d} fill={pa.fill} fillOpacity={pa.opacity}
                  style={{ animationDelay: `${Math.min(i, 120) * 4}ms` }} className={`mun reveal${mun === m.id ? ' sel' : ''}`}
                  onClick={() => select(selUf, mun === m.id ? null : m.id)}
                  onMouseMove={(e) => move(e, [t.name, describe(mode === 'oficial' ? t.off : mode === 'estudo' ? t.study : t.sim)])}
                  onMouseLeave={() => setTip(null)} />
              );
            })}
          </g>
        </svg>
      )}

      <MapToolbar />
      <Legend election={election} game={game} />
      {election.places.some((p) => p.id === 'ZZ') && (
        <button className="chip exterior" aria-pressed={uf === 'ZZ'} onClick={() => select(uf === 'ZZ' ? null : 'ZZ')}
          style={uf === 'ZZ' ? { borderColor: 'var(--ink)', background: 'var(--ink)', color: 'var(--paper)' } : undefined}>
          Voto no exterior
        </button>
      )}
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          <b>{tip.text[0]}</b><br />{tip.text[1]}
        </div>
      )}
    </div>
  );
}

function MapToolbar() {
  const { mode, setMode, uf, mun, select } = useUi();
  const modes: [MapMode, string][] = [['simulado', 'Com seus votos'], ['oficial', 'Oficial'], ['estudo', 'Só estudo']];
  return (
    <div className="map-toolbar">
      <div className="seg" role="group" aria-label="O que o mapa mostra">
        {modes.map(([m, l]) => <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>{l}</button>)}
      </div>
      {uf && uf !== 'ZZ' && (
        <button className="chip" onClick={() => select(null)} style={{ background: 'var(--paper)' }}>← Brasil{mun ? '' : ''}</button>
      )}
    </div>
  );
}

function Legend({ election, game }: Props) {
  const { mode } = useUi();
  const nrs = election.rounds[game.campaign.round - 1].candidates.slice(0, game.campaign.round === 1 ? 4 : 2);
  return (
    <div className="map-legend">
      {mode === 'estudo' ? (
        <div className="legend-row"><span>Cor = candidato que mais recebeu seus votos · intensidade = quantidade</span></div>
      ) : (
        <>
          <div className="legend-row">
            {nrs.map((nr) => (
              <span key={nr}><i className="dot" style={{ background: election.candidates[nr].color }} />{election.candidates[nr].name}</span>
            ))}
          </div>
          <div className="legend-row"><span>Cor = vencedor · intensidade = margem</span>
            {mode === 'simulado' && <span><i style={{ width: 14, height: 10, border: '2px solid var(--study-fill)', borderRadius: 2, display: 'inline-block' }} />resultado virado por você</span>}</div>
        </>
      )}
    </div>
  );
}

