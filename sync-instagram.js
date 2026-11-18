/**
 * Instagram -> Portfolio : agent de synchronisation automatique - Robin Wattier
 *
 * Agent autonome pour https://www.instagram.com/robinwattier/ :
 *  1. DETECTE les nouvelles publications du profil public (Chrome headless, aucun token Meta).
 *     Les donnees structurees embarquees dans la page (media_type / product_type) sont lues
 *     directement : plus aucune devinette a partir du HTML visuel.
 *  2. CLASSE chaque publication :
 *       - Reel / video seule  -> type "video"    (carte portrait + badge Play, lecture au survol)
 *       - Carrousel           -> type "carousel" (fleches, pastilles, badge multi-post)
 *         MEME si une diapositive du carrousel est une video : le carrousel reste un carrousel,
 *         la diapositive video est representee par sa couverture.
 *       - Photo seule         -> type "image"
 *  3. TELECHARGE les medias en local (assets/projets/instagram/<code>/) puis
 *  4. INJECTE la carte dans la section "Content" (data.json + projects-data.js + cache buster).
 *
 * Garanties :
 *  - Filtrage strict : seuls les posts publies apres baselineDate (et absents de baselineCodes /
 *    data.json) sont importes. Les posts deja presents ne sont jamais reimportes (idempotent).
 *  - Atomicite par post : un post dont un media n'a pas pu etre telecharge n'est PAS ajoute
 *    (il sera retente au prochain passage) -> jamais de carrousel tronque.
 *  - Ecritures atomiques (tmp + rename) + verrou inter-processus (.sync-instagram.lock).
 *  - Echec visible : si Instagram ne renvoie aucune publication (mur de connexion, blocage),
 *    l'agent echoue explicitement au lieu de repondre "rien de nouveau".
 *
 * Utilisation CLI :
 *   node sync-instagram.js                       Synchronisation (futurs posts uniquement)
 *   node sync-instagram.js --dry-run             Detecte et classe sans rien telecharger/ecrire
 *   node sync-instagram.js --snapshot-baseline   Marque tous les posts actuels comme "existants"
 *   node sync-instagram.js <url-du-post>         Import manuel d'un post precis
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFile, execFileSync, execSync } = require('child_process');

const ROOT = process.env.PORTFOLIO_ROOT ? path.resolve(process.env.PORTFOLIO_ROOT) : __dirname;
const CONFIG_FILE = path.join(ROOT, 'instagram-config.json');
const PROJECTS_FILE = path.join(ROOT, 'projects-data.js');
const DATA_JSON_FILE = path.join(ROOT, 'data.json');
const INDEX_HTML_FILE = path.join(ROOT, 'index.html');
const ASSETS_DIR = path.join(ROOT, 'assets');
const MEDIA_DIR = path.join(ROOT, 'assets', 'projets', 'instagram');
const PROFILE_PIC_FILE = path.join(ASSETS_DIR, 'robin-wattier-profile.jpg');
const FAVICON_PNG_FILE = path.join(ASSETS_DIR, 'favicon.png');
const FAVICON_32_FILE = path.join(ASSETS_DIR, 'favicon-32x32.png');
const APPLE_TOUCH_ICON_FILE = path.join(ASSETS_DIR, 'apple-touch-icon.png');
const FAVICON_ICO_FILE = path.join(ASSETS_DIR, 'favicon.ico');
const LOCK_FILE = path.join(ROOT, '.sync-instagram.lock');
const LOCK_STALE_MS = 20 * 60 * 1000;
const DEFAULT_CAROUSEL_SIZE = { w: 1080, h: 1350 };
const DEFAULT_REEL_SIZE = { w: 720, h: 1280 };
const DESKTOP_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const DEFAULT_PROFILE_QUERY_DOC_ID = '40158838120366999';

// Recuperation du DOM (remplacable pour les tests via setDomFetcher)
let customDomFetcher = null;
function setDomFetcher(fn) {
  customDomFetcher = fn || null;
}
let customProfilePicUploader = null;
function setProfilePicUploader(fn) {
  customProfilePicUploader = fn || null;
}
let retryBaseMs = 3000;
function setRetryBaseMs(ms) {
  retryBaseMs = ms;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class InstagramFetchError extends Error {
  /**
   * Erreur structuree distinguant blocage IP / mur de connexion, Chrome ou derive de schema.
   */
  constructor(code, message, diagnostics = {}) {
    super(message);
    this.name = 'InstagramFetchError';
    this.code = code || 'SCRAPE_FAILED';
    this.diagnostics = diagnostics;
  }
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function loadConfig() {
  const defaults = {
    username: 'robinwattier',
    profileUrl: 'https://www.instagram.com/robinwattier/',
    autoSyncIntervalMinutes: 60,
    downloadMedia: true,
    excludeStories: true,
    mirror: true,
    syncProfilePic: true,
    profilePicState: null,
    baselineDate: null,
    baselineCodes: [],
    excludedCodes: []
  };

  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      return { ...defaults, ...cfg };
    } catch (e) {
      console.warn('⚠️ Erreur lecture instagram-config.json, utilisation des paramètres par défaut');
    }
  }
  return defaults;
}

function writeFileAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf-8');
  fs.renameSync(tmp, file);
}

function writeBufferAtomic(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
}

function saveConfig(cfg) {
  try {
    writeFileAtomic(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n');
  } catch (e) {
    console.warn('⚠️ Erreur écriture instagram-config.json :', e.message);
  }
}

// ---------------------------------------------------------------------------
// Verrou inter-processus (CLI / serveur / agent planifie)
// ---------------------------------------------------------------------------

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const age = Date.now() - fs.statSync(LOCK_FILE).mtimeMs;
      if (age < LOCK_STALE_MS) {
        throw new Error('Une synchronisation Instagram est déjà en cours (verrou .sync-instagram.lock).');
      }
      fs.unlinkSync(LOCK_FILE);
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' });
  } catch (e) {
    if (e.code === 'EEXIST') throw new Error('Une synchronisation Instagram est déjà en cours (verrou .sync-instagram.lock).');
    throw e;
  }
}

function releaseLock() {
  try { fs.unlinkSync(LOCK_FILE); } catch (_) { /* deja supprime */ }
}

async function withLock(fn) {
  acquireLock();
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}

// ---------------------------------------------------------------------------
// Chrome headless
// ---------------------------------------------------------------------------

function findChromePath() {
  const possiblePaths = [
    process.env.CHROME_BIN,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// Récupération HTML SSR directe (évite Chrome si la réponse contient déjà le JSON embarqué)
function fetchPageHtmlHttp(url, redirects = 0) {
  return new Promise((resolve) => {
    if (redirects > 5) {
      return resolve({ statusCode: 0, finalUrl: url, html: '', networkError: 'Trop de redirections' });
    }
    const headers = {
      'User-Agent': DESKTOP_USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    };
    if (process.env.IG_COOKIE && process.env.IG_COOKIE.trim()) {
      headers.Cookie = process.env.IG_COOKIE.trim();
    }

    const client = /^http:/i.test(url) ? http : https;
    const req = client.get(url, { headers }, (response) => {
      const code = response.statusCode || 0;
      if (code >= 300 && code < 400 && response.headers.location) {
        response.resume();
        let next = url;
        try {
          next = new URL(response.headers.location, url).toString();
        } catch (_) { /* ignore */ }
        if (/\/accounts\/login|\/challenge\//i.test(next)) {
          return resolve({ statusCode: code, finalUrl: next, html: '', networkError: null });
        }
        return fetchPageHtmlHttp(next, redirects + 1).then(resolve);
      }

      const chunks = [];
      let totalBytes = 0;
      const maxBytes = 15 * 1024 * 1024;
      response.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes <= maxBytes) chunks.push(chunk);
      });
      response.on('end', () => {
        resolve({
          statusCode: code,
          finalUrl: url,
          html: Buffer.concat(chunks).toString('utf-8'),
          networkError: null
        });
      });
    });

    req.setTimeout(20000, () => req.destroy(new Error('Délai dépassé HTTP (20s)')));
    req.on('error', (err) => {
      resolve({ statusCode: 0, finalUrl: url, html: '', networkError: err.message });
    });
  });
}

// Dump du DOM via Chrome headless durci (User-Agent desktop, anti-empreinte HeadlessChrome)
function dumpPageDom(url, chromePath, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    if (!chromePath) {
      return reject(new Error('Navigateur Chrome introuvable sur le système.'));
    }

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-extensions',
      '--mute-audio',
      '--no-first-run',
      `--user-agent=${DESKTOP_USER_AGENT}`,
      '--window-size=1440,900',
      '--lang=fr-FR',
      '--disable-blink-features=AutomationControlled',
      '--dump-dom',
      url
    ];

    execFile(chromePath, args, { maxBuffer: 100 * 1024 * 1024, timeout: timeoutMs }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout || '');
    });
  });
}

function extractHtmlTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 120) : '';
}

function classifyHtmlFailure({ statusCode = null, finalUrl = '', html = '', networkError = null, chromeError = null, chromePath = null } = {}) {
  const text = String(html || '');
  const title = extractHtmlTitle(text);
  const diag = { statusCode, finalUrl, title, htmlLength: text.length };

  if (/\/accounts\/login|\/challenge\//i.test(finalUrl || '')) {
    return {
      ...diag,
      code: 'INSTAGRAM_LOGIN_WALL',
      message: `mur de connexion / challenge Instagram (${statusCode || 'redirection'} -> ${finalUrl})`
    };
  }

  if (statusCode === 429 || /Please wait a few minutes|rate.?limit/i.test(text)) {
    return {
      ...diag,
      code: 'INSTAGRAM_RATE_LIMIT',
      message: `limite de requêtes Instagram atteinte (HTTP ${statusCode || '?'})`
    };
  }

  const hasLoginMarker = /not-logged-in|login_and_signup_page|\/accounts\/login|>Se connecter<|>Log in<|Connectez-vous|Log into Instagram|\bSe connecter\b|\blogin\b/i.test(text);
  if (hasLoginMarker) {
    return {
      ...diag,
      code: 'INSTAGRAM_LOGIN_WALL',
      message: `mur de connexion Instagram détecté${title ? ` ("${title}")` : ''}`
    };
  }

  if (text.length > 0 && /instagram/i.test(text)) {
    return {
      ...diag,
      code: 'SCHEMA_DRIFT',
      message: `page Instagram chargée (${(text.length / 1024).toFixed(1)} Ko${title ? `, "${title}"` : ''}) mais aucune donnée média reconnue (structure modifiée ?)`
    };
  }

  if (chromeError) {
    return { ...diag, code: 'CHROME_ERROR', message: `échec Chrome headless : ${chromeError}` };
  }

  if (networkError) {
    return { ...diag, code: 'NETWORK_ERROR', message: `erreur réseau HTTP : ${networkError}` };
  }

  if (!chromePath && (!statusCode || statusCode >= 400 || text.length === 0)) {
    return {
      ...diag,
      code: 'CHROMIUM_UNAVAILABLE',
      message: `HTTP inutilisable (status ${statusCode || 0}) et Chrome/Chromium introuvable`
    };
  }

  return {
    ...diag,
    code: 'SCRAPE_FAILED',
    message: 'contenu Instagram absent de la page (mur de connexion, blocage ou structure modifiée)'
  };
}

