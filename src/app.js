import {
  openStore, readLegacy, isValidState, writeEmergency, readEmergency, clearEmergency,
} from './store.js';
import { workspaceToFiles } from './format.js';
import { createZip } from './zip.js';
import {
  kindOf, fmtWords, METERS, SECTIONS, STYLES, PALETTE, PALETTE_LABELS, nextColor, NOTES, parseKey, makeKey, keyLabel, keyShort,
} from './kinds.js';
import { analyzeLyrics } from './lyrics.js';

const SAVE_DELAY = 400;                 // ms après la dernière frappe
const BACKUP_EVERY = 10 * 60 * 1000;    // une copie de secours au plus toutes les 10 min

const uid = () => Math.random().toString(36).slice(2, 9);
function sample() {
  return {current:"p1",projects:[{id:"p1",name:"Exemple · La ville sous la pluie",sceneId:"s1",
    scenes:[
      {id:"s1",title:"Ouverture : le quai",status:"brouillon",text:"Il pleuvait sur Port-Ombre depuis trois cents jours. Lia attendait au bout du quai, la lanterne éteinte à la main.\n\nQuand le bateau sans voile apparut, elle sut que le Pacte venait d'être rompu."},
      {id:"s2",title:"La maison du passeur",status:"idee",text:"Lia frappe chez Oren. Il refuse d'ouvrir."},
      {id:"s3",title:"Le marché noyé",status:"idee",text:""}],
    bible:[
      {id:"b1",type:"Personnage",name:"Lia",alias:"la gardienne",notes:"Gardienne de phare, 19 ans. Ne dort jamais plus de trois heures."},
      {id:"b2",type:"Personnage",name:"Oren",alias:"le passeur",notes:"Ancien marin. Sait ce que le Pacte a coûté."},
      {id:"b3",type:"Lieu",name:"Port-Ombre",alias:"",notes:"Ville portuaire où il pleut sans interruption."},
      {id:"b4",type:"Lore",name:"Pacte",alias:"le Pacte",notes:"Accord ancien entre la ville et la mer. Règle 1 : aucun bateau sans voile n'entre au port."}]}]};
}

const $ = id => document.getElementById(id);
// Un mot contient au moins une lettre ou un chiffre : « ## » ou « — » ne comptent pas.
const words = t => (t.match(/\S*[\p{L}\p{N}]\S*/gu) || []).length;
const fmt = fmtWords;
const esc = s => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const totalWords = state => state.projects.reduce((a, p) => a + p.scenes.reduce((b, s) => b + words(s.text), 0), 0);

// ---------- chargement ----------

const store = await openStore();
let S = await store.load();
let lastBackupAt = (await store.getMeta('lastBackupAt')) ?? 0;

// Une écriture avait échoué lors de la dernière session : la copie d'urgence est plus récente.
const emergency = readEmergency();
if (emergency) {
  if (S) await store.backup(S, 'avant récupération');
  S = emergency.data;
  await store.save(S);
  await store.backup(S, 'récupération après échec d\'enregistrement');
  clearEmergency();
}
if (!S) {
  const legacy = readLegacy();
  S = legacy ?? sample();
  await store.save(S);
  if (legacy) await backupNow('migration depuis le prototype');
}
if (Date.now() - lastBackupAt > BACKUP_EVERY) await backupNow('ouverture');

// Demande au navigateur de ne pas effacer les données (Safari les efface sinon après 7 jours sans visite).
const persisted = await navigator.storage?.persist?.().catch(() => false) ?? false;

// ---------- enregistrement ----------

let filter = "all", saveT, saving = null, pending = false;
const P = () => S.projects.find(p => p.id === S.current) || S.projects[0];
const Sc = () => { const p = P(); return p.scenes.find(s => s.id === p.sceneId) || p.scenes[0]; };
const K = () => kindOf(P());

async function backupNow(reason) {
  lastBackupAt = await store.backup(S, reason);
  await store.setMeta('lastBackupAt', lastBackupAt);
}

// Les enregistrements sont mis en file : jamais deux écritures en même temps,
// et une demande arrivée pendant une écriture déclenche une écriture de plus.
function save() {
  clearTimeout(saveT);
  if (saving) { pending = true; return saving; }
  saving = (async () => {
    do {
      pending = false;
      try {
        await store.save(S);
        clearEmergency();
        $("saved").textContent = "Enregistré";
        if (Date.now() - lastBackupAt > BACKUP_EVERY) await backupNow('automatique');
      } catch (err) {
        console.error(err);
        const ok = writeEmergency(S);
        $("saved").textContent = ok ? "Copie d'urgence enregistrée, nouvel essai…" : "Non enregistré : exporte une copie !";
        clearTimeout(saveT);
        saveT = setTimeout(save, 3000);
      }
    } while (pending);
  })().finally(() => { saving = null; });
  return saving;
}
function queue() { $("saved").textContent = "…"; clearTimeout(saveT); saveT = setTimeout(save, SAVE_DELAY); }

