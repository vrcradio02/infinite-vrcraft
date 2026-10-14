/**
 * Tests des profils partagés : ce qui est publié, ce qui est refusé, et par où ça passe.
 * On vérifie aussi qu'un profil ne contient JAMAIS la partie (aucune découverte nominative,
 * aucun historique, aucun paramètre) et qu'un profil reçu n'est jamais cru sur parole.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  construireProfil, normaliserProfil, normaliserProfilsAmis, encoderProfil, lireProfil,
  resumeProfil, dateApercu, estProfil, TYPE_PROFIL, LIMITES_PROFIL,
} from '../src/social/profil.js';
import { identifiantJoueur } from '../src/social/friends.js';
import { publierProfil, recupererProfils, MAX_PROFILS_PAR_REQUETE } from '../src/social/relay.js';
import relaisWorker from '../server/worker-amis.js';

const memoire = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: (k) => memoire.delete(k),
  clear: () => memoire.clear(),
};

/** Sauvegarde minimale réaliste, avec des données PRIVÉES qui ne doivent jamais sortir. */
function sauvegardeDeTest() {
  const decouvertes = {
    feu: { id: 'feu', date: '2026-01-01T10:00:00.000Z', source: 'depart', rarete: 'Commun' },
    vapeur: { id: 'vapeur', date: '2026-02-01T10:00:00.000Z', source: 'fusion', rarete: 'Peu commun' },
    or: { id: 'or', date: '2026-03-01T10:00:00.000Z', source: 'fusion', rarete: 'Rare', premiere: true },
  };
  return {
    nom: 'Camille',
    avatar: '🔥',
    niveau: 12,
    xp: 3400,
    potions: 7,
    decouvertes,
    creations: { 'a|b': { id: 'x-a-b', nom: 'Argile Ancien' } },
    historique: [{ a: 'feu', b: 'eau', resultat: 'Vapeur', date: '2026-02-01T10:00:00.000Z', secret: 'privé' }],
    statistiquesPrivees: { secret: true },
    parametres: { theme: 'cosmos', email: 'camille@example.com' },
    familierIdPrive: 'ne-doit-pas-sortir',
    familiers: { flammichou: { id: 'flammichou', niveau: 6 }, pixelou: { id: 'pixelou', niveau: 2 } },
    equipe: ['flammichou'],
    mondes: { libre: true, nature: true, technologie: true, culture: false, espace: true },
    collections: { meteo: { complete: true, elements: ['vapeur'] }, cuisine: { complete: false } },
    succes: { 'premiere-fusion': '2026-01-01T10:05:00.000Z', explorateur: '2026-02-01T10:05:00.000Z' },
    series: { jours: 4 },
    amis: { liste: [{ id: 'alex-1', nom: 'Alex' }], cadeaux: ['alex-1'] },
    stats: { fusionsTentees: 132, quetesTerminees: 9, aidesUtilisees: 5, joursDeJeu: 6, experimentales: 2 },
  };
}

/** Résolveurs simples : le module est PUR, l'appelant fournit les noms. */
const options = {
  nomElement: (id) => ({ feu: { nom: 'Feu', emoji: '🔥' }, vapeur: { nom: 'Vapeur', emoji: '☁️' }, or: { nom: 'Or', emoji: '🪙' } }[id] || null),
  nomPet: (id) => ({ flammichou: { nom: 'Flammichou', emoji: '🔥', rarete: 'Épique' }, pixelou: { nom: 'Pixelou', emoji: '💾', rarete: 'Rare' } }[id] || null),
  nomMonde: (id) => ({ libre: { nom: 'Genèse', emoji: '🌍' }, nature: { nom: 'Nature', emoji: '🌿' } }[id] || null),
  nomCollection: (id) => ({ meteo: { nom: 'Météorologue', emoji: '⛈️' }, cuisine: { nom: 'Cuisinier', emoji: '🍳' } }[id] || null),
  nomSucces: (id) => ({ 'premiere-fusion': { nom: 'Première fusion' }, explorateur: { nom: 'Explorateur' } }[id] || null),
  totalElements: 260,
  totalMondes: 8,
  totalCollections: 8,
  totalSucces: 12,
  date: '2026-06-01T12:00:00.000Z',
};

