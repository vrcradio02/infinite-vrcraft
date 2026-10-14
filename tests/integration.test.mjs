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
const { ELEMENTS_DE_DEPART, QUOTA, RARETES } = await import('../src/config.js');
const { identifiantJoueur } = await import('../src/social/friends.js');
const { resumeProfil, lireProfil, encoderProfil } = await import('../src/social/profil.js');

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

/* ---------------- Amis (aucun compte : pseudonymes + codes) ---------------- */

test('sans relais, une demande d’ami passe par un code et rapporte 10 potions à chacun', async () => {
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Aline', '🔥');
  const jeuB = new Jeu({ fetchImpl: fetchLocal });
  await jeuB.initialiser();
  await jeuB.creer(1, 'Bruno', '💧');

  const potionsA = jeuA.save.potions;
  const potionsB = jeuB.save.potions;

  const envoi = await jeuA.demanderAmi('Bruno');
  assert.equal(envoi.ok, true, envoi.erreur);
  assert.equal(envoi.livre, false, 'sans relais configuré, la demande part par code');
  assert.match(envoi.code, /^ICU-AMI1:/);
  assert.equal(jeuA.etatAmis().envoyees.length, 1);

  // Bruno colle le code : la demande l’attend (c’est le moment où il reçoit la notification).
  const reception = jeuB.traiterCodeAmi(envoi.code);
  assert.equal(reception.ok, true, reception.erreur);
  assert.equal(jeuB.etatAmis().recues.length, 1);
  assert.equal(jeuB.etatAmis().recues[0].nom, 'Aline');

  // Bruno accepte : +10 potions tout de suite.
  const accept = await jeuB.accepterAmi(reception.demande.id);
  assert.equal(accept.ok, true, accept.erreur);
  assert.equal(accept.potions, 10);
  assert.equal(jeuB.save.potions, potionsB + 10);
  assert.equal(jeuB.etatAmis().liste[0].nom, 'Aline');
  assert.ok(accept.code, 'un code de confirmation est fourni (mode sans relais)');

  // Aline colle la confirmation : elle reçoit ses 10 potions.
  const confirmation = jeuA.traiterCodeAmi(accept.code);
  assert.equal(confirmation.ok, true, confirmation.erreur);
  assert.equal(confirmation.potions, 10);
  assert.equal(jeuA.save.potions, potionsA + 10);
  assert.equal(jeuA.etatAmis().liste[0].nom, 'Bruno');

  // Rejouer la confirmation ne redonne rien.
  const encore = jeuA.traiterCodeAmi(accept.code);
  assert.equal(encore.potions, 0);
  assert.equal(jeuA.save.potions, potionsA + 10);

  // Les deux parties conservent leurs amis après sauvegarde puis rechargement.
  await jeuA.sauvegarder();
  await jeuB.sauvegarder();
  const reluA = new Jeu({ fetchImpl: fetchLocal });
  await reluA.initialiser();
  await reluA.charger(0);
  assert.equal(reluA.etatAmis().liste.length, 1);
  assert.equal(reluA.etatAmis().liste[0].nom, 'Bruno');
  assert.equal(reluA.save.potions, potionsA + 10);
});

test('une demande refusée disparaît et n’est plus proposée', async () => {
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Chloé', '🌸');
  const jeuB = new Jeu({ fetchImpl: fetchLocal });
  await jeuB.initialiser();
  await jeuB.creer(1, 'Dora', '⭐');

  const envoi = await jeuA.demanderAmi('Dora');
  const reception = jeuB.traiterCodeAmi(envoi.code);
  jeuB.refuserAmi(reception.demande.id);
  assert.equal(jeuB.etatAmis().recues.length, 0);
  assert.equal(jeuB.etatAmis().liste.length, 0);

  // La même demande (même date) n’est plus proposée…
  const relivraison = jeuB.traiterCodeAmi(envoi.code);
  assert.equal(relivraison.ok, false);
  assert.equal(jeuB.etatAmis().recues.length, 0, 'un refus ne doit pas être annulé par une relivraison');
});

test('on ne peut pas s’ajouter soi-même comme ami', async () => {
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Émile', '🔥');
  const r = await jeuA.demanderAmi('émile');
  assert.equal(r.ok, false);
  assert.match(r.erreur, /vous-même/i);
});

test('sans relais configuré, la synchronisation l’indique clairement', async () => {
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Fanny', '💧');
  const r = await jeuA.synchroniserAmis();
  assert.equal(r.ok, false);
  assert.match(r.erreur, /relais/i);
  assert.deepEqual(r.nouvelles, []);
});

