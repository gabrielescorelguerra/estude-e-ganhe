export interface CandidateMeta {
  nr: number;
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
  kind: 'uf' | 'exterior';
  ibge?: string;
  /** votes[roundIndex][candidateIndex] */
  votes: number[][];
}

export interface Election {
  schema: number;
  id: string;
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
  status: 'ativa' | 'vencida' | 'expirada';
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
}

export interface Segment {
  start: number;
  end?: number;
}

export interface ActiveSession {
  id: string;
  label: string;
  campaignId: string | null;
  rate: number;
  segments: Segment[];
}
