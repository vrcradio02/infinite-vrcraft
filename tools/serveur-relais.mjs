#!/usr/bin/env node
/**
 * Relais d'amis LOCAL — pour tester le système d'amis sans déployer de serveur.
 *
 * Il implémente **exactement le même contrat** que `server/worker-amis.js` :
 *   POST /  { type:'demande'|'reponse', id, de:{id,nom}, vers:{id,nom}, date }  -> { ok:true }
 *   GET  /?pour=<identifiant>                                                  -> { evenements:[...] }
 *
 * Dans les deux types d'événement, `de` est celui qui écrit et `vers` celui qui reçoit :
 * une demande part chez le destinataire, une réponse (« j'ai accepté ») revient à celui
 * qui avait demandé l'amitié.
 *
 * Et, comme le Worker :
 *   POST /profil              { profil:{ id, nom, ... } }   -> { ok:true }   (conservé)
 *   GET  /profils?ids=a,b,c                                 -> { profils:[...] }
 * Les profils (aperçu d'une partie) sont rangés sous l'identifiant de leur auteur et
 * relus par ses amis ; les boîtes de messages restent vidées à la première lecture.
 *
 * Les boîtes sont en mémoire : elles disparaissent à l'arrêt du processus.
 * À utiliser avec deux navigateurs (ou deux profils) pour voir la notification
 * « X veut vous ajouter dans vos amis » arriver d'un joueur à l'autre.
 *
 * Usage : node tools/serveur-relais.mjs [port] [hôte]      (défaut : 8787, 0.0.0.0)
 */
import { createServer } from 'node:http';

const PORT = Number(process.argv[2] || process.env.PORT || 8787);
const HOST = process.argv[3] || process.env.HOST || '0.0.0.0';

const LIMITES = { maxParBoite: 20, maxCorps: 8192, maxProfil: 8192, maxIds: 20, dureeProfil: 30 * 86400 * 1000 };

/** identifiant -> liste d'événements en attente */
const boites = new Map();

/** identifiant -> { corps, expire } : aperçus de profil publiés par les joueurs. */
const profils = new Map();

