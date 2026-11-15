export interface BadgeStats {
  sessions: number;
  totalSeconds: number;
  streak: number;
  longestSessionMin: number;
  flips: number;
  advanced: boolean;
  won: boolean;
  earlyBird: boolean;
  nightOwl: boolean;
  counters: number;
  events: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  desc: string;
  check: (s: BadgeStats) => boolean;
}

const H = 3600;
export const BADGES: BadgeDef[] = [
  { id: 'primeira', name: 'Primeiro voto', desc: 'Conclua sua primeira sessão de estudo.', check: (s) => s.sessions >= 1 },
  { id: 'cinco', name: 'Pegando o ritmo', desc: 'Conclua 5 sessões.', check: (s) => s.sessions >= 5 },
  { id: 'dez-horas', name: 'Dez horas', desc: 'Some 10 horas de estudo.', check: (s) => s.totalSeconds >= 10 * H },
  { id: 'cinquenta-horas', name: 'Cinquenta horas', desc: 'Some 50 horas de estudo.', check: (s) => s.totalSeconds >= 50 * H },
  { id: 'cem-horas', name: 'Cem horas', desc: 'Some 100 horas de estudo.', check: (s) => s.totalSeconds >= 100 * H },
  { id: 'semana', name: 'Semana perfeita', desc: 'Cumpra a meta diária por 7 dias seguidos.', check: (s) => s.streak >= 7 },
  { id: 'mes', name: 'Mês de campanha', desc: 'Cumpra a meta diária por 30 dias seguidos.', check: (s) => s.streak >= 30 },
  { id: 'maratona', name: 'Maratona', desc: 'Estude 2 horas numa única sessão.', check: (s) => s.longestSessionMin >= 120 },
  { id: 'madrugador', name: 'Madrugador', desc: 'Comece uma sessão entre 4h e 6h.', check: (s) => s.earlyBird },
  { id: 'coruja', name: 'Coruja', desc: 'Comece uma sessão depois das 23h.', check: (s) => s.nightOwl },
  { id: 'virada', name: 'Virada', desc: 'Vire o resultado de um estado.', check: (s) => s.flips >= 1 },
  { id: 'dez-viradas', name: 'Mapa em movimento', desc: 'Tenha 10 estados virados ao mesmo tempo.', check: (s) => s.flips >= 10 },
  { id: 'segundo-turno', name: 'Segundo turno', desc: 'Leve um candidato ao 2º turno.', check: (s) => s.advanced },
  { id: 'vitoria', name: 'Vitória', desc: 'Vença um 2º turno.', check: (s) => s.won },
  { id: 'resiliente', name: 'Resiliente', desc: 'Sofra 3 contra-ataques e continue na disputa.', check: (s) => s.counters >= 3 },
  { id: 'noticias', name: 'Nas manchetes', desc: 'Passe por 5 eventos de campanha.', check: (s) => s.events >= 5 },
];
