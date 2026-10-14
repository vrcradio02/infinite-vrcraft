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
const { ELEMENTS_DE_DEPART, QUOTA } = await import('../src/config.js');

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

/* ---------------- Créations du mode Créativité ---------------- */

const PAIRE_CREATION = 'graal|oeuf-vrc';
let idCreation;

test('le mode créativité enregistre la création comme élément officiel (première découverte)', async () => {
  const r = await jeu.fusionner('graal', 'oeuf-vrc', { mode: 'creativite' });
  assert.equal(r.ok, true);
  assert.equal(r.creation, true);
  assert.equal(r.statut, STATUT.NOUVEAU, 'une création compte comme une nouvelle découverte');
  idCreation = r.resultat.id;

  // Enregistrée dans la sauvegarde (persistance) et dans l'inventaire.
  assert.ok(jeu.save.creations[PAIRE_CREATION], 'la création doit être persistée');
  assert.ok(jeu.save.decouvertes[idCreation], 'la création doit entrer dans l\'inventaire');
  assert.equal(jeu.save.decouvertes[idCreation].source, 'creation');
  assert.equal(jeu.save.decouvertes[idCreation].premiere, true, 'elle est marquée première découverte');
  // Utilisable immédiatement comme ingrédient et dans l'encyclopédie.
  assert.ok(jeu.store.elements.has(idCreation), 'l\'élément doit exister dans le catalogue');
  assert.equal(jeu.save.historique[0].statut, 'creation');
});

test('une création est reproductible : refusionner la même paire redonne le même élément', async () => {
  const r = await jeu.fusionner('oeuf-vrc', 'graal', { mode: 'creativite' });
  assert.equal(r.ok, true);
  assert.equal(r.statut, STATUT.CONNU, 'la paire est désormais connue');
  assert.equal(r.resultat.id, idCreation, 'A + B et B + A donnent la même création');

  // Elle est aussi reconnue en mode Catalogue, puisqu'elle est devenue officielle.
  const r2 = await jeu.fusionner('graal', 'oeuf-vrc', { mode: 'catalogue' });
  assert.equal(r2.ok, true);
  assert.equal(r2.statut, STATUT.CONNU);
});

test('une création sert d\'ingrédient pour aller plus loin (fusions en chaîne)', async () => {
  const r = await jeu.fusionner(idCreation, 'feu', { mode: 'creativite' });
  assert.equal(r.ok, true);
  assert.equal(r.creation, true);
  assert.notEqual(r.resultat.id, idCreation);
  assert.ok(jeu.save.decouvertes[r.resultat.id]);
});

test('les créations sont rechargées à l\'ouverture de la partie', async () => {
  await jeu.sauvegarder();
  const jeu2 = new Jeu({ fetchImpl: fetchLocal });
  await jeu2.initialiser();
  await jeu2.charger(0);
  assert.ok(jeu2.store.elements.has(idCreation), 'la création doit revenir dans le catalogue');
  assert.ok(jeu2.save.creations[PAIRE_CREATION]);
  const r = await jeu2.fusionner('graal', 'oeuf-vrc');
  assert.equal(r.ok, true);
  assert.equal(r.resultat.id, idCreation);
});

test('les statistiques séparent le catalogue officiel des créations du joueur', () => {
  const st = jeu.statistiques();
  const nbCreations = Object.keys(jeu.save.creations).length;
  assert.equal(st.creations, nbCreations);
  assert.ok(nbCreations >= 2);
  assert.equal(st.recettesOfficielles, jeu.store.nombreRecettes - nbCreations);
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
  // Le catalogue livré est identique ; les créations du joueur (propres à la partie) s'y ajoutent.
  const creations = Object.keys(jeu.save.creations || {}).length;
  assert.equal(jeuSources.store.nombreRecettes, jeu.store.nombreRecettes - creations, 'le repli doit produire le même catalogue');
  assert.equal(jeuSources.store.nombreElements, jeu.store.nombreElements - creations);
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

/* ---------------- Potions de familier ---------------- */

test('une potion donnée à un familier donne exactement +1 niveau et recharge le quota', () => {
  jeu.save.potions = 3;
  jeu.quota.restant = 2;
  jeu.quota.persister();
  const avant = jeu.save.familiers.flammichou.niveau;
  const avantXp = jeu.save.familiers.flammichou.xp;

  const r = jeu.donnerPotion('flammichou');
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.niveauPrecedent, avant);
  assert.equal(r.niveau, avant + 1, 'un seul niveau gagné');
  assert.equal(jeu.save.familiers.flammichou.niveau, avant + 1);
  assert.ok(jeu.save.familiers.flammichou.xp > avantXp, 'l\'XP avance jusqu\'au niveau suivant');
  assert.equal(r.restant, QUOTA.max, 'le quota repasse à 5 / 5');
  assert.equal(r.bonus, false);
  assert.equal(jeu.save.potions, 2, 'la potion est consommée');
  assert.equal(jeu.etatQuota().restant, QUOTA.max);
});

test('une potion donnée sur un quota plein le pousse à 10 / 5', () => {
  jeu.save.potions = 1;
  jeu.quota.restant = QUOTA.max;
  const r = jeu.donnerPotion('flammichou');
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.restant, QUOTA.max + QUOTA.bonusMax);
  assert.equal(r.bonus, true);
  assert.equal(jeu.etatQuota().restant, 10);
  assert.equal(jeu.etatQuota().bonus, true);

  // La fenêtre de 10 minutes écoulée ramène le compteur à 5 / 5.
  jeu.quota.debutFenetre -= QUOTA.fenetreMs + 1000;
  assert.equal(jeu.etatQuota().restant, QUOTA.max, 'après 10 minutes, retour à 5 / 5');
  assert.equal(jeu.etatQuota().bonus, false);
});