// Sur iPhone, l'app peut être suspendue sans préavis : on enregistre dès qu'elle passe en arrière-plan.
document.addEventListener("visibilitychange", () => { if (document.hidden) save(); });
addEventListener("pagehide", () => save());

function toast(m) { const t = $("toast"); t.textContent = m; t.hidden = false; clearTimeout(t._t); t._t = setTimeout(() => t.hidden = true, 1800); }

// ---------- couleurs ----------
// Chaque élément a une couleur. Attribuée automatiquement (la suivante dans la palette),
// modifiable dans les réglages.

function ensureColors() {
  let changed = false;
  for (const p of S.projects) {
    let prev = null;
    for (const s of p.scenes) {
      if (!PALETTE.includes(s.color)) { s.color = nextColor(prev); changed = true; }
      prev = s.color;
    }
  }
  return changed;
}
if (ensureColors()) await store.save(S);

// ---------- navigation ----------
// Mobile : deux écrans, la liste et l'écriture. Ordinateur : les deux côte à côte.

function setView(v) { $("app").dataset.view = v; if (v === "ecrire") fitTitle(); }
function setPane(p) {
  $("app").dataset.pane = p;
  $("tabItems").setAttribute("aria-current", p === "items" ? "page" : "false");
  $("tabBank").setAttribute("aria-current", p === "bank" ? "page" : "false");
  $("addBtn").setAttribute("aria-label", p === "items" ? K().addLabel : `Nouvelle ${K().addEntry.toLowerCase()}`);
}
for (const t of [$("tabItems"), $("tabBank")]) t.onclick = () => { setPane(t.dataset.pane); $("listePane").scrollTop = 0; };

// ---------- rendu ----------

const pad = n => String(n).padStart(2, "0");
const plural = (n, word) => `${n} ${word}${n > 1 ? "s" : ""}`;
const styleLabel = s => STYLES.find(([v]) => v === (s.style || "pop"))[1];

function renderProjects() {
  const p = P(), k = K();
  $("projectName").textContent = p.name || k.newProjectName;
  const n = p.scenes.length;
  $("bigCount").innerHTML = `<span>${pad(n)}</span><span>${k.bigLabel}</span>`;
  const c = st => p.scenes.filter(s => s.status === st).length;
  const rest = [c("brouillon") && plural(c("brouillon"), "brouillon"), c("idee") && plural(c("idee"), "idée")].filter(Boolean).join(", ") || "rien en cours";
  const tot = p.scenes.reduce((a, s) => a + words(s.text), 0);
  $("totals").innerHTML = `<span><b>${k.done(c("revise"))}</b><small>${rest}</small></span><span><b>${tot.toLocaleString("fr-FR")}</b><small>mots écrits</small></span>`;
  $("tabItems").querySelector("span").textContent = k.items;
  $("tabBank").querySelector("span").textContent = k.bankTab;
}

function renderScenes() {
  const p = P(), cur = Sc(), k = K();
  $("sceneList").innerHTML = p.scenes.map((s, i) => {
    const title = esc(s.title || "Sans titre");
    const status = `<span class="chip-status">${k.statuses[s.status]}</span>`;
    if (k.songs) return `<button class="card c-${s.color}${s === cur ? " on" : ""}" data-id="${s.id}">
      <span class="top"><span class="t">${title}</span><span class="key" aria-label="Tonalité">${s.key ? esc(keyShort(s.key)) : "—"}</span></span>
      <span class="bottom"><span><b>${esc(s.tempo || "—")}</b><small>BPM</small></span>${status}<span><b>${styleLabel(s) === "Pop" ? "Pop" : "Chanson"}</b><small>${esc(s.meter || "mesure ?")}</small></span></span>
    </button>`;
    const fiches = hitsFor(s).length;
    return `<button class="card c-${s.color}${s === cur ? " on" : ""}" data-id="${s.id}">
      <span class="top"><span class="t">${title}</span><span class="key">${pad(i + 1)}</span></span>
      <span class="bottom"><span><b>${words(s.text).toLocaleString("fr-FR")}</b><small>mots</small></span>${status}<span><b>${fiches}</b><small>${fiches > 1 ? "fiches" : "fiche"}</small></span></span>
    </button>`;
  }).join("");
  renderProjects();
}

