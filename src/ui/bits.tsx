import { useEffect, useRef, type ReactNode } from 'react';
import type { CandidateMeta, Election, Tally } from '../core/types';
import { fmtInt, fmtPct } from '../core/format';
import { rank, sum } from '../core';

export function initials(name: string) {
  const w = name.replace(/['’]/g, ' ').split(' ').filter((x) => x.length > 1 || /[A-Z]/.test(x));
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : name.slice(0, 2)).toUpperCase();
}

/** Sem fotos oficiais disponíveis: avatar tipográfico na cor do candidato. */
export function Avatar({ c, lg }: { c: CandidateMeta; lg?: boolean }) {
  return (
    <span className={`avatar${lg ? ' lg' : ''}`} style={{ background: c.color }} aria-hidden>
      {initials(c.name)}
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
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} style={wide ? { width: 'min(760px,100%)' } : undefined}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/**
 * Barras de resultado. O trecho sólido é OFICIAL (TSE); o trecho hachurado é ESTUDO (fictício).
 * A largura é a participação sobre o total simulado do lugar.
 */
export function ResultBars({
  election, order, official, study, opp = {}, focusNr, limit = 6,
}: {
  election: Election; order: number[]; official: Tally; study: Tally; opp?: Tally; focusNr?: number; limit?: number;
}) {
  const total = sum(official) + sum(study) + sum(opp);
  const ranked = rank(Object.fromEntries(order.map((nr) => [nr, (official[nr] ?? 0) + (study[nr] ?? 0) + (opp[nr] ?? 0)])));
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
        const o = official[nr] ?? 0, s = study[nr] ?? 0, q = opp[nr] ?? 0;
        return (
          <div className="res-row" key={nr}>
            <div className="res-top">
              <span className="res-name">
                <span className="dot" style={{ background: c.color }} />
                <span className="t">{c.name}</span>
                <span className="party">{c.party}</span>
              </span>
              <span className="res-num"><b>{total ? fmtPct(v / total) : '—'}</b></span>
            </div>
            <div className="res-bar" role="img" aria-label={`${c.name}: ${fmtInt(o)} votos oficiais, ${fmtInt(s)} de estudo`}>
              <i style={{ width: `${total ? (o / total) * 100 : 0}%`, background: c.color }} />
              {s > 0 && <i className="study" style={{ width: `${(s / total) * 100}%` }} />}
              {q > 0 && <i className="opp" style={{ width: `${(q / total) * 100}%` }} />}
            </div>
            <div className="res-num">
              {fmtInt(o)} oficiais{s > 0 && <> · <span className="study-text">+{fmtInt(s)} estudo</span></>}{q > 0 && <> · <span className="opp-text">+{fmtInt(q)} oposição</span></>}
            </div>
          </div>
        );
      })}
      {hidden > 0 && <p className="small faint">+ {hidden} candidatos com menos votos</p>}
    </div>
  );
}

export const Tag = ({ kind }: { kind: 'official' | 'study' | 'opp' }) => (
  <span className={`tag ${kind}`}>{kind === 'official' ? 'Oficial · TSE' : kind === 'study' ? 'Estudo · fictício' : 'Oposição · fictício'}</span>
);
