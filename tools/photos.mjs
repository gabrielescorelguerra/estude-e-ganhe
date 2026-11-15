#!/usr/bin/env node
/**
 * Baixa as fotos oficiais dos candidatos (TSE · DivulgaCandContas) para public/photos/{numero}.jpg,
 * para o app funcionar offline e no APK. Rode na SUA máquina: o servidor do TSE costuma recusar IPs de
 * nuvem/CI. Sem as fotos locais, o app tenta carregar direto do TSE e, se falhar, mostra as iniciais.
 *
 *   node tools/photos.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const election = JSON.parse(readFileSync(join(ROOT, 'public/data/2022/presidente/election.json'), 'utf8'));
mkdirSync(join(ROOT, 'public/photos'), { recursive: true });

let ok = 0;
for (const c of Object.values(election.candidates)) {
  const url = `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/2040602022/${c.sq}/BR`;
  try {
    const r = await fetch(url);
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !type.startsWith('image/')) throw new Error(`${r.status} ${type}`);
    writeFileSync(join(ROOT, `public/photos/${c.nr}.jpg`), Buffer.from(await r.arrayBuffer()));
    ok++;
    console.log('ok  ', c.name);
  } catch (e) {
    console.log('falhou', c.name, String(e.message ?? e));
  }
}
console.log(`${ok}/${Object.keys(election.candidates).length} fotos baixadas`);
