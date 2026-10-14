/**
 * Système d'amis — logique pure, testable hors navigateur.
 *
 * Principe : le jeu n'a **aucun compte**. Un joueur est identifié par son pseudonyme
 * (`identifiantJoueur()` produit un identifiant stable et lisible). Ajouter quelqu'un se
 * fait par échange de demande :
 *
 *   1. j'écris le pseudonyme de mon ami → une **demande** est créée ;
 *   2. mon ami la reçoit (par le relais facultatif, ou en collant mon **code d'invitation**)
 *      et voit la notification « X veut vous ajouter dans vos amis » ;
 *   3. s'il accepte, l'amitié est créée des deux côtés et **chacun reçoit 10 potions**
 *      (`AMIS.potionsParAmi`), une seule fois par ami (`cadeaux`).
 *
 * Aucune donnée réseau ici : uniquement des objets et des fonctions pures. Le transport
 * (relais HTTP facultatif ou code à copier/coller) vit dans `relay.js`.
 */
import { AMIS } from '../config.js';
import { hashString } from '../core/random.js';

/** Préfixe des codes d'invitation, versionné pour pouvoir évoluer. */
export const PREFIXE_CODE = 'ICU-AMI1:';
export const TYPE_DEMANDE = 'demande';
export const TYPE_REPONSE = 'reponse';

/** Nombre de potions offertes pour un ami accepté (les deux joueurs les reçoivent). */
export const POINTS_PAR_AMI = AMIS.potionsParAmi;

/* --------------------------- Identité --------------------------- */

/** Pseudonyme nettoyé (espaces multiples réduits, longueur bornée). */
export function normaliserPseudo(pseudo) {
  const p = String(pseudo ?? '').replace(/\s+/g, ' ').trim();
  return p ? p.slice(0, AMIS.longueurPseudo) : '';
}

/** Pseudonyme comparable (minuscules, sans accents, sans ponctuation). */
export function slugPseudo(pseudo) {
  const p = normaliserPseudo(pseudo)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return p.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'joueur';
}

/**
 * Identifiant stable d'un joueur : pseudonyme lisible + empreinte courte, ce qui évite
 * de confondre « Alex » et « Alèx » tout en restant vérifiable à l'œil.
 */
export function identifiantJoueur(pseudo) {
  const nom = normaliserPseudo(pseudo);
  const empreinte = hashString(nom.toLowerCase()).toString(36).slice(0, 6);
  return `${slugPseudo(nom)}-${empreinte}`;
}

/* --------------------------- Codes (base64url UTF-8, sans dépendance) --------------------------- */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function versBase64Url(octets) {
  let out = '';
  for (let i = 0; i < octets.length; i += 3) {
    const a = octets[i];
    const b = octets[i + 1];
    const c = octets[i + 2];
    out += ALPHABET[a >> 2];
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += ALPHABET[c & 63];
  }
  return out;
}

function depuisBase64Url(texte) {
  const propres = String(texte).replace(/[^A-Za-z0-9_-]/g, '');
  const sortie = [];
  let bits = 0;
  let valeur = 0;
  for (const c of propres) {
    const i = ALPHABET.indexOf(c);
    if (i < 0) continue;
    valeur = (valeur << 6) | i;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      sortie.push((valeur >> bits) & 0xff);
    }
  }
  return new Uint8Array(sortie);
}

/** Transforme un objet (demande, réponse…) en code court à copier/coller. */
export function encoderCode(objet) {
  const octets = new TextEncoder().encode(JSON.stringify(objet));
  return PREFIXE_CODE + versBase64Url(octets);
}

/** Relit un code d'invitation. Retourne `{ok:false, erreur}` si le code est invalide. */
export function lireCode(texte) {
  const brut = String(texte ?? '').trim();
  if (!brut) return { ok: false, erreur: 'Collez un code d’invitation.' };
  const sansEspace = brut.replace(/\s+/g, '');
  if (!sansEspace.startsWith(PREFIXE_CODE)) {
    return { ok: false, erreur: 'Ce code ne vient pas d’Infinite Craft Ultimate.' };
  }
  try {
    const json = new TextDecoder().decode(depuisBase64Url(sansEspace.slice(PREFIXE_CODE.length)));
    const objet = JSON.parse(json);
    if (!objet || typeof objet !== 'object') return { ok: false, erreur: 'Code illisible.' };
    return { ok: true, objet };
  } catch {
    return { ok: false, erreur: 'Code d’invitation endommagé.' };
  }
}

