// RR Pokédex Checklist PWA (offline-first after first load)
const DATA_URL = 'https://docs.google.com/document/u/0/d/1KT_wdS5KNOayc5dzAFiZ3FX-9EpPM-aMWH6WH5tWnJM/mobilebasic';
const DEFAULT_VARIANT = 'Default';

const STORAGE = {
  entries: 'rr_entries_v1',           // [{num,name}]
  progress: 'rr_progress_rows_v1',    // {"num|variant":{caught,shiny}}
  updatedAt: 'rr_entries_updated_v1',
};

const hexLineRe = /^\s*(?:•|\*)\s*([0-9A-Fa-f]{4})\s+(.+?)\s*$/;

const el = {
  list: document.getElementById('list'),
  search: document.getElementById('search'),
  stats: document.getElementById('statsPill'),
  view: document.getElementById('viewPill'),
  status: document.getElementById('statusPill'),
  refresh: document.getElementById('refreshBtn'),
  toast: document.getElementById('toast'),
  onlyUncaught: document.getElementById('onlyUncaught'),
  onlyShiny: document.getElementById('onlyShiny'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  installBtn: document.getElementById('installBtn'),
};

let entries = [];     // base species list
let rowsAll = [];     // expanded rows incl variants
let filtered = [];
let progress = {};    // key -> {caught, shiny}

function toast(msg){
  el.toast.textContent = msg;
  el.toast.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.toast.style.display='none', 2600);
}

function makeKey(num, variant){
  const v = (variant && variant.trim()) ? variant.trim() : DEFAULT_VARIANT;
  return `${num}|${v}`;
}
function splitKey(key){
  const idx = key.indexOf('|');
  if(idx < 0) return [parseInt(key,10)||0, DEFAULT_VARIANT];
  const num = parseInt(key.slice(0, idx),10)||0;
  const variant = key.slice(idx+1).trim() || DEFAULT_VARIANT;
  return [num, variant];
}

function loadLocal(){
  try { entries = JSON.parse(localStorage.getItem(STORAGE.entries) || '[]'); } catch { entries = []; }
  try { progress = JSON.parse(localStorage.getItem(STORAGE.progress) || '{}'); } catch { progress = {}; }
  return {entries, progress};
}
function saveLocal(){
  localStorage.setItem(STORAGE.entries, JSON.stringify(entries));
  localStorage.setItem(STORAGE.progress, JSON.stringify(progress));
  localStorage.setItem(STORAGE.updatedAt, String(Date.now()));
}

function parseEntriesFromHtml(html){
  const map = new Map();
  for(const line of html.split(/\r?\n/)){
    const m = line.match(hexLineRe);
    if(!m) continue;
    const hex = m[1].toUpperCase();
    let name = (m[2]||'').trim();
    name = name
      .replaceAll('&amp;', '&')
      .replaceAll('&#39;', "'")
      .replaceAll('&quot;', '"')
      .replaceAll('&nbsp;', ' ');
    const num = parseInt(hex, 16);
    if(!Number.isFinite(num)) continue;
    if(!map.has(num)) map.set(num, name);
  }
  const nums = [...map.keys()].sort((a,b)=>a-b);
  return nums.map(n => ({num:n, name: map.get(n)}));
}

async function refreshListOnline(){
  el.refresh.disabled = true;
  el.status.textContent = 'Refreshing…';
  try{
    const res = await fetch(DATA_URL, {headers:{'User-Agent':'Mozilla/5.0 (RRChecklist)'}});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const parsed = parseEntriesFromHtml(html);
    if(!parsed.length) throw new Error('Could not parse list.');
    entries = parsed;

    for(const e of entries){
      const k = makeKey(e.num, DEFAULT_VARIANT);
      if(!progress[k]) progress[k] = {caught:false, shiny:false};
    }
    const valid = new Set(entries.map(e=>e.num));
    for(const k of Object.keys(progress)){
      const [n] = splitKey(k);
      if(!valid.has(n)) delete progress[k];
    }

    saveLocal();
    rebuildRows();
    render();
    toast(`Loaded ${entries.length} Pokémon. Cached for offline use.`);
    el.status.textContent = 'Ready (offline after first load)';
  }catch(err){
    console.error(err);
    toast(`Refresh failed: ${err.message || err}`);
    el.status.textContent = navigator.onLine ? 'Online (refresh failed)' : 'Offline';
  }finally{
    el.refresh.disabled = false;
  }
}