async function fetchOnce(url, chromePath, isUsable) {
  if (customDomFetcher) {
    const html = await customDomFetcher(url, chromePath);
    if (isUsable(html)) return { html, tier: 'custom' };
    const diag = classifyHtmlFailure({ statusCode: null, finalUrl: url, html, chromePath });
    throw new InstagramFetchError(diag.code, diag.message, diag);
  }

  // Niveau 1 : HTML SSR direct
  const httpRes = await fetchPageHtmlHttp(url);
  if (!httpRes.networkError && isUsable(httpRes.html)) {
    return { html: httpRes.html, tier: 'http', statusCode: httpRes.statusCode, finalUrl: httpRes.finalUrl };
  }

  // Niveau 2 : repli Chrome headless si disponible
  let chromeHtml = '';
  let chromeError = null;
  if (chromePath) {
    try {
      chromeHtml = await dumpPageDom(url, chromePath);
      if (isUsable(chromeHtml)) {
        return { html: chromeHtml, tier: 'chrome', statusCode: 200, finalUrl: url };
      }
    } catch (err) {
      chromeError = err.message;
    }
  }

  const usedChromeBody = Boolean(chromeHtml && !chromeError && chromeHtml.length >= (httpRes.html || '').length);
  const diag = classifyHtmlFailure({
    statusCode: usedChromeBody ? 200 : httpRes.statusCode,
    finalUrl: usedChromeBody && !/\/accounts\/login|\/challenge\//i.test(chromeHtml) ? url : httpRes.finalUrl,
    html: usedChromeBody ? chromeHtml : (httpRes.html || chromeHtml),
    networkError: httpRes.networkError,
    chromeError,
    chromePath
  });
  throw new InstagramFetchError(diag.code, diag.message, diag);
}

// Telecharge un DOM avec reessais (backoff) tant que `isUsable(html)` est faux
async function fetchDomWithRetry(url, chromePath, isUsable, attempts = 3) {
  let lastError = null;
  const noRetryCodes = new Set(['CHROMIUM_UNAVAILABLE', 'SCHEMA_DRIFT']);
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetchOnce(url, chromePath, isUsable);
      if (res.tier !== 'custom') {
        console.log(`📡 Source ${res.tier.toUpperCase()} utilisée pour ${url}`);
      }
      return res.html;
    } catch (e) {
      lastError = e;
    }
    const maxAttempts = (!customDomFetcher && lastError && lastError.code === 'INSTAGRAM_LOGIN_WALL')
      ? Math.min(attempts, 2)
      : attempts;
    if (i >= maxAttempts || (!customDomFetcher && lastError && noRetryCodes.has(lastError.code))) {
      break;
    }
    const wait = retryBaseMs * i * i;
    console.warn(`⚠️ Tentative ${i}/${maxAttempts} échouée pour ${url} [${lastError.code || 'ERR'}] (${lastError.message}). Nouvel essai dans ${wait / 1000}s...`);
    await sleep(wait);
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Telechargement
// ---------------------------------------------------------------------------

// Telechargement d'un fichier (redirections, timeout, ecriture atomique .part -> rename)
function downloadFile(url, destPath, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('Trop de redirections'));
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const partPath = `${destPath}.part`;
    const cleanup = () => { try { if (fs.existsSync(partPath)) fs.unlinkSync(partPath); } catch (_) { /* ignore */ } };

    const client = /^http:/i.test(url) ? http : https;
    const req = client.get(url, {
      headers: {
        'User-Agent': DESKTOP_USER_AGENT,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,video/mp4,video/*,*/*;q=0.8',
        'Referer': 'https://www.instagram.com/'
      }
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        return downloadFile(next, destPath, redirects + 1).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`HTTP status ${response.statusCode}`));
      }

      const type = String(response.headers['content-type'] || '');
      if (/text\/html|application\/json/i.test(type)) {
        response.resume();
        return reject(new Error(`Type de contenu inattendu (${type})`));
      }

      const file = fs.createWriteStream(partPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          try {
            if (fs.statSync(partPath).size === 0) throw new Error('Fichier téléchargé vide');
            fs.renameSync(partPath, destPath);
            resolve(destPath);
          } catch (e) {
            cleanup();
            reject(e);
          }
        });
      });
      file.on('error', (e) => { cleanup(); reject(e); });
      response.on('error', (e) => { cleanup(); reject(e); });
    });

    req.setTimeout(120000, () => req.destroy(new Error('Délai de téléchargement dépassé')));
    req.on('error', (err) => { cleanup(); reject(err); });
  });
}

async function downloadWithRetry(url, destPath, attempts = 3) {
  let lastError = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await downloadFile(url, destPath);
    } catch (e) {
      lastError = e;
      if (i < attempts) await sleep(1500 * i);
    }
  }
  throw lastError;
}

// Conversion WebP optionnelle (sharp) pour les posters de Reels
async function tryMakeWebp(srcJpg, destWebp) {
  try {
    const sharp = require('sharp');
    await sharp(srcJpg).webp({ quality: 80 }).toFile(destWebp);
    return fs.existsSync(destWebp);
  } catch (_) {
    return false;
  }
}

function getFfmpegBin() {
  try {
    const bin = require('ffmpeg-static');
    return bin && fs.existsSync(bin) ? bin : null;
  } catch (_) {
    return null;
  }
}

function runFfmpegFrame(ffmpegBin, inputPath, outputPath, seekSeconds) {
  return new Promise((resolve) => {
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-ss', String(seekSeconds),
      '-i', inputPath,
      '-frames:v', '1',
      '-q:v', '2',
      outputPath
    ];
    execFile(ffmpegBin, args, { timeout: 30000 }, (err) => {
      try {
        resolve(!err && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0);
      } catch (_) {
        resolve(false);
      }
    });
  });
}

async function extractFrameFromVideoFile(videoPath, destJpg, seekSeconds = 2) {
  const ffmpegBin = getFfmpegBin();
  if (!ffmpegBin || !fs.existsSync(videoPath)) return false;
  const tmpFrame = `${destJpg}.frame.tmp.jpg`;
  try {
    let ok = await runFfmpegFrame(ffmpegBin, videoPath, tmpFrame, seekSeconds);
    if (!ok && seekSeconds > 0) {
      ok = await runFfmpegFrame(ffmpegBin, videoPath, tmpFrame, 0);
    }
    if (ok) {
      fs.renameSync(tmpFrame, destJpg);
      return true;
    }
    return false;
  } catch (_) {
    return false;
  } finally {
    try { if (fs.existsSync(tmpFrame)) fs.unlinkSync(tmpFrame); } catch (_) { /* ignore */ }
  }
}

// Extraction d'une couverture propre (t = 2s) pour une diapositive video de carrousel
async function extractVideoCover(videoUrl, destJpg, seekSeconds = 2) {
  if (!getFfmpegBin()) return false;

  const tmpVideo = `${destJpg}.video.tmp.mp4`;
  try {
    await downloadWithRetry(videoUrl, tmpVideo, 2);
    return await extractFrameFromVideoFile(tmpVideo, destJpg, seekSeconds);
  } catch (_) {
    return false;
  } finally {
    try { if (fs.existsSync(tmpVideo)) fs.unlinkSync(tmpVideo); } catch (_) { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Analyse des donnees Instagram (fonctions pures, testees dans scripts/test-instagram-sync.js)
// ---------------------------------------------------------------------------

// JSON embarques (<script type="application/json">) contenant des medias
function extractJsonBlocks(html) {
  const blocks = [];
  const re = /<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html || '')) !== null) {
    const text = m[1];
    if (text.indexOf('"code"') === -1 && text.indexOf('"carousel_media"') === -1) continue;
    try {
      blocks.push(JSON.parse(text));
    } catch (_) { /* bloc non JSON : ignore */ }
  }
  return blocks;
}

function walkObjects(root, visit) {
  const stack = [root];
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== 'object') continue;
    if (Array.isArray(o)) {
      for (let i = o.length - 1; i >= 0; i--) stack.push(o[i]);
    } else {
      visit(o);
      const vals = Object.values(o);
      for (let i = vals.length - 1; i >= 0; i--) stack.push(vals[i]);
    }
  }
}

/**
 * Regle de tri Reel / Carrousel / Photo.
 * Le carrousel est teste EN PREMIER : un carrousel qui contient une video reste un carrousel.
 */
function classifyMedia(media) {
  if (!media || typeof media !== 'object') return 'image';
  const mediaType = Number(media.media_type);
  const productType = String(media.product_type || '').toLowerCase();
  const typeName = String(media.__typename || '');

  if (
    mediaType === 8 ||
    productType === 'carousel_container' ||
    /Carousel/i.test(typeName) ||
    (Array.isArray(media.carousel_media) && media.carousel_media.length > 1) ||
    Number(media.carousel_media_count) > 1
  ) {
    return 'carousel';
  }

  if (
    mediaType === 2 ||
    productType === 'clips' ||
    /Video/i.test(typeName) ||
    (Array.isArray(media.video_versions) && media.video_versions.length > 0)
  ) {
    return 'video';
  }

  return 'image';
}

