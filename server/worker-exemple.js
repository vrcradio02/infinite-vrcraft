/**
 * EXEMPLE de proxy IA sécurisé (facultatif).
 *
 * À QUOI ÇA SERT
 * Le jeu ne contient AUCUNE clé d'API. Si vous voulez brancher une IA de secours,
 * vous déployez ce petit service (Cloudflare Worker, Deno Deploy, fonction serverless...)
 * qui détient la clé côté serveur et que le navigateur appelle.
 *
 * CONFIGURATION
 *   1. Déployez ce fichier comme Worker.
 *   2. Définissez les secrets côté serveur (JAMAIS dans le dépôt) :
 *        wrangler secret put AI_API_KEY
 *        wrangler secret put AI_API_URL   (optionnel)
 *   3. Dans le jeu : Paramètres → « Point d'entrée du service IA » → collez l'URL,
 *      puis cochez « Activer le service IA ».
 *
 * CONTRAT
 *   Requête  : POST { a: string, b: string, nomA?: string, nomB?: string }
 *   Réponse  : { resultat: { nom: string, categorie?: string, rarete?: string, description?: string } }
 *
 * SÉCURITÉ
 *   - La clé n'est jamais renvoyée au client.
 *   - Les entrées sont bornées avant l'appel au fournisseur.
 *   - Une limitation de débit par IP est appliquée (à adapter à votre fournisseur).
 */

const LIMITE_REQUETES = 30; // par fenêtre
const FENETRE_MS = 60 * 1000;

/** @type {Map<string, number[]>} */
const historique = new Map();

function limiteDepassee(ip) {
  const maintenant = Date.now();
  const liste = (historique.get(ip) || []).filter((t) => maintenant - t < FENETRE_MS);
  liste.push(maintenant);
  historique.set(ip, liste);
  return liste.length > LIMITE_REQUETES;
}

function borner(valeur, max) {
  return String(valeur ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export default {
  async fetch(request, env) {
    const origine = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': env.APP_ORIGIN || origine || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ erreur: 'Méthode non autorisée' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'inconnue';
    if (limiteDepassee(ip)) {
      return new Response(JSON.stringify({ erreur: 'Limite d\'utilisation atteinte. Réessayez plus tard.' }), { status: 429, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    let corps;
    try {
      corps = await request.json();
    } catch {
      return new Response(JSON.stringify({ erreur: 'JSON invalide' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const a = borner(corps?.a, 60);
    const b = borner(corps?.b, 60);
    const nomA = borner(corps?.nomA, 60);
    const nomB = borner(corps?.nomB, 60);
    if (!a || !b) {
      return new Response(JSON.stringify({ erreur: 'Ingrédients manquants' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (!env.AI_API_KEY) {
      return new Response(JSON.stringify({ erreur: 'Service non configuré : AI_API_KEY absente côté serveur.' }), { status: 503, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const invitation = `Tu es un moteur de fusion d'éléments. Combine « ${nomA} » et « ${nomB} ».\n` +
      'Réponds STRICTEMENT en JSON avec la forme {"nom":"...","categorie":"...","rarete":"...","description":"..."}.\n' +
      'Nom court (<= 40 caractères), en français, cohérent et créatif.';

    try {
      const url = env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
      const reponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.AI_MODEL || 'gpt-4o-mini',
          messages: [{ role: 'user', content: invitation }],
          response_format: { type: 'json_object' },
          max_tokens: 200,
        }),
      });

      if (!reponse.ok) {
        return new Response(JSON.stringify({ erreur: `Fournisseur IA en erreur (HTTP ${reponse.status})` }), { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      const data = await reponse.json();
      const contenu = data?.choices?.[0]?.message?.content;
      const proposition = JSON.parse(contenu);

      return new Response(JSON.stringify({
        resultat: {
          nom: borner(proposition.nom, 60),
          categorie: borner(proposition.categorie, 40),
          rarete: borner(proposition.rarete, 20),
          description: borner(proposition.description, 300),
        },
      }), { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ erreur: `Erreur interne du proxy : ${e.message}` }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  },
};