/* ---------------------------- Construction ---------------------------- */

test('l’aperçu décrit la partie (progression, découvertes, familiers, mondes, statistiques)', () => {
  const p = construireProfil(sauvegardeDeTest(), options);
  assert.equal(p.type, TYPE_PROFIL);
  assert.equal(p.id, identifiantJoueur('Camille'));
  assert.equal(p.nom, 'Camille');
  assert.equal(p.avatar, '🔥');
  assert.equal(p.progression.niveau, 12);
  assert.equal(p.decouvertes.total, 3);
  assert.equal(p.decouvertes.catalogue, 260);
  assert.equal(p.decouvertes.creations, 1);
  assert.equal(p.decouvertes.parRarete.Commun, 1);
  assert.equal(p.decouvertes.parRarete['Peu commun'], 1);
  assert.equal(p.decouvertes.parRarete.Rare, 1);
  assert.deepEqual(p.decouvertes.dernieres.map((d) => d.nom), ['Or', 'Vapeur', 'Feu'], 'les plus récentes d’abord');
  assert.equal(p.decouvertes.dernieres[0].emoji, '🪙');
  assert.equal(p.familiers.total, 2);
  assert.equal(p.familiers.liste.find((f) => f.id === 'flammichou').niveau, 6);
  assert.equal(p.familiers.liste.find((f) => f.id === 'flammichou').equipe, true);
  assert.deepEqual(p.familiers.equipe, ['flammichou']);
  assert.equal(p.mondes.total, 4);
  assert.equal(p.mondes.referentiel, 8);
  assert.equal(p.collections.completees, 1);
  assert.equal(p.succes.total, 2);
  assert.equal(p.succes.referentiel, 12);
  assert.equal(p.stats.fusionsTentees, 132);
  assert.equal(p.stats.quetesTerminees, 9);
  assert.equal(p.stats.joursDeJeu, 6);
  assert.equal(p.stats.serie, 4);
  assert.equal(p.stats.potions, 7);
  assert.equal(p.stats.amis, 1);
  // Les « plus beaux objets » d'un joueur : Rare et au-delà, du plus rare au plus commun.
  assert.equal(p.decouvertes.totalRares, 1, 'seul « Or » (Rare) compte comme objet rare');
  assert.deepEqual(p.decouvertes.rares.map((x) => x.nom), ['Or']);
  assert.equal(p.decouvertes.rares[0].rarete, 'Rare');
  assert.equal(p.decouvertes.rares[0].emoji, '🪙');
  // Les animaux arrivent avec leur rareté, et les plus avancés d'abord.
  assert.equal(p.familiers.liste[0].id, 'flammichou', 'l’animal le plus haut niveau passe en premier');
  assert.equal(p.familiers.liste[0].rarete, 'Épique');
  assert.equal(p.familiers.liste[1].rarete, 'Rare');
});

test('les compteurs d’objets, d’objets rares et d’animaux sont exposés au résumé', () => {
  const profil = construireProfil(sauvegardeDeTest(), options);
  const r = resumeProfil(profil);
  assert.equal(r.objets, 3);
  assert.equal(r.objetsRares, 1);
  assert.equal(r.animaux, 2);
  // Un profil reçu conserve ces compteurs (ils passent la normalisation).
  const recu = normaliserProfil(profil);
  assert.equal(recu.ok, true, recu.erreur);
  assert.equal(recu.profil.decouvertes.totalRares, 1);
  assert.equal(recu.profil.decouvertes.rares.length, 1);
  assert.equal(recu.profil.familiers.liste[0].rarete, 'Épique');
  // Un farfelu ne peut pas se déclarer couvert d’objets rares sans liste cohérente.
  const bidon = normaliserProfil({ nom: 'Fanfaron', decouvertes: { total: 2, totalRares: -12, rares: ['texte', { id: '!!' }] } });
  assert.equal(bidon.ok, true, bidon.erreur);
  assert.equal(bidon.profil.decouvertes.totalRares, 0);
  assert.deepEqual(bidon.profil.decouvertes.rares, []);
});

