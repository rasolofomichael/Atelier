// Format Markdown d'un projet Atelier : conversion projet <-> fichiers.
// Voir FORMAT.md pour la description du format.
// Module sans dépendance, utilisable dans le navigateur et dans Node.

export const STATUTS = ['idee', 'brouillon', 'revise'];

// ---------- utilitaires ----------

export function slugify(text) {
  const slug = String(text ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
  return slug || 'sans-titre';
}

export function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// Choisit un nom de fichier libre : "slug", puis "slug-2", "slug-3"…
export function uniqueName(base, taken) {
  let name = base;
  for (let i = 2; taken.has(name); i++) name = `${base}-${i}`;
  taken.add(name);
  return name;
}

function normalizeStatut(value) {
  const v = String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  return STATUTS.includes(v) ? v : 'idee';
}

export function countWords(text) {
  const m = String(text ?? '').match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return m ? m.length : 0;
}

// ---------- front matter (sous-ensemble de YAML) ----------
// Valeurs prises en charge : chaînes (y compris sur plusieurs lignes, « key: | »)
// et listes de chaînes.

const RESERVED = /^(true|false|yes|no|on|off|null|~)$/i;

function yamlString(value) {
  const s = String(value);
  const plain = /^[\p{L}\p{N}_][\p{L}\p{N}_ '’.,!?()\-–—]*$/u.test(s)
    && !/\s$/.test(s) && !RESERVED.test(s) && !/^[\d.+-]/.test(s);
  return plain ? s : JSON.stringify(s);
}

function yamlScalar(raw) {
  const s = raw.trim();
  if (s.startsWith('"')) {
    try { return JSON.parse(s); } catch { return s.slice(1, -1); }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  return s.replace(/\s+#.*$/, '');
}

// Texte sur plusieurs lignes écrit en bloc lisible, sauf cas limites (alors entre guillemets).
function isBlock(value) {
  const v = String(value);
  return v.includes('\n') && !/^\s/.test(v) && !/\n\s*\n$/.test(v) && !/\n\s+$/.test(v.replace(/\n$/, ''));
}

export function stringifyFrontMatter(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (!value.length) { lines.push(`${key}: []`); continue; }
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlString(item)}`);
    } else if (isBlock(value)) {
      const v = String(value);
      lines.push(`${key}: ${v.endsWith('\n') ? '|' : '|-'}`);
      for (const l of (v.endsWith('\n') ? v.slice(0, -1) : v).split('\n')) lines.push(l ? `  ${l}` : '');
    } else {
      lines.push(`${key}: ${yamlString(value)}`);
    }
  }
  return lines.join('\n');
}

export function parseFrontMatter(yaml) {
  const data = {};
  let listKey = null;
  let block = null;   // { key, keep, lines }
  const endBlock = () => {
    if (!block) return;
    const text = block.lines.join('\n').replace(/\n+$/, '');
    data[block.key] = block.keep && text ? text + '\n' : text;
    block = null;
  };
  for (const line of yaml.split('\n')) {
    if (block) {
      if (line === '' || /^ {2}/.test(line) || !line.trim()) { block.lines.push(line.slice(2)); continue; }
      endBlock();
    }
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s+-\s?(.*)$/);
    if (item && listKey) { data[listKey].push(yamlScalar(item[1])); continue; }
    const kv = line.match(/^([\p{L}\p{N}_-]+):\s*(.*)$/u);
    if (!kv) continue;
    const [, key, rest] = kv;
    if (rest === '') { data[key] = []; listKey = key; continue; }
    listKey = null;
    if (/^\|-?\s*$/.test(rest)) { block = { key, keep: !rest.trim().endsWith('-'), lines: [] }; continue; }
    const inline = rest.trim().match(/^\[(.*)\]$/);
    data[key] = inline
      ? inline[1].split(',').map(yamlScalar).filter(v => v !== '')
      : yamlScalar(rest);
  }
  endBlock();
  return data;
}

// Document = front matter + corps. Le corps est conservé tel quel.
export function stringifyDoc(data, body) {
  return `---\n${stringifyFrontMatter(data)}\n---\n\n${body ?? ''}`;
}

export function parseDoc(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { data: {}, body: src };
  let body = src.slice(m[0].length);
  if (body.startsWith('\n')) body = body.slice(1);
  return { data: parseFrontMatter(m[1]), body };
}

// ---------- éléments et fiches ----------
// En mémoire, l'app garde le modèle du prototype :
//   élément { id, title, status, text }  (+ pour une chanson : key, tempo, meter, notes)
//   fiche   { id, type, name, alias: 'a, b', notes }
// Un projet a un type (`kind`) : 'fiction' (par défaut) ou 'chansons'.
// Dans les fichiers, les clés sont en français et les alias forment une liste.
// `file` (nom sans .md) mémorise le nom de fichier pour ne pas le changer
// quand le titre change (historique git propre).

export const LAYOUTS = {
  fiction: {
    items: 'scenes', bank: 'bible', fallback: 'Lore',
    dirs: { Personnage: 'personnages', Lieu: 'lieux', Lore: 'lore' },
  },
  chansons: {
    items: 'chansons', bank: 'idees', fallback: 'Phrase',
    dirs: { Titre: 'titres', Phrase: 'phrases', Image: 'images', 'Thème': 'themes' },
  },
};
export const BIBLE_DIRS = LAYOUTS.fiction.dirs;
const layoutOf = kind => LAYOUTS[kind] ?? LAYOUTS.fiction;

// Champs propres aux chansons : clé en mémoire -> clé dans le fichier.
const SONG_FIELDS = { key: 'tonalite', tempo: 'tempo', meter: 'mesure', notes: 'notes' };

const splitAlias = alias => String(alias ?? '').split(',').map(a => a.trim()).filter(Boolean);

export function sceneToMarkdown(scene, kind = 'fiction') {
  const data = { id: scene.id, titre: scene.title ?? '', statut: normalizeStatut(scene.status) };
  if (kind === 'chansons') {
    for (const [k, f] of Object.entries(SONG_FIELDS)) if (scene[k]) data[f] = String(scene[k]);
  }
  return stringifyDoc(data, scene.text);
}

export function markdownToScene(text, fallbackTitle = '', kind = 'fiction') {
  const { data, body } = parseDoc(text);
  const scene = {
    id: data.id || newId(),
    title: data.titre ?? fallbackTitle,
    status: normalizeStatut(data.statut),
    text: body,
  };
  if (kind === 'chansons') {
    for (const [k, f] of Object.entries(SONG_FIELDS)) scene[k] = typeof data[f] === 'string' ? data[f] : '';
  }
  return scene;
}

export function ficheToMarkdown(fiche) {
  return stringifyDoc(
    { id: fiche.id, nom: fiche.name ?? '', alias: splitAlias(fiche.alias) },
    fiche.notes,
  );
}

export function markdownToFiche(text, type, fallbackName = '') {
  const { data, body } = parseDoc(text);
  const alias = Array.isArray(data.alias) ? data.alias : splitAlias(data.alias);
  return {
    id: data.id || newId(),
    type,
    name: data.nom ?? fallbackName,
    alias: alias.map(a => String(a).trim()).filter(Boolean).join(', '),
    notes: body,
  };
}

// ---------- projet complet ----------
// Projet : { id, name, kind?, description?, sceneId?, scenes: [...], bible: [...] }

export function projectToFiles(project) {
  const kind = project.kind === 'chansons' ? 'chansons' : 'fiction';
  const L = layoutOf(kind);
  const files = new Map();
  const sceneNames = new Set();
  const order = [];
  for (const scene of project.scenes ?? []) {
    const name = uniqueName(scene.file || slugify(scene.title), sceneNames);
    order.push(name);
    files.set(`${L.items}/${name}.md`, sceneToMarkdown(scene, kind));
  }
  const ficheNames = Object.fromEntries(Object.values(L.dirs).map(d => [d, new Set()]));
  for (const fiche of project.bible ?? []) {
    const dir = L.dirs[fiche.type] ?? L.dirs[L.fallback];
    const name = uniqueName(fiche.file || slugify(fiche.name), ficheNames[dir]);
    files.set(`${L.bank}/${dir}/${name}.md`, ficheToMarkdown(fiche));
  }
  const meta = { id: project.id, titre: project.name ?? '' };
  if (kind === 'chansons') meta.type = 'chansons';
  meta[L.items] = order;
  files.set('projet.md', stringifyDoc(meta, project.description));
  return files;
}

// `files` : Map ou objet { chemin relatif au dossier du projet: contenu }.
// Tolérant aux fichiers ajoutés ou supprimés à la main.
export function filesToProject(files) {
  const entries = files instanceof Map ? [...files] : Object.entries(files);
  const byPath = new Map(entries.map(([p, c]) => [p.replace(/\\/g, '/').replace(/^\.?\//, ''), c]));

  const { data: meta, body: description } = parseDoc(byPath.get('projet.md') ?? '');
  const kind = String(meta.type ?? '').toLowerCase() === 'chansons' ? 'chansons' : 'fiction';
  const L = layoutOf(kind);
  const project = {
    id: meta.id || newId(),
    name: meta.titre ?? '',
    description,
    scenes: [],
    bible: [],
  };
  if (kind === 'chansons') project.kind = 'chansons';

  const sceneFiles = new Map();
  const itemRe = new RegExp(`^${L.items}/([^/]+)\\.md$`, 'i');
  for (const [path, content] of byPath) {
    const m = path.match(itemRe);
    if (m) sceneFiles.set(m[1], content);
  }
  const listed = (Array.isArray(meta[L.items]) ? meta[L.items] : []).map(s => String(s).replace(/\.md$/i, ''));
  // Ordre de projet.md, puis les éléments absents de la liste, par nom de fichier.
  const names = [...new Set(listed.filter(n => sceneFiles.has(n)))];
  const rest = [...sceneFiles.keys()].filter(n => !names.includes(n)).sort();
  for (const name of [...names, ...rest]) {
    project.scenes.push({ ...markdownToScene(sceneFiles.get(name), name, kind), file: name });
  }
  project.sceneId = project.scenes[0]?.id;

  const dirToType = Object.fromEntries(Object.entries(L.dirs).map(([t, d]) => [d, t]));
  const bankRe = new RegExp(`^${L.bank}/[^/]+/[^/]+\\.md$`, 'i');
  const fichePaths = [...byPath.keys()].filter(p => bankRe.test(p)).sort();
  for (const path of fichePaths) {
    const [, dir, file] = path.split('/');
    const type = dirToType[dir.toLowerCase()];
    if (!type) continue;
    const name = file.replace(/\.md$/i, '');
    project.bible.push({ ...markdownToFiche(byPath.get(path), type, name), file: name });
  }
  return project;
}

// Tous les projets, chacun dans son dossier : { "le-roman/scenes/x.md": "...", ... }
export function workspaceToFiles(state) {
  const files = new Map();
  const dirs = new Set();
  for (const project of state.projects) {
    const dir = uniqueName(project.dir || slugify(project.name), dirs);
    for (const [path, content] of projectToFiles(project)) files.set(`${dir}/${path}`, content);
  }
  return files;
}
