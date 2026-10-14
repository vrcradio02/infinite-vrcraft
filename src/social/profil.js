/**
 * Profil partagé d'un joueur — « voir les stats, découvertes et animaux de mes amis ».
 *
 * Le jeu n'a **aucun compte** et aucune sauvegarde ne quitte l'appareil. Pour qu'un ami
 * puisse consulter un profil, on construit un **aperçu volontairement réduit** (jamais la
 * sauvegarde) que l'on partage :
 *
 *   - soit par un **code** (`encoderProfil` / `lireProfil`) que l'on transmet soi-même ;
 *   - soit par le **relais d'amis facultatif** (le profil est déposé sous son identifiant
 *     et les amis le relisent, voir `relay.js` et `server/worker-amis.js`).
 *
 * Ce que l'aperçu contient : pseudonyme, avatar, niveau, XP, compteurs de découvertes et
 * leur répartition par rareté, les dernières découvertes (bornées), les familiers et
 * l'équipe active, les mondes débloqués, les collections, les succès et les statistiques.
 *
 * Ce qu'il ne contient **jamais** : la carte des découvertes complète, l'historique des
 * fusions, les recettes, les paramètres, les sauvegardes, ni quoi que ce soit permettant
 * de reconstituer la partie. Tout ce qui entre est normalisé et borné (`normaliserProfil`).
 */
import { AMIS, GAME, RARETES } from '../config.js';
import { encoderCode, lireCode, identifiantJoueur, normaliserPseudo } from './friends.js';

export const TYPE_PROFIL = 'profil';
export const VERSION_PROFIL = 1;

/** Bornes de l'aperçu : un profil reste petit (quelques kilo-octets au maximum). */
export const LIMITES_PROFIL = {
  maxDernieres: 12,
  maxRares: 8,
  maxFamiliers: 10,
  maxMondes: 16,
  maxCollections: 16,
  maxSucces: 16,
  maxPseudo: AMIS.longueurPseudo,
  maxTexte: 60,
  maxOctets: 5120,
};

/** Rareté à partir de laquelle une découverte est « rare » (Rare et au-delà). */
export const RARETE_MINIMALE_OBJET_RARE = 'Rare';

/* --------------------------- Petits utilitaires --------------------------- */

