/**
 * Instagram to Portfolio Auto-Sync Script - Robin Wattier
 * 
 * Ce script permet de synchroniser automatiquement votre compte Instagram
 * avec votre portfolio :
 * - Les carrousels sont convertis avec le défilement automatique au survol (style Mattel)
 * - Les vidéos/reels sont convertis avec lecture au survol
 * - Les photos simples sont intégrées dans la grille
 * 
 * Usage :
 * 1. Synchronisation automatique via API Instagram Graph :
 *    node sync-instagram.js
 * 
 * 2. Import direct d'un post via son URL :
 *    node sync-instagram.js https://www.instagram.com/p/SHORTCODE/
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_FILE = path.join(__dirname, 'instagram-config.json');
const PROJECTS_FILE = path.join(__dirname, 'projects-data.js');
const DATA_JSON_FILE = path.join(__dirname, 'data.json');
const MEDIA_DIR = path.join(__dirname, 'assets', 'projets', 'instagram');

// Charger la configuration
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {
      console.warn('⚠️ Erreur lecture instagram-config.json');
    }
  }
  return {
    accessToken: process.env.INSTAGRAM_ACCESS_TOKEN || '',
    userId: process.env.INSTAGRAM_USER_ID || 'me',
    autoDownloadMedia: true,
  };
}

// Téléchargement d'un fichier avec promesse
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const file = fs.createWriteStream(destPath);
    https.get(url, (response) => {
      // Gérer redirections
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
        file.close(resolve);
      });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

// Requête HTTPS JSON
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON: ${data.slice(0, 100)}`));
        }
      });
    }).on('error', reject);
  });
}

// Synchronisation depuis l'API Instagram Graph
async function syncFromApi(token) {
  console.log('🔄 Connexion à l\'API Instagram Graph...');
  const fields = 'id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,children{id,media_type,media_url,thumbnail_url}';
  const url = `https://graph.instagram.com/me/media?fields=${fields}&access_token=${token}`;

  const response = await fetchJson(url);
  if (!response.data || !Array.isArray(response.data)) {
    throw new Error(response.error ? response.error.message : 'Réponse API invalide');
  }

  console.log(`📸 ${response.data.length} publications récupérées depuis Instagram.`);
  return response.data;
}

// Import d'un post via oEmbed ou scraper public
async function importPostFromUrl(postUrl) {
  console.log(`🔗 Analyse du post Instagram : ${postUrl}`);
  const oembedUrl = `https://www.instagram.com/api/v1/oembed/?url=${encodeURIComponent(postUrl)}`;
  const data = await fetchJson(oembedUrl);

  const cleanTitle = (data.title || 'Instagram Post').replace(/\n/g, ' ').slice(0, 80);
  const mediaId = data.media_id || String(Date.now());
  const postDir = path.join(MEDIA_DIR, mediaId);

  // Télécharger la miniature
  let localThumb = `assets/projets/instagram/${mediaId}/thumbnail.jpg`;
  if (data.thumbnail_url) {
    const dest = path.join(postDir, 'thumbnail.jpg');
    console.log('⬇️ Téléchargement de la miniature...');
    await downloadFile(data.thumbnail_url, dest);
  }

  return {
    src: localThumb,
    fallbackSrc: localThumb,
    title: cleanTitle,
    type: 'image',
    link: postUrl,
    w: data.thumbnail_width || 1080,
    h: data.thumbnail_height || 1350,
  };
}

// Mise à jour des fichiers projects-data.js et data.json
function updateProjectFiles(newItems) {
  if (!newItems || newItems.length === 0) {
    console.log('✅ Aucun nouveau post à ajouter.');
    return;
  }

  // 1. Lire data.json actuel
  let currentItems = [];
  if (fs.existsSync(DATA_JSON_FILE)) {
    try {
      currentItems = JSON.parse(fs.readFileSync(DATA_JSON_FILE, 'utf-8'));
    } catch (e) {
      console.warn('Erreur lecture data.json');
    }
  }

  // Filtrer les doublons (par lien ou titre)
  const existingLinks = new Set(currentItems.map(item => item.link).filter(Boolean));
  const toAdd = newItems.filter(item => !existingLinks.has(item.link));

  if (toAdd.length === 0) {
    console.log('✨ Tous les posts Instagram sont déjà présents dans la galerie !');
    return;
  }

  console.log(`➕ Ajout de ${toAdd.length} nouveau(x) projet(s) en tête de galerie.`);
  const updatedItems = [...toAdd, ...currentItems];

  // 2. Écrire data.json
  fs.writeFileSync(DATA_JSON_FILE, JSON.stringify(updatedItems, null, 2), 'utf-8');

  // 3. Écrire projects-data.js
  const jsContent = `/**
 * Portfolio Projects Data - Robin Wattier
 * Fichier mis à jour automatiquement via sync-instagram.js
 */

