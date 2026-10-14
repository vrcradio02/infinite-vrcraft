import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nouveauFamilier, gagnerXpFamilier, niveauFamilier, xpFamilerPourNiveau, peutRejoindreEquipe, indexerFamiliers } from '../src/pets/pets.js';
import { QuotaAides, executerAide, TYPES_AIDE, indiceFusion, analyseFusion, indiceExploration } from '../src/pets/help.js';
import { RecipeStore } from '../src/fusion/store.js';
import { validerProposition, nettoyerTexte } from '../src/ai/validate-proposal.js';
import { QUOTA, EQUIPE_MAX } from '../src/config.js';

/* ---------- Polyfills minimalistes pour les tests hors navigateur ---------- */
const memoire = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: (k) => memoire.delete(k),
  clear: () => memoire.clear(),
};

function storeDeTest() {
  const store = new RecipeStore();
  store.ajouterElements({
    feu: { nom: 'Feu', categorie: 'Énergie', rarete: 'Commun', monde: 'libre', emoji: '🔥' },
    eau: { nom: 'Eau', categorie: 'Matière', rarete: 'Commun', monde: 'libre', emoji: '💧' },
    vapeur: { nom: 'Vapeur', categorie: 'Météo', rarete: 'Commun', monde: 'nature', emoji: '♨️' },
    glace: { nom: 'Glace', categorie: 'Matière', rarete: 'Commun', monde: 'nature', emoji: '🧊' },
    nuage: { nom: 'Nuage', categorie: 'Météo', rarete: 'Commun', monde: 'nature', emoji: '☁️' },
  });
  store.ajouterRecettes([
    { id: 'r1', a: 'feu', b: 'eau', result: 'vapeur' },
    { id: 'r2', a: 'vapeur', b: 'eau', result: 'nuage' },
    { id: 'r3', a: 'eau', b: 'vent', result: 'glace' },
  ]);
  return store;
}

test('un familier démarre au niveau 1 avec 0 XP', () => {
  const f = nouveauFamilier('flammichou');
  assert.equal(f.niveau, 1);
  assert.equal(f.xp, 0);
  assert.equal(f.equipe, false);
});

test('gagnerXpFamilier détecte les montées de niveau', () => {
  const f = nouveauFamilier('aquabulle');
  const requis = xpFamilerPourNiveau(1);
  const r = gagnerXpFamilier(f, requis);
  assert.equal(r.etat.niveau, 2);
  assert.equal(r.niveaux, 1);
});

test('niveauFamilier est cohérent avec la courbe', () => {
  assert.equal(niveauFamilier(0).niveau, 1);
  const lvl3 = xpFamilerPourNiveau(1) + xpFamilerPourNiveau(2);
  assert.equal(niveauFamilier(lvl3).niveau, 3);
});

test('l\'équipe est limitée à 3 familiers', () => {
  assert.equal(peutRejoindreEquipe([]), true);
  assert.equal(peutRejoindreEquipe(['a', 'b']), true);
  assert.equal(peutRejoindreEquipe(['a', 'b', 'c']), false);
  assert.equal(EQUIPE_MAX, 3);
});

test('indexerFamiliers construit un index par identifiant', () => {
  const idx = indexerFamiliers([{ id: 'a' }, { id: 'b' }]);
  assert.equal(idx.get('a').id, 'a');
  assert.equal(idx.size, 2);
});

/* ---------------- Quota d'aides ---------------- */

test('le quota démarre à 5 aides', () => {
  const clock = () => 1000;
  const q = new QuotaAides(0, clock);
  assert.equal(q.disponibles(), QUOTA.max);
  assert.equal(QUOTA.max, 5);
});

test('consommer retire une aide et refuse au-delà de 5', () => {
  const q = new QuotaAides(0, () => 1000);
  for (let i = 0; i < 5; i++) assert.equal(q.consommer(), true);
  assert.equal(q.disponibles(), 0);
  assert.equal(q.consommer(), false);
});

test('le quota est partagé : changer de familier ne le réinitialise pas', () => {
  const q = new QuotaAides(0, () => 1000);
  q.consommer();
  q.consommer();
  // Simuler « changer de familier » : le même objet quota reste utilisé par le jeu.
  assert.equal(q.disponibles(), QUOTA.max - 2);
});

test('la recharge intervient après 10 minutes', () => {
  let t = 0;
  const q = new QuotaAides(0, () => t);
  for (let i = 0; i < 5; i++) q.consommer();
  t = QUOTA.fenetreMs - 1;
  assert.equal(q.disponibles(), 0);
  t = QUOTA.fenetreMs + 1;
  assert.equal(q.disponibles(), QUOTA.max);
  assert.equal(QUOTA.fenetreMs, 10 * 60 * 1000);
});

test('une potion recharge complètement un quota entamé (3/5 devient 5/5)', () => {
  const q = new QuotaAides(0, () => 0);
  q.consommer();
  q.consommer();
  assert.equal(q.disponibles(), 3);
  const r = q.rechargerComplet();
  assert.equal(r.restant, QUOTA.max);
  assert.equal(r.bonus, false);
  assert.equal(q.disponibles(), QUOTA.max);
});

