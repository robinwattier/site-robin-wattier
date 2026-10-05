const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf'
};

let syncState = {
  isSyncing: false,
  lastSync: null,
  lastResult: null,
  error: null
};

// Exécuter la synchronisation avec verrouillage d'exclusion mutuelle
async function performInstagramSync() {
  if (syncState.isSyncing) {
    return { skipped: true, reason: 'Sync already in progress' };
  }
  syncState.isSyncing = true;
  syncState.error = null;
  console.log(`[Auto-Sync] Démarrage de la synchronisation Instagram...`);

  try {
    const { syncInstagram } = require('./sync-instagram.js');
    const result = await syncInstagram();
    syncState.lastSync = new Date().toISOString();
    syncState.lastResult = result;
    syncState.isSyncing = false;
    console.log(`[Auto-Sync] Terminé avec succès : ${result.added} nouveau(x) post(s), ${result.total} total.`);
    return result;
  } catch (err) {
    syncState.error = err.message;
    syncState.isSyncing = false;
    console.error(`[Auto-Sync] Erreur lors de la synchronisation :`, err.message);
    throw err;
  }
}

// Planificateur automatique en arrière-plan
function setupBackgroundSync() {
  try {
    const configPath = path.join(__dirname, 'instagram-config.json');
    if (!fs.existsSync(configPath)) return;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const intervalMinutes = config.autoSyncIntervalMinutes || 60;
    if (intervalMinutes > 0) {
      const intervalMs = intervalMinutes * 60 * 1000;
      console.log(`[Auto-Sync] Tâche de fond configurée : vérification toutes les ${intervalMinutes} minutes.`);
      setInterval(() => {
        performInstagramSync().catch(() => {});
      }, intervalMs);
    }
  } catch (e) {
    console.warn(`[Auto-Sync] Impossible de lire la configuration automatique :`, e.message);
  }
}

setupBackgroundSync();

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let reqPath = decodeURI(req.url.split('?')[0]);

  // Instagram Sync API Route (GET ou POST)
  if (reqPath === '/api/instagram/sync') {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    if (syncState.isSyncing) {
      res.writeHead(409);
      res.end(JSON.stringify({
        success: false,
        status: 'already_running',
        message: 'Une synchronisation Instagram est déjà en cours d\'exécution.'
      }));
      return;
    }
    try {
      const result = await performInstagramSync();
      res.writeHead(200);
      res.end(JSON.stringify({ success: true, ...result }));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ success: false, error: e.message }));
    }
    return;
  }

  // Instagram Sync Status API Route
  if (reqPath === '/api/instagram/status') {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    res.writeHead(200);
    res.end(JSON.stringify({
      success: true,
      syncState,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  let filePath = path.join(__dirname, reqPath);

  // Security check to avoid directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
    res.end('Access denied');
    return;
  }

  // Fallback for files moved to the assets directory (e.g. favicons)
  if (!fs.existsSync(filePath)) {
    const assetFallback = path.join(__dirname, 'assets', reqPath.replace(/^\//, ''));
    if (fs.existsSync(assetFallback) && fs.statSync(assetFallback).isFile()) {
      filePath = assetFallback;
    }
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;
    const rangeHeader = req.headers.range;

    // HTTP 206 Partial Content (essential for smooth video streaming and fast seeking)
    if (rangeHeader && (ext === '.mp4' || ext === '.webm')) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${totalSize}` });
        return res.end();
      }

      const chunkSize = (end - start) + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType
      });

      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(filePath).pipe(res);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Serveur local actif sur : http://localhost:${PORT}`);
});