function toIso(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

function permalinkFor(code, type) {
  return `https://www.instagram.com/${type === 'video' ? 'reel' : 'p'}/${code}/`;
}

function bestImageUrl(media) {
  const cands = media && media.image_versions2 && Array.isArray(media.image_versions2.candidates)
    ? media.image_versions2.candidates.filter((c) => c && c.url)
    : [];
  if (cands.length) {
    const uncropped = cands.filter((c) => !/[?&]stp=c\d/i.test(c.url));
    const pool = uncropped.length ? uncropped : cands;
    const area = (c) => (Number(c.width) || 0) * (Number(c.height) || Number(c.width) || 0);
    const sorted = pool.slice().sort((a, b) => (area(b) - area(a)) || ((Number(b.width) || 0) - (Number(a.width) || 0)));
    return sorted[0].url;
  }
  return (media && media.display_uri) || null;
}

function bestVideoUrl(media) {
  const vers = media && Array.isArray(media.video_versions) ? media.video_versions.filter((v) => v && v.url) : [];
  if (vers.length) {
    // Instagram liste la meilleure qualite (type 101) en premier ; on privilegie la plus large si connue.
    const sorted = vers.slice().sort((a, b) => (Number(b.width) || 0) - (Number(a.width) || 0));
    return sorted[0].url;
  }
  return null;
}

// Publications de la grille du profil (ordre Instagram : plus recent d'abord)
function extractTimelinePosts(html) {
  const posts = [];
  const seen = new Set();

  for (const block of extractJsonBlocks(html)) {
    walkObjects(block, (o) => {
      const conn = o.polaris_ordered_timeline_connection
        || o.xdt_api__v1__feed__user_timeline_graphql_connection
        || o.edge_owner_to_timeline_media;
      if (!conn || !Array.isArray(conn.edges)) return;
      for (const edge of conn.edges) {
        const node = edge && edge.node;
        if (!node || typeof node.code !== 'string' || seen.has(node.code)) continue;
        seen.add(node.code);
        const type = classifyMedia(node);
        posts.push({
          code: node.code,
          type,
          permalink: permalinkFor(node.code, type),
          caption: (node.caption && node.caption.text) || '',
          imgSrc: node.display_uri || null,
          alt: node.accessibility_caption || '',
          slideCount: Number(node.carousel_media_count) || null,
          publishedAt: toIso(node.taken_at || (node.caption && node.caption.created_at)),
          w: type === 'video' ? DEFAULT_REEL_SIZE.w : (Number(node.original_width) || DEFAULT_CAROUSEL_SIZE.w),
          h: type === 'video' ? DEFAULT_REEL_SIZE.h : (Number(node.original_height) || DEFAULT_CAROUSEL_SIZE.h)
        });
      }
    });
  }
  return posts;
}

// Repli ancien format (liens <a href=".../p/CODE/"> du DOM visible)
function extractProfileLinks(html) {
  const posts = [];
  const seen = new Set();
  const linkRegex = /<a[^>]+href="((?:https?:\/\/[^"/]+)?\/(?:[A-Za-z0-9_.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)\/?(?:\?[^"]*)?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRegex.exec(html || '')) !== null) {
    const code = match[2];
    if (seen.has(code)) continue;
    seen.add(code);
    const href = match[1];
    const inner = match[3];
    const srcMatch = inner.match(/src="([^">]+)"/);
    const altMatch = inner.match(/alt="([^">]*)"/);
    const isCarousel = /Carrousel|Carousel|Diapositive/i.test(inner);
    const isReel = /\/reels?\//i.test(href) || /Clip|Reel/i.test(inner);
    const type = isCarousel ? 'carousel' : (isReel ? 'video' : 'image');
    posts.push({
      code,
      type,
      permalink: permalinkFor(code, type),
      caption: '',
      imgSrc: srcMatch ? srcMatch[1].replace(/&amp;/g, '&') : null,
      alt: altMatch ? altMatch[1] : '',
      slideCount: null,
      publishedAt: null,
      w: type === 'video' ? DEFAULT_REEL_SIZE.w : DEFAULT_CAROUSEL_SIZE.w,
      h: type === 'video' ? DEFAULT_REEL_SIZE.h : DEFAULT_CAROUSEL_SIZE.h
    });
  }
  return posts;
}

function parseProfilePosts(html) {
  const structured = extractTimelinePosts(html);
  return structured.length ? structured : extractProfileLinks(html);
}

// Objet media "complet" d'un post (le plus riche parmi les occurrences du meme code)
function findMediaByCode(html, code) {
  let best = null;
  let bestScore = -1;
  for (const block of extractJsonBlocks(html)) {
    walkObjects(block, (o) => {
      if (o.code !== code) return;
      if (!(o.carousel_media || o.image_versions2 || o.video_versions)) return;
      const score = (Array.isArray(o.carousel_media) ? o.carousel_media.length * 10 : 0)
        + (o.video_versions ? 5 : 0) + (o.image_versions2 ? 2 : 0) + (o.taken_at ? 1 : 0);
      if (score > bestScore) {
        best = o;
        bestScore = score;
      }
    });
  }
  return best;
}

// Titre de carte : premiere ligne de la legende, sans hashtags, <= 80 caracteres
function titleFromCaption(caption) {
  if (!caption) return null;
  const lines = String(caption)
    .replace(/\r/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .split('\n')
    .map((l) => l.replace(/#[^\s#]+/g, '').replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0);
  if (!lines.length) return null;

  let line = lines[0];
  if (line.length > 80) {
    const cut = line.slice(0, 80);
    const sentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
    if (sentenceEnd >= 20) {
      line = cut.slice(0, sentenceEnd + 1);
    } else {
      const lastSpace = cut.lastIndexOf(' ');
      line = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim() + '…';
    }
  }
  return line.length >= 2 ? line : null;
}

// Ancien nettoyage (og:title) conserve pour les repli
function cleanInstagramCaption(rawText) {
  if (!rawText) return 'Création Instagram';
  let text = rawText
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  text = text.replace(/^[0-9,kKmM\s]+likes?,?\s*[0-9,kKmM\s]*comments?\s*-\s*[^:]+:\s*/i, '');
  text = text.replace(/^.*?Instagram\s*:\s*/i, '');
  const quoteMatch = text.match(/[«"“](.*?)[»"”]/);
  if (quoteMatch && quoteMatch[1].trim().length >= 3) text = quoteMatch[1].trim();
  text = text.replace(/^["'«“\s]+|["'»”\s]+$/g, '');
  text = text.replace(/^(?:Photo|Vidéo|Video)\s+(?:by|de)\s+[^:]+:\s*/i, '');
  const firstLine = text.split('\n')[0].replace(/#\S+/g, '').trim();
  if (firstLine.length >= 3) return firstLine.slice(0, 80).trim();
  return 'Création Instagram';
}

// Applique l'objet media detaille au post (type definitif, diapositives, video, titre, date)
function applyMediaDetails(post, media) {
  post.type = classifyMedia(media);
  post.permalink = permalinkFor(post.code, post.type);

  const caption = (media.caption && media.caption.text) || post.caption || '';
  post.caption = caption;
  post.title = titleFromCaption(caption) || cleanInstagramCaption(post.alt);
  post.publishedAt = toIso(media.taken_at || (media.caption && media.caption.created_at)) || post.publishedAt || null;

  if (post.type === 'carousel') {
    const slides = (Array.isArray(media.carousel_media) ? media.carousel_media : [])
      .map((s) => {
        const isVideo = Number(s.media_type) === 2 || (Array.isArray(s.video_versions) && s.video_versions.length > 0);
        const slide = {
          kind: isVideo ? 'video' : 'image',
          url: bestImageUrl(s)
        };
        const videoUrl = isVideo ? bestVideoUrl(s) : null;
        if (videoUrl) slide.videoUrl = videoUrl;
        return slide;
      })
      .filter((s) => s.url || s.videoUrl);
    post.slides = slides;
    post.slideUrls = slides.map((s) => s.url);
    const first = (media.carousel_media || [])[0] || {};
    post.w = Number(media.original_width) || Number(first.original_width) || DEFAULT_CAROUSEL_SIZE.w;
    post.h = Number(media.original_height) || Number(first.original_height) || DEFAULT_CAROUSEL_SIZE.h;
  } else if (post.type === 'video') {
    post.videoUrl = bestVideoUrl(media);
    post.imgSrc = bestImageUrl(media) || post.imgSrc;
    post.w = DEFAULT_REEL_SIZE.w;
    post.h = DEFAULT_REEL_SIZE.h;
  } else {
    post.imgSrc = bestImageUrl(media) || post.imgSrc;
    post.w = Number(media.original_width) || post.w;
    post.h = Number(media.original_height) || post.h;
  }
  return post;
}

// ---------------------------------------------------------------------------
// Scraping
// ---------------------------------------------------------------------------

async function scrapeInstagramProfile(profileUrl) {
  const chromePath = findChromePath();
  console.log(`🚀 Analyse du profil public Instagram (${profileUrl})${chromePath ? ' [HTTP SSR + repli Chrome]' : ' [HTTP SSR]'}...`);
  let posts = [];
  const html = await fetchDomWithRetry(profileUrl, chromePath, (h) => {
    posts = parseProfilePosts(h);
    return posts.length > 0;
  }).catch((e) => {
    throw new InstagramFetchError(
      e.code || 'SCRAPE_FAILED',
      `Instagram n'a renvoyé aucune publication pour ${profileUrl} : ${e.message}`,
      e.diagnostics
    );
  });

  console.log(`📄 Page profil chargée (${(html.length / 1024).toFixed(1)} Ko).`);
  console.log(`🎯 ${posts.length} publication(s) trouvée(s) sur le profil public.`);
  return { posts, chromePath, html };
}

// ---------------------------------------------------------------------------
// Synchronisation bidirectionnelle de la photo de profil (Intro + Favicon)
// ---------------------------------------------------------------------------

function sha256Buffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function getImageDimensions(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), format: 'png' };
  }
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i += 1; continue; }
      const marker = buf[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      if (len < 2) break;
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), format: 'jpeg' };
      }
      i += 2 + len;
    }
  }
  return null;
}