test('une potion sur un quota plein donne 10/5, puis retour à 5/5 après 10 minutes', () => {
  let t = 0;
  const q = new QuotaAides(0, () => t);
  const r = q.rechargerComplet();
  assert.equal(r.restant, QUOTA.max + QUOTA.bonusMax, 'quota plein : la potion donne un bonus');
  assert.equal(r.bonus, true);
  assert.equal(q.disponibles(), 10);
  assert.equal(q.tempsRestant(), 0);
  // La fenêtre de 10 minutes écoulée ramène à 5/5 (et non à 10/5).
  t = QUOTA.fenetreMs + 1;
  assert.equal(q.disponibles(), QUOTA.max);
});

test('le bonus de potion survit à un rechargement de page', () => {
  memoire.clear();
  const q = new QuotaAides(2, () => 0);
  q.rechargerComplet();
  q.rechargerComplet();
  assert.equal(q.disponibles(), QUOTA.max + QUOTA.bonusMax);
  q.persister();
  const q2 = new QuotaAides(2, () => 0);
  q2.restaurer(null);
  assert.equal(q2.disponibles(), QUOTA.max + QUOTA.bonusMax, 'un rechargement ne doit pas écraser le bonus');
});

test('le temps restant est borné et nul quand le quota est plein', () => {
  let t = 0;
  const q = new QuotaAides(0, () => t);
  assert.equal(q.tempsRestant(), 0);
  q.consommer();
  assert.ok(q.tempsRestant() > 0 && q.tempsRestant() <= QUOTA.fenetreMs);
});

test('le quota persiste entre deux instances (rechargement de page)', () => {
  memoire.clear();
  let t = 0;
  const q1 = new QuotaAides(1, () => t);
  q1.restaurer(null);
  q1.consommer();
  q1.consommer();
  q1.persister();
  const q2 = new QuotaAides(1, () => t);
  q2.restaurer(null);
  assert.equal(q2.disponibles(), QUOTA.max - 2, 'un rechargement ne doit pas redonner 5 aides');
});

test('restaurer retient l\'état le plus restrictif', () => {
  memoire.clear();
  const q = new QuotaAides(2, () => 0);
  q.restaurer({ restant: 5, debutFenetre: 0 });
  memoire.set('icu:quota:2', JSON.stringify({ restant: 1, debutFenetre: 0 }));
  const q2 = new QuotaAides(2, () => 0);
  q2.restaurer({ restant: 5, debutFenetre: 0 });
  assert.equal(q2.disponibles(), 1);
});

/* ---------------- Générateurs d'aide ---------------- */

test('indiceFusion retourne une piste utile quand une recette est accessible', () => {
  const store = storeDeTest();
  const decouverts = new Set(['feu', 'eau']);
  const r = indiceFusion({ store, decouverts, jetons: 'x' });
  assert.equal(r.utile, true);
  assert.match(r.texte, /combiner/i);
});

test('indiceFusion ne consomme rien s\'il n\'y a aucune piste', () => {
  const store = storeDeTest();
  const decouverts = new Set(['feu', 'eau', 'vapeur', 'glace', 'nuage']);
  const r = indiceFusion({ store, decouverts, jetons: 'x' });
  assert.equal(r.utile, false);
});

test('analyseFusion explique une recette connue', () => {
  const store = storeDeTest();
  const r = analyseFusion({ store, elementId: 'vapeur' });
  assert.equal(r.utile, true);
  assert.match(r.texte, /Feu/);
});

test('indiceExploration cible la zone la moins explorée', () => {
  const store = storeDeTest();
  const r = indiceExploration({ store, decouverts: new Set(['feu', 'eau']), mondesDebloques: { libre: true, nature: true } });
  assert.equal(r.utile, true);
  assert.ok(r.texte.length > 0);
});

test('executerAide gère un type inconnu sans planter', () => {
  const r = executerAide('inexistant', {});
  assert.equal(r.utile, false);
});

test('les cinq types d\'aide demandés sont présents', () => {
  const ids = TYPES_AIDE.map((t) => t.id);
  assert.deepEqual(ids.sort(), ['aide_quete', 'analyse_fusion', 'indice_exploration', 'indice_fusion', 'suggestion_recette'].sort());
});

/* ---------------- Validation des propositions IA ---------------- */

test('une proposition IA valide est acceptée', () => {
  const r = validerProposition({ resultat: { nom: 'Aquaphénix', categorie: 'Fantastique', rarete: 'Rare' } }, { a: 'eau', b: 'phenix' });
  assert.equal(r.ok, true);
  assert.equal(r.proposition.nom, 'Aquaphénix');
  assert.equal(r.proposition.experimental, true);
});

test('un résultat vide est refusé', () => {
  assert.equal(validerProposition({ resultat: { nom: '' } }, { a: 'a', b: 'b' }).ok, false);
});

test('des ingrédients qui ne correspondent pas à la demande sont refusés', () => {
  const r = validerProposition({ resultat: { nom: 'X', a: 'or', b: 'argent' } }, { a: 'eau', b: 'feu' });
  assert.equal(r.ok, false);
});

test('une réponse non objet est refusée', () => {
  assert.equal(validerProposition(null, { a: 'a', b: 'b' }).ok, false);
  assert.equal(validerProposition('texte', { a: 'a', b: 'b' }).ok, false);
});

test('nettoyerTexte supprime les caractères de contrôle et borne la taille', () => {
  const s = nettoyerTexte('a\u0000b\u001fc', 10);
  assert.equal(s.includes('\u0000'), false);
  assert.equal(nettoyerTexte('x'.repeat(500), 20).length, 20);
});
