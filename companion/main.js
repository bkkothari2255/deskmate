// Deskmate for Mac — menu-bar companion.
// Lives in the menu bar, keeps you on the team desk even when Chrome is closed,
// and floats help/call bubbles over every app.
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, protocol, net, screen, dialog,
  powerMonitor, globalShortcut, session, systemPreferences, shell, desktopCapturer } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import WebSocket from 'ws';
import { readMacFocus } from './macfocus.js';
import { DeskClient, newId } from './app/lib/client.js';
import * as statusLib from './app/lib/status.js';
const { STATUS, DEFAULT_SERVER } = statusLib;
// the synced copy may predate COFFEE_NOTE; fall back to the same text the extension uses
const COFFEE_NOTE = statusLib.COFFEE_NOTE || 'Coffee break ☕';
const isCoffeeBreak = (m) => !!m && m.state === 'brb' && /coffee/i.test(m.message || '');
import { fetchWeather } from './app/lib/weather.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.join(__dirname, 'app');
const ASSETS = path.join(__dirname, 'assets');
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');

const DEFAULTS = {
  server: DEFAULT_SERVER, team: '', name: '', email: '', color: '#6C8CFF',
  avatar: { skin: '#F5D0B5', hair: '#2B2118', style: 'short' },
  idleMinutes: 5, lunchMinutes: 45, gchat: false, bubbles: true, sound: true, autoBack: true, launchAtLogin: true,
  // floating mini office (opt-in) and expanded window
  miniOpen: false, miniOnTop: false, miniAllSpaces: false, miniBounds: null, fullBounds: null,
};
// window placement is owned by the Mac app, never round-tripped through the UI's settings form
const WINDOW_KEYS = ['miniOpen', 'miniOnTop', 'miniAllSpaces', 'miniBounds', 'fullBounds'];

let settings, client, tray, panel, callWin = null, miniWin = null, fullWin = null;
let quitting = false;
let incoming = null; // { name, callId, at } — latest call invite, for the tray indicator
const bubbles = new Map(); // id -> BrowserWindow
let idleState = 'active';

if (process.env.DESKMATE_USER_DATA) app.setPath('userData', process.env.DESKMATE_USER_DATA);

// one instance only
if (!app.requestSingleInstanceLock()) app.quit();

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// ------------------------------------------------------------------ settings
function loadSettings() {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(SETTINGS_FILE(), 'utf8')); } catch {}
  settings = { ...DEFAULTS, ...stored, avatar: { ...DEFAULTS.avatar, ...(stored.avatar || {}) } };
  if (!settings.userId) settings.userId = (settings.email || '').toLowerCase() || newId();
  settings.tz ||= Intl.DateTimeFormat().resolvedOptions().timeZone;
  // move old installs off the local development server onto the team's hosted one
  // (DESKMATE_SERVER=ws://localhost:8787 npm start still works for local development)
  if (process.env.DESKMATE_SERVER) settings.server = process.env.DESKMATE_SERVER;
  else if (!settings.serverMigrated) {   // once per install; choosing localhost again in Settings sticks
    if (/^wss?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(settings.server || '')) settings.server = DEFAULT_SERVER;
    settings.serverMigrated = true;
    saveSettings();
  }
}
function saveSettings() {
  fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
}

// ------------------------------------------------------------------ windows
const preload = path.join(__dirname, 'preload.cjs');
const webPreferences = { preload, contextIsolation: true, nodeIntegration: false, sandbox: true, autoplayPolicy: 'no-user-gesture-required' };
// desk windows: let Chromium throttle timers/rAF while hidden so the 3D scene costs nothing in the background
const deskPrefs = { ...webPreferences, backgroundThrottling: true };
const DRAG_CSS = '.drag-region{-webkit-app-region:drag} .drag-region button, .drag-region a, .drag-region input, .drag-region select, .drag-region textarea, .drag-region [role="button"]{-webkit-app-region:no-drag}';

