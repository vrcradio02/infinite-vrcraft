/**
 * Tests de l'habillage : affichage (attribut `hidden`) et emoji.
 *
 * Ces tests verrouillent deux régressions réellement observées :
 *  1. l'écran de chargement qui ne disparaissait jamais, car une classe CSS
 *     déclarant `display: grid` écrasait le `display: none` de `[hidden]` ;
 *  2. des écrans sans émoji, alors que l'interface doit rester lisible et vivante.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync as lireSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (rel) => readFile(join(ROOT, rel), 'utf8');
const coreLire = (rel) => lireSync(join(ROOT, rel), 'utf8');

const html = await lire('index.html');
const css = await lire('src/styles/main.css');
const mainJs = await lire('src/main.js');
const cssNet = css.replace(/\/\*[\s\S]*?\*\//g, '');
const EMOJI = /\p{Extended_Pictographic}/u;

/* ----------------------------- Affichage ----------------------------- */

test('le CSS neutralise toujours l’attribut hidden (sans quoi le chargement resterait affiché)', () => {
  const regles = [...cssNet.matchAll(/([^{}]+)\{([^}]*)\}/g)];
  const globales = regles.filter(([, sel, corps]) => sel.trim() === '[hidden]' && /display\s*:\s*none\s*!important/.test(corps));
  assert.ok(globales.length >= 1, 'règle globale « [hidden] { display: none !important; } » absente de main.css');
});

test('aucune règle d’affichage ne peut l’emporter sur [hidden] sans !important', () => {
  // Toutes les classes qui déclarent un `display` sont autorisées tant que la règle
  // globale [hidden] est marquée !important : on vérifie donc qu'elle l'est bien.
  const globale = [...cssNet.matchAll(/([^{}]+)\{([^}]*)\}/g)].find(([, sel, corps]) => sel.trim() === '[hidden]' && /display/.test(corps));
  assert.ok(globale, 'aucune règle [hidden] dans main.css');
  assert.match(globale[2], /!important/, 'la règle [hidden] doit utiliser !important pour battre .boot/.app/.row');
});

test('les éléments masqués au chargement sont déclarés avec hidden dans index.html', () => {
  assert.match(html, /<div id="app" class="app" hidden>/);
  for (const id of ['screen-accueil', 'screen-jeu', 'screen-quetes', 'screen-sauvegardes']) {
    const re = new RegExp(`id="${id}"[^>]*hidden`);
    assert.match(html, re, `#${id} doit être masqué au chargement`);
  }
});

test('le bootstrap masque l’écran de chargement avec hidden ET display:none', () => {
  const fn = mainJs.match(/function afficherApplication\(\)\s*\{[\s\S]*?\n\}/);
  assert.ok(fn, 'fonction afficherApplication() absente de src/main.js');
  assert.match(fn[0], /boot\.hidden = true/);
  assert.match(fn[0], /boot\.style\.display = 'none'/);
  assert.match(fn[0], /app\.hidden = false/);
});

test('chaque changement d’écran rend son contenu', () => {
  assert.match(mainJs, /onEcran\(\(nom\)\s*=>\s*\{[\s\S]*?vues\.rendre\(nom\)/, 'onEcran doit appeler vues.rendre(nom)');
});

test('les listes déroulantes reçoivent l’ÉLÉMENT, pas un sélecteur déjà résolu', () => {
  const views = coreLire('src/ui/views.js');
  assert.match(views, /_remplirSelect\(node, labelTous, valeurs\)/, 'le paramètre doit être l’élément');
  assert.ok(!/const node = \$\(sel\)/.test(views), 'régression : $(élément) lève « is not a valid selector » dans un vrai navigateur');
});

test('le DOM simulé du test de fumée refuse un sélecteur non textuel', () => {
  const smoke = coreLire('tools/smoke-dom.mjs');
  assert.match(smoke, /typeof sel !== 'string'/, 'le DOM simulé doit échouer comme un vrai navigateur');
});

/* ------------------------------- Emoji ------------------------------- */

test('chaque bouton de navigation porte un emoji hors de sa zone traduite', () => {
  const boutons = [...html.matchAll(/<button class="nav-btn"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
  assert.ok(boutons.length >= 10, `boutons de navigation trouvés : ${boutons.length}`);
  for (const b of boutons) {
    const avantTraduction = b.split('data-i18n')[0];
    assert.match(avantTraduction, EMOJI, `bouton sans emoji : ${b.trim()}`);
  }
});

test('chaque carte d’action de l’accueil porte un emoji', () => {
  const cartes = [...html.matchAll(/<button class="card action-card"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]);
  assert.ok(cartes.length >= 6, `cartes d'action trouvées : ${cartes.length}`);
  for (const c of cartes) assert.match(c, EMOJI, `carte sans emoji : ${c.trim()}`);
});

test('chaque écran porte un titre avec emoji', () => {
  const ecrans = [...html.matchAll(/<section class="screen"[^>]*>([\s\S]*?)<\/section>/g)].map((m) => m[1]);
  assert.ok(ecrans.length >= 10, `écrans trouvés : ${ecrans.length}`);
  for (const e of ecrans) {
    const titre = e.match(/<h2[^>]*>([\s\S]*?)<\/h2>/);
    assert.ok(titre, 'écran sans titre <h2>');
    assert.match(titre[1], EMOJI, `titre sans emoji : ${titre[1].trim()}`);
  }
});

test('l’écran de chargement porte un emoji', () => {
  const boot = html.match(/<div id="boot"[\s\S]*?<\/div>\s*\n\s*<!-- Coquille/);
  assert.ok(boot, 'bloc #boot introuvable');
  assert.match(boot[0], EMOJI);
});

test('les filtres et les listes déroulantes du HTML portent des emoji', () => {
  const options = [...html.matchAll(/<option value="[^"]*">([^<]*)<\/option>/g)].map((m) => m[1]);
  assert.ok(options.length >= 10, `options trouvées : ${options.length}`);
  for (const o of options) assert.match(o, EMOJI, `option sans emoji : ${o}`);
});

test('les libellés générés en JavaScript portent aussi des emoji', () => {
  const views = coreLire('src/ui/views.js');
  const board = coreLire('src/ui/board.js');
  for (const extrait of [
    '📅 Quêtes quotidiennes',
    '🏆 Collections thématiques',
    '🎁 Réclamer la récompense',
    '📊 Statistiques',
    '💾 Sauvegarde ${s.slot + 1}',
    '🎨 Thème',
  ]) {
    assert.ok(views.includes(extrait), `libellé attendu absent de views.js : ${extrait}`);
  }
  assert.match(board, /🧹 Plateau nettoyé\./);
});
