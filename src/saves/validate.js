/**
 * Validation des fichiers de sauvegarde importés (étapes 54/55/76).
 *
 * Principes :
 *  - on ne fait que LIRE du JSON (jamais d'évaluation de code),
 *  - on vérifie le format, la taille, la version, les types et les bornes,
 *  - toute donnée malformée ou suspecte est refusée avec un message clair,
 *  - la validation est pure (aucun accès DOM, aucun effet de bord) => testable.
 */
import { SAVE_FORMAT_VERSION, IMPORT_MAX_BYTES, NB_SAUVEGARDES, POTIONS } from '../config.js';

/** Bornes de sécurité pour éviter les fichiers abusifs. */
export const LIMITES = {
  maxDecouvertes: 200000,
  maxHistorique: 100000,
  maxExperimental: 200000,
  maxCreations: 50000,
  maxPotions: POTIONS.max,
  maxTailleNom: 40,
  maxTailleTexte: 500,
};

export const ERREURS = {
  TROP_GROS: 'Fichier trop volumineux.',
  JSON_INVALIDE: 'Le fichier n\'est pas un JSON valide.',
  PAS_UN_OBJET: 'Le contenu n\'est pas un objet de sauvegarde.',
  VERSION_MANQUANTE: 'Version de format manquante ou invalide.',
  VERSION_TROP_RECENTE: 'Version de format trop récente pour ce jeu.',
  CHAMPS_MANQUANTS: 'Champs obligatoires manquants.',
  TYPES_INVALIDES: 'Certains champs ont un type invalide.',
  LIMITES_DEPASSEES: 'La sauvegarde dépasse les limites autorisées.',
};

const TYPES_ATTENDUS = {
  nom: 'string',
  formatVersion: 'number',
  niveau: 'number',
  xp: 'number',
};

/**
 * Valide un objet de sauvegarde déjà désérialisé.
 * @param {any} data
 * @returns {{ok:true, data:object, avertissements:string[]}|{ok:false, erreur:string, details?:string}}
 */
export function validerSauvegarde(data) {
  const avertissements = [];

  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, erreur: ERREURS.PAS_UN_OBJET };
  }

  // --- version ---
  if (typeof data.formatVersion !== 'number' || !Number.isFinite(data.formatVersion) || data.formatVersion < 1) {
    return { ok: false, erreur: ERREURS.VERSION_MANQUANTE };
  }
  if (data.formatVersion > SAVE_FORMAT_VERSION) {
    return {
      ok: false,
      erreur: ERREURS.VERSION_TROP_RECENTE,
      details: `Fichier v${data.formatVersion}, jeu v${SAVE_FORMAT_VERSION}.`,
    };
  }

  // --- champs obligatoires ---
  for (const [champ] of Object.entries(TYPES_ATTENDUS)) {
    if (!(champ in data)) {
      if (champ === 'nom' || champ === 'formatVersion') {
        return { ok: false, erreur: ERREURS.CHAMPS_MANQUANTS, details: champ };
      }
      avertissements.push(`Champ « ${champ} » absent : valeur par défaut appliquée.`);
    }
  }

  // --- types ---
  for (const [champ, type] of Object.entries(TYPES_ATTENDUS)) {
    if (champ in data && typeof data[champ] !== type) {
      return { ok: false, erreur: ERREURS.TYPES_INVALIDES, details: `${champ} devrait être ${type}.` };
    }
  }

  if (typeof data.nom !== 'string' || data.nom.length === 0) {
    return { ok: false, erreur: ERREURS.TYPES_INVALIDES, details: 'nom vide.' };
  }
  if (data.nom.length > LIMITES.maxTailleNom) {
    return { ok: false, erreur: ERREURS.LIMITES_DEPASSEES, details: 'pseudonyme trop long.' };
  }

  if (data.decouvertes !== undefined && (typeof data.decouvertes !== 'object' || data.decouvertes === null)) {
    return { ok: false, erreur: ERREURS.TYPES_INVALIDES, details: 'decouvertes.' };
  }
  if (data.historique !== undefined && !Array.isArray(data.historique)) {
    return { ok: false, erreur: ERREURS.TYPES_INVALIDES, details: 'historique.' };
  }

  // --- bornes ---
  const nbDecouvertes = data.decouvertes ? Object.keys(data.decouvertes).length : 0;
  const nbHistorique = data.historique ? data.historique.length : 0;
  const nbExperimental = data.experimental ? Object.keys(data.experimental).length : 0;
  const nbCreations = data.creations ? Object.keys(data.creations).length : 0;

  if (nbDecouvertes > LIMITES.maxDecouvertes || nbHistorique > LIMITES.maxHistorique || nbExperimental > LIMITES.maxExperimental || nbCreations > LIMITES.maxCreations) {
    return {
      ok: false,
      erreur: ERREURS.LIMITES_DEPASSEES,
      details: `decouvertes=${nbDecouvertes}, historique=${nbHistorique}, experimental=${nbExperimental}, creations=${nbCreations}.`,
    };
  }

  return { ok: true, data: normaliserSauvegarde(data), avertissements };
}

