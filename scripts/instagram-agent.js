/**
 * Agent Instagram -> Content (executeur planifie) - Robin Wattier
 *
 * Un passage = detecter les nouveaux posts Instagram, les integrer a la section "Content",
 * puis publier le resultat (commit + push -> le workflow GitHub Pages redeploie le site).
 *
 *   node scripts/instagram-agent.js              passage complet (pull, sync, commit, push)
 *   node scripts/instagram-agent.js --dry-run    detecte et classe seulement (aucune ecriture)
 *   node scripts/instagram-agent.js --no-push    integre et commit en local sans push
 *   node scripts/instagram-agent.js --no-git     integre seulement (pas de pull/commit/push)
 *
 * Journal : instagram-agent.log (ignore par git). Code de sortie 0 = OK, 1 = echec (visible dans le planificateur).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(ROOT, 'instagram-agent.log');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const NO_GIT = args.has('--no-git') || DRY;
const NO_PUSH = args.has('--no-push');

// Fichiers modifies par une synchronisation (seuls ceux-la sont commites)
const SYNC_PATHS = ['data.json', 'projects-data.js', 'index.html', 'instagram-config.json', 'assets/projets/instagram'];

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    // Rotation simple : on repart a zero au-dela de 512 Ko
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 512 * 1024) fs.writeFileSync(LOG_FILE, '');
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (_) { /* journal non bloquant */ }
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function main() {
  log(`=== Passage de l'agent Instagram${DRY ? ' (simulation)' : ''} ===`);

  if (!NO_GIT) {
    const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
    if (branch !== 'main') throw new Error(`Branche courante "${branch}" : l'agent ne publie que depuis "main".`);
    try {
      git('pull', '--rebase', '--autostash');
      log('git pull --rebase : OK');
    } catch (e) {
      throw new Error(`git pull --rebase impossible : ${(e.stderr || e.message).toString().trim()}`);
    }
  }

  const { syncInstagram } = require('../sync-instagram.js');
  const result = await syncInstagram({ dryRun: DRY });

  if (DRY) {
    log(`Simulation : ${result.detected.length} post(s) à importer : ${result.detected.map((d) => `${d.code}[${d.type}]`).join(', ') || 'aucun'}`);
    return result.failed && result.failed.length ? 1 : 0;
  }

  const added = result.addedItems || [];
  if (result.failed && result.failed.length) {
    log(`⚠️ Posts en échec (réessayés au prochain passage) : ${result.failed.map((f) => `${f.code} (${f.error})`).join('; ')}`);
  }

  if (added.length === 0) {
    log(`Aucun nouveau post à publier (${result.scraped} analysés).`);
  } else {
    log(`Ajouté à "Content" : ${added.map((a) => `${a.code} [${a.type === 'video' ? 'Reel' : a.type === 'carousel' ? 'Carrousel' : 'Photo'}] "${a.title}"`).join(' | ')}`);
  }

  if (!NO_GIT) {
    const status = git('status', '--porcelain', '--', ...SYNC_PATHS);
    if (status) {
      const names = added.map((a) => a.code);
      const msg = added.length
        ? `feat(content): ajout automatique de ${added.length} publication(s) Instagram (${names.join(', ')})`
        : 'chore(content): mise à jour automatique de la configuration Instagram';
      git('add', '--', ...SYNC_PATHS);
      git('commit', '-m', msg, '--', ...SYNC_PATHS);
      log(`Commit créé : ${msg}`);
      if (!NO_PUSH) {
        try {
          git('push', 'origin', 'main');
        } catch (e) {
          log('Push refusé, nouvelle tentative après rebase...');
          git('pull', '--rebase', '--autostash');
          git('push', 'origin', 'main');
        }
        log('git push : OK (le déploiement GitHub Pages démarre automatiquement)');
      }
    } else {
      log('Aucun changement à commiter.');
    }
  }

  return result.failed && result.failed.length ? 1 : 0;
}

main()
  .then((code) => {
    log(`=== Fin du passage (code ${code}) ===`);
    process.exit(code);
  })
  .catch((err) => {
    log(`❌ ÉCHEC : ${err.message}`);
    process.exit(1);
  });
