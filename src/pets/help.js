/**
 * Aides des familiers et quota commun.
 *
 * RÈGLE CENTRALE (étapes 96/97/98) :
 *  - 5 aides maximum par fenêtre de 10 minutes,
 *  - ce quota est PARTAGÉ par tous les familiers et tous les types d'aide
 *    (ce n'est pas 5 aides par animal),
 *  - une aide n'est consommée QUE si un résultat utile a réellement été fourni,
 *  - l'horloge de référence est persistée (localStorage + sauvegarde) afin qu'un
 *    rechargement de page ne redonne pas 5 aides immédiatement.
 *
 * En mode purement local, un utilisateur expérimenté peut modifier ces données :
 * c'est une limite connue et documentée (voir README).
 */
import { QUOTA, STORAGE_KEYS } from '../config.js';
import { seededRandom } from '../core/random.js';

export const TYPES_AIDE = [
  { id: 'indice_fusion', nom: 'Indice de fusion', emoji: '💡', description: 'Une piste pour combiner deux éléments.' },
  { id: 'suggestion_recette', nom: 'Suggestion de recette', emoji: '🧾', description: 'Une combinaison plausible à explorer.' },
  { id: 'aide_quete', nom: 'Aide de quête', emoji: '🎯', description: 'Un élément ou une catégorie utile pour progresser.' },
  { id: 'indice_exploration', nom: 'Indice d\'exploration', emoji: '🧭', description: 'Une orientation vers une catégorie, un monde ou un secret.' },
  { id: 'analyse_fusion', nom: 'Analyse de fusion', emoji: '🔬', description: 'Pourquoi une recette fonctionne, et quelles pistes essayer.' },
];

/**
 * Gestionnaire de quota, persistant.
 */
export class QuotaAides {
  /**
   * @param {number} slotIndex emplacement de sauvegarde (0..2)
   * @param {() => number} [clock] horloge injectable (tests)
   */
  constructor(slotIndex, clock = () => Date.now()) {
    this.slot = slotIndex;
    this.clock = clock;
    this.restant = QUOTA.max;
    this.debutFenetre = this.clock();
  }

  /** Restaure l'état depuis la sauvegarde et le miroir localStorage (le plus restrictif gagne). */
  restaurer(etatSauvegarde) {
    const now = this.clock();
    const candidats = [];
    if (etatSauvegarde && typeof etatSauvegarde === 'object') candidats.push(etatSauvegarde);
    try {
      const brut = localStorage.getItem(STORAGE_KEYS.quota(this.slot));
      if (brut) candidats.push(JSON.parse(brut));
    } catch { /* stockage indisponible : on continue avec la sauvegarde seule */ }

    const valides = candidats.filter((c) => Number.isFinite(c?.restant) && Number.isFinite(c?.debutFenetre));
    if (valides.length) {
      // On retient l'état qui donne le MOINS d'aides (le plus restrictif).
      // La borne haute inclut le bonus de potion (jusqu'à max + bonusMax) : sans cela,
      // un « 10 / 5 » obtenu par potion retomberait à 5 après un rechargement de page.
      valides.sort((x, y) => x.restant - y.restant || y.debutFenetre - x.debutFenetre);
      this.restant = Math.max(0, Math.min(QUOTA.max + QUOTA.bonusMax, valides[0].restant));
      this.debutFenetre = valides[0].debutFenetre;
    }
    this._appliquerRecharge(now);
    return this;
  }

  /** Persiste immédiatement (synchrone) pour survivre à un rechargement. */
  persister() {
    try {
      localStorage.setItem(STORAGE_KEYS.quota(this.slot), JSON.stringify(this.etat()));
    } catch { /* quota de stockage atteint : la sauvegarde principale reste la référence */ }
  }

  etat() {
    return { restant: this.restant, debutFenetre: this.debutFenetre };
  }

