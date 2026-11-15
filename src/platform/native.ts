import { Capacitor } from '@capacitor/core';
import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import type { ActiveSession } from '../core/types';
import { pomoView, phaseEndAt, type PomodoroConfig } from '../core/pomodoro';
import { isRunning } from '../core/timer';
import { addDays } from '../core/plan';
import { penaltyVotes } from '../core/penalty';
import type { RemindersConfig } from '../state/store';

/** true dentro do app Android (Capacitor); no navegador tudo isto vira no-op */
export const isNative = Capacitor.isNativePlatform();

const ln = () => import('@capacitor/local-notifications').then((m) => m.LocalNotifications);
const fg = () => import('@capawesome-team/capacitor-android-foreground-service');
const SMALL_ICON = 'ic_stat_icon';

const safe = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* recurso indisponível ou permissão negada */ } };

let channelsReady = false;
async function ensureChannels() {
  if (channelsReady) return;
  channelsReady = true;
  const L = await ln();
  await safe(() => L.createChannel({ id: 'lembretes', name: 'Lembretes de estudo', description: 'Lembretes diários e metas em risco', importance: 4 }));
  await safe(() => L.createChannel({ id: 'alertas', name: 'Trocas do Pomodoro', description: 'Avisos de fim de foco e de pausa', importance: 5, vibration: true }));
  const { ForegroundService, Importance } = await fg();
  await safe(() => ForegroundService.createNotificationChannel({ id: 'sessao', name: 'Sessão de estudo em andamento', description: 'Mantém o cronômetro ativo em segundo plano', importance: Importance.Low }));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const L = await ln();
    const cur = await L.checkPermissions();
    if (cur.display === 'granted') return true;
    return (await L.requestPermissions()).display === 'granted';
  } catch { return false; }
}

// ---------- sessão em andamento: notificação fixa (serviço em primeiro plano) ----------
const SERVICE_ID = 1;
let serviceOn = false;

export async function syncSessionService(a: ActiveSession | null, cfg: PomodoroConfig, ctx: { focusName: string; rate: number }, now = Date.now()) {
  if (!isNative) return;
  const { ForegroundService } = await fg();
  if (!a) {
    if (serviceOn) { serviceOn = false; await safe(() => ForegroundService.stopForegroundService()); }
    return;
  }
  await ensureChannels();
  const v = pomoView(a, cfg, now);
  const running = isRunning(a);
  const since = new Date(a.segments[0].start).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const title = v
    ? v.phase === 'foco' ? `Foco · bloco ${v.blockInCycle} de ${cfg.cycles}${running ? '' : ' (pausado)'}` : v.phase === 'pausa' ? 'Pausa curta' : 'Pausa longa'
    : running ? 'Estudando' : 'Sessão pausada';
  const body = `${a.label ? a.label + ' · ' : ''}desde ${since} · ${a.rate.toLocaleString('pt-BR')} votos/min para ${ctx.focusName}`;
  const buttons = v?.phase && v.phase !== 'foco'
    ? [{ id: 1, title: 'Pular pausa' }, { id: 2, title: 'Finalizar' }]
    : [{ id: 1, title: running ? 'Pausar' : 'Retomar' }, { id: 2, title: 'Finalizar' }];
  const opts = { id: SERVICE_ID, title, body, smallIcon: SMALL_ICON, buttons, silent: true, notificationChannelId: 'sessao' };
  if (!serviceOn) {
    serviceOn = true;
    await safe(() => ForegroundService.requestPermissions());
    await safe(() => ForegroundService.startForegroundService(opts));
  } else {
    await safe(() => ForegroundService.updateForegroundService(opts));
  }
}

/** botões da notificação fixa: 1 = pausar/retomar/pular, 2 = finalizar */
export async function onServiceButton(handler: (id: number) => void): Promise<() => void> {
  if (!isNative) return () => {};
  const { ForegroundService } = await fg();
  const h = await ForegroundService.addListener('buttonClicked', (e) => handler(e.buttonId));
  return () => { void h.remove(); };
}