test('les statistiques comptent les amis et les potions qu’ils ont rapportées', async () => {
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Gaspard', '🔥');
  const jeuB = new Jeu({ fetchImpl: fetchLocal });
  await jeuB.initialiser();
  await jeuB.creer(1, 'Hélène', '🌍');

  const envoi = await jeuA.demanderAmi('Hélène');
  const reception = jeuB.traiterCodeAmi(envoi.code);
  await jeuB.accepterAmi(reception.demande.id);

  const st = jeuB.statistiques();
  assert.equal(st.amis, 1);
  assert.equal(st.amisEnAttente, 0);
  assert.equal(st.potionsAmis, 10);
  assert.equal(jeuB.etatAmis().potionsParAmi, 10);
});

test('les amis survivent à l’export / import d’une sauvegarde', async () => {
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Irène', '🔥');
  const jeuB = new Jeu({ fetchImpl: fetchLocal });
  await jeuB.initialiser();
  await jeuB.creer(1, 'Jonas', '💧');

  const envoi = await jeuA.demanderAmi('Jonas');
  const reception = jeuB.traiterCodeAmi(envoi.code);
  await jeuB.accepterAmi(reception.demande.id);
  await jeuB.sauvegarder(); // la sauvegarde automatique est différée : on la force avant l'export

  const texte = await jeuB.saves.exporterTexte(1);
  const imp = await jeuA.saves.importer(2, texte);
  assert.equal(imp.ok, true, imp.erreur);
  const data = await jeuA.saves.charger(2);
  assert.equal(data.amis.liste.length, 1);
  assert.equal(data.amis.liste[0].nom, 'Irène');
});

/* -------------------- Anti-doublon des créations -------------------- */

test('deux paires différentes qui donnent le même nom ne font qu’un seul élément d’inventaire', async () => {
  const jeuC = new Jeu({ fetchImpl: fetchLocal });
  await jeuC.initialiser();
  await jeuC.creer(0, 'Karine', '⭐');

  // On cherche DEUX paires sans recette officielle dont le composeur produit le même nom
  // (c'est exactement le cas signalé : « trois Argile Ancien »).
  const ids = [...jeuC.store.elements.keys()].slice(0, 90);
  const parNom = new Map();
  let paires = null;
  for (const a of ids) {
    for (const b of ids) {
      if (a >= b) continue;
      if (jeuC.store.trouver(a, b)) continue;
      const c = jeuC.engine.composerExperimental(a, b);
      if (!c) continue;
      const cle = c.nom.toLowerCase();
      if (parNom.has(cle)) { paires = [parNom.get(cle), { a, b, nom: c.nom }]; break; }
      parNom.set(cle, { a, b, nom: c.nom });
    }
    if (paires) break;
  }
  assert.ok(paires, 'aucun homonyme trouvé dans le catalogue : test impossible');
  const [p1, p2] = paires;
  assert.notDeepEqual([p1.a, p1.b], [p2.a, p2.b]);

  const r1 = await jeuC.fusionner(p1.a, p1.b, { mode: 'creativite' });
  assert.equal(r1.ok, true, r1.erreur);
  assert.equal(r1.resultat.nom.toLowerCase(), p1.nom.toLowerCase());
  assert.equal(r1.alias, false);
  const inventaireApres1 = Object.keys(jeuC.save.decouvertes).length;

  const r2 = await jeuC.fusionner(p2.a, p2.b, { mode: 'creativite' });
  assert.equal(r2.ok, true, r2.erreur);
  const inventaireApres2 = Object.keys(jeuC.save.decouvertes).length;

  assert.equal(r2.resultat.id, r1.resultat.id, 'le même nom doit désigner le même élément');
  assert.equal(r2.alias, true, 'la seconde paire doit être signalée comme un raccourci');
  assert.equal(inventaireApres2, inventaireApres1, 'aucune entrée d’inventaire en double');
  assert.equal(jeuC.save.stats.decouvertes, inventaireApres2);

  const homonymes = Object.values(jeuC.save.creations).filter((c) => String(c.nom).toLowerCase() === p1.nom.toLowerCase());
  assert.equal(homonymes.length, 2, 'les deux paires restent enregistrées et reproductibles');
  assert.equal(jeuC.creationExistante(p1.a, p1.b).id, jeuC.creationExistante(p2.a, p2.b).id);
  assert.equal(jeuC.store.trouver(p2.a, p2.b).result, r1.resultat.id, 'la paire reconnue renvoie l’élément conservé');
});