/** Lit un profil publié en écartant les entrées expirées. */
function lireProfil(id) {
  const entree = profils.get(id);
  if (!entree) return null;
  if (entree.expire < Date.now()) { profils.delete(id); return null; }
  return entree.corps;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

const envoyer = (res, corps, statut = 200) => {
  res.writeHead(statut, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(corps));
};

const propre = (valeur, max) => String(valeur ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/* Identité : l'identifiant est DÉRIVÉ du pseudonyme (même calcul que le jeu et que le
   Worker). L'identifiant annoncé est ignoré : impossible de viser la boîte d'un autre. */
function empreinte(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function slug(nom) {
  return String(nom).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'joueur';
}

function identifiantJoueur(nom) {
  return `${slug(nom)}-${empreinte(String(nom).toLowerCase()).slice(0, 6)}`;
}

function personne(brut) {
  if (!brut || typeof brut !== 'object') return null;
  const nom = propre(brut.nom, 24);
  if (!nom) return null;
  return { id: identifiantJoueur(nom), nom };
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  const chemin = url.pathname.replace(/\/+$/, '');

  /* ------------------------- Profils publiés ------------------------- */
  if (chemin.endsWith('/profil') || chemin.endsWith('/profils')) {
    if (req.method === 'POST' && chemin.endsWith('/profil')) {
      let corps = '';
      req.on('data', (bloc) => {
        corps += bloc;
        if (corps.length > LIMITES.maxProfil) req.destroy();
      });
      req.on('end', () => {
        let data;
        try { data = JSON.parse(corps || '{}'); } catch { return envoyer(res, { ok: false, erreur: 'JSON invalide.' }, 400); }
        const auteur = personne(data?.profil);
        if (!auteur) return envoyer(res, { ok: false, erreur: 'Profil sans pseudonyme ni identifiant valide.' }, 400);
        const serialise = JSON.stringify({ ...data.profil, id: auteur.id, nom: auteur.nom });
        if (serialise.length > LIMITES.maxProfil) return envoyer(res, { ok: false, erreur: 'Profil trop volumineux.' }, 413);
        profils.set(auteur.id, { corps: serialise, expire: Date.now() + LIMITES.dureeProfil });
        console.log(`[relais] profil de ${auteur.nom} publié (${serialise.length} o)`);
        return envoyer(res, { ok: true });
      });
      return;
    }

    if (req.method === 'GET' && chemin.endsWith('/profils')) {
      const ids = propre(url.searchParams.get('ids'), 400)
        .split(',').map((id) => id.trim()).filter((id) => /^[a-z0-9-]+$/.test(id)).slice(0, LIMITES.maxIds);
      const trouves = [];
      for (const id of ids) {
        const corps = lireProfil(id);
        if (corps) trouves.push(JSON.parse(corps));
      }
      if (trouves.length) console.log(`[relais] ${trouves.length} profil(s) remis`);
      return envoyer(res, { ok: true, profils: trouves });
    }

    return envoyer(res, { ok: false, erreur: 'Méthode non autorisée (GET sur /profils, POST sur /profil).' }, 405);
  }

  if (req.method === 'POST') {
    let corps = '';
    req.on('data', (bloc) => {
      corps += bloc;
      if (corps.length > LIMITES.maxCorps) req.destroy();
    });
    req.on('end', () => {
      let data;
      try { data = JSON.parse(corps || '{}'); } catch { return envoyer(res, { ok: false, erreur: 'JSON invalide.' }, 400); }
      const type = data?.type === 'reponse' ? 'reponse' : data?.type === 'demande' ? 'demande' : null;
      if (!type) return envoyer(res, { ok: false, erreur: 'Type d’événement inconnu.' }, 400);
      const de = personne(data.de);
      const vers = personne(data.vers);
      if (!de || !vers) return envoyer(res, { ok: false, erreur: 'Expéditeur ou destinataire invalide.' }, 400);
      if (de.id === vers.id) return envoyer(res, { ok: false, erreur: 'Expéditeur et destinataire identiques.' }, 400);

      // `de` écrit, `vers` reçoit — valable pour une demande comme pour une réponse.
      const destinataire = vers;
      const evenement = {
        type,
        id: propre(data.id, 80) || `${type}_${Date.now().toString(36)}`,
        de, vers,
        date: propre(data.date, 40) || new Date().toISOString(),
      };
      const liste = (boites.get(destinataire.id) || []).filter((e) => e.id !== evenement.id);
      liste.push(evenement);
      boites.set(destinataire.id, liste.slice(-LIMITES.maxParBoite));
      console.log(`[relais] ${type} de ${de.nom} pour ${destinataire.nom}`);
      return envoyer(res, { ok: true, enAttente: boites.get(destinataire.id).length });
    });
    return;
  }

  if (req.method === 'GET') {
    const pour = propre(url.searchParams.get('pour'), 80);
    if (!pour || !/^[a-z0-9-]+$/.test(pour)) return envoyer(res, { ok: false, erreur: 'Paramètre « pour » manquant ou invalide.' }, 400);
    const evenements = boites.get(pour) || [];
    boites.delete(pour); // livraison unique
    if (evenements.length) console.log(`[relais] ${evenements.length} événement(s) remis à ${pour}`);
    return envoyer(res, { ok: true, evenements });
  }

  return envoyer(res, { ok: false, erreur: 'Méthode non autorisée (GET ou POST).' }, 405);
});

server.listen(PORT, HOST, () => {
  console.log(`Relais d'amis local sur http://localhost:${PORT} (écoute ${HOST}:${PORT})`);
  console.log("Dans le jeu : Paramètres → « URL du relais d'amis » → cette adresse, puis cochez « Activer le relais ».");
});
