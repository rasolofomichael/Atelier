// Tests de bout en bout dans Chromium : npm run test:e2e
import { spawn } from 'node:child_process';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 8123;
const URL = `http://localhost:${PORT}/`;
let server, browser;

// Chaque démarrage du serveur publie une nouvelle version du service worker.
async function startServer() {
  server = spawn(process.execPath, ['scripts/serve.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise(r => server.stdout.once('data', r));
}
async function restartServer() {
  const old = server;
  await new Promise(r => { old.once('exit', r); old.kill(); });
  await startServer();
}

before(async () => {
  await startServer();
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.kill(); });

async function open(ctx, { seed } = {}) {
  const page = await ctx.newPage();
  if (seed) {
    await page.goto(URL + 'vide');   // même origine, sans lancer l'app
    await page.evaluate(seed);
  }
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  await page.waitForSelector('body.ready');
  return { page, errors };
}

async function openBackups(page) {
  await page.click('#menuBtn');
  await page.click('#backupBtn');
  await page.waitForSelector('#backupDlg[open]');
}

const legacy = {
  current: 'pA',
  projects: [{
    id: 'pA', name: 'Mon roman V1', sceneId: 'x1',
    scenes: [{ id: 'x1', title: 'Chapitre un', status: 'brouillon', text: 'Texte écrit dans le prototype.' }],
    bible: [{ id: 'e1', type: 'Personnage', name: 'Ysé', alias: '', notes: '' }],
  }],
};

test('migration depuis le prototype, saisie, rechargement, restauration', async () => {
  const ctx = await browser.newContext();
  const { page, errors } = await open(ctx, {
    seed: `localStorage.setItem('atelier-ecriture-v1', ${JSON.stringify(JSON.stringify(legacy))})`,
  });
  assert.equal(await page.inputValue('#sceneTitle'), 'Chapitre un');
  assert.equal(await page.inputValue('#sceneText'), 'Texte écrit dans le prototype.');

  await page.click('#sceneText');
  await page.keyboard.press('End');
  await page.keyboard.type(' Ysé arrive.');
  await page.waitForFunction(() => document.getElementById('saved').textContent === 'Enregistré');
  assert.match(await page.textContent('#mentions'), /Ysé/);

  await page.reload();
  await page.waitForSelector('body.ready');
  assert.equal(await page.inputValue('#sceneText'), 'Texte écrit dans le prototype. Ysé arrive.');
  // Les données du prototype ne sont jamais effacées.
  assert.ok(await page.evaluate(() => localStorage.getItem('atelier-ecriture-v1')));

  await openBackups(page);
  const rows = page.locator('#backupList .backup');
  assert.match(await rows.last().textContent(), /migration depuis le prototype/);
  const restore = rows.last().locator('button');
  await restore.click();
  assert.equal(await restore.textContent(), 'Confirmer ?');
  await restore.click();
  await page.waitForFunction(() => !document.getElementById('backupDlg').open);
  assert.equal(await page.inputValue('#sceneText'), 'Texte écrit dans le prototype.');

  // La version d'avant la restauration est elle-même gardée.
  await openBackups(page);
  assert.match(await rows.first().textContent(), /avant restauration/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('premier lancement sans données : exemple', async () => {
  const ctx = await browser.newContext();
  const { page, errors } = await open(ctx);
  assert.equal(await page.inputValue('#sceneTitle'), 'Ouverture : le quai');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("copie d'urgence récupérée au démarrage", async () => {
  const ctx = await browser.newContext();
  const { page } = await open(ctx);
  const rescue = structuredClone(legacy);
  rescue.projects[0].scenes[0].text = 'Écrit pendant une panne de stockage.';
  await page.evaluate(d => localStorage.setItem('atelier-secours', JSON.stringify({ at: Date.now(), data: d })), rescue);
  await page.reload();
  await page.waitForSelector('body.ready');
  assert.equal(await page.inputValue('#sceneText'), 'Écrit pendant une panne de stockage.');
  assert.equal(await page.evaluate(() => localStorage.getItem('atelier-secours')), null);
  await ctx.close();
});

test('enregistrement immédiat quand la page passe en arrière-plan', async () => {
  const ctx = await browser.newContext();
  const { page } = await open(ctx);
  await page.fill('#sceneText', 'Dernière phrase avant de verrouiller le téléphone.');
  // Simule le passage en arrière-plan avant la fin du délai de 400 ms.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.getElementById('saved').textContent === 'Enregistré');
  const page2 = await ctx.newPage();
  await page2.goto(URL);
  await page2.waitForSelector('body.ready');
  assert.equal(await page2.inputValue('#sceneText'), 'Dernière phrase avant de verrouiller le téléphone.');
  await ctx.close();
});

test('export puis import JSON', async () => {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const { page } = await open(ctx);
  await openBackups(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlJson')]);
  assert.match(dl.suggestedFilename(), /^atelier-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  const path = await dl.path();

  await page.click('#closeDlg');
  await page.fill('#sceneText', 'Modifié après export.');
  await openBackups(page);
  await page.setInputFiles('#importJson', path);
  await page.waitForFunction(() => !document.getElementById('backupDlg').open);
  assert.match(await page.inputValue('#sceneText'), /^Il pleuvait sur Port-Ombre/);
  await ctx.close();
});

test('iPhone : onglets et absence de défilement horizontal', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page, errors } = await open(ctx);
  assert.ok(await page.isVisible('.tabs'));
  assert.ok(!(await page.isVisible('.rail')));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/mobile.png` : undefined });
  assert.deepEqual(errors, []);
  await ctx.close();
});

async function waitForOfflineReady(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
  });
}

test('fonctionne hors ligne une fois chargée', async () => {
  const ctx = await browser.newContext();
  const { page, errors } = await open(ctx);
  await waitForOfflineReady(page);
  await page.fill('#sceneText', 'Écrit dans le train.');
  await page.waitForFunction(() => document.getElementById('saved').textContent === 'Enregistré');

  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('body.ready');
  assert.equal(await page.inputValue('#sceneText'), 'Écrit dans le train.');
  // Les polices viennent du cache, pas de Google.
  assert.ok(await page.evaluate(() => document.fonts.check('16px Literata')));
  assert.ok(await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].some(f => f.family.includes('Literata') && f.status === 'loaded'); }));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('nouvelle version : proposée, puis appliquée sans perdre le texte', async () => {
  const ctx = await browser.newContext();
  const { page } = await open(ctx);
  await waitForOfflineReady(page);
  assert.ok(await page.isHidden('#updateBar'));

  await restartServer();   // « publication » d'une nouvelle version
  await page.fill('#sceneText', 'Phrase en cours pendant la mise à jour.');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
  await page.waitForSelector('#updateBar:not([hidden])');

  await Promise.all([page.waitForEvent('load'), page.click('#updateBtn')]);
  await page.waitForSelector('body.ready');
  assert.equal(await page.inputValue('#sceneText'), 'Phrase en cours pendant la mise à jour.');
  assert.ok(await page.isHidden('#updateBar'));
  await ctx.close();
});

test('menu : ouverture, fermeture au clic extérieur et avec Échap', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page } = await open(ctx);
  // L'en-tête tient sur une ligne sur iPhone.
  assert.ok((await page.locator('header').boundingBox()).height < 70);
  await page.click('#menuBtn');
  assert.ok(await page.isVisible('#menuPanel'));
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/menu.png` : undefined });
  await page.click('#sceneText');
  assert.ok(await page.isHidden('#menuPanel'));
  await page.click('#menuBtn');
  await page.keyboard.press('Escape');
  assert.ok(await page.isHidden('#menuPanel'));
  await ctx.close();
});

test('export Markdown (.zip) de tous les projets', async () => {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const { page, errors } = await open(ctx);
  await page.fill('#sceneText', 'Texte exporté.');
  await page.click('#menuBtn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#zipBtn')]);
  assert.match(dl.suggestedFilename(), /^atelier-.*\.zip$/);
  const { execFileSync } = await import('node:child_process');
  const names = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;print("\\n".join(sorted(zipfile.ZipFile(sys.argv[1]).namelist())))', await dl.path()]).toString().trim().split('\n');
  assert.ok(names.includes('exemple-la-ville-sous-la-pluie/projet.md'), names.join(', '));
  assert.ok(names.includes('exemple-la-ville-sous-la-pluie/bible/personnages/lia.md'));
  const scene = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("exemple-la-ville-sous-la-pluie/scenes/ouverture-le-quai.md").decode())', await dl.path()]).toString();
  assert.match(scene, /Texte exporté\./);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('recueil de chansons : création, infos, sections, banque d\'idées', async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const { page, errors } = await open(ctx);
  // La fiction n'affiche pas les champs de chanson.
  assert.ok(await page.isHidden('#songMeta'));

  await page.click('#menuBtn');
  await page.click('#newSongs');
  await page.keyboard.type('Premier album');
  await page.keyboard.press('Enter');
  assert.equal(await page.textContent('#tabItems'), 'Chansons');
  assert.equal(await page.textContent('#tabBank'), 'Idées');
  assert.ok(await page.isVisible('#songMeta'));
  assert.equal(await page.inputValue('#sceneText'), '## Couplet 1\n\n\n## Refrain\n\n');

  await page.selectOption('#songKey', 'Am');
  await page.fill('#songTempo', '92');
  await page.selectOption('#songMeter', '6/8');

  // Insertion d'un couplet numéroté à la fin du texte.
  await page.fill('#sceneText', '## Couplet 1\nIl pleut sur la ville\n\n## Refrain\nEt je reste là');
  await page.click('[data-sec="Couplet"]');
  await page.keyboard.type('Les heures creuses');
  assert.equal(await page.inputValue('#sceneText'),
    '## Couplet 1\nIl pleut sur la ville\n\n## Refrain\nEt je reste là\n\n## Couplet 2\nLes heures creuses');

  await page.click('#songNotesBox summary');
  await page.fill('#songNotes', 'Réf : Bashung');

  // Banque d'idées : catégories propres aux chansons, idée reconnue dans les paroles.
  await page.click('#tabBank');
  assert.deepEqual(await page.locator('#filters button').allTextContents(), ['Tout', 'Titres', 'Phrases', 'Images', 'Thèmes']);
  await page.click('#addEntry');
  await page.keyboard.type('heures creuses');
  assert.match(await page.textContent('#mentions'), /heures creuses/);

  await page.waitForFunction(() => document.getElementById('saved').textContent === 'Enregistré');
  await page.reload();
  await page.waitForSelector('body.ready');
  assert.equal(await page.inputValue('#songKey'), 'Am');
  assert.equal(await page.inputValue('#songTempo'), '92');
  assert.equal(await page.inputValue('#songMeter'), '6/8');
  assert.equal(await page.inputValue('#songNotes'), 'Réf : Bashung');
  assert.equal(await page.locator('#sceneStatus option[value="revise"]').textContent(), 'Finie');

  // Retour à la fiction : vocabulaire d'origine.
  await page.selectOption('#projectSel', { index: 0 });
  assert.equal(await page.textContent('#tabItems'), 'Scènes');
  assert.ok(await page.isHidden('#songMeta'));
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/fiction-apres.png` : undefined });
  await page.selectOption('#projectSel', { index: 1 });
  await page.click('#tabItems');
  await page.click('.scene');
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/chanson.png` : undefined });
  assert.deepEqual(errors, []);
  await ctx.close();
});