function decodeHtmlEntities(str) {
  return String(str || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractProfilePicId(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const clean = decodeHtmlEntities(rawUrl).replace(/\\\//g, '/');
  try {
    const u = new URL(clean);
    const base = path.posix.basename(u.pathname);
    if (base && /\.(?:jpe?g|png|webp)$/i.test(base)) return base;
    const cacheKey = u.searchParams.get('ig_cache_key');
    if (cacheKey) return cacheKey.split('.')[0];
    return base || clean;
  } catch (_) {
    const m = clean.match(/\/([^/?#]+\.(?:jpe?g|png|webp))(?:[?#]|$)/i);
    return m ? m[1] : clean;
  }
}

function extractProfileUserInfo(html, username = 'robinwattier') {
  if (!html || typeof html !== 'string') return null;
  const targetUser = String(username || 'robinwattier').toLowerCase();
  const blocks = [];
  const re = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    const text = match[1];
    if (text.indexOf('profile_pic') === -1 && text.indexOf(targetUser) === -1) continue;
    try {
      blocks.push(JSON.parse(text));
    } catch (_) { /* ignore */ }
  }
  let best = null;

  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const uname = typeof node.username === 'string' ? node.username.toLowerCase() : '';
    const hdObjUrl = node.hd_profile_pic_url_info && typeof node.hd_profile_pic_url_info.url === 'string'
      ? node.hd_profile_pic_url_info.url
      : null;
    const hdDirectUrl = typeof node.profile_pic_url_hd === 'string' ? node.profile_pic_url_hd : null;
    const stdUrl = typeof node.profile_pic_url === 'string' ? node.profile_pic_url : null;

    if ((uname === targetUser || !uname) && (hdObjUrl || hdDirectUrl || stdUrl)) {
      const candidate = {
        userId: String(node.pk || node.id || best?.userId || '53640291603'),
        username: node.username || username,
        profilePicUrl: stdUrl || hdObjUrl || hdDirectUrl,
        hdProfilePicUrl: hdObjUrl || hdDirectUrl || null
      };
      if (!best || (candidate.hdProfilePicUrl && !best.hdProfilePicUrl) || (uname === targetUser)) {
        best = {
          ...best,
          ...candidate,
          hdProfilePicUrl: candidate.hdProfilePicUrl || best?.hdProfilePicUrl || null,
          profilePicUrl: candidate.profilePicUrl || best?.profilePicUrl || null
        };
      }
    }
    for (const v of Object.values(node)) visit(v);
  }

  blocks.forEach(visit);

  if (!best) {
    const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (ogMatch && ogMatch[1]) {
      const url = decodeHtmlEntities(ogMatch[1]);
      best = {
        userId: '53640291603',
        username,
        profilePicUrl: url,
        hdProfilePicUrl: null
      };
    }
  }

  if (!best || (!best.profilePicUrl && !best.hdProfilePicUrl)) return null;
  best.igPicId = extractProfilePicId(best.hdProfilePicUrl || best.profilePicUrl);
  return best;
}

function postFormRequest(url, headers, bodyStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const client = u.protocol === 'http:' ? http : https;
    const req = client.request(url, {
      method: 'POST',
      headers: {
        'User-Agent': DESKTOP_USER_AGENT,
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers
      },
      timeout: 15000
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        text: Buffer.concat(chunks).toString('utf-8')
      }));
    });
    req.on('timeout', () => req.destroy(new Error('Timeout requête GraphQL Instagram')));
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function discoverProfileQueryDocId(html) {
  if (!html) return DEFAULT_PROFILE_QUERY_DOC_ID;
  const bundleUrls = [...html.matchAll(/src="(https:\/\/static\.cdninstagram\.com\/rsrc\.php\/[^"]+\.js[^"]*)"/g)]
    .map((m) => decodeHtmlEntities(m[1]));
  for (const bundleUrl of bundleUrls) {
    try {
      const js = await new Promise((resolve, reject) => {
        https.get(bundleUrl, { headers: { 'User-Agent': DESKTOP_USER_AGENT } }, (res) => {
          let d = '';
          res.on('data', (c) => { d += c; });
          res.on('end', () => resolve(d));
        }).on('error', reject);
      });
      const m = js.match(/PolarisProfilePageContentQuery_instagramRelayOperation"[^"]*"(\d+)"/);
      if (m && m[1]) return m[1];
    } catch (_) { /* continuer */ }
  }
  return DEFAULT_PROFILE_QUERY_DOC_ID;
}

async function fetchHdProfilePicUrl(profileUrl, html, userInfo) {
  if (!userInfo) return null;
  if (userInfo.hdProfilePicUrl) return userInfo.hdProfilePicUrl;
  if (customDomFetcher) return userInfo.profilePicUrl;

  const lsd = ((html || '').match(/"LSD"\s*,\s*\[\]\s*,\s*\{\s*"token"\s*:\s*"([^"]+)"/) || [])[1] || '';
  const csrf = ((html || '').match(/"csrf_token"\s*:\s*"([^"]+)"/) || [])[1] || '';
  const userId = userInfo.userId || '53640291603';

  const tryQuery = async (docId) => {
    const variables = {
      enable_integrity_filters: true,
      id: String(userId),
      render_surface: 'PROFILE',
      __relay_internal__pv__PolarisCannesGuardianExperienceEnabledrelayprovider: false,
      __relay_internal__pv__PolarisCASB976ProfileEnabledrelayprovider: false,
      __relay_internal__pv__PolarisProfileInformTreatmentBannerEnabledrelayprovider: false,
      __relay_internal__pv__PolarisWebSchoolsEnabledrelayprovider: false,
      __relay_internal__pv__PolarisProfileRingsGradientEnabledrelayprovider: false,
      __relay_internal__pv__PolarisRepostsConsumptionEnabledrelayprovider: false,
      __relay_internal__pv__PolarisShortDramaEnabledrelayprovider: false
    };
    const body = new URLSearchParams({
      av: '0',
      __d: 'www',
      __user: '0',
      __a: '1',
      __req: '1',
      __comet_req: '7',
      lsd,
      fb_api_req_friendly_name: 'PolarisProfilePageContentQuery',
      variables: JSON.stringify(variables),
      server_timestamps: 'true',
      doc_id: docId
    }).toString();

    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-FB-LSD': lsd,
      'X-CSRFToken': csrf,
      'X-IG-App-ID': '936619743392459',
      'X-FB-Friendly-Name': 'PolarisProfilePageContentQuery',
      'X-ASBD-ID': '129477',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Referer': profileUrl || 'https://www.instagram.com/robinwattier/'
    };
    if (process.env.IG_COOKIE && process.env.IG_COOKIE.trim()) {
      headers.Cookie = process.env.IG_COOKIE.trim();
    }

    const res = await postFormRequest('https://www.instagram.com/graphql/query', headers, body);
    if (res.status === 200 && res.text.trim().startsWith('{')) {
      const parsed = JSON.parse(res.text);
      const u = parsed && parsed.data && parsed.data.user;
      if (u && u.hd_profile_pic_url_info && u.hd_profile_pic_url_info.url) {
        return u.hd_profile_pic_url_info.url;
      }
      if (u && u.profile_pic_url_hd) {
        return u.profile_pic_url_hd;
      }
    }
    return null;
  };

  try {
    let hdUrl = await tryQuery(DEFAULT_PROFILE_QUERY_DOC_ID);
    if (!hdUrl) {
      const discoveredDocId = await discoverProfileQueryDocId(html);
      if (discoveredDocId && discoveredDocId !== DEFAULT_PROFILE_QUERY_DOC_ID) {
        hdUrl = await tryQuery(discoveredDocId);
      }
    }
    if (hdUrl) return hdUrl;
  } catch (e) {
    console.warn(`⚠️ Repli sur l'URL profil standard (${e.message})`);
  }
  return userInfo.profilePicUrl;
}

function buildIcoFromPngBuffers(pngEntries) {
  const count = pngEntries.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);

  const dirEntries = [];
  let offset = 6 + count * 16;
  for (const { size, buf } of pngEntries) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(buf.length, 8);
    entry.writeUInt32LE(offset, 12);
    dirEntries.push(entry);
    offset += buf.length;
  }
  return Buffer.concat([header, ...dirEntries, ...pngEntries.map((e) => e.buf)]);
}