function rebuildRows(){
  const nameByNum = new Map(entries.map(e=>[e.num, e.name]));
  const out = [];
  for(const [k,v] of Object.entries(progress)){
    const [num, variant] = splitKey(k);
    const name = nameByNum.get(num);
    if(!name) continue;
    out.push({
      key: makeKey(num, variant),
      num,
      name,
      variant,
      caught: !!v.caught,
      shiny: !!v.shiny,
    });
  }
  out.sort((a,b)=>{
    if(a.num !== b.num) return a.num - b.num;
    const aDef = a.variant === DEFAULT_VARIANT ? 0 : 1;
    const bDef = b.variant === DEFAULT_VARIANT ? 0 : 1;
    if(aDef !== bDef) return aDef - bDef;
    return a.variant.toLowerCase().localeCompare(b.variant.toLowerCase());
  });
  rowsAll = out;
  applyFilter();
}

function applyFilter(){
  const q = (el.search.value || '').trim().toLowerCase();
  const onlyUncaught = el.onlyUncaught.checked;
  const onlyShiny = el.onlyShiny.checked;
  const exactNum = /^\d+$/.test(q) ? parseInt(q,10) : null;

  filtered = rowsAll.filter(r=>{
    if(onlyUncaught && r.caught) return false;
    if(onlyShiny && !r.shiny) return false;

    if(!q) return true;
    if(exactNum !== null && r.num === exactNum) return true;
    return r.name.toLowerCase().includes(q) || r.variant.toLowerCase().includes(q);
  });
}

function updateStats(){
  const species = entries.length;
  const rows = rowsAll.length;
  const caught = rowsAll.filter(r=>r.caught).length;
  const shiny = rowsAll.filter(r=>r.shiny).length;
  el.stats.textContent = `Species: ${species}  |  Rows: ${rows}  |  Caught: ${caught}  |  Shiny: ${shiny}`;
  el.view.textContent = `Showing: ${filtered.length}`;
}

function render(){
  applyFilter();
  updateStats();
  el.list.innerHTML = '';

  for(const r of filtered){
    const card = document.createElement('div');
    card.className = 'card';

    const top = document.createElement('div');
    top.className = 'cardTop';

    const left = document.createElement('div');
    left.style.minWidth = '0';

    const num = document.createElement('div');
    num.className = 'num';
    num.textContent = `#${r.num}`;

    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = r.name;

    const variant = document.createElement('div');
    variant.className = 'variant';
    variant.textContent = r.variant;

    left.appendChild(num);
    left.appendChild(name);
    left.appendChild(variant);

    const right = document.createElement('div');
    right.style.display='flex';
    right.style.gap='8px';
    right.style.alignItems='center';

    const addBtn = document.createElement('button');
    addBtn.className = 'smallBtn';
    addBtn.textContent = 'Add variant';
    addBtn.onclick = () => addVariant(r.num, r.name);

    right.appendChild(addBtn);

    top.appendChild(left);
    top.appendChild(right);

    const actions = document.createElement('div');
    actions.className = 'actions';

    const caughtT = document.createElement('div');
    caughtT.className = 'toggle caught' + (r.caught ? ' on' : '');
    caughtT.innerHTML = r.caught ? '✅ Caught' : '⬜ Caught';
    caughtT.onclick = () => toggleCaught(r.key);

    const shinyT = document.createElement('div');
    shinyT.className = 'toggle shiny' + (r.shiny ? ' on' : '');
    shinyT.innerHTML = r.shiny ? '✨ Shiny' : '☆ Shiny';
    shinyT.onclick = () => toggleShiny(r.key);

    actions.appendChild(caughtT);
    actions.appendChild(shinyT);

    if(r.variant !== DEFAULT_VARIANT){
      const renameBtn = document.createElement('button');
      renameBtn.className = 'smallBtn';
      renameBtn.textContent = 'Rename';
      renameBtn.onclick = () => renameVariant(r.key);

      const delBtn = document.createElement('button');
      delBtn.className = 'smallBtn danger';
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => deleteVariant(r.key);

      actions.appendChild(renameBtn);
      actions.appendChild(delBtn);
    }

    card.appendChild(top);
    card.appendChild(actions);
    el.list.appendChild(card);
  }
}

