import { useEffect, useState } from 'react';

/** relógio de tela: reatribui a cada 250 ms apenas enquanto `on` */
export function useNow(on: boolean, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), ms);
    const vis = () => setNow(Date.now());
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', vis); };
  }, [on, ms]);
  return now;
}
