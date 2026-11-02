// Compact Deskmate: the Chrome toolbar popup, and (via window.deskBridge) the Mac app's
// floating mini office. chrome.* is only touched when bridge.platform === 'extension'.
import { bridge } from '../lib/bridge-ext.js';
import { STATUS, COFFEE_NOTE, display, initials, since, untilText, isCoffeeBreak } from '../lib/status.js';
import { esc, stColor, makeInteract, closeCoffeeChat } from '../lib/deskui.js';

const $ = (s, r = document) => r.querySelector(s);
const dark = matchMedia('(prefers-color-scheme: dark)');
const isExt = bridge.platform === 'extension';
const hasChrome = isExt && !!globalThis.chrome?.sidePanel;

let state = null;
let scene = null;
let sceneState = 'idle';   // idle → loading → ready | failed
let selected = null;

if (isExt && !new URLSearchParams(location.search).has('window')) document.documentElement.classList.add('ext-popup');

// ------------------------------------------------------------------ open the full desk / settings
// chrome.sidePanel.open() needs a user gesture, so call it right inside the click handler.
let windowId = null;
if (hasChrome) chrome.windows.getCurrent().then(w => { windowId = w.id; }).catch(() => {});

function openFull({ settings = false } = {}) {
  if (!hasChrome) { bridge.action('open-desk', settings ? { settings: true } : {}); return; }
  if (settings) chrome.storage.session?.set({ openSettings: true }).catch(() => {});
  const done = () => window.close();
  const fail = (e) => { console.warn('side panel', e); bridge.action('open-desk', settings ? { settings: true } : {}); };
  if (windowId != null) { chrome.sidePanel.open({ windowId }).then(done, fail); return; }
  chrome.windows.getCurrent().then(w => chrome.sidePanel.open({ windowId: w.id })).then(done, fail);
}
$('#openDesk').addEventListener('click', () => openFull());
$('#joinBtn').addEventListener('click', () => openFull());
$('#settings').addEventListener('click', () => openFull({ settings: !!state?.configured }));

// ------------------------------------------------------------------ state
queueMicrotask(() => bridge.onState((s) => { state = s; render(); }));

bridge.onEvent((e) => {
  if (e.type === 'react') scene?.react?.(e.from, e.emoji);
  if (e.type === 'wave') { scene?.wave?.(e.from); scene?.react?.(e.from, e.emoji || '👋'); toast(`${e.fromName} waved at you ${e.emoji || '👋'}`); }
  if (e.type === 'grow') scene?.grow?.(e.userId, e.reason);
  if (e.type === 'toast') toast(e.text);
  if (e.type === 'kudos' && e.toMe) toast(`${e.fromName} sent you kudos 👏`);
  if (e.type === 'kudos:wait') toast('You sent them kudos a moment ago 🙂');
  if (e.type === 'call:declined') toast(`${e.byName} can't talk right now`);
});

function render() {
  const s = state;
  const configured = !!s?.configured;
  $('#join').hidden = configured;
  $('#main').hidden = !configured;
  $('#openDesk').parentElement.hidden = !configured;
  const conn = $('#conn');
  conn.className = 'conn ' + (s?.conn || '');
  $('#team').textContent = configured ? (s.team || '') : '';
  const others = (s?.members || []).filter(m => m.id !== s.me?.id && m.online !== false);
  $('#sub').textContent = !configured ? 'Not set up yet' : ({
    online: 'Online',
    connecting: 'Connecting…',
    offline: 'Reconnecting…',
    error: 'Can’t reach the server',
  }[s.conn] || 'Connecting…');
  if (!configured) return;

  ensureScene();
  scene?.update?.(s);
  renderMe(s.me);
  const here = others.filter(m => STATUS[m.state]?.present).length;
  $('#onlineChip').innerHTML = `<b>${others.length}</b> online`;
  $('#onlineChip').title = `${others.length} teammate${others.length === 1 ? '' : 's'} online · ${here} at their desks`;
  renderStatus(s.me);
  renderTeam(s, others);
}

// ------------------------------------------------------------------ 3D office
async function ensureScene() {
  if (sceneState !== 'idle') return;
  if (new URLSearchParams(location.search).has('lite')) { sceneState = 'failed'; $('#stageFallback').hidden = false; return; }
  sceneState = 'loading';
  try {
    const { DeskScene } = await import('../sidepanel/desk3d.js');
    scene = new DeskScene($('#stage'), {
      compact: true,
      dark: dark.matches,
      onSelect: (id) => selectRow(id, true),
      onInteract: makeInteract({ bridge, getState: () => state, toast, focusStatus }),
    });
    globalThis.__deskScene = scene;
    dark.addEventListener('change', () => scene?.setTheme?.(dark.matches));
    sceneState = 'ready';
    if (state) scene.update(state);
  } catch (e) {
    console.warn('3D office unavailable', e);
    sceneState = 'failed';
    scene = null;
    $('#stageFallback').hidden = false;
  }
}

