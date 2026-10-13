// Analyse de paroles en français : syllabes et rimes.
// Règles approximatives, pensées pour aider à l'écriture, pas pour trancher.
//
// Deux styles de compte :
//   'pop'     : comme on parle — le e muet de fin de mot ne compte pas.
//   'chanson' : le e muet compte devant une consonne, jamais en fin de vers
//               ni devant une voyelle (élision).

const VOWELS = 'aeiouyàâäéèêëîïôöùûüœæ';
const isVowel = c => VOWELS.includes(c);

// H aspiré : pas d'élision devant ces mots.
const H_ASPIRE = new Set(['hache', 'haie', 'haine', 'haïr', 'hall', 'halte', 'hamac', 'hameau', 'hanche', 'hangar', 'hanter', 'harpe', 'hasard', 'hâte', 'haut', 'haute', 'hauteur', 'héros', 'hérisson', 'hêtre', 'hibou', 'hideux', 'hockey', 'homard', 'honte', 'hors', 'houle', 'housse', 'hublot', 'huer', 'huit', 'hurler', 'hutte']);

// Mots en -ent où la finale se prononce (sinon -ent est traité comme une terminaison verbale muette).
const ENT_SONORE = new Set(['moment', 'souvent', 'comment', 'parent', 'parents', 'argent', 'accent', 'absent', 'présent', 'content', 'talent', 'serpent', 'torrent', 'client', 'patient', 'prudent', 'ardent', 'urgent', 'violent', 'innocent', 'évident', 'différent', 'récent', 'adolescent', 'continent', 'événement', 'vraiment', 'gent', 'dent', 'vent', 'cent', 'lent', 'sent', 'ment', 'rent', 'tent', 'fréquent', 'silent', 'orient', 'occident', 'accident', 'incident', 'serment', 'tourment', 'ciment', 'aliment', 'piment', 'sentiment', 'compliment', 'régiment']);

const PRONOUNCED_ENT = /(?:e|é|a|u)mment$|[eé]ment$|[^a]iment$|ument$/;

// Découpe une ligne en mots (l'apostrophe sépare : « l'amour » -> « l », « amour »).
export function words(line) {
  return clean(line).toLowerCase().split(/[^\p{L}\-]+|-/u).filter(Boolean);
}

// Retire les accords [Am] et les chœurs entre parenthèses.
export function clean(line) {
  return String(line).replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, ' ');
}

function normalizeSpelling(w) {
  return w
    .replace(/qu(?=[aeiouyàâéèêîïôû])/g, 'k')
    .replace(/gu(?=[eéèêiîy])/g, 'g')
    .replace(/ge(?=[aoâôu])/g, 'g');
}

// Analyse d'un mot : nombre de syllabes sans le e muet final, et type de e muet final.
export function analyzeWord(word) {
  const w0 = word.toLowerCase();
  let w = normalizeSpelling(w0);
  let mute = null;
  const vowelGroupsIn = s => countGroups(s) > 0;

  if (w.endsWith('ent') && w.length > 3 && !ENT_SONORE.has(w0) && !PRONOUNCED_ENT.test(w0)) {
    const stem = w.slice(0, -3);
    if (vowelGroupsIn(stem)) {
      if (isVowel(stem.at(-1))) w = stem;            // « voient », « jouent » : rien à compter
      else { w = stem; mute = 'ent'; }
    }
  } else if (/es?$/.test(w) && !/[éè]s?$/.test(w)) {
    const stem = w.replace(/es?$/, '');
    if (stem && vowelGroupsIn(stem)) {
      if (isVowel(stem.at(-1))) w = stem;            // « vie », « aimée », « joies »
      else { w = stem; mute = w0.endsWith('s') ? 'es' : 'e'; }
    }
  }
  let count = countGroups(w);
  if (count === 0 && mute) { count = 1; mute = null; }
  return { count, mute, vowelStart: startsWithVowelSound(w0) };
}

function startsWithVowelSound(w) {
  if (H_ASPIRE.has(w)) return false;
  return isVowel(w[0]) || w[0] === 'h';
}

// Compte les groupes de voyelles, avec les principales règles de hiatus du français.
function countGroups(w) {
  let groups = 0, inRun = false, run = '';
  for (let i = 0; i < w.length; i++) {
    const c = w[i], next = w[i + 1] ?? '';
    if (!isVowel(c)) { inRun = false; run = ''; continue; }
    let split = !inRun;
    if (inRun) {
      const prev = run.at(-1);
      if ('ëïü'.includes(c)) split = true;                                    // Noël, maïs
      else if ('éè'.includes(c)) split = true;                                // réel, poète, aérer
      else if (c === 'y' && isVowel(next)) split = true;                      // pa-yer, vo-yage
      else if (prev === 'u' && run.length === 1 && c !== 'i') split = true;   // tu-er, nu-age, lu-eur
      else if (run === 'ou' && c !== 'i' && !(c === 'e' && !next)) split = true;   // jou-er (mais « joue »)
      else if (prev === 'i' && run.length === 1 && /[bcdfgkptv][rl]$/.test(w.slice(0, i - 1))) split = true;  // cri-er, oubli-er
      else if (prev === 'é' && !(c === 'e' && /^s?$/.test(w.slice(i + 1)))) split = true;  // cré-er (mais « aimée »)
    }
    if (split) { groups++; run = c; } else run += c;
    inRun = true;
  }
  return groups;
}

