import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createZip, crc32 } from '../src/zip.js';
import { workspaceToFiles, filesToProject } from '../src/format.js';

test('crc32', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('archive lisible par un outil standard (zipfile de Python)', () => {
  const files = new Map([
    ['roman/projet.md', '---\ntitre: Roman\n---\n'],
    ['roman/scenes/l-été.md', 'Accents : é à ç — « guillemets »\n'],
    ['roman/vide.md', ''],
  ]);
  const path = join(mkdtempSync(join(tmpdir(), 'atelier-')), 'test.zip');
  writeFileSync(path, createZip(files));
  const out = execFileSync('python3', ['-I', '-c', `
import json, sys, zipfile
z = zipfile.ZipFile(sys.argv[1])
assert z.testzip() is None
print(json.dumps({n: z.read(n).decode('utf-8') for n in z.namelist()}))`, path]);
  assert.deepEqual(JSON.parse(out), Object.fromEntries(files));
});

test('tous les projets, un dossier chacun, relisibles', () => {
  const state = { projects: [
    { id: 'a', name: 'Même nom', scenes: [{ id: 's', title: 'Un', status: 'idee', text: 'Texte A' }], bible: [] },
    { id: 'b', name: 'Même nom', scenes: [{ id: 't', title: 'Un', status: 'revise', text: 'Texte B' }],
      bible: [{ id: 'f', type: 'Lieu', name: 'Port', alias: 'le port', notes: '' }] },
  ] };
  const files = workspaceToFiles(state);
  assert.deepEqual([...files.keys()].sort(), [
    'meme-nom-2/chapitres/un.md', 'meme-nom-2/projet.md', 'meme-nom-2/univers/lieux/port.md',
    'meme-nom/chapitres/un.md', 'meme-nom/projet.md',
  ]);
  const sub = new Map([...files].filter(([p]) => p.startsWith('meme-nom-2/')).map(([p, c]) => [p.slice(11), c]));
  const back = filesToProject(sub);
  assert.equal(back.scenes[0].text, 'Texte B');
  assert.equal(back.bible[0].alias, 'le port');
});
