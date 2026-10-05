/**
 * Instagram to Portfolio Auto-Sync & Scraper - Robin Wattier
 * 
 * Scraper autonome et résilient pour Instagram (https://www.instagram.com/robinwattier/)
 * - Capture tous les posts du profil public (carrousels, reels, photos), hors story
 * - Télécharge automatiquement les médias en local (assets/projets/instagram/<id>/)
 * - Préserve l'architecture de la galerie et la persistance des fichiers (data.json & projects-data.js)
 * - Maintient les projets épinglés (DanElec en haut, Book de stage Mons en bas)
 * - Gère le carrousel Matchbox (défilement au survol) et les reels avec lecture
 *
 * Utilisation :
 * 1. Lancement direct : node sync-instagram.js
 * 2. Import d'un post précis : node sync-instagram.js https://www.instagram.com/p/CODE/
 * 3. Via API backend : GET ou POST /api/instagram/sync
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

const CONFIG_FILE = path.join(__dirname, 'instagram-config.json');
const PROJECTS_FILE = path.join(__dirname, 'projects-data.js');
const DATA_JSON_FILE = path.join(__dirname, 'data.json');
const INDEX_HTML_FILE = path.join(__dirname, 'index.html');
const MEDIA_DIR = path.join(__dirname, 'assets', 'projets', 'instagram');

// Charger la configuration
function loadConfig() {
  const defaults = {
    username: 'robinwattier',
    profileUrl: 'https://www.instagram.com/robinwattier/',
    autoSyncIntervalMinutes: 60,
    downloadMedia: true,
    excludeStories: true
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

// Trouver le chemin de Google Chrome ou Microsoft Edge
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
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];

  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

// Dump du DOM via Chrome headless
function dumpPageDom(url, chromePath) {
  return new Promise((resolve, reject) => {
    if (!chromePath) {
      return reject(new Error('Navigateur Chrome introuvable sur le système.'));
    }

    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--dump-dom',
      url
    ];

    execFile(chromePath, args, { maxBuffer: 30 * 1024 * 1024, timeout: 35000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout || '');
    });
  });
}

// Téléchargement d'un fichier avec support des redirections et headers
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Referer': 'https://www.instagram.com/'
      }
    }, (response) => {
      // Suivre les redirections
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
        return reject(new Error(`HTTP status ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
    });

    req.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Nettoyage d'une légende Instagram pour titre de carte
function cleanInstagramCaption(rawText) {
  if (!rawText) return 'Création Instagram';
  let text = rawText
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

  // Retirer format meta description : "XX likes, YY comments - username on Date: \"Caption\""
  text = text.replace(/^[0-9,kKmM\s]+likes?,?\s*[0-9,kKmM\s]*comments?\s*-\s*[^:]+:\s*/i, '');

  // Retirer préfixes "Nom sur Instagram: " ou "Nom on Instagram: "
  text = text.replace(/^.*?Instagram\s*:\s*/i, '');

  // Extraire le texte entre guillemets si présent
  const quoteMatch = text.match(/[«"“](.*?)[»"”]/);
  if (quoteMatch && quoteMatch[1].trim().length >= 3) {
    text = quoteMatch[1].trim();
  }

  // Retirer guillemets englobants restants
  text = text.replace(/^["'«“\s]+|["'»”\s]+$/g, '');

  // Retirer préfixes automatiques "Photo by ... on ..."
  text = text.replace(/^(?:Photo|Vidéo|Video)\s+(?:by|de)\s+[^:]+:\s*/i, '');
  text = text.replace(/^[^:]+le\s+[0-9A-Za-z\s,]+\s*:\s*/i, '');

  // Prendre la première ligne significative avant les hashtags
  const firstLine = text.split('\n')[0].replace(/#\S+/g, '').trim();
  if (firstLine.length >= 3) {
    return firstLine.slice(0, 80).trim();
  }

  return 'Création Instagram';
}

// Scraper les publications de profil
async function scrapeInstagramProfile(profileUrl) {
  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('Google Chrome introuvable pour exécuter le scraper.');
  }

  console.log(`🚀 Lancement du scraper Instagram via Chrome headless (${profileUrl})...`);
  const html = await dumpPageDom(profileUrl, chromePath);
  console.log(`📄 Page chargée (${(html.length / 1024).toFixed(1)} Ko). Analyse des publications...`);

  // Extraire les liens des posts (ex: /robinwattier/p/CODE/ ou /reel/CODE/)
  const linkRegex = /<a[^>]+href="(\/[^"]*?(?:p|reel)\/([A-Za-z0-9_-]+)\/)"[^>]*>([\s\S]*?)<\/a>/g;
  let match;
  const discoveredPosts = [];
  const seenCodes = new Set();

  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    const code = match[2];
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    const innerHtml = match[3];

    // Extraction de la miniature et de l'aspect ratio
    const srcMatch = innerHtml.match(/src="([^">]+)"/);
    const altMatch = innerHtml.match(/alt="([^">]*)"/);
    const ratioMatch = innerHtml.match(/padding-bottom:\s*([\d.]+)%/);

    const imgSrc = srcMatch ? srcMatch[1].replace(/&amp;/g, '&') : null;
    const alt = altMatch ? altMatch[1] : '';

    let w = 1080;
    let h = 1080;
    if (ratioMatch) {
      const pad = parseFloat(ratioMatch[1]);
      h = Math.round(w * (pad / 100));
    }

    const isReel = href.includes('/reel/');
    const isCarousel = innerHtml.includes('Carousel') || innerHtml.includes('carousel') || innerHtml.includes('Carrousel') || innerHtml.includes('Diapositive');

    discoveredPosts.push({
      code,
      type: isReel ? 'video' : (isCarousel ? 'carousel' : 'image'),
      permalink: `https://www.instagram.com${href}`,
      imgSrc,
      alt,
      w,
      h
    });
  }

  console.log(`🎯 ${discoveredPosts.length} publication(s) détectée(s) sur le profil.`);
  return { posts: discoveredPosts, chromePath };
}

