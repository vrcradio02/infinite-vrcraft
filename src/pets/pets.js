/**
 * Système de familiers (animaux de compagnie intelligents).
 *
 * Chaque familier possède : nom, apparence (emoji/icône), rareté, description,
 * niveau, compétences et animation. Les familiers apportent de vraies aides de jeu
 * (voir `help.js`) sans rendre les fusions normales inutiles.
 *
 * Les définitions vivent dans `data/pets.json` pour être facilement extensibles.
 */
import { EQUIPE_MAX } from '../config.js';

/**
 * Charge les définitions de familiers.
 * Accepte un tableau direct ou un objet { pets: [...] } (format de data/pets.json).
 * @returns {Promise<object[]>}
 */
export async function chargerFamiliers(url = './data/pets.json', fetchImpl = fetch) {
  const res = await fetchImpl(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
  const data = await res.json();
  const liste = Array.isArray(data) ? data : data.pets;
  if (!Array.isArray(liste)) throw new Error(`Format de familiers invalide dans ${url}`);
  return liste;
}

/** Index id -> définition. */
export function indexerFamiliers(definitions) {
  const map = new Map();
  for (const p of definitions) map.set(p.id, p);
  return map;
}

/** État initial d'un familier nouvellement obtenu. */
export function nouveauFamilier(id) {
  return { id, niveau: 1, xp: 0, equipe: false, aideFournie: 0, obtenuLe: new Date().toISOString() };
}

/** XP nécessaire pour le niveau suivant (courbe douce). */
export function xpFamilerPourNiveau(niveau) {
  return Math.floor(40 * Math.pow(niveau, 1.35));
}

/** Niveau d'un familier pour un XP donné. */
export function niveauFamilier(xp) {
  let n = 1;
  let reste = xp;
  while (reste >= xpFamilerPourNiveau(n) && n < 100) {
    reste -= xpFamilerPourNiveau(n);
    n++;
  }
  return { niveau: n, dansNiveau: reste, requis: xpFamilerPourNiveau(n) };
}

/** Compétences débloquées à un niveau donné. */
export function competencesDebloquees(familierDef, etat) {
  if (!familierDef?.competences) return [];
  return familierDef.competences.filter((c) => etat.niveau >= (c.niveauRequis || 1));
}

/**
 * Ajoute de l'XP à un familier et détecte la montée de niveau.
 * @returns {{etat:object, niveaux:number}}
 */
export function gagnerXpFamilier(etat, montant) {
  const avant = etat.niveau;
  const xp = etat.xp + montant;
  const { niveau } = niveauFamilier(xp);
  return { etat: { ...etat, xp, niveau }, niveaux: Math.max(0, niveau - avant) };
}

/** Vrai si le familier peut rejoindre l'équipe. */
export function peutRejoindreEquipe(equipe) {
  return equipe.length < EQUIPE_MAX;
}
