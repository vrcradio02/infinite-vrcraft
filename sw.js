/**
 * Service worker : mode hors ligne.
 *
 * Stratégie :
 *  - Pré-cache de la coquille (HTML, CSS, JS, logo, manifeste) => le jeu démarre hors ligne.
 *  - Données JSON : réseau d'abord (pour recevoir les mises à jour), repli sur le cache.
 *  - Le registre officiel est mis en cache après la première visite.
 *
 * Limite connue : les découvertes du joueur restent locales (IndexedDB) ; le service
 * worker ne synchronise rien et ne modifie jamais les fichiers du dépôt.
 */
const CACHE = 'icu-v1';
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
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(COQUILLE))
      .then(() => self.skipWaiting())
      .catch((e) => console.warn('[sw] pré-cache partiel :', e.message)),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // on ne touche pas aux services externes

  const estDonnee = url.pathname.endsWith('.json') || url.pathname.endsWith('.webmanifest');

  if (estDonnee) {
    // Réseau d'abord, cache en secours.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || new Response('{}', { headers: { 'Content-Type': 'application/json' } }))),
    );
    return;
  }

  // Coquille : cache d'abord.
  event.respondWith(
    caches.match(req).then((r) => r || fetch(req).then((res) => {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