// Nombre de syllabes d'une ligne, selon le style.
export function countSyllables(line, style = 'pop') {
  const ws = words(line).map(analyzeWord);
  let total = 0;
  ws.forEach((w, i) => {
    total += w.count;
    if (!w.mute || style !== 'chanson') return;
    const next = ws.slice(i + 1).find(x => x.count > 0 || x.mute);
    if (!next) return;                                  // fin de vers
    if (w.mute === 'e' && next.vowelStart) return;      // élision
    total += 1;
  });
  return total;
}

// ---------- phonétique approximative (pour les rimes) ----------

const ER_OUVERT = new Set(['mer', 'fer', 'ver', 'cher', 'fier', 'hier', 'hiver', 'enfer', 'amer', 'super', 'cancer', 'laser', 'revolver', 'éther']);
const ILLE_L = new Set(['ville', 'villes', 'mille', 'tranquille', 'tranquilles']);

// Renvoie une liste de sons : voyelles en MAJUSCULES, consonnes en minuscules.
export function phonemes(word) {
  const w0 = word.toLowerCase();
  let w = normalizeSpelling(w0);
  let keepFinal = false;

  if (ER_OUVERT.has(w)) return [...w.slice(0, -2).replace(/[^a-z]/g, '')].map(c => isVowel(c) ? c.toUpperCase() : c).concat(['È', 'r']);
  if (w.endsWith('ent') && w.length > 3 && !ENT_SONORE.has(w0) && !PRONOUNCED_ENT.test(w0) && countGroups(w.slice(0, -3)) > 0) {
    w = w.slice(0, -3); keepFinal = true;
  } else if (/[^éè]es?$/.test(w) && countGroups(w.replace(/es?$/, '')) > 0) {
    w = w.replace(/es?$/, ''); keepFinal = !isVowel(w.at(-1));
  }
  if (!keepFinal) {
    if (/[^aeiouy]er$/.test(w) || /ez$/.test(w)) w = w.slice(0, -2) + 'é';
    else if (/et$/.test(w) && w.length > 2) w = w.slice(0, -2) + 'è';
    else w = w.replace(/[sxztdpg]+$/, '') || w;
  }

  const out = [];
  const nasalOk = i => { const n = w[i]; return !n || (!isVowel(n) && n !== 'n' && n !== 'm'); };
  for (let i = 0; i < w.length;) {
    const rest = w.slice(i);
    const m = (re) => rest.match(re)?.[0];
    let t;
    if ((t = m(/^eau/))) out.push('O');
    else if ((t = m(/^(ain|aim|ein|eim)/)) && nasalOk(i + t.length)) out.push('IN');
    else if ((t = m(/^ien/)) && nasalOk(i + 3)) out.push('I', 'IN');
    else if ((t = m(/^oin/)) && nasalOk(i + 3)) out.push('w', 'IN');
    else if ((t = m(/^(ai|ei|ê|è|ë)/))) out.push('È');
    else if ((t = m(/^(oi|oî)/))) out.push('w', 'A');
    else if ((t = m(/^(ou|oû|où)/))) out.push('OU');
    else if ((t = m(/^(œu|eu|eû|œ)/))) out.push('EU');
    else if ((t = m(/^au/))) out.push('O');
    else if ((t = m(/^(an|am|en|em)/)) && nasalOk(i + 2)) out.push('AN');
    else if ((t = m(/^(in|im|yn|ym|un|um)/)) && nasalOk(i + 2)) out.push('IN');
    else if ((t = m(/^(on|om)/)) && nasalOk(i + 2)) out.push('ON');
    else if ((t = m(/^é/))) out.push('É');
    else if ((t = m(/^e/))) {
      const after = w.slice(i + 1);
      out.push(/^([bcdfgklmnpqrstvxz])\1|^[bcdfgklmnpqrstvxz]$|^x|^[bcdfgklmnpqrstvz]{2}/.test(after) ? 'È' : 'Ə');
    }
    else if ((t = m(/^[aàâ]/))) out.push('A');
    else if ((t = m(/^[iîïy]/))) {
      if (t === 'i' && w.slice(i, i + 3) === 'ill' && !ILLE_L.has(w0) && i > 0) { out.push('I', 'y'); t = 'ill'; }
      else out.push('I');
    }
    else if ((t = m(/^[oôö]/))) out.push('O');
    else if ((t = m(/^[uûü]/))) out.push('U');
    // consonnes
    else if ((t = m(/^ch/))) out.push('ch');
    else if ((t = m(/^ph/))) out.push('f');
    else if ((t = m(/^gn/))) out.push('ny');
    else if ((t = m(/^th/))) out.push('t');
    else if ((t = m(/^([bcdfgklmnprstvz])\1/))) out.push(t[0] === 'c' ? 'k' : t[0]);
    else if ((t = m(/^c(?=[eiéèêy])/)) || (t = m(/^ç/))) out.push('s');
    else if ((t = m(/^c/))) out.push('k');
    else if ((t = m(/^g(?=[eiéèêy])/))) out.push('j');
    else if ((t = m(/^s/))) out.push(i > 0 && isVowel(w[i - 1]) && isVowel(w[i + 1] ?? '') ? 'z' : 's');
    else if ((t = m(/^x/))) out.push('k', 's');
    else if ((t = m(/^h/))) { /* muet */ }
    else { t = rest[0]; if (/[a-z]/.test(t)) out.push(t); }
    i += t.length;
  }
  // Un e caduc final ne porte pas la rime.
  while (out.length > 1 && out.at(-1) === 'Ə') out.pop();
  return out;
}

