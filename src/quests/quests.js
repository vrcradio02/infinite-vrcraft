/**
 * Système de quêtes.
 *
 * Les définitions vivent dans `data/quests.json` (type, cible, objectif, récompense).
 * L'état (progression, réclamation) vit dans la sauvegarde du joueur.
 * Les quêtes quotidiennes sont renouvelées chaque jour, les hebdomadaires chaque semaine,
 * en utilisant un tirage déterministe (mêmes quêtes pour tout le monde un jour donné).
 */
import { seededRandom, shuffle } from '../core/random.js';

/** Clé de jour (AAAA-MM-JJ) en heure locale. */
export function cleJour(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Clé de semaine ISO (AAAA-Sxx). */
export function cleSemaine(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const jour = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - jour);
  const debutAnnee = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semaine = Math.ceil(((d - debutAnnee) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-S${String(semaine).padStart(2, '0')}`;
}

/**
 * Sélectionne les quêtes actives du jour/de la semaine.
 * @param {object[]} definitions toutes les définitions de `data/quests.json`
 * @param {number} nombre combien tirer
 * @param {string} graine clé temporelle
 */
export function tirerQuetes(definitions, nombre, graine) {
  const pool = shuffle(definitions, graine);
  return pool.slice(0, Math.min(nombre, pool.length)).map((q) => ({
    ...q,
    progression: 0,
    terminee: false,
    reclamee: false,
  }));
}

/**
 * Calcule la progression d'une quête à partir d'un événement de jeu.
 * @returns {number} nouvelle valeur de progression (bornée à la cible)
 */
export function avancerQuete(quete, evenement) {
  const cible = quete.objectif || 1;
  if (quete.terminee) return quete.progression;
  let valeur = quete.progression;

  switch (quete.type) {
    case 'decouvrir':
      if (evenement.type === 'decouverte') valeur += 1;
      break;
    case 'fusions':
      if (evenement.type === 'fusion' && evenement.reussie) valeur += 1;
      break;
    case 'categorie':
      if (evenement.type === 'decouverte' && evenement.categorie === quete.cible) valeur += 1;
      break;
    case 'rarete':
      if (evenement.type === 'decouverte' && evenement.rarete === quete.cible) valeur += 1;
      break;
    case 'monde':
      if (evenement.type === 'decouverte' && evenement.monde === quete.cible) valeur += 1;
      break;
    case 'familiers':
      if (evenement.type === 'famille_aide' && evenement.familier === quete.cible) valeur += 1;
      break;
    case 'niveau':
      valeur = evenement.type === 'niveau' ? evenement.niveau : valeur;
      break;
    case 'collection':
      valeur = evenement.type === 'collection' ? evenement.valeur : valeur;
      break;
    default:
      break;
  }

  return Math.min(valeur, cible);
}
