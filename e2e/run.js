// Tests de bout en bout dans Chromium : npm run test:e2e
import { spawn } from 'node:child_process';
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const PORT = 8123;
const URL = `http://localhost:${PORT}/`;
let server, browser;

before(async () => {
  server = spawn(process.execPath, ['scripts/serve.js'], { env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
  await new Promise(r => server.stdout.once('data', r));
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

  await page.click('#backupBtn');
  await page.waitForSelector('#backupDlg[open]');
  const rows = page.locator('#backupList .backup');
  assert.match(await rows.last().textContent(), /migration depuis le prototype/);
  const restore = rows.last().locator('button');
  await restore.click();
  assert.equal(await restore.textContent(), 'Confirmer ?');
  await restore.click();
  await page.waitForFunction(() => !document.getElementById('backupDlg').open);
  assert.equal(await page.inputValue('#sceneText'), 'Texte écrit dans le prototype.');

  // La version d'avant la restauration est elle-même gardée.
  await page.click('#backupBtn');
  await page.waitForSelector('#backupDlg[open]');
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
  await page.click('#backupBtn');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlJson')]);
  assert.match(dl.suggestedFilename(), /^atelier-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}\.json$/);
  const path = await dl.path();

  await page.click('#closeDlg');
  await page.fill('#sceneText', 'Modifié après export.');
  await page.click('#backupBtn');
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