  /** Applique la recharge si la fenêtre est écoulée. */
  _appliquerRecharge(now = this.clock()) {
    const ecoule = now - this.debutFenetre;
    if (ecoule >= QUOTA.fenetreMs) {
      // Avance d'autant de fenêtres que nécessaire (gère les longues absences).
      const fenetres = Math.floor(ecoule / QUOTA.fenetreMs);
      this.debutFenetre += fenetres * QUOTA.fenetreMs;
      this.restant = QUOTA.max;
    }
  }

  /**
   * Recharge complète du quota par une potion.
   *  - quota entamé (0/5 à 4/5)  -> retour à 5/5 (le maximum) ;
   *  - quota déjà plein (5/5)    -> bonus : 10/5 (max + bonusMax).
   * La fenêtre de 10 minutes reste inchangée : à la prochaine recharge, le compteur
   * revient simplement à 5/5.
   * @returns {{restant:number, bonus:boolean}}
   */
  rechargerComplet() {
    this._appliquerRecharge();
    const bonus = this.restant >= QUOTA.max;
    this.restant = bonus ? QUOTA.max + QUOTA.bonusMax : QUOTA.max;
    this.persister();
    return { restant: this.restant, bonus };
  }

  /** Millisecondes avant la prochaine recharge (0 si le quota est plein ou en bonus). */
  tempsRestant() {
    this._appliquerRecharge();
    if (this.restant >= QUOTA.max) return 0;
    return Math.max(0, this.debutFenetre + QUOTA.fenetreMs - this.clock());
  }

  disponibles() {
    this._appliquerRecharge();
    return this.restant;
  }

  /** Consomme une aide. Retourne false si le quota est épuisé. */
  consommer() {
    this._appliquerRecharge();
    if (this.restant <= 0) return false;
    this.restant -= 1;
    this.persister();
    return true;
  }
}

/* ------------------------------------------------------------------
   Générateurs d'aide — déterministes et vérifiables.
   Chaque fonction retourne { utile:boolean, texte:string, ...donnees }.
   Si `utile` est false, l'appelant NE consomme PAS d'aide.
   ------------------------------------------------------------------ */

/**
 * 1. Indice de fusion : propose une piste vers une recette non encore découverte
 *    dont les deux ingrédients sont déjà connus.
 */
export function indiceFusion({ store, decouverts, jetons }) {
  const inconnus = [];
  for (const r of store.index.values()) {
    if (decouverts.has(r.result)) continue;
    if (decouverts.has(r.a) && decouverts.has(r.b)) inconnus.push(r);
  }
  if (!inconnus.length) {
    return { utile: false, texte: 'Aucune piste disponible pour le moment : explorez davantage.' };
  }
  const rnd = seededRandom(`indice:${jetons}`);
  const r = inconnus[Math.floor(rnd() * inconnus.length)];
  const na = store.elements.get(r.a)?.nom ?? r.a;
  const nb = store.elements.get(r.b)?.nom ?? r.b;
  return { utile: true, texte: `Essayez de combiner « ${na} » et « ${nb} ».`, recette: r, type: 'indice_fusion' };
}

/**
 * 2. Suggestion de recette : propose une paire d'ingrédients à explorer
 *    (mélange d'éléments déjà connus, pas nécessairement dans le registre).
 */
export function suggestionRecette({ store, decouverts, jetons }) {
  const connus = [...decouverts].filter((id) => store.elements.has(id));
  if (connus.length < 2) return { utile: false, texte: 'Découvrez plus d\'éléments pour obtenir une suggestion.' };
  const rnd = seededRandom(`suggest:${jetons}`);
  const a = connus[Math.floor(rnd() * connus.length)];
  let b = connus[Math.floor(rnd() * connus.length)];
  if (b === a) b = connus[(connus.indexOf(a) + 1) % connus.length];
  const na = store.elements.get(a)?.nom ?? a;
  const nb = store.elements.get(b)?.nom ?? b;
  return { utile: true, texte: `Explorez la combinaison « ${na} » + « ${nb} ».`, paire: [a, b], type: 'suggestion_recette' };
}

/**
 * 3. Aide de quête : indique un élément/catégorie utile pour la quête active.
 */
