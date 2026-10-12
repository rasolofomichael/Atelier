// Format Markdown d'un projet Atelier : conversion projet <-> fichiers.
// Voir FORMAT.md pour la description du format.
// Module sans dépendance, utilisable dans le navigateur et dans Node.

export const STATUTS = ['idee', 'brouillon', 'revise'];

export const BIBLE_DIRS = { personnage: 'personnages', lieu: 'lieux', lore: 'lore' };
const DIR_TO_TYPE = Object.fromEntries(Object.entries(BIBLE_DIRS).map(([t, d]) => [d, t]));

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
  const src = String(text ?? '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = src.match(/^---\n([\s\S]*?)\n---[ \t]*(?:\n|$)/);
  if (!m) return { data: {}, body: src };
  let body = src.slice(m[0].length);
  if (body.startsWith('\n')) body = body.slice(1);
  return { data: parseFrontMatter(m[1]), body };
}

// ---------- scènes et fiches ----------

export function sceneToMarkdown(scene) {
  return stringifyDoc(
    { id: scene.id, titre: scene.titre ?? '', statut: normalizeStatut(scene.statut) },
    scene.texte,
  );
}

export function markdownToScene(text, fallbackTitle = '') {
  const { data, body } = parseDoc(text);
  return {
    id: data.id || newId(),
    titre: data.titre ?? fallbackTitle,
    statut: normalizeStatut(data.statut),
    texte: body,
  };
}

export function ficheToMarkdown(fiche) {
  return stringifyDoc(
    { id: fiche.id, nom: fiche.nom ?? '', alias: fiche.alias ?? [] },
    fiche.notes,
  );
}

export function markdownToFiche(text, type, fallbackName = '') {
  const { data, body } = parseDoc(text);
  const alias = Array.isArray(data.alias) ? data.alias : data.alias ? [data.alias] : [];
  return {
    id: data.id || newId(),
    type,
    nom: data.nom ?? fallbackName,
    alias: alias.map(String).filter(Boolean),
    notes: body,
  };
}

// ---------- projet complet ----------
// Un projet : { id, titre, description, scenes: [...], fiches: [...] }
// Chaque scène et fiche peut porter `fichier` (nom sans .md) : on le réutilise
// pour ne pas renommer un fichier quand son titre change (historique git propre).

export function projectToFiles(project) {
  const files = new Map();
  const sceneNames = new Set();
  const order = [];
  for (const scene of project.scenes ?? []) {
    const name = uniqueName(scene.fichier || slugify(scene.titre), sceneNames);
    order.push(name);
    files.set(`scenes/${name}.md`, sceneToMarkdown(scene));
  }
  const ficheNames = Object.fromEntries(Object.values(BIBLE_DIRS).map(d => [d, new Set()]));
  for (const fiche of project.fiches ?? []) {
    const dir = BIBLE_DIRS[fiche.type] ?? 'lore';
    const name = uniqueName(fiche.fichier || slugify(fiche.nom), ficheNames[dir]);
    files.set(`bible/${dir}/${name}.md`, ficheToMarkdown(fiche));
  }
  files.set('projet.md', stringifyDoc(
    { id: project.id, titre: project.titre ?? '', scenes: order },
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
    titre: meta.titre ?? '',
    description,
    scenes: [],
    fiches: [],
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
    project.scenes.push({ ...markdownToScene(sceneFiles.get(name), name), fichier: name });
  }

  const fichePaths = [...byPath.keys()].filter(p => /^bible\/[^/]+\/[^/]+\.md$/i.test(p)).sort();
  for (const path of fichePaths) {
    const [, dir, file] = path.split('/');
    const type = DIR_TO_TYPE[dir.toLowerCase()];
    if (!type) continue;
    const name = file.replace(/\.md$/i, '');
    project.fiches.push({ ...markdownToFiche(byPath.get(path), type, name), fichier: name });
  }
  return project;
}