test('l’aperçu ne transporte JAMAIS la partie (découvertes nominatives, historique, paramètres)', () => {
  const texte = JSON.stringify(construireProfil(sauvegardeDeTest(), options));
  for (const interdit of ['camille@example.com', 'historique', 'parametres', 'statistiquesPrivees', 'familierIdPrive', 'secret', 'theme', 'cadeaux']) {
    assert.equal(texte.includes(interdit), false, `« ${interdit} » ne doit jamais être publié`);
  }
  // La carte de toutes les découvertes (id par id) n'est pas transmise non plus.
  const p = construireProfil(sauvegardeDeTest(), options);
  assert.equal('decouvertesMap' in p, false);
  assert.equal(Object.keys(p.decouvertes).includes('feu'), false);
});

test('l’aperçu est borné (dernières découvertes, familiers, taille totale)', () => {
  const s = sauvegardeDeTest();
  s.decouvertes = {};
  for (let i = 0; i < 300; i++) {
    s.decouvertes[`el-${i}`] = { id: `el-${i}`, date: new Date(2026, 0, 1 + (i % 300)).toISOString(), source: 'fusion', rarete: 'Commun' };
  }
  s.familiers = {};
  for (let i = 0; i < 40; i++) s.familiers[`pet-${i}`] = { id: `pet-${i}`, niveau: i + 1 };
  s.succes = {};
  for (let i = 0; i < 40; i++) s.succes[`s-${i}`] = new Date().toISOString();

  const p = construireProfil(s, options);
  assert.equal(p.decouvertes.dernieres.length, LIMITES_PROFIL.maxDernieres);
  assert.ok(p.decouvertes.rares.length <= LIMITES_PROFIL.maxRares, 'la liste des objets rares est bornée');
  assert.equal(p.familiers.liste.length, LIMITES_PROFIL.maxFamiliers);
  assert.equal(p.succes.liste.length, LIMITES_PROFIL.maxSucces);
  assert.ok(JSON.stringify(p).length <= LIMITES_PROFIL.maxOctets, 'un profil reste petit');
  assert.equal(p.decouvertes.total, 300, 'le compteur reste exact même si la liste est tronquée');
});

test('une partie inutilisable ne produit pas de profil', () => {
  assert.equal(construireProfil(null, options), null);
  assert.equal(construireProfil({}, options), null);
  assert.equal(construireProfil({ nom: '   ' }, options), null);
});

/* ---------------------------- Normalisation (données reçues) ---------------------------- */

test('un profil reçu est revalidé : identifiant recalculé, champs inconnus ignorés, bornes appliquées', () => {
  const recu = {
    v: 99,
    type: TYPE_PROFIL,
    id: identifiantJoueur('Bruno'),
    nom: 'Bruno',
    avatar: '🌍',
    date: '2026-06-02T08:00:00.000Z',
    motDePasse: 'jamais',
    progression: { niveau: 1e9, xp: -50 },
    decouvertes: { total: 12, catalogue: 260, creations: 2, parRarete: { Commun: 10, Inconnue: 4 }, dernieres: [{ id: 'feu', nom: 'Feu', rarete: 'Rare', emoji: '🔥' }, 'pas un objet'], totalRares: 4, rares: [{ id: 'feu', nom: 'Feu', rarete: 'Légendaire', emoji: '🔥' }, 'pas un objet'] },
    familiers: { total: 1, liste: [{ id: 'pixelou', nom: 'Pixelou', rarete: 'Inconnue', niveau: 'beaucoup', equipe: true }], equipe: ['pixelou', 'pixelou', 'Pixelou', '!!!!'] },
    stats: { fusionsTentees: -8, joursDeJeu: 'six', potions: 3 },
  };
  const res = normaliserProfil(recu);
  assert.equal(res.ok, true, res.erreur);
  const p = res.profil;
  assert.equal(p.v, 1);
  assert.equal(p.progression.niveau, 9999, 'valeur absurde bornée');
  assert.equal(p.progression.xp, 0, 'valeur négative ramenée à 0');
  assert.equal(p.decouvertes.parRarete.Inconnue, undefined, 'rareté inconnue ignorée');
  assert.equal(p.decouvertes.dernieres.length, 1, 'entrée illisible écartée');
  assert.equal(p.decouvertes.dernieres[0].rarete, 'Rare');
  assert.equal(p.decouvertes.totalRares, 4);
  assert.equal(p.decouvertes.rares.length, 1, 'liste des objets rares nettoyée');
  assert.equal(p.decouvertes.rares[0].rarete, 'Légendaire');
  assert.equal(p.familiers.liste[0].niveau, 1, 'niveau non numérique ramené à 1');
  assert.equal(p.familiers.liste[0].rarete, 'Commun', 'rareté inconnue ramenée à Commun');
  assert.deepEqual(p.familiers.equipe, ['pixelou'], 'équipe dédoublonnée et bornée à 3 entrées');
  assert.equal(p.stats.fusionsTentees, 0);
  assert.equal(p.stats.joursDeJeu, 1);
  assert.equal(p.motDePasse, undefined);
  assert.equal(JSON.stringify(p).includes('jamais'), false);
});