function focusStatus() {
  const box = $('.status');
  box.classList.remove('attn'); void box.offsetWidth; box.classList.add('attn');
  setTimeout(() => box.classList.remove('attn'), 2400);
  $('#status [aria-checked=true]')?.focus();
}

// ------------------------------------------------------------------ me
function renderMe(me) {
  const chip = $('#meChip');
  if (!me) { chip.innerHTML = ''; return; }
  const st = STATUS[me.state] || STATUS.desk;
  const label = isCoffeeBreak(me) ? 'Coffee break' : st.label;
  const when = me.until ? untilText(me.until) : since(me.since);
  const extend = me.state === 'lunch' || me.state === 'brb';
  const html = `<span class="dot" style="--s:${stColor(me.state)}"></span>
    <span class="t" title="${esc(me.message || '')}">${st.emoji} ${esc(label)}${when ? ` <small>· ${esc(when)}</small>` : ''}</span>
    ${extend ? '<button data-extend title="15 more minutes">+15m</button>' : ''}`;
  if (chip.dataset.k === html) return;
  chip.dataset.k = html;
  chip.innerHTML = html;
  chip.querySelector('[data-extend]')?.addEventListener('click', () => bridge.action('lunch:extend', { minutes: 15 }));
}

// ------------------------------------------------------------------ status selector
const OPTIONS = [
  { key: 'desk', state: 'desk', e: '💻', l: 'Desk', title: 'At desk' },
  { key: 'brb', state: 'brb', message: COFFEE_NOTE, e: '☕', l: 'Break', title: 'On a break (coffee)' },
  { key: 'meeting', state: 'meeting', e: '📅', l: 'Meeting', title: 'In a meeting' },
  { key: 'afk', state: 'afk', e: '💤', l: 'Away', title: 'Away' },
  { key: 'dnd', state: 'dnd', e: '🎧', l: 'Focus', title: 'Do not disturb' },
];
const MORE = [
  { state: 'lunch', e: '🍜', l: 'Lunch' },
  { state: 'leave', e: '🌴', l: 'On leave' },
];

function setStatus(opt) {
  const cur = state?.me?.state;
  // tapping the active one (other than desk) goes back to desk
  if (cur === opt.state && opt.state !== 'desk') return bridge.action('status', { state: 'desk' });
  bridge.action('status', opt.message ? { state: opt.state, message: opt.message } : { state: opt.state });
}

function renderStatus(me) {
  const seg = $('#status');
  if (!seg.childElementCount) {
    for (const o of OPTIONS) {
      const b = document.createElement('button');
      b.setAttribute('role', 'radio');
      b.dataset.state = o.key;
      b.title = o.title;
      b.style.setProperty('--c', stColor(o.key));
      b.innerHTML = `<span class="e">${o.e}</span><span class="l">${o.l}</span>`;
      b.onclick = () => setStatus(o);
      seg.appendChild(b);
    }
    const more = document.createElement('button');
    more.className = 'more';
    more.id = 'moreBtn';
    more.title = 'More: lunch, on leave, a note';
    more.setAttribute('aria-haspopup', 'menu');
    more.innerHTML = '<span class="e">⋯</span>';
    more.onclick = (e) => { e.stopPropagation(); toggleMore(); };
    seg.appendChild(more);
  }
  const cur = me?.state;
  for (const b of seg.querySelectorAll('[role=radio]')) b.setAttribute('aria-checked', String(cur === b.dataset.state));
  const moreBtn = $('#moreBtn');
  const inMore = MORE.find(o => o.state === cur);
  moreBtn.setAttribute('aria-checked', String(!!inMore));
  moreBtn.style.setProperty('--c', inMore ? stColor(inMore.state) : 'var(--accent)');
  moreBtn.querySelector('.e').textContent = inMore ? inMore.e : '⋯';
}

function toggleMore(force) {
  const menu = $('#moreMenu');
  const open = force ?? menu.hidden;
  if (!open) { menu.hidden = true; return; }
  const cur = state?.me?.state;
  menu.innerHTML = MORE.map(o => `<button role="menuitemradio" aria-checked="${cur === o.state}" data-s="${o.state}">${o.e} ${o.l}</button>`).join('')
    + `<hr><input id="noteInput" maxlength="80" placeholder="Set a note… (Enter)" value="${esc(state?.me?.message || '')}">`;
  menu.hidden = false;
  menu.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { setStatus(MORE.find(o => o.state === b.dataset.s)); toggleMore(false); });
  const input = $('#noteInput');
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { bridge.action('note', { message: input.value.trim() }); toggleMore(false); toast('Note saved'); }
    if (e.key === 'Escape') { e.stopPropagation(); toggleMore(false); }
  });
}
document.addEventListener('pointerdown', (e) => {
  const menu = $('#moreMenu');
  if (!menu.hidden && !menu.contains(e.target) && !e.target.closest('#moreBtn')) toggleMore(false);
  if (selected && !e.target.closest('.team-list') && e.target.tagName !== 'CANVAS' && !e.target.closest('.label')) selectRow(null);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { toggleMore(false); selectRow(null); } });