window.PORTFOLIO_ITEMS = ${JSON.stringify(updatedItems, null, 2)};
`;
  fs.writeFileSync(PROJECTS_FILE, jsContent, 'utf-8');
  console.log('🎉 Galerie mise à jour avec succès dans projects-data.js et data.json !');
}

// Fonction principale
async function main() {
  const args = process.argv.slice(2);
  const targetUrl = args[0];

  try {
    if (targetUrl && targetUrl.startsWith('http')) {
      // Import manuel d'un post précis
      const item = await importPostFromUrl(targetUrl);
      updateProjectFiles([item]);
    } else {
      // Sync globale
      const config = loadConfig();
      if (!config.accessToken) {
        console.log(`
ℹ️  CONFIGURATION DE LA SYNCHRONISATION AUTOMATIQUE INSTAGRAM :
------------------------------------------------------------------
Pour synchroniser automatiquement vos futurs posts Instagram :
1. Créez un token Instagram permanent dans instagram-config.json :
   {
     "accessToken": "VOTRE_TOKEN_INSTAGRAM_GRAPH_API"
   }
2. Ou importez directement n'importe quel post Instagram par son lien :
   node sync-instagram.js https://www.instagram.com/p/VOTRE_POST/
------------------------------------------------------------------
`);
        return;
      }

      const posts = await syncFromApi(config.accessToken);
      const convertedItems = [];

      for (const p of posts) {
        const postDir = path.join(MEDIA_DIR, p.id);
        const caption = (p.caption || 'Création').split('\n')[0].slice(0, 80);

        if (p.media_type === 'CAROUSEL_ALBUM' && p.children && p.children.data) {
          // Carrousel Matchbox
          const slides = [];
          for (let i = 0; i < p.children.data.length; i++) {
            const child = p.children.data[i];
            const slideRelPath = `assets/projets/instagram/${p.id}/slide_${i + 1}.jpg`;
            const dest = path.join(postDir, `slide_${i + 1}.jpg`);
            if (!fs.existsSync(dest) && child.media_url) {
              console.log(`⬇️ Téléchargement carrousel slide ${i + 1}/${p.children.data.length}...`);
              await downloadFile(child.media_url, dest);
            }
            slides.push(slideRelPath);
          }

          convertedItems.push({
            src: slides[0],
            fallbackSrc: slides[0],
            title: caption,
            type: 'carousel',
            featured: true,
            hasBadge: true,
            link: p.permalink,
            w: 1080,
            h: 1350,
            slides: slides,
            poster: slides[0]
          });
        } else if (p.media_type === 'VIDEO') {
          // Vidéo / Reel avec lecture au survol
          const videoRelPath = `assets/projets/instagram/${p.id}/video.mp4`;
          const posterRelPath = `assets/projets/instagram/${p.id}/poster.jpg`;
          const videoDest = path.join(postDir, 'video.mp4');
          const posterDest = path.join(postDir, 'poster.jpg');

          if (!fs.existsSync(videoDest) && p.media_url) {
            console.log(`⬇️ Téléchargement vidéo ${p.id}...`);
            await downloadFile(p.media_url, videoDest);
          }
          if (!fs.existsSync(posterDest) && p.thumbnail_url) {
            await downloadFile(p.thumbnail_url, posterDest);
          }

          convertedItems.push({
            src: videoRelPath,
            fallbackSrc: videoRelPath,
            title: caption,
            type: 'video',
            featured: true,
            hasBadge: true,
            link: p.permalink,
            w: 720,
            h: 1280,
            poster: fs.existsSync(posterDest) ? posterRelPath : videoRelPath
          });
        } else {
          // Photo simple
          const imgRelPath = `assets/projets/instagram/${p.id}/image.jpg`;
          const imgDest = path.join(postDir, 'image.jpg');
          if (!fs.existsSync(imgDest) && p.media_url) {
            console.log(`⬇️ Téléchargement image ${p.id}...`);
            await downloadFile(p.media_url, imgDest);
          }

          convertedItems.push({
            src: imgRelPath,
            fallbackSrc: imgRelPath,
            title: caption,
            type: 'image',
            link: p.permalink,
            w: 1080,
            h: 1080
          });
        }
      }

      updateProjectFiles(convertedItems);
    }
  } catch (err) {
    console.error('❌ Erreur de synchronisation Instagram :', err.message);
  }
}

if (require.main === module) {
  main();
}

module.exports = { syncFromApi, importPostFromUrl, updateProjectFiles };
