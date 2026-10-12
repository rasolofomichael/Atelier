import {
  openStore, readLegacy, isValidState, writeEmergency, readEmergency, clearEmergency,
} from './store.js';

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
const words = t => (t.trim().match(/\S+/g) || []).length;
const fmt = n => n.toLocaleString("fr-FR") + (n > 1 ? " mots" : " mot");
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

// ---------- rendu ----------

function renderProjects(){$("projectSel").innerHTML=S.projects.map(p=>`<option value="${p.id}"${p.id===S.current?" selected":""}>${esc(p.name)}</option>`).join("")}
function renderScenes(){
  const p=P(),cur=Sc();
  $("sceneList").innerHTML=p.scenes.map(s=>`<button class="scene${s===cur?" on":""}" data-id="${s.id}"><i class="dot st-${s.status}"></i><span class="t">${esc(s.title||"Sans titre")}</span><span class="n">${words(s.text)}</span></button>`).join("");
  const tot=p.scenes.reduce((a,s)=>a+words(s.text),0);
  const c=k=>p.scenes.filter(s=>s.status===k).length;
  $("totals").innerHTML=`<span>${fmt(tot)} au total</span><span>${p.scenes.length} scènes · ${c("revise")} révisées</span><span>≈ ${Math.max(1,Math.round(tot/250))} page${tot>375?"s":""} de roman</span>`;
}
function renderEditor(){
  const s=Sc();if(!s)return;
  if(document.activeElement!==$("sceneTitle"))$("sceneTitle").value=s.title;
  if(document.activeElement!==$("sceneText"))$("sceneText").value=s.text;
  $("sceneStatus").value=s.status;
  $("wc").textContent=fmt(words(s.text));
}
function names(e){return [e.name,...(e.alias||"").split(",")].map(x=>x.trim()).filter(Boolean)}
function hits(){
  const t=(Sc()?.text||"")+" "+(Sc()?.title||"");
  return P().bible.filter(e=>names(e).some(n=>new RegExp("(^|[^\\p{L}])"+n.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"($|[^\\p{L}])","iu").test(t)));
}
function renderMentions(){
  const h=hits();
  $("mentions").innerHTML=h.length?h.map(e=>`<button class="chip" data-id="${e.id}">${esc(e.name)}</button>`).join(""):`<span class="hint">Aucune fiche de la bible n'apparaît encore dans cette scène.</span>`;
  document.querySelectorAll(".entry").forEach(d=>d.classList.toggle("hit",h.some(e=>e.id===d.dataset.id)));
}
function renderBible(open){
  const list=P().bible.filter(e=>filter==="all"||e.type===filter);
  $("entries").innerHTML=list.map(e=>`<details class="entry" data-id="${e.id}"${e.id===open?" open":""}>
    <summary><span class="nm">${esc(e.name||"Sans nom")}</span><span class="ty">${e.type}</span></summary>
    <input id="n-${e.id}" data-k="name" value="${esc(e.name)}" placeholder="Nom" aria-label="Nom">
    <input id="a-${e.id}" data-k="alias" value="${esc(e.alias||"")}" placeholder="Alias, surnoms" aria-label="Alias">
    <textarea id="t-${e.id}" data-k="notes" placeholder="Notes, apparence, histoire, règles…" aria-label="Notes">${esc(e.notes||"")}</textarea>
    <div class="row"><select id="y-${e.id}" data-k="type" aria-label="Type">${["Personnage","Lieu","Lore"].map(t=>`<option${t===e.type?" selected":""}>${t}</option>`).join("")}</select><button class="del" data-del="${e.id}">Supprimer</button></div>
  </details>`).join("")||`<p class="hint">Aucune fiche dans cette catégorie.</p>`;
  renderMentions();
}
function all(){renderProjects();renderScenes();renderEditor();renderBible()}

// ---------- interactions (reprises du prototype) ----------

