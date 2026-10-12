// Stockage local de l'état complet { current, projects }.
// IndexedDB en priorité ; localStorage en repli si IndexedDB est indisponible.
// Les copies de secours (snapshots) sont conservées à côté, en nombre limité.

export const LEGACY_KEY = 'atelier-ecriture-v1';   // clé du prototype
export const EMERGENCY_KEY = 'atelier-secours';    // dernier recours si l'écriture échoue
const DB_NAME = 'atelier';
const MAX_BACKUPS = 30;

const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = tx => new Promise((res, rej) => {
  tx.oncomplete = () => res();
  tx.onerror = tx.onabort = () => rej(tx.error || new Error('Transaction annulée'));
});

class IdbStore {
  kind = 'indexeddb';
  constructor(db) { this.db = db; }

  async load() {
    const tx = this.db.transaction(['projects', 'meta'], 'readonly');
    const [projects, meta] = await Promise.all([
      req(tx.objectStore('projects').getAll()),
      req(tx.objectStore('meta').get('state')),
    ]);
    if (!meta || !projects.length) return null;
    const rank = new Map((meta.order ?? []).map((id, i) => [id, i]));
    projects.sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9));
    return { current: meta.current, projects };
  }

  // Écrit tout l'état dans une seule transaction : soit tout passe, soit rien.
  async save(state) {
    const tx = this.db.transaction(['projects', 'meta'], 'readwrite');
    const ps = tx.objectStore('projects');
    ps.clear();
    for (const p of state.projects) ps.put(p);
    const meta = tx.objectStore('meta');
    meta.put({ current: state.current, order: state.projects.map(p => p.id), savedAt: Date.now() }, 'state');
    await done(tx);
  }

  async getMeta(key) {
    return req(this.db.transaction('meta').objectStore('meta').get(key));
  }

  async setMeta(key, value) {
    const tx = this.db.transaction('meta', 'readwrite');
    tx.objectStore('meta').put(value, key);
    await done(tx);
  }

  async backup(state, reason) {
    const at = Date.now();
    const tx = this.db.transaction('backups', 'readwrite');
    const bs = tx.objectStore('backups');
    bs.put({ at, reason, data: state });
    const keys = await req(bs.getAllKeys());
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_BACKUPS))) bs.delete(k);
    await done(tx);
    return at;
  }

  async listBackups() {
    const all = await req(this.db.transaction('backups').objectStore('backups').getAll());
    return all.reverse();
  }
}

// Repli : même interface, tout dans localStorage (quota d'environ 5 Mo).
class LocalStore {
  kind = 'localstorage';
  #get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
  #set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  async load() { return this.#get('atelier-v2-state'); }
  async save(state) { this.#set('atelier-v2-state', state); }
  async getMeta(key) { return this.#get('atelier-v2-meta')?.[key]; }
  async setMeta(key, value) { this.#set('atelier-v2-meta', { ...this.#get('atelier-v2-meta'), [key]: value }); }
  async backup(state, reason) {
    const at = Date.now();
    const list = [...(this.#get('atelier-v2-backups') ?? []), { at, reason, data: state }];
    // Peu de place : on garde moins de copies.
    this.#set('atelier-v2-backups', list.slice(-5));
    return at;
  }
  async listBackups() { return [...(this.#get('atelier-v2-backups') ?? [])].reverse(); }
}

export async function openStore() {
  try {
    if (!globalThis.indexedDB) throw new Error('IndexedDB absent');
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      db.createObjectStore('projects', { keyPath: 'id' });
      db.createObjectStore('meta');
      db.createObjectStore('backups', { keyPath: 'at' });
    };
    const db = await req(open);
    // Une autre version de l'app (autre onglet) demande une mise à jour du schéma.
    db.onversionchange = () => db.close();
    return new IdbStore(db);
  } catch (err) {
    console.warn('IndexedDB indisponible, repli sur localStorage', err);
    return new LocalStore();
  }
}

export function isValidState(s) {
  return !!s && Array.isArray(s.projects) && s.projects.length > 0
    && s.projects.every(p => p && typeof p.id === 'string' && Array.isArray(p.scenes) && Array.isArray(p.bible));
}

// Données du prototype (localStorage). On ne les efface jamais : elles restent une copie de plus.
export function readLegacy() {
  try {
    const s = JSON.parse(localStorage.getItem(LEGACY_KEY));
    return isValidState(s) ? s : null;
  } catch { return null; }
}

export function writeEmergency(state) {
  try { localStorage.setItem(EMERGENCY_KEY, JSON.stringify({ at: Date.now(), data: state })); return true; }
  catch { return false; }
}

export function readEmergency() {
  try {
    const e = JSON.parse(localStorage.getItem(EMERGENCY_KEY));
    return e && isValidState(e.data) ? e : null;
  } catch { return null; }
}

export function clearEmergency() {
  try { localStorage.removeItem(EMERGENCY_KEY); } catch { /* rien */ }
}
