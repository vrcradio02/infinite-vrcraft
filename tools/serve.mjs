#!/usr/bin/env node
/**
 * Serveur statique minimal (aucune dépendance).
 * Usage : node tools/serve.mjs [port] [hôte]
 *   port par défaut : 5173
 *   hôte par défaut : 0.0.0.0 (accessible depuis l'extérieur du conteneur)
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 5173);
const HOST = process.argv[3] || process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let chemin = decodeURIComponent(url.pathname);
    if (chemin === '/') chemin = '/index.html';

    // Empêche la traversée de répertoire.
    const cible = normalize(join(ROOT, chemin));
    if (!cible.startsWith(ROOT)) {
      res.writeHead(403).end('Interdit');
      return;
    }

    let info;
    try {
      info = await stat(cible);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 — introuvable');
      return;
    }

    const fichier = info.isDirectory() ? join(cible, 'index.html') : cible;
    const contenu = await readFile(fichier);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(fichier)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(contenu);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('500 — ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Infinite Craft Ultimate servi sur http://localhost:${PORT} (écoute ${HOST}:${PORT})`);
});
