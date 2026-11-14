import type { Campaign, Election, Round, Tally } from './types';

export const UF_BY_IBGE: Record<string, string> = {
  '12': 'AC', '27': 'AL', '16': 'AP', '13': 'AM', '29': 'BA', '23': 'CE', '53': 'DF', '32': 'ES', '52': 'GO',
  '21': 'MA', '51': 'MT', '50': 'MS', '31': 'MG', '15': 'PA', '25': 'PB', '41': 'PR', '26': 'PE', '22': 'PI',
  '33': 'RJ', '24': 'RN', '43': 'RS', '11': 'RO', '14': 'RR', '42': 'SC', '35': 'SP', '28': 'SE', '17': 'TO',
};

/** UF de um lugar: sigla, "ZZ" ou código IBGE de município */
export const ufOfPlace = (id: string): string => (id.length <= 2 ? id : UF_BY_IBGE[id.slice(0, 2)] ?? id);
export const isMunicipio = (id: string) => id.length === 7;
export const allocKey = (place: string, nr: number) => `${place}|${nr}`;

export function parseAllocKey(k: string): { place: string; nr: number } {
  const [place, nr] = k.split('|');
  return { place, nr: Number(nr) };
}

export const sum = (t: Tally) => Object.values(t).reduce((a, b) => a + b, 0);

export function officialTally(election: Election, round: Round, placeId?: string): Tally {
  const ri = round - 1;
  const cands = election.rounds[ri].candidates;
  const t: Tally = {};
  for (const nr of cands) t[nr] = 0;
  for (const p of election.places) {
    if (placeId && p.id !== placeId) continue;
    p.votes[ri].forEach((v, i) => (t[cands[i]] += v));
  }
  return t;
}

/** votos de estudo (fictícios) por candidato em um lugar (UF inclui os municípios dela) ou no país todo */
export function studyTally(c: Pick<Campaign, 'allocations'>, placeId?: string): Tally {
  const t: Tally = {};
  for (const [k, v] of Object.entries(c.allocations)) {
    const { place, nr } = parseAllocKey(k);
    if (placeId && placeId.length <= 2 ? placeId && ufOfPlace(place) !== placeId : placeId && place !== placeId) continue;
    t[nr] = (t[nr] ?? 0) + v;
  }
  return t;
}

export function addTallies(a: Tally, b: Tally): Tally {
  const r: Tally = { ...a };
  for (const [k, v] of Object.entries(b)) r[Number(k)] = (r[Number(k)] ?? 0) + v;
  return r;
}

export const allocatedTotal = (c: Pick<Campaign, 'allocations'>) =>
  Object.values(c.allocations).reduce((a, b) => a + b, 0);

export function winnerOf(t: Tally): { nr: number; votes: number; margin: number; share: number } | null {
  const e = Object.entries(t).map(([nr, v]) => [Number(nr), v] as const).sort((a, b) => b[1] - a[1]);
  if (!e.length || e[0][1] === 0) return null;
  const total = sum(t);
  return { nr: e[0][0], votes: e[0][1], margin: (e[0][1] - (e[1]?.[1] ?? 0)) / total, share: e[0][1] / total };
}
