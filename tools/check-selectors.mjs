#!/usr/bin/env node
/**
 * Vérifie la cohérence entre le HTML et le JavaScript :
 *  - chaque `$('#id')` utilisé dans src/ doit correspondre à un id présent dans index.html,
 *  - index.html ne doit pas contenir d'id dupliqué.
 * Détecte immédiatement les fautes de frappe qui provoqueraient un `null` à l'exécution.
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

async function listerJs(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await listerJs(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

async function main() {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');

  // Ids déclarés
  const ids = new Set();
  const doublons = [];
  const reId = /\bid="([^"]+)"/g;
  let m;
  while ((m = reId.exec(html))) {
    if (ids.has(m[1])) doublons.push(m[1]);
    ids.add(m[1]);
  }

  // Sélecteurs #id utilisés dans le JS
  const selecteurs = new Map(); // id -> [fichiers]
  for (const fichier of await listerJs(SRC)) {
    const contenu = await readFile(fichier, 'utf8');
    const re = /\$\('#([A-Za-z0-9_-]+)'\)|querySelector\(\s*'#([A-Za-z0-9_-]+)'\s*\)|getElementById\(\s*'([A-Za-z0-9_-]+)'\s*\)/g;
    let x;
    while ((x = re.exec(contenu))) {
      const id = x[1] || x[2] || x[3];
      if (!selecteurs.has(id)) selecteurs.set(id, []);
      selecteurs.get(id).push(relative(ROOT, fichier));
    }
  }

  const manquants = [];
  for (const [id, fichiers] of selecteurs) {
    if (!ids.has(id)) manquants.push({ id, fichiers: [...new Set(fichiers)] });
  }

  console.log(`Ids dans index.html : ${ids.size}`);
  console.log(`Sélecteurs #id utilisés dans le JS : ${selecteurs.size}`);

  let echec = false;
  if (doublons.length) {
    echec = true;
    console.error('\nIds dupliqués dans index.html :');
    for (const d of doublons) console.error('  ✖ ' + d);
  }
  if (manquants.length) {
    echec = true;
    console.error('\nSélecteurs sans élément correspondant dans index.html :');
    for (const x of manquants) console.error(`  ✖ #${x.id} (utilisé dans ${x.fichiers.join(', ')})`);
  }

  if (echec) process.exit(1);
  console.log('\nHTML et JavaScript sont cohérents.');
}

main().catch((e) => { console.error(e); process.exit(1); });
