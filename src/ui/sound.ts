let ctx: AudioContext | null = null;

/** chame num gesto do usuário (clicar em Iniciar) para o navegador liberar o som depois */
export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    void ctx.resume();
  } catch { /* sem som */ }
}

/** dois toques curtos: subindo = hora de focar, descendo = hora de descansar */
export function chime(kind: 'foco' | 'pausa') {
  try {
    if (!ctx) return;
    const notes = kind === 'foco' ? [660, 880] : [880, 587];
    notes.forEach((f, i) => {
      const o = ctx!.createOscillator();
      const g = ctx!.createGain();
      const t = ctx!.currentTime + i * 0.18;
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(ctx!.destination);
      o.start(t);
      o.stop(t + 0.32);
    });
  } catch { /* sem som */ }
}