// ---------- alarme do fim de fase (toca mesmo com o app fechado) ----------
const ALARM_ID = 2;
export async function syncPhaseAlarm(a: ActiveSession | null, cfg: PomodoroConfig, now = Date.now()) {
  if (!isNative) return;
  const L = await ln();
  await safe(() => L.cancel({ notifications: [{ id: ALARM_ID }] }));
  if (!a?.pomo) return;
  const at = phaseEndAt(a, cfg, now);
  if (!at || at <= now + 1000) return;
  await ensureChannels();
  const toBreak = a.pomo.phase === 'foco';
  await safe(() => L.schedule({
    notifications: [{
      id: ALARM_ID, channelId: 'alertas', smallIcon: SMALL_ICON,
      title: toBreak ? 'Hora da pausa' : 'Pausa terminou',
      body: toBreak ? 'Bloco de foco concluído. Respire um pouco.' : 'Hora de voltar ao foco.',
      schedule: { at: new Date(at), allowWhileIdle: true },
    }],
  }));
}

// ---------- lembretes diários e de meta em risco ----------
const DAYS = 14;
const DAILY_BASE = 100;
const RISK_BASE = 200;

export interface ReminderCtx {
  cfg: RemindersConfig;
  now: number;
  today: string;
  goalMin: number;
  studiedTodaySec: number;
  focusName: string;
  rivalName: string;
  penalty: boolean;
  rate: number;
}

const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m, 0, 0);
};

export async function syncReminders(c: ReminderCtx) {
  if (!isNative) return;
  const L = await ln();
  const ids = Array.from({ length: DAYS }, (_, i) => [{ id: DAILY_BASE + i }, { id: RISK_BASE + i }]).flat();
  await safe(() => L.cancel({ notifications: ids }));
  if (!c.cfg.daily && !c.cfg.risk) return;
  await ensureChannels();
  const metToday = c.studiedTodaySec >= c.goalMin * 60;
  const shortMin = Math.max(0, c.goalMin - c.studiedTodaySec / 60);
  const notifications: LocalNotificationSchema[] = [];
  for (let d = 0; d < DAYS; d++) {
    const day = addDays(c.today, d);
    if (d === 0 && metToday) continue;
    if (c.cfg.daily) {
      const when = at(day, c.cfg.time);
      if (when.getTime() > c.now + 60000) {
        notifications.push({
          id: DAILY_BASE + d, channelId: 'lembretes', smallIcon: SMALL_ICON, title: 'Hora de estudar',
          body: `Sua meta de hoje é de ${c.goalMin} min. ${c.focusName} conta com você.`, schedule: { at: when, allowWhileIdle: true },
        });
      }
    }
    if (c.cfg.risk) {
      const when = at(day, c.cfg.riskTime);
      if (when.getTime() > c.now + 60000) {
        const body = d === 0 && shortMin >= 1
          ? `Faltam ${Math.ceil(shortMin)} min hoje.${c.penalty ? ` Se parar agora, ${c.rivalName} ganha ${penaltyVotes(shortMin, c.rate).toLocaleString('pt-BR')} votos.` : ''}`
          : `Falta pouco para o dia acabar. Bata a meta de ${c.goalMin} min.`;
        notifications.push({ id: RISK_BASE + d, channelId: 'lembretes', smallIcon: SMALL_ICON, title: 'Meta em risco', body, schedule: { at: when, allowWhileIdle: true } });
      }
    }
  }
  if (notifications.length) await safe(() => L.schedule({ notifications }));
}

// ---------- tela ligada durante a sessão ----------
type WL = { release: () => Promise<void> };
let lock: WL | null = null;
export async function setKeepAwake(on: boolean) {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WL> } };
    if (on && !lock && nav.wakeLock) {
      lock = await nav.wakeLock.request('screen');
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch { lock = null; }
}
