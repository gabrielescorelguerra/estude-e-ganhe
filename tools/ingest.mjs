#!/usr/bin/env node
/**
 * Ingestão de dados — Presidente 2022
 *
 * Fontes:
 *  - Resultados: TSE, Dados Abertos (votacao_candidato_munzona_2022.zip), licença CC-BY.
 *  - Malhas municipais: tbrugz/geodata-br (derivado das malhas do IBGE).
 *
 * Uso: node tools/ingest.mjs [--zip caminho.zip] [--geo caminho.json]
 * Sem argumentos, baixa os arquivos para .cache/ (ignorado pelo git).
 *
 * Saída: public/data/2022/presidente/*  e  public/geo/*
 * O app NÃO acessa o TSE em tempo de execução: usa este snapshot validado.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, writeFileSync, statSync } from 'node:fs';
import { parse } from 'csv-parse';
import { topology } from 'topojson-server';
import { presimplify, simplify, quantile } from 'topojson-simplify';
import { merge, quantize, feature } from 'topojson-client';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const CACHE = join(ROOT, '.cache');
mkdirSync(CACHE, { recursive: true });

const ZIP_URL = 'https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip';
const GEO_URL = 'https://raw.githubusercontent.com/tbrugz/geodata-br/master/geojson/geojs-100-mun.json';

function ensure(path, url) {
  if (path && existsSync(path)) return path;
  const dest = join(CACHE, url.split('/').pop());
  if (!existsSync(dest) || statSync(dest).size < 1000) {
    console.log('baixando', url);
    execFileSync('curl', ['-fsSL', '--retry', '4', '-o', dest, url], { stdio: 'inherit' });
  }
  return dest;
}
const zipPath = ensure(arg('--zip'), ZIP_URL);
const geoPath = ensure(arg('--geo'), GEO_URL);

const UFS = {
  AC: ['12', 'Acre'], AL: ['27', 'Alagoas'], AP: ['16', 'Amapá'], AM: ['13', 'Amazonas'], BA: ['29', 'Bahia'],
  CE: ['23', 'Ceará'], DF: ['53', 'Distrito Federal'], ES: ['32', 'Espírito Santo'], GO: ['52', 'Goiás'],
  MA: ['21', 'Maranhão'], MT: ['51', 'Mato Grosso'], MS: ['50', 'Mato Grosso do Sul'], MG: ['31', 'Minas Gerais'],
  PA: ['15', 'Pará'], PB: ['25', 'Paraíba'], PR: ['41', 'Paraná'], PE: ['26', 'Pernambuco'], PI: ['22', 'Piauí'],
  RJ: ['33', 'Rio de Janeiro'], RN: ['24', 'Rio Grande do Norte'], RS: ['43', 'Rio Grande do Sul'],
  RO: ['11', 'Rondônia'], RR: ['14', 'Roraima'], SC: ['42', 'Santa Catarina'], SP: ['35', 'São Paulo'],
  SE: ['28', 'Sergipe'], TO: ['17', 'Tocantins'],
};
const IBGE_TO_UF = Object.fromEntries(Object.entries(UFS).map(([k, v]) => [v[0], k]));

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
// Municípios renomeados (TSE usa o nome atual; a malha usa o antigo): "UF:NOME_TSE_NORMALIZADO" -> código IBGE
const ID_ALIASES = {
  'RN:BOASAUDE': '2405306', // Januário Cicco
  'RN:CAMPOGRANDE': '2401305', // Augusto Severo
  'RN:SERRACAIADA': '2410306', // Presidente Juscelino (RN)
  'PB:JOCACLAUDINO': '2513653', // Santarém (PB)
  'PB:TACIMA': '2516409', // Campo de Santana
  'SP:EMBUDASARTES': '3515004', // Embu
  'TO:TABOCAO': '1708254', // Fortaleza do Tabocão
  'RN:AREZ': '2401206', // Arês
  'RN:ASSU': '2400208', // Açu
  'TO:SAOVALERIO': '1720499', // São Valério da Natividade
};
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// ---------- cores e nomes de exibição ----------
const COLORS = {
  13: '#B8323A', 22: '#24508F', 12: '#7D5BA6', 15: '#2F8F83', 44: '#C9708A', 30: '#B0742F',
};
const FALLBACK = '#8C887D';
const titleCase = (s) =>
  s.toLowerCase().split(' ').map((w) => (['de', 'da', 'do', 'dos', 'das', 'e'].includes(w) ? w : w[0].toUpperCase() + w.slice(1))).join(' ');
const DISPLAY = { 'FELIPE D AVILA': "Felipe d'Avila", 'LÉO PÉRICLES': 'Léo Péricles', 'LULA': 'Lula', 'VERA': 'Vera' };

// ---------- 1. resultados TSE ----------
function csvRows(file) {
  // o arquivo nacional tem ~4 GB (todos os cargos): filtra só "Presidente" com grep antes de parsear
  return new Promise((resolve, reject) => {
    const rows = [];
    const sh = spawn('sh', ['-c', `unzip -p "$1" "$2" | LC_ALL=C grep -a -e DS_CARGO -e '"Presidente"'`, 'sh', zipPath, file],
      { stdio: ['ignore', 'pipe', 'inherit'] });
    const parser = parse({ delimiter: ';', columns: true, relax_quotes: true, bom: true });
    sh.stdout.setEncoding('latin1');
    parser.on('readable', () => { let r; while ((r = parser.read())) if (r.DS_CARGO === 'Presidente') rows.push(r); });
    parser.on('end', () => resolve(rows));
    parser.on('error', reject);
    sh.stdout.pipe(parser);
  });
}

console.log('lendo resultados do TSE…');
const cand = new Map(); // nr -> meta
const munVotes = {}; // key -> {uf, tse, name, v:{1:{nr:votes},2:{...}}}
const exterior = { 1: {}, 2: {} };
{
  // BRASIL.csv contém todas as UF + exterior (ZZ), por município e zona
  const rows = await csvRows('votacao_candidato_munzona_2022_BRASIL.csv');
  for (const r of rows) {
    const nr = +r.NR_CANDIDATO, turno = +r.NR_TURNO, votos = +r.QT_VOTOS_NOMINAIS;
    if (!cand.has(nr)) {
      const urna = r.NM_URNA_CANDIDATO;
      cand.set(nr, {
        nr, sq: r.SQ_CANDIDATO, name: DISPLAY[urna] ?? titleCase(urna), fullName: titleCase(r.NM_CANDIDATO),
        party: r.SG_PARTIDO, partyName: r.NM_PARTIDO, color: COLORS[nr] ?? FALLBACK,
      });
    }
    if (r.SG_UF === 'ZZ') { exterior[turno][nr] = (exterior[turno][nr] ?? 0) + votos; continue; }
    const key = `${r.SG_UF}:${r.CD_MUNICIPIO}`;
    const m = (munVotes[key] ??= { uf: r.SG_UF, tse: r.CD_MUNICIPIO, name: r.NM_MUNICIPIO, v: { 1: {}, 2: {} } });
    m.v[turno][nr] = (m.v[turno][nr] ?? 0) + votos;
  }
  console.log('linhas de Presidente:', rows.length);
}

// candidatos por turno (ordem: mais votados primeiro)
const rounds = [];
for (const t of [1, 2]) {
  const tot = {};
  for (const m of Object.values(munVotes)) for (const [nr, v] of Object.entries(m.v[t])) tot[nr] = (tot[nr] ?? 0) + v;
  for (const [nr, v] of Object.entries(exterior[t])) tot[nr] = (tot[nr] ?? 0) + v;
  const order = Object.keys(tot).map(Number).sort((a, b) => tot[b] - tot[a]);
  rounds.push({ round: t, candidates: order, totals: order.map((n) => tot[n]) });
}

// ---------- 2. geometria + casamento TSE x IBGE ----------
console.log('processando malhas…');
const geo = JSON.parse(readFileSync(geoPath, 'utf8'));
const ibgeIndex = new Map(); // "UF:NOME" -> ibge
for (const f of geo.features) {
  const uf = IBGE_TO_UF[f.properties.id.slice(0, 2)];
  ibgeIndex.set(`${uf}:${norm(f.properties.name)}`, f.properties.id);
}
const tseToIbge = {};
const unmatched = [];
const fuzzy = [];
const byUf = {};
for (const [k, id] of ibgeIndex) (byUf[k.split(':')[0]] ??= []).push([k.split(':')[1], id]);
for (const [key, m] of Object.entries(munVotes)) {
  const n = norm(m.name);
  let id = ibgeIndex.get(`${m.uf}:${n}`) ?? ID_ALIASES[`${m.uf}:${n}`];
  if (!id && n.length >= 5) {
    // variações de grafia (Moji/Mogi, Poxoréu/Poxoréo…): distância ≤ 2, única
    const near = (byUf[m.uf] ?? []).map(([nm, i]) => [lev(n, nm), i, nm]).filter(([d]) => d <= 2).sort((a, b) => a[0] - b[0]);
    if (near.length && (near.length === 1 || near[0][0] < near[1][0])) { id = near[0][1]; fuzzy.push(`${m.name}→${near[0][2]}`); }
  }
  if (id) tseToIbge[key] = id; else unmatched.push(`${m.uf} ${m.name}`);
}
if (fuzzy.length) console.log('casamento aproximado:', fuzzy.join(', '));
console.log(`municípios casados: ${Object.keys(tseToIbge).length}/${Object.keys(munVotes).length}`);
if (unmatched.length) console.log('SEM GEOMETRIA (entram só nos totais do estado):', unmatched.join(', '));

const ibgeName = new Map(geo.features.map((f) => [f.properties.id, f.properties.name]));
const round = (n) => Math.round(n);
const fc = {
  type: 'FeatureCollection',
  features: geo.features.map((f) => ({ type: 'Feature', properties: { id: f.properties.id }, geometry: f.geometry })),
};
let topo = topology({ m: fc }, 1e6);
topo = presimplify(topo);
topo = simplify(topo, quantile(topo, 0.35));
topo = quantize(topo, 1e5);

const out = (p, data) => {
  const full = join(ROOT, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, typeof data === 'string' ? data : JSON.stringify(data));
};

// municípios por UF
for (const [uf, [code]] of Object.entries(UFS)) {
  const geoms = topo.objects.m.geometries.filter((g) => g.properties.id.startsWith(code));
  let t = topology({ m: { type: 'FeatureCollection', features: geoms.map((g) => feature(topo, g)) } }, 1e5);
  t = presimplify(t);
  t = simplify(t, quantile(t, 0.2));
  t = quantize(t, 4e4);
  out(`public/geo/mun/${uf}.json`, t);
}

// UFs: união dos municípios
const ufFeatures = Object.entries(UFS).map(([uf, [code, name]]) => {
  const geoms = topo.objects.m.geometries.filter((g) => g.properties.id.startsWith(code));
  return { type: 'Feature', properties: { id: uf, name }, geometry: merge(topo, geoms) };
});
let ufTopo = topology({ ufs: { type: 'FeatureCollection', features: ufFeatures } }, 1e5);
ufTopo = presimplify(ufTopo);
ufTopo = simplify(ufTopo, quantile(ufTopo, 0.3));
ufTopo = quantize(ufTopo, 2e4);
out('public/geo/ufs.json', ufTopo);

// ---------- 3. saída de dados ----------
const arr = (obj, order) => order.map((nr) => obj[nr] ?? 0);
const places = Object.entries(UFS).map(([uf, [code, name]]) => {
  const ms = Object.values(munVotes).filter((m) => m.uf === uf);
  const votes = rounds.map((r) => r.candidates.map((nr) => ms.reduce((s, m) => s + (m.v[r.round][nr] ?? 0), 0)));
  return { id: uf, name, kind: 'uf', ibge: code, votes };
});
places.push({ id: 'ZZ', name: 'Exterior', kind: 'exterior', votes: rounds.map((r) => arr(exterior[r.round], r.candidates)) });

const manifest = {
  schema: 1,
  id: '2022-presidente',
  year: 2022,
  cargo: 'Presidente',
  title: 'Eleição presidencial 2022',
  source: {
    publisher: 'Tribunal Superior Eleitoral (TSE) — Dados Abertos',
    dataset: 'Resultados 2022 · votação por candidato, município e zona',
    url: 'https://dadosabertos.tse.jus.br/dataset/resultados-2022',
    license: 'CC-BY',
    geometry: 'Malhas municipais do IBGE, via tbrugz/geodata-br',
    generatedAt: new Date().toISOString().slice(0, 10),
    note: 'Votos nominais (válidos) apurados pelo TSE. Municípios sem malha entram nos totais do estado.',
  },
  candidates: Object.fromEntries([...cand.values()].map((c) => [c.nr, c])),
  rounds: rounds.map(({ round: r, candidates, totals }) => ({ round: r, candidates, totals })),
  places,
};
out('public/data/2022/presidente/election.json', manifest);

for (const [uf, [code]] of Object.entries(UFS)) {
  const items = [];
  for (const [key, m] of Object.entries(munVotes)) {
    if (m.uf !== uf) continue;
    const id = tseToIbge[key];
    if (!id) continue;
    items.push([id, ibgeName.get(id), ...rounds.map((r) => arr(m.v[r.round], r.candidates))]);
  }
  out(`public/data/2022/presidente/mun/${uf}.json`, { uf, items });
}

// ---------- 4. verificação contra totais oficiais ----------
for (const r of rounds) {
  const sum = r.candidates.map((_, i) => places.reduce((s, p) => s + p.votes[r.round - 1][i], 0));
  const ok = sum.every((v, i) => v === r.totals[i]);
  console.log(`turno ${r.round}: soma dos estados == total nacional?`, ok,
    r.candidates.slice(0, 2).map((n, i) => `${cand.get(n).name} ${r.totals[i].toLocaleString('pt-BR')}`).join(' | '));
  if (!ok) process.exitCode = 1;
}
const OFFICIAL = { 1: { 13: 57259504, 22: 51072345 }, 2: { 13: 60345999, 22: 58206354 } };
for (const r of rounds) for (const [nr, v] of Object.entries(OFFICIAL[r.round])) {
  const got = r.totals[r.candidates.indexOf(Number(nr))];
  if (got !== v) { console.error(`ERRO: turno ${r.round} candidato ${nr}: ${got} != oficial ${v}`); process.exitCode = 1; }
}
console.log('ok');