// Enrichir un post individuel (détail des slides, caption complète)
async function enrichPostDetails(post, chromePath) {
  try {
    const postHtml = await dumpPageDom(post.permalink, chromePath);

    // Extraction de la légende / og:title
    const ogTitleMatch = postHtml.match(/<meta property="og:title" content="([^"]*)"/);
    const ogDescMatch = postHtml.match(/<meta property="og:description" content="([^"]*)"/);
    const rawCaption = (ogTitleMatch ? ogTitleMatch[1] : '') || (ogDescMatch ? ogDescMatch[1] : '') || post.alt;
    post.title = cleanInstagramCaption(rawCaption);

    // Si carrousel, extraire toutes les diapositives
    if (post.type === 'carousel') {
      const imgRegex = /https:\/\/[^"'\s\\]+\.(?:jpg|webp)[^"'\s\\]*/g;
      const allUrls = (postHtml.match(imgRegex) || [])
        .map(u => u.replace(/&amp;/g, '&'))
        .filter(u => (u.includes('scontent') || u.includes('fbcdn.net')) && !u.includes('s150x150') && !u.includes('profile_pic'));

      // Dédoublonnage par clé d'image
      const uniqueSlideUrls = Array.from(new Set(allUrls));
      if (uniqueSlideUrls.length > 1) {
        post.slideUrls = uniqueSlideUrls.slice(0, 10);
      }
    }
  } catch (err) {
    console.warn(`⚠️ Erreur enrichissement du post ${post.code} : ${err.message}`);
    post.title = cleanInstagramCaption(post.alt);
  }

  return post;
}

// Téléchargement et structuration des médias locaux
async function downloadPostMedia(post) {
  const postDir = path.join(MEDIA_DIR, post.code);
  if (!fs.existsSync(postDir)) fs.mkdirSync(postDir, { recursive: true });

  const item = {
    title: post.title || 'Création Instagram',
    type: post.type,
    link: post.permalink,
    featured: true,
    hasBadge: true,
    w: post.w || 1080,
    h: post.h || 1080
  };

  if (post.type === 'carousel' && Array.isArray(post.slideUrls) && post.slideUrls.length > 1) {
    const localSlides = [];
    for (let i = 0; i < post.slideUrls.length; i++) {
      const slideUrl = post.slideUrls[i];
      const relPath = `assets/projets/instagram/${post.code}/slide_${i + 1}.jpg`;
      const dest = path.join(postDir, `slide_${i + 1}.jpg`);

      if (!fs.existsSync(dest)) {
        try {
          console.log(`⬇️ [${post.code}] Téléchargement diapositive ${i + 1}/${post.slideUrls.length}...`);
          await downloadFile(slideUrl, dest);
        } catch (e) {
          console.warn(`⚠️ Échec diapositive ${i + 1} : ${e.message}`);
        }
      }
      if (fs.existsSync(dest)) {
        localSlides.push(relPath);
      }
    }

    if (localSlides.length > 0) {
      item.slides = localSlides;
      item.src = localSlides[0];
      item.fallbackSrc = localSlides[0];
      item.poster = localSlides[0];
      return item;
    }
  }

  // Post simple ou Reel : télécharger l'affiche / image
  const targetName = post.type === 'video' ? 'poster.jpg' : 'image.jpg';
  const relPath = `assets/projets/instagram/${post.code}/${targetName}`;
  const dest = path.join(postDir, targetName);

  if (!fs.existsSync(dest) && post.imgSrc) {
    try {
      console.log(`⬇️ [${post.code}] Téléchargement média...`);
      await downloadFile(post.imgSrc, dest);
    } catch (e) {
      console.warn(`⚠️ Échec téléchargement média : ${e.message}`);
    }
  }

  const finalSrc = fs.existsSync(dest) ? relPath : post.imgSrc;
  item.src = finalSrc;
  item.fallbackSrc = finalSrc;
  if (post.type === 'video') {
    item.poster = finalSrc;
  }

  return item;
}