test('un profil sans pseudonyme est refusé ; un identifiant annoncé est ignoré', () => {
  assert.equal(normaliserProfil(null).ok, false);
  assert.equal(normaliserProfil('texte').ok, false);
  assert.equal(normaliserProfil({ nom: '' }).ok, false);

  // « Quelqu’un » se présente avec l'identifiant d'un autre : il est recalculé.
  const usurpe = normaliserProfil({ type: TYPE_PROFIL, id: identifiantJoueur('Victime'), nom: 'Quelqu’un' });
  assert.equal(usurpe.ok, true, usurpe.erreur);
  assert.equal(usurpe.profil.id, identifiantJoueur('Quelqu’un'));
  assert.notEqual(usurpe.profil.id, identifiantJoueur('Victime'));
});

test('un profil trop volumineux est refusé ou ramené sous la limite', () => {
  const long = (prefixe, n) => Array.from({ length: n }, (_, i) => ({
    id: `${prefixe}-${i}`, nom: 'n'.repeat(58) + i, emoji: '✨', rarete: 'Commun', niveau: i + 1, complete: true, date: '2026-06-01T12:00:00.000Z', source: 'fusion', premiere: true,
  }));
  const enorme = {
    nom: 'Énorme',
    decouvertes: { total: 999, catalogue: 999, creations: 0, dernieres: long('e', 300), totalRares: 300, rares: long('r', 300) },
    familiers: { total: 300, liste: long('p', 300), equipe: [] },
    mondes: { total: 300, liste: long('m', 300) },
    collections: { completees: 300, liste: long('c', 300) },
    succes: { total: 300, liste: long('s', 300) },
  };
  const res = normaliserProfil(enorme);
  if (res.ok) {
    // Les listes sont tronquées et le profil reste sous la limite de taille.
    assert.ok(JSON.stringify(res.profil).length <= LIMITES_PROFIL.maxOctets);
    assert.equal(res.profil.decouvertes.dernieres.length, LIMITES_PROFIL.maxDernieres);
    assert.equal(res.profil.decouvertes.rares.length, LIMITES_PROFIL.maxRares);
    assert.equal(res.profil.familiers.liste.length, LIMITES_PROFIL.maxFamiliers);
    assert.equal(res.profil.mondes.liste.length, LIMITES_PROFIL.maxMondes);
    assert.equal(res.profil.collections.liste.length, LIMITES_PROFIL.maxCollections);
    assert.equal(res.profil.succes.liste.length, LIMITES_PROFIL.maxSucces);
  } else {
    assert.match(res.erreur, /volumineux/i);
  }
});

test('la carte des profils d’amis est normalisée, rangée par identifiant et bornée', () => {
  const brut = {
    'cle-bidon': { profil: construireProfil(sauvegardeDeTest(), options), recuLe: '2026-06-03T09:00:00.000Z', source: 'relais' },
    'une-autre': { profil: { nom: 'Zoé' }, recuLe: '2026-06-03T09:00:00.000Z' },
    casse: 'pas un objet',
    nul: null,
  };
  const out = normaliserProfilsAmis(brut, { max: 10 });
  assert.deepEqual(Object.keys(out).sort(), [identifiantJoueur('Camille'), identifiantJoueur('Zoé')].sort());
  assert.equal(out[identifiantJoueur('Camille')].source, 'relais');
  assert.equal(out[identifiantJoueur('Zoé')].source, 'code');
  assert.equal(normaliserProfilsAmis(brut, { max: 1 }).constructor, Object);
  assert.equal(Object.keys(normaliserProfilsAmis(brut, { max: 1 })).length, 1);
  assert.deepEqual(normaliserProfilsAmis(null), {});
});

