/**
 * Progression : expérience, niveaux, titres.
 * Les seuils sont progressifs et calculés, ce qui permet une courbe infinie.
 */
import { XP_PAR_RARETE, XP_FUSION_CONNUE, TITRES } from '../config.js';

/** XP cumulé nécessaire pour ATTEINDRE le niveau n (n >= 1). */
export function xpCumulePourNiveau(n) {
  if (n <= 1) return 0;
  return Math.floor(50 * Math.pow(n - 1, 1.7));
}

/** Niveau atteint pour un total d'XP donné. */
export function niveauPourXp(xp) {
  let n = 1;
  while (xpCumulePourNiveau(n + 1) <= xp && n < 1000) n++;
  return n;
}

/** Progression vers le niveau suivant : { niveau, xpDansNiveau, xpRequis, ratio }. */
export function progression(xp) {
  const niveau = niveauPourXp(xp);
  const base = xpCumulePourNiveau(niveau);
  const suivant = xpCumulePourNiveau(niveau + 1);
  const xpDansNiveau = xp - base;
  const xpRequis = suivant - base;
  return { niveau, xpDansNiveau, xpRequis, ratio: xpRequis > 0 ? xpDansNiveau / xpRequis : 1 };
}

/** Titre correspondant à un niveau. */
export function titrePourNiveau(niveau) {
  let titre = TITRES[0].titre;
  for (const t of TITRES) if (niveau >= t.niveau) titre = t.titre;
  return titre;
}

/** XP gagné en découvrant un élément de cette rareté. */
export function xpPourRarete(rarete) {
  return XP_PAR_RARETE[rarete] ?? XP_PAR_RARETE['Commun'];
}

/** XP gagné pour une fusion dont le résultat est déjà connu. */
export function xpPourFusionConnue() {
  return XP_FUSION_CONNUE;
}

/** Récompense de montée de niveau (cosmétique + indices). */
export function recompenseNiveau(niveau) {
  const recompenses = [];
  recompenses.push({ type: 'indice', montant: 1 + Math.floor(niveau / 5) });
  if (niveau % 5 === 0) recompenses.push({ type: 'cosmetique', nom: `Thème bonus ${niveau}` });
  if (niveau % 10 === 0) recompenses.push({ type: 'titre', nom: titrePourNiveau(niveau) });
  return recompenses;
}