function createPanel() {
  panel = new BrowserWindow({
    width: 400, height: 660, show: false, frame: false, resizable: false, movable: false,
    fullscreenable: false, minimizable: false, maximizable: false, skipTaskbar: true,
    vibrancy: 'popover', visualEffectState: 'active', roundedCorners: true,
    backgroundColor: '#00000000', transparent: false, webPreferences: deskPrefs,
  });
  panel.loadURL('app://deskmate/sidepanel/sidepanel.html');
  panel.on('blur', () => { if (!panel.webContents.isDevToolsOpened()) panel.hide(); });
  panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function togglePanel() {
  if (panel.isVisible()) return panel.hide();
  const tb = tray.getBounds();
  const { width } = panel.getBounds();
  const display = screen.getDisplayNearestPoint({ x: tb.x, y: tb.y });
  const wa = display.workArea;
  const x = Math.round(Math.min(Math.max(tb.x + tb.width / 2 - width / 2, wa.x + 8), wa.x + wa.width - width - 8));
  const y = Math.round(tb.y + tb.height + 6);
  panel.setPosition(x, process.platform === 'darwin' ? y : wa.y + 8);
  panel.show();
  panel.focus();
}

// ---- shared helpers for the movable windows
function onScreen(b) {
  if (!b || !Number.isFinite(b.x) || !Number.isFinite(b.y) || !(b.width > 0) || !(b.height > 0)) return false;
  return screen.getAllDisplays().some(({ workArea: a }) =>
    b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 40);
}
function rememberBounds(win, key) {
  let t = null;
  const save = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      if (win.isDestroyed() || win.isMinimized() || win.isFullScreen()) return;
      settings[key] = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
      saveSettings();
    }, 400);
  };
  win.on('resize', save);
  win.on('move', save);
}

// ---- floating mini office (opt-in): compact scene, my status, reactions, team list
const MINI = { width: 340, height: 520, minWidth: 300, minHeight: 420, maxWidth: 460, maxHeight: 760 };
function miniUrl() {
  // the compact popup page ships with the extension; until it's synced, fall back to the lite desk
  return fs.existsSync(path.join(APP_DIR, 'popup', 'popup.html'))
    ? 'app://deskmate/popup/popup.html?window=mini'
    : 'app://deskmate/sidepanel/sidepanel.html?lite=1&window=mini';
}
function createMini() {
  const wa = screen.getPrimaryDisplay().workArea;
  const saved = onScreen(settings.miniBounds) ? settings.miniBounds : null;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const width = clamp(saved?.width || MINI.width, MINI.minWidth, MINI.maxWidth);
  const height = clamp(saved?.height || MINI.height, MINI.minHeight, MINI.maxHeight);
  miniWin = new BrowserWindow({
    ...MINI, width, height,
    x: saved ? saved.x : wa.x + wa.width - width - 24,
    y: saved ? saved.y : wa.y + wa.height - height - 24,
    show: false, frame: false, resizable: true, movable: true, skipTaskbar: true,
    fullscreenable: false, minimizable: false, maximizable: false, hasShadow: true,
    vibrancy: 'under-window', visualEffectState: 'active', roundedCorners: true,
    backgroundColor: '#00000000', title: 'Deskmate mini office', webPreferences: deskPrefs,
  });
  applyMiniPrefs();
  miniWin.webContents.on('did-finish-load', () => {
    miniWin?.webContents.insertCSS(DRAG_CSS).catch(() => {});
    miniWin?.webContents.executeJavaScript("document.documentElement.classList.add('deskmate-mini')").catch(() => {});
  });
  miniWin.loadURL(miniUrl());
  rememberBounds(miniWin, 'miniBounds');
  // closing just tucks it away; it stays warm for the next toggle (and is throttled while hidden)
  miniWin.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    hideMini();
  });
  miniWin.on('closed', () => { miniWin = null; });
}
function applyMiniPrefs() {
  if (!miniWin || miniWin.isDestroyed()) return;
  miniWin.setAlwaysOnTop(!!settings.miniOnTop, 'floating');
  miniWin.setVisibleOnAllWorkspaces(!!settings.miniAllSpaces, { visibleOnFullScreen: !!settings.miniAllSpaces, skipTransformProcessType: true });
}
function showMini() {
  const fresh = !miniWin || miniWin.isDestroyed();
  if (fresh) createMini();
  const w = miniWin;
  const reveal = () => { if (!w.isDestroyed()) { w.show(); w.focus(); } };
  if (fresh) w.once('ready-to-show', reveal); else reveal();
  if (!settings.miniOpen) { settings.miniOpen = true; saveSettings(); }
}
function hideMini() {
  if (miniWin && !miniWin.isDestroyed()) miniWin.hide();
  if (settings.miniOpen) { settings.miniOpen = false; saveSettings(); }
}
function toggleMini() {
  if (miniWin && !miniWin.isDestroyed() && miniWin.isVisible()) hideMini(); else showMini();
}

