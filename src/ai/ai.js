/**
 * IA de secours (facultative).
 *
 * SÉCURITÉ (étapes 89 & règle B.8) :
 *  - AUCUNE clé d'API n'est présente dans ce fichier ni ailleurs dans le code navigateur.
 *  - Le navigateur n'appelle qu'un point d'entrée intermédiaire (proxy/Worker) configuré
 *    par le joueur, qui détient la clé côté serveur.
 *  - Si aucun service n'est configuré, on utilise le mode expérimental LOCAL, déterministe,
 *    qui ne dépend d'aucun réseau.
 *
 * Les propositions de l'IA sont validées (étape 87) et TOUJOURS distinguées des recettes
 * officielles : elles ne sont jamais ajoutées au registre ni comptées comme découvertes
 * officielles, sauf si elles correspondent à une recette officielle existante.
 */
import { STORAGE_KEYS } from '../config.js';
import { validerProposition } from './validate-proposal.js';

/** Lit la configuration IA (endpoint public uniquement — jamais de clé). */
export function chargerConfigIA() {
  try {
    const brut = localStorage.getItem(STORAGE_KEYS.ai);
    return brut ? JSON.parse(brut) : { endpoint: '', actif: false };
  } catch {
    return { endpoint: '', actif: false };
  }
}

export function enregistrerConfigIA(config) {
  const propre = { endpoint: String(config.endpoint || '').trim(), actif: Boolean(config.actif) };
  try {
    localStorage.setItem(STORAGE_KEYS.ai, JSON.stringify(propre));
  } catch { /* préférence non critique */ }
  return propre;
}

/** Vrai si un service IA distant est configuré et activé. */
export function iaDisponible() {
  const c = chargerConfigIA();
  return Boolean(c.actif && /^https?:\/\//.test(c.endpoint));
}

/**
 * Demande une proposition de fusion au service distant.
 * Contrat attendu du proxy : POST { a, b, nomA, nomB } -> { resultat: { nom, categorie?, rarete?, description? } }
 * Le proxy doit renvoyer une erreur HTTP explicite si la limite d'usage est atteinte.
 *
 * @returns {Promise<{ok:boolean, proposition?:object, erreur?:string}>}
 */
export async function proposerIA({ a, b, nomA, nomB, fetchImpl = fetch, signal } = {}) {
  const config = chargerConfigIA();
  if (!config.actif || !config.endpoint) {
    return { ok: false, erreur: 'Aucun service IA configuré. Le mode expérimental local est utilisé.' };
  }
  try {
    const res = await fetchImpl(config.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a, b, nomA, nomB }),
      signal,
    });
    if (!res.ok) {
      const texte = await res.text().catch(() => '');
      return { ok: false, erreur: `Service IA indisponible (HTTP ${res.status}). ${texte.slice(0, 160)}` };
    }
    const data = await res.json();
    const verif = validerProposition(data, { a, b, nomA, nomB });
    if (!verif.ok) return { ok: false, erreur: verif.erreur };
    return { ok: true, proposition: verif.proposition };
  } catch (e) {
    return { ok: false, erreur: `Erreur réseau vers le service IA : ${e.message}` };
  }
}

/**
 * Point d'entrée unique utilisé par le jeu.
 * Ordre : mode Créativité avec service IA -> validation ; sinon composeur local.
 */
export async function obtenirAideIA({ a, b, nomA, nomB, composerLocal, mode, fetchImpl }) {
  if (mode === 'creativite' && iaDisponible()) {
    const rep = await proposerIA({ a, b, nomA, nomB, fetchImpl });
    if (rep.ok) return { source: 'ia', resultat: { ...rep.proposition, experimental: true } };
    // Échec IA : on n'échoue pas le jeu, on retombe sur le composeur local et on signale l'erreur.
    return { source: 'local', resultat: composerLocal(), avertissement: rep.erreur };
  }
  return { source: 'local', resultat: composerLocal() };
}

/** Vrai si le navigateur est hors ligne (le mode local reste toujours disponible). */
export function horsLigne() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}