const isVowelSound = p => p === p.toUpperCase();

// Rime d'une ligne : voyelle finale (noyau) et consonnes qui suivent (coda).
export function rhymeOf(line) {
  const ws = words(line);
  const last = ws.at(-1);
  if (!last) return null;
  const ph = phonemes(last);
  let k = ph.length - 1;
  while (k >= 0 && !isVowelSound(ph[k])) k--;
  if (k < 0) return null;
  return { word: last, nucleus: ph[k], coda: ph.slice(k + 1).join(''), key: ph.slice(k).join('-') };
}

// ---------- analyse d'un texte complet ----------

const HEADING = /^\s*##\s*(.*)$/;

// Renvoie une entrée par ligne du texte :
//   { kind: 'heading', name, schema } | { kind: 'lyric', syllables, rhyme, group, letter, ref } | { kind: 'blank' }
// - group : numéro de rime dans la chanson (même couleur partout), null si la rime est isolée
// - letter : lettre de la rime dans sa section (A, B…)
// - ref : nombre de syllabes de la ligne correspondante du premier couplet (pour la symétrie)
export function analyzeLyrics(text, style = 'pop') {
  const lines = String(text).split('\n');
  const rows = [];
  const sections = [];
  let current = null;
  for (const line of lines) {
    const h = line.match(HEADING);
    if (h) {
      current = { name: h[1].trim(), rows: [] };
      sections.push(current);
      rows.push({ kind: 'heading', name: current.name, section: current });
      continue;
    }
    if (!clean(line).trim() || !words(line).length) { rows.push({ kind: 'blank' }); continue; }
    if (!current) { current = { name: '', rows: [] }; sections.push(current); }
    const rhyme = rhymeOf(line);
    const row = { kind: 'lyric', syllables: countSyllables(line, style), rhyme, section: current };
    current.rows.push(row);
    rows.push(row);
  }

  // Pop : rime par la voyelle finale (assonance). Chanson : voyelle + consonnes.
  const keyOf = r => r.rhyme ? (style === 'chanson' ? r.rhyme.nucleus + '|' + r.rhyme.coda : r.rhyme.nucleus) : null;
  const counts = new Map();
  for (const r of rows) if (r.kind === 'lyric') { const k = keyOf(r); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); }
  const groups = new Map();
  for (const r of rows) {
    if (r.kind !== 'lyric') continue;
    const k = keyOf(r);
    r.group = k && counts.get(k) > 1 ? (groups.has(k) ? groups.get(k) : groups.set(k, groups.size).get(k)) : null;
  }
  for (const s of sections) {
    const letters = new Map();
    for (const r of s.rows) {
      const k = keyOf(r) ?? Symbol();
      if (!letters.has(k)) letters.set(k, String.fromCharCode(65 + (letters.size % 26)));
      r.letter = letters.get(k);
    }
    s.schema = s.rows.map(r => r.letter).join('');
  }
  // Symétrie : chaque couplet comparé au premier, ligne à ligne (même chose pour les refrains).
  const base = new Map();
  for (const s of sections) {
    const type = s.name.toLowerCase().replace(/\s*\d+\s*$/, '');
    if (!type) continue;
    if (!base.has(type)) { base.set(type, s); continue; }
    s.rows.forEach((r, i) => { const ref = base.get(type).rows[i]; if (ref) r.ref = ref.syllables; });
  }
  for (const r of rows) if (r.kind === 'heading') r.schema = r.section.schema;
  return rows;
}
