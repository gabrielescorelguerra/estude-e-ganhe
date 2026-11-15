import { useRef, useState } from 'react';
import type { Election } from '../../core/types';
import { STRATEGY_INFO, fmtDuration, fmtInt } from '../../core';
import { useStore, useUi, type Theme } from '../../state/store';
import { isNative, requestNotificationPermission } from '../../platform/native';
import { selectCampaign } from '../../state/store';

const THEMES: [Theme, string][] = [['auto', 'Automático'], ['claro', 'Claro'], ['escuro', 'Escuro']];

export function SettingsPage({ election }: { election: Election }) {
  const st = useStore();
  const { dailyGoalMin, setDailyGoal, theme, setTheme, patchCampaign, importAll, resetAll, pomodoro, setPomodoro, reminders, setReminders, prefs, setPrefs } = st;
  const c = selectCampaign(st);
  const { openCampaign } = useUi();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const src = election.source;

  const exportJson = () => {
    const data = { app: 'estude-e-ganhe', version: 1, exportedAt: new Date().toISOString(), sessions: st.sessions, campaigns: st.campaigns, activeCampaignId: st.activeCampaignId, dailyGoalMin: st.dailyGoalMin, labels: st.labels };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `estude-e-ganhe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    setMsg('Backup gerado. Se o download não iniciar neste aparelho, tente pelo navegador.');
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    const ok = importAll(await f.text());
    setMsg(ok ? 'Backup restaurado.' : 'Arquivo inválido: use um backup gerado por este app.');
    if (file.current) file.current.value = '';
  };

  return (
    <div className="page settings">
      <header className="home-head"><span className="caps">Preferências</span><h1>Ajustes</h1></header>

      <section className="card setting-group">
        <h3>Aparência</h3>
        <div className="row">
          <div><b>Tema</b><span className="small muted">Automático segue o seu aparelho.</span></div>
          <div className="seg" role="group" aria-label="Tema">
            {THEMES.map(([t, l]) => <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{l}</button>)}
          </div>
        </div>
      </section>

      <section className="card setting-group">
        <h3>Estudo</h3>
        <div className="row col">
          <div className="row-top"><div><b>Meta diária</b><span className="small muted">Base da sequência de dias e das campanhas novas.</span></div><b className="num">{fmtDuration(dailyGoalMin * 60)}</b></div>
          <input type="range" min={15} max={360} step={5} value={dailyGoalMin} onChange={(e) => setDailyGoal(+e.target.value)} aria-label="Meta diária em minutos" />
        </div>
      </section>

      <section className="card setting-group">
        <h3>Pomodoro</h3>
        <div className="row">
          <div><b>Usar Pomodoro nas sessões</b><span className="small muted">Alterna blocos de foco e pausas. O tempo de pausa não vira votos.</span></div>
          <label className="switch"><input type="checkbox" checked={pomodoro.on} onChange={(e) => setPomodoro({ on: e.target.checked })} /><i /></label>
        </div>
        {([['focusMin', 'Foco', 10, 60, 5], ['breakMin', 'Pausa curta', 3, 15, 1], ['longBreakMin', 'Pausa longa', 10, 30, 5], ['cycles', 'Blocos até a pausa longa', 2, 6, 1]] as const).map(([k, label, min, max, step]) => (
          <div className="row col" key={k}>
            <div className="row-top"><div><b>{label}</b></div><b className="num">{pomodoro[k]}{k === 'cycles' ? '' : ' min'}</b></div>
            <input type="range" min={min} max={max} step={step} value={pomodoro[k]} onChange={(e) => setPomodoro({ [k]: +e.target.value })} aria-label={label} />
          </div>
        ))}
        <div className="row">
          <div><b>Som e vibração</b><span className="small muted">Avisa a troca entre foco e pausa.</span></div>
          <label className="switch"><input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} /><i /></label>
        </div>
        <div className="row">
          <div><b>Manter a tela ligada</b><span className="small muted">Durante uma sessão, para o celular não apagar.</span></div>
          <label className="switch"><input type="checkbox" checked={prefs.keepAwake} onChange={(e) => setPrefs({ keepAwake: e.target.checked })} /><i /></label>
        </div>
      </section>

      <section className="card setting-group">
        <h3>Lembretes</h3>
        {!isNative && <p className="small muted">Os lembretes funcionam no app Android. No navegador eles ficam desativados.</p>}
        <div className="row">
          <div><b>Lembrete diário</b><span className="small muted">Aviso na hora de estudar, até a meta ser cumprida.</span></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="time" className="in time" value={reminders.time} disabled={!isNative} onChange={(e) => e.target.value && setReminders({ time: e.target.value })} aria-label="Horário do lembrete diário" />
            <label className="switch"><input type="checkbox" checked={reminders.daily} disabled={!isNative} onChange={async (e) => { if (e.target.checked && !(await requestNotificationPermission())) return setMsg('Permita as notificações do app nas configurações do Android.'); setReminders({ daily: e.target.checked }); }} /><i /></label>
          </div>
        </div>
        <div className="row">
          <div><b>Aviso de meta em risco</b><span className="small muted">Quanto falta hoje e quantos votos o adversário ganha se você parar.</span></div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="time" className="in time" value={reminders.riskTime} disabled={!isNative} onChange={(e) => e.target.value && setReminders({ riskTime: e.target.value })} aria-label="Horário do aviso de meta em risco" />
            <label className="switch"><input type="checkbox" checked={reminders.risk} disabled={!isNative} onChange={async (e) => { if (e.target.checked && !(await requestNotificationPermission())) return setMsg('Permita as notificações do app nas configurações do Android.'); setReminders({ risk: e.target.checked }); }} /><i /></label>
          </div>
        </div>
        {msg && <p className="small banner">{msg}</p>}
      </section>

      {c && (
        <section className="card setting-group">
          <h3>Campanha ativa</h3>
          <div className="row">
            <div><b>{election.candidates[c.focusNr].name} · {c.round}º turno</b>
              <span className="small muted">Prazo {new Date(c.deadline + 'T12:00').toLocaleDateString('pt-BR')} · 1 min = {fmtInt(c.rate)} votos</span></div>
            <button className="btn ghost small" onClick={() => openCampaign('replanejar')}>Replanejar</button>
          </div>
          <div className="row">
            <div><b>Distribuição automática</b><span className="small muted">{STRATEGY_INFO[c.strategy.kind].name}: {STRATEGY_INFO[c.strategy.kind].desc}</span></div>
            <button className="btn ghost small" onClick={() => openCampaign('estrategia')}>Alterar</button>
          </div>
          <div className="row">
            <div><b>Oposição ativa</b><span className="small muted">Meta não cumprida dá votos ao adversário.</span></div>
            <label className="switch"><input type="checkbox" checked={c.penalty} disabled={c.mode === 'livre'} onChange={(e) => patchCampaign(c.id, { penalty: e.target.checked, settledThrough: c.settledThrough })} /><i /></label>
          </div>
          <div className="row">
            <div><b>Adversário reage</b><span className="small muted">Responde onde você investe muitos votos.</span></div>
            <label className="switch"><input type="checkbox" checked={c.reactive} disabled={c.mode === 'livre'} onChange={(e) => patchCampaign(c.id, { reactive: e.target.checked, snapshot: { ...c.allocations } })} /><i /></label>
          </div>
          <div className="row">
            <div><b>Eventos de campanha</b><span className="small muted">Debates, apoios, boatos e greves ao longo dos dias.</span></div>
            <label className="switch"><input type="checkbox" checked={c.eventsOn} disabled={c.mode === 'livre'} onChange={(e) => patchCampaign(c.id, { eventsOn: e.target.checked })} /><i /></label>
          </div>
          <div className="row">
            <div><b>Outra campanha</b><span className="small muted">Suas sessões e campanhas anteriores continuam salvas.</span></div>
            <button className="btn ghost small" onClick={() => openCampaign('novo')}>Nova campanha</button>
          </div>
        </section>
      )}

      <section className="card setting-group">
        <h3>Seus dados</h3>
        <p className="small muted">Tudo fica neste aparelho. Faça um backup antes de trocar de celular ou limpar o navegador.</p>
        <div className="row-actions">
          <button className="btn ghost small" onClick={exportJson}>Exportar backup</button>
          <button className="btn ghost small" onClick={() => file.current?.click()}>Importar backup</button>
          <button className="btn ghost small danger" onClick={() => confirm('Apagar todas as sessões e campanhas deste aparelho? Isso não pode ser desfeito.') && resetAll()}>Apagar tudo</button>
          <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
        </div>
        {msg && <p className="small banner">{msg}</p>}
      </section>

      <section className="card setting-group">
        <h3>Sobre os dados</h3>
        <p className="small muted"><b>Oficial:</b> resultados do {src.publisher}, “{src.dataset}”, licença {src.license}, snapshot de {new Date(src.generatedAt + 'T12:00').toLocaleDateString('pt-BR')}. {src.note} <a href={src.url} target="_blank" rel="noreferrer">Fonte</a>.</p>
        <p className="small muted"><b>Fictício:</b> os votos de estudo e da oposição existem só neste app e nunca alteram nem representam a apuração oficial.</p>
        <p className="small muted"><b>Mapas:</b> {src.geometry}. Alguns municípios criados depois dessa malha não aparecem no mapa, mas contam nos totais do estado.</p>
        <p className="small faint">Estude e Ganhe · versão 0.1.0</p>
      </section>
    </div>
  );
}