test('la même paire fusionnée trois fois n’ajoute qu’un seul élément à l’inventaire', async () => {
  const jeuE = new Jeu({ fetchImpl: fetchLocal });
  await jeuE.initialiser();
  await jeuE.creer(0, 'Lucie', '🌈');

  // Paire SANS recette officielle : la première fusion crée l'élément, les suivantes le
  // reconnaissent (c'est le cas signalé : « trois Argile Ancien »).
  const tous = [...jeuE.store.elements.keys()];
  let paire = null;
  for (const a of tous) {
    for (const b of tous) {
      if (a >= b) continue;
      if (jeuE.store.trouver(a, b)) continue;
      const compo = jeuE.engine.composerExperimental(a, b);
      // Le nom composé ne doit pas déjà exister, sinon la fusion pointerait un élément connu.
      if (!compo || jeuE.elementParNom(compo.nom)) continue;
      paire = [a, b];
      break;
    }
    if (paire) break;
  }
  assert.ok(paire, 'aucune paire libre dans le catalogue : test impossible');

  const decouvertesAvant = Object.keys(jeuE.save.decouvertes).length;
  const resultats = [];
  for (let i = 0; i < 3; i++) resultats.push(await jeuE.fusionner(paire[0], paire[1], { mode: 'creativite' }));

  for (const r of resultats) assert.equal(r.ok, true, r.erreur);
  const idCree = resultats[0].resultat.id;
  assert.equal(resultats[0].alias, false, 'la première fusion crée un élément vraiment neuf');
  assert.equal(resultats[1].resultat.id, idCree, 'la deuxième fusion doit viser le même élément');
  assert.equal(resultats[2].resultat.id, idCree, 'la troisième fusion doit viser le même élément');
  assert.deepEqual(resultats.map((r) => r.statut), [STATUT.NOUVEAU, STATUT.CONNU, STATUT.CONNU]);

  assert.equal(
    Object.keys(jeuE.save.decouvertes).length,
    decouvertesAvant + 1,
    'une seule entrée d’inventaire ajoutée pour trois fusions identiques',
  );
  assert.equal(
    Object.keys(jeuE.save.decouvertes).filter((id) => id === idCree).length,
    1,
    'l’élément créé n’apparaît qu’une fois dans l’inventaire',
  );
  // Le nom est l’identité visible : aucun homonyme dans l’inventaire.
  const homonymes = Object.values(jeuE.save.decouvertes)
    .filter((d) => jeuE.store.elements.get(d.id)?.nom?.toLowerCase() === resultats[0].resultat.nom.toLowerCase());
  assert.equal(homonymes.length, 1, 'un seul élément pour un même nom dans l’inventaire');
  assert.equal(jeuE.save.stats.decouvertes, Object.keys(jeuE.save.decouvertes).length);
  assert.equal(Object.keys(jeuE.save.creations).length, 1, 'une seule création enregistrée pour la paire');
  assert.equal(jeuE.save.stats.experimentales, 1, 'le journal expérimental ne compte pas de doublon');
});

test('une partie déjà enregistrée avec des créations homonymes est nettoyée au chargement', async () => {
  const { nouvelleSauvegarde } = await import('../src/saves/saves.js');
  const jeuD = new Jeu({ fetchImpl: fetchLocal });
  await jeuD.initialiser();
  const tous = [...jeuD.store.elements.keys()];
  const [a, b] = tous;
  // Troisième ingrédient SANS recette officielle avec `a` : la paire doit dépendre de la
  // création pour que le test vérifie bien le repointage de la recette du joueur.
  const c = tous.find((id) => id !== a && id !== b && !jeuD.store.trouver(a, id));
  assert.ok(c, 'catalogue trop petit pour le test');

  const save = nouvelleSauvegarde('Doublons', '🌍');
  save.creations['k1'] = { id: 'x-test-1', nom: 'Argile Ancien', a, b, categorie: 'Matière', rarete: 'Rare', monde: 'libre' };
  save.creations['k2'] = { id: 'x-test-2', nom: 'argile ancien', a, b: c, categorie: 'Matière', rarete: 'Rare', monde: 'libre' };
  save.decouvertes['x-test-1'] = { id: 'x-test-1', date: new Date().toISOString(), source: 'creation', rarete: 'Rare', premiere: true };
  save.decouvertes['x-test-2'] = { id: 'x-test-2', date: new Date().toISOString(), source: 'creation', rarete: 'Rare', premiere: true };

  await jeuD.activer(0, save);

  const idsCrees = Object.values(jeuD.save.creations).map((x) => x.id);
  assert.deepEqual([...new Set(idsCrees)], ['x-test-1'], 'les créations homonymes pointent sur le même élément');
  assert.ok(jeuD.save.decouvertes['x-test-1']);
  assert.equal(jeuD.save.decouvertes['x-test-2'], undefined, 'le doublon disparaît de l’inventaire');
  assert.equal(jeuD.store.elements.has('x-test-2'), false, 'le doublon disparaît aussi du catalogue de la partie');
  assert.equal(jeuD.store.trouver(a, c).result, 'x-test-1', 'l’ancienne paire produit l’élément conservé');
  assert.equal(jeuD.save.stats.decouvertes, Object.keys(jeuD.save.decouvertes).length);
});