// En-tête de l'écran d'écriture : couleur, ligne d'infos, titre, chiffres clés.
function renderHead() {
  const s = Sc(), k = K(), p = P();
  $("ecrirePane").className = `ecrire c-${s.color}${k.songs ? " songs" : ""}`;
  $("eyebrow").textContent = k.songs
    ? `${styleLabel(s)} · ${k.statuses[s.status]}`
    : `${k.item} ${p.scenes.indexOf(s) + 1} · ${k.statuses[s.status]}`;
  $("facts").innerHTML = k.songs
    ? `<span><b>${s.key ? esc(keyShort(s.key)) : "—"}</b><small>${s.key ? keyLabel(s.key) : "Tonalité"}</small></span><span><b>${esc(s.tempo || "—")}</b><small>BPM${s.meter ? " · " + esc(s.meter) : ""}</small></span>`
    : `<span><b>${words(s.text).toLocaleString("fr-FR")}</b><small>mots</small></span>`;
}

// Le titre s'agrandit sur plusieurs lignes si besoin. Écran caché : on ne mesure pas (la hauteur vaudrait 0).
function fitTitle() {
  const t = $("sceneTitle");
  if (!t.offsetParent) { t.style.height = ""; return; }
  t.style.height = "auto"; t.style.height = t.scrollHeight + "px";
}
addEventListener("resize", fitTitle);

function renderEditor() {
  const s = Sc(), k = K();
  if (!s) return;
  renderHead();
  if (document.activeElement !== $("sceneTitle")) $("sceneTitle").value = s.title;
  $("sceneTitle").placeholder = k.titlePh;
  fitTitle();
  if (document.activeElement !== $("sceneText")) $("sceneText").value = s.text;
  $("sceneText").placeholder = k.textPh;
  $("wc").textContent = fmt(words(s.text));
  $("editor").classList.toggle("analyse", !!k.songs && analyseOn);
  $("analyseBtn").setAttribute("aria-pressed", String(analyseOn));
  renderAnalysis();
}

function renderKind() {
  const k = K();
  $("bankLabel").textContent = k.bank;
  $("addEntry").textContent = `+ ${k.addEntry}`;
  $("mentionsLabel").textContent = k.mentions;
  $("bankHint").textContent = k.bankHint;
  if (!k.types.some(([t]) => t === filter)) filter = "all";
  $("filters").innerHTML = [["all", "Tout"], ...k.types].map(([f, l]) => `<button data-f="${esc(f)}"${f === filter ? ' class="on"' : ""}>${esc(l)}</button>`).join("");
  $("app").classList.toggle("kind-songs", !!k.songs);
  setPane($("app").dataset.pane);
}

function names(e) { return [e.name, ...(e.alias || "").split(",")].map(x => x.trim()).filter(Boolean); }
function hitsFor(s) {
  const t = (s?.text || "") + " " + (s?.title || "");
  return P().bible.filter(e => names(e).some(n => new RegExp("(^|[^\\p{L}])" + n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "($|[^\\p{L}])", "iu").test(t)));
}
function renderMentions() {
  const h = hitsFor(Sc());
  $("mentions").innerHTML = h.map(e => `<button class="chip" data-id="${e.id}">${esc(e.name)}</button>`).join("");
  $("mentionsBox").hidden = !h.length;
  document.querySelectorAll(".entry").forEach(d => d.classList.toggle("hit", h.some(e => e.id === d.dataset.id)));
}

function renderBible(open) {
  const k = K();
  const list = P().bible.filter(e => filter === "all" || e.type === filter);
  $("entries").innerHTML = list.map(e => `<details class="entry" data-id="${e.id}"${e.id === open ? " open" : ""}>
    <summary><span class="nm">${esc(e.name || "Sans nom")}</span><span class="ty">${esc(e.type)}</span></summary>
    <input id="n-${e.id}" data-k="name" value="${esc(e.name)}" placeholder="${esc(k.namePh)}" aria-label="${esc(k.namePh)}">
    <input id="a-${e.id}" data-k="alias" value="${esc(e.alias || "")}" placeholder="${esc(k.aliasPh)}" aria-label="${esc(k.aliasPh)}">
    <textarea id="t-${e.id}" data-k="notes" placeholder="${esc(k.notesPh)}" aria-label="Notes">${esc(e.notes || "")}</textarea>
    <div class="row"><select id="y-${e.id}" data-k="type" aria-label="Type">${k.types.map(([t]) => `<option${t === e.type ? " selected" : ""}>${esc(t)}</option>`).join("")}</select><button class="del" data-del="${e.id}">Supprimer</button></div>
  </details>`).join("") || `<p class="hint">${esc(k.emptyBank)}</p>`;
  renderMentions();
}

