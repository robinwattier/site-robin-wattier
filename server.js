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
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  let reqPath = decodeURI(req.url.split('?')[0]);

  // Instagram Sync API Route
  if (reqPath === '/api/instagram/sync') {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    try {
      const syncModule = require('./sync-instagram.js');
      const configPath = path.join(__dirname, 'instagram-config.json');
      const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf-8')) : {};
      if (!config.accessToken) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'accessToken manquant dans instagram-config.json' }));
        return;
      }
      syncModule.syncFromApi(config.accessToken)
        .then(posts => {
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, count: posts.length }));
        })
        .catch(err => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: err.message }));
        });
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message }));
    }
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