/* --------------------------- État des amis --------------------------- */

export function etatVide() {
  return { liste: [], recues: [], envoyees: [], cadeaux: [], traitees: [] };
}

/**
 * Signature d'une demande : identifiant + date de création.
 * Elle sert à ignorer les livraisons en double du relais (même demande) tout en
 * permettant à quelqu'un qui a été refusé de renvoyer une demande PLUS TARD :
 * la nouvelle demande a une date différente, donc une signature différente.
 */
export function signatureDemande(demande) {
  const id = String(demande?.id ?? '').slice(0, 80);
  const date = String(demande?.date ?? '').slice(0, 40);
  return `${id}@${date}`;
}

/**
 * Lit une personne `{ id, nom, avatar, date }`.
 * L'identifiant est **recalculé à partir du pseudonyme** : un identifiant annoncé n'est
 * jamais repris tel quel, sinon n'importe qui pourrait se présenter sous l'identifiant
 * d'un autre joueur (identité sans compte : le pseudo est la seule clé).
 */
function lirePersonne(brut) {
  if (!brut || typeof brut !== 'object') return null;
  const nom = normaliserPseudo(brut.nom);
  if (!nom) return null;
  const id = identifiantJoueur(nom);
  return {
    id,
    nom,
    avatar: typeof brut.avatar === 'string' ? brut.avatar.slice(0, 8) : '🧪',
    date: typeof brut.date === 'string' ? brut.date : new Date().toISOString(),
  };
}

/**
 * Normalise une liste d'entrées : `cleId` identifie l'entrée (identifiant de joueur pour
 * les amis, identifiant de demande pour les demandes) et `cleTiers` conserve l'autre
 * personne concernée (`de` pour une demande reçue, `vers` pour une demande envoyée).
 */
function normaliserEntrees(liste, max, { cleId = 'id', cleTiers = null } = {}) {
  const vus = new Set();
  const out = [];
  for (const item of Array.isArray(liste) ? liste : []) {
    const p = lirePersonne(item);
    if (!p) continue;
    // Entrée de la liste d'amis : l'identifiant est celui du joueur, dérivé du pseudonyme.
    // Demande reçue/envoyée : `id` est celui de la DEMANDE et `cleTiers` désigne l'autre
    // personne (toujours identifiée par son pseudonyme, jamais par un identifiant annoncé).
    const cle = String(item?.[cleId] ?? p.id).slice(0, 80);
    if (!cle) continue;
    const entree = { id: cleTiers ? cle : p.id, nom: p.nom, avatar: p.avatar, date: p.date };
    if (cleTiers) entree[cleTiers] = p.id;
    const signature = cleTiers ? `${cle}|${p.id}` : p.id;
    if (vus.has(signature)) continue;
    vus.add(signature);
    out.push(entree);
    if (out.length >= max) break;
  }
  return out;
}

/** Remet un état d'amis aux normes (liste blanche de champs, doublons retirés, bornes). */
export function normaliserEtatAmis(brut) {
  const e = etatVide();
  if (!brut || typeof brut !== 'object') return e;
  e.liste = normaliserEntrees(brut.liste, AMIS.maxAmis);
  e.recues = normaliserEntrees(brut.recues, AMIS.maxDemandes, { cleTiers: 'de' });
  e.envoyees = normaliserEntrees(brut.envoyees, AMIS.maxDemandes, { cleTiers: 'vers' });
  e.cadeaux = [...new Set((Array.isArray(brut.cadeaux) ? brut.cadeaux : []).map((x) => String(x).slice(0, 80)))].slice(0, AMIS.maxAmis);
  e.traitees = [...new Set((Array.isArray(brut.traitees) ? brut.traitees : []).map((x) => String(x).slice(0, 80)))].slice(-AMIS.maxDemandes * 2);
  return e;
}

export function estAmi(etat, id) {
  return normaliserEtatAmis(etat).liste.some((a) => a.id === id);
}

/* --------------------------- Demandes --------------------------- */

/**
 * Crée une demande d'ami à envoyer.
 * L'identifiant est déterministe : une même paire de joueurs ne peut pas accumuler
 * plusieurs demandes en attente.
 */
