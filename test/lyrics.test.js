import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countSyllables, rhymeOf, analyzeLyrics, analyzeWord } from '../src/lyrics.js';

const W = w => analyzeWord(w).count;

test('syllabes par mot', () => {
  const cases = {
    amour: 2, ville: 1, pluie: 1, nuit: 1, oiseau: 2, aujourd: 2, hui: 1, aimée: 2, vie: 1,
    réel: 2, poète: 2, noël: 2, maïs: 2, payer: 2, voyage: 2, tuer: 2, nuage: 2, jouer: 2, joue: 1,
    crier: 2, oublier: 3, client: 2, créer: 2, créée: 2, guerre: 1, quelque: 1, mangeait: 2,
    nation: 2, chantent: 1, aiment: 1, moment: 2, souvent: 2, doucement: 3, voient: 1,
    le: 1, les: 1, des: 1, je: 1, eau: 1, feu: 1, toi: 1, rue: 1, pays: 1,
  };
  const wrong = Object.entries(cases).filter(([w, n]) => W(w) !== n).map(([w, n]) => `${w}: ${W(w)} au lieu de ${n}`);
  assert.deepEqual(wrong, []);
});

test('syllabes par vers, pop et chanson française', () => {
  const cases = [
    // [vers, pop, chanson]
    ['Il pleut sur la ville', 5, 5],
    ['La petite fille', 4, 5],
    ['Une belle histoire', 4, 5],             // « belle » s'élide devant « histoire »
    ['Elle a les yeux revolver', 7, 7],
    ['Les sanglots longs des violons', 7, 7],
    ['Je reste là', 3, 4],
    ['Je ne suis pas ta chose', 6, 6],        // « chose » en fin de vers
    ["Et j'entends siffler le train", 7, 7],
    ['Ils chantent toute la nuit', 5, 7],     // -ent compte devant consonne en chanson
    ['[Am]Il pleut [G]sur la ville (oh oh)', 5, 5],
  ];
  const wrong = [];
  for (const [line, pop, chanson] of cases) {
    const p = countSyllables(line, 'pop'), c = countSyllables(line, 'chanson');
    if (p !== pop || c !== chanson) wrong.push(`${line} -> pop ${p}/${pop}, chanson ${c}/${chanson}`);
  }
  assert.deepEqual(wrong, []);
});

test('rimes', () => {
  const same = (a, b) => assert.equal(rhymeOf(a).key, rhymeOf(b).key, `${a} / ${b} : ${rhymeOf(a).key} ≠ ${rhymeOf(b).key}`);
  const differ = (a, b) => assert.notEqual(rhymeOf(a).key, rhymeOf(b).key, `${a} / ${b}`);
  same('avec toi', 'pour moi');
  same('près de toi', 'ta voix');
  same('mon amour', 'pour toujours');
  same('le soleil', 'pareil');
  same('aimer', 'été');
  same('pleurer', 'la journée');
  same('la ville', 'tranquille');
  same('belle', 'elle');
  same('la nuit', 'la pluie');
  same('le temps', 'avant');
  same('le vent', 'souvent');
  same('demain', 'chemin');
  same('la mer', "l'hiver");
  same('la fille', 'brille');
  same('ils chantent', 'tente');
  differ('la ville', 'la vie');
  differ('le soir', 'toi');
  assert.equal(rhymeOf('la ville').nucleus, rhymeOf('la vie').nucleus);   // assonance
});

test('analyse complète : sections, schéma, couleurs, symétrie', () => {
  const text = [
    '## Couplet 1',
    'Il pleut sur la ville',
    'Je marche sans toi',
    'Les rues sont tranquilles',
    'Je pense à ta voix',
    '',
    '## Refrain',
    'Reviens mon amour',
    'Pour toujours',
    '',
    '## Couplet 2',
    'Le ciel est gris',
    'Je suis là pour toi',
  ].join('\n');
  const rows = analyzeLyrics(text, 'chanson');
  const heads = rows.filter(r => r.kind === 'heading');
  assert.deepEqual(heads.map(h => [h.name, h.schema]), [['Couplet 1', 'ABAB'], ['Refrain', 'AA'], ['Couplet 2', 'AB']]);
  const lyr = rows.filter(r => r.kind === 'lyric');
  assert.equal(lyr[0].group, lyr[2].group);            // ville / tranquilles
  assert.equal(lyr[1].group, lyr[3].group);            // toi / voix
  assert.equal(lyr[1].group, lyr[7].group);            // même rime dans un autre couplet : même couleur
  assert.equal(lyr[6].group, null);                    // « gris » : rime isolée
  assert.equal(lyr[6].ref, 5);                         // comparé à la 1re ligne du couplet 1
  assert.equal(rows.length, text.split('\n').length);
});
