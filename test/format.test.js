import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, countWords, parseDoc, stringifyDoc, projectToFiles, filesToProject,
  markdownToScene, markdownToFiche,
} from '../src/format.js';

const projet = {
  id: 'p1',
  titre: 'Les Marées de Vhal',
  description: 'Roman de SF.\n\nTome 1.',
  scenes: [
    { id: 's1', titre: 'Ouverture : la tempête', statut: 'brouillon', texte: 'Il pleuvait.\n\n— « Encore ? » dit-elle.\n' },
    { id: 's2', titre: 'Ouverture : la tempête', statut: 'idee', texte: '' },
    { id: 's3', titre: 'true', statut: 'revise', texte: '---\nPas un front matter.\n  ' },
  ],
  fiches: [
    { id: 'f1', type: 'personnage', nom: 'Léna Ardent', alias: ['Léna', 'la Capitaine', 'L: "A"'], notes: 'Pilote.' },
    { id: 'f2', type: 'lieu', nom: 'Vhal', alias: [], notes: '' },
    { id: 'f3', type: 'lore', nom: '2077', alias: ['#1'], notes: 'Date clé.' },
  ],
};

test('slugify', () => {
  assert.equal(slugify('Ouverture : la tempête !'), 'ouverture-la-tempete');
  assert.equal(slugify('   '), 'sans-titre');
});

test('countWords', () => {
  assert.equal(countWords("L'aube d'Ys — c'est arrivé, peut-être."), 5);
  assert.equal(countWords(''), 0);
});

test('aller-retour complet du projet', () => {
  const files = projectToFiles(projet);
  assert.deepEqual([...files.keys()].sort(), [
    'bible/lieux/vhal.md',
    'bible/lore/2077.md',
    'bible/personnages/lena-ardent.md',
    'projet.md',
    'scenes/ouverture-la-tempete-2.md',
    'scenes/ouverture-la-tempete.md',
    'scenes/true.md',
  ]);
  const back = filesToProject(files);
  assert.equal(back.titre, projet.titre);
  assert.equal(back.description, projet.description);
  assert.deepEqual(back.scenes.map(({ fichier, ...s }) => s), projet.scenes);
  const sortById = a => [...a].sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(sortById(back.fiches).map(({ fichier, ...f }) => f), projet.fiches);
  // Second passage : fichiers identiques (noms stables).
  assert.deepEqual(projectToFiles(back), files);
});

test('lisible à la main', () => {
  const files = projectToFiles(projet);
  assert.equal(files.get('scenes/ouverture-la-tempete.md'),
    '---\nid: s1\ntitre: "Ouverture : la tempête"\nstatut: brouillon\n---\n\nIl pleuvait.\n\n— « Encore ? » dit-elle.\n');
  assert.equal(files.get('bible/personnages/lena-ardent.md'),
    '---\nid: f1\nnom: Léna Ardent\nalias:\n  - Léna\n  - la Capitaine\n  - "L: \\"A\\""\n---\n\nPilote.');
});

test('le nom de fichier ne change pas quand le titre change', () => {
  const back = filesToProject(projectToFiles(projet));
  back.scenes[0].titre = 'Nouveau titre';
  assert.ok(projectToFiles(back).has('scenes/ouverture-la-tempete.md'));
});

test('fichiers édités à la main : tolérance', () => {
  const p = filesToProject({
    'projet.md': '---\ntitre: Court\nscenes: [b, disparue]\n---\n',
    'scenes/a.md': 'Juste du texte, sans en-tête.',
    'scenes/b.md': "---\r\ntitre: 'L''arrivée'\r\nstatut: Révisé\r\n---\r\nTexte.\r\n",
    'bible/personnages/max.md': '---\nnom: Max\nalias: Maxou\n---\n',
    'bible/inconnu/x.md': 'ignoré',
    'notes.txt': 'ignoré',
  });
  assert.deepEqual(p.scenes.map(s => [s.fichier, s.titre, s.statut, s.texte]), [
    ['b', "L'arrivée", 'revise', 'Texte.\n'],
    ['a', 'a', 'idee', 'Juste du texte, sans en-tête.'],
  ]);
  assert.ok(p.scenes.every(s => s.id));
  assert.deepEqual(p.fiches.map(f => [f.type, f.nom, f.alias]), [['personnage', 'Max', ['Maxou']]]);
});

test('parseDoc sans front matter', () => {
  assert.deepEqual(parseDoc('Bonjour'), { data: {}, body: 'Bonjour' });
  assert.deepEqual(parseDoc(stringifyDoc({ a: 'b' }, '')), { data: { a: 'b' }, body: '' });
});

test('valeurs par défaut', () => {
  assert.equal(markdownToScene('---\nstatut: inconnu\n---\n').statut, 'idee');
  assert.deepEqual(markdownToFiche('', 'lieu', 'Port').alias, []);
});