/* ---------------------------- Codes de partage ---------------------------- */

test('le code de profil fait l’aller-retour (accents et emoji compris)', () => {
  const profil = construireProfil(sauvegardeDeTest(), options);
  const code = encoderProfil(profil);
  const relu = lireProfil(code);
  assert.equal(relu.ok, true, relu.erreur);
  assert.deepEqual(relu.profil, normaliserProfil(profil).profil);
});

test('un code qui n’est pas un profil est refusé proprement', () => {
  assert.equal(lireProfil('').ok, false);
  assert.equal(lireProfil('bonjour').ok, false);
  const demande = encoderProfil({ demande: 'pas un profil' });
  assert.equal(lireProfil(demande).ok, false);
  assert.equal(estProfil({ nom: 'Alex' }), false);
  assert.equal(estProfil(construireProfil(sauvegardeDeTest(), options)), true);
});

test('le résumé et la date d’aperçu sont affichables', () => {
  const r = resumeProfil(construireProfil(sauvegardeDeTest(), options));
  assert.equal(r.nom, 'Camille');
  assert.equal(r.niveau, 12);
  assert.equal(r.decouvertes, 3);
  assert.equal(r.familiers, 2);
  assert.equal(r.mondes, 4);
  assert.equal(r.succes, 2);
  assert.equal(r.potions, 7);
  assert.equal(resumeProfil(null), null);
  assert.match(dateApercu('2026-06-01T12:00:00.000Z'), /2026/);
  assert.equal(dateApercu('n’importe quoi'), 'date inconnue');
});

/* ---------------------------- Relais : client ---------------------------- */

test('le client publie le profil sur /profil et lit /profils?ids=…', async () => {
  const appels = [];
  const fetchFaux = async (url, options = {}) => {
    appels.push({ url: String(url), options });
    if (options.method === 'POST') return { ok: true, status: 200, async json() { return { ok: true }; }, async text() { return ''; } };
    return {
      ok: true,
      status: 200,
      async json() { return { profils: [{ type: TYPE_PROFIL, nom: 'Bruno', id: identifiantJoueur('Bruno') }] }; },
      async text() { return ''; },
    };
  };
  const profil = construireProfil(sauvegardeDeTest(), options);

  const envoi = await publierProfil({ endpoint: 'https://relais.example/', profil, fetchImpl: fetchFaux });
  assert.equal(envoi.ok, true, envoi.erreur);
  assert.equal(appels[0].url, 'https://relais.example/profil');
  assert.equal(appels[0].options.method, 'POST');
  assert.equal(JSON.parse(appels[0].options.body).type, TYPE_PROFIL);
  assert.equal(JSON.parse(appels[0].options.body).profil.nom, 'Camille');

  const lecture = await recupererProfils({
    endpoint: 'https://relais.example',
    ids: ['bruno-1', 'BRUNO-1', 'zoe-2', 'id!invalide'],
    fetchImpl: fetchFaux,
  });
  assert.equal(lecture.ok, true);
  assert.equal(appels[1].url, 'https://relais.example/profils?ids=bruno-1%2Czoe-2');
  assert.equal(lecture.profils.length, 1);
});

test('sans relais ou en panne, les profils ne cassent rien', async () => {
  const profil = construireProfil(sauvegardeDeTest(), options);
  const sansRelais = await publierProfil({ endpoint: '', profil });
  assert.equal(sansRelais.ok, false);
  assert.match(sansRelais.erreur, /Aucun relais/i);

  const casse = await publierProfil({ endpoint: 'https://relais.example', profil, fetchImpl: async () => { throw new Error('coupé'); } });
  assert.equal(casse.ok, false);
  assert.match(casse.erreur, /réseau/i);

  const lecture = await recupererProfils({ endpoint: 'https://relais.example', ids: [], fetchImpl: async () => { throw new Error('jamais appelé'); } });
  assert.equal(lecture.ok, true);
  assert.deepEqual(lecture.profils, []);

  const trop = await recupererProfils({ endpoint: 'https://relais.example', ids: Array.from({ length: 50 }, (_, i) => `joueur-${i}`), fetchImpl: async () => ({ ok: true, async json() { return { profils: [] }; } }) });
  assert.equal(trop.ok, true);
  assert.ok(MAX_PROFILS_PAR_REQUETE >= 1);
});

