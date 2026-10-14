import { test } from 'node:test';
import assert from 'node:assert/strict';

import { RecipeStore } from '../src/fusion/store.js';
import { FusionEngine, STATUT } from '../src/fusion/engine.js';
import { pairKey, slugify } from '../src/fusion/normalize.js';

function storeDeTest() {
  const store = new RecipeStore();
  store.ajouterElements({
    feu: { nom: 'Feu', categorie: 'Énergie', rarete: 'Commun', monde: 'libre', emoji: '🔥' },
    eau: { nom: 'Eau', categorie: 'Matière', rarete: 'Commun', monde: 'libre', emoji: '💧' },
    vapeur: { nom: 'Vapeur', categorie: 'Météo', rarete: 'Commun', monde: 'nature', emoji: '♨️' },
    glace: { nom: 'Glace', categorie: 'Matière', rarete: 'Commun', monde: 'nature', emoji: '🧊' },
  });
  store.ajouterRecettes([
    { id: 'r-feu-eau', a: 'feu', b: 'eau', result: 'vapeur', categorie: 'Météo', rarete: 'Commun', ordered: false },
    { id: 'r-eau-glace', a: 'eau', b: 'glace', result: 'glace', categorie: 'Matière', rarete: 'Commun', ordered: false },
  ]);
  return store;
}

test('slugify produit un identifiant stable sans accent', () => {
  assert.equal(slugify('Feu de camp'), 'feu-de-camp');
  assert.equal(slugify('Éléphant'), 'elephant');
  assert.equal(slugify('  A  B  '), 'a-b');
});

test('pairKey est symétrique par défaut', () => {
  assert.equal(pairKey('feu', 'eau'), pairKey('eau', 'feu'));
  assert.equal(pairKey('feu', 'eau'), 'eau|feu');
});

test('pairKey est asymétrique quand ordered=true', () => {
  assert.equal(pairKey('a', 'b', true), 'a>b');
  assert.notEqual(pairKey('a', 'b', true), pairKey('b', 'a', true));
});

test('une recette est trouvée quel que soit l\'ordre des ingrédients', () => {
  const engine = new FusionEngine(storeDeTest());
  const r1 = engine.resoudre({ a: 'feu', b: 'eau' });
  const r2 = engine.resoudre({ a: 'eau', b: 'feu' });
  assert.equal(r1.statut, STATUT.NOUVEAU);
  assert.equal(r2.statut, STATUT.NOUVEAU);
  assert.equal(r1.resultat.id, 'vapeur');
  assert.equal(r2.resultat.id, 'vapeur');
});

test('un résultat déjà découvert a le statut « connu »', () => {
  const engine = new FusionEngine(storeDeTest());
  const r = engine.resoudre({ a: 'feu', b: 'eau', dejaDecouvert: (id) => id === 'vapeur' });
  assert.equal(r.statut, STATUT.CONNU);
});

test('une paire absente renvoie « inconnu » en mode catalogue', () => {
  const engine = new FusionEngine(storeDeTest());
  const r = engine.resoudre({ a: 'feu', b: 'glace', mode: 'catalogue' });
  assert.equal(r.statut, STATUT.INCONNU);
  assert.equal(r.resultat, null);
  assert.ok(r.raison.length > 0);
});

test('le mode créativité produit un résultat expérimental', () => {
  const engine = new FusionEngine(storeDeTest());
  const r = engine.resoudre({ a: 'feu', b: 'glace', mode: 'creativite' });
  assert.equal(r.statut, STATUT.EXPERIMENTAL);
  assert.equal(r.resultat.experimental, true);
  assert.ok(r.resultat.nom.length > 1);
});

test('la composition expérimentale est déterministe (même entrée => même sortie)', () => {
  const store = storeDeTest();
  const engine = new FusionEngine(store);
  const a = engine.resoudre({ a: 'feu', b: 'glace', mode: 'creativite' }).resultat;
  const b = engine.resoudre({ a: 'glace', b: 'feu', mode: 'creativite' }).resultat;
  assert.equal(a.nom, b.nom, 'A + B et B + A doivent donner le même résultat expérimental');
  assert.equal(a.id, b.id);
});

test('un ingrédient inconnu est refusé proprement', () => {
  const engine = new FusionEngine(storeDeTest());
  const r = engine.resoudre({ a: 'licorne', b: 'eau' });
  assert.equal(r.statut, STATUT.INCONNU);
  assert.match(r.raison, /inconnu/i);
});

test('les doublons de paire sont ignorés par le magasin', () => {
  const store = storeDeTest();
  const ajoutees = store.ajouterRecettes([{ id: 'doublon', a: 'eau', b: 'feu', result: 'autre' }]);
  assert.equal(ajoutees, 0);
  assert.equal(store.nombreRecettes, 2);
  assert.equal(store.trouver('feu', 'eau').result, 'vapeur');
});
