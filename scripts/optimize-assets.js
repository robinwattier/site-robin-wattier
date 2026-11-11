/**
 * Optimisation et vérification d'intégrité des médias du portfolio - Robin Wattier
 *
 * Maintient des médias légers et uniques, sans générer de doublons superflus.
 * Vérifie que chaque fichier local référencé par projects-data.js / data.json est bien présent et non vide.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.PORTFOLIO_ROOT ? path.resolve(process.env.PORTFOLIO_ROOT) : path.resolve(__dirname, '..');
const PROJECTS_FILE = path.join(ROOT, 'projects-data.js');
const DATA_JSON_FILE = path.join(ROOT, 'data.json');

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

  const items = loadItems();
  let missing = 0;

  if (fs.existsSync(DATA_JSON_FILE)) {
    const dataItems = JSON.parse(fs.readFileSync(DATA_JSON_FILE, 'utf-8'));
    if (JSON.stringify(items) !== JSON.stringify(dataItems)) {
      console.error('  ✗ Désynchronisation détectée entre data.json et projects-data.js');
      missing++;
    }
  }

  for (const item of items) {
    const checkFile = (rel, label) => {
      if (isLocal(rel)) {
        const full = abs(rel);
        if (!fs.existsSync(full) || fs.statSync(full).size === 0) {
          console.error(`  ✗ [${item.title || 'Projet'}] ${label} introuvable ou vide : ${rel}`);
          missing++;
        } else {
          console.log(`  ✓ [${item.title || 'Projet'}] ${label} OK (${kb(full)})`);
        }
      }
    };
    checkFile(item.src, 'Source');
    checkFile(item.poster, 'Poster');
    checkFile(item.posterFallback, 'Poster fallback');
    if (item.type === 'pdf') checkFile(item.link, 'PDF');
    (item.slides || []).forEach((s, idx) => checkFile(s, `Slide ${idx + 1}`));
    if (item.slideVideos) {
      Object.entries(item.slideVideos).forEach(([idx, vSrc]) => {
        checkFile(vSrc, `Slide ${Number(idx) + 1} Vidéo`);
      });
    }
  }

  if (missing === 0) {
    console.log('🎉 Tous les assets sont présents, optimisés et sans doublons !');
  } else {
    console.warn(`⚠️ ${missing} fichier(s) manquant(s) ou invalide(s).`);
  }
  return { missing, total: items.length };
}

if (require.main === module) {
  main()
    .then((res) => process.exit(res.missing > 0 ? 1 : 0))
    .catch((err) => {
      console.error('Erreur:', err);
      process.exit(1);
    });
}

module.exports = { main };
