#!/usr/bin/env node
/**
 * Compile le registre officiel des fusions.
 *
 * Entrées  : data/elements.json (format compact) + data/fusions/lot-*.json
 * Sortie   : data/registre-fusions.json (format développé, indexable)
 * Rapport  : tools/rapport-registre.json
 *
 * Règles appliquées :
 *  - une paire d'ingrédients = une seule recette (doublons signalés et ignorés),
 *  - les ingrédients inconnus ou les résultats vides sont rejetés,
 *  - la catégorie et la rareté d'une recette proviennent TOUJOURS de l'élément résultat
 *    (cohérence garantie, pas de recopie manuelle),
 *  - chaque recette reçoit un identifiant stable dérivé de la paire,
 *  - la compilation est DÉTERMINISTE : relancer `npm run build` sans changer les
 *    données ne produit aucun diff, ce qui permet de versionner le registre.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const FUSIONS = join(DATA, 'fusions');

const ORDRE_IMPORTANT = false;

function slugify(label) {
  return String(label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function pairKey(a, b, ordered = ORDRE_IMPORTANT) {
  return ordered ? `${a}>${b}` : (a <= b ? `${a}|${b}` : `${b}|${a}`);
}

async function main() {
  const rapport = { erreurs: [], avertissements: [], doublons: [], inconnus: [], vides: [], stats: {} };

  // 1. Éléments — elements.json (catalogue principal) + fichiers dérivés optionnels
  const elements = {};
  const fichiersElements = ['elements.json', 'elements-genere.json'];
  for (const f of fichiersElements) {
    let brut;
    try {
      brut = JSON.parse(await readFile(join(DATA, f), 'utf8'));
    } catch {
      continue; // fichier optionnel absent
    }
    const source = f === 'elements.json' ? 'catalogue' : 'genere';
    for (const [id, t] of Object.entries(brut.elements || {})) {
      if (!Array.isArray(t) || t.length < 5) {
        rapport.erreurs.push({ type: 'element-malforme', id, fichier: f });
        continue;
      }
      if (elements[id]) {
        rapport.doublons.push({ type: 'element', id, fichier: f });
        continue;
      }
      const [nom, categorie, rarete, monde, emoji, description = ''] = t;
      elements[id] = { id, nom, categorie, rarete, monde, emoji, description, origine: source };
    }
  }

  // 2. Lots de recettes
  const fichiers = (await readdir(FUSIONS)).filter((f) => f.startsWith('lot-') && f.endsWith('.json')).sort();
  const index = new Map();
  const recipes = [];
  const lots = [];

  for (const fichier of fichiers) {
    const lot = JSON.parse(await readFile(join(FUSIONS, fichier), 'utf8'));
    const nomLot = lot.lot || fichier.replace(/^lot-|\.json$/g, '');
    const statut = lot.statut || 'officiel';
    let ajoutees = 0;

    for (const entree of lot.recipes || []) {
      const [a, b, result] = entree;
      if (!a || !b || !result) {
        rapport.vides.push({ lot: nomLot, entree });
        continue;
      }
      if (!elements[a]) { rapport.inconnus.push({ lot: nomLot, ingredient: a, result }); continue; }
      if (!elements[b]) { rapport.inconnus.push({ lot: nomLot, ingredient: b, result }); continue; }
      if (!elements[result]) { rapport.inconnus.push({ lot: nomLot, resultat: result }); continue; }

      const key = pairKey(a, b);
      if (index.has(key)) {
        rapport.doublons.push({ lot: nomLot, paire: [a, b], dejaVuDans: index.get(key).lot, result, resultIgnore: index.get(key).result });
        continue;
      }

      const meta = elements[result];
      const recette = {
        id: `r-${slugify(key)}`,
        key,
        a, b, result,
        ordered: false,
        categorie: meta.categorie,
        rarete: meta.rarete,
        monde: meta.monde,
        source: statut === 'officiel' ? 'officiel' : 'candidat',
        statut,
        valide: true,
        version: 1,
        lot: nomLot,
      };
      index.set(key, recette);
      recipes.push(recette);
      ajoutees++;
    }
    lots.push({ lot: nomLot, monde: lot.monde || 'libre', fichier, statut, recettes: ajoutees });
  }

  // 3. Statistiques réelles
  const officielles = recipes.filter((r) => r.source === 'officiel').length;
  const candidates = recipes.filter((r) => r.source === 'candidat').length;
  rapport.stats = {
    elements: Object.keys(elements).length,
    recettesTotales: recipes.length,
    recettesOfficielles: officielles,
    recettesCandidates: candidates,
    lots: lots.length,
  };

  // Sortie COMPACTE : le registre doit rester léger à télécharger par le navigateur.
  const elementsCompact = {};
  for (const [id, e] of Object.entries(elements)) {
    elementsCompact[id] = [e.nom, e.categorie, e.rarete, e.monde, e.emoji, e.description];
  }
  const versCompact = (r) => [r.id, r.a, r.b, r.result, r.lot];

  const sortie = {
    meta: {
      version: 1,
      jeu: 'infinite-vrcraft',
      // Aucun horodatage : la compilation doit être DÉTERMINISTE, afin que
      // relancer `npm run build` sans changer les données ne produise aucun diff.
      generePar: 'tools/build-registry.mjs',
      ordreImportantParDefaut: ORDRE_IMPORTANT,
      format: 'elements: [nom, categorie, rarete, monde, emoji, description] ; recipes/candidates: [id, a, b, resultat, lot]',
      note: 'Registre officiel versionné. Les découvertes des joueurs restent locales ; toute mise à jour du registre passe par une nouvelle version du projet ou un serveur autorisé.',
    },
    manifest: {
      elements: Object.keys(elements).length,
      recettes: recipes.length,
      recettesOfficielles: officielles,
      recettesCandidates: candidates,
      lots,
    },
    elements: elementsCompact,
    recipes: recipes.filter((r) => r.source === 'officiel').map(versCompact),
    candidates: recipes.filter((r) => r.source !== 'officiel').map(versCompact),
  };

  // Sortie minifiée : le registre est un ARTEFACT généré, destiné au navigateur.
  // Minifié, il est environ deux fois plus léger à télécharger ; le format compact
  // reste documenté dans src/fusion/registry-format.js.
  await writeFile(join(DATA, 'registre-fusions.json'), JSON.stringify(sortie) + '\n', 'utf8');
  await writeFile(join(ROOT, 'tools', 'rapport-registre.json'), JSON.stringify(rapport, null, 2) + '\n', 'utf8');

  console.log('Registre compilé :', JSON.stringify(rapport.stats));
  if (rapport.doublons.length) console.log(`  ${rapport.doublons.length} doublon(s) de paire ignoré(s).`);
  if (rapport.inconnus.length) console.log(`  ${rapport.inconnus.length} référence(s) inconnue(s).`);
  if (rapport.vides.length) console.log(`  ${rapport.vides.length} entrée(s) incomplète(s).`);
  if (rapport.erreurs.length) console.log(`  ${rapport.erreurs.length} erreur(s).`);
  console.log('Rapport détaillé : tools/rapport-registre.json');
}

main().catch((e) => {
  console.error('Échec de compilation du registre :', e);
  process.exit(1);
});