function all() { renderKind(); renderScenes(); renderEditor(); renderBible(); }

// ---------- interactions ----------

let armed = null;
function arm(btn, key, fn, label) {
  if (armed === key) { armed = null; btn.classList.remove("arm"); fn(); return; }
  armed = key; btn.textContent = "Confirmer ?"; btn.classList.add("arm");
  setTimeout(() => { if (armed === key) { armed = null; btn.textContent = label; btn.classList.remove("arm"); } }, 2500);
}

$("sceneList").onclick = e => {
  const b = e.target.closest(".card"); if (!b) return;
  P().sceneId = b.dataset.id; save();
  $("sceneTitle").blur(); $("sceneText").blur();
  renderScenes(); renderEditor(); renderMentions(); setView("ecrire");
};
$("backBtn").onclick = () => { save(); renderScenes(); setView("liste"); };
$("sceneTitle").oninput = e => { Sc().title = e.target.value.replace(/\n/g, " "); fitTitle(); queue(); renderMentions(); };
$("sceneTitle").onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); $("sceneText").focus(); } };
$("sceneTitle").onblur = () => renderScenes();
$("sceneText").oninput = e => {
  Sc().text = e.target.value; queue();
  $("wc").textContent = fmt(words(e.target.value));
  if (!K().songs) renderHead();
  renderAnalysis(); renderMentions();
};
$("sceneText").onblur = () => renderScenes();

function newItem(kind, title, prev, next) {
  const s = { id: uid(), title, status: "idee", text: kind.template, color: nextColor(prev?.color, next?.color) };
  if (kind.songs) Object.assign(s, { style: prev?.style || "pop", key: "", tempo: "", meter: "", notes: "" });
  return s;
}
function addItem() {
  const p = P(), cur = Sc(), i = p.scenes.indexOf(cur);
  const s = newItem(K(), K().newItem, cur, p.scenes[i + 1]);
  p.scenes.splice(i + 1, 0, s); p.sceneId = s.id; save();
  renderScenes(); renderEditor(); renderMentions(); setView("ecrire");
  $("sceneTitle").focus(); $("sceneTitle").select();
}
function addEntry() {
  const e = { id: uid(), type: filter === "all" ? K().types[0][0] : filter, name: "", alias: "", notes: "" };
  P().bible.unshift(e); save(); setPane("bank"); setView("liste"); renderBible(e.id); $("n-" + e.id).focus();
}
$("addBtn").onclick = () => $("app").dataset.pane === "bank" ? addEntry() : addItem();
$("addEntry").onclick = addEntry;
$("entries").oninput = e => {
  const d = e.target.closest(".entry"), k = e.target.dataset.k; if (!d || !k) return;
  const en = P().bible.find(x => x.id === d.dataset.id); en[k] = e.target.value; queue();
  if (k === "name") d.querySelector(".nm").textContent = en.name || "Sans nom";
  if (k === "type") d.querySelector(".ty").textContent = en.type;
  renderMentions();
};
$("entries").onclick = e => {
  const id = e.target.dataset.del; if (!id) return;
  arm(e.target, "e" + id, () => { const b = P().bible; b.splice(b.findIndex(x => x.id === id), 1); save(); renderBible(); renderScenes(); }, "Supprimer");
};
$("filters").onclick = e => {
  const f = e.target.dataset.f; if (!f) return;
  filter = f; document.querySelectorAll("#filters button").forEach(b => b.classList.toggle("on", b.dataset.f === f)); renderBible();
};
$("mentions").onclick = e => {
  const id = e.target.dataset.id; if (!id) return;
  filter = "all"; renderKind(); renderBible(id); setPane("bank"); setView("liste");
  document.querySelector(`.entry[data-id="${id}"]`)?.scrollIntoView({ block: "nearest" });
};
$("focusBtn").onclick = () => {
  const on = document.body.classList.toggle("focus");
  $("focusBtn").setAttribute("aria-pressed", String(on));
  $("focusBtn").setAttribute("aria-label", on ? "Quitter le mode focus" : "Mode focus");
  if (on) setView("ecrire");
};
$("exportBtn").onclick = () => {
  const p = P();
  const txt = "# " + p.name + "\n\n" + p.scenes.map(s => "## " + (s.title || "Sans titre") + "\n\n" + s.text).join("\n\n");
  navigator.clipboard.writeText(txt).then(() => toast("Texte du projet copié")).catch(() => toast("Copie refusée par le navigateur"));
};

