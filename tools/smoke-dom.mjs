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
  querySelector: (sel) => noeudPour(sel),
  querySelectorAll: () => [],
  addEventListener() {},
  getElementById: (id) => noeudPour('#' + id),
};

/* ---------------- Globals navigateur ---------------- */
const memoire = new Map();
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
