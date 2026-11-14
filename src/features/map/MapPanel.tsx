import { useEffect, useMemo, useState } from 'react';
import type { Election, Tally } from '../../core/types';
import {
  addTallies, allocKey, fmtCompact, fmtDuration, fmtInt, fmtPct, officialTally, parseAllocKey, studyTally, sum, winnerOf,
} from '../../core';
import { loadMunVotes, type MunRow } from '../../data/loader';
import type { Game } from '../../state/useGame';
import { useStore, useUi } from '../../state/store';
import { Avatar, ResultBars, Tag } from '../../ui/bits';

const flipGap = (sim: Tally, focus: number) => {
  const mine = sim[focus] ?? 0;
  const other = Math.max(0, ...Object.entries(sim).filter(([nr]) => Number(nr) !== focus).map(([, v]) => v));
  return Math.max(0, other - mine + 1);
};

export function MapPanel({ election, game }: { election: Election; game: Game }) {
  const { uf, mun } = useUi();
  if (!uf) return <Country election={election} game={game} />;
  return <Place key={`${uf}-${mun}`} election={election} game={game} uf={uf} mun={mun} />;
}

function Country({ election, game }: { election: Election; game: Game }) {
  const { select } = useUi();
  const c = game.campaign;
  const order = election.rounds[c.round - 1].candidates;
  const focus = election.candidates[c.focusNr];
  const rows = useMemo(() => election.places.map((p) => {
    const off = officialTally(election, c.round, p.id);
    const study = studyTally(c, p.id);
    const sim = addTallies(off, study);
    return { p, off, study, sim, w: winnerOf(sim), flipped: sum(study) > 0 && winnerOf(sim)?.nr !== winnerOf(off)?.nr };
  }), [election, c]);

  return (
    <aside className="panel">
      <div className="panel-head">
        <span className="caps">{election.title} · {c.round}º turno</span>
        <h2>Brasil</h2>
      </div>
      <section className="sect">
        <div className="sect-title"><span className="caps">Resultado nacional</span><span style={{ display: 'flex', gap: 6 }}><Tag kind="official" /><Tag kind="study" /></span></div>
        <ResultBars election={election} order={order} official={game.official} study={game.study} focusNr={c.focusNr} limit={c.round === 1 ? 5 : 2} />
        <p className="small muted">
          Sólido: apuração oficial do TSE. Hachurado: votos fictícios do seu estudo.
          {game.goal.reached
            ? <> <b>{focus.name} superou {election.candidates[game.goal.rivalNr].name}.</b></>
            : <> Faltam <b className="num">{fmtCompact(game.goal.needed)}</b> votos para superar {election.candidates[game.goal.rivalNr].name}.</>}
        </p>
      </section>
      <section className="sect">
        <div className="sect-title"><span className="caps">Estados</span><span className="small faint">clique para detalhar</span></div>
        <table className="uf-table">
          <thead><tr><th>UF</th><th>Líder</th><th className="r">Margem</th><th className="r">Estudo</th></tr></thead>
          <tbody>
            {rows.map(({ p, w, study, flipped }) => (
              <tr key={p.id} onClick={() => select(p.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select(p.id)}>
                <td><b>{p.id === 'ZZ' ? 'EXT' : p.id}</b></td>
                <td><span className="res-name"><span className="dot" style={{ background: w ? election.candidates[w.nr].color : 'var(--rule)' }} />
                  <span className="t">{w ? election.candidates[w.nr].name : '—'}</span>{flipped && <span className="study-text" title="Virado pelos seus votos">●</span>}</span></td>
                <td className="r">{w ? fmtPct(w.margin) : '—'}</td>
                <td className="r study-text">{sum(study) ? fmtCompact(sum(study)) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </aside>
  );
}

function Place({ election, game, uf, mun }: { election: Election; game: Game; uf: string; mun: string | null }) {
  const { select } = useUi();
  const c = game.campaign;
  const ri = c.round - 1;
  const order = election.rounds[ri].candidates;
  const place = election.places.find((p) => p.id === uf)!;
  const [rows, setRows] = useState<MunRow[] | null>(null);
  useEffect(() => {
    setRows(null);
    if (uf !== 'ZZ') loadMunVotes('2022/presidente', uf).then(setRows).catch(() => setRows([]));
  }, [uf]);

  const row = mun && rows ? rows.find((r) => r[0] === mun) : null;
  const placeId = mun ?? uf;
  const off: Tally = useMemo(() => {
    if (row) { const t: Tally = {}; order.forEach((nr, i) => (t[nr] = (row[ri + 2] as number[])[i])); return t; }
    return officialTally(election, c.round, uf);
  }, [row, election, c.round, uf, order, ri]);
  const study = useMemo(() => studyTally(c, placeId), [c, placeId]);
  const sim = addTallies(off, study);
  const gap = flipGap(sim, c.focusNr);
  const w = winnerOf(sim);
  const title = row ? row[1] : place.name;
  const mine = (sim[c.focusNr] ?? 0);

  const topMuns = useMemo(() => {
    if (!rows) return [];
    return rows.map((r) => {
      const t: Tally = {}; order.forEach((nr, i) => (t[nr] = (r[ri + 2] as number[])[i]));
      const s = studyTally(c, r[0]);
      return { id: r[0], name: r[1], total: sum(t), w: winnerOf(addTallies(t, s)), study: sum(s) };
    }).sort((a, b) => b.total - a.total).slice(0, 12);
  }, [rows, c, order, ri]);

  return (
    <aside className="panel">
      <div className="panel-head">
        <div className="crumb small muted">
          <button className="link" onClick={() => select(null)}>Brasil</button>
          {mun && <>› <button className="link" onClick={() => select(uf)}>{place.name}</button></>}
        </div>
        <h2>{title}</h2>
        <span className="small muted">
          {w ? <>{election.candidates[w.nr].name} lidera com {fmtPct(w.share)}</> : 'Sem votos'}
          {mun && !row && ' · carregando…'}
        </span>
      </div>

      <section className="sect">
        <div className="sect-title"><span className="caps">Resultado</span><span style={{ display: 'flex', gap: 6 }}><Tag kind="official" /><Tag kind="study" /></span></div>
        <ResultBars election={election} order={order} official={off} study={study} focusNr={c.focusNr} limit={c.round === 1 ? 5 : 2} />
        <p className="small faint">{fmtInt(sum(off))} votos oficiais{sum(study) > 0 && <> + <span className="study-text">{fmtInt(sum(study))} de estudo</span></>}</p>
      </section>

      <section className="sect">
        <div className="sect-title"><span className="caps">Sua campanha aqui</span></div>
        {gap > 0 ? (
          <p className="small">
            Virar {mun ? 'este município' : 'este estado'} para <b>{election.candidates[c.focusNr].name}</b> custa{' '}
            <b className="num">{fmtInt(gap)}</b> votos, ou ≈ {fmtDuration((gap / c.rate) * 60)} de estudo.
          </p>
        ) : mine > 0 ? (
          <p className="small"><b>{election.candidates[c.focusNr].name}</b> lidera aqui.</p>
        ) : null}
        <AllocBox election={election} game={game} placeId={placeId} gap={gap} />
      </section>

      {uf !== 'ZZ' && !mun && (
        <section className="sect">
          <div className="sect-title"><span className="caps">Maiores municípios</span><span className="small faint">clique para detalhar</span></div>
          {!rows ? <p className="small faint">Carregando municípios…</p> : (
            <table className="uf-table">
              <tbody>
                {topMuns.map((m) => (
                  <tr key={m.id} onClick={() => select(uf, m.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && select(uf, m.id)}>
                    <td><span className="res-name"><span className="dot" style={{ background: m.w ? election.candidates[m.w.nr].color : 'var(--rule)' }} /><span className="t">{m.name}</span></span></td>
                    <td className="r small muted">{fmtCompact(m.total)}</td>
                    <td className="r study-text">{m.study ? `+${fmtCompact(m.study)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </aside>
  );
}

function AllocBox({ election, game, placeId, gap }: { election: Election; game: Game; placeId: string; gap: number }) {
  const c = game.campaign;
  const place = useStore((s) => s.place);
  const unplace = useStore((s) => s.unplace);
  const cands = useMemo(() => {
    const base = election.rounds[c.round - 1].candidates.slice(0, c.round === 1 ? 6 : 2);
    return base.includes(c.focusNr) ? base : [...base, c.focusNr];
  }, [election, c]);
  const [nr, setNr] = useState(c.focusNr);
  const [txt, setTxt] = useState('');
  const wallet = Math.max(0, game.wallet);
  const amount = Math.min(wallet, Math.max(0, Math.round(Number(txt.replace(/\./g, '').replace(',', '.')) || 0)));
  const mineHere = Object.entries(c.allocations)
    .map(([k, v]) => ({ k, v, ...parseAllocKey(k) }))
    .filter((a) => a.place === placeId);

  const go = (v: number) => {
    if (v <= 0) return;
    place(c.id, [{ place: placeId, nr, votes: Math.min(v, wallet) }]);
    setTxt('');
  };

  return (
    <div className="alloc">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span className="lbl">Saldo disponível</span>
        <b className="num study-text serif" style={{ fontSize: 20 }}>{fmtInt(wallet)}</b>
      </div>
      {wallet <= 0 ? (
        <p className="small muted">Estude para ganhar votos. Cada minuto vale {fmtInt(c.rate)} votos.</p>
      ) : (
        <>
          <div className="cand-pick" role="group" aria-label="Candidato">
            {cands.map((n) => (
              <button key={n} aria-pressed={nr === n} onClick={() => setNr(n)}>
                <Avatar c={election.candidates[n]} />{election.candidates[n].name}
              </button>
            ))}
          </div>
          <div className="amt">
            {[0.25, 0.5, 1].map((f) => (
              <button key={f} onClick={() => go(Math.round(wallet * f))}>{f === 1 ? 'Tudo' : `${f * 100}%`}</button>
            ))}
            {gap > 0 && nr === c.focusNr && <button onClick={() => go(gap)} title="Votos necessários para virar">Virar ({fmtCompact(gap)})</button>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="in" inputMode="numeric" placeholder="Outra quantidade" value={txt} onChange={(e) => setTxt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && go(amount)} aria-label="Quantidade de votos" />
            <button className="btn study" disabled={amount <= 0} onClick={() => go(amount)}>Alocar</button>
          </div>
        </>
      )}
      {mineHere.length > 0 && (
        <div className="alloc-list">
          <span className="lbl">Já alocado aqui</span>
          {mineHere.map((a) => (
            <div key={a.k}>
              <span><span className="dot" style={{ background: election.candidates[a.nr].color, display: 'inline-block', marginRight: 6 }} />
                {election.candidates[a.nr].name} · <b className="num">{fmtInt(a.v)}</b></span>
              <button className="link small" onClick={() => unplace(c.id, allocKey(placeId, a.nr))}>devolver ao saldo</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