/* -------------------- Profils partagés entre amis -------------------- */

/** Relais factice complet : messages (livrés une fois) + profils (conservés). */
function relaisFactice() {
  const boites = new Map();
  const profils = new Map();
  const appels = [];
  const fetchImpl = async (url, options = {}) => {
    const u = String(url);
    appels.push(`${options.method || 'GET'} ${u}`);
    const json = (corps) => ({ ok: true, status: 200, async json() { return corps; }, async text() { return JSON.stringify(corps); } });
    if (u.includes('/profils')) {
      const ids = (new URL(u).searchParams.get('ids') || '').split(',').filter(Boolean);
      return json({ ok: true, profils: ids.map((id) => profils.get(id)).filter(Boolean) });
    }
    if (u.includes('/profil') && options.method === 'POST') {
      const p = JSON.parse(options.body).profil;
      profils.set(p.id, p);
      return json({ ok: true });
    }
    if (options.method === 'POST') {
      const ev = JSON.parse(options.body);
      const destinataire = ev.vers.id;
      const liste = (boites.get(destinataire) || []).filter((e) => e.id !== ev.id);
      liste.push(ev);
      boites.set(destinataire, liste);
      return json({ ok: true });
    }
    const pour = new URL(u).searchParams.get('pour');
    const evenements = boites.get(pour) || [];
    boites.delete(pour);
    return json({ ok: true, evenements });
  };
  return { fetchImpl, profils, appels };
}

test('deux amis échangent leurs profils par le relais (niveau, découvertes, animaux, statistiques)', async () => {
  const relais = relaisFactice();
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Lucie', '🔥');
  const jeuB = new Jeu({ fetchImpl: fetchLocal });
  await jeuB.initialiser();
  await jeuB.creer(1, 'Marc', '💧');
  // Les deux joueurs parsent de vraies fusions pour que leurs profils ne soient pas vides.
  await jeuA.fusionner('feu', 'eau');
  await jeuA.fusionner('eau', 'terre');
  await jeuB.fusionner('feu', 'terre');

  jeuA.majConfigAmis({ endpoint: 'https://relais.test', actif: true });
  jeuB.majConfigAmis({ endpoint: 'https://relais.test', actif: true });
  jeuA.fetch = relais.fetchImpl;
  jeuB.fetch = relais.fetchImpl;

  // Amitié : demande de Lucie, acceptation de Marc.
  const envoi = await jeuA.demanderAmi('Marc');
  assert.equal(envoi.livre, true);
  const syncB = await jeuB.synchroniserAmis();
  assert.equal(syncB.nouvelles.length, 1);
  await jeuB.accepterAmi(syncB.nouvelles[0].id);
  await jeuA.synchroniserAmis(); // Lucie reçoit la confirmation (+10 potions)

  // Chacun publie son profil et lit celui de l'autre.
  const syncA = await jeuA.synchroniserAmis();
  assert.equal(syncA.profils.publie, true, 'mon profil part vers le relais');
  const profilMarc = jeuA.profilAmi(identifiantJoueur('Marc'));
  assert.ok(profilMarc, 'le profil de Marc doit être récupéré');
  assert.equal(profilMarc.nom, 'Marc');
  assert.equal(profilMarc.progression.niveau, jeuB.save.niveau);
  assert.equal(profilMarc.decouvertes.total, Object.keys(jeuB.save.decouvertes).length);
  assert.equal(profilMarc.familiers.total, Object.keys(jeuB.save.familiers).length);
  assert.ok(profilMarc.familiers.liste.some((f) => f.nom === 'Flammichou'), 'ses animaux sont visibles');
  assert.equal(profilMarc.stats.fusionsTentees, jeuB.save.stats.fusionsTentees);
  assert.ok(profilMarc.mondes.total >= 1, 'ses mondes débloqués sont visibles');
  assert.ok(profilMarc.succes.total >= 1, 'ses succès sont visibles');
  assert.ok(profilMarc.decouvertes.dernieres.length >= 1, 'ses découvertes sont listées');
  // Ses objets rares (Rare et plus) sont comptés ET listés, et ses animaux arrivent avec
  // leur rareté : c'est ce qu'un ami vient voir dans la fiche.
  assert.ok(profilMarc.decouvertes.totalRares >= 1, 'Marc a découvert au moins un objet rare (Lave)');
  assert.equal(profilMarc.decouvertes.totalRares, Object.values(jeuB.save.decouvertes).filter((d) => ['Rare', 'Épique', 'Légendaire', 'Mythique', 'Cosmique', 'Secret'].includes(d.rarete)).length);
  assert.ok(profilMarc.decouvertes.rares.some((x) => x.nom === 'Lave'), 'ses plus beaux objets sont nommés');
  for (const f of profilMarc.familiers.liste) assert.ok(RARETES.includes(f.rarete), `rareté d’animal inconnue : ${f.rarete}`);

  // Le sien aussi est lisible par Marc (au tour suivant de l'interrogation automatique).
  await jeuB.synchroniserAmis();
  const vuParB = jeuB.profilAmi(identifiantJoueur('Lucie'));
  assert.equal(vuParB?.nom, 'Lucie');
  assert.equal(vuParB.decouvertes.total, Object.keys(jeuA.save.decouvertes).length);

  // Le profil ne transporte rien de la partie : ni historique, ni paramètres, ni recettes.
  const texte = JSON.stringify(profilMarc);
  for (const interdit of ['historique', 'parametres', 'sauvegardeAuto', 'aideQuota', 'cadeaux', '"decouvertes":{"feu"']) {
    assert.equal(texte.includes(interdit), false, `« ${interdit} » ne doit pas être publié`);
  }
  assert.equal(texte.includes('fusionsTentees'), true);
});