const estObjet = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Entier borné (toute valeur douteuse devient 0). */
function entier(valeur, max = 1_000_000_000) {
  const n = Math.floor(Number(valeur));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

/** Chaîne nettoyée et bornée (sans sauts de ligne). */
function texte(valeur, max = LIMITES_PROFIL.maxTexte) {
  return String(valeur ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Identifiant d'élément, de familier, de monde… : lettres, chiffres et tirets uniquement. */
function identifiant(valeur) {
  const t = texte(valeur, 80).toLowerCase();
  return /^[a-z0-9-]+$/.test(t) ? t : '';
}

/** Date ISO bornée en longueur (jamais utilisée comme valeur de confiance). */
function dateIso(valeur) {
  const t = texte(valeur, 40);
  return t || new Date().toISOString();
}

/** Rang d'une rareté dans l'échelle officielle (Commun = 0, la plus rare en dernier). */
function rangRarete(rarete) {
  const i = RARETES.indexOf(rarete);
  return i < 0 ? 0 : i;
}

/** Vrai si la rareté vaut au moins « Rare » : les objets dont un joueur est fier. */
function estRare(rarete) {
  return rangRarete(rarete) >= rangRarete(RARETE_MINIMALE_OBJET_RARE);
}

/** Résolveur sûr : une fonction fournie par l'appelant peut être absente ou échouer. */
function resoudre(fn, id, defaut) {
  if (typeof fn !== 'function') return defaut;
  try {
    return fn(id) ?? defaut;
  } catch {
    return defaut;
  }
}

/* --------------------------- Construction de l'aperçu --------------------------- */

/**
 * Construit l'aperçu public d'une partie.
 *
 * @param {object} save sauvegarde du joueur (lecture seule)
 * @param {object} [options]
 * @param {(id:string)=>({nom:string, emoji?:string, rarete?:string}|null)} [options.nomElement]
 * @param {(id:string)=>({nom:string, emoji?:string}|null)} [options.nomPet]
 * @param {(id:string)=>({nom:string, emoji?:string}|null)} [options.nomMonde]
 * @param {(id:string)=>({nom:string, emoji?:string}|null)} [options.nomCollection]
 * @param {(id:string)=>({nom:string}|null)} [options.nomSucces]
 * @param {number} [options.totalElements] taille du catalogue du jeu
 * @param {number} [options.totalCollections]
 * @param {number} [options.totalSucces]
 * @param {string} [options.date] horodatage de génération
 * @returns {object|null} aperçu, ou `null` si la partie est inutilisable
 */
export function construireProfil(save, options = {}) {
  if (!estObjet(save)) return null;
  const nom = normaliserPseudo(save.nom);
  if (!nom) return null;

  const decouvertesBrutes = estObjet(save.decouvertes) ? save.decouvertes : {};
  const parRarete = {};
  for (const r of RARETES) parRarete[r] = 0;
  const toutes = [];
  for (const [id, d] of Object.entries(decouvertesBrutes)) {
    const rarete = RARETES.includes(d?.rarete) ? d.rarete : 'Commun';
    parRarete[rarete] += 1;
    toutes.push({
      id: identifiant(id),
      rarete,
      date: dateIso(d?.date),
      source: d?.source === 'creation' ? 'creation' : 'officielle',
      premiere: Boolean(d?.premiere),
    });
  }
  toutes.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const total = toutes.length;
  const dernieres = toutes.slice(0, LIMITES_PROFIL.maxDernieres).map((d) => {
    const info = resoudre(options.nomElement, d.id, null);
    return {
      id: d.id,
      nom: texte(info?.nom || d.id, LIMITES_PROFIL.maxTexte) || d.id,
      emoji: texte(info?.emoji, 8) || '✨',
      rarete: d.rarete,
      date: d.date,
      source: d.source,
      premiere: d.premiere,
    };
  });

  // Les découvertes qui font rêver : les plus rares d'abord (un ami voit ainsi tout de
  // suite « ses plus beaux objets », et pas seulement ses dernières trouvailles).
  const totalRares = toutes.filter((d) => estRare(d.rarete)).length;
  const rares = toutes
    .filter((d) => estRare(d.rarete))
    .sort((a, b) => rangRarete(b.rarete) - rangRarete(a.rarete)
      || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, LIMITES_PROFIL.maxRares)
    .map((d) => {
      const info = resoudre(options.nomElement, d.id, null);
      return {
        id: d.id,
        nom: texte(info?.nom || d.id, LIMITES_PROFIL.maxTexte) || d.id,
        emoji: texte(info?.emoji, 8) || '✨',
        rarete: d.rarete,
        date: d.date,
      };
    });

  const equipe = Array.isArray(save.equipe) ? save.equipe.map(identifiant).filter(Boolean) : [];
  const familiersBruts = estObjet(save.familiers) ? save.familiers : {};
  const familiers = Object.entries(familiersBruts)
    // Les animaux les plus avancés d'abord : c'est ce qu'un ami veut voir en premier.
    .sort((a, b) => (entier(b[1]?.niveau, 999) || 1) - (entier(a[1]?.niveau, 999) || 1))
    .slice(0, LIMITES_PROFIL.maxFamiliers)
    .map(([id, f]) => {
      const cle = identifiant(id);
      const info = resoudre(options.nomPet, cle, null);
      return {
        id: cle,
        nom: texte(info?.nom || cle, LIMITES_PROFIL.maxTexte) || cle,
        emoji: texte(info?.emoji, 8) || '🐾',
        rarete: RARETES.includes(info?.rarete) ? info.rarete : 'Commun',
        niveau: entier(f?.niveau, 999) || 1,
        equipe: equipe.includes(cle),
      };
    });

  const mondes = Object.entries(estObjet(save.mondes) ? save.mondes : {})
    .filter(([, ok]) => Boolean(ok))
    .slice(0, LIMITES_PROFIL.maxMondes)
    .map(([id]) => {
      const cle = identifiant(id);
      const info = resoudre(options.nomMonde, cle, null);
      return {
        id: cle,
        nom: texte(info?.nom || cle, LIMITES_PROFIL.maxTexte) || cle,
        emoji: texte(info?.emoji, 8) || '🗺️',
      };
    });

  const collectionsBrutes = estObjet(save.collections) ? save.collections : {};
  const collections = Object.entries(collectionsBrutes)
    .slice(0, LIMITES_PROFIL.maxCollections)
    .map(([id, c]) => {
      const cle = identifiant(id);
      const info = resoudre(options.nomCollection, cle, null);
      return {
        id: cle,
        nom: texte(info?.nom || cle, LIMITES_PROFIL.maxTexte) || cle,
        emoji: texte(info?.emoji, 8) || '🧩',
        complete: Boolean(c?.complete),
      };
    });

  const succes = Object.entries(estObjet(save.succes) ? save.succes : {})
    .slice(0, LIMITES_PROFIL.maxSucces)
    .map(([id]) => {
      const cle = identifiant(id);
      const info = resoudre(options.nomSucces, cle, null);
      return { id: cle, nom: texte(info?.nom || cle, LIMITES_PROFIL.maxTexte) || cle };
    });

  const stats = estObjet(save.stats) ? save.stats : {};
  return {
    v: VERSION_PROFIL,
    type: TYPE_PROFIL,
    id: identifiantJoueur(nom),
    nom,
    avatar: texte(save.avatar, 8) || '🧪',
    date: dateIso(options.date),
    jeuVersion: texte(GAME.version, 12),
    progression: {
      niveau: entier(save.niveau, 9999) || 1,
      xp: entier(save.xp),
    },
    decouvertes: {
      total,
      catalogue: entier(options.totalElements),
      creations: entier(Object.keys(estObjet(save.creations) ? save.creations : {}).length),
      parRarete,
      dernieres,
      totalRares,
      rares,
    },
    familiers: {
      total: entier(Object.keys(familiersBruts).length, 999),
      liste: familiers,
      equipe: equipe.filter((id) => familiers.some((f) => f.id === id)),
    },
    mondes: {
      total: entier(Object.values(estObjet(save.mondes) ? save.mondes : {}).filter(Boolean).length, 999),
      referentiel: entier(options.totalMondes, 999),
      liste: mondes,
    },
    collections: {
      completees: entier(Object.values(collectionsBrutes).filter((c) => c?.complete).length, 999),
      referentiel: entier(options.totalCollections, 999),
      liste: collections,
    },
    succes: {
      total: entier(Object.keys(estObjet(save.succes) ? save.succes : {}).length, 999),
      referentiel: entier(options.totalSucces, 999),
      liste: succes,
    },
    stats: {
      fusionsTentees: entier(stats.fusionsTentees),
      quetesTerminees: entier(stats.quetesTerminees),
      aidesUtilisees: entier(stats.aidesUtilisees),
      joursDeJeu: entier(stats.joursDeJeu) || 1,
      serie: entier(save.series?.jours, 9999) || 1,
      potions: entier(save.potions, 100000),
      amis: entier((Array.isArray(save.amis?.liste) ? save.amis.liste.length : 0), 999),
    },
  };
}

/* --------------------------- Normalisation (données reçues) --------------------------- */

/**
 * Valide et normalise un profil reçu (code collé ou lu sur le relais).
 * Aucun champ inconnu n'est conservé, toutes les valeurs sont bornées, et l'identifiant
 * est **recalculé à partir du pseudonyme** : on ne fait jamais confiance à l'identifiant
 * annoncé (un profil « signé » par un autre identifiant serait incohérent).
 *
 * @returns {{ok:true, profil:object}|{ok:false, erreur:string}}
 */
export function normaliserProfil(brut) {
  if (!estObjet(brut)) return { ok: false, erreur: 'Profil illisible.' };
  const nom = normaliserPseudo(brut.nom);
  if (!nom) return { ok: false, erreur: 'Profil sans pseudonyme.' };

  // L'identifiant annoncé est IGNORÉ : il est toujours recalculé à partir du pseudonyme,
  // exactement comme pour les demandes d'amis. Un profil bricolé avec l'identifiant de
  // quelqu'un d'autre retombe donc sous le pseudonyme qu'il affiche, jamais sous le sien.
  const id = identifiantJoueur(nom);

  const liste = (valeur, max, mapper) => (Array.isArray(valeur) ? valeur.slice(0, max).map(mapper).filter(Boolean) : []);

  const dec = estObjet(brut.decouvertes) ? brut.decouvertes : {};
  const parRarete = {};
  const rareteBrute = estObjet(dec.parRarete) ? dec.parRarete : {};
  for (const r of RARETES) parRarete[r] = entier(rareteBrute[r], 200000);

  const profil = {
    v: VERSION_PROFIL,
    type: TYPE_PROFIL,
    id,
    nom,
    avatar: texte(brut.avatar, 8) || '🧪',
    date: dateIso(brut.date),
    jeuVersion: texte(brut.jeuVersion, 12),
    progression: {
      niveau: entier(estObjet(brut.progression) ? brut.progression.niveau : 1, 9999) || 1,
      xp: entier(estObjet(brut.progression) ? brut.progression.xp : 0),
    },
    decouvertes: {
      total: entier(dec.total, 200000),
      catalogue: entier(dec.catalogue, 200000),
      creations: entier(dec.creations, 200000),
      parRarete,
      dernieres: liste(dec.dernieres, LIMITES_PROFIL.maxDernieres, (d) => {
        const cle = identifiant(d?.id);
        if (!cle) return null;
        return {
          id: cle,
          nom: texte(d?.nom || cle, LIMITES_PROFIL.maxTexte) || cle,
          emoji: texte(d?.emoji, 8) || '✨',
          rarete: RARETES.includes(d?.rarete) ? d.rarete : 'Commun',
          date: dateIso(d?.date),
          source: d?.source === 'creation' ? 'creation' : 'officielle',
          premiere: Boolean(d?.premiere),
        };
      }),
      totalRares: entier(dec.totalRares, 200000),
      rares: liste(dec.rares, LIMITES_PROFIL.maxRares, (d) => {
        const cle = identifiant(d?.id);
        if (!cle) return null;
        return {
          id: cle,
          nom: texte(d?.nom || cle, LIMITES_PROFIL.maxTexte) || cle,
          emoji: texte(d?.emoji, 8) || '✨',
          rarete: RARETES.includes(d?.rarete) ? d.rarete : 'Commun',
          date: dateIso(d?.date),
        };
      }),
    },
    familiers: {
      total: entier(estObjet(brut.familiers) ? brut.familiers.total : 0, 999),
      liste: liste(estObjet(brut.familiers) ? brut.familiers.liste : [], LIMITES_PROFIL.maxFamiliers, (f) => {
        const cle = identifiant(f?.id);
        if (!cle) return null;
        return {
          id: cle,
          nom: texte(f?.nom || cle, LIMITES_PROFIL.maxTexte) || cle,
          emoji: texte(f?.emoji, 8) || '🐾',
          rarete: RARETES.includes(f?.rarete) ? f.rarete : 'Commun',
          niveau: entier(f?.niveau, 999) || 1,
          equipe: Boolean(f?.equipe),
        };
      }),
      equipe: [...new Set((Array.isArray(brut.familiers?.equipe) ? brut.familiers.equipe : []).map(identifiant).filter(Boolean))].slice(0, 3),
    },
    mondes: {
      total: entier(brut.mondes?.total, 999),
      referentiel: entier(brut.mondes?.referentiel, 999),
      liste: liste(brut.mondes?.liste, LIMITES_PROFIL.maxMondes, (m) => {
        const cle = identifiant(m?.id);
        if (!cle) return null;
        return { id: cle, nom: texte(m?.nom || cle, LIMITES_PROFIL.maxTexte) || cle, emoji: texte(m?.emoji, 8) || '🗺️' };
      }),
    },
    collections: {
      completees: entier(brut.collections?.completees, 999),
      referentiel: entier(brut.collections?.referentiel, 999),
      liste: liste(brut.collections?.liste, LIMITES_PROFIL.maxCollections, (c) => {
        const cle = identifiant(c?.id);
        if (!cle) return null;
        return { id: cle, nom: texte(c?.nom || cle, LIMITES_PROFIL.maxTexte) || cle, emoji: texte(c?.emoji, 8) || '🧩', complete: Boolean(c?.complete) };
      }),
    },
    succes: {
      total: entier(brut.succes?.total, 999),
      referentiel: entier(brut.succes?.referentiel, 999),
      liste: liste(brut.succes?.liste, LIMITES_PROFIL.maxSucces, (s) => {
        const cle = identifiant(s?.id);
        if (!cle) return null;
        return { id: cle, nom: texte(s?.nom || cle, LIMITES_PROFIL.maxTexte) || cle };
      }),
    },
    stats: {
      fusionsTentees: entier(brut.stats?.fusionsTentees),
      quetesTerminees: entier(brut.stats?.quetesTerminees),
      aidesUtilisees: entier(brut.stats?.aidesUtilisees),
      joursDeJeu: entier(brut.stats?.joursDeJeu, 100000) || 1,
      serie: entier(brut.stats?.serie, 100000) || 1,
      potions: entier(brut.stats?.potions, 100000),
      amis: entier(brut.stats?.amis, 999),
    },
  };

  const taille = JSON.stringify(profil).length;
  if (taille > LIMITES_PROFIL.maxOctets) return { ok: false, erreur: 'Profil trop volumineux.' };
  return { ok: true, profil };
}

/**
 * Normalise la carte des profils d'amis conservée dans la sauvegarde.
 * La clé de rangement est TOUJOURS l'identifiant recalculé (jamais la clé fournie),
 * les profils illisibles sont ignorés et le nombre d'entrées est borné.
 *
 * @param {object} brut
 * @param {{max?:number}} [options]
 * @returns {Object<string, {profil:object, recuLe:string, source:'relais'|'code'}>}
 */
export function normaliserProfilsAmis(brut, { max = AMIS.maxAmis } = {}) {
  const out = {};
  if (!estObjet(brut)) return out;
  for (const entree of Object.values(brut)) {
    if (Object.keys(out).length >= max) break;
    const candidat = estObjet(entree?.profil) ? entree.profil : entree;
    const res = normaliserProfil(candidat);
    if (!res.ok) continue;
    out[res.profil.id] = {
      profil: res.profil,
      recuLe: dateIso(estObjet(entree) ? entree.recuLe : undefined),
      source: entree?.source === 'relais' ? 'relais' : 'code',
    };
  }
  return out;
}

/** Vrai si `brut` ressemble à un profil (sans le valider complètement). */
export function estProfil(brut) {
  return Boolean(estObjet(brut) && (brut.type === TYPE_PROFIL || (brut.decouvertes && brut.progression)));
}

/* --------------------------- Codes de partage --------------------------- */

/** Encode un profil en code court à transmettre (même famille que les codes d'amis). */
export function encoderProfil(profil) {
  return encoderCode({ ...profil, v: VERSION_PROFIL, type: TYPE_PROFIL });
}

/**
 * Relit un code de profil.
 * @returns {{ok:true, profil:object}|{ok:false, erreur:string}}
 */
export function lireProfil(texte) {
  const lecture = lireCode(texte);
  if (!lecture.ok) return lecture;
  if (!estProfil(lecture.objet)) return { ok: false, erreur: 'Ce code n’est pas un profil de joueur.' };
  return normaliserProfil(lecture.objet);
}

/* --------------------------- Affichage --------------------------- */

/** Date lisible d'un aperçu reçu (« reçu le … »). */
export function dateApercu(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'date inconnue';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Résumé court d'un profil (pour les cartes d'ami).
 * `objets` / `animaux` sont les noms « joueur » des mêmes compteurs.
 */
export function resumeProfil(profil) {
  if (!profil) return null;
  return {
    nom: profil.nom,
    avatar: profil.avatar,
    niveau: profil.progression?.niveau || 1,
    objets: profil.decouvertes?.total || 0,
    objetsRares: profil.decouvertes?.totalRares || 0,
    animaux: profil.familiers?.total || 0,
    decouvertes: profil.decouvertes?.total || 0,
    familiers: profil.familiers?.total || 0,
    mondes: profil.mondes?.total || 0,
    succes: profil.succes?.total || 0,
    potions: profil.stats?.potions || 0,
  };
}
