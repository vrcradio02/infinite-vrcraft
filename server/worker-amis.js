/**
 * Relais d'amis — exemple prêt à déployer (Cloudflare Worker + KV).
 *
 * À QUOI ÇA SERT
 * Le jeu est un site statique : il ne peut pas, à lui seul, prévenir un autre joueur.
 * Ce petit relais transporte les demandes d'amis (« X veut vous ajouter ») et les
 * réponses (« Y a accepté »). Sans lui, le jeu reste utilisable : on échange alors un
 * **code d'invitation** à coller dans l'écran Amis.
 *
 * CE QUE CE RELAIS NE FAIT PAS (volontairement)
 *  - aucun compte, aucun e-mail, aucun mot de passe : on ne transporte que des
 *    pseudonymes et des identifiants dérivés du pseudonyme ;
 *  - aucune partie de jeu : les sauvegardes restent dans le navigateur des joueurs ;
 *  - aucune donnée conservée durablement : chaque événement est livré une seule fois
 *    puis supprimé, et tout expire au bout de 7 jours.
 *
 * DÉPLOIEMENT (compte Cloudflare gratuit)
 *   npm create cloudflare@latest -- relais-amis     # ou via le tableau de bord
 *   wrangler kv namespace create AMIS               # crée le stockage
 *   # wrangler.toml :
 *   #   name = "relais-amis"
 *   #   main = "worker-amis.js"
 *   #   kv_namespaces = [{ binding = "AMIS", id = "<id du namespace>" }]
 *   wrangler deploy
 * Puis, dans le jeu : Paramètres → Amis → collez l'adresse du Worker et cochez « activer ».
 *
 * CONTRAT
 *   POST <endpoint>   { type:'demande'|'reponse', id, de:{id,nom}, vers:{id,nom}, date }
 *                     -> 200 { ok:true }
 *   GET  <endpoint>?pour=<identifiant>
 *                     -> 200 { evenements:[ { type, id, de, vers, date } ] }   (puis vidé)
 *   POST <endpoint>/profil    { profil:{ id, nom, ... } }   -> 200 { ok:true }
 *   GET  <endpoint>/profils?ids=a,b,c                       -> 200 { profils:[ {...} ] }
 *
 * SÉCURITÉ : l'identifiant de l'auteur d'un événement ou d'un profil est **recalculé à
 * partir du pseudonyme** (`slug-hash6`, même calcul que `src/social/friends.js`).
 * L'identifiant annoncé est ignoré : impossible de déposer quelque chose dans la boîte
 * d'un autre joueur (ou d'écraser son profil) en recopiant son identifiant.
 *
 * Les profils (aperçu d'une partie : niveau, découvertes, familiers, statistiques) sont
 * conservés sous l'identifiant de leur auteur et relus par ses amis ; ils expirent avec le
 * TTL. Les boîtes de messages, elles, sont vidées à la première lecture.
 */

/** Bornes de sécurité : le relais refuse tout ce qui sort de ce cadre. */
const LIMITES = {
  maxParBoite: 20,        // événements en attente par destinataire
  maxCorps: 8192,         // taille maximale du corps POST (octets)
  dureeDeVie: 7 * 86400,  // expiration KV des messages (secondes)
  dureeProfil: 30 * 86400, // expiration KV des profils (secondes)
  maxPseudo: 24,
  maxId: 80,
  maxProfil: 8192,        // taille maximale d'un profil sérialisé
  maxIds: 20,             // identifiants par requête de profils
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

const json = (corps, statut = 200) => new Response(JSON.stringify(corps), {
  status: statut,
  headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS },
});

