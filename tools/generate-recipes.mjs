#!/usr/bin/env node
/**
 * Générateur de recettes par lots (étape 84).
 *
 * Produit des CANDIDATS (statut « candidat »), jamais des recettes officielles :
 * la promotion en officiel reste une décision humaine après relecture (étape 45).
 *
 * Usage :
 *   node tools/generate-recipes.mjs --count 2000 [--seed monseed] [--dry]
 *
 * Le générateur :
 *  - combine des éléments existants non encore associés,
 *  - forge un nom de résultat DÉTERMINISTE et distinct (même graine => même sortie),
 *  - refuse les doublons de paire, les résultats vides et les ingrédients inconnus,
 *  - écrit data/elements-genere.json + data/fusions/lot-genere.json + un rapport.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

/* ---------- PRNG déterministe (mulberry32) ---------- */
function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function seededRandom(seed) {
  let a = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SUFFIXES = ['ium', 'ite', 'on', 'ia', 'ure', 'ax', 'or', 'el', 'yne', 'os'];
const PREFIXES = ['néo-', 'ultra-', 'proto-', 'méga-', 'micro-', 'hyper-', 'omni-'];
const QUALIFICATIFS = ['Cosmique', 'Quantique', 'Sauvage', 'Ancien', 'Cristallin', 'Nomade', 'Vibrant', 'Silencieux', 'Éthéré', 'Absolu'];
const RARETES = ['Commun', 'Peu commun', 'Rare', 'Épique'];

function racine(nom) {
  const mot = String(nom).split(' ')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return mot.replace(/[^a-z]/g, '').slice(0, 8) || 'mystere';
}
function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function pairKey(a, b) { return a <= b ? `${a}|${b}` : `${b}|${a}`; }

function parseArgs(argv) {
  const args = { count: 100, seed: 'vrc', dry: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') args.count = Math.max(0, parseInt(argv[++i], 10) || 0);
    else if (argv[i] === '--seed') args.seed = String(argv[++i]);
    else if (argv[i] === '--dry') args.dry = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const elements = JSON.parse(await readFile(join(DATA, 'elements.json'), 'utf8')).elements;
  let registre = { recipes: [] };
  try {
    registre = JSON.parse(await readFile(join(DATA, 'registre-fusions.json'), 'utf8'));
  } catch { /* première exécution : pas encore de registre */ }

  const pairesConnues = new Set(registre.recipes.map((r) => pairKey(r.a, r.b)));
  const idsElements = new Set(Object.keys(elements));
  const nomsResultats = new Set(Object.values(elements).map((t) => t[0]));

  const ids = Object.keys(elements);
  const rnd = seededRandom(args.seed);
  const rapport = { graine: args.seed, demandees: args.count, produites: 0, rejets: { doublonPaire: 0, resultatExistant: 0, ingredientInconnu: 0 } };

  const nouveauxElements = {};
  const nouvellesRecettes = [];
  let tentatives = 0;
  const maxTentatives = Math.max(1000, args.count * 40);

  while (nouvellesRecettes.length < args.count && tentatives < maxTentatives) {
    tentatives++;
    const a = ids[Math.floor(rnd() * ids.length)];
    const b = ids[Math.floor(rnd() * ids.length)];
    if (!idsElements.has(a) || !idsElements.has(b)) { rapport.rejets.ingredientInconnu++; continue; }
    const key = pairKey(a, b);
    if (pairesConnues.has(key)) { rapport.rejets.doublonPaire++; continue; }

    const nomA = elements[a][0];
    const nomB = elements[b][0];
    const h = hashString(key);
    const mode = h % 5;
    let nomResultat;
    if (mode === 0) nomResultat = cap(racine(nomA) + SUFFIXES[h % SUFFIXES.length]);
    else if (mode === 1) nomResultat = cap(PREFIXES[h % PREFIXES.length] + racine(nomA) + SUFFIXES[(h >> 3) % SUFFIXES.length]);
    else if (mode === 2) nomResultat = `${cap(racine(nomA))} de ${racine(nomB)}`;
    else if (mode === 3) nomResultat = `${cap(racine(nomA))} ${QUALIFICATIFS[h % QUALIFICATIFS.length]}`;
    else nomResultat = `${cap(racine(nomB))}-${racine(nomA)}`;

    if (!nomResultat || nomResultat.length < 3) { rapport.rejets.resultatExistant++; continue; }
    if (nomsResultats.has(nomResultat)) { rapport.rejets.resultatExistant++; continue; }

    const idResultat = `g-${slugify(nomResultat)}`;
    const cat = elements[a][1];
    const monde = elements[a][3];
    const rarete = RARETES[(h >>> 5) % RARETES.length];

    nouveauxElements[idResultat] = [nomResultat, cat, rarete, monde, '✨', `Création générée : ${nomA} + ${nomB}. Candidat à relecture.`];
    nouvellesRecettes.push([a, b, idResultat]);
    pairesConnues.add(key);
    nomsResultats.add(nomResultat);
  }

  rapport.produites = nouvellesRecettes.length;
  rapport.elementsCrees = Object.keys(nouveauxElements).length;

  console.log(`Candidats produits : ${rapport.produites} (éléments créés : ${rapport.elementsCrees})`);
  console.log('Rejets :', JSON.stringify(rapport.rejets));

  if (args.dry) {
    console.log('Mode --dry : aucun fichier écrit.');
    return;
  }

  await writeFile(join(DATA, 'elements-genere.json'), JSON.stringify({ meta: { version: 1, format: 'elements-source', origine: 'generate-recipes.mjs', graine: args.seed }, elements: nouveauxElements }, null, 2) + '\n', 'utf8');
  await writeFile(join(DATA, 'fusions', 'lot-genere.json'), JSON.stringify({
    lot: 'genere',
    monde: 'libre',
    version: 1,
    statut: 'candidat',
    description: 'Lot généré automatiquement. Statut « candidat » : ces recettes ne comptent pas comme officielles avant relecture.',
    recipes: nouvellesRecettes,
  }, null, 2) + '\n', 'utf8');
  await writeFile(join(ROOT, 'tools', 'rapport-generation.json'), JSON.stringify(rapport, null, 2) + '\n', 'utf8');
  console.log('Écrit : data/elements-genere.json, data/fusions/lot-genere.json');
  console.log('Relancez « npm run build && npm run validate » pour intégrer les candidats.');
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

main().catch((e) => { console.error(e); process.exit(1); });
