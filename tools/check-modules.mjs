#!/usr/bin/env node
/**
 * Vérification statique + dynamique des modules du jeu.
 *
 * Node peut importer les modules ES du jeu (aucun n'utilise le DOM au niveau module),
 * à l'exception de `src/main.js` qui démarre l'application. Cela permet de détecter :
 *  - les erreurs de syntaxe,
 *  - les imports manquants (fichier introuvable ou export nommé absent),
 *  - les dépendances circulaires accidentelles.
 *
 * Usage : node tools/check-modules.mjs
 */
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const IGNORER = new Set(['main.js']);

async function listerModules(dir) {
  const out = [];
  for (const entree of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entree.name);
    if (entree.isDirectory()) out.push(...await listerModules(p));
    else if (entree.name.endsWith('.js')) out.push(p);
  }
  return out;
}

async function main() {
  const modules = (await listerModules(SRC)).filter((f) => !IGNORER.has(relative(SRC, f)));
  let echecs = 0;
  let ok = 0;

  for (const fichier of modules) {
    const rel = relative(ROOT, fichier);
    try {
      await import(pathToFileURL(fichier).href);
      ok++;
    } catch (e) {
      echecs++;
      console.error(`✖ ${rel} — ${e.name}: ${e.message}`);
    }
  }

  // Vérifie que chaque chemin d'import relatif existe bien sur le disque.
  const cheminsManquants = [];
  for (const fichier of [...modules, join(SRC, 'main.js')]) {
    const contenu = await readFile(fichier, 'utf8');
    const re = /from\s+['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(contenu))) {
      const cible = new URL(m[1], pathToFileURL(fichier));
      try {
        await readFile(fileURLToPath(cible), 'utf8');
      } catch {
        cheminsManquants.push(`${relative(ROOT, fichier)} -> ${m[1]}`);
      }
    }
  }

  console.log(`\nModules importés avec succès : ${ok}/${modules.length}`);
  if (cheminsManquants.length) {
    echecs += cheminsManquants.length;
    console.error('Chemins d\'import introuvables :');
    for (const c of cheminsManquants) console.error('  ✖ ' + c);
  }

  if (echecs) {
    console.error(`\nÉCHEC : ${echecs} problème(s).`);
    process.exit(1);
  }
  console.log('Tous les modules sont chargeables et tous les imports résolvent.');
}

main().catch((e) => { console.error(e); process.exit(1); });
