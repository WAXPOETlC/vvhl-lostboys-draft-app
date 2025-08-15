// === CONFIG ===
const LS_KEY = 'vvhl_backend_url';
const DEFAULT_BACKEND = ''; // paste your Web App URL here later
let BASE = localStorage.getItem(LS_KEY) || DEFAULT_BACKEND;

// Logos (optional): set URLs in the Settings sheet; backend will return them if present
let STATE = null;
let ACTIVE_PICK = null;

// === Helpers ===
const $ = sel => document.querySelector(sel);
function fmt(n){ if(n===undefined||n===null||n==='') return '-'; const x=Number(n); return isNaN(x)? String(n): x.toFixed(2); }
function badge(cls, text){ return `<span class="badge ${cls}">${text}</span>`; }

function setStatus(msg){ $('#status').textContent = msg; }

function saveBackend(){
  const url = $('#backendUrl').value.trim();
  if(!url){ alert('Enter your Web App URL first.'); return; }
  BASE = url.replace(/\/$/, '');
  localStorage.setItem(LS_KEY, BASE);
  setStatus('Backend saved.');
  refreshAll();
}

async function api(path, opts = {}) {
  if (!BASE) throw new Error('Set Backend URL at bottom of page.');
  const isGet = !opts.method || opts.method.toUpperCase() === 'GET';

  // Build URL with ?path= (so /exec?path=/state etc.)
  const url = BASE + (BASE.includes('?') ? '' : '?path=') + encodeURIComponent(path);

  const fetchOpts = { method: opts.method || 'GET' };

  if (isGet) {
    // No headers for GET -> avoids preflight
  } else {
    // Convert body JSON -> x-www-form-urlencoded to avoid preflight
    const raw = opts.body ? JSON.parse(opts.body) : {};
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) {
      params.append(k, typeof v === 'object' ? JSON.stringify(v) : v);
    }
    fetchOpts.body = params.toString();
    fetchOpts.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  }

  const res = await fetch(url, fetchOpts);
  if (!res.ok) throw new Error('API error: ' + res.status);
  return await res.json();
}

// === Render ===
function renderBoard(state){
  const el = $('#boardGrid'); el.innerHTML = '';
  state.board.forEach(p => {
    const div = document.createElement('div');
    div.className = 'pick' + (ACTIVE_PICK===p.Pick ? ' active':'');
    div.onclick = () => { ACTIVE_PICK = p.Pick; renderBoard(state); renderPickInspector(state); };
    div.innerHTML = `
      <div class="meta">#${p.Overall} • R${p.Round} • ${p.Team}</div>
      <div class="player">${p.Gamertag ? p.Gamertag : '—'}</div>
    `;
    el.appendChild(div);
  });
}

function renderPickInspector(state){
  const el = $('#pickInfo');
  if(!ACTIVE_PICK){
    const next = state.board.find(x => !x.Gamertag);
    if(next) ACTIVE_PICK = next.Pick;
  }
  const pick = state.board.find(x => x.Pick===ACTIVE_PICK);
  if(!pick){ el.textContent = 'Select a pick.'; return; }
  const needs = state.teamNeeds[pick.Team] || { G:0,D:0,W:0,C:0,OpenSlots:0 };
  el.innerHTML = `
    <div><b>On the clock:</b> ${pick.Team} — Pick #${pick.Overall} (R${pick.Round})</div>
    <div>Needs: ${badge('', 'G '+needs.G)} ${badge('', 'D '+needs.D)} ${badge('', 'W '+needs.W)} ${badge('', 'C '+needs.C)}</div>
    <div style="margin-top:6px;font-size:12px;color:#94a3b8">Click a player to fill this pick.</div>
  `;
}

