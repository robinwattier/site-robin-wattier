/**
 * Instagram to Portfolio Auto-Sync & Scraper - Robin Wattier
 * 
 * Scraper autonome et résilient pour Instagram (https://www.instagram.com/robinwattier/)
 * - Filtrage strict : N'importe AUCUN post existant (baseline). Uniquement les futurs posts publiés après la mise en place.
 * - Tri automatique : Détection intelligente Carrousel vs Reel / Vidéo vs Image.
 * - Capture automatique des médias haute résolution (vidéos MP4, slides carrousels, posters WebP/JPG).
 * - Injection directe dans la section "Content" (data.json & projects-data.js) avec cache buster index.html.
 * - Maintien des projets épinglés (DanElec en haut, Book de stage Mons en bas).
 * - Support exécution CLI, planificateur d'arrière-plan, et endpoints API (/api/instagram/sync).
 *
 * Utilisation CLI :
 * 1. Synchronisation automatique (futurs posts uniquement) : node sync-instagram.js
 * 2. Réinitialiser / capturer la baseline actuelle : node sync-instagram.js --snapshot-baseline
 * 3. Importer manuellement un post spécifique : node sync-instagram.js https://www.instagram.com/p/CODE/
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile, execSync } = require('child_process');

const CONFIG_FILE = path.join(__dirname, 'instagram-config.json');
const PROJECTS_FILE = path.join(__dirname, 'projects-data.js');
const DATA_JSON_FILE = path.join(__dirname, 'data.json');
const INDEX_HTML_FILE = path.join(__dirname, 'index.html');
const MEDIA_DIR = path.join(__dirname, 'assets', 'projets', 'instagram');

// Charger la configuration avec baseline et filtres
function loadConfig() {
  const defaults = {
    username: 'robinwattier',
    profileUrl: 'https://www.instagram.com/robinwattier/',
    autoSyncIntervalMinutes: 60,
    downloadMedia: true,
    excludeStories: true,
    baselineDate: '2026-10-21T17:04:22+02:00',
    baselineCodes: [
      'DersLAZIAVN',
      'DehXUZxgjKY',
      'DZF7ROvCp-T',
      'DV32A1nAakB',
      'DU6MhcLjOpu',
      'DT0wr-7DHih',
      'DQH7JufjL0z',
      'DG1QqXdhuFFm9_SXJsA0-7svDqYJUa83XG0mwI0',
      'C6TqEWBKVPh'
    ],
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

// Sauvegarder la configuration
function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8');
  } catch (e) {
    console.warn('⚠️ Erreur écriture instagram-config.json :', e.message);
  }
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

// Dump du DOM via Chrome headless avec arguments optimisés
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
      '--dump-dom',
      url
    ];

    execFile(chromePath, args, { maxBuffer: 50 * 1024 * 1024, timeout: timeoutMs }, (err, stdout) => {
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,video/mp4,video/*,*/*;q=0.8',
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

// Scraper les publications du profil public Instagram
async function scrapeInstagramProfile(profileUrl) {
  const chromePath = findChromePath();
  if (!chromePath) {
    throw new Error('Google Chrome introuvable pour exécuter le scraper.');
  }

  console.log(`🚀 Analyse du profil public Instagram via Chrome headless (${profileUrl})...`);
  const html = await dumpPageDom(profileUrl, chromePath);
  console.log(`📄 Page profil chargée (${(html.length / 1024).toFixed(1)} Ko). Extraction des posts...`);

  // Extraire les liens des posts (ex: /robinwattier/p/CODE/ ou https://www.instagram.com/reel/CODE/)
  const linkRegex = /<a[^>]+href="((?:https?:\/\/[^"/]+)?\/(?:[A-Za-z0-9_.]+\/)?(?:p|reel)\/([A-Za-z0-9_-]+)\/?(?:\?[^"]*)?)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  const discoveredPosts = [];
  const seenCodes = new Set();

  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    const code = match[2];
    if (seenCodes.has(code)) continue;
    seenCodes.add(code);

    if (!href.startsWith('http')) {
      href = `https://www.instagram.com${href.startsWith('/') ? '' : '/'}${href}`;
    }

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

    // Tri automatique : Carrousel vs Reel / Vidéo vs Image
    const isReel = href.includes('/reel/') || innerHtml.includes('Clip') || innerHtml.includes('Reel') || innerHtml.includes('Vidéo');
    const isCarousel = innerHtml.includes('Carrousel') || innerHtml.includes('Carousel') || innerHtml.includes('Diapositive');

    discoveredPosts.push({
      code,
      type: isReel ? 'video' : (isCarousel ? 'carousel' : 'image'),
      permalink: href.split('?')[0].replace(/\/$/, '') + '/',
      imgSrc,
      alt,
      w,
      h
    });
  }

  // Fallback si la structure des balises <a> a varié
  if (discoveredPosts.length === 0) {
    const fallbackRegex = /(?:\/p\/|\/reel\/)([A-Za-z0-9_-]{11})/g;
    let fbMatch;
    while ((fbMatch = fallbackRegex.exec(html)) !== null) {
      const code = fbMatch[1];
      if (seenCodes.has(code)) continue;
      seenCodes.add(code);
      const isReel = html.includes(`/reel/${code}`);
      discoveredPosts.push({
        code,
        type: isReel ? 'video' : 'carousel',
        permalink: `https://www.instagram.com/${isReel ? 'reel' : 'p'}/${code}/`,
        imgSrc: null,
        alt: '',
        w: 1080,
        h: 1080
      });
    }
  }

  console.log(`🎯 ${discoveredPosts.length} publication(s) trouvée(s) sur le profil public.`);
  return { posts: discoveredPosts, chromePath };
}

