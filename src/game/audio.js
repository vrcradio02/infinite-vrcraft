/**
 * Sons facultatifs, générés à la volée (aucun fichier audio à télécharger).
 * Respecte le réglage « sons » et le volume des paramètres.
 * Le contexte audio est créé paresseusement, après une action de l'utilisateur,
 * pour rester conforme aux politiques d'autoplay des navigateurs.
 */
let ctx = null;

function contexte() {
  if (ctx) return ctx;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/** Joue une note simple. */
export function jouerNote({ frequence = 440, duree = 0.12, volume = 0.5, type = 'sine' } = {}) {
  const ac = contexte();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = frequence;
  gain.gain.setValueAtTime(Math.min(0.4, volume * 0.4), ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duree);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duree);
}

/** Banque d'effets sonores du jeu. */
export const SONS = {
  fusion: (v) => [jouerNote({ frequence: 330, duree: 0.1, volume: v, type: 'triangle' }), setTimeout(() => jouerNote({ frequence: 440, duree: 0.12, volume: v, type: 'triangle' }), 70)],
  decouverte: (v) => [523, 659, 784].forEach((f, i) => setTimeout(() => jouerNote({ frequence: f, duree: 0.16, volume: v }), i * 80)),
  rare: (v) => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => jouerNote({ frequence: f, duree: 0.2, volume: v, type: 'sawtooth' }), i * 90)),
  quete: (v) => [660, 880].forEach((f, i) => setTimeout(() => jouerNote({ frequence: f, duree: 0.14, volume: v }), i * 90)),
  niveau: (v) => [523, 587, 659, 784, 1046].forEach((f, i) => setTimeout(() => jouerNote({ frequence: f, duree: 0.18, volume: v }), i * 100)),
  erreur: (v) => jouerNote({ frequence: 160, duree: 0.2, volume: v, type: 'square' }),
};

/** Joue un son du jeu en respectant les préférences. */
export function jouer(nom, parametres = {}) {
  if (!parametres.sons) return;
  const volume = typeof parametres.volume === 'number' ? parametres.volume : 0.5;
  SONS[nom]?.(volume);
}