// Mise à jour de data.json et projects-data.js en préservant l'ordre
function updateGalleryWithNewPosts(newItems) {
  let currentItems = [];
  if (fs.existsSync(DATA_JSON_FILE)) {
    try {
      currentItems = JSON.parse(fs.readFileSync(DATA_JSON_FILE, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ Erreur lecture data.json');
    }
  }

  // Filtrer les doublons par permalink complet ET par code unique Instagram (/p/CODE ou /reel/CODE)
  const existingCodes = new Set();
  const existingLinks = new Set();
  currentItems.forEach(it => {
    if (it.link) {
      existingLinks.add(it.link.replace(/\/$/, '').toLowerCase());
      const codeMatch = it.link.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
      if (codeMatch) existingCodes.add(codeMatch[1]);
    }
  });

  const filteredNew = newItems.filter(item => {
    if (!item.link) return false;
    const cleanLink = item.link.replace(/\/$/, '').toLowerCase();
    const codeMatch = item.link.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    const code = codeMatch ? codeMatch[1] : null;

    if (existingLinks.has(cleanLink)) return false;
    if (code && existingCodes.has(code)) return false;
    return true;
  });

  if (filteredNew.length === 0) {
    console.log('✨ Toutes les publications Instagram sont déjà intégrées à la galerie.');
    return { added: 0, total: currentItems.length };
  }

  console.log(`✨ Ajout de ${filteredNew.length} nouvelle(s) publication(s) Instagram à la galerie !`);

  // Extraire Book de stage Mons pour le garder en tout dernier
  const monsItem = currentItems.find(it => it.link && it.link.includes('Book-stage'));
  const otherItems = currentItems.filter(it => !it.link || !it.link.includes('Book-stage'));

  // Placer les nouveaux posts Instagram en haut (juste après DanElec si présent)
  const danelecIndex = otherItems.findIndex(it => it.link && it.link.includes('danelec.be'));
  let updatedList;
  if (danelecIndex >= 0) {
    const danelecItem = otherItems[danelecIndex];
    const rest = otherItems.filter((_, idx) => idx !== danelecIndex);
    updatedList = [danelecItem, ...filteredNew, ...rest];
  } else {
    updatedList = [...filteredNew, ...otherItems];
  }

  // Replacer Mons à la toute fin en format small
  if (monsItem) {
    updatedList.push(monsItem);
  }

  // Écrire data.json
  fs.writeFileSync(DATA_JSON_FILE, JSON.stringify(updatedList, null, 2), 'utf-8');

  // Écrire projects-data.js
  const jsContent = `/**
 * Portfolio Projects Data - Robin Wattier
 * Fichier synchronisé automatiquement via sync-instagram.js
 */

window.PORTFOLIO_ITEMS = ${JSON.stringify(updatedList, null, 2)};
`;
  fs.writeFileSync(PROJECTS_FILE, jsContent, 'utf-8');

  // Incrémenter le cache buster dans index.html pour rafraîchissement immédiat
  try {
    if (fs.existsSync(INDEX_HTML_FILE)) {
      let html = fs.readFileSync(INDEX_HTML_FILE, 'utf-8');
      const v = Date.now().toString().slice(-6);
      html = html.replace(/projects-data\.js\?v=\d+/g, `projects-data.js?v=${v}`);
      fs.writeFileSync(INDEX_HTML_FILE, html, 'utf-8');
    }
  } catch (e) {
    // Non bloquant
  }

  console.log('🎉 Galerie mise à jour avec succès dans data.json et projects-data.js !');
  return { added: filteredNew.length, total: updatedList.length };
}

// Fonction d'exécution principale de synchronisation
async function syncInstagram() {
  const config = loadConfig();
  console.log(`\n======================================================`);
  console.log(`📸 SYNCHRONISATION INSTAGRAM : @${config.username}`);
  console.log(`======================================================`);

  const { posts, chromePath } = await scrapeInstagramProfile(config.profileUrl);

  const convertedItems = [];
  for (const post of posts) {
    console.log(`🔍 Traitement de ${post.permalink}...`);
    const enriched = await enrichPostDetails(post, chromePath);
    const galleryItem = await downloadPostMedia(enriched);
    convertedItems.push(galleryItem);
  }

  const result = updateGalleryWithNewPosts(convertedItems);
  return {
    success: true,
    scraped: posts.length,
    ...result
  };
}

// Lancement en ligne de commande directe
if (require.main === module) {
  syncInstagram()
    .then(res => {
      console.log(`✅ Synchronisation terminée avec succès ! (${res.added} ajoutés, ${res.total} total)`);
      process.exit(0);
    })
    .catch(err => {
      console.error(`❌ Échec de synchronisation Instagram : ${err.message}`);
      process.exit(1);
    });
}

module.exports = {
  syncInstagram,
  scrapeInstagramProfile,
  downloadPostMedia,
  updateGalleryWithNewPosts
};