// Enrichir un nouveau post individuel (slides de carrousel ou flux vidéo mp4)
async function enrichPostDetails(post, chromePath) {
  try {
    console.log(`🔎 Analyse détaillée de ${post.permalink}...`);
    const postHtml = await dumpPageDom(post.permalink, chromePath);

    // Extraction de la légende / og:title
    const ogTitleMatch = postHtml.match(/<meta property="og:title" content="([^"]*)"/i);
    const ogDescMatch = postHtml.match(/<meta property="og:description" content="([^"]*)"/i);
    const rawCaption = (ogTitleMatch ? ogTitleMatch[1] : '') || (ogDescMatch ? ogDescMatch[1] : '') || post.alt;
    post.title = cleanInstagramCaption(rawCaption);

    // Si vidéo / reel : extraction du flux vidéo MP4 direct
    if (post.type === 'video') {
      const ogVideoMatch = postHtml.match(/<meta property="og:video"[^>]*content="([^"]*)"/i);
      const ogVideoSecMatch = postHtml.match(/<meta property="og:video:secure_url"[^>]*content="([^"]*)"/i);
      const videoTagMatch = postHtml.match(/<video[^>]+src="([^">]+)"/i);
      const mp4Matches = (postHtml.match(/https:\/\/[^"'\s\\]+\.mp4[^"'\s\\]*/gi) || [])
        .map(u => u.replace(/&amp;/g, '&'));

      post.videoUrl = (ogVideoMatch ? ogVideoMatch[1].replace(/&amp;/g, '&') : null)
        || (ogVideoSecMatch ? ogVideoSecMatch[1].replace(/&amp;/g, '&') : null)
        || (videoTagMatch ? videoTagMatch[1].replace(/&amp;/g, '&') : null)
        || (mp4Matches.length > 0 ? mp4Matches[0] : null);

      if (post.videoUrl) {
        console.log(`🎬 [${post.code}] Flux vidéo MP4 détecté avec succès.`);
      }
    }

    // Si carrousel : extraire toutes les diapositives
    if (post.type === 'carousel') {
      const imgRegex = /https:\/\/[^"'\s\\]+\.(?:jpg|webp)[^"'\s\\]*/gi;
      const allUrls = (postHtml.match(imgRegex) || [])
        .map(u => u.replace(/&amp;/g, '&'))
        .filter(u => (u.includes('scontent') || u.includes('fbcdn.net')) && !u.includes('s150x150') && !u.includes('profile_pic'));

      // Dédoublonnage par clé d'image
      const uniqueSlideUrls = Array.from(new Set(allUrls));
      if (uniqueSlideUrls.length > 1) {
        post.slideUrls = uniqueSlideUrls.slice(0, 10);
        console.log(`📸 [${post.code}] ${post.slideUrls.length} diapositives trouvées pour le carrousel.`);
      }
    }
  } catch (err) {
    console.warn(`⚠️ Erreur enrichissement du post ${post.code} : ${err.message}`);
    post.title = cleanInstagramCaption(post.alt);
  }

  return post;
}

// Téléchargement et structuration des médias locaux pour la section Content
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

  // Traitement CARROUSEL : Téléchargement de chaque slide
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

  // Traitement REEL / VIDÉO : Télécharger poster et vidéo MP4
  if (post.type === 'video') {
    const posterRel = `assets/projets/instagram/${post.code}/poster.jpg`;
    const posterDest = path.join(postDir, 'poster.jpg');

    if (!fs.existsSync(posterDest) && post.imgSrc) {
      try {
        console.log(`⬇️ [${post.code}] Téléchargement miniature poster vidéo...`);
        await downloadFile(post.imgSrc, posterDest);
      } catch (e) {
        console.warn(`⚠️ Échec téléchargement poster : ${e.message}`);
      }
    }

    let videoRel = null;
    if (post.videoUrl) {
      const videoDest = path.join(postDir, 'video.mp4');
      if (!fs.existsSync(videoDest)) {
        try {
          console.log(`⬇️ [${post.code}] Téléchargement flux vidéo MP4...`);
          await downloadFile(post.videoUrl, videoDest);
        } catch (e) {
          console.warn(`⚠️ Échec téléchargement vidéo MP4 : ${e.message}`);
        }
      }
      if (fs.existsSync(videoDest)) {
        videoRel = `assets/projets/instagram/${post.code}/video.mp4`;
      }
    }

    const finalPoster = fs.existsSync(posterDest) ? posterRel : post.imgSrc;
    item.poster = finalPoster;
    item.fallbackSrc = finalPoster;
    if (videoRel) {
      item.src = videoRel;
      item.video = videoRel;
    } else {
      item.src = finalPoster;
    }

    return item;
  }

  // Traitement IMAGE SIMPLE
  const imgRel = `assets/projets/instagram/${post.code}/image.jpg`;
  const imgDest = path.join(postDir, 'image.jpg');

  if (!fs.existsSync(imgDest) && post.imgSrc) {
    try {
      console.log(`⬇️ [${post.code}] Téléchargement image...`);
      await downloadFile(post.imgSrc, imgDest);
    } catch (e) {
      console.warn(`⚠️ Échec téléchargement image : ${e.message}`);
    }
  }

  const finalSrc = fs.existsSync(imgDest) ? imgRel : post.imgSrc;
  item.src = finalSrc;
  item.fallbackSrc = finalSrc;
  return item;
}