// ---- expanded window: a normal macOS window with the full desk, team, settings and social bits
const FULL_CSS = `${DRAG_CSS}
html::before{content:"";position:fixed;top:0;left:0;right:0;height:28px;-webkit-app-region:drag;z-index:2147483646;pointer-events:none}
body{padding-top:28px;box-sizing:border-box}
main{min-height:calc(100vh - 28px)}
.top{-webkit-app-region:drag}
.top button,.top a,.top input,.top select{-webkit-app-region:no-drag}`;
function openFull({ settings: wantSettings = false } = {}) {
  if (fullWin && !fullWin.isDestroyed()) {
    if (fullWin.isMinimized()) fullWin.restore();
    fullWin.show(); fullWin.focus();
    if (wantSettings) fullWin.webContents.send('event', { type: 'open-settings' });
    return fullWin;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const saved = onScreen(settings.fullBounds) ? settings.fullBounds : null;
  const W = Math.min(980, wa.width - 80), H = Math.min(760, wa.height - 60);
  const win = fullWin = new BrowserWindow({
    width: Math.max(saved?.width || W, 420), height: Math.max(saved?.height || H, 640),
    x: saved ? saved.x : wa.x + Math.round((wa.width - W) / 2),
    y: saved ? saved.y : wa.y + Math.round((wa.height - H) / 2),
    minWidth: 420, minHeight: 640, show: false, title: 'Deskmate',
    titleBarStyle: 'hiddenInset', vibrancy: 'under-window', visualEffectState: 'followWindow',
    backgroundColor: '#00000000', fullscreenable: true, webPreferences: deskPrefs,
  });
  win.webContents.on('did-finish-load', () => {
    win.webContents.insertCSS(FULL_CSS).catch(() => {});
    win.webContents.executeJavaScript("document.documentElement.classList.add('deskmate-full')").catch(() => {});
  });
  win.loadURL(`app://deskmate/sidepanel/sidepanel.html?window=full${wantSettings ? '&settings=1' : ''}`);
  if (wantSettings) win.webContents.once('did-finish-load', () => win.webContents.send('event', { type: 'open-settings' }));
  win.once('ready-to-show', () => { win.show(); win.focus(); });
  rememberBounds(win, 'fullBounds');
  // a real window gets a Dock icon and Cmd-Tab entry while it's open, then we go back to the menu bar
  if (process.platform === 'darwin') app.dock?.show()?.catch?.(() => {});
  win.on('closed', () => {
    if (fullWin === win) fullWin = null;
    if (process.platform === 'darwin' && !quitting) app.dock?.hide();
  });
  return win;
}

function showBubble(data) {
  if (!settings.bubbles || bubbles.has(data.id)) return;
  if (bubbles.size >= 3) bubbles.values().next().value.close();
  const wa = screen.getPrimaryDisplay().workArea;
  const W = 380, H = 150;
  const w = new BrowserWindow({
    width: W, height: H, x: wa.x + wa.width - W - 4, y: wa.y + 8 + bubbles.size * (H - 18),
    frame: false, transparent: true, resizable: false, movable: false, show: false, focusable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false, fullscreenable: false, webPreferences,
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const chime = settings.sound !== false && ['help', 'invite', 'standup'].includes(data.kind) ? data.kind : null;
  w.loadURL(`app://deskmate/bubble/bubble.html#${encodeURIComponent(JSON.stringify({ ...data, chime }))}`);
  w.once('ready-to-show', () => w.showInactive());
  w.on('closed', () => { bubbles.delete(data.id); restackBubbles(); });
  bubbles.set(data.id, w);
}
function restackBubbles() {
  const wa = screen.getPrimaryDisplay().workArea;
  let i = 0;
  for (const w of bubbles.values()) { if (!w.isDestroyed()) w.setPosition(wa.x + wa.width - 384, wa.y + 8 + i++ * 132); }
}
function toBubbles(msg) {
  for (const w of bubbles.values()) if (!w.isDestroyed()) w.webContents.send('bubble', msg);
}

async function openCall(callId, ring) {
  if (process.platform === 'darwin') {
    for (const kind of ['microphone', 'camera']) {
      if (systemPreferences.getMediaAccessStatus(kind) !== 'granted') await systemPreferences.askForMediaAccess(kind).catch(() => {});
    }
  }
  const url = `app://deskmate/call/call.html?id=${encodeURIComponent(callId)}${ring ? `&ring=${encodeURIComponent(ring)}` : ''}`;
  if (callWin && !callWin.isDestroyed()) {
    if (!callWin.webContents.getURL().includes(`id=${encodeURIComponent(callId)}`)) callWin.loadURL(url);
    callWin.show(); callWin.focus();
    return;
  }
  const wa = screen.getPrimaryDisplay().workArea;
  const W = Math.min(1000, wa.width - 40), H = Math.min(680, wa.height - 40);
  callWin = new BrowserWindow({
    width: W, height: H, x: wa.x + Math.round((wa.width - W) / 2), y: wa.y + 30, title: 'Deskmate call',
    backgroundColor: '#202124', minimizable: true, resizable: true, minWidth: 520, minHeight: 400,
    webPreferences: { ...webPreferences, backgroundThrottling: false },   // keep audio/video smooth when minimised
  });
  callWin.loadURL(url);
  callWin.on('closed', () => { callWin = null; });
}

// ------------------------------------------------------------------ state → UI
function fullState(snap = client.snapshot()) {
  const { lastStatus, miniBounds, fullBounds, ...pub } = settings;
  return { ...snap, settings: pub, configured: client.configured, gchat: { available: false } };
}

async function refreshWeather() {
  try {
    const w = await fetchWeather({ place: settings.weatherPlace, tz: settings.tz || Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (w) client.setWeather(w);
  } catch (e) { console.warn('[deskmate] weather', e.message || e); }
}

function onChange(snap) {
  // remember how big my plant is, so it survives a server restart
  if ((snap.me?.plant || 0) > (settings.plant || 0)) { settings.plant = snap.me.plant; client.settings.plant = snap.me.plant; saveSettings(); }
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('state', fullState(snap));
  updateTray(snap);
}

function onEvent(e, snap) {
  for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send('event', e);
  const me = snap.me;
  const focused = me?.state === 'dnd';
  switch (e.type) {
    case 'my-status':
      settings.lastStatus = { state: e.member.state, message: e.member.message, until: e.member.until, source: e.member.source };
      saveSettings();
      break;
    case 'help:new':
      if (e.mine || focused) break;
      if (e.help.to && me && !e.help.to.includes(me.id)) break;
      showBubble({ kind: 'help', id: e.help.id, name: e.help.fromName, topic: e.help.topic, color: e.help.color, avatar: e.help.avatar, urgency: e.help.urgency });
      break;
    case 'help:claimed':
      toBubbles({ type: 'bubble:update', id: e.id, claimedName: e.byName, byMe: e.byMe });
      // both people join the same call room (its id is the help request's id)
      if (e.byThisDevice || e.mine) openCall(e.callId);
      break;
    case 'help:closed':
      toBubbles({ type: 'bubble:close', id: e.id });
      break;
    case 'wave':
      if (focused) break;
      showBubble({ kind: 'wave', id: newId(), from: e.from, name: e.fromName, emoji: e.emoji, color: snap.members.find(m => m.id === e.from)?.color, avatar: snap.members.find(m => m.id === e.from)?.avatar });
      break;
    case 'call:invite':
      incoming = { name: e.fromName || 'Someone', callId: e.callId, at: Date.now() };
      updateTray(snap);
      setTimeout(() => { if (incoming?.callId === e.callId) { incoming = null; updateTray(client.snapshot()); } }, 60000);
      showBubble({ kind: 'invite', id: e.callId, url: e.url, from: e.from, name: e.fromName, color: e.color, avatar: e.avatar });
      break;
    case 'kudos':
      if (e.toMe) showBubble({ kind: 'kudos', id: newId(), from: e.from, name: e.fromName, color: snap.members.find(m => m.id === e.from)?.color, avatar: snap.members.find(m => m.id === e.from)?.avatar });
      break;
    case 'standup':
      if (e.started && e.inIt) showBubble({ kind: 'standup', id: 'standup-' + e.standup.id, name: '', color: me?.color, avatar: me?.avatar });
      break;
  }
}

function trayImage(name) {
  const img = nativeImage.createFromPath(path.join(ASSETS, `${name}.png`));
  if (name === 'trayTemplate') img.setTemplateImage(true);
  return img;
}

function updateTray(snap) {
  if (!tray) return;
  const me = snap.me;
  const open = snap.helps.filter(h => !h.claimedBy && h.from !== me?.id);
  const others = snap.members.filter(m => m.id !== me?.id);
  const here = others.filter(m => STATUS[m.state]?.present).length;
  if (snap.conn !== 'online') {
    tray.setImage(trayImage('trayTemplate'));
    tray.setTitle(snap.conn === 'setup' ? '' : ' …');
    tray.setToolTip(snap.conn === 'setup' ? 'Deskmate — click to set up' : 'Deskmate — connecting…');
  } else if (open.length) {
    tray.setImage(trayImage('trayAlert'));
    tray.setTitle(` ${open[0].fromName.split(' ')[0]} needs help`);
    tray.setToolTip(`${open.length} teammate(s) asking for help`);
  } else if (incoming) {
    tray.setImage(trayImage('trayAlert'));
    tray.setTitle(` ${incoming.name.split(' ')[0]} is calling`);
    tray.setToolTip(`${incoming.name} invited you to a call`);
  } else {
    tray.setImage(trayImage('trayTemplate'));
    // when I'm not at my desk, a short label ("Focus", "BRB", "Lunch") is the availability indicator;
    // at my desk it's just how many teammates are around
    const away = me && me.state !== 'desk';
    const label = !away ? '' : isCoffeeBreak(me) ? 'Coffee' : (STATUS[me.state]?.short || '');
    tray.setTitle(away && label ? ` ${label}` : ` ${here}`);
    const mine = me ? `You: ${isCoffeeBreak(me) ? COFFEE_NOTE : STATUS[me.state]?.label || me.state}${me.message && !isCoffeeBreak(me) ? ` — ${me.message}` : ''}\n` : '';
    tray.setToolTip(`Deskmate · ${snap.team}\n${mine}${here} at desk · ${others.filter(m => m.state === 'lunch').length} at lunch`);
  }
  tray.setContextMenu(null);
}

function contextMenu() {
  const me = client.state.me;
  const snap = client.snapshot();
  const coffee = isCoffeeBreak(me);
  const status = (key) => ({
    label: `${STATUS[key].emoji}  ${STATUS[key].label}`, type: 'radio', checked: me?.state === key && !(key === 'brb' && coffee),
    click: () => act('status', { state: key }),
  });
  const miniShown = !!(miniWin && !miniWin.isDestroyed() && miniWin.isVisible());
  return Menu.buildFromTemplate([
    { label: 'Open team desk', accelerator: 'Alt+Shift+D', click: togglePanel },
    { label: 'Open full window', click: () => openFull() },
    { label: 'Mini office', type: 'checkbox', checked: miniShown, accelerator: 'Alt+Shift+M', click: toggleMini },
    { label: 'Mini office options', submenu: [
      { label: 'Keep on top of other windows', type: 'checkbox', checked: !!settings.miniOnTop,
        click: (i) => { settings.miniOnTop = i.checked; saveSettings(); applyMiniPrefs(); } },
      { label: 'Show on all Spaces', type: 'checkbox', checked: !!settings.miniAllSpaces,
        click: (i) => { settings.miniAllSpaces = i.checked; saveSettings(); applyMiniPrefs(); } },
    ] },
    { type: 'separator' },
    status('desk'), status('lunch'), status('brb'),
    { label: '☕  Coffee break', type: 'radio', checked: coffee, click: () => act('status', { state: 'brb', message: COFFEE_NOTE }) },
    status('dnd'), status('meeting'), status('leave'),
    { type: 'separator' },
    snap.myHelp
      ? { label: 'Cancel my help request', click: () => client.cancelHelp(snap.myHelp.id) }
      : { label: '🙋  Ask for help', accelerator: 'Alt+Shift+H', click: () => client.askHelp('') },
    { type: 'separator' },
    ...(macFocusLabel() ? [{ label: macFocusLabel(), enabled: false }] : []),
    { label: 'Match my Mac Focus', type: 'checkbox', checked: settings.macFocus !== false, click: (i) => { settings.macFocus = i.checked; saveSettings(); macFocus.on = false; pollMacFocus(); } },
    ...(settings.macFocus !== false && macFocus.error === 'permission' ? [{
      label: 'Allow Focus detection…', click: () => shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'),
    }] : []),
    { label: 'Launch at login', type: 'checkbox', checked: settings.launchAtLogin, click: (i) => { settings.launchAtLogin = i.checked; saveSettings(); applyLoginItem(); } },
    { label: 'Quit Deskmate', role: 'quit' },
  ]);
}

function applyLoginItem() {
  if (process.platform === 'darwin' || process.platform === 'win32') app.setLoginItemSettings({ openAtLogin: !!settings.launchAtLogin, openAsHidden: true });
}

// ------------------------------------------------------------------ actions (same names as the extension)
function act(name, args = {}, from = null) {
  const me = client.state.me;
  switch (name) {
    case 'status': {
      const s = args.state;
      const until = s === 'lunch' ? Date.now() + settings.lunchMinutes * 60000 : s === 'brb' ? Date.now() + 10 * 60000 : null;
      client.setStatus(s, { until, message: args.message });
      break;
    }
    case 'note': if (me) client.setStatus(me.state, { message: args.message, until: me.until }); break;
    case 'lunch:extend': if (me) client.setStatus(me.state, { until: Math.max(me.until || Date.now(), Date.now()) + (args.minutes || 15) * 60000, message: me.message }); break;
    case 'help': client.askHelp(args.topic || '', args.urgency || 'normal'); break;
    case 'help:cancel': client.cancelHelp(args.id); break;
    case 'help:end': client.endHelp(args.id); break;
    case 'help:claim': client.claimHelp(args.id); break;
    case 'wave': client.wave(args.to, args.emoji); break;
    case 'react': client.react(args.emoji); break;
    case 'kudos': client.kudos(args.to); break;
    case 'standup:config': client.setStandup(args.standup); break;
    case 'standup:start': client.standupStart(); break;
    case 'standup:next': client.standupNext(); break;
    case 'standup:end': client.standupEnd(); break;
    case 'open-desk':
      // from the mini office (or asking for Settings) → the expanded window; from a bubble → the menu-bar panel as before
      if (args.settings || (from && from === miniWin) || (fullWin && !fullWin.isDestroyed() && fullWin.isVisible())) openFull({ settings: !!args.settings });
      else if (!panel.isVisible()) togglePanel();
      break;
    case 'call': {
      // one room, everyone invited to it ("coffee chat" sends several ids)
      const to = [...new Set((Array.isArray(args.to) ? args.to : [args.to]).filter(Boolean))];
      if (!to.length) break;
      const callId = newId();
      for (const id of to) client.invite(id, callId);
      openCall(callId, to[0]);
      break;
    }
    case 'call:join': openCall(args.callId); break;
    case 'call:accept': clearIncoming(args.callId); openCall(args.callId); break;
    case 'call:decline': clearIncoming(args.callId); client.decline(args.from, args.callId); break;
  }
}

function clearIncoming(callId) {
  if (incoming && (!callId || incoming.callId === callId)) { incoming = null; updateTray(client.snapshot()); }
}

// ------------------------------------------------------------------ auto-away (system idle + screen lock)
// ------------------------------------------------------------------ macOS Focus → Deskmate Focus
let macFocus = { on: false, error: null, detail: null, name: null, checked: false };
let askedForAccess = false;
async function pollMacFocus() {
  if (process.platform !== 'darwin' || settings.macFocus === false) return;
  const f = await readMacFocus();
  const prevErr = macFocus.error;
  macFocus.checked = true;
  macFocus.error = f.error || null;
  macFocus.detail = f.detail || null;
  if (f.error !== prevErr) console.log('[deskmate] Mac Focus detection:', f.error ? `${f.error} (${f.detail})` : 'ok');
  if (f.error === 'permission' && !askedForAccess) { askedForAccess = true; askForFocusAccess(); }
  if (f.error) return;
  macFocus.name = f.name;
  const me = client.state.me;
  if (!me || f.on === macFocus.on) { macFocus.on = f.on; return; }
  macFocus.on = f.on;
  if (f.on && me.state !== 'dnd' && me.state !== 'meeting') {
    // in a meeting you stay "In a meeting" (Macs often turn on Do Not Disturb while you present)
    // the server ignores this if you set lunch / a meeting yourself
    client.setStatus('dnd', { source: 'macfocus', message: f.name && f.name !== 'Do Not Disturb' ? `${f.name} focus` : undefined });
  } else if (!f.on && me.state === 'dnd' && me.source === 'macfocus') {
    client.setStatus('desk', { source: 'macfocus' });
  }
}

// macOS only lets apps with Full Disk Access read the Focus state. Explain once, and open the right settings page.
function askForFocusAccess() {
  const appName = app.isPackaged ? 'Deskmate' : 'Electron (Deskmate runs inside it while in development)';
  dialog.showMessageBox({
    type: 'info',
    message: 'Let Deskmate see your Mac Focus',
    detail: `To switch you to Focus automatically when your Mac is in Do Not Disturb, macOS needs you to allow it:\n\nSystem Settings → Privacy & Security → Full Disk Access → turn on “${appName}”.\n\nThen quit and reopen Deskmate.`,
    buttons: ['Open System Settings', 'Not now'],
    defaultId: 0,
  }).then(({ response }) => {
    if (response === 0) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles');
  });
}

function macFocusLabel() {
  if (process.platform !== 'darwin') return null;
  if (settings.macFocus === false) return 'Mac Focus sync: off';
  if (!macFocus.checked) return 'Mac Focus: checking…';
  if (macFocus.error === 'permission') return 'Mac Focus: needs Full Disk Access';
  if (macFocus.error) return `Mac Focus: can’t read (${macFocus.detail})`;
  return macFocus.on ? `Mac Focus: on${macFocus.name ? ` (${macFocus.name})` : ''}` : 'Mac Focus: off';
}

function onIdleChange(s) {
  if (s === idleState) return;
  idleState = s;
  const me = client.state.me;
  if (!me) return;
  if (s === 'idle' || s === 'locked') {
    if (me.state === 'desk') client.setStatus('afk', { source: 'idle' });
  } else if (s === 'active') {
    if (me.state === 'afk' && me.source !== 'manual') client.setStatus('desk', { source: 'activity' });
    else if ((me.state === 'lunch' || me.state === 'brb') && settings.autoBack) client.setStatus('desk', { source: 'activity' });
  }
}

// ------------------------------------------------------------------ IPC
ipcMain.handle('get-state', () => fullState());
ipcMain.handle('get-settings', () => settings);
ipcMain.handle('save-settings', (_e, incomingSettings) => {
  const next = { ...(incomingSettings || {}) };
  for (const k of WINDOW_KEYS) delete next[k];
  const loginChanged = next.launchAtLogin !== undefined && next.launchAtLogin !== settings.launchAtLogin;
  settings = { ...settings, ...next };
  settings.userId = settings.email ? settings.email.toLowerCase() : settings.userId;
  saveSettings();
  client.updateSettings(settings);
  if (loginChanged) applyLoginItem();
  refreshWeather();
  onChange(client.snapshot());
  return { ok: true };
});
ipcMain.handle('profile', () => ({ email: '' }));
ipcMain.handle('call-config', () => {
  const snap = client.snapshot();
  const { server, team, userId, name, email, color, avatar, tz } = settings;
  return { settings: { server, team, userId, name, email, color, avatar, tz }, members: snap.members, me: snap.me };
});
ipcMain.on('action', (e, name, args) => act(name, args, BrowserWindow.fromWebContents(e.sender)));
ipcMain.on('close-window', (e) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w === panel) panel.hide();
  else if (w && w === miniWin) hideMini();
  else w?.close();
});

// ------------------------------------------------------------------ boot
app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide();

  protocol.handle('app', (req) => {
    const { pathname } = new URL(req.url);
    const file = path.normalize(path.join(APP_DIR, decodeURIComponent(pathname)));
    if (!file.startsWith(APP_DIR)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const ALLOWED = ['media', 'display-capture', 'clipboard-sanitized-write'];
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(ALLOWED.includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED.includes(permission));
  // screen sharing in calls: macOS's own picker where available, otherwise the whole main screen
  session.defaultSession.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] })
      .then(sources => cb({ video: sources[0] }))
      .catch(() => cb({}));
  }, { useSystemPicker: true });

  loadSettings();
  applyLoginItem();
  client = new DeskClient({ settings, role: 'companion', WebSocketImpl: WebSocket });
  client.onChange(onChange);
  client.onEvent(onEvent);

  tray = new Tray(trayImage('trayTemplate'));
  tray.setToolTip('Deskmate');
  tray.on('click', togglePanel);
  tray.on('right-click', () => tray.popUpContextMenu(contextMenu()));
  createPanel();
  client.connect();
  if (!client.configured) panel.webContents.once('did-finish-load', togglePanel);
  else if (settings.miniOpen) showMini();   // it was open when you last quit

  // system idle → Away; lock screen → Away immediately
  setInterval(() => {
    const idle = powerMonitor.getSystemIdleTime();
    onIdleChange(idle >= settings.idleMinutes * 60 ? 'idle' : 'active');
  }, 15000);
  powerMonitor.on('lock-screen', () => onIdleChange('locked'));
  setInterval(pollMacFocus, 5000);
  setInterval(refreshWeather, 30 * 60 * 1000);
  refreshWeather();
  setTimeout(pollMacFocus, 1500);
  powerMonitor.on('unlock-screen', () => onIdleChange('active'));
  powerMonitor.on('resume', () => client.connect());

  // global shortcuts, same keys as the Chrome extension
  const keys = {
    'Alt+Shift+D': togglePanel,
    'Alt+Shift+H': () => { const mine = client.snapshot().myHelp; mine ? client.cancelHelp(mine.id) : client.askHelp(''); },
    'Alt+Shift+L': () => act('status', { state: client.state.me?.state === 'lunch' ? 'desk' : 'lunch' }),
    'Alt+Shift+F': () => act('status', { state: client.state.me?.state === 'dnd' ? 'desk' : 'dnd' }),
    'Alt+Shift+M': toggleMini,
  };
  for (const [k, fn] of Object.entries(keys)) { try { globalShortcut.register(k, fn); } catch {} }

  // automated smoke test hook
  globalThis.deskmate = {
    get client() { return client; }, get panel() { return panel; }, bubbles, togglePanel, act, get callWin() { return callWin; },
    get miniWin() { return miniWin; }, get fullWin() { return fullWin; }, toggleMini, showMini, hideMini, openFull,
  };
  if (process.env.DESKMATE_SMOKE) import(pathToFileURL(process.env.DESKMATE_SMOKE).toString());
});

app.on('second-instance', () => togglePanel());
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
// clicking the Dock icon (only shown while the full window is open) brings it back
app.on('activate', () => { if (fullWin && !fullWin.isDestroyed()) { fullWin.show(); fullWin.focus(); } });
app.on('window-all-closed', (e) => e.preventDefault()); // keep living in the menu bar
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
});
