/**
 * Optimisation des médias du portfolio - Robin Wattier
 *
 * Génère, à côté de chaque média d'origine (qui n'est JAMAIS modifié), des
 * variantes ultra légères que le front charge en priorité (script.js) :
 *
 *   Images  : <nom>.w480.webp  <nom>.w800.webp  <nom>.w1200.webp
 *             -> grille (srcset 480w / 800w) et lightbox (1200w)
 *   Vidéos  : <nom>.preview.mp4  (≤ 480 px, ≤ 10 s, sans son : survol de la grille)
 *             <nom>.web.mp4      (≤ 1280 px, H.264 crf 26 : lightbox, vidéos « video »)
 *   Statique: logos « Trusted by » .png -> .webp, avatar de profil 248/372 px
 *
 * Le front retombe automatiquement sur l'original si une variante est absente.
 *
 * Utilisation :
 *   npm run optimize            (ne traite que ce qui est nouveau / modifié)
 *   npm run optimize -- --force (régénère tout)
 *
 * Les dépendances (sharp, ffmpeg-static) sont des devDependencies : elles ne
 * sont utiles qu'en local, jamais en production (site statique).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFile } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PROJECTS_FILE = path.join(ROOT, 'projects-data.js');

const IMG_EXT_RE = /\.(jpe?g|png|webp)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)$/i;
const IMG_WIDTHS = [480, 800, 1200];
const WEBP_QUALITY = 76;

const isLocal = (p) => typeof p === 'string' && p && !/^(https?:)?\/\//i.test(p) && !p.startsWith('data:');
const abs = (rel) => path.join(ROOT, ...rel.split('/'));

function loadItems() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(PROJECTS_FILE, 'utf-8'), sandbox);
  return Array.isArray(sandbox.window.PORTFOLIO_ITEMS) ? sandbox.window.PORTFOLIO_ITEMS : [];
}

// A jour = la sortie existe et est plus récente que la source
function isFresh(src, out, force) {
  if (force || !fs.existsSync(out)) return false;
  return fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs;
}

function kb(file) {
  return `${(fs.statSync(file).size / 1024).toFixed(0)} Ko`;
}

function collectMedia(items) {
  const images = new Set();
  const videos = new Map(); // chemin relatif -> { web: bool }

  const addImage = (p) => {
    if (isLocal(p) && IMG_EXT_RE.test(p) && !/\.w\d+\.webp$/i.test(p) && fs.existsSync(abs(p))) images.add(p);
  };

  for (const item of items) {
    (item.slides || []).forEach(addImage);
    addImage(item.poster);
    addImage(item.posterFallback);
    // Image affichée dans la lightbox (pdf, post simple…) ou miniature de carte
    if (!VIDEO_EXT_RE.test(item.src || '')) addImage(item.src);

    const videoPath = item.video && VIDEO_EXT_RE.test(item.video) ? item.video : item.src;
    if (isLocal(videoPath) && VIDEO_EXT_RE.test(videoPath) && fs.existsSync(abs(videoPath))) {
      const prev = videos.get(videoPath) || { web: false };
      prev.web = prev.web || item.type === 'video';
      videos.set(videoPath, prev);
    }
  }
  return { images: [...images], videos };
}

async function optimizeImages(sharp, images, { force, log }) {
  let made = 0;
  for (const rel of images) {
    const src = abs(rel);
    const base = src.replace(IMG_EXT_RE, '');
    let meta;
    try {
      meta = await sharp(src).metadata();
    } catch (e) {
      log(`  ! image illisible ${rel} : ${e.message}`);
      continue;
    }
    const srcWidth = meta.width || 1200;

    for (const w of IMG_WIDTHS) {
      const out = `${base}.w${w}.webp`;
      if (isFresh(src, out, force)) continue;
      await sharp(src)
        .rotate()
        .resize({ width: Math.min(w, srcWidth), withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 5, smartSubsample: true })
        .toFile(out);
      made++;
    }
    const sample = `${base}.w800.webp`;
    log(`  ✓ ${rel}  ${kb(src)} -> w800 ${kb(sample)}`);
  }
  return made;
}

function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 20 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve();
    });
  });
}

async function optimizeVideos(ffmpeg, videos, { force, log }) {
  let made = 0;
  for (const [rel, { web }] of videos) {
    const src = abs(rel);
    const base = src.replace(VIDEO_EXT_RE, '');

    const preview = `${base}.preview.mp4`;
    if (!isFresh(src, preview, force)) {
      log(`  … aperçu ${rel}`);
      await runFfmpeg(ffmpeg, [
        '-i', src, '-t', '10', '-an',
        '-vf', "scale='min(480,iw)':-2:flags=lanczos,fps='min(30,source_fps)'",
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '31', '-profile:v', 'main',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', preview,
      ]);
      made++;
    }
    log(`  ✓ aperçu ${rel}  ${kb(src)} -> ${kb(preview)}`);

    if (web) {
      const out = `${base}.web.mp4`;
      if (!isFresh(src, out, force)) {
        log(`  … version web ${rel}`);
        const srcSize = fs.statSync(src).size;
        let ok = false;
        // Échelle de qualité : on ne garde le premier résultat que s'il est nettement
        // plus léger que l'original (≤ 90 %) et raisonnable pour du streaming (≤ 15 Mo).
        for (const crf of [28, 32]) {
          await runFfmpeg(ffmpeg, [
            '-i', src,
            '-vf', "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:flags=lanczos,fps='min(30,source_fps)'",
            '-c:v', 'libx264', '-preset', 'medium', '-crf', String(crf), '-profile:v', 'high', '-pix_fmt', 'yuv420p',
            '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out,
          ]);
          const size = fs.statSync(out).size;
          if (size <= srcSize * 0.9 && size <= 20 * 1024 * 1024) { ok = true; break; }
          if (crf === 32 && size <= srcSize * 0.9) ok = true;
        }
        if (!ok) {
          // Déjà bien compressé : on réutilise l'original tel quel (évite un 404 + perte de qualité)
          fs.copyFileSync(src, out);
        }
        made++;
      }
      log(`  ✓ web    ${rel}  ${kb(src)} -> ${kb(out)}`);
    }
  }
  return made;
}

// Logos « Trusted by » et avatar : assets statiques référencés par index.html
async function optimizeStatic(sharp, { force, log }) {
  let made = 0;

  const trustedDir = path.join(ROOT, 'assets', 'trusted');
  if (fs.existsSync(trustedDir)) {
    for (const name of fs.readdirSync(trustedDir).filter((n) => /\.png$/i.test(n))) {
      const src = path.join(trustedDir, name);
      const out = src.replace(/\.png$/i, '.webp');
      if (isFresh(src, out, force)) continue;
      const meta = await sharp(src).metadata();
      // Les logos s'affichent à ~40 px de haut : 2x suffit largement, on garde l'alpha
      await sharp(src)
        .resize({ width: Math.min(meta.width || 400, 400), withoutEnlargement: true })
        .webp({ quality: 88, alphaQuality: 92, effort: 5 })
        .toFile(out);
      log(`  ✓ trusted/${name}  ${kb(src)} -> ${kb(out)}`);
      made++;
    }
  }

  const avatar = path.join(ROOT, 'assets', 'robin-wattier-profile.jpg');
  if (fs.existsSync(avatar)) {
    for (const size of [248, 372]) {
      const out = path.join(ROOT, 'assets', `robin-wattier-profile-${size}.webp`);
      if (isFresh(avatar, out, force)) continue;
      await sharp(avatar).rotate().resize(size, size, { fit: 'cover' }).webp({ quality: 82, effort: 6 }).toFile(out);
      log(`  ✓ profil ${size}px  ${kb(out)}`);
      made++;
    }
  }
  return made;
}

async function run({ force = false, quiet = false, skipVideos = false } = {}) {
  const log = quiet ? () => {} : (m) => console.log(m);
  const opts = { force, log };

  let sharp;
  try {
    sharp = require('sharp');
  } catch (e) {
    log('⚠️ "sharp" introuvable : exécuter `npm install` pour activer l\'optimisation des médias.');
    return { images: 0, videos: 0, skipped: true };
  }

  const items = loadItems();
  const { images, videos } = collectMedia(items);

  log(`🖼️  Images (${images.length})`);
  const imgMade = await optimizeImages(sharp, images, opts);
  const staticMade = await optimizeStatic(sharp, opts);

  let vidMade = 0;
  if (!skipVideos) {
    let ffmpeg = null;
    try {
      ffmpeg = require('ffmpeg-static');
    } catch (e) { /* optionnel */ }
    if (ffmpeg && fs.existsSync(ffmpeg)) {
      log(`🎬 Vidéos (${videos.size})`);
      vidMade = await optimizeVideos(ffmpeg, videos, opts);
    } else {
      log('⚠️ "ffmpeg-static" indisponible : vidéos non optimisées (node node_modules/ffmpeg-static/install.js).');
    }
  }

  log(`✅ Optimisation terminée (${imgMade + staticMade} image(s), ${vidMade} vidéo(s) générées)`);
  return { images: imgMade + staticMade, videos: vidMade, skipped: false };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  run({ force: args.includes('--force'), skipVideos: args.includes('--no-video') })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`❌ Échec de l'optimisation : ${err.message}`);
      process.exit(1);
    });
}

module.exports = { run };