/**
 * Valide un texte brut (contenu de fichier) puis renvoie l'objet normalisé.
 * @param {string} texte
 */
export function validerTexteSauvegarde(texte) {
  if (typeof texte !== 'string') return { ok: false, erreur: ERREURS.JSON_INVALIDE };
  if (texte.length > IMPORT_MAX_BYTES) return { ok: false, erreur: ERREURS.TROP_GROS };
  let data;
  try {
    data = JSON.parse(texte);
  } catch (e) {
    return { ok: false, erreur: ERREURS.JSON_INVALIDE, details: String(e.message || e) };
  }
  return validerSauvegarde(depaquetter(data));
}

/**
 * Accepte les deux formes d'export :
 *  - une sauvegarde directe { formatVersion, nom, ... }
 *  - un export enveloppé { formatVersion, jeu, save: { formatVersion, nom, ... } }
 * Le fichier importé n'est jamais exécuté, seulement lu.
 */
export function depaqueter(data) {
  if (data && typeof data === 'object' && data.save && typeof data.save === 'object' && !Array.isArray(data.save)) {
    return data.save;
  }
  return data;
}

/**
 * Met une sauvegarde aux normes : champs manquants comblés, types coercés proprement.
 * IMPORTANT : on reconstruit un objet à partir d'une LISTE BLANCHE de champs.
 * Aucune propriété inconnue du fichier importé n'est propagée (défense en profondeur
 * contre les charges utiles inattendues type `onclick`, `constructor`, `__proto__`).
 */
export function normaliserSauvegarde(data) {
  const d = {};
  d.formatVersion = SAVE_FORMAT_VERSION;
  d.jeu = typeof data.jeu === 'string' ? data.jeu.slice(0, 60) : 'infinite-vrcraft';
  d.jeuVersion = typeof data.jeuVersion === 'string' ? data.jeuVersion.slice(0, 20) : '1.0.0';
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  d.nom = String(data.nom ?? 'Joueur').slice(0, LIMITES.maxTailleNom);
  d.niveau = Number.isFinite(data.niveau) ? Math.max(1, Math.floor(data.niveau)) : 1;
  d.xp = Number.isFinite(data.xp) ? Math.max(0, Math.floor(data.xp)) : 0;
  d.decouvertes = obj(data.decouvertes);
  d.historique = Array.isArray(data.historique) ? data.historique.slice(0, LIMITES.maxHistorique) : [];
  d.experimental = obj(data.experimental);
  // Créations du joueur : conservées telles quelles (elles sont revalidées à l'injection
  // dans le catalogue) et bornées par LIMITES.maxCreations.
  d.creations = obj(data.creations);
  // Potions de familier : entier borné (les anciennes sauvegardes en reçoivent d'office).
  d.potions = Number.isFinite(data.potions)
    ? Math.max(0, Math.min(LIMITES.maxPotions, Math.floor(data.potions)))
    : POTIONS.depart;
  d.succes = obj(data.succes);
  d.mondes = obj(data.mondes);
  d.collections = obj(data.collections);
  d.familiers = obj(data.familiers);
  d.equipe = Array.isArray(data.equipe) ? data.equipe.filter((x) => typeof x === 'string').slice(0, 3) : [];
  d.quetes = obj(data.quetes);
  d.aideQuota = obj(data.aideQuota);
  d.stats = obj(data.stats);
  d.parametres = obj(data.parametres);
  d.series = obj(data.series);
  d.sauvegardeAuto = data.sauvegardeAuto !== false;
  d.avatar = typeof data.avatar === 'string' ? data.avatar.slice(0, 8) : '🧪';
  d.creeLe = typeof data.creeLe === 'string' ? data.creeLe : new Date().toISOString();
  d.modifieLe = typeof data.modifieLe === 'string' ? data.modifieLe : new Date().toISOString();
  return d;
}

/** Vrai si l'index d'emplacement est valide. */
export function slotValide(i) {
  return Number.isInteger(i) && i >= 0 && i < NB_SAUVEGARDES;
}
