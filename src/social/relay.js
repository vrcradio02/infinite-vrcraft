/**
 * Relais d'amis (FACULTATIF) — transport HTTP des demandes, pour que la notification
 * arrive réellement chez l'autre joueur.
 *
 * Règles de sécurité, identiques à celles du service IA facultatif :
 *  - AUCUNE clé d'API dans le navigateur : on ne configure qu'une **URL publique** ;
 *  - le relais ne reçoit que des pseudonymes, des identifiants dérivés du pseudonyme et
 *    des horodatages — jamais de partie, de mot de passe ni d'adresse e-mail ;
 *  - si aucun relais n'est configuré, tout le système d'amis reste utilisable par
 *    **codes d'invitation** (voir `friends.js`), sans aucun réseau.
 *
 * Contrat attendu (voir `server/worker-amis.js`, exemple prêt à déployer) :
 *   POST <endpoint>  { type:'demande'|'reponse', id, de:{id,nom}, vers:{id,nom}, date }
 *                    -> 200 { ok:true }
 *   GET  <endpoint>?pour=<identifiant>
 *                    -> 200 { evenements:[ {type,id,de,vers,date}, ... ] }
 * Dans les deux types d'événement, `de` est celui qui écrit et `vers` celui qui reçoit :
 * une demande est donc livrée au destinataire, et une réponse revient à celui qui avait
 * demandé l'amitié (qui reçoit alors ses 10 potions).
 *
 * Profils d'amis (aperçu volontairement réduit, voir `profil.js`) :
 *   POST <endpoint>/profil          { profil:{ id, nom, ... } }   -> 200 { ok:true }
 *   GET  <endpoint>/profils?ids=a,b -> 200 { profils:[ {...}, ... ] }
 * Contrairement aux boîtes de messages (livrées une seule fois), un profil est conservé
 * et relu autant de fois que nécessaire par les amis ; il expire côté relais (voir le TTL).
 * Le relais livre chaque événement une seule fois (les données d'amis n'ont pas besoin
 * d'historique) : un doublon éventuel est ignoré côté jeu grâce à l'identifiant.
 */
import { AMIS, STORAGE_KEYS } from '../config.js';
import { TYPE_PROFIL, LIMITES_PROFIL } from './profil.js';

/** Nombre maximal d'identifiants demandés en une fois au relais. */
export const MAX_PROFILS_PAR_REQUETE = 20;

/** Lit la configuration du relais (URL publique uniquement — jamais de clé). */
export function chargerConfigAmis() {
  try {
    const brut = localStorage.getItem(STORAGE_KEYS.amisRelais);
    return brut ? { endpoint: '', actif: false, ...JSON.parse(brut) } : { endpoint: '', actif: false };
  } catch {
    return { endpoint: '', actif: false };
  }
}

export function enregistrerConfigAmis(config) {
  const propre = { endpoint: String(config.endpoint || '').trim(), actif: Boolean(config.actif) };
  try {
    localStorage.setItem(STORAGE_KEYS.amisRelais, JSON.stringify(propre));
  } catch { /* préférence non critique */ }
  return propre;
}