function renderPlayers(state){
  const q = $('#search').value.toLowerCase();
  const pos = $('#posFilter').value;
  const cat = $('#catFilter').value;
  const stat = $('#statusFilter').value;

  const list = $('#playerList'); list.innerHTML='';

  const filtered = state.players.filter(p => {
    if(p.Status && p.Status.toLowerCase()==='drafted' && stat==='') return false;
    if(stat && p.Status!==stat) return false;
    if(pos && p.PrimaryPos!==pos) return false;
    if(cat && p.Category!==cat) return false;
    if(q){
      const hay = (p.Gamertag+' '+(p.RegistrationNotes||'')+' '+(p.Comment||'')).toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  }).sort((a,b)=>{
    const ra = Number(a.OverallRank||9999); const rb=Number(b.OverallRank||9999);
    return ra - rb;
  });

  filtered.slice(0,400).forEach(p => {
    const div = document.createElement('div');
    const catCls = p.Category==='We Want' ? 'cat-Want' : p.Category==='Possible Target' ? 'cat-Possible' : p.Category==='Do Not Draft' ? 'cat-DoNot' : '';
    div.className = 'pcard';
    div.onclick = () => draftPlayer(p);
    div.innerHTML = `
      <div><b>${p.Gamertag}</b> ${badge('', p.PrimaryPos)} ${p.Rookie==='Yes'? badge('', 'Rookie'): ''} ${catCls? badge(catCls, p.Category): ''}</div>
      <div class="statrow">
        <div class="stat"><div class="k">GP</div><div class="v">${fmt(p.GP)}</div></div>
        <div class="stat"><div class="k">G</div><div class="v">${fmt(p.G)}</div></div>
        <div class="stat"><div class="k">A</div><div class="v">${fmt(p.A)}</div></div>
        <div class="stat"><div class="k">P</div><div class="v">${fmt(p.P)}</div></div>
        <div class="stat"><div class="k">SV%</div><div class="v">${fmt(p['SV%'])}</div></div>
        <div class="stat"><div class="k">GAA</div><div class="v">${fmt(p.GAA)}</div></div>
      </div>
      <div class="hint">${p.RegistrationNotes||''}</div>
    `;
    list.appendChild(div);
  });
}

function renderPlayerDetail(p){
  const el = $('#playerDetail');
  if(!p){ el.textContent = 'Select a player…'; return; }
  const lines = [
    ['Pos', p.PrimaryPos + (p.SecondaryPos1? (' / '+p.SecondaryPos1 + (p.SecondaryPos2? '/'+p.SecondaryPos2:'')) : '')],
    ['Goalie Pref', p.GoaliePref||'-'],
    ['Role', p.Role||'-'],
    ['GP (Skater)', fmt(p.GP)], ['GGP (Goalie GP)', fmt(p.GGP)],
    ['G/A/P', `${fmt(p.G)}/${fmt(p.A)}/${fmt(p.P)}`],
    ['SV% / GAA', `${fmt(p['SV%'])} / ${fmt(p.GAA)}`],
    ['(+/-)', fmt(p.PlusMinus)],
    ['Notes', p.RegistrationNotes||'-']
  ];
  el.innerHTML = lines.map(([k,v]) => `<div><span class="k">${k}:</span> ${v}</div>`).join('');
}

// === Actions ===
async function refreshAll(){
  setStatus('Loading…');
  try {
    const state = await api('/state');
    STATE = state;
    $('#lbLogo').src = state.settings.LostBoysLogoURL || '';
    $('#leagueLogo').src = state.settings.LeagueLogoURL || '';
    renderBoard(state);
    renderPickInspector(state);
    renderPlayers(state);
    setStatus('Loaded.');
  } catch (e){
    console.error(e); setStatus(e.message);
  }
}

async function draftPlayer(player){
  if(!ACTIVE_PICK){ alert('Choose a pick on the board first.'); return; }
  if(!confirm(`Draft ${player.Gamertag} at pick #${ACTIVE_PICK}?`)) return;
  setStatus('Drafting…');
  try{
    await api('/draft', { method:'POST', body: JSON.stringify({ pick: ACTIVE_PICK, gamertag: player.Gamertag })});
    await refreshAll();
    setStatus('Drafted.');
  }catch(e){ console.error(e); setStatus(e.message); }
}

async function undo(){
  setStatus('Undoing…');
  try{ await api('/undo', { method:'POST', body:'{}' }); await refreshAll(); setStatus('Undone.'); }
  catch(e){ setStatus(e.message); }
}

async function openOrderEditor(){
  const csv = prompt('Paste full pick→team list as "pick,team" per line. Leave blank to cancel.');
  if(!csv) return;
  setStatus('Updating order…');
  try{ await api('/order', { method:'POST', body: JSON.stringify({ csv })}); await refreshAll(); setStatus('Order updated.'); }
  catch(e){ setStatus(e.message); }
}

// === Init ===
window.addEventListener('DOMContentLoaded', () => {
  $('#backendUrl').value = BASE;
  $('#saveBackend').onclick = saveBackend;
  $('#refreshBtn').onclick = refreshAll;
  $('#undoBtn').onclick = undo;
  $('#orderBtn').onclick = openOrderEditor;
  $('#search').oninput = () => renderPlayers(STATE);
  $('#posFilter').onchange = () => renderPlayers(STATE);
  $('#catFilter').onchange = () => renderPlayers(STATE);
  $('#statusFilter').onchange = () => renderPlayers(STATE);
  document.addEventListener('keydown', (e)=>{ if(e.key.toLowerCase()==='r') refreshAll(); });
  setStatus('Set your Backend URL (bottom right) then click Refresh.');
});
