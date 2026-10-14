import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleJour, cleSemaine, tirerQuetes, avancerQuete } from '../src/quests/quests.js';
import { evaluerSucces, SUCCES } from '../src/quests/achievements.js';
import { mondeDebloque, descriptionCondition } from '../src/game/mondes.js';
import { etatCollections, collectionsNouvelles } from '../src/game/collections.js';
import { progression, niveauPourXp, titrePourNiveau, xpCumulePourNiveau, xpPourRarete } from '../src/game/progression.js';

test('cleJour est stable dans la journée', () => {
  const d = new Date(2026, 4, 3, 10, 0, 0);
  const d2 = new Date(2026, 4, 3, 23, 59, 0);
  assert.equal(cleJour(d), cleJour(d2));
  assert.match(cleJour(d), /^\d{4}-\d{2}-\d{2}$/);
});

test('cleSemaine change d\'une semaine à l\'autre', () => {
  const a = cleSemaine(new Date(2026, 0, 5));
  const b = cleSemaine(new Date(2026, 0, 12));
  assert.notEqual(a, b);
  assert.match(a, /^\d{4}-S\d{2}$/);
});

test('le tirage de quêtes est déterministe pour une même graine', () => {
  const defs = Array.from({ length: 10 }, (_, i) => ({ id: `q${i}`, nom: `Q${i}`, type: 'decouvrir', objectif: 1 }));
  const a = tirerQuetes(defs, 3, 'jour:2026-01-01');
  const b = tirerQuetes(defs, 3, 'jour:2026-01-01');
  assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
  assert.equal(a.length, 3);
  assert.ok(a.every((q) => q.progression === 0 && q.terminee === false));
});

test('avancerQuete incrémente selon le type et borne à l\'objectif', () => {
  const q = { type: 'decouvrir', objectif: 3, progression: 0, terminee: false };
  assert.equal(avancerQuete(q, { type: 'decouverte' }), 1);
  assert.equal(avancerQuete({ ...q, progression: 3 }, { type: 'decouverte' }), 3);
  assert.equal(avancerQuete(q, { type: 'fusion', reussie: false }), 0);
});

test('avancerQuete filtre par catégorie', () => {
  const q = { type: 'categorie', cible: 'Nature', objectif: 2, progression: 0 };
  assert.equal(avancerQuete(q, { type: 'decouverte', categorie: 'Technologie' }), 0);
  assert.equal(avancerQuete(q, { type: 'decouverte', categorie: 'Nature' }), 1);
});

test('la courbe d\'XP est strictement croissante', () => {
  for (let n = 1; n < 40; n++) {
    assert.ok(xpCumulePourNiveau(n + 1) > xpCumulePourNiveau(n));
  }
  assert.equal(xpCumulePourNiveau(1), 0);
});

test('niveauPourXp et progression sont cohérents', () => {
  assert.equal(niveauPourXp(0), 1);
  const p = progression(200);
  assert.equal(p.niveau, niveauPourXp(200));
  assert.ok(p.ratio >= 0 && p.ratio <= 1);
});

test('les titres progressent avec le niveau', () => {
  assert.equal(titrePourNiveau(1), 'Explorateur');
  assert.equal(titrePourNiveau(10), 'Alchimiste');
  assert.equal(titrePourNiveau(999), 'Gardien de l\'infini');
});

test('l\'XP par rareté est croissante', () => {
  assert.ok(xpPourRarete('Secret') > xpPourRarete('Légendaire'));
  assert.ok(xpPourRarete('Légendaire') > xpPourRarete('Commun'));
  assert.equal(xpPourRarete('Inconnue'), 5);
});

test('les succès s\'évaluent sans erreur sur une sauvegarde vide', () => {
  const vide = { stats: {}, niveau: 1, decouvertes: {}, mondes: {}, collections: {}, familiers: {}, succes: {} };
  const nouveaux = evaluerSucces(vide);
  assert.deepEqual(nouveaux, []);
});

test('les succès se débloquent sur les bonnes conditions', () => {
  const s = { stats: { fusionsTentees: 5, decouvertes: 120, quetesTerminees: 0, experimentales: 0 }, niveau: 1, decouvertes: {}, mondes: {}, collections: {}, familiers: {}, succes: {} };
  const ids = evaluerSucces(s).map((x) => x.id);
  assert.ok(ids.includes('premiere-fusion'));
  assert.ok(ids.includes('cent-decouvertes'));
  assert.ok(!ids.includes('niveau-25'));
});

test('un succès déjà obtenu n\'est pas re-signalé', () => {
  const s = { stats: { fusionsTentees: 5, decouvertes: 0, quetesTerminees: 0 }, niveau: 1, decouvertes: {}, mondes: {}, collections: {}, familiers: {}, succes: { 'premiere-fusion': 'oui' } };
  assert.ok(!evaluerSucces(s).map((x) => x.id).includes('premiere-fusion'));
});

test('tous les succès déclarés ont un identifiant unique', () => {
  const ids = SUCCES.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('les conditions de monde se débloquent correctement', () => {
  const monde = { deblocage: { type: 'decouvertes', valeur: 5 } };
  assert.equal(mondeDebloque(monde, { decouvertes: {} }), false);
  assert.equal(mondeDebloque(monde, { decouvertes: { a: 1, b: 1, c: 1, d: 1, e: 1 } }), true);
  assert.equal(mondeDebloque({ deblocage: { type: 'depart' } }, {}), true);
  assert.equal(mondeDebloque({ deblocage: { type: 'niveau', valeur: 5 } }, { niveau: 5 }), true);
  assert.equal(mondeDebloque({ deblocage: { type: 'quetes', valeur: 2 } }, { stats: { quetesTerminees: 1 } }), false);
});

test('la description de condition est lisible', () => {
  assert.match(descriptionCondition({ deblocage: { type: 'decouvertes', valeur: 25 } }), /25/);
  assert.equal(descriptionCondition({ deblocage: { type: 'depart' } }), 'Disponible dès le départ');
});

test('les collections calculent progression et complétion', () => {
  const collections = [{ id: 'c1', nom: 'Test', emoji: '🧪', elements: ['a', 'b', 'c'], recompense: { xp: 10 } }];
  const s = { decouvertes: { a: 1, b: 1 } };
  const etat = etatCollections(collections, s);
  assert.equal(etat[0].possedes.length, 2);
  assert.equal(etat[0].manquants.length, 1);
  assert.equal(etat[0].complete, false);
  assert.deepEqual(collectionsNouvelles(collections, s), []);
  assert.equal(collectionsNouvelles(collections, { decouvertes: { a: 1, b: 1, c: 1 } }).length, 1);
});
