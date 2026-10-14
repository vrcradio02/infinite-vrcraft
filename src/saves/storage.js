/**
 * Couche de stockage.
 *
 * - IndexedDB pour les sauvegardes (données volumineuses : découvertes, historique).
 * - localStorage pour les préférences légères.
 * - Repli automatique sur localStorage si IndexedDB est indisponible (mode privé,
 *   navigateurs restreints) afin que le jeu reste jouable.
 * - Gestion explicite des erreurs et des quotas.
 */

const DB_NAME = 'infinite-vrcraft';
const DB_VERSION = 1;
const STORE = 'saves';

let dbPromise = null;

function ouvrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponible'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Ouverture IndexedDB impossible'));
  }).catch((err) => {
    console.warn('[storage] repli sur localStorage :', err.message);
    return null;
  });
  return dbPromise;
}

/** Vrai si IndexedDB est utilisable. */
export async function indexedDbDisponible() {
  return (await ouvrirDB()) !== null;
}

const memoFallback = new Map();

async function poser(slot, valeur) {
  const db = await ouvrirDB();
  if (!db) {
    // Repli localStorage
    try {
      localStorage.setItem(`icu:save:${slot}`, JSON.stringify(valeur));
      memoFallback.set(String(slot), valeur);
      return { ok: true, moteur: 'localStorage' };
    } catch (e) {
      return { ok: false, erreur: `Stockage local saturé : ${e.message}` };
    }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(valeur, String(slot));
    tx.oncomplete = () => resolve({ ok: true, moteur: 'indexedDB' });
    tx.onerror = () => resolve({ ok: false, erreur: String(tx.error?.message || 'écriture impossible') });
    tx.onabort = () => resolve({ ok: false, erreur: 'transaction annulée (quota ?)' });
  });
}

async function lire(slot) {
  const db = await ouvrirDB();
  if (!db) {
    try {
      const brut = localStorage.getItem(`icu:save:${slot}`);
      return brut ? JSON.parse(brut) : null;
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(String(slot));
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

async function supprimer(slot) {
  const db = await ouvrirDB();
  if (!db) {
    localStorage.removeItem(`icu:save:${slot}`);
    memoFallback.delete(String(slot));
    return true;
  }
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(String(slot));
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  });
}

export const storage = {
  /** Écrit une sauvegarde dans un emplacement. */
  ecrire: poser,
  /** Lit une sauvegarde. */
  lire,
  /** Supprime une sauvegarde. */
  supprimer,

  /** Préférences légères (localStorage). */
  lirePrefs(cle, defaut) {
    try {
      const brut = localStorage.getItem(cle);
      return brut ? JSON.parse(brut) : defaut;
    } catch {
      return defaut;
    }
  },
  ecrirePrefs(cle, valeur) {
    try {
      localStorage.setItem(cle, JSON.stringify(valeur));
      return true;
    } catch {
      return false;
    }
  },
  supprimerPrefs(cle) {
    try { localStorage.removeItem(cle); } catch { /* ignore */ }
  },

  /** Estimation d'usage (si l'API est disponible). */
  async estimation() {
    try {
      if (navigator.storage?.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        return { usage, quota };
      }
    } catch { /* non supporté */ }
    return null;
  },
};
