import type { Election, StrategyConfig } from '../../core/types';
import { STRATEGY_INFO, fmtDuration, fmtInt } from '../../core';
import { useStore, useUi } from '../../state/store';
import type { Game } from '../../state/useGame';
import { Modal } from '../../ui/bits';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

export function StrategyModal({ game }: { game: Game }) {
  const { openCampaign } = useUi();
  const setStrategy = useStore((s) => s.setStrategy);
  const c = game.campaign;
  const s = c.strategy;
  const kinds: StrategyConfig['kind'][] = ['manual', 'virar', 'proporcional', 'concentrar', 'rodizio'];
  const pick = (kind: StrategyConfig['kind']) => {
    const ufs = 'ufs' in s ? s.ufs : [];
    if (kind === 'concentrar') setStrategy(c.id, { kind, ufs });
    else if (kind === 'rodizio') setStrategy(c.id, { kind, ufs, cursor: 0 });
    else setStrategy(c.id, { kind } as StrategyConfig);
  };
  const toggle = (uf: string) => {
    if (s.kind !== 'concentrar' && s.kind !== 'rodizio') return;
    const ufs = s.ufs.includes(uf) ? s.ufs.filter((x) => x !== uf) : [...s.ufs, uf];
    setStrategy(c.id, { ...s, ufs });
  };
  return (
    <Modal title="Distribuição automática" onClose={() => openCampaign(null)}>
      <p className="muted small">Define o que acontece com os votos de cada sessão ao terminar. Ao ativar uma estratégia, o saldo atual também é distribuído.</p>
      <div className="choice">
        {kinds.map((k) => (
          <button key={k} aria-pressed={s.kind === k} onClick={() => pick(k)}>
            <b>{STRATEGY_INFO[k].name}</b><span className="small muted">{STRATEGY_INFO[k].desc}</span>
          </button>
        ))}
      </div>
      {(s.kind === 'concentrar' || s.kind === 'rodizio') && (
        <div className="sect">
          <span className="lbl">Estados ({s.ufs.length} escolhidos)</span>
          <div className="cand-pick">
            {UFS.map((u) => <button key={u} aria-pressed={s.ufs.includes(u)} onClick={() => toggle(u)} style={{ padding: '3px 10px' }}>{u}</button>)}
          </div>
          {s.ufs.length === 0 && <p className="small study-text">Escolha ao menos um estado, ou os votos ficarão no saldo.</p>}
        </div>
      )}
      <div className="actions"><button className="btn" onClick={() => openCampaign(null)}>Pronto</button></div>
    </Modal>
  );
}

export function VictoryModal({ election, game }: { election: Election; game: Game }) {
  const { openCampaign } = useUi();
  const c = game.campaign;
  const me = election.candidates[c.focusNr];
  const rival = election.candidates[game.goal.rivalNr];
  const first = c.round === 1;
  return (
    <Modal title={first ? 'Você avançou ao 2º turno' : 'Vitória na simulação'} onClose={() => openCampaign(null)}>
      <p>
        {first
          ? <>Com os seus votos, <b>{me.name}</b> superou <b>{rival.name}</b> no 1º turno. Na eleição real, o 2º turno foi entre {election.candidates[election.rounds[1].candidates[0]].name} e {election.candidates[election.rounds[1].candidates[1]].name}.</>
          : <>Com os seus votos, <b>{me.name}</b> superou <b>{rival.name}</b> no 2º turno de {election.year}. Isso não aconteceu na eleição real: foi o seu estudo.</>}
      </p>
      <p className="small muted">{fmtInt(game.earned)} votos de estudo em {c.days} dias planejados.</p>
      <div className="actions">
        <button className="btn ghost" onClick={() => openCampaign(null)}>Ver o mapa</button>
        <button className="btn" onClick={() => openCampaign(first ? 'avancar' : 'novo')}>{first ? 'Começar o 2º turno' : 'Nova campanha'}</button>
      </div>
    </Modal>
  );
}

export function DefeatModal({ election, game }: { election: Election; game: Game }) {
  const { openCampaign } = useUi();
  const c = game.campaign;
  const me = election.candidates[c.focusNr];
  const rival = election.candidates[game.goal.rivalNr];
  const lostMin = c.losses.reduce((a, l) => a + (l.free ? 0 : l.shortMin), 0);
  const oppVotes = c.losses.reduce((a, l) => a + l.votes, 0);
  return (
    <Modal title="Prazo encerrado" onClose={() => openCampaign(null)}>
      <p>
        O prazo de {c.days} dias acabou e <b>{me.name}</b> não superou <b>{rival.name}</b>. Faltaram <b className="num">{fmtInt(game.goal.needed)}</b> votos.
      </p>
      {c.penalty && lostMin > 0 && (
        <p className="small muted">Você deixou de cumprir a meta em {c.losses.filter((l) => !l.free).length} dias ({fmtDuration(lostMin * 60)} a menos), o que deu {fmtInt(oppVotes)} votos à oposição.</p>
      )}
      <div className="actions">
        <button className="btn ghost" onClick={() => openCampaign('replanejar')}>Continuar com novo prazo</button>
        <button className="btn" onClick={() => openCampaign('novo')}>Nova campanha</button>
      </div>
    </Modal>
  );
}

export function SummaryModal({ election, game }: { election: Election; game: Game | null }) {
  const { summary, setSummary, setTab } = useUi();
  if (!summary) return null;
  const c = game?.campaign;
  return (
    <Modal title="Sessão concluída" onClose={() => setSummary(null)}>
      <div style={{ display: 'grid', gap: 6 }}>
        <span className="serif" style={{ fontSize: 40, lineHeight: 1.1 }}>{fmtDuration(summary.seconds)}</span>
        <span className="serif study-text" style={{ fontSize: 26 }}>+{fmtInt(summary.votes)} votos</span>
        {c && <span className="small muted">para {election.candidates[c.focusNr].name} · {STRATEGY_INFO[c.strategy.kind].name === 'Manual'
          ? 'ficam no saldo até você distribuir no mapa.' : `distribuídos pela estratégia ${STRATEGY_INFO[c.strategy.kind].name.toLowerCase()}.`}</span>}
      </div>
      <div className="actions">
        <button className="btn ghost" onClick={() => setSummary(null)}>Fechar</button>
        <button className="btn" onClick={() => { setSummary(null); setTab('mapa'); }}>Ver no mapa</button>
      </div>
    </Modal>
  );
}
