/**
 * Bus d'événements minimaliste.
 * Permet de découpler le moteur, la progression et l'interface.
 */
const listeners = new Map();

export function on(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
  return () => off(type, handler);
}

export function off(type, handler) {
  listeners.get(type)?.delete(handler);
}

export function emit(type, payload) {
  const set = listeners.get(type);
  if (!set) return;
  for (const handler of [...set]) {
    try {
      handler(payload);
    } catch (err) {
      // Une erreur d'un abonné ne doit jamais bloquer le jeu, mais elle doit rester visible.
      console.error(`[events] échec du gestionnaire "${type}"`, err);
    }
  }
}

/** Noms d'événements canoniques. */
export const EV = {
  DECOUVERTE: 'decouverte',
  FUSION: 'fusion',
  XP: 'xp',
  NIVEAU: 'niveau',
  QUETE: 'quete',
  QUETE_TERMINEE: 'quete:terminee',
  SUCCES: 'succes',
  FAMILIER: 'familier',
  AIDE: 'aide',
  SAUVEGARDE: 'sauvegarde',
  PREFS: 'prefs',
  MONDE: 'monde',
  AMI: 'ami',
};
