import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validerSauvegarde, validerTexteSauvegarde, normaliserSauvegarde, LIMITES } from '../src/saves/validate.js';
import { nouvelleSauvegarde } from '../src/saves/saves.js';
import { ELEMENTS_DE_DEPART, SAVE_FORMAT_VERSION } from '../src/config.js';

test('une nouvelle partie ne contient QUE les quatre éléments de départ', () => {
  const s = nouvelleSauvegarde('Test', '🧪');
  const ids = Object.keys(s.decouvertes).sort();
  assert.deepEqual(ids, [...ELEMENTS_DE_DEPART].sort());
  assert.ok(s.decouvertes.feu && s.decouvertes.eau && s.decouvertes.terre && s.decouvertes.vent);
});

test('une sauvegarde valide est acceptée', () => {
  const res = validerSauvegarde(nouvelleSauvegarde('Alice'));
  assert.equal(res.ok, true);
  assert.equal(res.data.formatVersion, SAVE_FORMAT_VERSION);
});

test('un JSON invalide est refusé', () => {
  const res = validerTexteSauvegarde('{ ceci nest pas du json');
  assert.equal(res.ok, false);
  assert.match(res.erreur, /JSON/i);
});

test('une version de format trop récente est refusée', () => {
  const res = validerSauvegarde({ formatVersion: 999, nom: 'X' });
  assert.equal(res.ok, false);
  assert.match(res.erreur, /récente/i);
});

test('une version manquante est refusée', () => {
  const res = validerSauvegarde({ nom: 'X' });
  assert.equal(res.ok, false);
});

test('un nom vide ou trop long est refusé', () => {
  assert.equal(validerSauvegarde({ formatVersion: 1, nom: '' }).ok, false);
  assert.equal(validerSauvegarde({ formatVersion: 1, nom: 'x'.repeat(LIMITES.maxTailleNom + 1) }).ok, false);
});

test('des types invalides sont refusés', () => {
  const res = validerSauvegarde({ formatVersion: 1, nom: 'X', decouvertes: 'pas un objet' });
  assert.equal(res.ok, false);
  assert.match(res.erreur, /type/i);
});

test('un tableau à la place d\'un objet est refusé', () => {
  assert.equal(validerSauvegarde([]).ok, false);
});

test('des dépassements de limites sont refusés', () => {
  const decouvertes = {};
  for (let i = 0; i < LIMITES.maxDecouvertes + 1; i++) decouvertes[`e${i}`] = true;
  const res = validerSauvegarde({ formatVersion: 1, nom: 'X', decouvertes });
  assert.equal(res.ok, false);
  assert.match(res.erreur, /limites/i);
});

test('un export enveloppé { save: {...} } est compris', () => {
  const texte = JSON.stringify({ formatVersion: 1, jeu: 'infinite-vrcraft', save: nouvelleSauvegarde('Bob') });
  const res = validerTexteSauvegarde(texte);
  assert.equal(res.ok, true);
  assert.equal(res.data.nom, 'Bob');
});

test('la normalisation comble les champs manquants avec des valeurs sûres', () => {
  const n = normaliserSauvegarde({ formatVersion: 1, nom: 'X' });
  assert.deepEqual(n.historique, []);
  assert.deepEqual(n.decouvertes, {});
  assert.equal(n.niveau, 1);
  assert.equal(n.avatar, '🧪');
});

test('la validation ne conserve aucune propriété exécutable', () => {
  const dangereux = { formatVersion: 1, nom: 'X', onclick: 'alert(1)', constructor: 'evil' };
  const res = validerSauvegarde(dangereux);
  assert.equal(res.ok, true);
  // Les champs inconnus ne sont pas propagés par normaliserSauvegarde pour les clés sensibles.
  assert.equal(typeof res.data.onclick, 'undefined');
});