// ---------- réglages de l'élément ----------

function renderSettings() {
  const s = Sc(), k = K(), i = P().scenes.indexOf(s);
  const seg = (name, items, cur) => `<div class="seg" role="radiogroup" aria-label="${name}">${items.map(([v, l]) => `<button role="radio" data-set="${name}" data-v="${esc(v)}" aria-checked="${v === cur}">${esc(l)}</button>`).join("")}</div>`;
  let html = `<div class="group"><span class="label">Statut</span>${seg("statut", Object.entries(k.statuses), s.status)}</div>
    <div class="group"><span class="label">Couleur <em>${PALETTE_LABELS[s.color]}</em></span><div class="swatches" role="radiogroup" aria-label="Couleur">${PALETTE.map(c => `<button class="c-${c}" role="radio" data-set="couleur" data-v="${c}" aria-checked="${c === s.color}" aria-label="${PALETTE_LABELS[c]}"></button>`).join("")}</div></div>`;
  if (k.songs) {
    const key = parseKey(s.key), style = s.style || "pop";
    html += `<div class="group"><span class="label">Style</span>${seg("style", STYLES.map(([v, l]) => [v, l]), style)}<p class="hint">${STYLES.find(([v]) => v === style)[2]}</p></div>
      <div class="group"><span class="label">Tonalité <em>${s.key ? `${keyLabel(s.key)} · ${esc(keyShort(s.key))}` : "aucune"}</em></span>
        <div class="notes">${NOTES.map(([n, fr]) => `<button data-set="note" data-v="${n}" aria-pressed="${key?.note === n}">${fr}</button>`).join("")}</div>
        ${key ? `<div class="acc">${[["b", "♭", "bémol"], ["", "♮", "naturel"], ["#", "♯", "dièse"]].map(([a, l, al]) => `<button data-set="acc" data-v="${a}" aria-label="${al}" aria-pressed="${key.acc === a}">${l}</button>`).join("")}</div>
        <div class="acc-row">${seg("mode", [["maj", "majeur"], ["min", "mineur"]], key.minor ? "min" : "maj")}<button class="clear" data-set="clearkey">Effacer</button></div>` : ""}</div>
      <div class="group" style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px">
        <div class="group" style="margin:0"><span class="label">Tempo</span><div class="stepper"><button data-set="tempo" data-v="-1" aria-label="Ralentir">−</button><input id="tempoInput" inputmode="numeric" value="${esc(s.tempo || "")}" placeholder="BPM" aria-label="Tempo en BPM"><button data-set="tempo" data-v="1" aria-label="Accélérer">+</button></div></div>
        <div class="group" style="margin:0"><span class="label">Mesure</span>${seg("mesure", METERS.slice(0, 3).map(m => [m, m]), s.meter)}</div>
      </div>
      <div class="group"><span class="label">Autres mesures</span>${seg("mesure", METERS.slice(3).map(m => [m, m]), s.meter)}</div>
      <div class="group"><span class="label">Notes et références</span><textarea class="notes-field" id="notesInput" placeholder="Intention, thème, artistes de référence, idées de production…">${esc(s.notes || "")}</textarea></div>`;
  }
  html += `<div class="row-actions"><button class="pill" data-set="move" data-v="-1"${i === 0 ? " disabled" : ""}>↑ Monter</button><button class="pill" data-set="move" data-v="1"${i === P().scenes.length - 1 ? " disabled" : ""}>↓ Descendre</button><button class="del" id="delScene">${k.del}</button></div>`;
  $("settingsBody").innerHTML = html;
}

function openSettings() { save(); renderSettings(); $("settingsDlg").showModal(); }
$("settingsBtn").onclick = openSettings;
$("facts").onclick = openSettings;
$("eyebrow").onclick = openSettings;
$("settingsOk").onclick = () => $("settingsDlg").close();
$("settingsDlg").addEventListener("close", () => { renderScenes(); renderEditor(); });

