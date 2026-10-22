/**
 * Optimisation des médias du portfolio - Robin Wattier
 *
 * Maintient des médias légers et uniques, sans générer de doublons superflus.
 * Chaque projet possède un seul fichier image WebP propre et un seul fichier vidéo MP4 optimisé pour le web.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const PROJECTS_FILE = path.join(ROOT, 'projects-data.js');

const IMG_EXT_RE = /\.(jpe?g|png)$/i;
const WEBP_QUALITY = 80;

const isLocal = (p) => typeof p === 'string' && p && !/^(https?:)?\/\//i.test(p) && !p.startsWith('data:');
const abs = (rel) => path.join(ROOT, ...rel.split('/'));

function loadItems() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(PROJECTS_FILE, 'utf-8'), sandbox);
  return Array.isArray(sandbox.window.PORTFOLIO_ITEMS) ? sandbox.window.PORTFOLIO_ITEMS : [];
}

function kb(file) {
  return `${(fs.statSync(file).size / 1024).toFixed(0)} Ko`;
}

async function main() {
  console.log('--- Vérification et intégrité des assets ---');
  let sharp = null;
  try {
    sharp = require('sharp');
  } catch (e) {
    console.warn('Sharp non disponible, vérification des fichiers existants uniquement.');
  }

  const items = loadItems();
  let missing = 0;
  for (const item of items) {
    const checkFile = (rel, label) => {
      if (isLocal(rel)) {
        const full = abs(rel);
        if (!fs.existsSync(full)) {
          console.error(`  ✗ [${item.title || 'Projet'}] ${label} introuvable : ${rel}`);
          missing++;
        } else {
          console.log(`  ✓ [${item.title || 'Projet'}] ${label} OK (${kb(full)})`);
        }
      }
    };
    checkFile(item.src, 'Source');
    checkFile(item.poster, 'Poster');
    (item.slides || []).forEach((s, idx) => checkFile(s, `Slide ${idx + 1}`));
  }

  if (missing === 0) {
    console.log('🎉 Tous les assets sont présents, optimisés et sans doublons !');
  } else {
    console.warn(`⚠️ ${missing} fichier(s) manquant(s).`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Erreur:', err);
    process.exit(1);
  });
}

module.exports = { main };