$("sceneList").onclick=e=>{const b=e.target.closest(".scene");if(!b)return;P().sceneId=b.dataset.id;save();renderScenes();$("sceneTitle").blur();$("sceneText").blur();renderEditor();renderMentions();setTab("ecrire")};
$("sceneTitle").oninput=e=>{Sc().title=e.target.value;queue();renderScenes();renderMentions()};
$("sceneText").oninput=e=>{Sc().text=e.target.value;queue();$("wc").textContent=fmt(words(e.target.value));renderScenes();renderMentions()};
$("sceneStatus").onchange=e=>{Sc().status=e.target.value;save();renderScenes()};
$("addScene").onclick=()=>{const p=P(),s={id:uid(),title:"Nouvelle scène",status:"idee",text:""};const i=p.scenes.indexOf(Sc());p.scenes.splice(i+1,0,s);p.sceneId=s.id;save();renderScenes();renderEditor();renderMentions();setTab("ecrire");$("sceneTitle").select()};
function move(d){const p=P(),i=p.scenes.indexOf(Sc()),j=i+d;if(j<0||j>=p.scenes.length)return;[p.scenes[i],p.scenes[j]]=[p.scenes[j],p.scenes[i]];save();renderScenes()}
$("upBtn").onclick=()=>move(-1);$("downBtn").onclick=()=>move(1);
let armed=null;
function arm(btn,key,fn,label){if(armed===key){fn();armed=null;return}armed=key;btn.textContent="Confirmer ?";btn.classList.add("arm");setTimeout(()=>{if(armed===key){armed=null;btn.textContent=label;btn.classList.remove("arm")}},2500)}
$("delScene").onclick=e=>arm(e.target,"scene",()=>{const p=P();if(p.scenes.length<2){toast("Garde au moins une scène");e.target.textContent="Supprimer la scène";return}const i=p.scenes.indexOf(Sc());p.scenes.splice(i,1);p.sceneId=p.scenes[Math.max(0,i-1)].id;save();e.target.textContent="Supprimer la scène";all()},"Supprimer la scène");
$("projectSel").onchange=e=>{S.current=e.target.value;save();all()};
$("newProject").onclick=()=>{const s={id:uid(),title:"Première scène",status:"idee",text:""};const p={id:uid(),name:"Nouveau projet",sceneId:s.id,scenes:[s],bible:[]};S.projects.push(p);S.current=p.id;save();all();
  renameProject()};
const selEl=$("projectSel");
function renameProject(){const p=P();const n=document.createElement("input");n.value=p.name;n.id="pname";n.className="btn";n.style.maxWidth="220px";n.setAttribute("aria-label","Nom du projet");selEl.replaceWith(n);n.select();
  n.onblur=()=>{p.name=n.value.trim()||"Nouveau projet";n.replaceWith(selEl);save();renderProjects()};n.onkeydown=k=>{if(k.key==="Enter")n.blur()}}
$("renameBtn").onclick=renameProject;
$("addEntry").onclick=()=>{const e={id:uid(),type:filter==="all"?"Personnage":filter,name:"",alias:"",notes:""};P().bible.unshift(e);save();renderBible(e.id);$("n-"+e.id).focus();setTab("bible")};
$("entries").oninput=e=>{const d=e.target.closest(".entry"),k=e.target.dataset.k;if(!d||!k)return;const en=P().bible.find(x=>x.id===d.dataset.id);en[k]=e.target.value;queue();if(k==="name")d.querySelector(".nm").textContent=en.name||"Sans nom";if(k==="type")d.querySelector(".ty").textContent=en.type;renderMentions()};
$("entries").onclick=e=>{const id=e.target.dataset.del;if(!id)return;arm(e.target,"e"+id,()=>{const b=P().bible;b.splice(b.findIndex(x=>x.id===id),1);save();renderBible()},"Supprimer")};
$("filters").onclick=e=>{const f=e.target.dataset.f;if(!f)return;filter=f;document.querySelectorAll("#filters button").forEach(b=>b.classList.toggle("on",b.dataset.f===f));renderBible()};
$("mentions").onclick=e=>{const id=e.target.dataset.id;if(!id)return;filter="all";document.querySelectorAll("#filters button").forEach(b=>b.classList.toggle("on",b.dataset.f==="all"));renderBible(id);setTab("bible");document.querySelector(`.entry[data-id="${id}"]`)?.scrollIntoView({block:"nearest"})};
$("focusBtn").onclick=()=>{const on=document.body.classList.toggle("focus");$("focusBtn").textContent=on?"Quitter le focus":"Mode focus";if(on)setTab("ecrire")};
$("exportBtn").onclick=()=>{const p=P();const txt="# "+p.name+"\n\n"+p.scenes.map(s=>"## "+(s.title||"Sans titre")+"\n\n"+s.text).join("\n\n");
  navigator.clipboard.writeText(txt).then(()=>toast("Texte du projet copié")).catch(()=>toast("Copie refusée par le navigateur"))};
function setTab(t){$("app").dataset.tab=t;document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.t===t))}
document.querySelector(".tabs").onclick=e=>{const t=e.target.dataset.t;if(t)setTab(t)};

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
$("dlJson").onclick = async () => {
  await save();
  const blob = new Blob([JSON.stringify({ format: "atelier", version: 1, exportedAt: new Date().toISOString(), data: S }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `atelier-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
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

all();
document.body.classList.add("ready");
