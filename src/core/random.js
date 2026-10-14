/**
 * Générateur pseudo-aléatoire déterministe (xoshiro-ish via mulberry32).
 * Utilisé partout où le résultat doit être reproductible pour les mêmes entrées :
 * compositions expérimentales, quêtes quotidiennes, générateur de recettes.
 */

/** Hash de chaîne -> entier 32 bits (FNV-1a). */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Crée une fonction aléatoire déterministe à partir d'une graine (chaîne ou nombre). */
export function seededRandom(seed) {
  let a = (typeof seed === 'number' ? seed : hashString(String(seed))) >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Choisit un élément déterministe dans un tableau. */
export function pickFrom(list, seed) {
  if (!list.length) return undefined;
  const rnd = seededRandom(seed);
  return list[Math.floor(rnd() * list.length)];
}

/** Mélange déterministe (Fisher-Yates) sans muter l'entrée. */
export function shuffle(list, seed) {
  const arr = [...list];
  const rnd = seededRandom(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Identifiant unique court, sans dépendance externe. */
export function uid(prefix = 'id') {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}
