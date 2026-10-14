/**
 * Collections thématiques : progression et complétion.
 * Les définitions viennent de `data/collections.json`.
 */

export async function chargerCollections(url = './data/collections.json', fetchImpl = fetch) {
  const res = await fetchImpl(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
  return (await res.json()).collections;
}

/**
 * Calcule l'état de toutes les collections pour une sauvegarde.
 * @returns {{collection:object, possedes:string[], manquants:string[], ratio:number, complete:boolean}[]}
 */
export function etatCollections(collections, sauvegarde) {
  return collections.map((c) => {
    const possedes = c.elements.filter((id) => sauvegarde.decouvertes?.[id]);
    const manquants = c.elements.filter((id) => !sauvegarde.decouvertes?.[id]);
    const ratio = c.elements.length ? possedes.length / c.elements.length : 0;
    return { collection: c, possedes, manquants, ratio, complete: manquants.length === 0 };
  });
}

/**
 * Détecte les collections nouvellement complétées (pour attribuer la récompense une seule fois).
 * @returns {object[]} collections à récompenser
 */
export function collectionsNouvelles(collections, sauvegarde) {
  const out = [];
  for (const c of etatCollections(collections, sauvegarde)) {
    if (c.complete && !sauvegarde.collections?.[c.collection.id]?.complete) {
      out.push(c.collection);
    }
  }
  return out;
}

/** Met à jour le drapeau de complétion dans la sauvegarde (mutation locale contrôlée). */
export function marquerCollections(collections, sauvegarde) {
  sauvegarde.collections = sauvegarde.collections || {};
  for (const c of etatCollections(collections, sauvegarde)) {
    const ex = sauvegarde.collections[c.collection.id] || {};
    sauvegarde.collections[c.collection.id] = {
      ...ex,
      possedes: c.possedes.length,
      total: c.collection.elements.length,
      complete: c.complete,
      completeLe: c.complete ? (ex.completeLe || new Date().toISOString()) : null,
    };
  }
  return sauvegarde.collections;
}
