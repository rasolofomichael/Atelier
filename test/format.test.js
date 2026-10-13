import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  slugify, countWords, parseDoc, stringifyDoc, projectToFiles, filesToProject,
  markdownToScene, markdownToFiche,
} from '../src/format.js';

const projet = {
  id: 'p1',
  name: 'Les Marées de Vhal',
  description: 'Roman de SF.\n\nTome 1.',
  scenes: [
    { id: 's1', title: 'Ouverture : la tempête', status: 'brouillon', text: 'Il pleuvait.\n\n— « Encore ? » dit-elle.\n' },
    { id: 's2', title: 'Ouverture : la tempête', status: 'idee', text: '' },
    { id: 's3', title: 'true', status: 'revise', text: '---\nPas un front matter.\n  ' },
  ],
  bible: [
    { id: 'f1', type: 'Personnage', name: 'Léna Ardent', alias: 'Léna, la Capitaine, L: "A"', notes: 'Pilote.' },
    { id: 'f2', type: 'Lieu', name: 'Vhal', alias: '', notes: '' },
    { id: 'f3', type: 'Lore', name: '2077', alias: '#1', notes: 'Date clé.' },
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
    'chapitres/ouverture-la-tempete-2.md',
    'chapitres/ouverture-la-tempete.md',
    'chapitres/true.md',
    'projet.md',
    'univers/lieux/vhal.md',
    'univers/lore/2077.md',
    'univers/personnages/lena-ardent.md',
  ]);
  const back = filesToProject(files);
  assert.equal(back.name, projet.name);
  assert.equal(back.description, projet.description);
  assert.deepEqual(back.scenes.map(({ file, ...s }) => s), projet.scenes);
  assert.equal(back.sceneId, 's1');
  const sortById = a => [...a].sort((x, y) => x.id.localeCompare(y.id));
  assert.deepEqual(sortById(back.bible).map(({ file, ...f }) => f), projet.bible);
  // Second passage : fichiers identiques (noms stables).
  assert.deepEqual(projectToFiles(back), files);
});

test('lisible à la main', () => {
  const files = projectToFiles(projet);
  assert.equal(files.get('chapitres/ouverture-la-tempete.md'),
    '---\nid: s1\ntitre: "Ouverture : la tempête"\nstatut: brouillon\n---\n\nIl pleuvait.\n\n— « Encore ? » dit-elle.\n');
  assert.equal(files.get('univers/personnages/lena-ardent.md'),
    '---\nid: f1\nnom: Léna Ardent\nalias:\n  - Léna\n  - la Capitaine\n  - "L: \\"A\\""\n---\n\nPilote.');
});

test('le nom de fichier ne change pas quand le titre change', () => {
  const back = filesToProject(projectToFiles(projet));
  back.scenes[0].title = 'Nouveau titre';
  assert.ok(projectToFiles(back).has('chapitres/ouverture-la-tempete.md'));
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
  assert.deepEqual(p.scenes.map(s => [s.file, s.title, s.status, s.text]), [
    ['b', "L'arrivée", 'revise', 'Texte.\n'],
    ['a', 'a', 'idee', 'Juste du texte, sans en-tête.'],
  ]);
  assert.ok(p.scenes.every(s => s.id));
  assert.deepEqual(p.bible.map(f => [f.type, f.name, f.alias]), [['Personnage', 'Max', 'Maxou']]);
});

test('parseDoc sans front matter', () => {
  assert.deepEqual(parseDoc('Bonjour'), { data: {}, body: 'Bonjour' });
  assert.deepEqual(parseDoc(stringifyDoc({ a: 'b' }, '')), { data: { a: 'b' }, body: '' });
});

test('valeurs par défaut', () => {
  assert.equal(markdownToScene('---\nstatut: inconnu\n---\n').status, 'idee');
  assert.equal(markdownToFiche('', 'Lieu', 'Port').alias, '');
});