/** Vrai si un relais d'amis est configuré et activé. */
export function relaisDisponible(config = chargerConfigAmis()) {
  return Boolean(config.actif && /^https?:\/\//.test(String(config.endpoint || '')));
}

/** Adresse de base sans barre oblique finale. */
export function urlRelais(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

/**
 * Publie un événement (demande ou réponse) vers le relais.
 * @returns {Promise<{ok:boolean, erreur?:string}>}
 */
export async function publierEvenement({ endpoint, evenement, fetchImpl = fetch, signal } = {}) {
  const base = urlRelais(endpoint);
  if (!base) return { ok: false, erreur: 'Aucun relais d’amis configuré.' };
  try {
    const res = await fetchImpl(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(evenement),
      signal,
    });
    if (!res.ok) {
      const texte = await res.text().catch(() => '');
      return { ok: false, erreur: `Relais indisponible (HTTP ${res.status}). ${texte.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: `Erreur réseau vers le relais : ${e.message}` };
  }
}

/**
 * Récupère les événements qui m'attendent (demandes reçues et réponses d'amis).
 * @returns {Promise<{ok:boolean, evenements:object[], erreur?:string}>}
 */
export async function recupererEvenements({ endpoint, pour, fetchImpl = fetch, signal } = {}) {
  const base = urlRelais(endpoint);
  if (!base) return { ok: false, evenements: [], erreur: 'Aucun relais d’amis configuré.' };
  if (!pour) return { ok: false, evenements: [], erreur: 'Identifiant de joueur manquant.' };
  try {
    const url = `${base}?pour=${encodeURIComponent(pour)}`;
    const res = await fetchImpl(url, { signal });
    if (!res.ok) return { ok: false, evenements: [], erreur: `Relais indisponible (HTTP ${res.status}).` };
    const data = await res.json();
    const evenements = Array.isArray(data?.evenements) ? data.evenements.slice(0, AMIS.maxDemandes) : [];
    return { ok: true, evenements };
  } catch (e) {
    return { ok: false, evenements: [], erreur: `Erreur réseau vers le relais : ${e.message}` };
  }
}

/**
 * Dépose (ou met à jour) mon profil sur le relais, sous mon propre identifiant.
 * @returns {Promise<{ok:boolean, erreur?:string}>}
 */
export async function publierProfil({ endpoint, profil, fetchImpl = fetch, signal } = {}) {
  const base = urlRelais(endpoint);
  if (!base) return { ok: false, erreur: 'Aucun relais d’amis configuré.' };
  if (!profil || !profil.id) return { ok: false, erreur: 'Profil incomplet.' };
  if (JSON.stringify(profil).length > LIMITES_PROFIL.maxOctets * 2) {
    return { ok: false, erreur: 'Profil trop volumineux.' };
  }
  try {
    const res = await fetchImpl(`${base}/profil`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: TYPE_PROFIL, profil }),
      signal,
    });
    if (!res.ok) {
      const texte = await res.text().catch(() => '');
      return { ok: false, erreur: `Relais indisponible (HTTP ${res.status}). ${texte.slice(0, 160)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, erreur: `Erreur réseau vers le relais : ${e.message}` };
  }
}

/**
 * Récupère les profils publiés par mes amis.
 * @param {object} options
 * @param {string} options.endpoint
 * @param {string[]} options.ids identifiants d'amis
 * @returns {Promise<{ok:boolean, profils:object[], erreur?:string}>}
 */
export async function recupererProfils({ endpoint, ids, fetchImpl = fetch, signal } = {}) {
  const base = urlRelais(endpoint);
  if (!base) return { ok: false, profils: [], erreur: 'Aucun relais d’amis configuré.' };
  const propres = [...new Set((Array.isArray(ids) ? ids : [])
    .map((id) => String(id ?? '').trim().toLowerCase())
    .filter((id) => /^[a-z0-9-]+$/.test(id)))]
    .slice(0, MAX_PROFILS_PAR_REQUETE);
  if (!propres.length) return { ok: true, profils: [] };
  try {
    const res = await fetchImpl(`${base}/profils?ids=${encodeURIComponent(propres.join(','))}`, { signal });
    if (!res.ok) return { ok: false, profils: [], erreur: `Relais indisponible (HTTP ${res.status}).` };
    const data = await res.json().catch(() => null);
    const profils = Array.isArray(data?.profils) ? data.profils.slice(0, MAX_PROFILS_PAR_REQUETE) : [];
    return { ok: true, profils };
  } catch (e) {
    return { ok: false, profils: [], erreur: `Erreur réseau vers le relais : ${e.message}` };
  }
}

/** Intervalle d'interrogation conseillé (ms). */
export const INTERVALLE_SONDAGE = AMIS.sondageMs;