export function aideQuete({ store, decouverts, queteActive }) {
  if (!queteActive) return { utile: false, texte: 'Aucune quête active à aider.' };
  if (queteActive.type === 'categorie' || queteActive.type === 'monde') {
    const cible = queteActive.cible;
    const candidats = [...store.elements.values()].filter(
      (e) => !decouverts.has(e.id) && (queteActive.type === 'categorie' ? e.categorie === cible : e.monde === cible),
    );
    if (!candidats.length) return { utile: false, texte: `Tous les éléments de « ${cible} » semblent déjà connus.` };
    if (queteActive.type === 'categorie') {
      return { utile: true, texte: `Cherchez un élément de catégorie « ${cible} » en combinant des éléments déjà proches.`, indiceCategorie: cible, type: 'aide_quete' };
    }
    const r = candidats[0];
    return { utile: true, texte: `Le monde « ${cible} » contient encore « ${r.nom} » à découvrir.`, element: r.id, type: 'aide_quete' };
  }
  if (queteActive.type === 'decouvrir' || queteActive.type === 'fusions') {
    return { utile: true, texte: 'Réutilisez vos éléments les plus récents : ils ouvrent souvent de nouvelles pistes.', type: 'aide_quete' };
  }
  return { utile: false, texte: 'Cette quête ne nécessite pas d\'indice particulier.' };
}

/**
 * 4. Indice d'exploration : oriente vers une catégorie/un monde peu exploré.
 */
export function indiceExploration({ store, decouverts, mondesDebloques }) {
  const parMonde = new Map();
  for (const e of store.elements.values()) {
    if (!parMonde.has(e.monde)) parMonde.set(e.monde, { total: 0, vus: 0 });
    const m = parMonde.get(e.monde);
    m.total++;
    if (decouverts.has(e.id)) m.vus++;
  }
  let meilleur = null;
  for (const [monde, stat] of parMonde) {
    if (mondesDebloques && stat.vus === 0 && !mondesDebloques[monde]) continue;
    const ratio = stat.vus / Math.max(1, stat.total);
    if (!meilleur || ratio < meilleur.ratio) meilleur = { monde, ratio, ...stat };
  }
  if (!meilleur) return { utile: false, texte: 'Toutes les zones connues sont bien explorées !' };
  const restants = meilleur.total - meilleur.vus;
  return {
    utile: true,
    texte: `Le monde « ${meilleur.monde} » compte encore ${restants} élément(s) à découvrir.`,
    monde: meilleur.monde,
    type: 'indice_exploration',
  };
}

/**
 * 5. Analyse de fusion : explique une recette connue et propose des pistes.
 */
export function analyseFusion({ store, elementId }) {
  const meta = store.elements.get(elementId);
  if (!meta) return { utile: false, texte: 'Élément inconnu : impossible d\'analyser.' };
  const recettes = store.recettesVers(elementId);
  if (!recettes.length) {
    return {
      utile: true,
      texte: `« ${meta.nom} » est un élément de départ : il ne provient d'aucune fusion.`,
      type: 'analyse_fusion',
    };
  }
  const exemples = recettes.slice(0, 3).map((r) => `${store.elements.get(r.a)?.nom ?? r.a} + ${store.elements.get(r.b)?.nom ?? r.b}`);
  return {
    utile: true,
    texte: `« ${meta.nom} » (${meta.rarete}, ${meta.categorie}) s'obtient par ${recettes.length} recette(s) connue(s), par exemple : ${exemples.join(' ; ')}.`,
    element: elementId,
    type: 'analyse_fusion',
  };
}

/** Point d'entrée unique : exécute le type d'aide demandé. */
export function executerAide(type, contexte) {
  switch (type) {
    case 'indice_fusion': return indiceFusion(contexte);
    case 'suggestion_recette': return suggestionRecette(contexte);
    case 'aide_quete': return aideQuete(contexte);
    case 'indice_exploration': return indiceExploration(contexte);
    case 'analyse_fusion': return analyseFusion(contexte);
    default: return { utile: false, texte: `Type d'aide inconnu : ${type}` };
  }
}