$("settingsBody").onclick = e => {
  const b = e.target.closest("button"); if (!b) return;
  const s = Sc(), p = P();
  if (b.id === "delScene") {
    arm(b, "scene", () => {
      if (p.scenes.length < 2) { toast(K().keepOne); renderSettings(); return; }
      const i = p.scenes.indexOf(s); p.scenes.splice(i, 1); p.sceneId = p.scenes[Math.max(0, i - 1)].id; save();
      $("settingsDlg").close(); all(); setView("liste");
    }, K().del);
    return;
  }
  const set = b.dataset.set, v = b.dataset.v; if (!set) return;
  const key = parseKey(s.key);
  if (set === "statut") s.status = v;
  else if (set === "couleur") s.color = v;
  else if (set === "style") { s.style = v; }
  else if (set === "note") s.key = makeKey({ note: v, acc: key?.acc ?? "", minor: key?.minor ?? false });
  else if (set === "acc" && key) s.key = makeKey({ ...key, acc: v });
  else if (set === "mode" && key) s.key = makeKey({ ...key, minor: v === "min" });
  else if (set === "clearkey") s.key = "";
  else if (set === "mesure") s.meter = s.meter === v ? "" : v;
  else if (set === "tempo") s.tempo = String(Math.min(300, Math.max(20, (parseInt(s.tempo, 10) ? parseInt(s.tempo, 10) + Number(v) : 90))));
  else if (set === "move") {
    const i = p.scenes.indexOf(s), j = i + Number(v);
    if (j >= 0 && j < p.scenes.length) [p.scenes[i], p.scenes[j]] = [p.scenes[j], p.scenes[i]];
  }
  save(); renderSettings(); renderHead(); renderScenes(); renderAnalysis();
  $("settingsBody").querySelector(`[data-set="${set}"][data-v="${CSS.escape(v ?? "")}"]`)?.focus();
};
$("settingsBody").oninput = e => {
  const s = Sc();
  if (e.target.id === "tempoInput") { s.tempo = e.target.value.replace(/\D/g, "").slice(0, 3); queue(); renderHead(); }
  if (e.target.id === "notesInput") { s.notes = e.target.value; queue(); }
};

// ---------- projets ----------

function renderProjectsDlg() {
  $("projectRename").value = P().name;
  $("projectList").innerHTML = S.projects.map((p, i) => `<button class="c-${PALETTE[i % PALETTE.length]}" data-pid="${p.id}" aria-current="${p.id === S.current}"><b>${esc(p.name || "Sans titre")}</b><small>${kindOf(p).kindLabel} · ${p.scenes.length}</small></button>`).join("");
}
function openProjects() { renderProjectsDlg(); $("projectsDlg").showModal(); }
$("projectBtn").onclick = openProjects;
$("projectsTab").onclick = openProjects;
$("projectsOk").onclick = () => $("projectsDlg").close();
$("projectList").onclick = e => {
  const b = e.target.closest("[data-pid]"); if (!b) return;
  S.current = b.dataset.pid; save(); all(); renderProjectsDlg();
};
$("projectRename").oninput = e => { P().name = e.target.value; queue(); renderProjects(); renderProjectsDlg(); };
$("projectRename").onkeydown = e => { if (e.key === "Enter") $("projectsDlg").close(); };
$("projectsDlg").addEventListener("close", () => { if (!P().name.trim()) { P().name = K().newProjectName; save(); } all(); });
function newProject(kindName) {
  const p = { id: uid(), scenes: [], bible: [] };
  if (kindName !== "fiction") p.kind = kindName;
  const k = kindOf(p), s = newItem(k, k.firstItem, null, null);
  Object.assign(p, { name: k.newProjectName, sceneId: s.id, scenes: [s] });
  S.projects.push(p); S.current = p.id; save(); all(); setPane("items");
  renderProjectsDlg(); $("projectRename").focus(); $("projectRename").select();
}
$("newProject").onclick = () => newProject("fiction");
$("newSongs").onclick = () => newProject("chansons");

// ---------- fichiers ----------

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");

