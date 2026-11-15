export interface CandidateMeta {
  nr: number;
  /** SQ_CANDIDATO do TSE, usado para localizar a foto oficial */
  sq?: string;
  name: string;
  fullName: string;
  party: string;
  partyName: string;
  color: string;
}

export interface RoundInfo {
  round: 1 | 2;
  /** números dos candidatos, do mais votado ao menos votado (ordem dos arrays de votos) */
  candidates: number[];
  totals: number[];
}

export interface Place {
  id: string; // sigla da UF ("SP") ou "ZZ" (exterior)
  name: string;
  kind: 'uf' | 'exterior' | 'transit';
  ibge?: string;
  /** votes[roundIndex][candidateIndex] */
  votes: number[][];
}

export interface Election {
  schema: number;
  id: string;
  /** pasta dos dados: "2022/presidente" */
  path: string;
  year: number;
  cargo: string;
  title: string;
  source: {
    publisher: string;
    dataset: string;
    url: string;
    license: string;
    geometry: string;
    generatedAt: string;
    note: string;
  };
  candidates: Record<string, CandidateMeta>;
  rounds: RoundInfo[];
  places: Place[];
}

export type Round = 1 | 2;

/** votos por candidato (nr -> votos) */
export type Tally = Record<number, number>;

export type StrategyConfig =
  | { kind: 'manual' }
  | { kind: 'concentrar'; ufs: string[] }
  | { kind: 'proporcional' }
  | { kind: 'virar' }
  | { kind: 'rodizio'; ufs: string[]; cursor: number };

export interface Campaign {
  id: string;
  electionId: string;
  round: Round;
  focusNr: number;
  createdAt: number;
  /** prazo (data local, YYYY-MM-DD) */
  deadline: string;
  days: number;
  dailyGoalMin: number;
  /** folga de vitória desejada, em % do total de votos do turno */
  marginPct: number;
  /** votos fictícios por minuto de estudo */
  rate: number;
  /** votos que faltavam ao criar/replanejar a campanha (base da barra de progresso) */
  baseNeeded: number;
  mode: 'plano' | 'livre';
  /** alocações: chave `${lugar}|${nr}` -> votos. lugar = UF, "ZZ" ou código IBGE (município) */
  allocations: Record<string, number>;
  strategy: StrategyConfig;
  status: 'ativa' | 'vencida' | 'derrota';
  /** oposição ativa: minutos de meta não cumpridos viram votos do adversário */
  penalty: boolean;
  /** votos do adversário (mesma chave de `allocations`); gerados pelo app, o jogador não edita */
  opposition: Record<string, number>;
  /** último dia (inclusive) já apurado */
  settledThrough: string;
  /** última folga usada (1 por janela de 7 dias) */
  lastFreeDay: string | null;
  losses: Loss[];
  /** votos extras (eventos), contam como seus mas não saem do saldo */
  bonus: Record<string, number>;
  /** adversário reage onde você mais investiu */
  reactive: boolean;
  /** eventos aleatórios */
  eventsOn: boolean;
  /** alocações na última apuração (base do contra-ataque) */
  snapshot: Record<string, number>;
  /** multiplicador temporário da taxa (eventos) */
  boost: { mult: number; until: string; label: string } | null;
  lastEventDay: string | null;
  feed: FeedItem[];
  /** retrato do fim de cada dia, por estado: usado na retrospectiva */
  history: Record<string, DaySnap>;
}

/** votos por "UF|candidato" */
export interface DaySnap { s: Record<string, number>; o: Record<string, number> }

export interface FeedItem {
  id: string;
  day: string;
  kind: 'contra' | 'evento' | 'perda';
  title: string;
  text: string;
  tone: 'bom' | 'ruim' | 'neutro';
}

export interface Loss {
  day: string;
  shortMin: number;
  votes: number;
  /** dia de folga: sem votos para o adversário */
  free: boolean;
  rivalNr: number;
}

export interface Session {
  id: string;
  campaignId: string | null;
  label: string;
  start: number;
  end: number;
  /** tempo efetivamente estudado, em segundos */
  seconds: number;
  rate: number;
  votes: number;
  /** blocos de foco concluídos (modo Pomodoro) */
  blocks?: number;
}

export interface Segment {
  start: number;
  end?: number;
}

export interface PomoState {
  phase: 'foco' | 'pausa';
  /** blocos de foco concluídos */
  blocks: number;
  /** índice do trecho em que o bloco de foco atual começou */
  blockSeg: number;
  breakStart?: number;
  long?: boolean;
}

export interface ActiveSession {
  id: string;
  pomo?: PomoState;
  label: string;
  campaignId: string | null;
  rate: number;
  segments: Segment[];
}
