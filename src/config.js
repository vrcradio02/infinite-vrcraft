/**
 * Configuration centrale du jeu.
 * Modifier ce fichier permet de rebrander le jeu (nom provisoire, couleurs, textes)
 * sans toucher au moteur.
 */

export const GAME = {
  /** Nom provisoire — modifiable librement. */
  nom: 'Infinite Craft Ultimate',
  slug: 'infinite-vrcraft',
  version: '1.0.1',
  depot: 'https://github.com/vrcradio02/infinite-vrcraft',
};

/** Identifiants des quatre éléments de départ (imposés par le cahier des charges). */
export const ELEMENTS_DE_DEPART = ['feu', 'eau', 'terre', 'vent'];

/**
 * L'ordre des ingrédients est-il significatif ?
 * Par défaut NON : A + B et B + A sont la même paire.
 * Une recette peut forcer `ordered: true` (exception documentée dans le registre).
 */
export const ORDRE_IMPORTANT_PAR_DEFAUT = false;

/** Raretés du jeu, dans l'ordre croissant. */
export const RARETES = ['Commun', 'Peu commun', 'Rare', 'Épique', 'Légendaire', 'Mythique', 'Cosmique', 'Secret'];

/** Expérience accordée pour la première découverte d'un élément, selon sa rareté. */
export const XP_PAR_RARETE = {
  'Commun': 5,
  'Peu commun': 10,
  'Rare': 20,
  'Épique': 40,
  'Légendaire': 80,
  'Mythique': 150,
  'Cosmique': 250,
  'Secret': 400,
};

/** Expérience accordée pour une fusion reproductible (résultat déjà connu). */
export const XP_FUSION_CONNUE = 1;

/** Titres débloqués par niveau (le plus haut applicable est retenu). */
export const TITRES = [
  { niveau: 1, titre: 'Explorateur' },
  { niveau: 5, titre: 'Apprenti Alchimiste' },
  { niveau: 10, titre: 'Alchimiste' },
  { niveau: 18, titre: 'Inventeur' },
  { niveau: 28, titre: 'Scientifique' },
  { niveau: 40, titre: 'Maître des éléments' },
  { niveau: 55, titre: "Architecte de l'univers" },
  { niveau: 75, titre: "Gardien de l'infini" },
];

/** Système d'aides partagé : 5 aides par fenêtre de 10 minutes (tous familiers confondus). */
export const QUOTA = {
  max: 5,
  fenetreMs: 10 * 60 * 1000,
};

/** Équipe active de familiers. */
export const EQUIPE_MAX = 3;

/** Nombre d'emplacements de sauvegarde (exactement 3). */
export const NB_SAUVEGARDES = 3;

/** Clés de stockage local (préférences non critiques ; les sauvegardes sont dans IndexedDB). */
export const STORAGE_KEYS = {
  prefs: 'icu:prefs:v1',
  slotIndex: 'icu:slot-index:v1',
  quota: (slot) => `icu:quota:${slot}`,
  ai: 'icu:ai:v1',
};

/** Version du format de sauvegarde (permet la migration future). */
export const SAVE_FORMAT_VERSION = 1;

/** Limite de taille pour l'import d'un fichier de sauvegarde (octets). */
export const IMPORT_MAX_BYTES = 4 * 1024 * 1024;

/** Version du registre de fusions écrite par l'outil de compilation. */
export const REGISTRE_VERSION = 1;