const textePropre = (valeur, max) => String(valeur ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* ------------------------------------------------------------------ */
/* Identité : l'identifiant est DÉRIVÉ du pseudonyme                   */
/*                                                                     */
/* Le relais applique exactement le même calcul que le jeu             */
/* (src/social/friends.js) et ignore l'identifiant annoncé : sinon on  */
/* pourrait déposer un message ou un profil dans la boîte de quelqu'un */
/* d'autre en recopiant son identifiant.                               */
/* ------------------------------------------------------------------ */

/** Hash FNV-1a -> base 36 (identique à `hashString` du jeu). */
function empreinte(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Pseudonyme -> slug lisible (sans accents ni ponctuation). */
function slug(nom) {
  return String(nom)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'joueur';
}

/** Identifiant de joueur : `slug-hash6`, recalculé à partir du SEUL pseudonyme. */
function identifiantJoueur(nom) {
  return `${slug(nom)}-${empreinte(String(nom).toLowerCase()).slice(0, 6)}`;
}

/** Vérifie qu'une personne est bien `{id, nom}` et retourne sa forme nettoyée. */
function personne(brut, max) {
  if (!brut || typeof brut !== 'object') return null;
  const nom = textePropre(brut.nom, max);
  if (!nom) return null;
  return { id: identifiantJoueur(nom), nom };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

    let url;
    try {
      url = new URL(request.url);
    } catch {
      return json({ ok: false, erreur: 'URL invalide.' }, 400);
    }

    if (!env?.AMIS) return json({ ok: false, erreur: 'Stockage KV « AMIS » non configuré.' }, 500);

    const chemin = url.pathname.replace(/\/+$/, '');

    /* ------------------------- Publier mon profil ------------------------- */
    if (request.method === 'POST' && chemin.endsWith('/profil')) {
      const taille = Number(request.headers.get('content-length') || 0);
      if (taille > LIMITES.maxProfil) return json({ ok: false, erreur: 'Profil trop volumineux.' }, 413);

      let corps;
      try {
        corps = await request.json();
      } catch {
        return json({ ok: false, erreur: 'JSON invalide.' }, 400);
      }

      const profil = corps?.profil;
      if (!profil || typeof profil !== 'object' || Array.isArray(profil)) {
        return json({ ok: false, erreur: 'Profil manquant.' }, 400);
      }
      const auteur = personne(profil, LIMITES.maxPseudo);
      if (!auteur) return json({ ok: false, erreur: 'Profil sans pseudonyme ni identifiant valide.' }, 400);

      const serialise = JSON.stringify({ ...profil, id: auteur.id, nom: auteur.nom });
      if (serialise.length > LIMITES.maxProfil) return json({ ok: false, erreur: 'Profil trop volumineux.' }, 413);

      // Un profil est TOUJOURS rangé sous l'identifiant dérivé du pseudonyme : on ne peut
      // pas publier (ni écraser) un aperçu dans la boîte de quelqu'un d'autre.
      await env.AMIS.put(`profil:${auteur.id}`, serialise, { expirationTtl: LIMITES.dureeProfil });
      return json({ ok: true });
    }

    /* ------------------------- Lire les profils de mes amis ------------------------- */
    if (request.method === 'GET' && chemin.endsWith('/profils')) {
      const demandes = textePropre(url.searchParams.get('ids'), LIMITES.maxId * LIMITES.maxIds)
        .split(',')
        .map((id) => id.trim().toLowerCase())
        .filter((id) => /^[a-z0-9-]+$/.test(id))
        .slice(0, LIMITES.maxIds);

      const profils = [];
      for (const id of demandes) {
        const brut = await env.AMIS.get(`profil:${id}`);
        if (!brut) continue;
        try {
          profils.push(JSON.parse(brut));
        } catch { /* entrée illisible : ignorée, jamais renvoyée telle quelle */ }
      }
      return json({ ok: true, profils });
    }

    /* ------------------------- Envoyer un événement ------------------------- */
    if (request.method === 'POST' && !chemin.endsWith('/profil')) {
      const taille = Number(request.headers.get('content-length') || 0);
      if (taille > LIMITES.maxCorps) return json({ ok: false, erreur: 'Corps trop volumineux.' }, 413);

      let corps;
      try {
        corps = await request.json();
      } catch {
        return json({ ok: false, erreur: 'JSON invalide.' }, 400);
      }

      const type = corps?.type === 'reponse' ? 'reponse' : corps?.type === 'demande' ? 'demande' : null;
      if (!type) return json({ ok: false, erreur: 'Type d’événement inconnu.' }, 400);

      const de = personne(corps.de, LIMITES.maxPseudo);
      const vers = personne(corps.vers, LIMITES.maxPseudo);
      if (!de || !vers) return json({ ok: false, erreur: 'Expéditeur ou destinataire invalide.' }, 400);
      if (de.id === vers.id) return json({ ok: false, erreur: 'Expéditeur et destinataire identiques.' }, 400);

      // Dans les deux cas, `de` est celui qui écrit et `vers` celui qui doit recevoir :
      // une demande va au destinataire, une réponse (« j'ai accepté ») revient à celui
      // qui avait demandé l'amitié.
      const destinataire = vers;
      const evenement = {
        type,
        id: textePropre(corps.id, LIMITES.maxId) || `${type}_${Date.now().toString(36)}`,
        de,
        vers,
        date: textePropre(corps.date, 40) || new Date().toISOString(),
      };

      const cle = `boite:${destinataire.id}`;
      const existants = (await env.AMIS.get(cle, 'json')) || [];
      const liste = (Array.isArray(existants) ? existants : []).filter((e) => e?.id !== evenement.id);
      liste.push(evenement);

      // On ne garde que les plus récents : une boîte pleine ne doit pas pouvoir grossir sans fin.
      const gardes = liste.slice(-LIMITES.maxParBoite);
      await env.AMIS.put(cle, JSON.stringify(gardes), { expirationTtl: LIMITES.dureeDeVie });

      return json({ ok: true, enAttente: gardes.length });
    }

    /* ------------------------- Lire ses événements ------------------------- */
    if (request.method === 'GET') {
      const pour = textePropre(url.searchParams.get('pour'), LIMITES.maxId);
      if (!pour || !/^[a-z0-9-]+$/.test(pour)) {
        return json({ ok: false, erreur: 'Paramètre « pour » manquant ou invalide.' }, 400);
      }
      const cle = `boite:${pour}`;
      const boite = (await env.AMIS.get(cle, 'json')) || [];
      const evenements = Array.isArray(boite) ? boite : [];

      // Livraison unique : l'événement est supprimé dès qu'il a été remis.
      // Le jeu dédoublonne de son côté par identifiant, donc un incident réseau ne
      // provoque jamais de doublon visible.
      if (evenements.length) await env.AMIS.delete(cle);
      return json({ ok: true, evenements });
    }

    return json({ ok: false, erreur: 'Méthode non autorisée (GET ou POST).' }, 405);
  },
};