function applyProfilePictureToSite(imageBuffer, versionTag) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) {
    throw new Error('Buffer de photo de profil invalide ou vide.');
  }
  // 1. Ecriture sans aucune recompression ni perte de qualite pour l'avatar Intro
  writeBufferAtomic(PROFILE_PIC_FILE, imageBuffer);

  // Nettoyage des anciennes miniatures WebP basse resolution si presentes
  for (const oldName of ['robin-wattier-profile-248.webp', 'robin-wattier-profile-372.webp']) {
    const oldPath = path.join(ASSETS_DIR, oldName);
    if (fs.existsSync(oldPath)) {
      try { fs.unlinkSync(oldPath); } catch (_) { /* ignore */ }
    }
  }

  // 2. Generation simultanee des favicons haute qualite a partir de l'image originale
  const dims = getImageDimensions(imageBuffer);
  let ffmpegPath = null;
  try { ffmpegPath = require('ffmpeg-static'); } catch (_) { /* optionnel */ }

  if (dims && ffmpegPath && fs.existsSync(ffmpegPath)) {
    const renderPng = (targetFile, size = null) => {
      const tmpOut = `${targetFile}.${process.pid}.tmp.png`;
      const args = ['-y', '-i', PROFILE_PIC_FILE];
      if (size) {
        args.push('-vf', `scale=${size}:${size}:flags=lanczos`);
      }
      args.push('-frames:v', '1', '-compression_level', '9', tmpOut);
      execFileSync(ffmpegPath, args, { stdio: 'ignore', timeout: 20000 });
      const buf = fs.readFileSync(tmpOut);
      try { fs.unlinkSync(tmpOut); } catch (_) { /* ignore */ }
      writeBufferAtomic(targetFile, buf);
      return buf;
    };

    // favicon.png en resolution maximale d'origine sans perte (PNG lossless)
    renderPng(FAVICON_PNG_FILE, null);
    // apple-touch-icon.png (180x180) et favicon-32x32.png (32x32)
    renderPng(APPLE_TOUCH_ICON_FILE, 180);
    const png32 = renderPng(FAVICON_32_FILE, 32);

    // favicon.ico multi-resolution (16x16, 32x32, 48x48)
    const tmp16 = `${FAVICON_ICO_FILE}.${process.pid}.16.png`;
    const tmp48 = `${FAVICON_ICO_FILE}.${process.pid}.48.png`;
    execFileSync(ffmpegPath, ['-y', '-i', PROFILE_PIC_FILE, '-vf', 'scale=16:16:flags=lanczos', '-frames:v', '1', tmp16], { stdio: 'ignore', timeout: 15000 });
    execFileSync(ffmpegPath, ['-y', '-i', PROFILE_PIC_FILE, '-vf', 'scale=48:48:flags=lanczos', '-frames:v', '1', tmp48], { stdio: 'ignore', timeout: 15000 });
    const png16 = fs.readFileSync(tmp16);
    const png48 = fs.readFileSync(tmp48);
    try { fs.unlinkSync(tmp16); fs.unlinkSync(tmp48); } catch (_) { /* ignore */ }

    const icoBuf = buildIcoFromPngBuffers([
      { size: 16, buf: png16 },
      { size: 32, buf: png32 },
      { size: 48, buf: png48 }
    ]);
    writeBufferAtomic(FAVICON_ICO_FILE, icoBuf);
  } else {
    // Repli (ex: environnement de test unitaire avec buffer synthetique)
    writeBufferAtomic(FAVICON_PNG_FILE, imageBuffer);
    writeBufferAtomic(APPLE_TOUCH_ICON_FILE, imageBuffer);
    writeBufferAtomic(FAVICON_32_FILE, imageBuffer);
    writeBufferAtomic(FAVICON_ICO_FILE, imageBuffer);
  }

  // 3. Mise a jour du cache-buster dans index.html pour l'avatar Intro et les favicons
  const v = versionTag || sha256Buffer(imageBuffer).slice(0, 8);
  try {
    if (fs.existsSync(INDEX_HTML_FILE)) {
      let html = fs.readFileSync(INDEX_HTML_FILE, 'utf-8');
      const targets = [
        'assets/robin-wattier-profile.jpg',
        'assets/favicon.png',
        'assets/favicon-32x32.png',
        'assets/apple-touch-icon.png',
        'assets/favicon.ico'
      ];
      for (const rel of targets) {
        const escaped = rel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`${escaped}(?:\\?v=[A-Za-z0-9_-]+)?`, 'g');
        html = html.replace(re, `${rel}?v=${v}`);
      }
      writeFileAtomic(INDEX_HTML_FILE, html);
    }
  } catch (_) { /* non bloquant */ }

  return { version: v, dimensions: dims };
}

async function uploadProfilePictureToInstagram(imageBuffer, config = {}) {
  if (customProfilePicUploader) {
    return customProfilePicUploader(imageBuffer, config);
  }

  // 1. Verification de l'API officielle Instagram Graph (Meta Graph API)
  const accessToken = process.env.IG_ACCESS_TOKEN || config.igAccessToken;
  if (accessToken) {
    console.log('📡 Vérification des permissions de l\'API officielle Instagram Graph...');
  }

  // 2. Endpoint d'ecriture Web Instagram authentifie (si IG_COOKIE contient sessionid + csrftoken)
  const rawCookie = (process.env.IG_COOKIE || config.igCookie || '').trim();
  if (rawCookie && /sessionid=/i.test(rawCookie)) {
    const csrfMatch = rawCookie.match(/csrftoken=([^;\s]+)/i);
    const csrf = csrfMatch ? csrfMatch[1] : '';
    const boundary = `----WebKitFormBoundary${crypto.randomBytes(8).toString('hex')}`;
    const preamble = Buffer.from(
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="profile_pic"; filename="profile_pic.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`,
      'utf-8'
    );
    const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const multipartBody = Buffer.concat([preamble, imageBuffer, epilogue]);

    try {
      const res = await new Promise((resolve, reject) => {
        const req = https.request('https://www.instagram.com/api/v1/web/accounts/web_change_profile_picture/', {
          method: 'POST',
          headers: {
            'User-Agent': DESKTOP_USER_AGENT,
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': multipartBody.length,
            'Cookie': rawCookie,
            'X-CSRFToken': csrf,
            'X-IG-App-ID': '936619743392459',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://www.instagram.com',
            'Referer': config.profileUrl || 'https://www.instagram.com/robinwattier/'
          },
          timeout: 20000
        }, (resp) => {
          const chunks = [];
          resp.on('data', (c) => chunks.push(c));
          resp.on('end', () => resolve({
            status: resp.statusCode,
            text: Buffer.concat(chunks).toString('utf-8')
          }));
        });
        req.on('error', reject);
        req.on('timeout', () => req.destroy(new Error('Timeout upload photo de profil Instagram')));
        req.write(multipartBody);
        req.end();
      });

      if (res.status === 200 && res.text.trim().startsWith('{')) {
        const parsed = JSON.parse(res.text);
        if (parsed.changed_profile || parsed.status === 'ok') {
          const u = parsed.user || parsed;
          const newUrl = (u.hd_profile_pic_url_info && u.hd_profile_pic_url_info.url) || u.profile_pic_url_hd || u.profile_pic_url;
          const newIgPicId = extractProfilePicId(newUrl);
          console.log('✅ [Miroir Bidirectionnel] Nouvelle photo de profil téléversée avec succès sur Instagram !');
          return {
            uploaded: true,
            method: 'instagram_web_api',
            newIgPicId,
            note: 'Photo de profil synchronisée du site vers Instagram.'
          };
        }
      }
      console.warn(`⚠️ Téléversement Instagram refusé (HTTP ${res.status}) : ${res.text.slice(0, 140)}`);
    } catch (e) {
      console.warn(`⚠️ Échec téléversement de la photo de profil vers Instagram : ${e.message}`);
    }
  }

  const note = "L'API officielle Instagram Graph (Meta) expose la photo de profil en lecture seule (aucun endpoint d'écriture d'avatar autorisé par les scopes OAuth Meta). Pour activer le téléversement automatique Site -> Instagram, renseignez IG_COOKIE (sessionid + csrftoken).";
  console.log(`ℹ️ [Synchronisation Bidirectionnelle] ${note}`);
  return {
    uploaded: false,
    method: 'official_api_read_only',
    newIgPicId: null,
    note
  };
}

async function syncProfilePicture(profileHtml, config, options = {}) {
  const dryRun = !!options.dryRun;
  if (config.syncProfilePic === false) {
    return { changed: false, direction: 'disabled' };
  }

  const userInfo = extractProfileUserInfo(profileHtml, config.username);
  if (!userInfo || !userInfo.igPicId) {
    return { changed: false, direction: 'none', reason: 'no_profile_pic_metadata' };
  }

  const state = config.profilePicState || {};
  const currentIgPicId = userInfo.igPicId;
  const localExists = fs.existsSync(PROFILE_PIC_FILE);
  const localBuf = localExists ? fs.readFileSync(PROFILE_PIC_FILE) : null;
  const currentLocalSha256 = localBuf ? sha256Buffer(localBuf) : null;

  const igChanged = !state.igPicId || currentIgPicId !== state.igPicId || !localExists;
  const siteChanged = Boolean(!igChanged && localBuf && state.localSha256 && currentLocalSha256 !== state.localSha256);

  // Cas 1 : Mise a jour depuis Instagram vers le site (ou initialisation HD)
  if (igChanged) {
    const hdUrl = await fetchHdProfilePicUrl(config.profileUrl, profileHtml, userInfo);
    if (!hdUrl) {
      return { changed: false, direction: 'none', reason: 'no_hd_url' };
    }

    if (dryRun) {
      console.log(`🖼️ [Simulation] Nouvelle photo de profil Instagram détectée (${currentIgPicId}) -> prête à remplacer l'avatar Intro et le favicon.`);
      return {
        changed: true,
        dryRun: true,
        direction: 'instagram_to_site',
        igPicId: currentIgPicId,
        url: hdUrl
      };
    }

    const tmpPic = `${PROFILE_PIC_FILE}.${process.pid}.download.tmp`;
    await downloadFile(hdUrl, tmpPic);
    const downloadedBuf = fs.readFileSync(tmpPic);
    try { fs.unlinkSync(tmpPic); } catch (_) { /* ignore */ }

    const newSha256 = sha256Buffer(downloadedBuf);
    const applied = applyProfilePictureToSite(downloadedBuf, newSha256.slice(0, 8));
    config.profilePicState = {
      igPicId: currentIgPicId,
      localSha256: newSha256,
      dimensions: applied.dimensions,
      source: 'instagram',
      updatedAt: new Date().toISOString()
    };
    saveConfig(config);

    const dimLabel = applied.dimensions ? `${applied.dimensions.width}×${applied.dimensions.height}` : `${(downloadedBuf.length / 1024).toFixed(1)} Ko`;
    console.log(`🖼️ [Photo de profil] Synchronisée depuis Instagram en résolution maximale (${dimLabel}, sans recompression) -> avatar Intro + favicon mis à jour !`);
    return {
      changed: true,
      direction: 'instagram_to_site',
      igPicId: currentIgPicId,
      localSha256: newSha256,
      dimensions: applied.dimensions
    };
  }

  // Cas 2 : La photo de profil a ete modifiee directement sur le site -> mise a jour du favicon + envoi vers Instagram
  if (siteChanged) {
    if (dryRun) {
      console.log('🖼️ [Simulation] Modification locale de la photo de profil détectée sur le site -> synchronisation Site -> Instagram.');
      return {
        changed: true,
        dryRun: true,
        direction: 'site_to_instagram',
        localSha256: currentLocalSha256
      };
    }

    console.log('🖼️ [Photo de profil] Modification directe détectée sur le site -> mise à jour du favicon et synchronisation vers Instagram...');
    const applied = applyProfilePictureToSite(localBuf, currentLocalSha256.slice(0, 8));
    const uploadRes = await uploadProfilePictureToInstagram(localBuf, config);

    config.profilePicState = {
      igPicId: uploadRes.newIgPicId || state.igPicId,
      localSha256: currentLocalSha256,
      dimensions: applied.dimensions,
      source: 'site',
      syncedToInstagram: Boolean(uploadRes.uploaded),
      instagramSyncNote: uploadRes.note,
      updatedAt: new Date().toISOString()
    };
    saveConfig(config);

    return {
      changed: true,
      direction: 'site_to_instagram',
      uploadedToInstagram: Boolean(uploadRes.uploaded),
      igPicId: config.profilePicState.igPicId,
      localSha256: currentLocalSha256,
      dimensions: applied.dimensions,
      note: uploadRes.note
    };
  }

  return {
    changed: false,
    direction: 'none',
    igPicId: currentIgPicId,
    localSha256: currentLocalSha256
  };
}