test('le profil d’un ami s’échange aussi par code, sans relais', async () => {
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Nina', '🌸');
  await jeuA.fusionner('vent', 'terre');
  const jeuB = new Jeu({ fetchImpl: fetchLocal });
  await jeuB.initialiser();
  await jeuB.creer(1, 'Omar', '⭐');

  const code = jeuA.codeProfil();
  assert.equal(code.ok, true, code.erreur);
  const importe = jeuB.importerProfil(code.code);
  assert.equal(importe.ok, true, importe.erreur);
  assert.equal(importe.profil.nom, 'Nina');

  const vu = jeuB.profilAmi(identifiantJoueur('Nina'));
  assert.equal(vu.decouvertes.total, Object.keys(jeuA.save.decouvertes).length);
  assert.equal(vu.source, 'code');

  // Un texte quelconque n'est jamais accepté comme profil.
  assert.equal(jeuB.importerProfil('coucou').ok, false);
  assert.equal(jeuB.importerProfil(code.code.slice(0, 20)).ok, false);
});

test('les profils d’amis survivent à l’export / import d’une sauvegarde', async () => {
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  await jeuA.creer(0, 'Pia', '🌍');
  const jeuB = new Jeu({ fetchImpl: fetchLocal });
  await jeuB.initialiser();
  await jeuB.creer(1, 'Quentin', '🔥');

  const code = jeuA.codeProfil();
  jeuB.importerProfil(code.code);
  await jeuB.sauvegarder();

  const texte = await jeuB.saves.exporterTexte(1);
  const imp = await jeuA.saves.importer(2, texte);
  assert.equal(imp.ok, true, imp.erreur);
  const data = await jeuA.saves.charger(2);
  assert.equal(Object.keys(data.profils).length, 1, 'le profil importé fait partie de la sauvegarde');
  assert.equal(data.profils[identifiantJoueur('Pia')].profil.nom, 'Pia');
});

test('un profil non fiable est neutralisé au chargement de la sauvegarde', async () => {
  const { nouvelleSauvegarde } = await import('../src/saves/saves.js');
  const jeuA = new Jeu({ fetchImpl: fetchLocal });
  await jeuA.initialiser();
  const save = nouvelleSauvegarde('Injection', '🧪');
  save.profils = {
    'cle-bidon': { profil: { nom: 'Pirate', type: 'profil', id: 'qui-1', script: '<script>alert(1)</script>' }, recuLe: '2026-06-01T10:00:00.000Z' },
    nul: null,
    texte: 'pas un objet',
  };
  await jeuA.activer(0, save);
  const profils = jeuA.profilsAmis();
  assert.deepEqual(Object.keys(profils), [identifiantJoueur('Pirate')], 'rangé sous l’identifiant dérivé du pseudo');
  assert.equal(JSON.stringify(profils).includes('<script>'), false);
  assert.equal(profils[identifiantJoueur('Pirate')].script, undefined);
});
