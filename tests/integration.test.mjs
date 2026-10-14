/**
 * Test d'intégration : exécute le VRAI contrôleur de jeu (celui qu'utilise l'interface)
 * dans Node, avec un shim de fetch qui lit les fichiers du dépôt et un localStorage mémoire.
 * Cela vérifie le parcours réel : chargement du catalogue, création de partie, fusion,
 * découverte, XP, aides des familiers, quota, export/import.
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ----- Polyfills navigateur minimaux (uniquement ce que le contrôleur utilise) ----- */
const memoire = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: (k) => memoire.delete(k),
  clear: () => memoire.clear(),
};

function fetchLocal(url) {
  const chemin = join(ROOT, String(url).replace(/^\.\//, ''));
  return readFile(chemin, 'utf8').then((texte) => ({
    ok: true,
    status: 200,
    async json() { return JSON.parse(texte); },
    async text() { return texte; },
  })).catch(() => ({ ok: false, status: 404, async json() { throw new Error(`404 ${url}`); }, async text() { return ''; } }));
}

/** Shim identique mais qui renvoie 404 sur le registre compilé (artefact de build absent). */
function fetchSansRegistre(url) {
  if (String(url).includes('registre-fusions.json')) {
    return Promise.resolve({ ok: false, status: 404, async json() { throw new Error('404 registre'); }, async text() { return ''; } });
  }
  return fetchLocal(url);
}

const { Jeu } = await import('../src/game/game.js');
const { STATUT } = await import('../src/fusion/engine.js');
const { ELEMENTS_DE_DEPART } = await import('../src/config.js');

let jeu;

before(async () => {
  memoire.clear();
  jeu = new Jeu({ fetchImpl: fetchLocal });
  await jeu.initialiser();
});

test('le catalogue réel est chargé depuis les fichiers du dépôt', () => {
  assert.ok(jeu.store.nombreRecettes > 0, 'aucune recette chargée');
  assert.ok(jeu.store.nombreElements > 0);
  for (const id of ELEMENTS_DE_DEPART) assert.ok(jeu.store.elements.has(id), `élément de départ manquant : ${id}`);
  assert.ok(jeu.pets.length >= 10);
  assert.ok(jeu.mondes.length >= 6);
  assert.ok(jeu.collections.length >= 4);
});

test('une nouvelle partie commence exactement avec Feu, Eau, Terre et Vent', async () => {
  await jeu.creer(0, 'Testeur', '🧪');
  assert.deepEqual(Object.keys(jeu.save.decouvertes).sort(), [...ELEMENTS_DE_DEPART].sort());
  assert.equal(jeu.save.niveau, 1);
  assert.equal(jeu.save.xp, 0);
});

test('un familier de départ est attribué et équipé', () => {
  assert.ok(jeu.save.familiers.flammichou, 'Flammichou doit être accordé au départ');
  assert.ok(jeu.save.equipe.includes('flammichou'));
});

test('fusionner Feu + Eau donne Vapeur (nouvelle découverte)', async () => {
  const r = await jeu.fusionner('feu', 'eau');
  assert.equal(r.ok, true);
  assert.equal(r.statut, STATUT.NOUVEAU);
  assert.equal(r.resultat.id, 'vapeur');
  assert.equal(r.resultat.nom, 'Vapeur');
  assert.ok(jeu.save.decouvertes.vapeur, 'la découverte doit être enregistrée');
  assert.ok(jeu.save.stats.decouvertes >= 5);
  assert.ok(jeu.save.historique.length >= 1);
});

test('refusionner la même paire donne le statut « connu »', async () => {
  const r = await jeu.fusionner('eau', 'feu');
  assert.equal(r.statut, STATUT.CONNU);
  assert.equal(r.resultat.id, 'vapeur');
});

test('chaîner une recette dérivée fonctionne (Vapeur + Vent = Nuage)', async () => {
  const r = await jeu.fusionner('vapeur', 'vent');
  assert.equal(r.ok, true);
  assert.equal(r.resultat.id, 'nuage');
});

test('une paire inconnue échoue proprement en mode catalogue', async () => {
  const avant = jeu.save.stats.fusionsTentees;
  const r = await jeu.fusionner('vent', 'vent'); // connue en réalité => on prend une paire absente
  void r;
  const r2 = await jeu.fusionner('graal', 'oeuf-vrc');
  assert.equal(r2.ok, false);
  assert.equal(r2.statut, STATUT.INCONNU);
  assert.ok(jeu.save.stats.fusionsTentees > avant);
});

test('le mode créativité produit une création expérimentale non officielle', async () => {
  const r = await jeu.fusionner('graal', 'oeuf-vrc', { mode: 'creativite' });
  assert.equal(r.ok, true);
  assert.equal(r.statut, STATUT.EXPERIMENTAL);
  assert.ok(jeu.save.experimental['graal|oeuf-vrc']);
  assert.ok(!jeu.save.decouvertes[r.resultat.id], 'une création expérimentale ne doit pas devenir une découverte officielle');
});

test('l\'XP et la progression augmentent après des découvertes', () => {
  assert.ok(jeu.save.xp > 0);
  const st = jeu.statistiques();
  assert.ok(st.niveau >= 1);
  assert.ok(st.decouvertes >= 5);
  assert.equal(typeof st.titre, 'string');
});

test('une aide de familier consomme le quota partagé', () => {
  const avant = jeu.etatQuota().restant;
  const r = jeu.utiliserAide('indice_fusion', { familierId: 'flammichou' });
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.consomme, true);
  assert.equal(jeu.etatQuota().restant, avant - 1);
  assert.match(r.texte, /combiner/i);
});

test('le quota ne dépasse jamais 5 aides et bloque ensuite', () => {
  // Flammichou maîtrise « indice_fusion » dès le niveau 1.
  let dernier;
  for (let i = 0; i < 10; i++) dernier = jeu.utiliserAide('indice_fusion', { familierId: 'flammichou' });
  assert.equal(jeu.etatQuota().restant, 0);
  assert.equal(dernier.ok, false);
  assert.match(dernier.erreur, /Quota/i);
  assert.equal(jeu.save.stats.aidesUtilisees, 5, 'exactement 5 aides consommées au total');
});

test('une aide non connue du familier est refusée sans consommer', () => {
  const avant = jeu.etatQuota().restant;
  const r = jeu.utiliserAide('aide_quete', { familierId: 'flammichou' });
  assert.equal(r.ok, false);
  assert.match(r.erreur, /ne connaît pas encore/);
  assert.equal(jeu.etatQuota().restant, avant);
});

test('un familier non équipé ne peut pas être utilisé pour aider', () => {
  const r = jeu.utiliserAide('indice_fusion', { familierId: 'aquabulle' });
  assert.equal(r.ok, false);
});

test('les quêtes quotidiennes et hebdomadaires sont générées', () => {
  assert.equal(jeu.save.quetes.quotidiennes.length, 3);
  assert.equal(jeu.save.quetes.hebdomadaires.length, 2);
  assert.equal(jeu.save.quetes.scenarisees.length, 3);
});

test('le quota persiste après sauvegarde puis rechargement (pas de remise à 5)', async () => {
  const avant = jeu.etatQuota().restant;
  await jeu.sauvegarder();
  const jeu2 = new Jeu({ fetchImpl: fetchLocal });
  await jeu2.initialiser();
  await jeu2.charger(0);
  assert.equal(jeu2.etatQuota().restant, avant, 'un rechargement ne doit pas redonner des aides');
});

test('export puis import dans un autre emplacement conserve la progression', async () => {
  const texte = await jeu.saves.exporterTexte(0);
  const res = await jeu.saves.importer(1, texte);
  assert.equal(res.ok, true, res.erreur);
  const data = await jeu.saves.charger(1);
  assert.equal(data.nom, 'Testeur');
  assert.ok(data.decouvertes.vapeur, 'la découverte doit survivre à l\'import');
  assert.equal(data.stats.fusionsTentees, jeu.save.stats.fusionsTentees);
});

test('un import de fichier corrompu est refusé sans écraser la sauvegarde', async () => {
  const avant = await jeu.saves.lister();
  const res = await jeu.saves.importer(1, '{"formatVersion": 1, "nom": ""}');
  assert.equal(res.ok, false);
  const apres = await jeu.saves.lister();
  assert.deepEqual(apres.map((s) => s.existe), avant.map((s) => s.existe));
});

test('les trois emplacements sont indépendants', async () => {
  await jeu.creer(2, 'Autre', '🔥');
  const slots = await jeu.saves.lister();
  assert.equal(slots.length, 3);
  assert.equal(slots[0].nom, 'Testeur');
  assert.equal(slots[2].nom, 'Autre');
  assert.notEqual(slots[0].decouvertes, slots[2].decouvertes);
});

test('les mondes se débloquent selon la progression', async () => {
  await jeu.charger(1);
  const etats = jeu.etatMondes();
  assert.ok(etats.find((m) => m.id === 'libre')?.debloque, 'le monde de départ doit être débloqué');
  assert.ok(etats.some((m) => m.debloque));
});

test('le jeu reste complet sans registre compilé (chargement depuis les sources)', async () => {
  const jeuSources = new Jeu({ fetchImpl: fetchSansRegistre });
  await jeuSources.initialiser();
  assert.equal(jeuSources.store.nombreRecettes, jeu.store.nombreRecettes, 'le repli doit produire le même catalogue');
  assert.equal(jeuSources.store.nombreElements, jeu.store.nombreElements);
  await jeuSources.creer(0, 'Sources', '🧪');
  const r = await jeuSources.fusionner('feu', 'eau');
  assert.equal(r.resultat.id, 'vapeur');
});

test('les statistiques exposent les recettes officielles et expérimentales séparément', () => {
  const st = jeu.statistiques();
  assert.ok(st.recettesOfficielles > 0);
  assert.ok(st.recettesExperimentales >= 0);
  assert.notEqual(st.recettesOfficielles, st.recettesExperimentales);
});