test('sans potion disponible, le don est refusé sans effet', () => {
  jeu.save.potions = 0;
  const avant = jeu.save.familiers.flammichou.niveau;
  const r = jeu.donnerPotion('flammichou');
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Aucune potion/i);
  assert.equal(jeu.save.familiers.flammichou.niveau, avant);
});

test('un familier non possédé ne peut pas recevoir de potion', () => {
  jeu.save.potions = 1;
  const r = jeu.donnerPotion('glitchou');
  assert.equal(r.ok, false);
  assert.match(r.erreur, /possédé/i);
  assert.equal(jeu.save.potions, 1, 'aucune potion ne doit être consommée');
});

test('on gagne des potions en montant de niveau et en réclamant une quête', () => {
  jeu.save.potions = 0;
  const niveauAvant = jeu.save.niveau;
  jeu.ajouterXp(5000, { silencieux: true });
  assert.ok(jeu.save.niveau > niveauAvant, 'le joueur doit monter de niveau');
  assert.ok(jeu.save.potions >= 1, 'chaque niveau rapporte une potion');

  const quete = jeu.save.quetes.quotidiennes[0];
  quete.terminee = true;
  quete.reclamee = false;
  const avant = jeu.save.potions;
  const r = jeu.reclamerQuete('quotidiennes', quete.id);
  assert.equal(r.ok, true, r.erreur);
  assert.equal(r.potions, 1, 'une quête réclamée rapporte une potion');
  assert.equal(jeu.save.potions, avant + 1);
});

test('les potions et les créations survivent à l\'export / import', async () => {
  await jeu.charger(1);
  jeu.save.potions = 7;
  await jeu.sauvegarder();
  const texte = await jeu.saves.exporterTexte(1);
  const res = await jeu.saves.importer(0, texte);
  assert.equal(res.ok, true, res.erreur);
  const data = await jeu.saves.charger(0);
  assert.equal(data.potions, 7);
  assert.ok(data.creations[PAIRE_CREATION], 'les créations doivent être exportées et importées');
  assert.ok(data.decouvertes[idCreation]);
});

test('une ancienne sauvegarde « expérimentale » est officialisée au chargement', async () => {
  const data = await jeu.saves.charger(1);
  const ancienne = JSON.parse(JSON.stringify(data));
  const creation = ancienne.creations[PAIRE_CREATION];
  assert.ok(creation, 'prérequis : une création existe dans la sauvegarde');
  // Simule une partie d'une version précédente : créations expérimentales, non officielles.
  ancienne.creations = {};
  delete ancienne.decouvertes[creation.id];
  ancienne.experimental = {
    [PAIRE_CREATION]: { resultat: creation.nom, id: creation.id, date: new Date().toISOString(), source: 'local' },
  };
  await jeu.saves.ecrire(0, ancienne, false);

  const jeu2 = new Jeu({ fetchImpl: fetchLocal });
  await jeu2.initialiser();
  await jeu2.charger(0);
  assert.ok(jeu2.save.creations[PAIRE_CREATION], 'la création doit être migrée');
  assert.ok(jeu2.save.decouvertes[creation.id], 'elle doit revenir dans l\'inventaire');
  assert.ok(jeu2.store.elements.has(creation.id), 'elle doit redevenir un ingrédient utilisable');
});
