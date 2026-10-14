/**
 * Mondes : conditions de déblocage et évaluation.
 * Les définitions viennent de `data/mondes.json`.
 */

export async function chargerMondes(url = './data/mondes.json', fetchImpl = fetch) {
  const res = await fetchImpl(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Impossible de charger ${url} (HTTP ${res.status})`);
  return (await res.json()).mondes;
}

/**
 * Évalue si la condition de déblocage d'un monde est remplie.
 * @param {object} monde
 * @param {object} sauvegarde
 * @returns {boolean}
 */
export function mondeDebloque(monde, sauvegarde) {
  const c = monde.deblocage || { type: 'depart' };
  switch (c.type) {
    case 'depart':
      return true;
    case 'decouvertes':
      return Object.keys(sauvegarde.decouvertes || {}).length >= (c.valeur || 0);
    case 'niveau':
      return (sauvegarde.niveau || 1) >= (c.valeur || 1);
    case 'quetes':
      return (sauvegarde.stats?.quetesTerminees || 0) >= (c.valeur || 0);
    case 'element':
      return Boolean(sauvegarde.decouvertes?.[c.cible]);
    case 'collection': {
      const col = sauvegarde.collections?.[c.cible];
      return Boolean(col?.complete);
    }
    default:
      return false;
  }
}

/** Renvoie la liste des mondes avec leur état de déblocage. */
export function etatMondes(mondes, sauvegarde) {
  return mondes.map((m) => ({
    ...m,
    debloque: mondeDebloque(m, sauvegarde),
    progression: progressionMonde(m, sauvegarde),
  }));
}

/** Progression 0..1 vers le déblocage d'un monde. */
export function progressionMonde(monde, sauvegarde) {
  const c = monde.deblocage || { type: 'depart' };
  switch (c.type) {
    case 'depart':
      return 1;
    case 'decouvertes': {
      const v = Object.keys(sauvegarde.decouvertes || {}).length;
      return Math.min(1, v / Math.max(1, c.valeur || 1));
    }
    case 'niveau':
      return Math.min(1, (sauvegarde.niveau || 1) / Math.max(1, c.valeur || 1));
    case 'quetes':
      return Math.min(1, (sauvegarde.stats?.quetesTerminees || 0) / Math.max(1, c.valeur || 1));
    case 'element':
      return sauvegarde.decouvertes?.[c.cible] ? 1 : 0;
    case 'collection':
      return sauvegarde.collections?.[c.cible]?.complete ? 1 : 0;
    default:
      return 0;
  }
}

/** Description lisible de la condition. */
export function descriptionCondition(monde) {
  const c = monde.deblocage || { type: 'depart' };
  switch (c.type) {
    case 'depart': return 'Disponible dès le départ';
    case 'decouvertes': return `Découvrir ${c.valeur} éléments`;
    case 'niveau': return `Atteindre le niveau ${c.valeur}`;
    case 'quetes': return `Terminer ${c.valeur} quêtes`;
    case 'element': return `Découvrir l'élément « ${c.cible} »`;
    case 'collection': return `Compléter la collection « ${c.cible} »`;
    default: return monde.objectifs || '';
  }
}