test('notes sur plusieurs lignes : bloc lisible et aller-retour exact', async () => {
  const { stringifyFrontMatter, parseFrontMatter } = await import('../src/format.js');
  for (const notes of ['Une ligne', 'Deux\nlignes', 'Fin\n', 'A\n\nB\n', '  indenté', 'x\n\n', '---\n', 'a: b\n# pas un commentaire\n  - pas une liste']) {
    assert.deepEqual(parseFrontMatter(stringifyFrontMatter({ notes, apres: 'ok' })), { notes, apres: 'ok' }, JSON.stringify(notes));
  }
  assert.equal(stringifyFrontMatter({ notes: 'Intention :\nballade\n' }), 'notes: |\n  Intention :\n  ballade');
});

test('projet de chansons : fichiers et aller-retour', () => {
  const recueil = {
    id: 'r1', name: 'Premier album', kind: 'chansons', description: '',
    scenes: [
      { id: 'c1', title: 'Ville sous la pluie', status: 'brouillon', color: 'moutarde', text: '## Couplet 1\nIl pleut sur la ville\n\n## Refrain\nEt je reste là\n',
        style: 'chanson', key: 'Am', tempo: '92', meter: '4/4', notes: 'Réf : Bashung.\nGuitare sèche.' },
      { id: 'c2', title: 'Sans tonalité', status: 'idee', text: '', style: '', key: '', tempo: '', meter: '', notes: '' },
    ],
    bible: [
      { id: 'i1', type: 'Titre', name: 'Les heures creuses', alias: '', notes: '' },
      { id: 'i2', type: 'Thème', name: 'Le départ', alias: 'partir, quitter', notes: '' },
    ],
  };
  const files = projectToFiles(recueil);
  assert.deepEqual([...files.keys()].sort(), [
    'chansons/sans-tonalite.md', 'chansons/ville-sous-la-pluie.md',
    'idees/themes/le-depart.md', 'idees/titres/les-heures-creuses.md', 'projet.md',
  ]);
  assert.equal(files.get('chansons/ville-sous-la-pluie.md'),
    '---\nid: c1\ntitre: Ville sous la pluie\nstatut: brouillon\ncouleur: moutarde\nstyle: chanson\ntonalite: Am\ntempo: "92"\nmesure: "4/4"\nnotes: |-\n  Réf : Bashung.\n  Guitare sèche.\n---\n\n## Couplet 1\nIl pleut sur la ville\n\n## Refrain\nEt je reste là\n');
  assert.match(files.get('projet.md'), /type: chansons\nchansons:\n  - ville-sous-la-pluie/);
  const back = filesToProject(files);
  assert.equal(back.kind, 'chansons');
  assert.deepEqual(back.scenes.map(({ file, ...s }) => s), recueil.scenes);
  const byId = a => [...a].sort((x, y) => x.id.localeCompare(y.id)).map(({ file, ...f }) => f);
  assert.deepEqual(byId(back.bible), recueil.bible);
});

test('ancien export « fiction » (scenes/, bible/) lu comme un roman', () => {
  const p = filesToProject({
    'projet.md': '---\ntitre: Vieux projet\nscenes:\n  - un\n---\n',
    'scenes/un.md': '---\ntitre: Un\n---\nTexte',
    'bible/lieux/port.md': '---\nnom: Port\n---\n',
  });
  assert.equal(p.kind, 'roman');
  assert.deepEqual(p.scenes.map(s => s.title), ['Un']);
  assert.deepEqual(p.bible.map(f => [f.type, f.name]), [['Lieu', 'Port']]);
  // Réécrit au nouveau format.
  assert.deepEqual([...projectToFiles(p).keys()].sort(), ['chapitres/un.md', 'projet.md', 'univers/lieux/port.md']);
});

test('roman : objectifs de mots conservés', () => {
  const files = projectToFiles({ ...projet, kind: 'roman', goal: 80000, dailyGoal: 1000 });
  assert.match(files.get('projet.md'), /type: roman\nobjectif: "80000"\nobjectif_jour: "1000"/);
  const back = filesToProject(files);
  assert.equal(back.goal, 80000);
  assert.equal(back.dailyGoal, 1000);
});
