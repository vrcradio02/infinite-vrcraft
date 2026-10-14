/**
 * Gestionnaire de sauvegardes : exactement 3 emplacements indépendants.
 *
 * - création / chargement / suppression par emplacement,
 * - export JSON par emplacement (avec version de format),
 * - import validé avec prévisualisation,
 * - copie de secours automatique avant toute opération destructrice,
 * - restauration possible depuis la copie de secours.
 */
import { GAME, SAVE_FORMAT_VERSION, NB_SAUVEGARDES, ELEMENTS_DE_DEPART } from '../config.js';
import { storage } from './storage.js';
import { validerSauvegarde, validerTexteSauvegarde, normaliserSauvegarde, slotValide } from './validate.js';

const CLE_BACKUP = (slot) => `icu:backup:${slot}`;
const CLE_INDEX = 'icu:slot-index:v1';

/** Structure d'une nouvelle partie vierge. */
export function nouvelleSauvegarde(nom = 'Joueur', avatar = '🧪') {
  const now = new Date().toISOString();
  const decouvertes = {};
  // Les quatre éléments de départ imposés : Feu, Eau, Terre, Vent.
  for (const id of ELEMENTS_DE_DEPART) {
    decouvertes[id] = {
      id,
      date: now,
      source: 'depart',
      rarete: 'Commun',
    };
  }
  return {
    formatVersion: SAVE_FORMAT_VERSION,
    jeu: GAME.slug,
    jeuVersion: GAME.version,
    nom,
    avatar,
    creeLe: now,
    modifieLe: now,
    niveau: 1,
    xp: 0,
    decouvertes,
    historique: [],
    experimental: {},
    succes: {},
    mondes: { libre: true, nature: true },
    collections: {},
    familiers: {},
    equipe: [],
    quetes: { jour: null, semaine: null, quotidiennes: [], hebdomadaires: [], scenarisees: [], derniereJour: null, derniereSemaine: null },
    aideQuota: null,
    series: { derniereConnexion: now, jours: 1 },
    stats: {
      fusionsTentees: 0,
      decouvertes: ELEMENTS_DE_DEPART.length,
      quetesTerminees: 0,
      joursDeJeu: 1,
      experimentales: 0,
      aidesUtilisees: 0,
    },
    parametres: { theme: 'cosmos', langue: 'fr', sons: false, volume: 0.5, animationsReduites: false, tailleElements: 1, mode: 'catalogue' },
    sauvegardeAuto: true,
  };
}

export class GestionnaireSauvegardes {
  constructor() {
    this.index = storage.lirePrefs(CLE_INDEX, { derniere: null });
  }

  /** Retourne les métadonnées allégées des 3 emplacements (sans charger tout). */
  async lister() {
    const out = [];
    for (let i = 0; i < NB_SAUVEGARDES; i++) {
      const data = await storage.lire(i);
      if (!data) {
        out.push({ slot: i, existe: false });
        continue;
      }
      out.push({
        slot: i,
        existe: true,
        nom: data.nom,
        avatar: data.avatar,
        niveau: data.niveau,
        xp: data.xp,
        decouvertes: Object.keys(data.decouvertes || {}).length,
        modifieLe: data.modifieLe,
        creeLe: data.creeLe,
        familles: Object.keys(data.familiers || {}).length,
      });
    }
    return out;
  }

  /** Charge une partie complète. */
  async charger(slot) {
    if (!slotValide(slot)) throw new Error('Emplacement invalide');
    const data = await storage.lire(slot);
    if (!data) return null;
    const res = validerSauvegarde(data);
    if (!res.ok) {
      console.warn('[saves] sauvegarde corrompue, tentative de restauration :', res.erreur);
      const restaure = await this.restaurerSecours(slot);
      return restaure ? { ...restaure, _restauree: true } : null;
    }
    this.index.derniere = slot;
    storage.ecrirePrefs(CLE_INDEX, this.index);
    return res.data;
  }

  /**
   * Écrit une partie. Réalise une copie de secours avant écrasement quand l'option est active.
   */
  async ecrire(slot, data, backup = true) {
    if (!slotValide(slot)) throw new Error('Emplacement invalide');
    if (backup) {
      const ancienne = await storage.lire(slot);
      if (ancienne) storage.ecrirePrefs(CLE_BACKUP(slot), { quand: new Date().toISOString(), data: ancienne });
    }
    const propre = { ...data, formatVersion: SAVE_FORMAT_VERSION, modifieLe: new Date().toISOString() };
    const res = await storage.ecrire(slot, propre);
    if (!res.ok) throw new Error(res.erreur || 'Écriture impossible');
    this.index.derniere = slot;
    storage.ecrirePrefs(CLE_INDEX, this.index);
    return propre;
  }

  /** Crée une partie neuve dans un emplacement (écrase après sauvegarde de secours). */
  async creer(slot, nom, avatar) {
    if (!slotValide(slot)) throw new Error('Emplacement invalide');
    const data = nouvelleSauvegarde(nom, avatar);
    await this.ecrire(slot, data, true);
    return data;
  }

  /** Réinitialise un emplacement (avec copie de secours). */
  async reinitialiser(slot) {
    if (!slotValide(slot)) throw new Error('Emplacement invalide');
    const ancienne = await storage.lire(slot);
    if (ancienne) storage.ecrirePrefs(CLE_BACKUP(slot), { quand: new Date().toISOString(), data: ancienne });
    await storage.supprimer(slot);
    if (this.index.derniere === slot) {
      this.index.derniere = null;
      storage.ecrirePrefs(CLE_INDEX, this.index);
    }
    return true;
  }

  /** Restaure la dernière copie de secours d'un emplacement. */
  async restaurerSecours(slot) {
    const backup = storage.lirePrefs(CLE_BACKUP(slot), null);
    if (!backup?.data) return null;
    const res = validerSauvegarde(backup.data);
    if (!res.ok) return null;
    await storage.ecrire(slot, res.data);
    return res.data;
  }

  existeSecours(slot) {
    return Boolean(storage.lirePrefs(CLE_BACKUP(slot), null)?.data);
  }

  /** Exporte une sauvegarde en objet prêt à être téléchargé. */
  async exporter(slot) {
    const data = await storage.lire(slot);
    if (!data) throw new Error('Emplacement vide');
    return {
      formatVersion: SAVE_FORMAT_VERSION,
      jeu: GAME.slug,
      exporteLe: new Date().toISOString(),
      save: data,
    };
  }

  /** Sérialise l'export en JSON lisible. */
  async exporterTexte(slot) {
    return JSON.stringify(await this.exporter(slot), null, 2);
  }

  /**
   * Importe dans un emplacement après validation.
   * @param {number} slot
   * @param {string} texte contenu JSON
   */
  async importer(slot, texte) {
    if (!slotValide(slot)) throw new Error('Emplacement invalide');
    const res = validerTexteSauvegarde(texte);
    if (!res.ok) return { ok: false, erreur: res.erreur, details: res.details };

    // Le contenu peut être une sauvegarde directe ou un export { save: {...} } :
    // validerTexteSauvegarde a déjà dépaqueté les deux formes.
    const verif = validerSauvegarde(res.data);
    if (!verif.ok) return { ok: false, erreur: verif.erreur, details: verif.details };

    await this.ecrire(slot, verif.data, true);
    return { ok: true, avertissements: verif.avertissements || [] };
  }

  /** Dernier emplacement utilisé. */
  dernierSlot() {
    return this.index.derniere;
  }
}

export { normaliserSauvegarde };
