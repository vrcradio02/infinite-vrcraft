/**
 * Normalisation des identifiants et des paires d'ingrédients.
 *
 * Décision explicite (règle technique B.3) : par défaut l'ordre des ingrédients
 * N'EST PAS significatif. La paire (a, b) et la paire (b, a) désignent la même recette.
 * Une recette peut forcer `ordered: true` pour documenter une exception.
 */
import { ORDRE_IMPORTANT_PAR_DEFAUT } from '../config.js';

/** Transforme un libellé en identifiant stable : minuscules, sans accent, tirets. */
export function slugify(label) {
  return String(label)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Clé canonique d'une paire d'ingrédients.
 * @param {string} a
 * @param {string} b
 * @param {boolean} [ordered=false]
 * @returns {string}
 */
export function pairKey(a, b, ordered = ORDRE_IMPORTANT_PAR_DEFAUT) {
  const x = String(a);
  const y = String(b);
  if (ordered) return `${x}>${y}`;
  return x <= y ? `${x}|${y}` : `${y}|${x}`;
}

/** Vrai si les deux identifiants désignent le même élément. */
export function memeIngredient(a, b) {
  return String(a) === String(b);
}

/** Vérifie que les deux ingrédients existent dans l'index fourni. */
export function ingredientsValides(a, b, indexElements) {
  return indexElements.has(a) && indexElements.has(b);
}
