#!/usr/bin/env node
/**
 * Test de fumée du point d'entrée navigateur (src/main.js).
 *
 * Ce n'est PAS un navigateur : un DOM minimal est simulé afin d'exécuter le vrai
 * bootstrap (chargement des données, création du contrôleur, du plateau et des écrans)
 * et de détecter les erreurs d'exécution que le typage ou les tests unitaires ne voient pas.
 *
 * Les interactions (clics réels, glisser-déposer, rendu visuel) doivent être validées
 * dans un vrai navigateur : voir la section « Tests manuels » du README.
 *
 * Usage : node tools/smoke-dom.mjs
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const erreurs = [];
const EMOJI = /\p{Extended_Pictographic}/u;

/* ---------------- DOM minimal ---------------- */
class ClassList {
  constructor() { this.set = new Set(); }
  add(...c) { c.forEach((x) => this.set.add(x)); }
  remove(...c) { c.forEach((x) => this.set.delete(x)); }
  contains(c) { return this.set.has(c); }
  toggle(c, force) {
    const actif = force === undefined ? !this.set.has(c) : force;
    if (actif) this.set.add(c); else this.set.delete(c);
    return actif;
  }
}

class Noeud {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this.classList = new ClassList();
    this.listeners = {};
    this.hidden = false;
    this.value = '';
    this.checked = false;
    this.files = null;
    this.className = '';
    this._texte = '';
  }
  get textContent() {
    if (this.children.length) return this._texte + this.children.map((c) => c.textContent ?? '').join('');
    return this._texte;
  }
  set textContent(v) { this.children = []; this._texte = String(v ?? ''); }
  get firstChild() { return this.children[0] ?? null; }
  get parentNode() { return this._parent ?? null; }
  append(...nodes) { for (const n of nodes) { if (n) { n._parent = this; this.children.push(n); } } }
  appendChild(n) { this.append(n); return n; }
  removeChild(n) { this.children = this.children.filter((c) => c !== n); return n; }
  remove() { if (this._parent) this._parent.removeChild(this); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn); }
  dispatch(type, ev = {}) { for (const f of this.listeners[type] || []) f({ target: this, ...ev }); }
  setPointerCapture() {}
  releasePointerCapture() {}
  focus() {}
  click() { this.dispatch('click', {}); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 900, height: 600, right: 900, bottom: 600 }; }
  querySelector() { return new Noeud('div'); }
  querySelectorAll() { return []; }
  closest() { return null; }
  get innerHTML() { return ''; }
  set innerHTML(_v) { throw new Error('innerHTML ne doit jamais être utilisé avec des données dynamiques'); }
}

const cacheSelecteurs = new Map();
function noeudPour(sel) {
  if (!cacheSelecteurs.has(sel)) cacheSelecteurs.set(sel, new Noeud('div'));
  return cacheSelecteurs.get(sel);
}

const document = {
  documentElement: new Noeud('html'),
  body: new Noeud('body'),
  createElement: (t) => new Noeud(t),
  createTextNode: (t) => { const n = new Noeud('#text'); n.textContent = t; return n; },
  // Comme un vrai navigateur : un sélecteur non textuel doit échouer, pas passer inaperçu.
  querySelector: (sel) => {
    if (typeof sel !== 'string') throw new TypeError(`sélecteur invalide (chaîne attendue) : ${sel}`);
    return noeudPour(sel);
  },
  querySelectorAll: () => [],
  addEventListener() {},
  getElementById: (id) => noeudPour('#' + id),
};

/* ---------------- Globals navigateur ---------------- */
const memoire = new Map();
// Le vrai DOM expose `Node` : `el()` teste `child instanceof Node`.
globalThis.Node = Noeud;
globalThis.document = document;
globalThis.window = globalThis;
// Node >= 21 expose un `navigator` en lecture seule : on le remplace proprement.
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  // Volontairement SANS clé `serviceWorker` : simule un navigateur sans cette API.
  get: () => ({ onLine: true, storage: null }),
});
Object.defineProperty(globalThis, 'location', {
  configurable: true,
  value: { protocol: 'http:', href: 'http://localhost/' },
});
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => memoire.set(k, String(v)),
  removeItem: (k) => memoire.delete(k),
  clear: () => memoire.clear(),
};
globalThis.setInterval = globalThis.setInterval;
globalThis.URL.createObjectURL = () => 'blob:fake';
globalThis.URL.revokeObjectURL = () => {};
globalThis.Blob = class { constructor() {} };
globalThis.confirm = () => true;
globalThis.alert = () => {};

