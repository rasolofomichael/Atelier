import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

// Oublier un fichier dans le cache du service worker casserait l'app hors ligne.
test('le service worker met en cache tous les fichiers de l\'app', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const assets = [...sw.match(/const ASSETS = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  for (const a of assets) if (a !== './') assert.ok(existsSync(a), `${a} n'existe pas`);
  const expected = ['index.html', 'styles.css', 'manifest.webmanifest',
    ...['src', 'fonts', 'icons'].flatMap(d => readdirSync(d).map(f => `${d}/${f}`))];
  for (const f of expected) assert.ok(assets.includes(f), `${f} manque dans ASSETS de sw.js`);
});

test('le manifeste référence des icônes existantes', () => {
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  for (const i of m.icons) assert.ok(existsSync(i.src), i.src);
});