export function creerDemande({ de, vers, date = new Date().toISOString() }) {
  const nomDe = normaliserPseudo(de);
  const nomVers = normaliserPseudo(vers);
  if (!nomDe) return { ok: false, erreur: 'Votre pseudonyme est vide : créez d’abord une partie.' };
  if (!nomVers) return { ok: false, erreur: 'Indiquez le pseudonyme de votre ami.' };
  const idDe = identifiantJoueur(nomDe);
  const idVers = identifiantJoueur(nomVers);
  if (idDe === idVers) return { ok: false, erreur: 'Vous ne pouvez pas vous ajouter vous-même.' };
  return {
    ok: true,
    demande: {
      id: `dem_${hashString(`${idDe}|${idVers}`).toString(36)}`,
      de: { id: idDe, nom: nomDe },
      vers: { id: idVers, nom: nomVers },
      date,
      version: 1,
    },
  };
}

/** Enregistre une demande envoyée par moi (l'ami doit encore l'accepter). */
export function enregistrerDemandeEnvoyee(etat, demande) {
  const e = normaliserEtatAmis(etat);
  const p = lirePersonne(demande?.vers);
  if (!p) return { ok: false, erreur: 'Destinataire invalide.', etat: e };
  if (e.liste.some((a) => a.id === p.id)) return { ok: false, dejaAmi: true, erreur: 'Vous êtes déjà amis.', etat: e };
  const id = String(demande.id || `dem_${p.id}`).slice(0, 80);
  if (!e.envoyees.some((d) => d.id === id)) {
    if (e.envoyees.length >= AMIS.maxDemandes) return { ok: false, erreur: 'Trop de demandes en attente.', etat: e };
    e.envoyees.push({ id, nom: p.nom, avatar: p.avatar, date: p.date, vers: p.id });
  }
  return { ok: true, etat: e };
}

/**
 * Enregistre une demande reçue.
 * Refusée si elle ne m'est pas destinée, si je suis déjà ami avec l'expéditeur, ou si
 * elle a déjà été traitée (acceptée/refusée/ignorée) — pour ne pas renotifier sans fin.
 */
export function ajouterDemandeRecue(etat, demande, { moi } = {}) {
  const e = normaliserEtatAmis(etat);
  const idMoi = identifiantJoueur(moi);
  const expediteur = lirePersonne(demande?.de);
  if (!expediteur) return { ok: false, erreur: 'Expéditeur invalide.', etat: e };
  if (expediteur.id === idMoi) return { ok: false, erreur: 'Une demande ne peut pas venir de vous-même.', etat: e };
  if (demande?.vers?.id && demande.vers.id !== idMoi) {
    return { ok: false, erreur: 'Cette demande ne vous est pas destinée.', etat: e };
  }
  const id = String(demande.id || `dem_${expediteur.id}`).slice(0, 80);
  const date = String(demande.date ?? '').slice(0, 40);
  if (e.liste.some((a) => a.id === expediteur.id)) return { ok: false, dejaAmi: true, erreur: 'Vous êtes déjà amis.', etat: e };
  if (e.traitees.includes(signatureDemande({ id, date }))) return { ok: false, traitee: true, erreur: 'Demande déjà traitée.', etat: e };
  if (e.recues.some((d) => d.id === id)) return { ok: false, dejaPresente: true, etat: e };
  if (e.recues.length >= AMIS.maxDemandes) return { ok: false, erreur: 'Trop de demandes reçues.', etat: e };
  e.recues.push({ id, nom: expediteur.nom, avatar: expediteur.avatar, date, de: expediteur.id });
  return { ok: true, etat: e, demande: e.recues[e.recues.length - 1] };
}

/** Marque un identifiant de demande comme traitée (acceptée, refusée ou ignorée). */
export function marquerTraitee(etat, id) {
  const e = normaliserEtatAmis(etat);
  const cle = String(id ?? '').slice(0, 80);
  if (cle && !e.traitees.includes(cle)) e.traitees.push(cle);
  e.traitees = e.traitees.slice(-AMIS.maxDemandes * 2);
  return e;
}

/**
 * Refuse (ou ignore) une demande reçue : CETTE demande ne reviendra plus.
 * La personne pourra en renvoyer une nouvelle plus tard (nouvelle date = nouvelle signature).
 */
export function refuserDemande(etat, id) {
  const e = normaliserEtatAmis(etat);
  const demande = e.recues.find((d) => d.id === id);
  e.recues = e.recues.filter((d) => d.id !== id);
  return { ok: true, etat: demande ? marquerTraitee(e, signatureDemande(demande)) : e };
}

/**
 * Ajoute un ami et verse la récompense **une seule fois par personne**.
 * `cadeaux` garde la trace des amis déjà récompensés : retirer puis rajouter un ami
 * ne redonne pas 10 potions.
 */
