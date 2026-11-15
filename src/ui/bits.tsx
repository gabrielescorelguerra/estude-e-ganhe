import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { CandidateMeta, Election, Tally } from '../core/types';
import { fmtInt, fmtPct } from '../core/format';
import { rank } from '../core';
import type { MapMode } from '../state/store';
import { Count } from './motion';

export function initials(name: string) {
  const w = name.replace(/['’]/g, ' ').split(' ').filter((x) => x.length > 1 || /[A-Z]/.test(x));
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

/** Sem fotos oficiais disponíveis: avatar tipográfico na cor do candidato. */
// Foto oficial do TSE (DivulgaCandContas), carregada pelo próprio aparelho do usuário.
const TSE_PHOTO = (sq: string) => `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/${sq}/BR`;

/** Ordem: foto empacotada em photos/ (tools/photos.mjs) → foto oficial do TSE → iniciais. */
export function Avatar({ c, lg }: { c: CandidateMeta; lg?: boolean }) {
  const sources = c.sq ? [`${import.meta.env.BASE_URL}photos/${c.nr}.jpg`, TSE_PHOTO(c.sq)] : []; // fotos só para 2022
  const [i, setI] = useState(0);
  return (
    <span className={`avatar${lg ? ' lg' : ''}`} style={{ background: c.color }} aria-hidden>
      {i < sources.length ? (
        <img src={sources[i]} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setI(i + 1)} />
      ) : initials(c.name)}
    </span>
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <motion.div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
      <motion.div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={wide ? { width: 'min(760px,100%)' } : undefined}
        initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 32 }}>
        <h2>{title}</h2>
        {children}
      </motion.div>
    </motion.div>
  );
}

/**
 * Barras de resultado, conforme o que o jogador escolheu ver:
 *  - simulado: total (oficial + seus votos + oposição), com o acréscimo em listras na cor do candidato;
 *  - oficial: só a apuração do TSE;
 *  - estudo: só o que foi acrescentado.
 */
export function ResultBars({
  election, order, official, study, opp = {}, focusNr, limit = 6, mode = 'simulado',
}: {
  election: Election; order: number[]; official: Tally; study: Tally; opp?: Tally; focusNr?: number; limit?: number; mode?: MapMode;
}) {
  const part = (nr: number) => ({
    o: mode === 'estudo' ? 0 : official[nr] ?? 0,
    s: mode === 'oficial' ? 0 : study[nr] ?? 0,
    q: mode === 'oficial' ? 0 : opp[nr] ?? 0,
  });
  const val = (nr: number) => { const x = part(nr); return x.o + x.s + x.q; };
  const total = order.reduce((a, nr) => a + val(nr), 0);
  const ranked = rank(Object.fromEntries(order.map((nr) => [nr, val(nr)])));
  const rows = ranked.slice(0, limit);
  if (focusNr !== undefined && !rows.some(([nr]) => nr === focusNr)) {
    const f = ranked.find(([nr]) => nr === focusNr);
    if (f) rows.push(f);
  }
  const hidden = ranked.length - rows.length;
  return (
    <div className="res">
      {rows.map(([nr, v]) => {
        const c = election.candidates[nr];
        const { o, s, q } = part(nr);
        const added = s + q;
        return (
          <div className="res-row" key={nr} style={{ ['--c' as string]: c.color }}>
            <div className="res-top">
              <span className="res-name">
                <span className="dot" style={{ background: c.color }} />
                <span className="t">{c.name}</span>
                <span className="party">{c.party}</span>
              </span>
              <span className="res-num"><b>{total ? fmtPct(v / total) : '—'}</b></span>
            </div>
            <div className="res-bar" role="img" aria-label={`${c.name}: ${fmtInt(v)} votos`}>
              {o > 0 && <i style={{ width: `${total ? (o / total) * 100 : 0}%`, background: c.color }} />}
              {s > 0 && <i className="added" style={{ width: `${(s / total) * 100}%` }} />}
              {q > 0 && <i className="opp" style={{ width: `${(q / total) * 100}%` }} />}
            </div>
            <div className="res-num">
              {mode === 'oficial' && <><b><Count value={o} /></b> votos oficiais</>}
              {mode === 'simulado' && (
                <>
                  <b><Count value={v} /></b> votos
                  {s > 0 && <> · <span className="added-text"><b>+<Count value={s} /></b> seus</span></>}
                  {q > 0 && <> · <span className="opp-text">+<Count value={q} /> oposição</span></>}
                </>
              )}
              {mode === 'estudo' && (added > 0
                ? <><b className="added-text">+<Count value={s} /></b> de estudo{q > 0 && <> · <span className="opp-text">+<Count value={q} /> oposição</span></>}</>
                : <span className="faint">nenhum voto adicionado</span>)}
            </div>
          </div>
        );
      })}
      {hidden > 0 && <p className="small faint">+ {hidden} candidatos com menos votos</p>}
    </div>
  );
}

export const Tag = ({ kind }: { kind: 'official' | 'study' | 'opp' }) => (
  <span className={`tag ${kind}`}>{kind === 'official' ? 'Oficial · TSE' : kind === 'study' ? 'Seus votos · fictício' : 'Oposição · fictício'}</span>
);