// ------------------------------------------------------------------ team
const ORDER = { help: 0, call: 1, desk: 2, meeting: 3, dnd: 4, brb: 5, lunch: 6, afk: 7, leave: 8 };
function renderTeam(s, others) {
  const ul = $('#teamList');
  const here = others.filter(m => STATUS[m.state]?.present).length;
  $('#count').textContent = others.length ? `${here} of ${others.length} at desk` : '';
  const rows = others.map(m => ({ m, d: display(m, s.helps) }))
    .sort((a, b) => (ORDER[a.d.key] ?? 9) - (ORDER[b.d.key] ?? 9) || a.m.name.localeCompare(b.m.name));
  const html = rows.length ? rows.map(({ m, d }) => {
    const label = isCoffeeBreak(m) ? 'Coffee break' : d.label;
    const sub = [label, m.until ? untilText(m.until) : since(m.since), m.message && !isCoffeeBreak(m) ? m.message : ''].filter(Boolean).map(esc).join(' · ');
    const help = d.key === 'help' && s.helps.find(h => h.from === m.id && !h.claimedBy);
    return `<li data-id="${esc(m.id)}" class="${STATUS[m.state]?.present ? '' : 'away'}${selected === m.id ? ' sel' : ''}">
      <div class="row" tabindex="0">
        <div class="av" style="--c:${esc(m.color || '')}">${initials(m.name)}<span class="ring" style="--s:${stColor(d.key, d.color)}"></span></div>
        <div class="txt"><b>${esc(m.name)}</b><span>${d.emoji} ${sub}</span></div>
        <span class="q">
          ${help ? `<button data-claim="${esc(help.id)}" title="Help ${esc(m.name.split(' ')[0])}">🙋</button>` : ''}
          <button data-wave title="Wave">👋</button>
          <button data-call title="Call">📞</button>
          <button data-kudos title="Send kudos">👏</button>
        </span>
      </div>
    </li>`;
  }).join('') : '<li class="empty">No teammates online right now.<br>Invite them from the full desk.</li>';
  if (ul.dataset.k === html) return;
  ul.dataset.k = html;
  ul.innerHTML = html;
  ul.querySelectorAll('li[data-id]').forEach(li => {
    const id = li.dataset.id;
    const name = () => state.members.find(x => x.id === id)?.name || 'them';
    li.querySelector('[data-wave]').onclick = (e) => { e.stopPropagation(); bridge.action('wave', { to: id }); scene?.wave?.(state.me?.id); toast(`Waved at ${name()} 👋`); };
    li.querySelector('[data-call]').onclick = (e) => { e.stopPropagation(); bridge.action('call', { to: id }); };
    li.querySelector('[data-kudos]').onclick = (e) => { e.stopPropagation(); bridge.action('kudos', { to: id }); };
    li.querySelector('[data-claim]')?.addEventListener('click', (e) => { e.stopPropagation(); bridge.action('help:claim', { id: e.currentTarget.dataset.claim }); });
    const row = li.querySelector('.row');
    row.onclick = () => selectRow(selected === id ? null : id);
    row.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); row.click(); } };
  });
}

function selectRow(id, fromScene = false) {
  if (id && id === state?.me?.id) { focusStatus(); return; }
  selected = id || null;
  for (const li of document.querySelectorAll('.team-list li[data-id]')) li.classList.toggle('sel', li.dataset.id === selected);
  if (!selected) return;
  const li = document.querySelector(`.team-list li[data-id="${CSS.escape(selected)}"]`);
  if (li && fromScene) {
    li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    li.classList.remove('flash'); void li.offsetWidth; li.classList.add('flash');
  }
}

// ------------------------------------------------------------------ quick reactions
$('#reactions').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  bridge.action('react', { emoji: b.dataset.emoji });
  if (b.dataset.emoji === '👋') scene?.wave?.(state?.me?.id);
  if (!scene) toast(`Sent ${b.dataset.emoji}`);
});

// relative times
setInterval(() => { if (state?.configured) { renderMe(state.me); renderTeam(state, state.members.filter(m => m.id !== state.me?.id && m.online !== false)); } }, 30000);

// ------------------------------------------------------------------ misc
let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2400);
}
addEventListener('pagehide', () => { closeCoffeeChat(); try { scene?.dispose?.(); } catch {} });
