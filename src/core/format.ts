const nf = new Intl.NumberFormat('pt-BR');
export const fmtInt = (n: number) => nf.format(Math.round(n));

/** 1,2 mi · 340 mil · 950 */
export function fmtCompact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e7 ? 1 : 2 })} mi`;
  if (a >= 1e4) return `${(n / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  return fmtInt(n);
}

export const fmtPct = (x: number, digits = 1) =>
  `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/** 1 h 05 min · 42 min · 0 min */
export function fmtDuration(totalSeconds: number): string {
  if (totalSeconds > 0 && totalSeconds < 60) return `${Math.floor(totalSeconds)} s`;
  const mins = Math.round(totalSeconds / 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

export function fmtHours(totalSeconds: number): string {
  return `${(totalSeconds / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
export const fmtTime = (ts: number) =>
  new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