/* fetch lit les fichiers du dépôt */
globalThis.fetch = async (url) => {
  const chemin = join(ROOT, String(url).replace(/^\.\//, ''));
  try {
    const texte = await readFile(chemin, 'utf8');
    return { ok: true, status: 200, async json() { return JSON.parse(texte); }, async text() { return texte; } };
  } catch {
    return { ok: false, status: 404, async json() { throw new Error(`404 ${url}`); }, async text() { return ''; } };
  }
};

process.on('unhandledRejection', (e) => erreurs.push(`Promesse non gérée : ${e?.stack || e}`));
process.on('uncaughtException', (e) => erreurs.push(`Exception non capturée : ${e?.stack || e}`));

/* ---------------- Exécution ---------------- */

/** Recherche récursive d'un nœud (le DOM simulé expose de vrais enfants). */
function chercher(racine, predicat) {
  if (!racine) return null;
  if (predicat(racine)) return racine;
  for (const enfant of racine.children || []) {
    const trouve = chercher(enfant, predicat);
    if (trouve) return trouve;
  }
  return null;
}

async function attendre(predicat, ms = 4000) {
  const debut = Date.now();
  while (Date.now() - debut < ms) {
    if (predicat()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
}

try {
  await import(pathToFileURL(join(ROOT, 'src', 'main.js')).href);

  const pret = await attendre(() => globalThis.__icu?.jeu?.pret === true);
  if (!pret) erreurs.push('Le bootstrap n\'a pas terminé (jeu.pret resté faux).');

  // Laisse le temps à la reprise automatique / au rendu initial de s'exécuter.
  await new Promise((r) => setTimeout(r, 400));

  const jeu = globalThis.__icu?.jeu;
  if (jeu?.pret) {
    console.log(`Catalogue : ${jeu.store.nombreRecettes} recettes officielles, ${jeu.store.nombreElements} éléments.`);
    console.log(`Familiers définis : ${jeu.pets.length} · mondes : ${jeu.mondes.length} · collections : ${jeu.collections.length}`);
    console.log(`Écrans rendus sans erreur · démarrage ${document.documentElement.lang === 'fr' ? 'en français' : 'langue inconnue'}.`);

    /* --- L'écran de chargement doit réellement disparaître (bug corrigé) --- */
    const boot = document.querySelector('#boot');
    const app = document.querySelector('#app');
    if (boot.hidden !== true) erreurs.push("L'écran de chargement n'est pas masqué (attribut hidden).");
    if (boot.style.display !== 'none') erreurs.push("L'écran de chargement n'est pas masqué (display).");
    if (app.hidden !== false) erreurs.push("L'application n'a pas été affichée (#app reste hidden).");

    /* --- Chaque écran doit rendre son contenu (bug corrigé : vues.rendre jamais appelé) --- */
    const { allerA } = globalThis.__icu;
    await jeu.creer(0, 'Fumée', '🧪');
    const cibles = {
      accueil: '#home-status-list', inventaire: '#inv-grid', encyclopedie: '#enc-list',
      quetes: '#quests-body', mondes: '#worlds-body', familiers: '#pets-body', amis: '#friends-card',
      historique: '#hist-body', sauvegardes: '#saves-body', parametres: '#settings-body', profil: '#profile-body',
    };
    for (const [ecran, sel] of Object.entries(cibles)) {
      allerA(ecran);
      await new Promise((r) => setTimeout(r, 30));
      const zone = document.querySelector(sel);
      if (!zone) erreurs.push(`Écran « ${ecran} » : zone ${sel} introuvable.`);
      else if (!zone.children.length) erreurs.push(`Écran « ${ecran} » vide : ${sel} n'a rien reçu après navigation.`);
    }
    console.log(`Écrans rendus : ${Object.keys(cibles).length} vérifiés non vides.`);

    /* --- Les emoji doivent être présents jusque dans le texte rendu --- */
    const texteAccueil = document.querySelector('#home-status-list').textContent;
    if (!EMOJI.test(texteAccueil)) erreurs.push("Aucun emoji dans l'état du jeu rendu (#home-status-list).");

    /* --- Parcours Créativité : une paire inconnue devient un élément officiel, sans question --- */
    const creation = await jeu.fusionner('graal', 'oeuf-vrc', { mode: 'creativite' });
    if (!creation.ok || creation.creation !== true) {
      erreurs.push(`Le mode Créativité n'a pas produit de création (ok=${creation.ok}, statut=${creation.statut}).`);
    } else {
      if (!jeu.save.decouvertes[creation.resultat.id]) erreurs.push("La création n'est pas entrée dans l'inventaire.");
      if (!jeu.store.elements.has(creation.resultat.id)) erreurs.push("La création n'est pas utilisable comme ingrédient.");
      const reprise = await jeu.fusionner('oeuf-vrc', 'graal');
      if (!reprise.ok || reprise.resultat.id !== creation.resultat.id) {
        erreurs.push('Une création doit être reproductible (même paire, même élément).');
      }
      allerA('inventaire');
      await new Promise((r) => setTimeout(r, 30));
      const texteInv = document.querySelector('#inv-grid').textContent;
      if (!texteInv.includes(creation.resultat.nom)) erreurs.push("La création n'apparaît pas dans l'inventaire rendu.");
      if (!texteInv.includes('🧬 Création')) erreurs.push("La création n'est pas signalée par un badge dans l'inventaire.");
      console.log(`Créativité : « ${creation.resultat.nom} » enregistré et visible dans l'inventaire.`);
    }

    /* --- Anti-doublon : trois fois la MÊME fusion n'ajoute qu'UN objet à l'inventaire --- */
    let paireLibre = null;
    for (const a of jeu.store.elements.keys()) {
      for (const b of jeu.store.elements.keys()) {
        if (a >= b || jeu.store.trouver(a, b)) continue;
        const compo = jeu.engine.composerExperimental(a, b);
        if (!compo || jeu.elementParNom(compo.nom)) continue;
        paireLibre = [a, b];
        break;
      }
      if (paireLibre) break;
    }
    if (!paireLibre) {
      erreurs.push('Aucune paire sans recette officielle : anti-doublon non vérifiable.');
    } else {
      const avantDoublon = Object.keys(jeu.save.decouvertes).length;
      const trois = [];
      for (let i = 0; i < 3; i++) trois.push(await jeu.fusionner(paireLibre[0], paireLibre[1], { mode: 'creativite' }));
      const apresDoublon = Object.keys(jeu.save.decouvertes).length;
      if (!trois.every((r) => r.ok)) erreurs.push('Une des trois fusions identiques a échoué.');
      else if (trois[0].resultat.id !== trois[2].resultat.id) erreurs.push('Les trois fusions identiques ne visent pas le même objet.');
      else if (trois.slice(1).some((r) => r.statut === 'nouveau')) erreurs.push('Les fusions répétées sont annoncées comme une nouveauté.');
      else if (apresDoublon !== avantDoublon + 1) erreurs.push(`Trois fusions identiques ont ajouté ${apresDoublon - avantDoublon} objets au lieu d'un seul.`);
      else {
        allerA('inventaire');
        await new Promise((r) => setTimeout(r, 30));
        const texteInventaire = document.querySelector('#inv-count').textContent;
        if (!texteInventaire.includes(`sur ${apresDoublon} découvert`)) {
          erreurs.push(`L'inventaire rendu n'annonce pas ${apresDoublon} découvertes : ${texteInventaire}`);
        } else {
          console.log(`Anti-doublon : trois fusions identiques → un seul objet (${apresDoublon - avantDoublon} ajouté, inventaire à ${apresDoublon}).`);
        }
      }
    }

    /* --- Potions : bouton réel dans l'écran Familiers, +1 niveau et quota rechargé --- */
    jeu.save.potions = 2;
    jeu.quota.restant = 2;
    allerA('familiers');
    await new Promise((r) => setTimeout(r, 30));
    const texteQuota = document.querySelector('#quota-card').textContent;
    if (!/Potions de familier/.test(texteQuota)) erreurs.push("Le compteur de potions n'est pas affiché sur l'écran Familiers.");
    const boutonPotion = chercher(document.querySelector('#pets-body'), (n) => n.tagName === 'BUTTON' && n.textContent.includes('Donner une potion'));
    if (!boutonPotion) {
      erreurs.push("Le bouton « Donner une potion » est absent de l'écran Familiers.");
    } else {
      const niveauAvant = jeu.save.familiers.flammichou.niveau;
      boutonPotion.click();
      if (jeu.save.familiers.flammichou.niveau !== niveauAvant + 1) erreurs.push("La potion n'a pas fait monter le familier d'exactement un niveau.");
      if (jeu.etatQuota().restant !== 5) erreurs.push(`La potion n'a pas rechargé le quota d'aides (restant=${jeu.etatQuota().restant}).`);
      if (jeu.save.potions !== 1) erreurs.push('La potion donnée doit être décomptée.');
      console.log(`Potion : Flammichou niveau ${niveauAvant} → ${jeu.save.familiers.flammichou.niveau}, quota rechargé à 5/5.`);
    }

    /* --- Amis : demande par pseudonyme, notification « voulez-vous l'ajouter ? », potions --- */
    const { creerDemande, POINTS_PAR_AMI } = await import(pathToFileURL(join(ROOT, 'src', 'social', 'friends.js')).href);
    const envoiAmi = await jeu.demanderAmi('Camille');
    if (!envoiAmi.ok) {
      erreurs.push(`Demande d'ami refusée : ${envoiAmi.erreur}`);
    } else {
      if (!String(envoiAmi.code || '').startsWith('ICU-AMI1:')) erreurs.push("Le code d'invitation de la demande d'ami est absent.");
      if (jeu.etatAmis().envoyees.length !== 1) erreurs.push("La demande envoyée n'est pas mémorisée.");
      console.log(`Amis : demande envoyée à Camille (relais : ${envoiAmi.livre ? 'oui' : 'non — code fourni'}).`);
    }

    const potionsAvantAmis = jeu.save.potions;
    const demandeRecue = creerDemande({ de: 'Dora', vers: jeu.save.nom }).demande;
    const reception = jeu.recevoirDemande(demandeRecue, { origine: 'relais' });
    if (!reception.ok) {
      erreurs.push(`Réception d'une demande d'ami impossible : ${reception.erreur}`);
    } else {
      const texteModal = document.querySelector('#modal-body').textContent;
      if (document.querySelector('#modal').hidden !== false) erreurs.push("La notification de demande d'ami ne s'affiche pas (modale masquée).");
      if (!texteModal.includes('veut vous ajouter dans vos amis')) erreurs.push("Le texte « veut vous ajouter dans vos amis » est absent de la notification.");
      if (!texteModal.includes(String(POINTS_PAR_AMI))) erreurs.push("La notification n'annonce pas les 10 potions.");

      const accept = await jeu.accepterAmi(reception.demande.id);
      if (!accept.ok) erreurs.push(`Acceptation de l'ami impossible : ${accept.erreur}`);
      else if (accept.potions !== POINTS_PAR_AMI) erreurs.push(`Un ami accepté doit rapporter ${POINTS_PAR_AMI} potions (reçu : ${accept.potions}).`);
      else if (jeu.save.potions !== potionsAvantAmis + POINTS_PAR_AMI) erreurs.push('Les potions de l’ami ne sont pas créditées.');
      else {
        allerA('amis');
        await new Promise((r) => setTimeout(r, 30));
        const texteListe = document.querySelector('#friends-list').textContent;
        if (!texteListe.includes('Dora')) erreurs.push("L'ami accepté n'apparaît pas dans la liste affichée.");
        console.log(`Amis : « Dora » acceptée → +${accept.potions} potions (total ${jeu.save.potions}), visible dans la liste.`);
      }
    }

    /* --- Relais d'amis : chemin complet (demande livrée par le réseau + notification) --- */
    // Deux joueurs différents écrivent à tour de rôle : la 1re demande est retirée par la
    // synchronisation directe, la 2e est livrée par l'interrogation automatique du bootstrap.
    const fetchOriginal = globalThis.fetch;
    const relaisFactice = 'https://relais-test.example';
    const boiteRelais = [
      { type: 'demande', id: 'dem_relais1', de: { id: 'zoe-1', nom: 'Zoé' }, date: new Date().toISOString() },
      { type: 'demande', id: 'dem_relais2', de: { id: 'lea-1', nom: 'Léa' }, date: new Date().toISOString() },
    ].map((e) => ({ ...e, vers: { id: jeu.identifiantJoueur(), nom: jeu.save.nom } }));
    // Profils publiés par les autres joueurs sur le relais factice (rangés sous leur identifiant).
    const profilsPublies = new Map();
    const profilDiffuse = (id, nom, options = {}) => profilsPublies.set(id, {
      v: 1, type: 'profil', id, nom, avatar: '🔥', date: new Date().toISOString(), jeuVersion: '1.2.0',
      progression: { niveau: options.niveau ?? 7, xp: 900 },
      decouvertes: {
        total: 42, catalogue: 260, creations: 3,
        parRarete: { Commun: 20, 'Peu commun': 12, Rare: 8, 'Épique': 2, Légendaire: 0, Mythique: 0, Cosmique: 0, Secret: 0 },
        dernieres: [{ id: 'vapeur', nom: 'Vapeur', emoji: '☁️', rarete: 'Commun', date: new Date().toISOString(), source: 'officielle', premiere: true }],
      },
      familiers: { total: 2, liste: [{ id: 'flammichou', nom: 'Flammichou', emoji: '🔥', niveau: 4, equipe: true }], equipe: ['flammichou'] },
      mondes: { total: 3, referentiel: 8, liste: [{ id: 'libre', nom: 'Genèse', emoji: '🌍' }] },
      collections: { completees: 1, referentiel: 8, liste: [{ id: 'meteo', nom: 'Météorologue', emoji: '⛈️', complete: true }] },
      succes: { total: 4, referentiel: 12, liste: [{ id: 'premiere-fusion', nom: 'Première fusion' }] },
      stats: { fusionsTentees: 120, quetesTerminees: 5, aidesUtilisees: 3, joursDeJeu: 6, serie: 2, potions: 4, amis: 1 },
    });
    const jsonFactice = (corps) => ({ ok: true, status: 200, async json() { return corps; }, async text() { return JSON.stringify(corps); } });
    globalThis.fetch = async (url, options = {}) => {
      const u = String(url);
      if (!u.includes('relais-test')) return fetchOriginal(url, options);
      // Publication d'un profil (POST /profil) et lecture des profils des amis (GET /profils).
      if (u.includes('/profil') && !u.includes('/profils') && options.method === 'POST') {
        const profil = JSON.parse(options.body).profil;
        profilsPublies.set(profil.id, profil);
        return jsonFactice({ ok: true });
      }
      if (u.includes('/profils')) {
        const ids = (new URL(u).searchParams.get('ids') || '').split(',');
        return jsonFactice({ ok: true, profils: ids.map((id) => profilsPublies.get(id)).filter(Boolean) });
      }
      if (options.method === 'POST') return jsonFactice({ ok: true });
      const suivant = boiteRelais.shift();
      return jsonFactice({ evenements: suivant ? [suivant] : [] });
    };
    jeu.majConfigAmis({ endpoint: relaisFactice, actif: true });
    if (!jeu.configAmis().actif) erreurs.push("La configuration du relais d'amis n'est pas enregistrée.");
    const direct = await jeu.synchroniserAmis();
    if (!direct.ok) erreurs.push(`Synchronisation par relais impossible : ${direct.erreur}`);
    else if (direct.nouvelles.length !== 1) erreurs.push(`Le relais devait livrer 1 demande (reçu : ${direct.nouvelles.length}).`);
    else if (direct.nouvelles[0].nom !== 'Zoé') erreurs.push(`Demande attribuée au mauvais joueur : ${direct.nouvelles[0].nom}.`);
    else console.log(`Relais d'amis : demande de « ${direct.nouvelles[0].nom} » reçue par synchronisation directe.`);

    const sync = await globalThis.__icu.synchroniserAmis();
    if (!sync || !sync.ok) erreurs.push(`Synchronisation par le bootstrap impossible : ${sync ? sync.erreur : 'aucun résultat'}`);
    else if (sync.nouvelles.length !== 1) erreurs.push(`L'interrogation automatique devait livrer 1 demande (reçu : ${sync.nouvelles.length}).`);
    else if (document.querySelector('#modal').hidden !== false) erreurs.push("La notification venue du relais ne s'affiche pas.");
    else if (!document.querySelector('#modal-body').textContent.includes('Léa veut vous ajouter dans vos amis')) {
      erreurs.push("Le texte « Léa veut vous ajouter dans vos amis » est absent de la notification du relais.");
    } else console.log(`Relais d'amis : « Léa » reçue par l'interrogation automatique, notification affichée.`);

    // Mon profil doit avoir été publié sous mon identifiant par la synchronisation.
    const monProfilPublie = profilsPublies.get(jeu.identifiantJoueur());
    if (!monProfilPublie) erreurs.push("Mon profil n'a pas été publié sur le relais.");
    else if (monProfilPublie.nom !== jeu.save.nom) erreurs.push('Le profil publié ne porte pas mon pseudonyme.');
    else if (typeof monProfilPublie.decouvertes?.total !== 'number') erreurs.push('Le profil publié n’expose pas mes découvertes.');
    else console.log(`Profil partagé : publié sur le relais et détaillé (${monProfilPublie.decouvertes.total} découvertes, ${monProfilPublie.familiers.total} familiers).`);

    // Une demande déjà traitée (acceptée) ne doit pas revenir si le relais la rediffuse.
    const acceptee = await jeu.accepterAmi((direct.nouvelles[0] || {}).id || 'dem_relais1');
    if (!acceptee.ok) erreurs.push(`Acceptation de l'ami venu du relais impossible : ${acceptee.erreur}`);
    boiteRelais.push({ type: 'demande', id: 'dem_relais1', de: { id: 'zoe-1', nom: 'Zoé' }, date: direct.nouvelles[0]?.date || new Date().toISOString(), vers: { id: jeu.identifiantJoueur(), nom: jeu.save.nom } });
    const relecture = await jeu.synchroniserAmis();
    if (!relecture.ok) erreurs.push(`Nouvelle synchronisation impossible : ${relecture.erreur}`);
    else if (relecture.nouvelles.length) erreurs.push("Une demande déjà acceptée a été renotifiée par le relais.");
    else console.log("Relais d'amis : une demande déjà acceptée n'est pas renotifiée.");

    // Un ami ayant publié son profil doit apparaître chez moi, avec ses statistiques.
    const idZoe = jeu.etatAmis().liste.find((a) => a.nom === 'Zoé')?.id;
    if (!idZoe) erreurs.push("L'ami « Zoé » n'est pas dans ma liste : profil impossible à tester.");
    else {
      profilDiffuse(idZoe, 'Zoé', { niveau: 12 });
      const rafraichi = await jeu.synchroniserProfils({ publier: false });
      if (!rafraichi.ok) erreurs.push(`Rafraîchissement des profils d'amis impossible : ${rafraichi.erreur}`);
      const vu = jeu.profilAmi(idZoe);
      if (!vu) erreurs.push("Le profil publié par un ami n'a pas été récupéré.");
      else if (vu.nom !== 'Zoé' || vu.progression.niveau !== 12 || vu.decouvertes.total !== 42) {
        erreurs.push(`Profil d'ami incomplet : ${JSON.stringify({ nom: vu.nom, niveau: vu.progression?.niveau })}`);
      } else if (!vu.familiers.liste.length || vu.stats.fusionsTentees !== 120) {
        erreurs.push("Le profil d'ami n'expose pas ses familiers et ses statistiques.");
      } else console.log(`Profil d'ami : « ${vu.nom} » niveau ${vu.progression.niveau}, ${vu.decouvertes.total} découvertes, ${vu.familiers.total} familiers, ${vu.stats.fusionsTentees} fusions.`);
    }

    // Le profil d'un ami s'importe aussi par code, sans relais (chemin hors ligne).
    const codeProfil = jeu.codeProfil();
    if (!codeProfil.ok) erreurs.push(`Code de profil impossible : ${codeProfil.erreur}`);
    else {
      const importe = jeu.importerProfil(codeProfil.code);
      if (!importe.ok) erreurs.push(`Import du code de profil impossible : ${importe.erreur}`);
      else if (jeu.profilAmi(importe.profil.id)?.nom !== jeu.save.nom) erreurs.push('Le profil importé par code ne correspond pas.');
      else console.log(`Profil partagé : code relu et importé (${importe.profil.nom}).`);
      const profilEtranger = jeu.importerProfil('n’importe quoi');
      if (profilEtranger.ok) erreurs.push('Un texte quelconque ne doit pas être accepté comme profil.');
    }

    /* --- La fiche d'un ami : objets, objets rares, animaux, équipe, comparaison, stats --- */
    allerA('amis');
    await new Promise((r) => setTimeout(r, 30));
    const listeRendue = document.querySelector('#friends-list').textContent;
    if (!/📦 \d+ objets/.test(listeRendue)) erreurs.push("La liste d'amis n'affiche pas le nombre d'objets d'un ami.");
    if (!/🐾 \d+ animaux/.test(listeRendue)) erreurs.push("La liste d'amis n'affiche pas le nombre d'animaux d'un ami.");
    if (!chercher(document.querySelector('#friends-list'), (n) => n.tagName === 'BUTTON' && n.textContent.includes('Tout rafraîchir'))) {
      erreurs.push("Le bouton « Tout rafraîchir » est absent de la liste d'amis.");
    }
    const itemAmi = chercher(document.querySelector('#friends-list'), (n) => n.className === 'item' && n.textContent.includes('Zoé'));
    const boutonFiche = itemAmi ? chercher(itemAmi, (n) => n.tagName === 'BUTTON' && n.textContent.includes('Voir le profil')) : null;
    if (!boutonFiche) {
      erreurs.push("Le bouton « Voir le profil » n'est pas rendu pour un ami ayant partagé son profil.");
    } else {
      boutonFiche.click();
      await new Promise((r) => setTimeout(r, 30));
      const fiche = document.querySelector('#modal-body').textContent;
      const attendus = [
        ['📦 Objets', "le compteur d'objets"],
        ['💎 Objets rares', "le compteur d'objets rares"],
        ['🔎 Ses plus beaux objets :', 'ses plus beaux objets'],
        ['🐾 Familiers (', 'ses animaux'],
        ['— ses animaux', 'le détail de ses animaux'],
        ['🎽 Équipe active', 'son équipe active'],
        ['⚖️ Vous et', 'la comparaison avec ma partie'],
        ['🔮 Objets par jour de jeu', 'son rythme de jeu'],
        ['📊 Statistiques', 'ses statistiques'],
      ];
      const manquants = attendus.filter(([extrait]) => !fiche.includes(extrait)).map(([, quoi]) => quoi);
      if (manquants.length) erreurs.push(`Fiche d'ami incomplète : ${manquants.join(', ')}.`);
      else console.log("Fiche d'ami : objets, objets rares, animaux, équipe, comparaison et statistiques affichés.");
    }
    globalThis.fetch = fetchOriginal;
  }
} catch (e) {
  erreurs.push(`Échec du chargement de main.js : ${e.stack || e}`);
}

if (erreurs.length) {
  console.error('\nÉCHEC du test de fumée :');
  for (const e of erreurs) console.error('  ✖ ' + e);
  process.exit(1);
}
console.log('\nBootstrap navigateur exécuté sans erreur (DOM simulé).');
process.exit(0);
