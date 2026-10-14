/**
 * Moteur de fusion.
 *
 * Rôle : recevoir deux éléments et renvoyer un résultat en tenant compte
 *  - des recettes officielles du registre,
 *  - des règles du jeu (ordre des ingrédients, doublons, cohérence),
 *  - du mode choisi (Catalogue ou Créativité).
 *
 * Statuts possibles :
 *  - "nouveau"       : recette officielle trouvée, jamais découverte dans cette partie
 *  - "connu"         : recette officielle trouvée, déjà découverte dans cette partie
 *  - "experimental"  : pas de recette officielle, résultat produit par le composeur local
 *                      déterministe (mode Créativité). Le jeu l'enregistre aussitôt comme
 *                      élément officiel de la partie (création du joueur, voir game.js).
 *  - "inconnu"       : aucun résultat (mode Catalogue sans recette)
 */
import { pairKey } from './normalize.js';
import { hashString, seededRandom } from '../core/random.js';
import { RARETES } from '../config.js';

export const STATUT = {
  NOUVEAU: 'nouveau',
  CONNU: 'connu',
  EXPERIMENTAL: 'experimental',
  INCONNU: 'inconnu',
};

/** Mots-outils utilisés par le composeur expérimental (déterministe, documenté). */
const SUFFIXES = ['ium', 'ite', 'on', 'ia', 'ure', 'ax', 'or', 'el'];
const PREFIXES = ['néo-', 'ultra-', 'proto-', 'méga-', 'micro-', 'hyper-'];
const QUALIFICATIFS = ['Cosmique', 'Quantique', 'Sauvage', 'Ancien', 'Cristallin', 'Nomade', 'Vibrant', 'Silencieux'];

export class FusionEngine {
  /**
   * @param {import('./store.js').RecipeStore} store
   */
  constructor(store) {
    this.store = store;
  }

  /**
   * Résout une fusion.
   * @param {object} params
   * @param {string} params.a identifiant du premier élément
   * @param {string} params.b identifiant du second élément
   * @param {(id:string)=>boolean} [params.dejaDecouvert]
   * @param {'catalogue'|'creativite'} [params.mode]
   * @param {(a:string,b:string)=>object|null} [params.creation] recherche d'une création
   *   déjà enregistrée par le joueur pour cette paire (elle est alors reproductible).
   * @returns {{statut:string, recette:object|null, resultat:object|null, raison?:string}}
   */
  resoudre({ a, b, dejaDecouvert = () => false, mode = 'catalogue', creation = null }) {
    if (!a || !b) {
      return { statut: STATUT.INCONNU, recette: null, resultat: null, raison: 'Ingrédients manquants.' };
    }
    if (!this.store.elements.has(a) || !this.store.elements.has(b)) {
      return { statut: STATUT.INCONNU, recette: null, resultat: null, raison: 'Ingrédient inconnu du catalogue.' };
    }

    const recette = this.store.trouver(a, b);
    if (recette) {
      const meta = this.store.elements.get(recette.result);
      const resultat = meta
        ? { ...meta, experimental: false }
        : { id: recette.result, nom: recette.result, categorie: recette.categorie, rarete: recette.rarete, experimental: false };
      return {
        statut: dejaDecouvert(recette.result) ? STATUT.CONNU : STATUT.NOUVEAU,
        recette,
        resultat,
      };
    }

    // Création déjà enregistrée par le joueur : elle est reproductible depuis son
    // catalogue (même paire => même élément), sans repasser par le composeur.
    const existante = typeof creation === 'function' ? creation(a, b) : null;
    if (existante && this.store.elements.has(existante.id)) {
      const meta = this.store.elements.get(existante.id);
      return {
        statut: dejaDecouvert(meta.id) ? STATUT.CONNU : STATUT.NOUVEAU,
        recette: {
          a, b, result: meta.id, categorie: meta.categorie, rarete: meta.rarete,
          monde: meta.monde, source: 'creation', key: null,
        },
        resultat: { ...meta, experimental: false, creation: true },
        depuisCreation: true,
      };
    }

    if (mode === 'creativite') {
      const resultat = this.composerExperimental(a, b);
      return { statut: STATUT.EXPERIMENTAL, recette: null, resultat };
    }

    return {
      statut: STATUT.INCONNU,
      recette: null,
      resultat: null,
      raison: 'Aucune recette officielle pour cette paire. Activez le mode Créativité ou une aide IA.',
    };
  }

  /**
   * Composeur LOCAL : déterministe et reproductible.
   * Le même couple d'ingrédients donne toujours exactement le même élément (règle B.2),
   * ce qui rend la création enregistrable puis reproductible.
   * Le résultat retourné ici porte `creation: true` : c'est `game.js` qui l'enregistre
   * ensuite comme élément officiel de la partie (inventaire, encyclopédie, fusions).
   */
  composerExperimental(a, b) {
    // On canonicalise l'ORDRE avant de composer : A + B et B + A doivent produire
    // exactement le même résultat expérimental (règle B.2 / B.3).
    const [x, y] = a <= b ? [a, b] : [b, a];
    const ea = this.store.elements.get(x);
    const eb = this.store.elements.get(y);
    if (!ea || !eb) return null;

    const key = pairKey(x, y, false);
    const rnd = seededRandom(key);
    const h = hashString(key);
    const racineA = racine(ea.nom);
    const racineB = racine(eb.nom);
    const mode = h % 4;

    let nom;
    switch (mode) {
      case 0: nom = `${racineA}${SUFFIXES[h % SUFFIXES.length]}`; break;
      case 1: nom = `${PREFIXES[h % PREFIXES.length]}${racineA}${SUFFIXES[(h >>> 3) % SUFFIXES.length]}`; break;
      case 2: nom = `${racineA} de ${racineB}`; break;
      default: nom = `${racineA} ${QUALIFICATIFS[h % QUALIFICATIFS.length]}`; break;
    }

    const categorie = rnd() < 0.5 ? ea.categorie : eb.categorie;
    const rarete = RARETES[Math.min(RARETES.length - 1, (h >>> 5) % 4)];
    const id = `x-${key.replace(/[^a-z0-9]+/g, '-')}`;

    return {
      id,
      nom: majuscule(nom),
      categorie,
      rarete,
      monde: ea.monde || eb.monde || 'libre',
      description: `Création issue de « ${ea.nom} » et « ${eb.nom} », enregistrée dans votre catalogue.`,
      emoji: '✨',
      experimental: true,
      creation: true,
    };
  }
}

/** Réduit un nom à une racine utilisable comme base de mot composé. */
function racine(nom) {
  const mot = String(nom).split(' ')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return mot.replace(/[^a-z]/g, '').slice(0, 8) || 'mystere';
}

function majuscule(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