export function ajouterAmi(etat, personne, { date = new Date().toISOString() } = {}) {
  const e = normaliserEtatAmis(etat);
  const p = lirePersonne(personne);
  if (!p) return { ok: false, erreur: 'Ami invalide.', etat: e };
  const deja = e.liste.find((a) => a.id === p.id);
  if (deja) return { ok: true, dejaAmi: true, ami: deja, potions: 0, etat: e };
  if (e.liste.length >= AMIS.maxAmis) {
    return { ok: false, erreur: `Limite de ${AMIS.maxAmis} amis atteinte.`, etat: e };
  }
  const ami = { id: p.id, nom: p.nom, avatar: p.avatar, date: date || p.date };
  e.liste.push(ami);
  let potions = 0;
  if (!e.cadeaux.includes(p.id)) {
    e.cadeaux.push(p.id);
    potions = POINTS_PAR_AMI;
  }
  return { ok: true, ami, potions, dejaAmi: false, etat: e };
}

/** Accepte une demande reçue : l'expéditeur devient un ami et rapporte des potions. */
export function accepterDemande(etat, id, { date = new Date().toISOString() } = {}) {
  const e = normaliserEtatAmis(etat);
  const demande = e.recues.find((d) => d.id === id);
  if (!demande) return { ok: false, erreur: 'Demande introuvable.', etat: e };
  const restant = e.recues.filter((d) => d.id !== id);
  const res = ajouterAmi({ ...e, recues: restant }, { id: demande.de, nom: demande.nom, avatar: demande.avatar }, { date });
  const avecTrace = marquerTraitee(res.etat, signatureDemande(demande));
  if (!res.ok) return { ...res, etat: avecTrace };
  return { ...res, etat: avecTrace, demande };
}

/** Retire un ami de la liste (les potions déjà gagnées restent acquises). */
export function retirerAmi(etat, id) {
  const e = normaliserEtatAmis(etat);
  const avant = e.liste.length;
  e.liste = e.liste.filter((a) => a.id !== id);
  e.envoyees = e.envoyees.filter((d) => d.vers !== id);
  return { ok: e.liste.length < avant, etat: e, potions: 0 };
}

/** Annule une demande que j'avais envoyée (identifiant de demande OU de destinataire). */
export function annulerDemandeEnvoyee(etat, id) {
  const e = normaliserEtatAmis(etat);
  e.envoyees = e.envoyees.filter((d) => d.id !== id && d.vers !== id);
  return { ok: true, etat: e };
}

/* --------------------------- Réponses (l'ami a accepté) --------------------------- */

/** Construit la réponse à renvoyer à l'expéditeur après acceptation. */
export function creerReponse({ de, vers, date = new Date().toISOString() }) {
  const nomDe = normaliserPseudo(de);
  const nomVers = normaliserPseudo(vers);
  if (!nomDe || !nomVers) return { ok: false, erreur: 'Réponse incomplète.' };
  return {
    ok: true,
    reponse: {
      id: `rep_${hashString(`${identifiantJoueur(nomDe)}|${identifiantJoueur(nomVers)}`).toString(36)}`,
      de: { id: identifiantJoueur(nomDe), nom: nomDe },
      vers: { id: identifiantJoueur(nomVers), nom: nomVers },
      date,
      version: 1,
    },
  };
}

/**
 * Traite la réponse d'un ami (il a accepté ma demande) : il devient mon ami et je reçois
 * mes 10 potions, une seule fois.
 */
export function traiterReponse(etat, reponse, { moi } = {}) {
  const e = normaliserEtatAmis(etat);
  const idMoi = identifiantJoueur(moi);
  const p = lirePersonne(reponse?.de);
  if (!p) return { ok: false, erreur: 'Réponse invalide.', etat: e };
  if (reponse?.vers?.id && reponse.vers.id !== idMoi) return { ok: false, erreur: 'Cette réponse ne vous concerne pas.', etat: e };
  const res = ajouterAmi(e, p);
  const avecTrace = annulerDemandeEnvoyee(res.etat, p.id).etat;
  return { ...res, etat: avecTrace };
}

/** Résumé affichable de l'état d'amis. */
export function resumeAmis(etat) {
  const e = normaliserEtatAmis(etat);
  return {
    total: e.liste.length,
    recues: e.recues.length,
    envoyees: e.envoyees.length,
    potionsGagnees: e.cadeaux.length * POINTS_PAR_AMI,
    potionsParAmi: POINTS_PAR_AMI,
  };
}
