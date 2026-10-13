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

// Sur iPhone, la liste et l'écriture sont deux écrans : on revient à la liste si besoin.
async function toList(page) {
  if (await page.isVisible('#backBtn')) await page.click('#backBtn');
}
async function newSongbook(page, name = '') {
  await toList(page);
  await page.click('#projectBtn');
  await page.click('#newSongs');
  if (name) await page.keyboard.type(name);
  await page.click('#projectsOk');
}
async function settings(page, pairs) {
  await page.click('#settingsBtn');
  for (const [set, v] of pairs) await page.click(`[data-set="${set}"][data-v="${v}"]`);
}

async function openBackups(page) {
  await toList(page);
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

const IPHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

test('iPhone : deux écrans (écriture puis liste), sans défilement horizontal', async () => {
  const ctx = await browser.newContext(IPHONE);
  const { page, errors } = await open(ctx);
  // On reprend directement dans le texte.
  assert.ok(await page.isVisible('#sceneText'));
  assert.ok(await page.isHidden('#sceneList'));
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.click('#backBtn');
  assert.ok(await page.isVisible('#sceneList'));
  assert.ok(await page.isHidden('#sceneText'));
  assert.equal(await page.locator('.toc').count(), 3);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // Une ligne de la table des matières ouvre l'écriture.
  await page.locator('.toc').nth(1).click();
  assert.equal(await page.inputValue('#sceneTitle'), 'La maison du passeur');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('ordinateur : liste et écriture côte à côte', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await open(ctx);
  assert.ok(await page.isVisible('#sceneList'));
  assert.ok(await page.isVisible('#sceneText'));
  assert.ok(await page.isHidden('#backBtn'));
  // Mode focus : la liste disparaît.
  await page.click('#focusBtn');
  assert.ok(await page.isHidden('#sceneList'));
  await page.click('#focusBtn');
  assert.ok(await page.isVisible('#sceneList'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('couleurs : chaque chanson a la sienne, différente de ses voisines, modifiable', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await open(ctx);
  await newSongbook(page);
  await page.click('#addBtn');
  await page.click('#addBtn');
  const colors = () => page.locator('.card').evaluateAll(els => els.map(e => [...e.classList].find(c => c.startsWith('c-'))));
  const before = await colors();
  assert.equal(before.length, 3);
  assert.ok(before.every(Boolean));
  await page.locator('.card').first().click();
  await page.click('#addBtn');   // nouvelle chanson après la première
  const after = await colors();
  assert.equal(after.length, 4);
  assert.notEqual(after[1], after[0]);
  assert.notEqual(after[1], after[2]);
  // L'écran d'écriture prend la couleur de la chanson.
  assert.ok(await page.locator(`#ecrirePane.${after[1]}`).count());
  await settings(page, [['couleur', 'olive']]);
  await page.click('#settingsOk');
  assert.equal((await colors())[1], 'c-olive');
  await page.reload();
  await page.waitForSelector('body.ready');
  assert.equal((await colors())[1], 'c-olive');
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
  const ctx = await browser.newContext(IPHONE);
  const { page } = await open(ctx);
  await toList(page);
  await page.click('#menuBtn');
  assert.ok(await page.isVisible('#menuPanel'));
  await page.click('#totals');   // zone neutre, hors du menu
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
  assert.ok(names.includes('exemple-la-ville-sous-la-pluie/univers/personnages/lia.md'));
  const scene = execFileSync('python3', ['-I', '-c', 'import sys,zipfile;print(zipfile.ZipFile(sys.argv[1]).read("exemple-la-ville-sous-la-pluie/chapitres/ouverture-le-quai.md").decode())', await dl.path()]).toString();
  assert.match(scene, /Texte exporté\./);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('recueil de chansons : création, réglages, sections, banque d\'idées', async () => {
  const ctx = await browser.newContext(IPHONE);
  const { page, errors } = await open(ctx);
  assert.equal(await page.locator('#ecrirePane.songs').count(), 0);

  await newSongbook(page, 'Premier album');
  assert.equal(await page.textContent('#projectName'), 'Premier album');
  assert.equal(await page.textContent('#tabItems'), 'Chansons');
  assert.equal(await page.textContent('#tabBank'), 'Idées');
  assert.equal(await page.textContent('#bigCount'), '01TITRES');
  await page.click('.card');
  assert.equal(await page.locator('#ecrirePane.songs').count(), 1);
  // Le titre est bien visible (sa hauteur ne doit pas être calculée écran caché).
  assert.equal(await page.inputValue('#sceneTitle'), 'Première chanson');
  assert.ok((await page.locator('#sceneTitle').boundingBox()).height > 25);
  assert.equal(await page.inputValue('#sceneText'), '## Couplet 1\n\n\n## Refrain\n\n');

  // Réglages : tonalité, tempo, mesure, statut, notes.
  await settings(page, [['note', 'A'], ['mode', 'min'], ['mesure', '6/8'], ['statut', 'revise']]);
  await page.fill('#tempoInput', '92');
  await page.fill('#notesInput', 'Réf : Bashung');
  await page.click('[data-set="tempo"][data-v="1"]');
  await page.click('#settingsOk');
  assert.match(await page.textContent('#facts'), /Am.*La mineur.*93.*BPM · 6\/8/);
  assert.equal(await page.textContent('#eyebrow'), 'Pop · Finie');

  // Section insérée à la fin, couplet numéroté.
  await page.fill('#sceneText', '## Couplet 1\nIl pleut sur la ville\n\n## Refrain\nEt je reste là');
  await page.click('#sectionBtn');
  await page.click('[data-sec="Couplet"]');
  await page.keyboard.type('Les heures creuses');
  assert.equal(await page.inputValue('#sceneText'),
    '## Couplet 1\nIl pleut sur la ville\n\n## Refrain\nEt je reste là\n\n## Couplet 2\nLes heures creuses');

  // Banque d'idées : catégories propres aux chansons, idée reconnue dans les paroles.
  await toList(page);
  await page.click('#tabBank');
  assert.deepEqual(await page.locator('#filters button').allTextContents(), ['Tout', 'Titres', 'Phrases', 'Images', 'Thèmes']);
  await page.click('#addEntry');
  await page.keyboard.type('heures creuses');
  assert.equal(await page.locator('.entry.hit').count(), 1);

  await page.waitForFunction(() => document.getElementById('saved').textContent === 'Enregistré');
  await page.reload();
  await page.waitForSelector('body.ready');
  assert.match(await page.textContent('#facts'), /Am.*93/);
  assert.match(await page.textContent('#mentions'), /heures creuses/);
  await page.click('#settingsBtn');
  assert.equal(await page.inputValue('#notesInput'), 'Réf : Bashung');
  assert.equal(await page.getAttribute('[data-set="statut"][data-v="revise"]', 'aria-checked'), 'true');
  assert.equal(await page.textContent('[data-set="statut"][data-v="revise"]'), 'Finie');
  await page.click('#settingsOk');

  // Retour au roman : vocabulaire et univers d'origine.
  await toList(page);
  await page.click('#projectBtn');
  await page.locator('#projectList button').first().click();
  await page.click('#projectsOk');
  assert.equal(await page.textContent('#tabItems'), 'Chapitres');
  assert.equal(await page.evaluate(() => document.body.dataset.universe), 'roman');
  assert.equal(await page.locator('#ecrirePane.songs').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('syllabes et rimes : affichage aligné sur le texte, styles, désactivation', async () => {
  const ctx = await browser.newContext(IPHONE);
  const { page, errors } = await open(ctx);
  // Fiction : pas d'analyse.
  assert.equal(await page.locator('#editor.analyse, #mirror .cnt, #mirror mark').count(), 0);
  await newSongbook(page);
  await page.click('.card');
  const text = [
    '## Couplet 1',
    'La petite fille',
    'Marche dans la ville',
    'Elle pense à toi',
    'Et rêve à ta voix',
    '',
    '## Couplet 2',
    'Une très longue ligne qui ne tient pas sur la largeur d\'un téléphone tranquille',
    'Je reste là',
  ].join('\n');
  await page.fill('#sceneText', text);
  const counts = () => page.locator('#mirror .ml:not(.h) .cnt').allTextContents();
  assert.deepEqual(await counts(), ['4', '4', '4', '5', '18/4', '3/4']);
  assert.deepEqual(await page.locator('#mirror .ml.h .cnt').allTextContents(), ['AABB', 'AB']);
  assert.equal(await page.locator('#mirror mark').count(), 6);   // fille, ville, tranquille ; toi, voix, là (assonance en pop)

  // La zone de texte ne défile jamais elle-même : elle a la hauteur du calque.
  const sizes = () => page.evaluate(() => {
    const ta = document.getElementById('sceneText'), m = document.getElementById('mirror');
    return { taScroll: ta.scrollHeight - ta.clientHeight, ta: ta.offsetHeight, m: m.offsetHeight };
  });
  let z = await sizes();
  assert.ok(z.taScroll <= 1, `la zone de texte défile de ${z.taScroll}px`);
  assert.equal(z.ta, z.m);
  const tops = await page.locator('#mirror .ml').evaluateAll(els => els.map(e => e.offsetTop));
  const lh = tops[2] - tops[1];
  assert.ok(tops[8] - tops[7] >= 2 * lh, 'la longue ligne doit faire au moins deux lignes');
  await page.screenshot({ path: process.env.SHOT_DIR ? `${process.env.SHOT_DIR}/analyse.png` : undefined });

  // Texte long : c'est le carton qui défile, et le calque reste collé au texte, jusqu'au bout.
  await page.fill('#sceneText', text + '\n\n## Refrain\n' + Array.from({ length: 40 }, (_, i) => i % 2 ? 'Je pense à toi' : 'Sous la pluie').join('\n') + '\n');
  z = await sizes();
  assert.ok(z.taScroll <= 1, `la zone de texte défile de ${z.taScroll}px`);
  assert.equal(z.ta, z.m);
  const offset = () => page.evaluate(() => document.getElementById('mirror').getBoundingClientRect().top - document.getElementById('sceneText').getBoundingClientRect().top);
  await page.evaluate(() => { const sc = document.getElementById('paperScroll'); sc.scrollTop = sc.scrollHeight; });
  assert.ok(await page.evaluate(() => document.getElementById('paperScroll').scrollTop > 500));
  assert.equal(await offset(), 0);
  // Le carton coupe ce qui dépasse de son arrondi.
  assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.paper')).overflow), 'hidden');
  await page.fill('#sceneText', text);

  // Chanson française : le e muet compte devant une consonne.
  await settings(page, [['style', 'chanson']]);
  await page.click('#settingsOk');
  assert.equal((await counts())[0], '5');

  // Désactivation, mémorisée.
  await page.click('#analyseBtn');
  assert.equal(await page.locator('#editor.analyse, #mirror .cnt, #mirror mark').count(), 0);
  await page.reload();
  await page.waitForSelector('body.ready');
  assert.equal(await page.locator('#editor.analyse, #mirror .cnt, #mirror mark').count(), 0);
  assert.equal(await page.textContent('#eyebrow'), 'Chanson française · Idée');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('roman : table des matières, page de manuscrit, objectifs, changement d\'univers', async () => {
  const ctx = await browser.newContext(IPHONE);
  const { page, errors } = await open(ctx);
  assert.equal(await page.evaluate(() => document.body.dataset.universe), 'roman');
  assert.equal(await page.textContent('#eyebrow'), 'CHAPITRE I');
  assert.equal(await page.textContent('#runningHead'), 'Exemple · La ville sous la pluie');

  // Objectifs : total et du jour ; les mots écrits aujourd'hui sont comptés.
  await page.click('#settingsBtn');
  await page.fill('#goalInput', '80000');
  await page.fill('#dailyInput', '1000');
  await page.click('#settingsOk');
  assert.match(await page.textContent('#goalText'), /^0 \/ 1\s000 mots aujourd'hui$/);
  await page.click('#sceneText');
  await page.keyboard.press('End');
  await page.keyboard.type(' Trois mots de plus.');
  assert.match(await page.textContent('#goalText'), /^4 \/ 1\s000/);

  // Table des matières : chiffres romains, chapitre en cours marqué.
  await toList(page);
  assert.deepEqual(await page.locator('.toc .num').allTextContents(), ['I.', 'II.', 'III.']);
  assert.equal(await page.locator('.toc.on .t').textContent(), 'Ouverture : le quai');
  assert.match(await page.textContent('#totals'), /objectif 80\s000/);

  // Nouveau chapitre : ajouté après le chapitre en cours, numéroté.
  await page.click('#addBtn');
  assert.equal(await page.textContent('#eyebrow'), 'CHAPITRE II');
  await toList(page);
  assert.equal(await page.locator('.toc').count(), 4);

  // Les objectifs survivent au rechargement.
  await page.waitForFunction(() => document.getElementById('saved').textContent === 'Enregistré');
  await page.reload();
  await page.waitForSelector('body.ready');
  assert.match(await page.textContent('#goalText'), /^4 \/ 1\s000/);

  // Changer l'univers du projet : roman -> chansons, et retour.
  await toList(page);
  await page.click('#projectBtn');
  await page.click('[data-kind="chansons"]');
  await page.click('#projectsOk');
  assert.equal(await page.evaluate(() => document.body.dataset.universe), 'chansons');
  assert.equal(await page.locator('.card').count(), 4);
  await page.click('#projectBtn');
  await page.click('[data-kind="roman"]');
  await page.click('#projectsOk');
  assert.equal(await page.locator('.toc').count(), 4);
  assert.deepEqual(errors, []);
  await ctx.close();
});
