import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { expandRegistre } from '../src/fusion/registry-format.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function lire(chemin) {
  return JSON.parse(await readFile(join(ROOT, chemin), 'utf8'));
}

/** Le registre est stocké en format compact : on le développe pour les vérifications. */
async function lireRegistre() {
  return expandRegistre(await lire('data/registre-fusions.json'));
}

const DEPART = ['feu', 'eau', 'terre', 'vent'];

test('le registre officiel existe et expose ses métadonnées', async () => {
  const reg = await lireRegistre();
  assert.ok(reg.meta?.version >= 1);
  assert.ok(reg.manifest);
  assert.ok(Object.keys(reg.elements).length > 0);
});

test('les quatre éléments de départ sont exactement Feu, Eau, Terre et Vent', async () => {
  const reg = await lireRegistre();
  const noms = DEPART.map((id) => reg.elements[id]?.nom);
  assert.deepEqual(noms, ['Feu', 'Eau', 'Terre', 'Vent']);
});

test('aucune paire d\'ingrédients n\'est dupliquée dans le registre', async () => {
  const reg = await lireRegistre();
  const vues = new Set();
  for (const r of reg.recipes) {
    const key = r.a <= r.b ? `${r.a}|${r.b}` : `${r.b}|${r.a}`;
    assert.ok(!vues.has(key), `paire dupliquée : ${key}`);
    vues.add(key);
  }
});

test('chaque identifiant de recette est unique et stable', async () => {
  const reg = await lireRegistre();
  const ids = new Set();
  for (const r of reg.recipes) {
    assert.ok(r.id && !ids.has(r.id), `identifiant dupliqué ou vide : ${r.id}`);
    ids.add(r.id);
  }
});

test('tous les ingrédients et résultats existent', async () => {
  const reg = await lireRegistre();
  for (const r of reg.recipes) {
    assert.ok(reg.elements[r.a], `ingrédient inconnu ${r.a}`);
    assert.ok(reg.elements[r.b], `ingrédient inconnu ${r.b}`);
    assert.ok(reg.elements[r.result], `résultat inconnu ${r.result}`);
  }
});

test('la catégorie et la rareté d\'une recette proviennent de son résultat', async () => {
  const reg = await lireRegistre();
  for (const r of reg.recipes) {
    const m = reg.elements[r.result];
    assert.equal(r.categorie, m.categorie, `catégorie incohérente pour ${r.id}`);
    assert.equal(r.rarete, m.rarete, `rareté incohérente pour ${r.id}`);
  }
});

test('les mondes et collections référencent des éléments existants', async () => {
  const reg = await lireRegistre();
  const collections = (await lire('data/collections.json')).collections;
  for (const c of collections) {
    for (const id of c.elements) assert.ok(reg.elements[id], `collection ${c.id} : élément inconnu ${id}`);
  }
  const mondes = (await lire('data/mondes.json')).mondes;
  for (const m of mondes) assert.ok(m.id && m.nom, 'monde incomplet');
});

test('chaque élément du catalogue est atteignable depuis les quatre éléments de départ', async () => {
  const reg = await lireRegistre();
  const atteignables = new Set(DEPART);
  let progres = true;
  while (progres) {
    progres = false;
    for (const r of reg.recipes) {
      if (r.source !== 'officiel') continue;
      if (atteignables.has(r.result)) continue;
      if (atteignables.has(r.a) && atteignables.has(r.b)) { atteignables.add(r.result); progres = true; }
    }
  }
  const inaccessibles = Object.keys(reg.elements).filter((id) => !atteignables.has(id));
  assert.deepEqual(inaccessibles, [], `éléments inaccessibles : ${inaccessibles.join(', ')}`);
});

test('les quêtes référencent des types connus et des cibles valides', async () => {
  const reg = await lireRegistre();
  const q = await lire('data/quests.json');
  const types = new Set(['decouvrir', 'fusions', 'categorie', 'rarete', 'monde', 'familiers', 'niveau', 'collection']);
  const toutes = [...(q.quotidiennes || []), ...(q.hebdomadaires || [])];
  for (const quete of toutes) {
    assert.ok(types.has(quete.type), `type de quête inconnu : ${quete.type}`);
    assert.ok(Number.isFinite(quete.objectif) && quete.objectif > 0);
    if (quete.type === 'monde') assert.ok(['libre', 'nature', 'culture', 'technologie', 'cuisine', 'espace', 'fantastique', 'tendances'].includes(quete.cible));
  }
  for (const s of q.scenarios || []) {
    for (const e of s.etapes || []) {
      if (e.condition?.type === 'element') assert.ok(reg.elements[e.condition.cible], `scénario ${s.id} : élément inconnu ${e.condition.cible}`);
    }
  }
});

test('les dix familiers demandés sont définis avec compétences et rareté', async () => {
  const pets = (await lire('data/pets.json')).pets;
  const attendus = ['flammichou', 'aquabulle', 'terrapousse', 'ventolino', 'pixelou', 'lumifee', 'dragoforge', 'nebulapin', 'robochat', 'glitchou'];
  const ids = pets.map((p) => p.id);
  for (const id of attendus) assert.ok(ids.includes(id), `familier manquant : ${id}`);
  for (const p of pets) {
    assert.ok(p.nom && p.emoji && p.rarete && p.description, `familier incomplet : ${p.id}`);
    assert.ok(Array.isArray(p.competences) && p.competences.length > 0, `familier sans compétence : ${p.id}`);
  }
});

test('le compteur du manifeste correspond aux données réelles', async () => {
  const reg = await lireRegistre();
  assert.equal(reg.manifest.recettes, reg.recipes.length);
  assert.equal(reg.manifest.elements, Object.keys(reg.elements).length);
  const officielles = reg.recipes.filter((r) => r.source === 'officiel').length;
  assert.equal(reg.manifest.recettesOfficielles, officielles);
});
