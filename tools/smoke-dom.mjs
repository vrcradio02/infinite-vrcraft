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
      quetes: '#quests-body', mondes: '#worlds-body', familiers: '#pets-body',
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
      console.log(`Potion : Flammichou niveau ${niveauAvant} → ${jeu.save.familiers.chieval.niveau}, quota rechargé à 5/5.`);
    }
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