// Sur téléphone : feuille de partage (« Enregistrer dans Fichiers »). Ailleurs : téléchargement.
async function saveFile(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; }
    catch (err) { if (err.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// Pas d'await avant le partage : Safari exige qu'il suive immédiatement le toucher.
$("zipBtn").onclick = () => {
  save();
  const zip = createZip(workspaceToFiles(S));
  saveFile(new Blob([zip], { type: "application/zip" }), `atelier-${stamp()}.zip`);
};

// ---------- sauvegardes ----------

const dateFmt = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

async function renderBackups() {
  $("storeInfo").textContent = store.kind === "indexeddb"
    ? `Stockage : base locale du navigateur${persisted ? ", protégée contre l'effacement" : ""}.`
    : "Stockage de repli (limité à environ 5 Mo) : exporte régulièrement une copie.";
  const list = await store.listBackups();
  $("backupList").innerHTML = list.map(b => `<div class="backup">
    <span><strong>${dateFmt.format(b.at)}</strong><br><span class="hint">${esc(b.reason)} · ${b.data.projects.length} projet${b.data.projects.length > 1 ? "s" : ""} · ${fmt(totalWords(b.data))}</span></span>
    <button class="btn" data-at="${b.at}">Restaurer</button></div>`).join("") || `<p class="hint">Aucune copie pour l'instant.</p>`;
  $("backupList")._list = list;
}

// Remplace tout l'état, après avoir mis l'état actuel de côté.
async function replaceState(next, reason) {
  await save();
  await backupNow(reason);
  S = structuredClone(next);
  if (!S.projects.some(p => p.id === S.current)) S.current = S.projects[0].id;
  await save();
  all();
}

$("backupBtn").onclick = async () => { await save(); await renderBackups(); $("backupDlg").showModal(); };
$("closeDlg").onclick = () => $("backupDlg").close();
$("backupList").onclick = e => {
  const at = Number(e.target.dataset.at);
  if (!at) return;
  arm(e.target, "b" + at, async () => {
    const b = $("backupList")._list.find(x => x.at === at);
    await replaceState(b.data, "avant restauration");
    $("backupDlg").close();
    toast(`Copie du ${dateFmt.format(at)} restaurée`);
  }, "Restaurer");
};
$("dlJson").onclick = () => {
  save();
  const blob = new Blob([JSON.stringify({ format: "atelier", version: 1, exportedAt: new Date().toISOString(), data: S }, null, 2)], { type: "application/json" });
  saveFile(blob, `atelier-${stamp()}.json`);
};
$("importJson").onchange = async e => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const data = parsed?.format === "atelier" ? parsed.data : parsed;   // accepte aussi l'état brut du prototype
    if (!isValidState(data)) throw new Error("format inconnu");
    await replaceState(data, "avant import");
    $("backupDlg").close();
    toast("Copie importée");
  } catch (err) {
    toast("Fichier illisible : " + err.message);
  }
};

// ---------- sections ----------
// Le bouton et le menu ne prennent pas le focus : le curseur reste dans le texte
// et le clavier reste ouvert sur iPhone.