function toggleCaught(key){
  const obj = progress[key] || (progress[key] = {caught:false, shiny:false});
  obj.caught = !obj.caught;
  if(!obj.caught) obj.shiny = false;
  saveLocal();
  rebuildRows();
  render();
}
function toggleShiny(key){
  const obj = progress[key] || (progress[key] = {caught:false, shiny:false});
  obj.shiny = !obj.shiny;
  if(obj.shiny) obj.caught = true;
  saveLocal();
  rebuildRows();
  render();
}

function addVariant(num, name){
  const label = prompt(`Variant/form label for #${num} ${name}:`, 'Alolan');
  if(!label) return;
  const v = label.trim();
  if(!v) return;
  const key = makeKey(num, v);
  if(progress[key]){
    toast('That variant already exists.');
    return;
  }
  progress[key] = {caught:false, shiny:false};
  saveLocal();
  rebuildRows();
  render();
}

function renameVariant(key){
  const [num, variant] = splitKey(key);
  const label = prompt(`Rename variant for #${num}:\n(Current: ${variant})`, variant);
  if(!label) return;
  const v = label.trim();
  if(!v || v === variant) return;
  const newKey = makeKey(num, v);
  if(progress[newKey]){
    toast('That variant label already exists.');
    return;
  }
  progress[newKey] = progress[key];
  delete progress[key];
  saveLocal();
  rebuildRows();
  render();
}

function deleteVariant(key){
  const [num, variant] = splitKey(key);
  if(variant === DEFAULT_VARIANT){
    toast('Default row can’t be deleted.');
    return;
  }
  if(!confirm(`Delete variant row:\n#${num} — ${variant}?`)) return;
  delete progress[key];
  saveLocal();
  rebuildRows();
  render();
}

function exportData(){
  const payload = {
    exportedAt: new Date().toISOString(),
    entriesCount: entries.length,
    progress,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rr_checklist_export.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}

function importData(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const data = JSON.parse(reader.result);
      if(!data || typeof data !== 'object' || !data.progress) throw new Error('Invalid file.');
      progress = data.progress;
      for(const e of entries){
        const k = makeKey(e.num, DEFAULT_VARIANT);
        if(!progress[k]) progress[k] = {caught:false, shiny:false};
      }
      saveLocal();
      rebuildRows();
      render();
      toast('Import complete.');
    }catch(e){
      toast(`Import failed: ${e.message || e}`);
    }
  };
  reader.readAsText(file);
}

// Service worker (offline)
if('serviceWorker' in navigator){
  window.addEventListener('load', async ()=>{
    try{ await navigator.serviceWorker.register('sw.js'); }catch(e){}
  });
}

// Install prompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  el.installBtn.style.display = 'inline-block';
});
el.installBtn?.addEventListener('click', async ()=>{
  if(!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  el.installBtn.style.display = 'none';
});

window.addEventListener('online', ()=>{ el.status.textContent = 'Online'; });
window.addEventListener('offline', ()=>{ el.status.textContent = 'Offline'; });

el.refresh.addEventListener('click', refreshListOnline);
el.search.addEventListener('input', ()=>{ render(); });
el.onlyUncaught.addEventListener('change', ()=>{ render(); });
el.onlyShiny.addEventListener('change', ()=>{ render(); });
el.exportBtn.addEventListener('click', exportData);
el.importBtn.addEventListener('click', ()=> el.importFile.click());
el.importFile.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0];
  if(f) importData(f);
  el.importFile.value = '';
});

(function boot(){
  loadLocal();
  rebuildRows();
  render();
  if(entries.length){
    el.status.textContent = navigator.onLine ? 'Ready' : 'Ready (offline)';
  }else{
    el.status.textContent = navigator.onLine ? 'Ready (tap Refresh list)' : 'Offline (connect once then Refresh)';
  }
})();