// Mise à jour de data.json et projects-data.js
function updateGalleryWithNewPosts(newItems) {
  let currentItems = [];
  if (fs.existsSync(DATA_JSON_FILE)) {
    try {
      currentItems = JSON.parse(fs.readFileSync(DATA_JSON_FILE, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ Erreur lecture data.json');
    }
  }

  if (!newItems || newItems.length === 0) {
    return { added: 0, total: currentItems.length };
  }

  console.log(`✨ Ajout de ${newItems.length} nouvelle(s) publication(s) Instagram à la section Content !`);

  // Préserver DanElec en haut et Book de stage Mons en tout dernier
  const monsItem = currentItems.find(it => it.link && it.link.includes('Book-stage'));
  const otherItems = currentItems.filter(it => !it.link || !it.link.includes('Book-stage'));

  const danelecIndex = otherItems.findIndex(it => it.link && it.link.includes('danelec.be'));
  let updatedList;
  if (danelecIndex >= 0) {
    const danelecItem = otherItems[danelecIndex];
    const rest = otherItems.filter((_, idx) => idx !== danelecIndex);
    updatedList = [danelecItem, ...newItems, ...rest];
  } else {
    updatedList = [...newItems, ...otherItems];
  }

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

  // Incrémenter le cache buster dans index.html
  try {
    if (fs.existsSync(INDEX_HTML_FILE)) {
      let html = fs.readFileSync(INDEX_HTML_FILE, 'utf-8');
      const v = Date.now().toString().slice(-6);
      html = html.replace(/projects-data\.js\?v=\d+/g, `projects-data.js?v=${v}`);
      fs.writeFileSync(INDEX_HTML_FILE, html, 'utf-8');
    }
  } catch (e) {}

  // Lancer l'optimisation légère (WebP / aperçus MP4) si disponible
  try {
    const optScript = path.join(__dirname, 'scripts', 'optimize-assets.js');
    if (fs.existsSync(optScript)) {
      console.log('⚡ Optimisation des nouveaux médias via scripts/optimize-assets.js...');
      execSync(`node "${optScript}"`, { stdio: 'ignore', timeout: 30000 });
    }
  } catch (e) {
    // Non bloquant
  }

  console.log('🎉 Section Content mise à jour avec succès dans data.json et projects-data.js !');
  return { added: newItems.length, total: updatedList.length };
}

// Fonction d'exécution principale de synchronisation
async function syncInstagram() {
  const config = loadConfig();
  console.log(`\n======================================================`);
  console.log(`📸 SYNCHRONISATION INSTAGRAM : @${config.username}`);
  console.log(`🔒 Règle de filtrage : Uniquement les posts après le ${config.baselineDate || 'setup'}`);
  console.log(`======================================================`);

  const { posts, chromePath } = await scrapeInstagramProfile(config.profileUrl);

  // Charger les codes déjà existants dans la galerie actuelle
  let currentItems = [];
  if (fs.existsSync(DATA_JSON_FILE)) {
    try {
      currentItems = JSON.parse(fs.readFileSync(DATA_JSON_FILE, 'utf-8'));
    } catch (_) {}
  }

  const existingCodes = new Set();
  currentItems.forEach(it => {
    if (it.link) {
      const m = it.link.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
      if (m) existingCodes.add(m[1]);
    }
  });

  const baselineCodes = new Set(config.baselineCodes || []);
  const excludedCodes = new Set(config.excludedCodes || []);

  // Filtrage STRICT : N'importe aucun post déjà existant au moment de l'installation
  const trulyNewPosts = posts.filter(post => {
    if (baselineCodes.has(post.code)) {
      console.log(`⏭️ [Filtrage] Post existant ${post.code} (${post.type}) ignoré conformément à la règle baseline.`);
      return false;
    }
    if (existingCodes.has(post.code)) {
      console.log(`⏭️ [Filtrage] Post ${post.code} déjà présent dans data.json, ignoré.`);
      return false;
    }
    if (excludedCodes.has(post.code)) {
      console.log(`⏭️ [Filtrage] Post ${post.code} exclu par configuration.`);
      return false;
    }
    return true;
  });

  if (trulyNewPosts.length === 0) {
    console.log(`\n✨ Aucune nouvelle publication Instagram après la date d'installation.`);
    console.log(`🔒 Tous les ${posts.length} posts existants ont été vérifiés et protégés contre toute réimportation.`);
    return {
      success: true,
      scraped: posts.length,
      added: 0,
      total: currentItems.length,
      message: 'Aucun nouveau post publié depuis la mise en place.'
    };
  }

  console.log(`\n🆕 ${trulyNewPosts.length} NOUVEAU(X) post(s) détecté(s) publié(s) après la mise en place !`);

  const convertedItems = [];
  for (const post of trulyNewPosts) {
    console.log(`⚙️ Traitement du nouveau post ${post.code} (type détecté : ${post.type})...`);
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

// Commande de capture instantanée de la baseline
async function snapshotBaseline() {
  const config = loadConfig();
  console.log(`📸 Prise de snapshot de la baseline pour @${config.username}...`);
  const { posts } = await scrapeInstagramProfile(config.profileUrl);
  const codes = posts.map(p => p.code);
  config.baselineCodes = Array.from(new Set([...(config.baselineCodes || []), ...codes]));
  config.baselineDate = new Date().toISOString();
  saveConfig(config);
  console.log(`✅ Baseline mise à jour avec succès : ${config.baselineCodes.length} posts enregistrés comme existants.`);
  return config;
}

// Exécution directe en ligne de commande
if (require.main === module) {
  const arg = process.argv[2];

  if (arg === '--snapshot-baseline' || arg === '--init-baseline') {
    snapshotBaseline()
      .then(() => process.exit(0))
      .catch(err => {
        console.error(`❌ Échec snapshot baseline : ${err.message}`);
        process.exit(1);
      });
  } else {
    syncInstagram()
      .then(res => {
        console.log(`\n✅ Terminé avec succès ! (${res.added} ajouté(s), ${res.total} total dans la galerie)`);
        process.exit(0);
      })
      .catch(err => {
        console.error(`\n❌ Échec synchronisation Instagram : ${err.message}`);
        process.exit(1);
      });
  }
}

module.exports = {
  syncInstagram,
  snapshotBaseline,
  scrapeInstagramProfile,
  enrichPostDetails,
  downloadPostMedia,
  updateGalleryWithNewPosts,
  loadConfig
};
