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
// Valeurs prises en charge : chaînes et listes de chaînes.

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

export function stringifyFrontMatter(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (!value.length) { lines.push(`${key}: []`); continue; }
      lines.push(`${key}:`);
      for (const item of value) lines.push(`  - ${yamlString(item)}`);
    } else {
      lines.push(`${key}: ${yamlString(value)}`);
    }
  }
  return lines.join('\n');
}

export function parseFrontMatter(yaml) {
  const data = {};
  let listKey = null;
  for (const line of yaml.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const item = line.match(/^\s+-\s?(.*)$/);
    if (item && listKey) { data[listKey].push(yamlScalar(item[1])); continue; }
    const kv = line.match(/^([\p{L}\p{N}_-]+):\s*(.*)$/u);
    if (!kv) continue;
    const [, key, rest] = kv;
    if (rest === '') { data[key] = []; listKey = key; continue; }
    listKey = null;
    const inline = rest.trim().match(/^\[(.*)\]$/);
    data[key] = inline
      ? inline[1].split(',').map(yamlScalar).filter(v => v !== '')
      : yamlScalar(rest);
  }
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

// ---------- scènes et fiches ----------
// En mémoire, l'app garde le modèle du prototype :
//   scène  { id, title, status, text }
//   fiche  { id, type: 'Personnage'|'Lieu'|'Lore', name, alias: 'a, b', notes }
// Dans les fichiers, les clés sont en français et les alias forment une liste.
// `file` (nom sans .md) mémorise le nom de fichier pour ne pas le changer
// quand le titre change (historique git propre).

export const BIBLE_DIRS = { Personnage: 'personnages', Lieu: 'lieux', Lore: 'lore' };
const DIR_TO_TYPE = Object.fromEntries(Object.entries(BIBLE_DIRS).map(([t, d]) => [d, t]));

const splitAlias = alias => String(alias ?? '').split(',').map(a => a.trim()).filter(Boolean);

export function sceneToMarkdown(scene) {
  return stringifyDoc(
    { id: scene.id, titre: scene.title ?? '', statut: normalizeStatut(scene.status) },
    scene.text,
  );
}

export function markdownToScene(text, fallbackTitle = '') {
  const { data, body } = parseDoc(text);
  return {
    id: data.id || newId(),
    title: data.titre ?? fallbackTitle,
    status: normalizeStatut(data.statut),
    text: body,
  };
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
// Projet : { id, name, description?, sceneId?, scenes: [...], bible: [...] }

export function projectToFiles(project) {
  const files = new Map();
  const sceneNames = new Set();
  const order = [];
  for (const scene of project.scenes ?? []) {
    const name = uniqueName(scene.file || slugify(scene.title), sceneNames);
    order.push(name);
    files.set(`scenes/${name}.md`, sceneToMarkdown(scene));
  }
  const ficheNames = Object.fromEntries(Object.values(BIBLE_DIRS).map(d => [d, new Set()]));
  for (const fiche of project.bible ?? []) {
    const dir = BIBLE_DIRS[fiche.type] ?? 'lore';
    const name = uniqueName(fiche.file || slugify(fiche.name), ficheNames[dir]);
    files.set(`bible/${dir}/${name}.md`, ficheToMarkdown(fiche));
  }
  files.set('projet.md', stringifyDoc(
    { id: project.id, titre: project.name ?? '', scenes: order },
    project.description,
  ));
  return files;
}

// `files` : Map ou objet { chemin relatif au dossier du projet: contenu }.
// Tolérant aux fichiers ajoutés ou supprimés à la main.
export function filesToProject(files) {
  const entries = files instanceof Map ? [...files] : Object.entries(files);
  const byPath = new Map(entries.map(([p, c]) => [p.replace(/\\/g, '/').replace(/^\.?\//, ''), c]));

  const { data: meta, body: description } = parseDoc(byPath.get('projet.md') ?? '');
  const project = {
    id: meta.id || newId(),
    name: meta.titre ?? '',
    description,
    scenes: [],
    bible: [],
  };

  const sceneFiles = new Map();
  for (const [path, content] of byPath) {
    const m = path.match(/^scenes\/([^/]+)\.md$/i);
    if (m) sceneFiles.set(m[1], content);
  }
  const listed = (Array.isArray(meta.scenes) ? meta.scenes : []).map(s => String(s).replace(/\.md$/i, ''));
  // Ordre de projet.md, puis les scènes absentes de la liste, par nom de fichier.
  const names = [...new Set(listed.filter(n => sceneFiles.has(n)))];
  const rest = [...sceneFiles.keys()].filter(n => !names.includes(n)).sort();
  for (const name of [...names, ...rest]) {
    project.scenes.push({ ...markdownToScene(sceneFiles.get(name), name), file: name });
  }
  project.sceneId = project.scenes[0]?.id;

  const fichePaths = [...byPath.keys()].filter(p => /^bible\/[^/]+\/[^/]+\.md$/i.test(p)).sort();
  for (const path of fichePaths) {
    const [, dir, file] = path.split('/');
    const type = DIR_TO_TYPE[dir.toLowerCase()];
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
