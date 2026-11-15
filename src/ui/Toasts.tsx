import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useUi, type Toast } from '../state/store';

function Item({ t }: { t: Toast }) {
  const dismiss = useUi((s) => s.dismissToast);
  useEffect(() => {
    const id = setTimeout(() => dismiss(t.id), 6000);
    return () => clearTimeout(id);
  }, [t.id, dismiss]);
  return (
    <motion.button layout className={`toast ${t.tone}`} onClick={() => dismiss(t.id)}
      initial={{ opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}>
      <span className="toast-mark" aria-hidden />
      <span className="toast-body"><b>{t.title}</b><span>{t.text}</span></span>
    </motion.button>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence initial={false}>{toasts.map((t) => <Item key={t.id} t={t} />)}</AnimatePresence>
    </div>
  );
}
