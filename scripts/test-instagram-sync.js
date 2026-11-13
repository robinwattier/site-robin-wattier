/**
 * Tests de l'agent Instagram -> Content (aucun acces reseau Instagram : DOM simule + serveur HTTP local).
 * Lancer : npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

// Racine isolee : rien du vrai portfolio n'est touche.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ig-agent-test-'));
process.env.PORTFOLIO_ROOT = TMP;
process.env.CHROME_BIN = process.execPath; // simple "navigateur" existant : le DOM est injecte par setDomFetcher

const agent = require('../sync-instagram.js');
agent.setRetryBaseMs(1);

// ---------- Fixtures ----------
const scriptJson = (obj) => `<script type="application/json" data-sjs>${JSON.stringify(obj)}</script>`;
const profileHtml = (nodes) => `<html><body>${scriptJson({
  require: [['ScheduledServerJS', 'handle', null, [{ __bbox: { result: { data: { xig_user_by_username: {
    polaris_ordered_timeline_connection: { edges: nodes.map((node) => ({ node })) }
  } } } } }]]]
})}</body></html>`;

const thumb = (code) => ({ __typename: 'x', code, display_uri: `http://127.0.0.1:PORT/${code}/cover.jpg` });
const unrelated = scriptJson({ related: { code: 'ZZZZZZZZZZZ', image_versions2: { candidates: [{ url: 'http://x/y.jpg' }] } } });

let port = 0;
const withPort = (s) => JSON.parse(JSON.stringify(s).replace(/PORT/g, String(port)));
const img = (code, name, w = 1080, h = 1350) => ({
  original_width: w, original_height: h, media_type: 1,
  image_versions2: { candidates: [{ url: `http://127.0.0.1:PORT/${code}/${name}.jpg`, width: 320 }, { url: `http://127.0.0.1:PORT/${code}/${name}-big.jpg`, width: w }] }
});

const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);

const postPages = {};
const profileNodes = [];
const fetched = [];

function addReel(code, takenAt, caption) {
  profileNodes.push({ ...thumb(code), media_type: 2, product_type: 'clips', __typename: 'XIGPolarisVideoMedia' });
  postPages[code] = (p) => scriptJson(withPort({
    items: [{
      code, taken_at: takenAt, media_type: 2, product_type: 'clips', original_width: 720, original_height: 1280,
      caption: { text: caption, created_at: takenAt },
      image_versions2: { candidates: [{ url: `http://127.0.0.1:PORT/${code}/poster.jpg`, width: 720 }] },
      video_versions: [{ type: 101, url: `http://127.0.0.1:PORT/${code}/video.mp4` }, { type: 103, url: `http://127.0.0.1:PORT/${code}/low.mp4` }]
    }]
  })) + unrelated;
}

function addCarousel(code, takenAt, caption, slides) {
  profileNodes.push({ ...thumb(code), media_type: 8, product_type: 'carousel_container', __typename: 'XIGPolarisCarouselMedia', carousel_media_count: slides.length });
  postPages[code] = () => scriptJson(withPort({
    thin: { code, media_type: 8, product_type: 'carousel_container', carousel_media_count: slides.length },
    items: [{
      code, taken_at: takenAt, media_type: 8, product_type: 'carousel_container', original_width: 1080, original_height: 1350,
      caption: { text: caption, created_at: takenAt },
      carousel_media: slides.map((kind, i) => (kind === 'video'
        ? { ...img(code, `s${i}`, 720, 900), media_type: 2, video_versions: [{ type: 101, url: `http://127.0.0.1:PORT/${code}/s${i}.mp4` }] }
        : img(code, `s${i}`)))
    }]
  })) + unrelated;
}

// ---------- Serveur de medias local ----------
let server;
const failingPaths = new Set();
test.before(async () => {
  server = http.createServer((req, res) => {
    if (failingPaths.has(req.url)) { res.writeHead(404); res.end('nope'); return; }
    const isVideo = req.url.endsWith('.mp4');
    res.writeHead(200, { 'Content-Type': isVideo ? 'video/mp4' : 'image/jpeg' });
    res.end(Buffer.from(`FAKE-${req.url}`));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;

  // Etat du site : DanElec en tete, un projet Instagram deja present, Book de stage en dernier
  fs.writeFileSync(path.join(TMP, 'data.json'), JSON.stringify([
    { title: 'DanElec', type: 'link', link: 'https://www.danelec.be/' },
    { title: 'Deja la', type: 'carousel', link: 'https://www.instagram.com/p/EXISTING111/' },
    { title: 'Ancien', type: 'video', link: 'https://www.instagram.com/reel/OLDBASE1111/' },
    { title: 'Book', type: 'pdf', link: 'https://x/Book-stage-Mons.pdf' }
  ], null, 2));
  fs.writeFileSync(path.join(TMP, 'projects-data.js'), 'window.PORTFOLIO_ITEMS = [];\n');
  fs.writeFileSync(path.join(TMP, 'index.html'), '<script src="projects-data.js?v=111" defer></script>');
  fs.writeFileSync(path.join(TMP, 'instagram-config.json'), JSON.stringify({
    username: 'robinwattier',
    profileUrl: 'https://www.instagram.com/robinwattier/',
    baselineDate: new Date((NOW - 10 * DAY) * 1000).toISOString(),
    baselineCodes: ['OLDBASE1111'],
    excludedCodes: ['EXCLUDED111']
  }));

  addReel('NEWREEL1111', NOW - 1 * DAY, 'Mon nouveau Reel 🎬\n\n#reel #music');
  addCarousel('NEWCAROUS11', NOW - 2 * DAY, 'Carrousel photos\n#a', ['image', 'image', 'image']);
  addCarousel('CAROUSVID11', NOW - 3 * DAY, 'Carrousel avec une vidéo dedans\n#b', ['image', 'video']);
  addCarousel('EXCLUDED111', NOW - 1 * DAY, 'exclu', ['image', 'image']);
  addCarousel('EXISTING111', NOW - 1 * DAY, 'deja', ['image', 'image']);
  addCarousel('OLDBASE1111', NOW - 1 * DAY, 'baseline', ['image', 'image']);
  addCarousel('PINNEDOLD111', NOW - 200 * DAY, 'vieux post epingle', ['image', 'image']);

  agent.setDomFetcher(async (url) => {
    fetched.push(url);
    if (url === 'https://www.instagram.com/robinwattier/') return profileHtml(profileNodes);
    const m = url.match(/\/(?:p|reel)\/([^/]+)\//);
    if (m && postPages[m[1]]) return `<html>${postPages[m[1]]()}</html>`;
    return '<html><body>login</body></html>';
  });
});

test.after(() => {
  server.close();
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ---------- Classification ----------
test('classifyMedia : Reel seul, carrousel, carrousel contenant une video, photo', () => {
  assert.equal(agent.classifyMedia({ media_type: 2, product_type: 'clips' }), 'video');
  assert.equal(agent.classifyMedia({ __typename: 'XIGPolarisVideoMedia' }), 'video');
  assert.equal(agent.classifyMedia({ media_type: 8, product_type: 'carousel_container', carousel_media_count: 2 }), 'carousel');
  // Un carrousel dont des diapositives sont des videos reste un carrousel
  assert.equal(agent.classifyMedia({
    media_type: 8, carousel_media: [{ media_type: 1 }, { media_type: 2, video_versions: [{ url: 'v' }] }],
    video_versions: [{ url: 'v' }]
  }), 'carousel');
  assert.equal(agent.classifyMedia({ media_type: 1, product_type: 'feed' }), 'image');
  assert.equal(agent.classifyMedia(null), 'image');
});

test('extractTimelinePosts : lit la grille du profil dans l\'ordre, sans doublons', () => {
  const html = profileHtml([
    { code: 'AAAAAAAAAAA', media_type: 2, product_type: 'clips' },
    { code: 'BBBBBBBBBBB', media_type: 8, carousel_media_count: 3, caption: { text: 'hello' } },
    { code: 'AAAAAAAAAAA', media_type: 2 }
  ]) + unrelated;
  const posts = agent.extractTimelinePosts(html);
  assert.deepEqual(posts.map((p) => [p.code, p.type, p.permalink]), [
    ['AAAAAAAAAAA', 'video', 'https://www.instagram.com/reel/AAAAAAAAAAA/'],
    ['BBBBBBBBBBB', 'carousel', 'https://www.instagram.com/p/BBBBBBBBBBB/']
  ]);
});

test('findMediaByCode : choisit l\'objet le plus riche du post (pas les posts lies)', () => {
  const html = scriptJson({
    a: { code: 'POST1', media_type: 8, image_versions2: { candidates: [] } },
    b: { code: 'POST1', carousel_media: [{ code: 'child1', image_versions2: {} }, { code: 'child2', image_versions2: {} }], media_type: 8 },
    c: { code: 'OTHER', carousel_media: [1, 2, 3, 4], image_versions2: {} }
  });
  const media = agent.findMediaByCode(html, 'POST1');
  assert.equal(media.carousel_media.length, 2);
  assert.equal(agent.findMediaByCode(html, 'NOPE'), null);
});

test('titleFromCaption : 1re ligne sans hashtags, coupe propre', () => {
  assert.equal(agent.titleFromCaption('Night Spa 🌒\n\n#a #b'), 'Night Spa 🌒');
  assert.equal(agent.titleFromCaption('#only #hashtags'), null);
  assert.equal(agent.titleFromCaption(''), null);
  assert.equal(
    agent.titleFromCaption('Our new track « sometimes » drops soon! Swipe up >>> to check out the audio snippet and hear it first. Let us know'),
    'Our new track « sometimes » drops soon!'
  );
  const long = agent.titleFromCaption('mot '.repeat(60));
  assert.ok(long.length <= 81 && long.endsWith('…'));
});

test('applyMediaDetails : une diapositive video n\'en fait pas un Reel', () => {
  const post = { code: 'X', type: 'video', permalink: 'p', alt: '', w: 1, h: 1 };
  agent.applyMediaDetails(post, {
    media_type: 8, taken_at: 1793899817, caption: { text: 'Titre\n#t' }, original_width: 1080, original_height: 1350,
    carousel_media: [
      { media_type: 1, image_versions2: { candidates: [{ url: 'a.jpg', width: 1080 }] } },
      { media_type: 2, video_versions: [{ url: 'v.mp4' }], image_versions2: { candidates: [{ url: 'b.jpg', width: 720 }] } }
    ]
  });
  assert.equal(post.type, 'carousel');
  assert.equal(post.permalink, 'https://www.instagram.com/p/X/');
  assert.deepEqual(post.slides.map((s) => s.kind), ['image', 'video']);
  assert.equal(post.slides[1].videoUrl, 'v.mp4');
  assert.deepEqual(post.slideUrls, ['a.jpg', 'b.jpg']);
  assert.equal(post.title, 'Titre');
  assert.equal(post.publishedAt, new Date(1793899817 * 1000).toISOString());
});

test('applyMediaDetails & extractTimelinePosts : un Reel garde toujours le ratio portrait 720x1280 meme si le flux maitre est horizontal', () => {
  const html = profileHtml([
    { code: 'LANDREEL111', media_type: 2, product_type: 'clips', original_width: 1920, original_height: 1080 }
  ]);
  const [timelineReel] = agent.extractTimelinePosts(html);
  assert.deepEqual([timelineReel.w, timelineReel.h], [720, 1280]);

  const post = { code: 'LANDREEL111', type: 'video', permalink: 'p', alt: '' };
  agent.applyMediaDetails(post, {
    media_type: 2, product_type: 'clips', original_width: 1920, original_height: 1080,
    image_versions2: { candidates: [{ url: 'cover.jpg', width: 720, height: 1280 }] },
    video_versions: [{ url: 'master.mp4', width: 1920, height: 1080 }]
  });
  assert.deepEqual([post.w, post.h], [720, 1280]);
});

test('bestImageUrl : privilegie les candidats non recadres en carre (sans stp=c...) et la plus grande surface', () => {
  const url = agent.bestImageUrl({
    image_versions2: {
      candidates: [
        { url: 'https://cdn.ig/square.jpg?stp=c0.135.1080.1080a_dst-jpg', width: 1080, height: 1080 },
        { url: 'https://cdn.ig/portrait.jpg?stp=dst-jpg_e35', width: 1080, height: 1350 },
        { url: 'https://cdn.ig/small.jpg?stp=dst-jpg_e35', width: 640, height: 800 }
      ]
    }
  });
  assert.equal(url, 'https://cdn.ig/portrait.jpg?stp=dst-jpg_e35');
});

test('extractProfileLinks : teste isCarousel avant isReel dans le repli DOM', () => {
  const html = `
    <a href="/p/CAROUSEL111/"><span>Carrousel contenant un Clip</span><img src="c.jpg" alt="a" /></a>
    <a href="/reel/ONLYREEL111/"><span>Reel</span><img src="r.jpg" alt="b" /></a>
    <a href="/reels/PLURALREEL1/"><span>Clip</span><img src="r2.jpg" alt="c" /></a>
  `;
  const posts = agent.extractProfileLinks(html);
  assert.deepEqual(posts.map((p) => [p.code, p.type]), [
    ['CAROUSEL111', 'carousel'],
    ['ONLYREEL111', 'video'],
    ['PLURALREEL1', 'video']
  ]);
});

test('extractVideoCover : extrait une vraie image JPEG depuis un flux MP4 (t = 2s et repli t = 0s)', async () => {
  const ffmpegBin = require('ffmpeg-static');
  const { execFileSync } = require('child_process');
  const realMp4 = path.join(TMP, 'sample-real.mp4');
  execFileSync(ffmpegBin, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=gold:s=64x80:d=2.5',
    '-pix_fmt', 'yuv420p', realMp4
  ]);
  const mp4Buf = fs.readFileSync(realMp4);

  const vidSrv = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'video/mp4' });
    res.end(mp4Buf);
  });
  await new Promise((r) => vidSrv.listen(0, '127.0.0.1', r));
  const vPort = vidSrv.address().port;

  try {
    const out2s = path.join(TMP, 'cover-2s.jpg');
    const ok2s = await agent.extractVideoCover(`http://127.0.0.1:${vPort}/clip.mp4`, out2s, 2);
    assert.equal(ok2s, true);
    const buf2s = fs.readFileSync(out2s);
    assert.equal(buf2s[0], 0xff);
    assert.equal(buf2s[1], 0xd8);

    // Si seekSeconds depasse la duree de la video, repli automatique sur t = 0s
    const outFallback = path.join(TMP, 'cover-fallback0s.jpg');
    const okFb = await agent.extractVideoCover(`http://127.0.0.1:${vPort}/clip.mp4`, outFallback, 10);
    assert.equal(okFb, true);
    const bufFb = fs.readFileSync(outFallback);
    assert.equal(bufFb[0], 0xff);
    assert.equal(bufFb[1], 0xd8);
  } finally {
    vidSrv.close();
  }
});

// ---------- Bout en bout ----------
const readItems = () => JSON.parse(fs.readFileSync(path.join(TMP, 'data.json'), 'utf8'));

test('dry-run : detecte et classe sans rien ecrire', async () => {
  const before = fs.readFileSync(path.join(TMP, 'data.json'), 'utf8');
  const res = await agent.syncInstagram({ dryRun: true });
  assert.equal(res.dryRun, true);
  assert.deepEqual(res.detected.map((d) => [d.code, d.type]).sort(), [
    ['CAROUSVID11', 'carousel'], ['NEWCAROUS11', 'carousel'], ['NEWREEL1111', 'video']
  ]);
  assert.equal(fs.readFileSync(path.join(TMP, 'data.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(TMP, 'assets')), false);
});

test('sync : Reel -> carte video, carrousels (meme avec video) -> cartes carrousel', async () => {
  const res = await agent.syncInstagram();
  assert.equal(res.success, true);
  assert.equal(res.added, 3);
  assert.deepEqual(res.failed, []);

  const items = readItems();
  // Ordre : DanElec, nouveautes (plus recent d'abord), existants, Book de stage en dernier
  assert.deepEqual(items.map((i) => i.title), [
    'DanElec', 'Mon nouveau Reel 🎬', 'Carrousel photos', 'Carrousel avec une vidéo dedans', 'Deja la', 'Ancien', 'Book'
  ]);

  const reel = items[1];
  assert.equal(reel.type, 'video');
  assert.equal(reel.link, 'https://www.instagram.com/reel/NEWREEL1111/');
  assert.equal(reel.src, 'assets/projets/instagram/NEWREEL1111/video.mp4');
  assert.match(reel.poster, /assets\/projets\/instagram\/NEWREEL1111\/poster\.(webp|jpg)$/);
  assert.equal(reel.slides, undefined);
  assert.deepEqual([reel.w, reel.h], [720, 1280]);
  assert.equal(fs.readFileSync(path.join(TMP, reel.src), 'utf8'), 'FAKE-/NEWREEL1111/video.mp4');

  const photos = items[2];
  assert.equal(photos.type, 'carousel');
  assert.equal(photos.link, 'https://www.instagram.com/p/NEWCAROUS11/');
  assert.equal(photos.slides.length, 3);
  assert.equal(photos.src, photos.slides[0]);
  assert.deepEqual([photos.w, photos.h], [1080, 1350]);
  // Image la plus grande choisie
  assert.equal(fs.readFileSync(path.join(TMP, photos.slides[0]), 'utf8'), 'FAKE-/NEWCAROUS11/s0-big.jpg');

  const withVideo = items[3];
  assert.equal(withVideo.type, 'carousel');
  assert.equal(withVideo.slides.length, 2);
  assert.equal(withVideo.video, undefined);
  assert.ok(withVideo.slides.every((s) => s.endsWith('.jpg')));
  assert.ok(withVideo.slideVideos);
  assert.ok(withVideo.slideVideos['1'].endsWith('.mp4'));
  assert.equal(fs.existsSync(path.join(TMP, withVideo.slideVideos['1'])), true);

  // projects-data.js synchronise + cache buster
  const js = fs.readFileSync(path.join(TMP, 'projects-data.js'), 'utf8');
  assert.match(js, /window\.PORTFOLIO_ITEMS = \[/);
  assert.ok(js.includes('NEWREEL1111'));
  assert.doesNotMatch(fs.readFileSync(path.join(TMP, 'index.html'), 'utf8'), /\?v=111/);
  // Pas de residu .part / .tmp / verrou
  const leftovers = [];
  (function walk(d) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); f.isDirectory() ? walk(p) : /\.(part|tmp)$|\.lock$/.test(f.name) && leftovers.push(p); } })(TMP);
  assert.deepEqual(leftovers, []);

  // Vieux post epingle hors baselineCodes mais publie avant baselineDate : ignore ET memorise
  const cfg = JSON.parse(fs.readFileSync(path.join(TMP, 'instagram-config.json'), 'utf8'));
  assert.ok(cfg.baselineCodes.includes('PINNEDOLD111'));
});

test('sync : idempotent (2e passage = rien a ajouter, rien de re-telecharge)', async () => {
  const before = fs.readFileSync(path.join(TMP, 'data.json'), 'utf8');
  fetched.length = 0;
  const res = await agent.syncInstagram();
  assert.equal(res.added, 0);
  assert.deepEqual(res.addedItems, []);
  assert.equal(fs.readFileSync(path.join(TMP, 'data.json'), 'utf8'), before);
  assert.deepEqual(fetched, ['https://www.instagram.com/robinwattier/']);

  const dryRes = await agent.syncInstagram({ dryRun: true });
  assert.equal(dryRes.dryRun, true);
  assert.deepEqual(dryRes.detected, []);
});

test('sync : un media en echec n\'ajoute JAMAIS un carrousel tronque, les autres posts passent', async () => {
  addCarousel('BROKEN11111', NOW - 0.5 * DAY, 'Carrousel casse', ['image', 'image', 'image']);
  addReel('GOODREEL111', NOW - 0.2 * DAY, 'Reel ok');
  failingPaths.add('/BROKEN11111/s1-big.jpg');
  const res = await agent.syncInstagram();
  assert.equal(res.success, false);
  assert.deepEqual(res.failed.map((f) => f.code), ['BROKEN11111']);
  assert.deepEqual(res.addedCodes, ['GOODREEL111']);
  const links = readItems().map((i) => i.link).join('|');
  assert.ok(links.includes('GOODREEL111'));
  assert.ok(!links.includes('BROKEN11111'));

  // Au passage suivant (media de nouveau disponible) le post est rattrape
  failingPaths.clear();
  const res2 = await agent.syncInstagram();
  assert.deepEqual(res2.addedCodes, ['BROKEN11111']);
  const broken = readItems().find((i) => i.link.includes('BROKEN11111'));
  assert.equal(broken.slides.length, 3);
});

test('syncSinglePost : accepte un shortcode nu ou une URL (/p/, /reel/, /reels/)', async () => {
  addCarousel('SINGLECODE1', NOW, 'Import direct par code', ['image', 'image']);
  addReel('SINGLEREEL1', NOW, 'Import direct Reel');
  agent.setDomFetcher(async (url) => {
    const m = url.match(/\/(?:p|reels?)\/([^/]+)\//);
    if (m && postPages[m[1]]) return `<html>${postPages[m[1]]()}</html>`;
    return '<html><body>login</body></html>';
  });

  const res1 = await agent.syncSinglePost('SINGLECODE1');
  assert.equal(res1.success, true);
  assert.equal(res1.added, 1);
  assert.equal(res1.item.type, 'carousel');

  const res2 = await agent.syncSinglePost('https://www.instagram.com/reels/SINGLEREEL1/');
  assert.equal(res2.success, true);
  assert.equal(res2.added, 1);
  assert.equal(res2.item.type, 'video');
  assert.deepEqual([res2.item.w, res2.item.h], [720, 1280]);

  // Idempotence sur un post deja present
  const resDup = await agent.syncSinglePost('SINGLECODE1');
  assert.equal(resDup.added, 0);

  // Code invalide rejete
  await assert.rejects(() => agent.syncSinglePost('!bad!'), /invalide/);
});

test('sync : Instagram sans publication (mur de connexion) -> echec explicite, rien ecrit', async () => {
  const before = fs.readFileSync(path.join(TMP, 'data.json'), 'utf8');
  agent.setDomFetcher(async () => '<html><body>Se connecter</body></html>');
  await assert.rejects(() => agent.syncInstagram(), (err) => {
    assert.match(err.message, /n'a renvoy/);
    assert.equal(err.code, 'INSTAGRAM_LOGIN_WALL');
    return true;
  });
  assert.equal(fs.readFileSync(path.join(TMP, 'data.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(TMP, '.sync-instagram.lock')), false);
});

test('resilience : classification des pannes (mur de connexion, 429, derive de schema, chrome, reseau)', () => {
  assert.equal(
    agent.classifyHtmlFailure({ statusCode: 302, finalUrl: 'https://www.instagram.com/accounts/login/' }).code,
    'INSTAGRAM_LOGIN_WALL'
  );
  assert.equal(
    agent.classifyHtmlFailure({ statusCode: 429, html: 'Please wait a few minutes' }).code,
    'INSTAGRAM_RATE_LIMIT'
  );
  assert.equal(
    agent.classifyHtmlFailure({ statusCode: 200, finalUrl: 'https://www.instagram.com/robinwattier/', html: '<html><title>Robin Wattier (@robinwattier) • Instagram</title><body></body></html>' }).code,
    'SCHEMA_DRIFT'
  );
  assert.equal(
    agent.classifyHtmlFailure({ statusCode: 403, html: '', chromePath: null }).code,
    'CHROMIUM_UNAVAILABLE'
  );
  assert.equal(
    agent.classifyHtmlFailure({ statusCode: 0, chromeError: 'segfault', chromePath: '/bin/chrome' }).code,
    'CHROME_ERROR'
  );
  assert.equal(
    agent.classifyHtmlFailure({ statusCode: 0, networkError: 'ECONNRESET', chromePath: null }).code,
    'NETWORK_ERROR'
  );
});

test('resilience : isExpectedBlockError ne tolere que les blocages IP sans cookie', () => {
  const prevCookie = process.env.IG_COOKIE;
  try {
    delete process.env.IG_COOKIE;
    assert.equal(agent.isExpectedBlockError({ code: 'INSTAGRAM_LOGIN_WALL' }), true);
    assert.equal(agent.isExpectedBlockError({ code: 'INSTAGRAM_RATE_LIMIT' }), true);
    assert.equal(agent.isExpectedBlockError({ code: 'SCHEMA_DRIFT' }), false);
    assert.equal(agent.isExpectedBlockError({ code: 'CHROME_ERROR' }), false);

    process.env.IG_COOKIE = 'sessionid=abc;';
    assert.equal(agent.isExpectedBlockError({ code: 'INSTAGRAM_LOGIN_WALL' }), false);
  } finally {
    if (prevCookie === undefined) delete process.env.IG_COOKIE;
    else process.env.IG_COOKIE = prevCookie;
  }
});

test('resilience : Niveau 1 HTTP SSR avec cookie fonctionne sans passer par Chrome', async () => {
  let capturedCookie = null;
  let capturedSecFetch = null;
  const ssrSrv = http.createServer((req, res) => {
    capturedCookie = req.headers.cookie || null;
    capturedSecFetch = req.headers['sec-fetch-mode'] || null;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(profileHtml([{ code: 'HTTPONLY111', media_type: 2, product_type: 'clips' }]));
  });
  await new Promise((r) => ssrSrv.listen(0, '127.0.0.1', r));
  const ssrPort = ssrSrv.address().port;

  try {
    process.env.IG_COOKIE = 'sessionid=testcookie;';
    agent.setDomFetcher(null);
    const { posts } = await agent.scrapeInstagramProfile(`http://127.0.0.1:${ssrPort}/robinwattier/`);
    assert.equal(capturedCookie, 'sessionid=testcookie;');
    assert.equal(capturedSecFetch, 'navigate');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].code, 'HTTPONLY111');
  } finally {
    ssrSrv.close();
    delete process.env.IG_COOKIE;
  }
});

test('verrou : une 2e synchronisation simultanee est refusee', async () => {
  fs.writeFileSync(path.join(TMP, '.sync-instagram.lock'), '{}');
  await assert.rejects(() => agent.syncInstagram(), /déjà en cours/);
  fs.unlinkSync(path.join(TMP, '.sync-instagram.lock'));
});
