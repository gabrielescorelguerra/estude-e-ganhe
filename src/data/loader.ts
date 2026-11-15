import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { Election } from '../core/types';

const BASE = import.meta.env.BASE_URL;
const cache = new Map<string, Promise<unknown>>();

async function getJson<T>(path: string, tries = 3): Promise<T> {
  let err: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`${BASE}${path}`);
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      return (await r.json()) as T;
    } catch (e) {
      err = e;
      await new Promise((res) => setTimeout(res, 400 * (i + 1)));
    }
  }
  throw err;
}

function memo<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = getJson<T>(path);
    p.catch(() => cache.delete(path)); // permite tentar de novo após falha
    cache.set(path, p);
  }
  return p;
}

export interface ElectionMeta { id: string; path: string; year: number; cargo: string; title: string; finalists: string[]; winner: string }
export const DEFAULT_ELECTION = '2022-presidente';
/** "2018-presidente" -> "2018/presidente" */
export const electionPath = (id: string) => id.replace('-', '/');
export const loadElectionIndex = () => memo<ElectionMeta[]>('data/elections.json');
export const loadElection = (id: string = DEFAULT_ELECTION) => memo<Election>(`data/${electionPath(id)}/election.json`);

export type GeoFC = FeatureCollection<Geometry, { id: string; name?: string }>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toFC = (topo: any, obj: string): GeoFC => feature(topo, topo.objects[obj]) as unknown as GeoFC;

export const loadUfGeo = async (): Promise<GeoFC> => toFC(await memo('geo/ufs.json'), 'ufs');
export const loadMunGeo = async (uf: string): Promise<GeoFC> => {
  // o objeto tem o nome 'm' (topology() preserva a chave original)
  const topo = await memo<any>(`geo/mun/${uf}.json`); // eslint-disable-line @typescript-eslint/no-explicit-any
  return toFC(topo, Object.keys(topo.objects)[0]);
};

/** [codigoIBGE, nome, votos turno 1[], votos turno 2[]] */
export type MunRow = [string, string, number[], number[]];
export const loadMunVotes = async (id: string, uf: string) =>
  (await memo<{ uf: string; items: MunRow[] }>(`data/${id}/mun/${uf}.json`)).items;
