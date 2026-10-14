/**
 * Tests de la mise à jour du site : service worker et écran de chargement.
 *
 * Ces tests verrouillent une régression réellement observée en ligne : après la
 * correction du bug d'affichage, certains visiteurs voyaient TOUJOURS l'écran
 * « Chargement du catalogue… ». Cause : le service worker servait toute la coquille
 * « cache d'abord » avec un nom de cache figé, donc l'ancien `index.html` et l'ancien
 * `src/main.js` (bogués) étaient resservis indéfiniment, y compris après republication.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (rel) => readFile(join(ROOT, rel), 'utf8');

const sw = await lire('sw.js');
// Version sans commentaires : les assertions structurelles ne doivent pas être
// trompées par la documentation (qui cite l'ancien nom de cache à titre d'exemple).
const swNet = sw.replace(/\/\*[\s\S]*?\*\//g, '');
const html = await lire('index.html');
const mainJs = await lire('src/main.js');
const css = await lire('src/styles/main.css');

/* ------------------------- Service worker ------------------------- */

test('le nom du cache contient une version (sinon les anciens caches ne sont jamais purgés)', () => {
  const version = swNet.match(/const VERSION = '([^']+)'/);
  assert.ok(version, 'constante VERSION absente de sw.js');
  assert.match(swNet, /const CACHE = `icu-\$\{VERSION\}`/, 'CACHE doit être dérivé de VERSION');
  assert.ok(!/'icu-v1'/.test(swNet) && !/="icu-v1"/.test(swNet), 'un nom de cache figé empêcherait toute mise à jour');
});

test('l’activation supprime les anciens caches et prend la main immédiatement', () => {
  const activate = swNet.match(/addEventListener\('activate'[\s\S]*?\n\}\);/);
  assert.ok(activate, 'gestionnaire « activate » absent');
  assert.match(activate[0], /caches\.keys\(\)/);
  assert.match(activate[0], /caches\.delete\(k\)/);
  assert.match(activate[0], /clients\.claim\(\)/);
  assert.match(swNet, /skipWaiting\(\)/, 'la nouvelle version doit prendre la main sans attendre');
});

test('les navigations sont servies « réseau d’abord » (une nouvelle version est vue au rechargement)', () => {
  assert.match(swNet, /async function reseauDAbord/, 'fonction reseauDAbord absente');
  const fetchHandler = swNet.match(/addEventListener\('fetch'[\s\S]*?\n\}\);/);
  assert.ok(fetchHandler, 'gestionnaire « fetch » absent');
  assert.match(fetchHandler[0], /req\.mode === 'navigate'/, 'les navigations doivent être détectées');
  assert.match(fetchHandler[0], /reseauDAbord\(req, '\.\/index\.html'\)/, 'les navigations doivent passer par le réseau d’abord');
  // La coquille ne doit plus être servie « cache d’abord » sans rafraîchissement.
  assert.ok(!/caches\.match\(req\)\.then\(\(r\) => r \|\| fetch/.test(swNet), 'régression : coquille servie « cache d’abord » sans mise à jour');
});

test('la coquille pré-cachée ne référence que des fichiers qui existent', () => {
  const bloc = sw.match(/const COQUILLE = \[([\s\S]*?)\];/);
  assert.ok(bloc, 'liste COQUILLE absente');
  const fichiers = [...bloc[1].matchAll(/'(\.\/[^']+)'/g)].map((m) => m[1].replace(/^\.\//, ''));
  assert.ok(fichiers.length >= 20, `fichiers pré-cachés : ${fichiers.length}`);
  for (const f of fichiers) {
    if (f === '') continue; // './' = page d'accueil
    assert.ok(existsSync(join(ROOT, f)), `fichier pré-caché introuvable : ${f}`);
  }
});

/* --------------------- Écran de chargement --------------------- */

test('l’écran de chargement propose des actions de secours (jamais de blocage définitif)', () => {
  assert.match(html, /id="boot-actions"[^>]*hidden/, 'le bloc d’actions doit exister et être masqué au départ');
  assert.match(html, /id="btn-boot-reload"/, 'bouton « Recharger » absent');
  assert.match(html, /id="btn-boot-reset"/, 'bouton « Vider le cache et recharger » absent');
  assert.match(html, /id="boot-version"/, 'la version doit être affichée sur l’écran de chargement');
  assert.match(html, /id="app-version"/, 'la version doit être affichée dans les crédits');
});

test('le bootstrap surveille le chargement et réagit à l’échec comme au délai dépassé', () => {
  assert.match(mainJs, /DELAI_MAX_CHARGEMENT/, 'aucun délai maximal de chargement');
  assert.match(mainJs, /function signalerProblemeChargement/, 'aucun message de problème de chargement');
  const demarrer = mainJs.match(/async function demarrer\(\)[\s\S]*?\n\}/);
  assert.ok(demarrer, 'fonction demarrer() absente');
  assert.match(demarrer[0], /setTimeout\(\(\) => \{\s*signalerProblemeChargement/, 'la veille doit signaler le dépassement de délai');
  assert.match(demarrer[0], /catch \(e\) \{[\s\S]*?signalerProblemeChargement/, 'une erreur d’initialisation doit aussi être signalée');
  assert.match(demarrer[0], /activerActionsDeSecours\(\)/, 'les boutons de secours doivent être actifs dès le départ');
});

test('le bouton de secours vide cache et service worker avant de recharger', () => {
  const fn = mainJs.match(/function activerActionsDeSecours\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'fonction activerActionsDeSecours() absente');
  assert.match(fn[0], /getRegistrations\(\)/, 'les services workers doivent être désinscrits');
  assert.match(fn[0], /caches\.delete\(k\)/, 'les caches doivent être vidés');
  assert.match(fn[0], /location\.reload\(\)/, 'la page doit être rechargée');
});

test('une nouvelle version du service worker déclenche un rechargement unique et sans boucle', () => {
  const fn = mainJs.match(/function installerServiceWorker\(\)[\s\S]*?\n\}/);
  assert.ok(fn, 'fonction installerServiceWorker() absente');
  assert.match(fn[0], /controllerchange/);
  assert.match(fn[0], /avaitControleur/, 'le rechargement ne doit avoir lieu que si un service worker contrôlait déjà la page');
  assert.match(fn[0], /rechargeEffectuee/, 'le rechargement doit être limité à une fois (pas de boucle)');
});

test('les actions de secours restent lisibles (style présent, masquage !important préservé)', () => {
  assert.match(css, /\.boot-actions\s*\{[^}]*display:\s*flex/, 'style .boot-actions absent');
  assert.match(css, /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/, 'la règle globale [hidden] doit rester !important');
});