$("sectionMenu").innerHTML = SECTIONS.map(n => `<button role="menuitem" data-sec="${n}">${n}</button>`).join("");
function setSectionMenu(open) { $("sectionMenu").hidden = !open; $("sectionBtn").setAttribute("aria-expanded", String(open)); }
for (const el of [$("sectionBtn"), $("sectionMenu")]) el.addEventListener("pointerdown", e => e.preventDefault());
$("sectionBtn").onclick = () => setSectionMenu($("sectionMenu").hidden);
$("sectionMenu").onclick = e => {
  const name = e.target.dataset.sec; if (!name) return;
  setSectionMenu(false);
  insertSection($("sceneText"), name);
};
function sectionHeading(text, name) {
  if (name !== "Couplet") return `## ${name}`;
  const n = (text.match(/^##\s*Couplet\b/gim) || []).length;
  return `## Couplet ${n + 1}`;
}
function insertSection(ta, name) {
  const focused = document.activeElement === ta;
  const pos = focused ? ta.selectionStart : ta.value.length;
  const before = ta.value.slice(0, pos);
  const sep = !before || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const insert = `${sep}${sectionHeading(ta.value, name)}\n`;
  ta.focus();
  if (!focused) ta.setSelectionRange(pos, pos);
  // execCommand garde l'annulation (Cmd+Z) ; repli si indisponible.
  if (!document.execCommand?.("insertText", false, insert)) {
    ta.setRangeText(insert, ta.selectionStart, ta.selectionEnd, "end");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
$("analyseBtn").onclick = () => {
  analyseOn = !analyseOn;
  try { localStorage.setItem("atelier-analyse", analyseOn ? "1" : "0"); } catch {}
  renderEditor();
};

// Clavier ouvert sur iPhone : la barre d'outils suit le haut du clavier.
const vv = window.visualViewport;
function placeAccessory() {
  if (!vv) return;
  const kb = Math.max(0, innerHeight - vv.height - vv.offsetTop);
  const on = kb > 80 && matchMedia("(pointer: coarse)").matches && document.activeElement === $("sceneText");
  document.documentElement.style.setProperty("--kb", `${kb}px`);
  $("accessory").classList.toggle("kb", on);
}
vv?.addEventListener("resize", placeAccessory);
vv?.addEventListener("scroll", placeAccessory);
$("sceneText").addEventListener("focus", () => setTimeout(placeAccessory, 300));
$("sceneText").addEventListener("blur", placeAccessory);

// ---------- syllabes et rimes ----------
// Le calque #mirror reproduit le texte ligne à ligne (même police, même largeur), dans la
// même case de grille que la zone de saisie : seuls les surlignages et les comptes se voient.

let analyseOn=true;
try{analyseOn=localStorage.getItem("atelier-analyse")!=="0"}catch{}

function renderAnalysis(){
  const text=$("sceneText").value;
  // Sans analyse, le calque contient juste le texte (invisible) : il sert à donner sa hauteur
  // à la zone de saisie. Le caractère invisible final garde la ligne vide après un retour.
  if(!$("editor").classList.contains("analyse")){$("mirror").textContent=text+"\u200b";return}
  const s=Sc();
  const rows=analyzeLyrics(text,s.style||"pop");
  const lines=text.split("\n");
  $("mirror").innerHTML=lines.map((line,i)=>{
    const r=rows[i];
    if(r.kind==="heading")return `<div class="ml h"><span class="hh">${esc(line)}</span>${r.schema?`<span class="cnt"><small>${r.schema}</small></span>`:""}</div>`;
    if(r.kind!=="lyric")return `<div class="ml">${esc(line)||"\u200b"}</div>`;
    let html=esc(line);
    if(r.group!=null&&r.rhyme){
      // Surligne la dernière occurrence du mot qui porte la rime.
      const at=line.toLowerCase().lastIndexOf(r.rhyme.word);
      if(at>=0)html=esc(line.slice(0,at))+`<mark class="r${r.group%8}">${esc(line.slice(at,at+r.rhyme.word.length))}</mark>`+esc(line.slice(at+r.rhyme.word.length));
    }
    const off=r.ref!=null&&r.ref!==r.syllables;
    return `<div class="ml">${html}<span class="cnt${off?" off":""}"><small>${r.syllables}${off?`/${r.ref}`:""}</small></span></div>`;
  }).join("");
}
// Frappe en fin de texte : le carton suit le curseur (la zone de texte ne défile pas elle-même).
$("sceneText").addEventListener("input", e => {
  const ta = e.target, sc = $("paperScroll");
  if (ta.selectionEnd < ta.value.length - 1) return;
  const gap = sc.scrollHeight - sc.scrollTop - sc.clientHeight;
  if (gap > 0 && gap < 200) sc.scrollTop = sc.scrollHeight;
});

// ---------- menu ----------

function setMenu(open) {
  $("menuPanel").hidden = !open;
  $("menuBtn").setAttribute("aria-expanded", String(open));
}
$("menuBtn").onclick = e => { e.stopPropagation(); setMenu($("menuPanel").hidden); };
$("menuPanel").addEventListener("click", () => setMenu(false));
document.addEventListener("click", e => {
  if (!e.target.closest(".menu")) setMenu(false);
  if (!e.target.closest(".section-wrap")) setSectionMenu(false);
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("menuPanel").hidden) { setMenu(false); $("menuBtn").focus(); } });

all();
// Sur téléphone, on reprend là où on en était : directement dans le texte.
setView("ecrire");
document.body.classList.add("ready");

// ---------- hors ligne et mises à jour ----------
// Une nouvelle version ne s'installe jamais d'elle-même pendant l'écriture :
// on propose de mettre à jour, et on enregistre avant de recharger.

if ("serviceWorker" in navigator) {
  const reg = await navigator.serviceWorker.register("sw.js").catch(err => { console.warn(err); return null; });
  const offer = () => { if (reg?.waiting && navigator.serviceWorker.controller) $("updateBar").hidden = false; };
  reg?.addEventListener("updatefound", () => {
    reg.installing?.addEventListener("statechange", offer);
  });
  offer();
  $("updateBtn").onclick = async () => {
    await save();
    navigator.serviceWorker.addEventListener("controllerchange", () => location.reload(), { once: true });
    reg.waiting?.postMessage("activer");
  };
  // Vérifie les mises à jour quand on revient dans l'app.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) reg?.update().catch(() => {}); });
}