/* ---------------------------- Relais : Worker fourni ---------------------------- */

test('le Worker range un profil sous son auteur et le relit pour ses amis', async () => {
  const kv = new Map();
  const env = {
    AMIS: {
      async get(cle, type) {
        if (!kv.has(cle)) return null;
        const v = kv.get(cle);
        return type === 'json' ? JSON.parse(v) : v;
      },
      async put(cle, valeur) { kv.set(cle, String(valeur)); },
      async delete(cle) { kv.delete(cle); },
    },
  };
  const poster = (chemin, corps) => relaisWorker.fetch(new Request(`https://relais.example${chemin}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  }), env);
  const lire = async (ids) => (await (await relaisWorker.fetch(new Request(`https://relais.example/profils?ids=${ids}`), env)).json()).profils;

  const profil = construireProfil(sauvegardeDeTest(), options);
  const publie = await poster('/profil', { type: TYPE_PROFIL, profil });
  assert.equal(publie.status, 200);

  const alice = identifiantJoueur('Camille');
  const pourAmi = await lire(alice);
  assert.equal(pourAmi.length, 1);
  assert.equal(pourAmi[0].nom, 'Camille');
  assert.equal(pourAmi[0].id, alice);
  // Un profil reste disponible (contrairement aux messages, livrés une seule fois).
  assert.equal((await lire(alice)).length, 1);
  assert.deepEqual(await lire(identifiantJoueur('Inconnu')), []);

  // On ne peut pas publier un profil dans la boîte d'un autre : l'identifiant est recalculé
  // à partir du pseudonyme, l'identifiant annoncé est ignoré.
  await poster('/profil', { type: TYPE_PROFIL, profil: { ...profil, nom: 'Mallory', id: alice } });
  const pourCamille = await lire(alice);
  assert.equal(pourCamille.length, 1);
  assert.equal(pourCamille[0].nom, 'Camille', 'le profil de Camille n’est pas écrasable');
  const mallory = identifiantJoueur('Mallory');
  assert.notEqual(mallory, alice);
  assert.equal((await lire(mallory))[0].nom, 'Mallory', 'le profil est rangé sous l’identifiant de son pseudonyme');
  assert.equal((await lire(`${alice},${mallory}`)).length, 2);

  // Même règle pour les messages : impossible de viser la boîte d'un autre joueur.
  await relaisWorker.fetch(new Request('https://relais.example/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'demande', id: 'dem_faux', de: { nom: 'Intrus' }, vers: { id: 'cible-1', nom: 'Cible' } }),
  }), env);
  const cibleReelle = identifiantJoueur('Cible');
  assert.equal(identifiantJoueur('Cible') === 'cible-1', false);
  const boite = (await (await relaisWorker.fetch(new Request(`https://relais.example/?pour=${cibleReelle}`), env)).json()).evenements;
  assert.equal(boite.length, 1, 'le message arrive dans la boîte dérivée du pseudonyme');
  assert.match(boite[0].de.id, /^intrus-/);
});

test('le Worker refuse les profils invalides ou trop gros', async () => {
  const env = { AMIS: { async get() { return null; }, async put() {}, async delete() {} } };
  const poster = (corps) => relaisWorker.fetch(new Request('https://relais.example/profil', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
  }), env);

  assert.equal((await poster({})).status, 400);
  assert.equal((await poster({ profil: 'texte' })).status, 400);
  assert.equal((await poster({ profil: { id: 'qui-1' } })).status, 400, 'un profil sans pseudonyme est refusé');
  // Un pseudonyme sans aucune lettre reste acceptable : il reçoit un identifiant de repli.
  assert.equal((await poster({ profil: { nom: '!!!' } })).status, 200);
  const enorme = { profil: { nom: 'Gros', id: 'gros-1', bourrage: 'x'.repeat(9000) } };
  assert.equal((await poster(enorme)).status, 413);
});
