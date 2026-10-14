#!/usr/bin/env node
/**
 * Valide le registre compilé (data/registre-fusions.json).
 * Vérifie : identifiants stables uniques, paires uniques, ingrédients existants,
 * résultats non vides, cohérence catégorie/rareté avec l'élément, et accessibilité
 * des éléments depuis les quatre éléments de départ.
 * Code de sortie 1 si une vérification échoue.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expandRegistre } from '../src/fusion/registry-format.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DEPART = ['feu', 'eau', 'terre', 'vent'];

function pairKey(a, b, ordered = false) {
  return ordered ? `${a}>${b}` : (a <= b ? `${a}|${b}` : `${b}|${a}`);
}

const erreurs = [];
const avertissements = [];

async function main() {
  const brut = JSON.parse(await readFile(join(ROOT, 'data', 'registre-fusions.json'), 'utf8'));
  const reg = expandRegistre(brut);
  const elements = reg.elements || {};
  const recipes = reg.recipes || [];

  const ids = new Set();
  const paires = new Set();

  for (const r of recipes) {
    if (!r.id) erreurs.push(`Recette sans identifiant : ${JSON.stringify(r)}`);
    else if (ids.has(r.id)) erreurs.push(`Identifiant dupliqué : ${r.id}`);
    ids.add(r.id);

    const key = pairKey(r.a, r.b, r.ordered === true);
    if (paires.has(key)) erreurs.push(`Paire dupliquée : ${key} (${r.id})`);
    paires.add(key);

    if (!elements[r.a]) erreurs.push(`Ingrédient inconnu « ${r.a} » dans ${r.id}`);
    if (!elements[r.b]) erreurs.push(`Ingrédient inconnu « ${r.b} » dans ${r.id}`);
    if (!r.result) erreurs.push(`Résultat vide dans ${r.id}`);
    if (r.result && !elements[r.result]) erreurs.push(`Résultat inconnu « ${r.result} » dans ${r.id}`);

    if (r.result && elements[r.result]) {
      const m = elements[r.result];
      if (r.categorie !== m.categorie) erreurs.push(`Catégorie incohérente dans ${r.id} : ${r.categorie} != ${m.categorie}`);
      if (r.rarete !== m.rarete) erreurs.push(`Rareté incohérente dans ${r.id} : ${r.rarete} != ${m.rarete}`);
    }

    if (r.a === r.b) avertissements.push(`${r.id} combine un élément avec lui-même (autorisé mais à vérifier).`);
  }

  // Éléments de départ obligatoires
  for (const d of DEPART) if (!elements[d]) erreurs.push(`Élément de départ manquant : ${d}`);

  // Accessibilité : tout élément doit être atteignable depuis les 4 éléments de départ
  const recettesParResultat = new Map();
  for (const r of recipes) {
    if (r.source !== 'officiel') continue;
    if (!recettesParResultat.has(r.result)) recettesParResultat.set(r.result, []);
    recettesParResultat.get(r.result).push(r);
  }

  const atteignables = new Set(DEPART);
  let progres = true;
  while (progres) {
    progres = false;
    for (const r of recipes) {
      if (r.source !== 'officiel') continue;
      if (atteignables.has(r.result)) continue;
      if (atteignables.has(r.a) && atteignables.has(r.b)) {
        atteignables.add(r.result);
        progres = true;
      }
    }
  }

  const inaccessibles = Object.keys(elements).filter((id) => !atteignables.has(id));
  if (inaccessibles.length) {
    avertissements.push(`${inaccessibles.length} élément(s) non atteignables depuis les 4 éléments de départ : ${inaccessibles.join(', ')}`);
  }

  const officielles = recipes.filter((r) => r.source === 'officiel').length;
  console.log(`Éléments : ${Object.keys(elements).length}`);
  console.log(`Recettes officielles : ${officielles}`);
  console.log(`Recettes candidates : ${recipes.length - officielles}`);
  console.log(`Éléments atteignables : ${atteignables.size} / ${Object.keys(elements).length}`);

  if (avertissements.length) {
    console.log('\nAvertissements :');
    for (const a of avertissements) console.log('  - ' + a);
  }
  if (erreurs.length) {
    console.error('\nÉCHEC — erreurs :');
    for (const e of erreurs) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('\nRegistre valide.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