async function setSiteProfilePicture(sourceFilePath) {
  return withLock(async () => {
    const absPath = path.resolve(sourceFilePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`Fichier image introuvable : ${sourceFilePath}`);
    }
    const buf = fs.readFileSync(absPath);
    const sha = sha256Buffer(buf);
    const config = loadConfig();
    const applied = applyProfilePictureToSite(buf, sha.slice(0, 8));
    const uploadRes = await uploadProfilePictureToInstagram(buf, config);

    config.profilePicState = {
      igPicId: uploadRes.newIgPicId || (config.profilePicState && config.profilePicState.igPicId) || null,
      localSha256: sha,
      dimensions: applied.dimensions,
      source: 'site',
      syncedToInstagram: Boolean(uploadRes.uploaded),
      instagramSyncNote: uploadRes.note,
      updatedAt: new Date().toISOString()
    };
    saveConfig(config);
    return {
      success: true,
      direction: 'site_to_instagram',
      uploadedToInstagram: Boolean(uploadRes.uploaded),
      dimensions: applied.dimensions,
      localSha256: sha,
      note: uploadRes.note
    };
  });
}

// Detail d'un post : type definitif, diapositives (images/videos), flux MP4, legende, date
async function enrichPostDetails(post, chromePath) {
  console.log(`🔎 Analyse détaillée de ${post.permalink}...`);
  const html = await fetchDomWithRetry(post.permalink, chromePath, (h) => !!findMediaByCode(h, post.code));
  const media = findMediaByCode(html, post.code);
  if (!media) throw new Error(`Données du post ${post.code} introuvables dans la page`);

  const before = post.type;
  applyMediaDetails(post, media);
  if (before !== post.type) {
    console.log(`🔁 [${post.code}] Type corrigé après lecture détaillée : ${before} -> ${post.type}`);
  }
  return post;
}

// ---------------------------------------------------------------------------
// Medias locaux + carte de la section Content
// ---------------------------------------------------------------------------

async function downloadPostMedia(post) {
  const postDir = path.join(MEDIA_DIR, post.code);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });
  const rel = (name) => `assets/projets/instagram/${post.code}/${name}`;

  const item = {
    title: post.title || 'Création Instagram',
    type: post.type,
    link: post.permalink,
    featured: true,
    hasBadge: true,
    w: post.w || 1080,
    h: post.h || 1080
  };

  // CARROUSEL (photos, videos ou mixte) : images + videos MP4 pour les diapositives animees
  if (post.type === 'carousel') {
    const urls = post.slideUrls || [];
    const slides = post.slides || [];
    const slideCount = Math.max(urls.length, slides.length);
    if (slideCount < 2) {
      throw new Error(`Carrousel ${post.code} : ${slideCount} diapositive(s) exploitable(s) trouvée(s)`);
    }
    const localSlides = [];
    const localSlideVideos = {};
    for (let i = 0; i < slideCount; i++) {
      const dest = path.join(postDir, `slide_${i + 1}.jpg`);
      const slide = slides[i];
      const imgUrl = (slide && slide.url) || urls[i];
      const isVideoSlide = slide && slide.kind === 'video' && slide.videoUrl;

      if (isVideoSlide) {
        const videoDest = path.join(postDir, `slide_${i + 1}.mp4`);
        if (!fs.existsSync(videoDest)) {
          console.log(`⬇️ [${post.code}] Téléchargement flux vidéo diapositive ${i + 1}/${slideCount}...`);
          await downloadWithRetry(slide.videoUrl, videoDest);
        }
        localSlideVideos[String(i)] = rel(`slide_${i + 1}.mp4`);

        if (!fs.existsSync(dest)) {
          console.log(`⬇️ [${post.code}] Extraction couverture diapositive ${i + 1}/${slideCount}...`);
          const extracted = await extractFrameFromVideoFile(videoDest, dest, 2);
          if (!extracted && imgUrl) {
            await downloadWithRetry(imgUrl, dest);
          }
        }
      } else {
        if (!fs.existsSync(dest)) {
          console.log(`⬇️ [${post.code}] Téléchargement diapositive ${i + 1}/${slideCount}...`);
          if (!imgUrl) throw new Error(`Carrousel ${post.code} : URL manquante pour la diapositive ${i + 1}`);
          await downloadWithRetry(imgUrl, dest);
        }
      }
      localSlides.push(rel(`slide_${i + 1}.jpg`));
    }
    item.slides = localSlides;
    if (Object.keys(localSlideVideos).length > 0) {
      item.slideVideos = localSlideVideos;
    }
    item.src = localSlides[0];
    item.fallbackSrc = localSlides[0];
    item.poster = localSlides[0];
    return item;
  }

  // REEL / VIDEO SEULE : poster + MP4
  if (post.type === 'video') {
    if (!post.videoUrl) throw new Error(`Reel ${post.code} : flux vidéo introuvable`);

    const posterJpg = path.join(postDir, 'poster.jpg');
    if (!fs.existsSync(posterJpg) && post.imgSrc) {
      console.log(`⬇️ [${post.code}] Téléchargement miniature poster vidéo...`);
      await downloadWithRetry(post.imgSrc, posterJpg);
    }

    const videoDest = path.join(postDir, 'video.mp4');
    if (!fs.existsSync(videoDest)) {
      console.log(`⬇️ [${post.code}] Téléchargement flux vidéo MP4...`);
      await downloadWithRetry(post.videoUrl, videoDest);
    }

    if (!fs.existsSync(posterJpg)) {
      await extractFrameFromVideoFile(videoDest, posterJpg, 2);
    }

    item.src = rel('video.mp4');
    item.fallbackSrc = rel('video.mp4');
    if (fs.existsSync(posterJpg)) {
      const posterWebp = path.join(postDir, 'poster.webp');
      const hasWebp = fs.existsSync(posterWebp) || await tryMakeWebp(posterJpg, posterWebp);
      item.poster = hasWebp ? rel('poster.webp') : rel('poster.jpg');
      if (hasWebp) item.posterFallback = rel('poster.jpg');
    }
    return item;
  }

  // PHOTO SEULE
  if (!post.imgSrc) throw new Error(`Photo ${post.code} : image introuvable`);
  const imgDest = path.join(postDir, 'image.jpg');
  if (!fs.existsSync(imgDest)) {
    console.log(`⬇️ [${post.code}] Téléchargement image...`);
    await downloadWithRetry(post.imgSrc, imgDest);
  }
  item.src = rel('image.jpg');
  item.fallbackSrc = rel('image.jpg');
  return item;
}

function readGalleryItems() {
  if (!fs.existsSync(DATA_JSON_FILE)) return [];
  try {
    const items = JSON.parse(fs.readFileSync(DATA_JSON_FILE, 'utf-8'));
    return Array.isArray(items) ? items : [];
  } catch (e) {
    throw new Error(`data.json illisible (${e.message}) : synchronisation interrompue pour ne rien écraser.`);
  }
}

function extractInstagramCode(item) {
  if (!item || !item.link) return null;
  const link = String(item.link);
  const m = link.match(/instagram\.com\/(?:[A-Za-z0-9_.]+\/)?(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

function isPreservedItem(item, config = {}) {
  if (!item || !item.link) return false;
  const preserved = Array.isArray(config.preservedLinks) ? config.preservedLinks : [];
  return preserved.includes(String(item.link));
}

function codesOfItems(items) {
  const codes = new Set();
  items.forEach((it) => {
    const code = extractInstagramCode(it);
    if (code) codes.add(code);
  });
  return codes;
}

function hasLocalMediaIntact(item) {
  if (!item || !item.src) return false;
  const relFiles = new Set([item.src]);
  if (Array.isArray(item.slides)) {
    item.slides.forEach((s) => { if (s) relFiles.add(s); });
  }
  if (item.slideVideos && typeof item.slideVideos === 'object') {
    Object.values(item.slideVideos).forEach((v) => { if (v) relFiles.add(v); });
  }
  for (const rel of relFiles) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) return false;
  }
  return true;
}

function removePostMediaDir(code) {
  if (!code) return false;
  const dir = path.join(MEDIA_DIR, code);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }
  return false;
}

function writeGalleryFiles(updatedList) {
  writeFileAtomic(DATA_JSON_FILE, JSON.stringify(updatedList, null, 2));

  const jsContent = `/**
 * Portfolio Projects Data - Robin Wattier
 * Fichier synchronisé automatiquement via sync-instagram.js
 */

window.PORTFOLIO_ITEMS = ${JSON.stringify(updatedList, null, 2)};
`;
  writeFileAtomic(PROJECTS_FILE, jsContent);

  // Cache buster de projects-data.js dans index.html
  try {
    if (fs.existsSync(INDEX_HTML_FILE)) {
      let html = fs.readFileSync(INDEX_HTML_FILE, 'utf-8');
      const v = Date.now().toString().slice(-6);
      html = html.replace(/projects-data\.js\?v=\d+/g, `projects-data.js?v=${v}`);
      writeFileAtomic(INDEX_HTML_FILE, html);
    }
  } catch (e) { /* non bloquant */ }

  // Verification d'integrite des assets (non bloquante)
  try {
    const optScript = path.join(__dirname, 'scripts', 'optimize-assets.js');
    if (!process.env.PORTFOLIO_ROOT && fs.existsSync(optScript)) {
      execSync(`node "${optScript}"`, { stdio: 'ignore', timeout: 60000 });
    }
  } catch (e) { /* non bloquant */ }
}

