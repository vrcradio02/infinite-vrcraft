/**
 * Service worker : mode hors ligne ET mises à jour fiables.
 *
 * Stratégie :
 *  - Navigation / documents HTML : RÉSEAU D'ABORD, repli sur le cache hors ligne.
 *  - Ressources statiques (JS, CSS, SVG) : cache puis rafraîchissement
 *    (« stale-while-revalidate ») : affichage instantané, mise à jour en arrière-plan.
 *  - Données JSON : réseau d'abord (pour recevoir les mises à jour), repli sur le cache.
 *  - Le nom du cache contient une VERSION : à l'activation, les anciens caches sont supprimés.
 *
 * Pourquoi cette réécriture ? La version précédente servait TOUTE la coquille
 * « cache d'abord » avec un nom de cache figé (`icu-v1`). Un visiteur ayant chargé
 * une version boguée (l'écran de chargement ne disparaissait jamais) restait donc
 * bloqué sur cette version **même après correction et republication** : le service
 * worker ne retéléchargeait jamais `index.html` ni `src/main.js`. Pire, comme le
 * script `sw.js` lui-même n'avait pas changé, aucune mise à jour n'était détectée.
 *
 * IMPORTANT : modifier un fichier de la coquille (JS, CSS, HTML) sans changer
 * `VERSION` empêcherait l'activation de vider l'ancien cache. Augmentez `VERSION`
 * à chaque publication qui modifie la coquille.
 */
const VERSION = 'v4';
const CACHE = `icu-${VERSION}`;

const COQUILLE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/logo.svg',
  './src/styles/main.css',
  './src/main.js',
  './src/config.js',
  './src/core/dom.js',
  './src/core/events.js',
  './src/core/random.js',
  './src/i18n/index.js',
  './src/game/game.js',
  './src/game/progression.js',
  './src/game/mondes.js',
  './src/game/collections.js',
  './src/game/audio.js',
  './src/fusion/engine.js',
  './src/fusion/store.js',
  './src/fusion/normalize.js',
  './src/fusion/registry-format.js',
  './src/quests/quests.js',
  './src/quests/achievements.js',
  './src/pets/pets.js',
  './src/pets/help.js',
  './src/saves/saves.js',
  './src/saves/storage.js',
  './src/saves/validate.js',
  './src/ai/ai.js',
  './src/ai/validate-proposal.js',
  './src/ui/shell.js',
  './src/ui/board.js',
  './src/ui/views.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Chaque fichier est mis en cache séparément : un fichier manquant ne bloque pas
    // le reste (contrairement à `addAll`, qui est tout-ou-rien).
    await Promise.all(COQUILLE.map((url) => cache.add(url).catch((e) => {
      console.warn('[sw] pré-cache ignoré pour', url, ':', e.message);
    })));
    await self.skipWaiting(); // la nouvelle version prend la main sans attendre la fermeture
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cles = await caches.keys();
    await Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** Le jeu peut demander l'activation immédiate d'une mise à jour en attente. */
self.addEventListener('message', (event) => {
  if (event.data === 'mettre-a-jour') self.skipWaiting();
});

/** Réseau d'abord, repli sur le cache puis sur `repli` (ex. index.html hors ligne). */
async function reseauDAbord(req, repli) {
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
    }
    return res;
  } catch {
    const enCache = await caches.match(req);
    if (enCache) return enCache;
    if (repli) {
      const secours = await caches.match(repli);
      if (secours) return secours;
    }
    return new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

/** Cache d'abord, rafraîchissement en arrière-plan (stale-while-revalidate). */
function cachePuisRafraichir(event, req) {
  const miseAJour = fetch(req)
    .then((res) => {
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
      }
      return res;
    })
    .catch(() => null);
  event.waitUntil(miseAJour);
  return caches.match(req).then((enCache) => enCache || miseAJour.then((res) => res || new Response('', { status: 504 })));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // on ne touche pas aux services externes

  // Navigation (adresse saisie, lien, rechargement) et documents HTML : réseau d'abord,
  // afin qu'une nouvelle version publiée soit vue dès le premier rechargement.
  const accepteHtml = (req.headers.get('accept') || '').includes('text/html');
  if (req.mode === 'navigate' || accepteHtml) {
    event.respondWith(reseauDAbord(req, './index.html'));
    return;
  }

  // Données : réseau d'abord (le registre doit pouvoir être mis à jour), cache en secours.
  if (url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest')) {
    event.respondWith(reseauDAbord(req));
    return;
  }

  // Coquille statique : instantané depuis le cache, rafraîchi en arrière-plan.
  event.respondWith(cachePuisRafraichir(event, req));
});
