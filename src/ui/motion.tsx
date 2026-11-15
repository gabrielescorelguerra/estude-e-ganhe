import { useEffect, useRef } from 'react';
import { animate } from 'motion/react';
import { fmtInt } from '../core/format';

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** número que "corre" até o novo valor */
export function Count({ value, fmt = fmtInt, className }: { value: number; fmt?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const el = ref.current;
    const from = prev.current;
    prev.current = value;
    if (!el) return;
    if (from === value || reduced()) { el.textContent = fmt(value); return; }
    const c = animate(from, value, { duration: 0.75, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { el.textContent = fmt(v); } });
    return () => c.stop();
  }, [value, fmt]);
  return <span ref={ref} className={className}>{fmt(value)}</span>;
}

const PRESSABLE = '.btn,.seg button,.choice button,.cands button,.cand-pick button,.amt button,.tabbar button,.nav button,.chip,.label-chips button';

/** ondulação no ponto do toque + vibração curta no celular */
export function installTouchFeedback() {
  document.addEventListener('pointerdown', (e) => {
    const t = (e.target as Element | null)?.closest?.(PRESSABLE) as HTMLElement | null;
    if (!t || (t as HTMLButtonElement).disabled) return;
    if (e.pointerType === 'touch') navigator.vibrate?.(8);
    if (reduced()) return;
    const r = t.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    t.appendChild(s);
    s.addEventListener('animationend', () => s.remove(), { once: true });
  }, { passive: true });
}

export async function celebrate() {
  if (reduced()) return;
  const confetti = (await import('canvas-confetti')).default;
  const colors = ['#f0b52e', '#17171a', '#b8323a', '#24508f'];
  confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 }, colors, scalar: 0.9 });
  setTimeout(() => confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.7 }, colors }), 180);
  setTimeout(() => confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.7 }, colors }), 180);
}