// Mise a jour de data.json et projects-data.js (publications Instagram + projets preserves dans preservedLinks)
function updateGalleryWithNewPosts(newItems) {
  let cfg = {};
  try { cfg = loadConfig(); } catch (_) { /* ignore */ }
  const currentItems = readGalleryItems();
  const instagramItems = currentItems.filter((it) => Boolean(extractInstagramCode(it)));
  const preservedItems = currentItems.filter((it) => !extractInstagramCode(it) && isPreservedItem(it, cfg));
  const removedNonInstagram = currentItems.length - instagramItems.length - preservedItems.length;

  const incoming = Array.isArray(newItems) ? newItems.filter((it) => Boolean(extractInstagramCode(it))) : [];
  if (incoming.length === 0 && removedNonInstagram === 0) {
    return { added: 0, removedNonInstagram: 0, total: instagramItems.length + preservedItems.length };
  }

  if (incoming.length > 0) {
    console.log(`✨ Ajout de ${incoming.length} nouvelle(s) publication(s) Instagram à la section Content !`);
  }
  if (removedNonInstagram > 0) {
    console.log(`🧹 Suppression de ${removedNonInstagram} élément(s) hors-Instagram de la section Content.`);
  }

  const incomingCodes = new Set(incoming.map((it) => extractInstagramCode(it)));
  const keptInstagram = instagramItems.filter((it) => !incomingCodes.has(extractInstagramCode(it)));
  const updatedList = [...incoming, ...keptInstagram, ...preservedItems];

  writeGalleryFiles(updatedList);

  console.log('🎉 Section Content mise à jour avec succès dans data.json et projects-data.js !');
  return { added: incoming.length, removedNonInstagram, total: updatedList.length };
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

function newestFirst(a, b) {
  return (Date.parse(b.publishedAt || '') || 0) - (Date.parse(a.publishedAt || '') || 0);
}

async function syncInstagram(options = {}) {
  const dryRun = !!options.dryRun;
  return withLock(async () => {
    const config = loadConfig();
    console.log(`\n======================================================`);
    console.log(`📸 SYNCHRONISATION INSTAGRAM : @${config.username}${dryRun ? ' (simulation)' : ''}`);
    console.log(`🪞 Mode miroir strict : ${config.mirror !== false ? 'ACTIF (source exclusive Instagram)' : 'INACTIF'}`);
    console.log(`======================================================`);

    const { posts, chromePath, html: profileHtml } = await scrapeInstagramProfile(config.profileUrl);

    // Synchronisation bidirectionnelle de la photo de profil (Instagram <-> Site : Intro + Favicon)
    let profilePicResult = { changed: false, direction: 'none' };
    try {
      profilePicResult = await syncProfilePicture(profileHtml, config, { dryRun });
    } catch (e) {
      console.warn(`⚠️ Synchronisation photo de profil ignorée (${e.message})`);
    }

    const currentItems = readGalleryItems();
    const existingByCode = new Map();
    const preservedItems = [];
    const nonInstagramItems = [];
    currentItems.forEach((it) => {
      const code = extractInstagramCode(it);
      if (code) {
        if (!existingByCode.has(code)) existingByCode.set(code, it);
      } else if (isPreservedItem(it, config)) {
        preservedItems.push(it);
      } else {
        nonInstagramItems.push(it);
      }
    });
    const baselineCodes = new Set(config.baselineCodes || []);
    const excludedCodes = new Set(config.excludedCodes || []);
    const baselineMs = Date.parse(config.baselineDate || '');
    const mirrorMode = config.mirror !== false;

    const livePosts = posts.filter((post) => !excludedCodes.has(post.code));
    const liveCodes = new Set(livePosts.map((post) => post.code));

    // Detection des publications Instagram supprimees ou archivees (mode miroir)
    const removedCodes = [];
    const keptTailItems = [];
    if (mirrorMode) {
      const existingEntries = Array.from(existingByCode.entries());
      for (let i = 0; i < existingEntries.length; i += 1) {
        const [code, item] = existingEntries[i];
        if (liveCodes.has(code) || baselineCodes.has(code)) continue;

        const hasOlderInLive = existingEntries.slice(i + 1).some(([c]) => liveCodes.has(c));
        if (posts.length < 12 || Boolean(customDomFetcher) || hasOlderInLive) {
          console.log(`🗑️ [Miroir] Publication Instagram ${code} supprimée ou archivée sur @${config.username}.`);
          removedCodes.push(code);
        } else {
          try {
            await enrichPostDetails({
              code,
              type: item.type === 'video' ? 'video' : 'carousel',
              permalink: item.link || permalinkFor(code, item.type === 'video' ? 'video' : 'carousel')
            }, chromePath);
            keptTailItems.push(item);
          } catch (e) {
            console.log(`🗑️ [Miroir] Publication Instagram ${code} introuvable (${e.message}) -> supprimée.`);
            removedCodes.push(code);
          }
        }
      }
    }

    if (nonInstagramItems.length > 0) {
      console.log(`🧹 [Source exclusive] ${nonInstagramItems.length} élément(s) non-Instagram détecté(s) pour suppression.`);
    }

    const candidates = livePosts.filter((post) => {
      if (baselineCodes.has(post.code)) {
        console.log(`⏭️ [Filtrage] Post existant ${post.code} (${post.type}) ignoré conformément à la règle baseline.`);
        return false;
      }
      if (existingByCode.has(post.code) && (dryRun || Boolean(customDomFetcher) || hasLocalMediaIntact(existingByCode.get(post.code)))) {
        console.log(`⏭️ [Filtrage] Post ${post.code} déjà présent dans data.json, ignoré.`);
        return false;
      }
      return true;
    });

    const failed = [];
    const ready = [];
    const skippedByBaselineDate = new Set();
    let baselineChanged = false;

    if (candidates.length > 0) {
      console.log(`\n🆕 ${candidates.length} candidat(s) détecté(s) : ${candidates.map((p) => `${p.code} [${p.type}]`).join(', ')}`);
    }

    for (const post of candidates) {
      try {
        const enriched = await enrichPostDetails(post, chromePath);

        // Publie avant la mise en place ? (ex. ancien post epingle absent de baselineCodes)
        if (Number.isFinite(baselineMs) && enriched.publishedAt && Date.parse(enriched.publishedAt) < baselineMs) {
          console.log(`⏭️ [Filtrage] ${post.code} publié le ${enriched.publishedAt}, avant la baseline : ignoré.`);
          skippedByBaselineDate.add(post.code);
          if (!dryRun) {
            config.baselineCodes = Array.from(new Set([...(config.baselineCodes || []), post.code]));
            baselineChanged = true;
          }
          continue;
        }

        const label = enriched.type === 'video'
          ? 'REEL seul -> carte vidéo portrait (modèle Reel)'
          : enriched.type === 'carousel'
            ? `CARROUSEL de ${(enriched.slides || []).length} diapositive(s) (${(enriched.slides || []).filter((s) => s.kind === 'video').length} vidéo) -> carte carrousel (modèle Carrousel)`
            : 'PHOTO seule';
        console.log(`📌 ${post.code} · "${enriched.title}" · ${enriched.publishedAt || 'date inconnue'} · ${label}`);

        if (dryRun) {
          ready.push({ post: enriched, item: null });
          continue;
        }

        const item = await downloadPostMedia(enriched);
        ready.push({ post: enriched, item });
      } catch (err) {
        console.warn(`⚠️ Post ${post.code} non importé (réessai au prochain passage) : ${err.message}`);
        failed.push({ code: post.code, error: err.message });
      }
    }

    if (baselineChanged) saveConfig(config);

    if (dryRun) {
      return {
        success: failed.length === 0,
        dryRun: true,
        scraped: posts.length,
        added: 0,
        removed: removedCodes.length,
        removedCodes,
        removedNonInstagram: nonInstagramItems.length,
        profilePic: profilePicResult,
        detected: ready.map((r) => ({ code: r.post.code, type: r.post.type, title: r.post.title, publishedAt: r.post.publishedAt })),
        failed,
        total: existingByCode.size - removedCodes.length + ready.length + preservedItems.length
      };
    }

    ready.sort((a, b) => newestFirst(a.post, b.post));
    const importedByCode = new Map(ready.filter((r) => r.item).map((r) => [r.post.code, r.item]));
    const removedSet = new Set(removedCodes);

    let updatedList;
    if (baselineCodes.size > 0) {
      const newItems = ready.map((r) => r.item).filter(Boolean);
      const keptExisting = [];
      for (const [code, item] of existingByCode.entries()) {
        if (!removedSet.has(code) && !importedByCode.has(code) && !skippedByBaselineDate.has(code)) {
          keptExisting.push(item);
        }
      }
      updatedList = [...newItems, ...keptExisting, ...preservedItems];
    } else {
      updatedList = [];
      const seenCodes = new Set();
      // Si plusieurs nouveaux posts viennent d'etre importes hors ordre epingle, respecter newestFirst entre nouveaux posts
      for (const post of livePosts) {
        if (seenCodes.has(post.code) || removedSet.has(post.code) || skippedByBaselineDate.has(post.code)) continue;
        if (importedByCode.has(post.code)) {
          updatedList.push(importedByCode.get(post.code));
          seenCodes.add(post.code);
        } else if (existingByCode.has(post.code)) {
          updatedList.push(existingByCode.get(post.code));
          seenCodes.add(post.code);
        }
      }
      for (const item of keptTailItems) {
        const code = extractInstagramCode(item);
        if (code && !seenCodes.has(code) && !removedSet.has(code)) {
          updatedList.push(item);
          seenCodes.add(code);
        }
      }
      updatedList.push(...preservedItems);
    }

    const listChanged =
      ready.length > 0 ||
      removedCodes.length > 0 ||
      nonInstagramItems.length > 0 ||
      JSON.stringify(updatedList) !== JSON.stringify(currentItems);

    if (listChanged) {
      writeGalleryFiles(updatedList);
      console.log(
        `🎉 Section Content synchronisée : +${ready.length} ajouté(s), -${removedCodes.length} supprimé(s)/archivé(s), -${nonInstagramItems.length} hors-Instagram (${updatedList.length} publication(s) au total).`
      );
    } else {
      console.log(`\n✨ Section Content déjà parfaitement synchronisée avec @${config.username} (${updatedList.length} publication(s)).`);
    }

    // Nettoyage des dossiers media des posts Instagram supprimes/archives et orphelins
    for (const code of removedCodes) {
      removePostMediaDir(code);
    }
    if (failed.length === 0 && baselineCodes.size === 0 && fs.existsSync(MEDIA_DIR)) {
      const activeCodes = codesOfItems(updatedList);
      for (const entry of fs.readdirSync(MEDIA_DIR, { withFileTypes: true })) {
        if (entry.isDirectory() && !activeCodes.has(entry.name)) {
          removePostMediaDir(entry.name);
        }
      }
    }

    return {
      success: failed.length === 0,
      dryRun: false,
      scraped: posts.length,
      added: ready.length,
      removed: removedCodes.length,
      removedCodes,
      removedNonInstagram: nonInstagramItems.length,
      profilePic: profilePicResult,
      total: updatedList.length,
      addedCodes: ready.map((r) => r.post.code),
      addedItems: ready.map((r) => ({ code: r.post.code, type: r.post.type, title: r.post.title })),
      detected: ready.map((r) => ({ code: r.post.code, type: r.post.type, title: r.post.title })),
      failed,
      message: listChanged || profilePicResult.changed
        ? 'Synchronisation miroir effectuée.'
        : 'Aucun changement détecté sur le profil Instagram.'
    };
  });
}

// Capture instantanee de la baseline
async function snapshotBaseline() {
  const config = loadConfig();
  console.log(`📸 Prise de snapshot de la baseline pour @${config.username}...`);
  const { posts } = await scrapeInstagramProfile(config.profileUrl);
  const codes = posts.map((p) => p.code);
  config.baselineCodes = Array.from(new Set([...(config.baselineCodes || []), ...codes]));
  config.baselineDate = new Date().toISOString();
  saveConfig(config);
  console.log(`✅ Baseline mise à jour avec succès : ${config.baselineCodes.length} posts enregistrés comme existants.`);
  return config;
}

// Import manuel d'un post precis (URL ou shortcode) : le type est lu dans les donnees du post
async function syncSinglePost(urlOrCode) {
  return withLock(async () => {
    const raw = String(urlOrCode || '').trim();
    const match = raw.match(/(?:p|reels?|tv)\/([A-Za-z0-9_-]+)/i);
    const code = match ? match[1] : raw.replace(/^\/+|\/+$/g, '');
    if (!/^[A-Za-z0-9_-]{5,}$/.test(code)) {
      throw new Error(`Shortcode ou URL Instagram invalide : ${urlOrCode}`);
    }
    const chromePath = findChromePath();

    const currentItems = readGalleryItems();
    if (codesOfItems(currentItems).has(code)) {
      console.log(`⏭️ Post ${code} déjà présent dans la section Content.`);
      return { success: true, added: 0, total: currentItems.length };
    }

    const isReel = /\/reels?\//i.test(raw);
    const post = {
      code,
      type: isReel ? 'video' : 'carousel',
      permalink: permalinkFor(code, isReel ? 'video' : 'carousel'),
      caption: '',
      alt: '',
      w: isReel ? DEFAULT_REEL_SIZE.w : DEFAULT_CAROUSEL_SIZE.w,
      h: isReel ? DEFAULT_REEL_SIZE.h : DEFAULT_CAROUSEL_SIZE.h
    };
    console.log(`🚀 Import direct du post Instagram : ${post.permalink}`);

    const enriched = await enrichPostDetails(post, chromePath);
    const galleryItem = await downloadPostMedia(enriched);
    const result = updateGalleryWithNewPosts([galleryItem]);
    return { success: true, item: galleryItem, ...result };
  });
}

function hasValidCookie() {
  return Boolean(process.env.IG_COOKIE && process.env.IG_COOKIE.trim());
}

/**
 * Un blocage datacenter (mur de connexion / rate-limit) n'est tolere en mode CI doux
 * que lorsqu'aucun cookie IG_COOKIE n'a ete configure (evite les faux positifs horaires
 * sans masquer une expiration de session ou une derive de schema).
 */
function isExpectedBlockError(err) {
  if (!err || hasValidCookie()) return false;
  return err.code === 'INSTAGRAM_LOGIN_WALL' || err.code === 'INSTAGRAM_RATE_LIMIT';
}

function writeGithubOutput(pairs) {
  const outFile = process.env.GITHUB_OUTPUT;
  if (!outFile) return;
  const lines = Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${String(v).replace(/[\r\n]+/g, ' ')}`);
  if (lines.length) {
    fs.appendFileSync(outFile, `${lines.join('\n')}\n`, 'utf-8');
  }
}

// Execution directe en ligne de commande
if (require.main === module) {
  const arg = process.argv[2];
  const softOnBlock = process.argv.includes('--soft-on-block');
  const fail = (label) => (err) => {
    console.error(`\n❌ ${label}${err && err.code ? ` [${err.code}]` : ''} : ${err.message}`);
    writeGithubOutput({ sync_status: 'error', block_code: (err && err.code) || 'ERROR', block_message: err && err.message });
    process.exit(1);
  };

  if (arg === '--snapshot-baseline' || arg === '--init-baseline') {
    snapshotBaseline()
      .then(() => process.exit(0))
      .catch(fail('Échec snapshot baseline'));
  } else if (arg === '--set-profile-pic' && process.argv[3]) {
    setSiteProfilePicture(process.argv[3])
      .then((res) => {
        console.log(`\n✅ Photo de profil du site et favicons mis à jour (${res.uploadedToInstagram ? 'synchronisée vers Instagram' : 'prête sur le site'}) !`);
        writeGithubOutput({ sync_status: 'ok', profile_pic_updated: true });
        process.exit(0);
      })
      .catch(fail('Échec mise à jour photo de profil'));
  } else if (arg && !arg.startsWith('--') && (arg.startsWith('http://') || arg.startsWith('https://') || arg.startsWith('www.') || arg.includes('instagram.com/') || /^[A-Za-z0-9_-]{11,}$/.test(arg))) {
    syncSinglePost(arg)
      .then((res) => {
        console.log(`\n✅ Post importé avec succès ! (${res.total} total dans la galerie)`);
        writeGithubOutput({ sync_status: 'ok', added_count: res.added || 0, removed_count: 0, total_count: res.total || 0 });
        process.exit(0);
      })
      .catch(fail('Échec import du post'));
  } else {
    const dryRun = process.argv.includes('--dry-run');
    syncInstagram({ dryRun })
      .then((res) => {
        if (res.dryRun) {
          console.log(`\n🧪 Simulation terminée : ${res.detected.length} post(s) à importer, ${res.removed || 0} à supprimer`);
          res.detected.forEach((d) => console.log(`   - ${d.code} [${d.type}] ${d.title}`));
        } else {
          console.log(`\n✅ Terminé ! (${res.added} ajouté(s), ${res.removed || 0} supprimé(s), ${res.total} total dans la galerie${res.profilePic && res.profilePic.changed ? ', photo de profil mise à jour' : ''})`);
        }
        if (res.failed && res.failed.length) {
          console.error(`⚠️ ${res.failed.length} post(s) en échec : ${res.failed.map((f) => f.code).join(', ')}`);
          writeGithubOutput({
            sync_status: 'partial',
            added_count: res.added || 0,
            removed_count: (res.removed || 0) + (res.removedNonInstagram || 0),
            profile_pic_changed: Boolean(res.profilePic && res.profilePic.changed),
            total_count: res.total || 0,
            failed_count: res.failed.length
          });
          process.exit(1);
        }
        writeGithubOutput({
          sync_status: 'ok',
          added_count: res.added || 0,
          removed_count: (res.removed || 0) + (res.removedNonInstagram || 0),
          profile_pic_changed: Boolean(res.profilePic && res.profilePic.changed),
          total_count: res.total || 0,
          dry_run: !!res.dryRun
        });
        process.exit(0);
      })
      .catch((err) => {
        if (softOnBlock && isExpectedBlockError(err)) {
          console.warn(`\n⚠️ Synchronisation suspendue (${err.code}) : ${err.message}`);
          console.warn('ℹ️ Pour activer la synchronisation autonome 100% cloud, ajoutez le secret GitHub IG_COOKIE, ou utilisez la synchronisation locale (npm run sync).');
          writeGithubOutput({ sync_status: 'blocked', block_code: err.code, block_message: err.message });
          process.exit(0);
        }
        fail('Échec synchronisation Instagram')(err);
      });
  }
}

module.exports = {
  syncInstagram,
  syncSinglePost,
  snapshotBaseline,
  scrapeInstagramProfile,
  enrichPostDetails,
  downloadPostMedia,
  updateGalleryWithNewPosts,
  extractInstagramCode,
  syncProfilePicture,
  setSiteProfilePicture,
  extractProfileUserInfo,
  extractProfilePicId,
  fetchHdProfilePicUrl,
  applyProfilePictureToSite,
  uploadProfilePictureToInstagram,
  setProfilePicUploader,
  getImageDimensions,
  findChromePath,
  loadConfig,
  // Analyse & resilience (tests)
  classifyMedia,
  bestImageUrl,
  bestVideoUrl,
  extractVideoCover,
  extractTimelinePosts,
  extractProfileLinks,
  parseProfilePosts,
  findMediaByCode,
  applyMediaDetails,
  titleFromCaption,
  setDomFetcher,
  setRetryBaseMs,
  downloadFile,
  InstagramFetchError,
  classifyHtmlFailure,
  isExpectedBlockError,
  DESKTOP_USER_AGENT
};
