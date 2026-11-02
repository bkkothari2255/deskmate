// The shared virtual office: a miniature diorama. Everyone has a walnut workstation on a gently
// curved bench (more rows for bigger teams), there's a coffee & relaxation lounge on the right
// (lunch + coffee breaks), a BRB corner, a stand-up circle, and a weather sky behind it all.
//
// Performance notes: workstation geometry is shared (lib/scene/furniture.js); static desk props
// for the whole team are drawn with a couple of InstancedMeshes; lamp halos are one Points cloud;
// one shadow-casting light with its frustum fitted to the platform; ~30 fps cap; paused when hidden.
import { THREE, emojiSprite, shade, configureRenderer } from '../lib/avatar.js';
import { ease, Spring } from '../lib/toon.js';
import { makeCharacter } from '../lib/characters.js';
import { FocusAura } from '../lib/aura.js';
import { Pet } from '../lib/pets.js';
import { buildPlant, plantStage } from '../lib/plant.js';
import { Sky } from '../lib/sky.js';
import { buildShell, shellMaterials, setShellTheme, WALL_H, rugMesh, platformGeometryL, buildLively } from '../lib/scene/room.js';

const ANNEX_W = 5.2, ANNEX_D = 5.4;   // the dining & café annex that makes the room an L
import { display, STATUS, isCoffeeBreak, PALETTE } from '../lib/status.js';
import { RoomEnvironment } from '../lib/RoomEnvironment.js';
import { C, surfaces, glowTexture, blobTexture, disposeKit } from '../lib/scene/kit.js';
import {
  workstationKit, buildLounge, platformGeometry, rugGeometry,
  LID_PIVOT, MUG_AT, PLANT_AT, SHADE_AT, GLOW_AT, PET_AT, DND_AT, LOUNGE, ARC_SHADE_AT, ACC_AT, STATION_AT, CUPS_AT, deskAccessories,
} from '../lib/scene/furniture.js';

const SEAT_ARC = 1.25;   // spacing between seats along the arc
const SLAB_T = 0.2;      // platform thickness
const LAMP_KEY = 'deskmate.deskLamp';
const STANDUP_STATES = new Set(['desk', 'dnd']);
const MAX_BLOBS = 64;
const CAFE_ORDER = [3, 4, 2, 5, 1, 0];   // lounge slot preference (see buildLounge)

// Light / dark looks for the diorama itself (the sky handles the backdrop)
const THEMES = {
  light: {
    top: '#D6BFA0', side: '#754B36', rugWork: '#263C55', rugLounge: '#A5BBA9', rugBrb: '#C3CED8', rugMeet: '#D8D0C2', ground: 0.32,
    hemiSky: '#F7E8D2', hemiGround: '#B88F68', hemi: 0.78, sun: 2.3, fill: 0.45, rim: 0.7, env: 0.42, lounge: 2.2, shadow: 0.2,
  },
  dark: {
    top: '#263C55', side: '#4B3224', rugWork: '#18283D', rugLounge: '#4A5E52', rugBrb: '#3A4A5E', rugMeet: '#3A4558', ground: 0.55,
    hemiSky: '#6B7F9C', hemiGround: '#2A2522', hemi: 0.55, sun: 1.6, fill: 0.35, rim: 0.9, env: 0.22, lounge: 3.2, shadow: 0.32,
  },
};

function dndTexture(name) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 300;
  const x = c.getContext('2d');
  x.fillStyle = '#C8524A';
  x.beginPath(); x.roundRect(6, 6, 500, 288, 34); x.fill();
  x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 8;
  x.beginPath(); x.roundRect(22, 22, 468, 256, 24); x.stroke();
  x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '800 62px -apple-system, "Segoe UI", Roboto, sans-serif';
  x.fillText('DO NOT', 256, 92);
  x.fillText('DISTURB', 256, 160);
  x.font = '600 34px -apple-system, "Segoe UI", Roboto, sans-serif';
  const first = String(name || '').split(' ')[0].slice(0, 14);
  x.fillText(`🎧 ${first} is focusing`, 256, 232);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// the pet is handled separately, so changing it doesn't rebuild the character
const lookKey = (m) => { const { pet, ...a } = m.avatar || {}; return JSON.stringify([m.color, a]); };
const readLamp = () => { try { return localStorage.getItem(LAMP_KEY) !== 'off'; } catch { return true; } };
const saveLamp = (on) => { try { localStorage.setItem(LAMP_KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ } };
const _pulse = new THREE.Color();
const HL_EMISSIVE = new THREE.Color('#6B5A42');
const _mtx = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

export class DeskScene {
  constructor(container, { onSelect, dark = false, onInteract, onViewDirty, compact = false } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.onInteract = onInteract;
    this.onViewDirty = onViewDirty;      // (dirty:boolean) → the view was moved by hand / put back by Reset view
    this.viewDirty = false;
    this.viewTarget = null;              // eased move to a requested view (Reset view)
    this.compact = compact;
    this.people = new Map(); // id -> person
    this.helps = [];
    this.clock = new THREE.Clock();
    this.t = 0;
    this.dark = dark;
    this.zoom = 1;
    this.yaw = 0;
    this.tilt = 0;                       // user offset on top of the framed elevation
    this.pan = new THREE.Vector3();      // user offset of the look-at point, on the floor
    this.extent = { x: 3, z: 3 };        // how far the view may pan (set when framing)
    this.radius = 3;
    this.lampOn = readLamp();            // my own desk lamp (clickable)
    this.meStanding = false;             // my chair override (clickable)
    this.lampLevel = 0.5;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    r.setPixelRatio(Math.min(devicePixelRatio, compact ? 1.5 : 1.75));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    configureRenderer(r);
    container.appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    this.scene.add(this.camera);             // the sky hangs off the camera
    this.sky = new Sky(this.camera, container);

    // soft image-based light for believable materials (generated once, tiny)
    try {
      const pm = new THREE.PMREMGenerator(r);
      const room = new RoomEnvironment();
      this.envTex = pm.fromScene(room, 0.04).texture;
      room.dispose?.();
      pm.dispose();
      this.scene.environment = this.envTex;
    } catch { this.envTex = null; }

    this.#lights();
    this.#materials();
    this.SM = shellMaterials();

    // the diorama platform (rebuilt to fit when the layout changes)
    this.platform = new THREE.Mesh(new THREE.BufferGeometry(), [this.M.platTop, this.M.platSide]);
    this.platform.receiveShadow = true;
    this.scene.add(this.platform);
    this.groundShadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.M.ground);
    this.groundShadow.renderOrder = -5;
    this.scene.add(this.groundShadow);
    this.rugs = new THREE.Group();
    this.scene.add(this.rugs);
    this.shell = null;                       // cutaway room: floor, walls, windows, plants
    this.rooms = new THREE.Group();          // individual glass meeting rooms (one per seat, up to 5)
    this.scene.add(this.rooms);
    this.meetRooms = [];

    this.furniture = new THREE.Group();
    this.scene.add(this.furniture);
    this.cafe = this.#buildCafe();
    this.scene.add(this.cafe.group);

    // contact shadows under people (one draw for everyone)
    this.personBlobs = new THREE.InstancedMesh(this.#blobGeo(), this.M.blob, MAX_BLOBS);
    this.personBlobs.count = 0;
    this.personBlobs.frustumCulled = false;
    this.personBlobs.renderOrder = 1;
    this.scene.add(this.personBlobs);

    this.labels = document.createElement('div');
    this.labels.className = 'labels';
    container.appendChild(this.labels);

    this.raycaster = new THREE.Raycaster();
    this.#bindInput();
    this.setTheme(dark);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.layout(1);

    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      // ~30 fps is plenty for this scene and halves GPU/battery use in the side panel
      const now = performance.now();
      if (now - (this.lastFrame || 0) < 32) return;
      this.lastFrame = now;
      this.#frame();
    };
    loop();
  }

  // ---------- look ----------
  #lights() {
    this.hemi = new THREE.HemisphereLight('#E4EAF1', '#B9A58F', 0.75);
    const key = this.sun = new THREE.DirectionalLight('#FFF2E0', 2.3);
    key.castShadow = true;
    key.shadow.mapSize.set(this.compact ? 512 : 1024, this.compact ? 512 : 1024);
    key.shadow.bias = -0.0006;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 4;
    this.scene.add(key, key.target);
    this.fill = new THREE.DirectionalLight('#FFDDB8', 0.45);   // warm bounce from the front left
    this.fill.position.set(-6, 3, 6);
    this.rim = new THREE.DirectionalLight('#BCD0E8', 0.7);     // cool sky light from behind
    this.rim.position.set(-2, 5, -7);
    // the one extra real light: the lounge's arc lamp (warm, no shadows)
    this.loungeLight = new THREE.PointLight('#FFCF9A', 2.2, 3.6, 2);
    this.scene.add(this.hemi, this.fill, this.rim);
  }

  #materials() {
    const S = surfaces();
    const glow = glowTexture(), blob = blobTexture();
    this.M = {
      ...S,
      platTop: new THREE.MeshStandardMaterial({ color: '#E7E1D6', roughness: 0.92 }),
      platSide: new THREE.MeshStandardMaterial({ color: C.walnut, roughness: 0.7 }),
      ground: new THREE.MeshBasicMaterial({ map: blob, color: PALETTE.midnight, transparent: true, opacity: 0.32, depthWrite: false }),
      rugWork: new THREE.MeshStandardMaterial({ color: '#3F6FB8', roughness: 1 }),
      rugBrb: new THREE.MeshStandardMaterial({ color: '#C3CED8', roughness: 1 }),
      rugMeet: new THREE.MeshStandardMaterial({ color: '#D8D0C2', roughness: 1 }),
      glass: new THREE.MeshPhysicalMaterial({ color: '#BCD3E8', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      rugLounge: new THREE.MeshStandardMaterial({ color: C.sage, roughness: 1 }),
      blob: new THREE.MeshBasicMaterial({ map: blob, color: PALETTE.midnight, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
      alu: new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.38, metalness: 0.55 }),
      shadeOn: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: '#FFC98A', emissiveIntensity: 0.6, side: THREE.DoubleSide }),
      shadeOff: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }),
      glow: new THREE.PointsMaterial({ map: glow, size: 0.62, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }),
      loungeGlow: new THREE.SpriteMaterial({ map: glow, color: '#FFC98A', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 }),
      proxy: new THREE.MeshBasicMaterial({ visible: false }),
      dndBack: new THREE.MeshStandardMaterial({ color: C.ivory, roughness: 0.6 }),
    };
  }

  #blobGeo() {
    return this._blobGeo ||= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0.008, 0);
  }

  setTheme(dark) {
    this.dark = dark;
    const T = THEMES[dark ? 'dark' : 'light'];
    const M = this.M;
    M.platTop.color.set(T.top);
    M.platSide.color.set(T.side);
    M.rugWork.color.set(T.rugWork);
    M.rugLounge.color.set(T.rugLounge);
    M.rugBrb.color.set(T.rugBrb);
    M.rugMeet.color.set(T.rugMeet);
    setShellTheme(this.SM, dark);
    this.live?.setDark(dark);
    this.#tintRugs();
    M.ground.opacity = T.ground;
    M.blob.opacity = T.shadow;
    this.hemi.color.set(T.hemiSky);
    this.hemi.groundColor.set(T.hemiGround);
    this.fill.intensity = T.fill;
    this.rim.intensity = T.rim;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = T.env;
    this.base = { hemi: T.hemi, sun: T.sun, lounge: T.lounge };   // the sky scales these
    this.sky?.setTheme(dark);
    if (this.meet) { for (const r of this.meetRooms) r.label = null; this.#labelRooms(); }
  }

  // ---------- layout ----------
  seatTransform(seat, count) {
    // Up to 4 people share one gently curved bench; bigger teams get a second
    // (staggered) row behind, like a studio, so everyone stays big and visible.
    const n = Math.max(count, 1);
    const rows = n <= 4 ? 1 : Math.max(2, Math.ceil(n / 5));
    const perRow = Math.ceil(n / rows);
    const row = Math.floor(seat / perRow);
    const inRow = row < rows - 1 ? perRow : n - perRow * (rows - 1);
    const col = seat - row * perRow;
    const SP = 1.22;
    const x = (col - (inRow - 1) / 2) * SP + (row % 2 ? SP * 0.5 : 0);
    const z = -row * 2.1 - x * x * 0.07;
    const rotY = -x * 0.12;
    return { x, z, rotY, a: rotY, row };
  }

  layout(count) {
    const n = Math.max(count, 1);
    if (this.laidOut === n) return;
    this.laidOut = n;
    this.radius = Math.max(2.8, (n * SEAT_ARC) / (Math.PI * 0.6));
    this.#setHover(null);
    // rebuild the workstations
    for (const s of this.seats || []) this.#disposeSeat(s);
    this.furniture.clear();
    this.seats = [];
    for (let i = 0; i < n; i++) {
      const tr = this.seatTransform(i, n);
      const seat = this.#buildSeat(tr, i);
      this.furniture.add(seat.group);
      this.seats.push(seat);
    }
    this.#buildInstanced(n);
    // lounge sits behind the bench on the right, visible over everyone's heads
    let backZ = 0, maxX = 0;
    for (let i = 0; i < n; i++) { const t = this.seatTransform(i, n); backZ = Math.min(backZ, t.z); maxX = Math.max(maxX, t.x); }
    this.cafe.group.position.set(Math.max(maxX * 0.55 + 0.9, 1.4), 0, backZ - 2.1);
    this.cafe.group.rotation.y = 0;
    this.cafe.group.updateMatrixWorld(true);
    // the BRB corner: back-left, opposite the lounge
    this.brbCorner = { x: -(maxX * 0.55 + 0.9), z: backZ - 1.6 };
    this.#buildMeetingRooms(n, backZ);
    this.benchEdge = maxX + 1.0;   // walking round the end of the bench
    this.frontZ = 1.0;             // just in front of the desks
    this.#frameCamera();
    // reassign people to seats
    for (const p of this.people.values()) this.#placeAtSeat(p, true);
  }


  // ---------- individual meeting rooms ----------
  // A row of small glass rooms behind the lounge, one per seat (up to 5). When someone is "In a meeting"
  // their character walks round the bench, down the left-hand lane and into a room of their own.
  #buildMeetingRooms(n, backZ) {
    for (const r of this.meetRooms) { this.rooms.remove(r.group); for (const o of r.own) o.dispose?.(); }
    this.meetRooms = [];
    const cols = Math.min(n, 5), PITCH = 1.8;
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < n; i++) { const t = this.seatTransform(i, n); minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x); }
    const cx = (minX + maxX) / 2;
    const xs = Array.from({ length: cols }, (_, i) => cx + (i - (cols - 1) / 2) * PITCH);
    const z = backZ - 6.0;
    this.meet = {
      cols, xs, z, aisleZ: backZ - 4.5,
      laneX: Math.min(xs[0] - 1.3, this.brbCorner.x - 1.3),
    };
    xs.forEach((x, i) => {
      const r = this.#buildRoom(x, z, i);
      const padGeo = new THREE.PlaneGeometry(1.7, 1.95).rotateX(-Math.PI / 2); r.own.push(padGeo);
      const padMat = new THREE.MeshBasicMaterial({ color: '#E8B878', transparent: true, opacity: 0, depthWrite: false }); r.own.push(padMat);
      r.pad = new THREE.Mesh(padGeo, padMat); r.pad.position.set(0, 0.03, 0.12); r.pad.visible = false; r.pad.userData.pad = true; r.group.add(r.pad);
      const pg = new THREE.BoxGeometry(1.6, 2.1, 1.75); r.own.push(pg);
      r.proxy = new THREE.Mesh(pg, this.M.proxy); r.proxy.position.set(0, 1.05, 0.12); r.proxy.userData = { kind: 'room', target: r.pad, proxy: true, room: i }; r.group.add(r.proxy);
      this.rooms.add(r.group); this.meetRooms.push(r);
    });
    this.#labelRooms();
  }

  #buildRoom(x, z, i) {
    const K = workstationKit(), M = this.M, own = [];
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const W = 1.6, Z0 = -0.75, Z1 = 1.0, H = 2.1, zm = (Z0 + Z1) / 2;
    const box = (w, h, d, mat, px, py, pz, o = {}) => {
      const geo = new THREE.BoxGeometry(w, h, d); own.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = !!o.cast; m.receiveShadow = true;
      if (o.order) m.renderOrder = o.order;
      g.add(m);
      return m;
    };
    box(W + 0.1, 0.04, Z1 - Z0 + 0.1, M.rugMeet, 0, 0.02, zm);
    // glass: back + both sides
    box(W, H, 0.02, M.glass, 0, H / 2, Z0, { order: 3 });
    for (const sx of [-1, 1]) box(0.02, H, Z1 - Z0, M.glass, sx * W / 2, H / 2, zm, { order: 3 });
    // aluminium frame
    for (const sx of [-1, 1]) for (const zz of [Z0, Z1]) box(0.05, H, 0.05, M.alu, sx * W / 2, H / 2, zz, { cast: true });
    box(W, 0.05, 0.05, M.alu, 0, H, Z0); box(W, 0.06, 0.06, M.alu, 0, H, Z1);
    for (const sx of [-1, 1]) box(0.05, 0.05, Z1 - Z0, M.alu, sx * W / 2, H, zm);
    // table + laptop
    const wood = M.platSide;
    box(0.9, 0.045, 0.5, wood, 0, 0.74, 0.62, { cast: true });
    for (const sx of [-1, 1]) box(0.04, 0.72, 0.44, wood, sx * 0.4, 0.36, 0.62);
    box(0.34, 0.015, 0.24, M.alu, 0, 0.78, 0.6, { cast: true });
    const lid = new THREE.Group(); lid.position.set(0, 0.79, 0.71); lid.rotation.x = 0.3; g.add(lid);
    const lidGeo = new THREE.BoxGeometry(0.34, 0.22, 0.01); own.push(lidGeo);
    const lm = new THREE.Mesh(lidGeo, M.alu); lm.position.y = 0.11; lm.castShadow = true; lid.add(lm);
    const screenMat = new THREE.MeshBasicMaterial({ color: '#2b2f38' }); own.push(screenMat);
    const scrGeo = new THREE.PlaneGeometry(0.31, 0.19); own.push(scrGeo);
    const scr = new THREE.Mesh(scrGeo, screenMat); scr.position.set(0, 0.11, -0.0056); scr.rotation.y = Math.PI; lid.add(scr);
    // chair at the room origin, same as at a desk (the sitter's hips are placed relative to it)
    const seatMat = new THREE.MeshStandardMaterial({ color: C.fabricSlate, roughness: 0.92 }); own.push(seatMat);
    for (const [geo, mat] of [[K.chairFabric, seatMat], [K.chairFrame, M.satin]]) {
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true; g.add(m);   // geometry is shared: not in `own`
    }
    // door header: status light + name sign
    const stripMat = new THREE.MeshBasicMaterial({ color: '#7FC8A9' }); own.push(stripMat);
    const strip = box(W - 0.1, 0.03, 0.03, stripMat, 0, H - 0.07, Z1 + 0.03);
    const canvas = document.createElement('canvas'); canvas.width = 384; canvas.height = 96;
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; own.push(tex);
    const signMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true }); own.push(signMat);
    const signGeo = new THREE.PlaneGeometry(0.96, 0.24); own.push(signGeo);
    const sign = new THREE.Mesh(signGeo, signMat); sign.position.set(0, H - 0.26, Z1 + 0.04); g.add(sign);
    return { group: g, own, canvas, tex, screenMat, stripMat, seatMat, label: null, x, z, index: i };
  }

  #drawRoomSign(r, name, color) {
    const key = name ? name + '|' + color : '';
    if (r.label === key) return;
    r.label = key;
    const ctx = r.canvas.getContext('2d');
    const w = r.canvas.width, h = r.canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = this.dark ? 'rgba(30,38,50,0.92)' : 'rgba(255,252,246,0.94)';
    ctx.beginPath(); ctx.roundRect(4, 4, w - 8, h - 8, 22); ctx.fill();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = name ? (color || '#3B82F6') : (this.dark ? '#8895A7' : '#8A93A0');
    ctx.font = 'bold 34px -apple-system, Segoe UI, sans-serif';
    ctx.fillText(name ? '📅 ' + (name.length > 14 ? name.slice(0, 13) + '…' : name) : 'Meeting room', w / 2, h * 0.38);
    ctx.fillStyle = this.dark ? '#C7D0DC' : '#455B70';
    ctx.font = '26px -apple-system, Segoe UI, sans-serif';
    ctx.fillText(name ? 'In a meeting' : 'Free', w / 2, h * 0.72);
    r.tex.needsUpdate = true;
  }

  #labelRooms() {
    const occ = new Map();
    for (const p of this.people.values()) if (p.mode === 'meeting' || this.#mode(p) === 'meeting') occ.set(p.meetSlot % this.meet.cols, p);
    for (const r of this.meetRooms) {
      const p = occ.get(r.index);
      this.#drawRoomSign(r, p?.member.name || '', p?.member.color);
      r.occ = !!p;
      r.stripMat.color.set(p ? '#E5736A' : '#9DBDAD');
      const tint = new THREE.Color(PALETTE.softBlue).lerp(new THREE.Color(p?.member.color || PALETTE.softBlue), 0.45);
      r.screenMat.color.copy(p ? shade('#' + tint.getHexString(), 0.14) : new THREE.Color('#262C36'));
    }
  }

  // where a meeting slot's chair is, and the walking waypoints in / out of the room
  #meetPoint(slot) {
    const mt = this.meet, r = this.meetRooms[slot % mt.cols];
    return { x: r.x, z: r.z, rotY: 0 };
  }
  #meetIn(slot) {       // from the lane at the aisle → into the chair (round the table)
    const d = this.#meetPoint(slot), mt = this.meet, V = (x, z) => new THREE.Vector3(x, 0, z);
    return [V(d.x + 0.62, mt.aisleZ), V(d.x + 0.62, d.z + 0.15), V(d.x, d.z)];
  }
  #meetOut(slot) {      // chair → out to the lane at the aisle
    const d = this.#meetPoint(slot), mt = this.meet, V = (x, z) => new THREE.Vector3(x, 0, z);
    return [V(d.x + 0.62, d.z + 0.15), V(d.x + 0.62, mt.aisleZ), V(mt.laneX, mt.aisleZ)];
  }

  #buildSeat(tr, i) {
    const K = workstationKit();
    const M = this.M;
    const g = new THREE.Group();
    g.position.set(tr.x, 0, tr.z);
    g.rotation.y = tr.rotY;
    const mesh = (geo, mat, parent = g, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = true;
      parent.add(m);
      return m;
    };
    const proxy = (w, h, d, pos, kind, target, parent = g) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.proxy);
      m.position.set(...pos);
      m.userData = { kind, target, proxy: true };
      parent.add(m);
      return m;
    };
    // laptop lid, hinged at the back of the base; the screen faces the sitter
    const lid = new THREE.Group();
    lid.position.set(...LID_PIVOT);
    lid.rotation.x = 0.22;
    const shell = mesh(K.lid, M.alu, lid);
    shell.position.y = 0.1275;
    const screenMat = new THREE.MeshBasicMaterial({ color: '#2b2f38' });
    const screen = new THREE.Mesh(K.screen, screenMat);
    screen.position.set(0, 0.13, -0.0068);
    screen.rotation.y = Math.PI;
    lid.add(screen);
    const logoMat = new THREE.MeshBasicMaterial({ color: '#9aa1ad' });
    const logo = new THREE.Mesh(K.logo, logoMat);       // on the back of the lid (the side we see)
    logo.position.set(0, 0.135, 0.0068);
    lid.add(logo);
    g.add(lid);
    // mug
    const mug = mesh(K.mug, M.gloss);
    mug.position.set(...MUG_AT);
    mug.rotation.y = 0.6;
    // ergonomic chair (upholstery tinted per person)
    const chair = new THREE.Group();
    const seatMat = new THREE.MeshStandardMaterial({ color: C.fabricSlate, roughness: 0.92 });
    // the chair is picked by its real shape (a box would steal clicks meant for the sitter)
    for (const part of [mesh(K.chairFabric, seatMat, chair), mesh(K.chairFrame, M.satin, chair)]) part.userData = { kind: 'chair', target: chair };
    g.add(chair);
    // lamp head (glow halo is drawn by the shared Points cloud)
    const lamp = mesh(K.shade, M.shadeOn, g, false);
    lamp.position.set(...SHADE_AT);
    lamp.rotation.z = 0.35;
    // personal desk object (swapped for the person's own pick in #applyStatus)
    const acc = new THREE.Mesh(deskAccessories()[0], M.matte);
    acc.position.set(...ACC_AT); acc.castShadow = true; acc.receiveShadow = true;
    g.add(acc);
    // plant holder (the plant inside is rebuilt as it grows)
    const plantHolder = new THREE.Group();
    plantHolder.position.set(...PLANT_AT);
    plantHolder.rotation.y = 0.6;
    g.add(plantHolder);
    // "Do not disturb" desk sign: a little A-frame board on the front of the desk, shown in Focus mode
    const dnd = new THREE.Group();
    dnd.position.set(...DND_AT);
    dnd.rotation.y = 0.12;
    const boardMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 });
    const board = new THREE.Mesh(this._dndGeo ||= new THREE.BoxGeometry(0.5, 0.3, 0.018), [M.dndBack, M.dndBack, M.dndBack, M.dndBack, boardMat, M.dndBack]);
    board.position.set(0, 0.155, 0.014); board.rotation.x = -0.05; board.castShadow = true;
    dnd.add(board);
    const leg = new THREE.Mesh(this._dndLegGeo ||= new THREE.BoxGeometry(0.44, 0.28, 0.012), M.alu);
    leg.position.set(0, 0.14, -0.04); leg.rotation.x = 0.3;
    dnd.add(leg);
    dnd.scale.setScalar(0.001); dnd.visible = false;
    g.add(dnd);
    // hover pad: a soft amber glow on the floor that lights up when the desk is hovered
    const pad = new THREE.Mesh(this._padGeo ||= new THREE.PlaneGeometry(1.5, 1.75).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#E8B878', transparent: true, opacity: 0, depthWrite: false }));
    pad.position.set(0, 0.012, 0.42); pad.visible = false; pad.userData.pad = true; pad.renderOrder = 2;
    g.add(pad);
    const deskProxy = proxy(1.12, 0.14, 0.68, [0, 0.74, 0.55], 'desk', pad);
    deskProxy.userData.seat = i;
    // invisible hit boxes for the clickable bits (only my own desk's laptop / mug / lamp / plant / chair are ever tested)
    const proxies = [
      proxy(0.44, 0.3, 0.34, [0, 0.93, 0.37], 'laptop', lid),
      proxy(0.13, 0.14, 0.13, [MUG_AT[0], MUG_AT[1] + 0.06, MUG_AT[2]], 'cup', mug),
      proxy(0.2, 0.44, 0.2, [-0.43, 1.0, 0.3], 'lamp', lamp),
      proxy(0.2, 0.32, 0.2, [0, 0.14, 0], 'plant', plantHolder, plantHolder),
      // a little wider than the backrest, behind the sitter: the chair peeks out either side
      proxy(0.7, 0.6, 0.1, [0, 0.82, -0.28], 'chair', chair, chair),
    ];
    return {
      ...tr, index: i, group: g, chair, pad, deskProxy, acc, accKind: 0, lid, screen, logo, screenMat, logoMat, seatMat, mug, lamp, plantHolder,
      dnd, dndBoard: boardMat, dndShow: 0, proxies, lampOn: true, phones: true,
    };
  }

  #disposeSeat(s) {
    s.screenMat.dispose(); s.logoMat.dispose(); s.seatMat.dispose(); s.pad.material.dispose();
    s.dndBoard.map?.dispose(); s.dndBoard.dispose();
    for (const p of [...s.proxies, s.deskProxy]) p.geometry.dispose();
    if (s.plant) s.plant.traverse(o => o.geometry?.dispose());
  }

  // static props of every desk: a few instanced draws for the whole team
  #buildInstanced(n) {
    const K = workstationKit();
    const M = this.M;
    for (const m of this.instanced || []) { this.scene.remove(m); m.dispose(); }
    const inst = (geo, mat, { cast = true, order } = {}) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.castShadow = cast; m.receiveShadow = true;
      if (order !== undefined) m.renderOrder = order;
      this.seats.forEach((s, i) => { s.group.updateMatrix(); m.setMatrixAt(i, s.group.matrix); });
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
      this.scene.add(m);
      return m;
    };
    this.deskMatte = inst(K.matte, M.matte);
    this.deskSatin = inst(K.satin, M.satin);
    this.deskBlobs = inst(K.blob, M.blob, { cast: false, order: 1 });
    this.deskBlobs.receiveShadow = false;
    this.phones = inst(K.phones, M.matte);
    this.instanced = [this.deskMatte, this.deskSatin, this.deskBlobs, this.phones];
    // lamp halos: one point per desk, coloured (or black = off) per desk
    if (this.glow) { this.scene.remove(this.glow); this.glow.geometry.dispose(); }
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const v = new THREE.Vector3();
    this.seats.forEach((s, i) => {
      s.group.updateMatrixWorld(true);
      v.set(...GLOW_AT).applyMatrix4(s.group.matrixWorld);
      pos.set([v.x, v.y, v.z], i * 3);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.glow = new THREE.Points(geo, M.glow);
    this.glow.renderOrder = 4;
    this.glow.frustumCulled = false;
    this.scene.add(this.glow);
    this.seats.forEach(s => this.#applyLamp(s));
  }

  #setPhones(seat, visible) {
    if (seat.phones === visible || !this.phones) return;
    seat.phones = visible;
    seat.group.updateMatrix();
    _mtx.copy(seat.group.matrix);
    if (!visible) _mtx.scale(_s.set(0, 0, 0));    // hidden instance
    this.phones.setMatrixAt(seat.index, _mtx);
    this.phones.instanceMatrix.needsUpdate = true;
  }

  #applyLamp(seat) {
    const on = seat.lampOn;
    const hovered = this.hover?.target === seat.lamp;      // keep a hovered lamp's highlight in sync
    if (hovered) this.#unhighlight(this.hover);
    seat.lamp.material = on ? this.M.shadeOn : this.M.shadeOff;
    if (hovered) this.#highlight(this.hover);
    const col = this.glow?.geometry.attributes.color;
    if (col && seat.index < col.count) {
      const c = on ? new THREE.Color('#FFC27A') : new THREE.Color(0, 0, 0);
      col.setXYZ(seat.index, c.r, c.g, c.b);
      col.needsUpdate = true;
    }
  }

  // Diorama slab + zone rugs, sized to the content
  #buildPlatform(b, A) {
    const w = A.x1 - b.x0, d = b.z1 - b.z0;
    const key = [b.x0, b.x1, b.z0, b.z1, A.x1, A.z0].map(v => v.toFixed(2)).join(',');
    if (key === this.platformKey) return;
    this.platformKey = key;
    const cx = (b.x0 + A.x1) / 2, cz = (b.z0 + b.z1) / 2;
    this.platform.geometry.dispose();
    this.platform.geometry = platformGeometryL(b, A, SLAB_T);
    this.platform.position.set(0, 0, 0);
    this.groundShadow.position.set(cx, -SLAB_T - 0.12, cz + 0.15);
    this.groundShadow.scale.set(w * 1.3, 1, d * 1.45);
    this.platformBounds = { ...b, cx, cz, w, d };
    if (this.shell) { this.scene.remove(this.shell.group); for (const o of this.shell.own) o.dispose?.(); }
    this.shell = buildShell(b, this.SM, A);
    this.scene.add(this.shell.group);
    if (this.live) { this.scene.remove(this.live.group); for (const o of this.live.own) o.dispose?.(); }
    // things the robot vacuum must steer around
    const obs = [];
    for (const st of this.seats || []) obs.push({ x0: st.x - 0.75, x1: st.x + 0.75, z0: st.z - 0.6, z1: st.z + 1.05 });
    for (const x of this.meet?.xs || []) obs.push({ x0: x - 0.95, x1: x + 0.95, z0: this.meet.z - 0.9, z1: this.meet.z + 1.15 });
    const lg = this.cafe.group.position, LE = LOUNGE.extent;
    obs.push({ x0: lg.x + LE.x0, x1: lg.x + LE.x1, z0: lg.z + LE.z0, z1: lg.z + LE.z1 });
    const bk = this.brbCorner; if (bk) obs.push({ x0: bk.x - 0.9, x1: bk.x + 1.4, z0: bk.z - 0.6, z1: bk.z + 1.4 });
    const steam = [];   // coffee steam rises from the espresso machine and the first cups on the table
    steam.push([lg.x + STATION_AT[0] + 0.18, 0.835 + 0.3, lg.z + STATION_AT[1] - 0.03]);
    for (const [cx0, cz0] of CUPS_AT.slice(0, 3)) steam.push([lg.x + cx0, LOUNGE.top + 0.09, lg.z + cz0]);
    this.live = buildLively(b, A, this.SM, this.shell, obs, steam);
    this.live.setDark(this.dark);
    this.scene.add(this.live.group);
    // rugs: one under the desks, one in the BRB corner (the lounge has its own)
    for (const r of this.rugs.children) { r.geometry.dispose(); r.material.map?.dispose(); r.material.dispose(); }
    this.rugs.clear();
    this.rugMats = [];
    const n = this.laidOut || 1;
    let sx0 = Infinity, sx1 = -Infinity, sz0 = Infinity, sz1 = -Infinity;
    for (let i = 0; i < n; i++) { const s = this.seatTransform(i, n); sx0 = Math.min(sx0, s.x); sx1 = Math.max(sx1, s.x); sz0 = Math.min(sz0, s.z); sz1 = Math.max(sz1, s.z); }
    const rug = (x0, x1, z0, z1, style, y, rad = 0.45) => {
      const m = rugMesh(x1 - x0, z1 - z0, rad, y, style, this.dark);
      m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
      this.rugs.add(m); this.rugMats.push(m.material);
    };
    rug(sx0 - 1.15, sx1 + 1.15, sz0 - 1.0, sz1 + 1.45, 'main', 0.003);
    const bc = this.brbCorner;
    rug(bc.x - 0.65, bc.x + 1.4, bc.z - 0.6, bc.z + 1.3, 'soft', 0.004, 0.3);
    this.#tintRugs();
    // fit the single shadow camera to the platform
    const L = this.sun;
    const half = Math.hypot(w, d) / 2 + 0.6;
    L.target.position.set(cx, 0, cz);
    L.position.set(cx + 3.2, 7, cz + 4.6);
    L.shadow.camera.left = -half; L.shadow.camera.right = half;
    L.shadow.camera.top = half; L.shadow.camera.bottom = -half;
    L.shadow.camera.near = 0.5; L.shadow.camera.far = 9 + half * 2;
    L.shadow.camera.updateProjectionMatrix();
    L.target.updateMatrixWorld();
  }

  #tintRugs() { for (const m of [...(this.rugMats || []), this.loungeRug?.material]) m?.color.set(this.dark ? '#8E98AE' : '#FFFFFF'); }

  // Fit the camera so every seat, desk, the lounge and the platform are in view, as tight as possible.
  #frameCamera() {
    const n = this.laidOut || 1;
    const pts = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const plat = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    const grow = (x, z) => { plat.x0 = Math.min(plat.x0, x); plat.x1 = Math.max(plat.x1, x); plat.z0 = Math.min(plat.z0, z); plat.z1 = Math.max(plat.z1, z); };
    const add = (x, y, z) => { pts.push(new THREE.Vector3(x, y, z)); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); grow(x, z); };
    for (let i = 0; i < n; i++) {
      const s = this.seatTransform(i, n);
      const fx = Math.sin(s.rotY), fz = Math.cos(s.rotY);
      add(s.x, 2.15, s.z);                      // head + label room
      add(s.x - fx * 0.45, 0, s.z - fz * 0.45); // chair
      add(s.x + fx * 0.95, 0, s.z + fz * 0.95); // desk front
      grow(s.x - fx * 1.4, s.z - fz * 1.4);     // where "away" people stand
    }
    const bc = this.brbCorner;
    for (const [dx, dz] of [[-0.9, -0.5], [0.9, -0.5], [-0.9, 0.9], [0.9, 0.9]]) add(bc.x + dx, 0, bc.z + dz);
    add(bc.x, 1.8, bc.z);
    const mt = this.meet;
    if (mt) {
      for (const x of mt.xs) {
        for (const [dx, dz] of [[-0.9, -0.85], [0.9, -0.85], [-0.9, 1.1], [0.9, 1.1]]) add(x + dx, 0, mt.z + dz);
        add(x, 2.3, mt.z);
      }
      add(mt.laneX, 0, mt.aisleZ); add(mt.laneX, 0, 0.4);
    }
    grow(-this.benchEdge, this.frontZ + 0.6); grow(this.benchEdge, this.frontZ + 0.6);
    this.mainCx = (plat.x0 + plat.x1) / 2;
    if (this.standup) {                         // make room for the stand-up circle in front
      const c = this.#circle();
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, 1], [0, -1]]) add(c.x + dx * (c.r + 0.5), 0, c.z + dz * (c.r + 0.5));
      add(c.x, 2.1, c.z + c.r);
    }
    // platform = content + a margin; its rounded corners are part of the framing
    // generous floor all round: breathing room beside the windows, behind the rooms and in front of the desks
    const b = { x0: plat.x0 - 1.2, x1: plat.x1 + 1.5, z0: plat.z0 - 0.6, z1: plat.z1 + 1.9 };
    // the L's second arm: a dining & café annex to the right, front-aligned; the lounge moves in
    const E = LOUNGE.extent;
    const A = this.annex = { x0: b.x1, x1: b.x1 + ANNEX_W, z0: b.z1 - ANNEX_D, z1: b.z1 };
    const lc = this.cafe.group.position;
    lc.set((A.x0 + A.x1) / 2, 0, A.z0 + 0.9 - E.z0);
    this.cafe.group.rotation.y = 0;
    this.cafe.group.updateMatrixWorld(true);
    for (const [dx, dz] of [[E.x0, E.z0], [E.x1, E.z0], [E.x0, E.z1], [E.x1, E.z1]]) add(lc.x + dx, 0, lc.z + dz);
    add(lc.x, 2.15, lc.z);
    add(A.x1, 0, A.z0); add(A.x1, 0, A.z1);
    this.#buildPlatform(b, A);
    for (const x of [b.x0, b.x1]) pts.push(new THREE.Vector3(x, WALL_H, b.z0));
    pts.push(new THREE.Vector3(b.x0, WALL_H, b.z1), new THREE.Vector3(A.x1, WALL_H, A.z0), new THREE.Vector3(A.x1, WALL_H, A.z1));
    const inset = 0.2;
    for (const x of [b.x0 + inset, A.x1 - inset]) for (const z of [b.z0 + inset, b.z1 - inset]) { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x, -SLAB_T, z)); }
    minX = Math.min(minX, b.x0); maxX = Math.max(maxX, A.x1); minZ = Math.min(minZ, b.z0); maxZ = Math.max(maxZ, b.z1);

    const elev = this.elev = this.seatTransform(n - 1, n).row > 0 ? 0.76 : 0.68;
    this.target = new THREE.Vector3((minX + maxX) / 2, 0.6, (minZ + maxZ) / 2);
    this.extent = { x: (maxX - minX) / 2 + 1, z: (maxZ - minZ) / 2 + 1 };
    this.#clampPan();
    const cam = this.camera;
    cam.aspect = (this.width / this.height) || 1;
    cam.updateProjectionMatrix();
    const place = (dist) => {
      cam.position.set(this.target.x, this.target.y + Math.sin(elev) * dist, this.target.z + Math.cos(elev) * dist);
      cam.lookAt(this.target);
      cam.updateMatrixWorld();
    };
    const v = new THREE.Vector3();
    const bounds = () => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
      return { x0, x1, y0, y1 };
    };
    const fit = (limit) => {
      let lo = 2, hi = 60;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        place(mid);
        const bb = bounds();
        if (Math.max(-bb.x0, bb.x1) < limit && Math.max(-bb.y0, bb.y1) < limit) hi = mid; else lo = mid;
      }
      return hi;
    };
    const limit = this.compact ? 0.94 : 0.9;
    // fit, re-centre the projected content, then fit again
    for (let k = 0; k < 2; k++) {
      const d = fit(limit);
      place(d);
      const bb = bounds();
      const half = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * d;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
      this.target.addScaledVector(up, ((bb.y0 + bb.y1) / 2) * half);
      this.target.addScaledVector(right, ((bb.x0 + bb.x1) / 2) * half * cam.aspect);
    }
    this.camDist = fit(limit - 0.02);
  }

  #buildCafe() {
    const lounge = buildLounge(surfaces(), { compact: this.compact });
    const { group } = lounge;
    // sage rug under the lounge
    const rug = this.loungeRug = rugMesh(4.4, 4.4, 2.2, 0.005, 'round', this.dark);
    group.add(rug);
    // warm arc-lamp shade + halo + the lounge's (only) point light
    const shadeMesh = new THREE.Mesh(lounge.shadeGeo, this.M.shadeOn);
    shadeMesh.position.set(...ARC_SHADE_AT);
    group.add(shadeMesh);
    const halo = new THREE.Sprite(this.M.loungeGlow);
    halo.position.set(ARC_SHADE_AT[0], ARC_SHADE_AT[1] - 0.02, ARC_SHADE_AT[2]);
    halo.scale.set(1.1, 1.1, 1);
    halo.renderOrder = 4;
    group.add(halo);
    this.loungeLight.position.set(ARC_SHADE_AT[0], ARC_SHADE_AT[1] - 0.2, ARC_SHADE_AT[2]);
    group.add(this.loungeLight);
    // hit boxes: the table and each cup
    const proxies = [];
    const tp = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 20), this.M.proxy);
    tp.position.set(0, LOUNGE.top - 0.03, 0);
    tp.userData = { kind: 'table', target: lounge.table, proxy: true };
    group.add(tp); proxies.push(tp);
    for (const cup of lounge.cups) {
      const cp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.2), this.M.proxy);
      cp.position.set(cup.position.x, LOUNGE.top + 0.05, cup.position.z);
      cp.userData = { kind: 'cup', target: cup, proxy: true, source: 'lounge' };
      group.add(cp); proxies.push(cp);
    }
    return { ...lounge, halo, shadeMesh, proxies };
  }

  // ---------- people ----------
  update(snapshot) {
    const members = snapshot.members || [];
    this.helps = snapshot.helps || [];
    this.meId = snapshot.me?.id;
    // the sky follows my own weather
    const w = snapshot.me?.weather || null;
    if ((w && w.code) !== (this.weather && this.weather.code) || !!w !== !!this.weather) { this.weather = w; this.sky.set(w); }
    // my chair override lasts until my status changes
    const mine = members.find(m => m.id === this.meId) || snapshot.me;
    const myState = mine ? `${mine.state}:${mine.message || ''}` : '';
    if (myState !== this.myState) { this.myState = myState; this.meStanding = false; }
    // stand-up: everyone in it walks to a circle in front of the desks
    const su = snapshot.standup || null;
    if ((su && su.id) !== (this.standup && this.standup.id)) {
      this.standup = su;
      this.#frameCamera();
    } else this.standup = su;
    const speakerKey = su ? su.id + ':' + su.turn : '';
    if (speakerKey !== this.speakerKey) {
      this.speakerKey = speakerKey;
      if (su) setTimeout(() => this.wave(su.order[su.turn], 2), 300);   // "hi, my turn"
    }
    const ids = new Set(members.map(m => m.id));
    for (const [id, p] of this.people) if (!ids.has(id)) this.#remove(p);
    // seats are compacted so the arc stays tidy
    const sorted = [...members].sort((a, b) => a.seat - b.seat);
    this.layout(sorted.length);
    sorted.forEach((m, i) => {
      let p = this.people.get(m.id);
      if (!p) p = this.#add(m);
      else if (p.lookKey !== lookKey(m)) this.#swapLook(p, m);   // they picked a new character
      p.member = m;
      p.seatIndex = i;
      this.#setPet(p, m.avatar?.pet || '');
      this.#applyStatus(p);
    });
    this.#assignCafe();
  }

  #add(m) {
    const av = makeCharacter({ id: m.id, color: m.color, avatar: m.avatar || {} });
    av.root.userData.personId = m.id;
    this.scene.add(av.root);
    const label = document.createElement('button');
    label.className = 'label';
    label.innerHTML = `<span class="dot"></span><span class="nm"></span><span class="st"></span>`;
    label.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect?.(m.id, label.getBoundingClientRect()); });
    this.labels.appendChild(label);
    const p = { id: m.id, lookKey: lookKey(m), member: m, av, label, pos: new THREE.Vector3(), rotY: 0, path: [], badge: null, badgeText: '', fx: [] };
    p.nextLook = this.t + 10 + Math.random() * 25;
    this.people.set(m.id, p);
    p.isNew = true;
    return p;
  }

  // cardboard box with a "brb" sign, one per person, created on first use
  #box(p) {
    if (p.box) return p.box;
    const g = new THREE.Group();
    const card = new THREE.MeshStandardMaterial({ color: '#C99A62', roughness: 0.85 });
    const cardDark = new THREE.MeshStandardMaterial({ color: '#B4844F', roughness: 0.9 });
    const tape = new THREE.MeshStandardMaterial({ color: '#E8D4A6', roughness: 0.6 });
    const W = 0.78, H = 1.45, D = 0.72;
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), card);
    body.position.y = H / 2; body.castShadow = body.receiveShadow = true;
    g.add(body);
    // edge bevels so it reads as a box, not a block
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.03, H, 0.03), cardDark);
      e.position.set(x * W / 2, H / 2, z * D / 2);
      g.add(e);
    }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, D + 0.01), tape);
    strip.position.y = H + 0.004;
    g.add(strip);
    for (const sx of [-1, 1]) {               // open flaps on top
      const flap = new THREE.Mesh(new THREE.BoxGeometry(W / 2, 0.015, D), cardDark);
      flap.geometry.translate(sx * W / 4, 0, 0);
      flap.position.set(sx * W / 2, H, 0);
      flap.rotation.z = sx * 0.55;
      flap.castShadow = true;
      g.add(flap);
    }
    // little sign on the front
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, 256, 128);
    ctx.strokeStyle = '#B4844F'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, 248, 120);
    ctx.fillStyle = '#5a3d22'; ctx.font = 'bold 64px -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('BRB ☕', 128, 68);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
    sign.position.set(0, H * 0.62, D / 2 + 0.003);
    sign.rotation.z = -0.06;
    g.add(sign);
    g.visible = false;
    this.scene.add(g);
    p.box = { group: g, spring: new Spring(0, 90, 7), target: 0 };   // low damping → lands with a bounce
    return p.box;
  }

  #swapLook(p, m) {
    const old = p.av;
    this.scene.remove(old.root);
    old.dispose();
    const av = makeCharacter({ id: m.id, color: m.color, avatar: m.avatar || {} });
    av.root.userData.personId = m.id;
    av.pose = old.pose; av.activity = old.activity;
    av.root.position.copy(old.root.position);
    av.root.rotation.y = old.root.rotation.y;
    av.setOpacity?.(old.opacity ?? 1);
    this.scene.add(av.root);
    av.hop?.(1.2);
    p.av = av;
    p.lookKey = lookKey(m);
  }

  #disposeObject(root) {
    root.traverse(o => {
      o.geometry?.dispose();
      for (const m of o.material ? [].concat(o.material) : []) { m.map?.dispose(); m.dispose(); }
    });
  }

  #remove(p) {
    this.scene.remove(p.av.root);
    p.av.dispose();
    p.label.remove();
    if (p.badge) { this.scene.remove(p.badge); this.#disposeObject(p.badge); }
    p.meetSlot = undefined;
    if (p.box) { this.scene.remove(p.box.group); this.#disposeObject(p.box.group); }
    for (const s of p.fx) { this.scene.remove(s); this.#disposeObject(s); }
    p.aura?.dispose(this.scene);
    if (p.pet) { this.scene.remove(p.pet.root); p.pet.dispose(); }
    if (p.mic) this.scene.remove(p.mic);
    this.people.delete(p.id);
  }

  #seatPoint(p) {
    const s = this.seats[p.seatIndex];
    return { x: s.x, z: s.z, rotY: s.rotY };
  }

  #placeAtSeat(p, snap) {
    if (!this.seats[p.seatIndex]) return;    // seat vanished in a re-layout; update() reseats them next
    const sp = this.#seatPoint(p);
    if (snap || p.isNew) { p.pos.set(sp.x, 0, sp.z); p.rotY = sp.rotY; }
  }

  #mode(p) {
    const m = p.member;
    if (m.state === 'lunch') return 'cafe';
    if (isCoffeeBreak(m)) return 'coffee';    // BRB with a coffee note: off to the lounge
    if (m.state === 'brb') return 'brb';     // stepped away, still visible
    if (m.state === 'afk' || m.state === 'leave') return 'away';
    if (m.state === 'meeting' && this.meet) return 'meeting';   // off to their own meeting room
    if (this.standup?.order.includes(m.id) && STANDUP_STATES.has(m.state)) return 'standup';
    return 'seat';
  }

  #assignCafe() {
    let i = 0;
    for (const p of this.people.values()) {
      const mode = this.#mode(p);
      // fill the seats that face the camera first (back + sides), the poufs in front last
      if (mode === 'cafe' || mode === 'coffee') p.cafeSlot = CAFE_ORDER[i++ % CAFE_ORDER.length];
    }
    let j = 0;
    for (const p of this.people.values()) if (this.#mode(p) === 'brb') p.brbSlot = j++;
    // meeting rooms: keep a person's room while they stay in the meeting, else take the lowest free one
    const used = new Set();
    for (const p of this.people.values()) {
      if (this.#mode(p) === 'meeting' && p.meetSlot !== undefined && !used.has(p.meetSlot)) used.add(p.meetSlot);
      else if (this.#mode(p) !== 'meeting') p.meetSlot = undefined;
      else p.meetSlot = undefined;
    }
    for (const p of this.people.values()) {
      if (this.#mode(p) !== 'meeting' || p.meetSlot !== undefined) continue;
      let k = 0; while (used.has(k)) k++;
      p.meetSlot = k; used.add(k);
    }
    for (const p of this.people.values()) this.#route(p);
    this.#labelRooms();
  }

  #worldCafe(slot) {
    const s = this.cafe.slots[slot];
    const g = this.cafe.group;
    const v = new THREE.Vector3(s.x, 0, s.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y).add(g.position);
    return { x: v.x, z: v.z, rotY: s.rotY + g.rotation.y };
  }

  #route(p) {
    const mode = this.#mode(p);
    const lounge = mode === 'cafe' || mode === 'coffee';
    const suSlot = mode === 'standup' ? this.standup.order.indexOf(p.id) + '/' + this.standup.order.length : '';
    const key = mode + ':' + (lounge ? p.cafeSlot : mode === 'brb' ? p.brbSlot : mode === 'standup' ? suSlot : mode === 'meeting' ? p.meetSlot : p.seatIndex) + ':' + this.laidOut;
    if (p.routeKey === key) return;
    const firstTime = !p.routeKey;
    p.prevMode = p.mode;
    p.mode = mode;
    p.routeKey = key;
    const seat = this.#seatPoint(p);
    const back = { x: seat.x - Math.sin(seat.rotY) * 0.9, z: seat.z - Math.cos(seat.rotY) * 0.9 };
    let dest;
    if (lounge) dest = this.#worldCafe(p.cafeSlot);
    else if (mode === 'brb') {
      // walk to the corner; boxes line up in a little grid there
      const k = p.brbSlot || 0, col = k % 2, row = Math.floor(k / 2);
      dest = { x: this.brbCorner.x + (col ? 0.75 : 0) - row * 0.2, z: this.brbCorner.z + row * 0.8, rotY: 0.25 };
    }
    else if (mode === 'meeting') dest = this.#meetPoint(p.meetSlot);
    else if (mode === 'away') dest = { x: seat.x - Math.sin(seat.rotY) * 1.3, z: seat.z - Math.cos(seat.rotY) * 1.3, rotY: seat.rotY + Math.PI };
    else if (mode === 'standup') dest = this.#circleSlot(this.standup.order.indexOf(p.id), this.standup.order.length);
    else dest = seat;
    if (firstTime || p.isNew) {
      p.prevMeetSlot = mode === 'meeting' ? p.meetSlot : undefined;
      p.pos.set(dest.x, 0, dest.z); p.rotY = dest.rotY; p.path = []; p.isNew = false;
      p.arrived = true;
      p.destRot = dest.rotY;
      return;
    }
    // leave via the space behind the chair, then on to the destination
    p.path = [new THREE.Vector3(back.x, 0, back.z), new THREE.Vector3(dest.x, 0, dest.z)];
    if (mode === 'brb' || p.prevMode === 'brb') {
      const via = back;
      // going to the corner: via the back of the chair. Leaving it: straight to wherever
      // they're headed now (desk, lounge…), passing behind the chair only when returning to it.
      p.path = mode === 'brb' ? [new THREE.Vector3(via.x, 0, via.z), new THREE.Vector3(dest.x, 0, dest.z)]
        : mode === 'seat' ? [new THREE.Vector3(via.x, 0, via.z), new THREE.Vector3(seat.x, 0, seat.z)]
        : [new THREE.Vector3(dest.x, 0, dest.z)];
    }
    // the lounge now lives in the annex: out behind the chair, along to the opening, then in (and back the same way)
    if (this.annex && (lounge || (p.prevMode === 'cafe' || p.prevMode === 'coffee')) && !(lounge && (p.prevMode === 'cafe' || p.prevMode === 'coffee'))) {
      const A = this.annex, V = (x, z) => new THREE.Vector3(x, 0, z);
      const door = V(A.x0 - 0.3, A.z0 + 2.6);
      if (lounge) p.path = [V(back.x, back.z), V(A.x0 - 1.0, back.z), door, V(dest.x, dest.z)];
      else if (mode === 'seat') p.path = [door, V(A.x0 - 1.0, back.z), V(back.x, back.z), V(seat.x, seat.z)];
      else p.path = [door, V(dest.x, dest.z)];
    }
    // between the lounge and anywhere but the desk: straight there
    if (lounge && (p.prevMode === 'cafe' || p.prevMode === 'coffee')) p.path = [new THREE.Vector3(dest.x, 0, dest.z)];
    // to / from the stand-up circle: out behind the chair, round the end of the bench
    if (mode === 'standup' || (p.prevMode === 'standup' && p.prevMode !== mode)) {
      const from = mode === 'standup' ? seat : p.pos;
      const side = from.x < (this.target?.x || 0) ? -this.benchEdge : this.benchEdge;
      const around = [new THREE.Vector3(side, 0, back.z), new THREE.Vector3(side, 0, this.frontZ + 0.6)];
      if (mode === 'standup') p.path = [new THREE.Vector3(back.x, 0, back.z), ...around, new THREE.Vector3(dest.x, 0, dest.z)];
      else if (mode === 'seat') p.path = [...around.reverse(), new THREE.Vector3(back.x, 0, back.z), new THREE.Vector3(seat.x, 0, seat.z)];
      else p.path = [...around.reverse(), new THREE.Vector3(dest.x, 0, dest.z)];
    }
    if (p.prevMode === 'seat' && mode === 'away') p.path = [new THREE.Vector3(dest.x, 0, dest.z)];
    if (p.prevMode === 'away' && mode === 'seat') p.path = [new THREE.Vector3(seat.x, 0, seat.z)];
    // to / from a meeting room: out behind the chair, down the left lane, in through the room's open front
    if (mode === 'meeting' || p.prevMode === 'meeting') {
      const mt = this.meet, V = (x, z) => new THREE.Vector3(x, 0, z);
      const leaving = p.prevMode === 'meeting' && p.prevMeetSlot !== undefined ? this.#meetOut(p.prevMeetSlot) : [];
      const laneFromSeat = [V(back.x, back.z), V(mt.laneX, back.z), V(mt.laneX, mt.aisleZ)];
      if (mode === 'meeting') p.path = [...(p.prevMode === 'meeting' ? leaving : laneFromSeat), ...this.#meetIn(p.meetSlot)];
      else if (mode === 'seat') p.path = [...leaving, V(mt.laneX, back.z), V(back.x, back.z), V(seat.x, seat.z)];
      else p.path = [...leaving, V(dest.x, dest.z)];
    }
    p.prevMeetSlot = mode === 'meeting' ? p.meetSlot : undefined;
    p.destRot = dest.rotY;
    p.arrived = false;
  }

  #applyStatus(p) {
    const m = p.member;
    const d = display(m, this.helps);
    const seat = this.seats[p.seatIndex];
    const mode = this.#mode(p);
    const present = !!STATUS[m.state]?.present;
    const worn = m.state === 'dnd' || !!m.inCall;
    if (seat) {
      // laptop screen + lid
      const tint = new THREE.Color(PALETTE.softBlue).lerp(new THREE.Color(m.color || PALETTE.softBlue), 0.45);
      const ak = [...(m.id || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 4;   // each person gets their own desk object
      if (seat.accKind !== ak) { seat.accKind = ak; seat.acc.geometry = deskAccessories()[ak]; }
      seat.screenMat.color.copy(present ? shade('#' + tint.getHexString(), 0.14) : new THREE.Color('#262C36'));
      seat.logoMat.color.copy(present ? shade(m.color || PALETTE.softBlue, 0.22) : new THREE.Color('#9AA1AD'));
      (seat.screenBase ||= new THREE.Color()).copy(seat.screenMat.color); seat.glowing = present;
      seat.dndTarget = m.state === 'dnd' ? 1 : 0;
      if (seat.dndTarget && seat.dndName !== m.name) {           // board says whose desk it is
        seat.dndName = m.name;
        seat.dndBoard.map?.dispose();
        seat.dndBoard.map = dndTexture(m.name);
        seat.dndBoard.needsUpdate = true;
      }
      seat.lidTarget = m.state === 'afk' ? -1.3 : 0.22;
      const standing = m.id === this.meId && this.meStanding;
      seat.chairTarget = mode === 'seat' && !standing ? 0 : 0.35;
      // upholstery: slate fabric with a hint of their colour
      seat.seatMat.color.copy(new THREE.Color(C.fabricSlate).lerp(new THREE.Color(m.color || C.fabricSlate), 0.4));
      seat.mug.visible = mode !== 'coffee';                       // they took it to the lounge
      this.#setPhones(seat, !worn);                               // headphones rest on the desk unless worn
      const lampOn = m.id === this.meId ? this.lampOn : present;   // mine follows my click; others light up when they're in
      if (seat.lampOn !== lampOn) { seat.lampOn = lampOn; this.#applyLamp(seat); }
      this.#updatePlant(seat, m, this.t);
    }
    p.av.setHeadphones(worn, !!m.inCall);
    // no badge for lunch / coffee: the character is already holding the bowl or cup (a second one floated over their head)
    const wantBadge = d.key === 'help' ? '❓' : d.key === 'call' ? '🎙️' : m.state === 'afk' ? '💤' : m.state === 'meeting' ? '📅' : '';
    if (wantBadge !== p.badgeText) {
      if (p.badge) { this.scene.remove(p.badge); this.#disposeObject(p.badge); }
      p.badge = wantBadge ? emojiSprite(wantBadge, 0.32) : null;
      if (p.badge) { p.badge.userData.born = this.t; p.badge.scale.setScalar(0.001); this.scene.add(p.badge); }
      p.badgeText = wantBadge;
    }
    // label
    p.label.style.setProperty('--c', d.color);
    p.label.querySelector('.nm').textContent = m.id === this.meId ? `${m.name} (you)` : m.name;
    p.label.querySelector('.st').textContent = mode === 'coffee' ? 'Coffee break' : d.label;
    p.label.classList.toggle('help', d.key === 'help');
    p.label.classList.toggle('me', m.id === this.meId);
    p.label.dataset.state = d.key;
  }

  // ---------- stand-up circle ----------
  #circle() {
    const n = this.standup?.order.length || 1;
    const r = Math.max(0.75, n * 0.3);
    return { x: this.mainCx ?? 0, z: this.frontZ + 0.7 + r, r };
  }
  #circleSlot(i, n) {
    const c = this.#circle();
    // spread around the circle, starting at the back (facing the camera) so faces are visible
    const a = Math.PI + (i / Math.max(n, 1)) * Math.PI * 2 + (n > 1 ? Math.PI / n : 0);
    const x = c.x + Math.sin(a) * c.r, z = c.z + Math.cos(a) * c.r;
    return { x, z, rotY: Math.atan2(c.x - x, c.z - z) };
  }
  #standupProps() {
    if (this.su3d) return this.su3d;
    const g = new THREE.Group();
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ color: PALETTE.softBlue, roughness: 0.95, transparent: true, opacity: 0.45 }));
    rug.rotation.x = -Math.PI / 2; rug.position.y = 0.007; rug.receiveShadow = true;
    g.add(rug);
    const spot = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.36, 40), new THREE.MeshBasicMaterial({ color: '#E8C58A', transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
    spot.rotation.x = -Math.PI / 2; spot.position.y = 0.012;
    this.scene.add(spot);
    const mic = emojiSprite('🎤', 0.34);
    this.scene.add(mic);
    g.visible = false; spot.visible = false; mic.visible = false;
    this.scene.add(g);
    return (this.su3d = { g, rug, spot, mic });
  }

  // ---------- pets & plants ----------
  #setPet(p, kind) {
    if (kind === 'none') kind = '';
    if (p.petKind === kind) return;
    if (p.pet) { this.scene.remove(p.pet.root); p.pet.dispose(); p.pet = null; }
    p.petKind = kind;
    if (!kind) return;
    p.pet = new Pet(kind);
    p.pet.root.scale.setScalar(1.5);
    p.petPos = null;   // placed on the first frame
    this.scene.add(p.pet.root);
    p.pet.hop(1.2);
  }

  #updatePlant(seat, m, t) {
    const stage = plantStage(m.plant || 0);
    if (seat.plantStage === stage && seat.plantOwner === m.id) return;
    const grew = seat.plantOwner === m.id && stage > seat.plantStage;
    if (seat.plant) { seat.plantHolder.remove(seat.plant); seat.plant.traverse(o => o.geometry?.dispose()); }
    seat.plant = buildPlant(stage);
    seat.plantScale = 1.7;
    seat.plantHolder.add(seat.plant);
    seat.plantStage = stage;
    seat.plantOwner = m.id;
    seat.plantBorn = grew ? t : -10;
    if (this.hover?.target === seat.plantHolder) this.#refreshHover();
  }

  // a teammate's plant grew (they helped someone / got kudos): sparkle + a little pop
  grow(id, reason) {
    const p = this.people.get(id);
    if (!p) return;
    const seat = this.seats[p.seatIndex];
    if (seat) seat.plantBorn = this.t;
    this.react(id, reason === 'kudos' ? '👏' : '🌱');
    p.pet?.hop(1);
  }

  react(id, emoji) {
    const p = this.people.get(id);
    if (!p) return;
    const s = emojiSprite(emoji, 0.45);
    s.userData.born = this.t;
    s.userData.x = (Math.random() - 0.5) * 0.3;
    s.scale.setScalar(0.001);
    this.scene.add(s);
    p.fx.push(s);
    const e = String(emoji || '');
    if (e.startsWith('👋')) this.wave(id);
    else if (e.startsWith('🎉')) this.celebrate(id, 1.8);
    else if (e.startsWith('☕')) { p.drinkUntil = this.t + 2.4; p.av.hop(0.4); }
    else if (e.startsWith('👍') || e.startsWith('😂')) this.celebrate(id, 0.8);
    else p.av.hop(0.8);
  }

  wave(id, seconds = 2.5) {
    const p = this.people.get(id);
    if (p) { p.waveUntil = this.t + seconds; p.av.hop(0.5); }
  }

  celebrate(id, seconds = 1.8) {
    const p = this.people.get(id);
    if (p) { p.celebrateUntil = this.t + seconds; p.av.hop(1); p.pet?.hop(1); }
  }

  // ---------- frame ----------
  #frame() {
    // real elapsed time (capped) so walking keeps pace even on slow machines
    const realDt = Math.min(this.clock.getDelta(), 0.25);
    const dt = Math.min(realDt, 0.05);
    this.t += realDt;
    const t = this.t;

    // sky + lighting for my local time of day and weather
    const L = this.sky.update(t, dt);
    if (this.base) {
      this.sun.intensity = this.base.sun * L.sun + L.flash * 3;
      this.sun.color.set(L.sunColor);
      this.hemi.intensity = this.base.hemi * L.hemi + L.flash * 1.5;
      const lamp = Math.min(1, L.lamp + (this.dark ? 0.2 : 0));
      if (Math.abs(lamp - this.lampLevel) > 0.005) {
        this.lampLevel = lamp;
        this.M.shadeOn.emissiveIntensity = 0.35 + lamp * 0.75;
        this.M.glow.opacity = 0.12 + lamp * 0.6;
        this.M.loungeGlow.opacity = 0.3 + lamp * 0.5;
      }
      this.loungeLight.intensity = this.base.lounge * (0.45 + lamp * 0.55);
    }

    this.live?.update(t, { kind: this.sky.kind, hour: this.debugHour });

    // eased move for Reset view (keeps following my character if they walk off)
    const vt = this.viewTarget;
    if (vt) {
      if (vt.follow && this.target) { vt.pan.x = vt.follow.pos.x - this.target.x; vt.pan.z = vt.follow.pos.z - this.target.z; }
      const k = 1 - Math.exp(-realDt * 5);
      this.zoom += (vt.zoom - this.zoom) * k; this.yaw += (vt.yaw - this.yaw) * k; this.tilt += (vt.tilt - this.tilt) * k;
      this.pan.lerp(vt.pan, k);
      if (!vt.follow && Math.abs(this.zoom - vt.zoom) < 0.002 && this.pan.distanceTo(vt.pan) < 0.01) this.viewTarget = null;
    }

    // camera: gentle drift + user yaw
    const yaw = this.yaw + Math.sin(t * 0.1) * 0.03;
    const dist = this.camDist * this.zoom;
    const elev = THREE.MathUtils.clamp((this.elev || 0.62) + this.tilt, ELEV_MIN, ELEV_MAX);
    if (this.target) {
      const look = this._look || (this._look = new THREE.Vector3());
      look.copy(this.target).add(this.pan);
      this.camera.position.set(
        look.x + Math.sin(yaw) * Math.cos(elev) * dist,
        look.y + Math.sin(elev) * dist,
        look.z + Math.cos(yaw) * Math.cos(elev) * dist,
      );
      this.camera.lookAt(look);
    }

    // monitors breathe softly; the "in use" light on an occupied meeting room pulses
    for (const s of this.seats || []) if (s.glowing && s.screenBase) s.screenMat.color.copy(s.screenBase).multiplyScalar(0.93 + 0.07 * Math.sin(t * 2.2 + s.index * 1.7));
    for (const r of this.meetRooms || []) if (r.occ) r.stripMat.color.set('#E5736A').lerp(_pulse.set('#FFC2B8'), 0.5 + 0.5 * Math.sin(t * 2.6 + r.index));

    for (const s of this.seats || []) {
      if (s.dndTarget !== undefined) {           // pop the sign up / fold it away
        const was = s.dndShow;
        s.dndShow += (s.dndTarget - s.dndShow) * Math.min(1, dt * 7);
        if (s.dndTarget && was < 0.02) s.dndBorn = t;
        const k = s.dndTarget ? ease.outBack(Math.min(1, (t - (s.dndBorn ?? t)) / 0.45), 2.2) : s.dndShow;
        s.dnd.visible = s.dndShow > 0.01;
        s.dnd.scale.setScalar(Math.max(0.001, k));
      }
      if (s.plant) {
        const k = Math.min(1, (t - (s.plantBorn ?? -10)) / 0.7);
        s.plant.scale.setScalar((s.plantScale || 1) * (k < 1 ? Math.max(0.05, ease.outBack(k, 2.6)) : 1 + Math.sin(t * 1.3 + s.x) * 0.015));
      }
      if (s.wiggleT !== undefined) {             // clicked: a happy little wiggle
        const u = t - s.wiggleT;
        const k = u < 1.4 ? Math.exp(-u * 3) : 0;
        s.plantHolder.rotation.z = Math.sin(u * 18) * 0.22 * k;
        s.plantHolder.rotation.x = Math.sin(u * 13 + 1) * 0.1 * k;
        if (!k) { s.wiggleT = undefined; s.plantHolder.rotation.z = s.plantHolder.rotation.x = 0; }
      }
      if (s.lidTarget !== undefined) s.lid.rotation.x += (s.lidTarget - s.lid.rotation.x) * Math.min(1, dt * 4);
      if (s.chairTarget !== undefined) {
        s.chair.position.z += (-s.chairTarget - s.chair.position.z) * Math.min(1, dt * 3);
        s.chair.rotation.y += (s.chairTarget * 0.6 - s.chair.rotation.y) * Math.min(1, dt * 3);
      }
    }

    const tmp = new THREE.Vector3();
    let blobs = 0;
    for (const p of this.people.values()) {
      const av = p.av;
      const m = p.member;
      const mode = this.#mode(p);
      // BRB box: drops over the character once they reach the corner, lifts when they come back
      const box = this.#box(p);
      box.target = mode === 'brb' && !p.path.length ? 1 : 0;
      box.spring.target = box.target;
      box.spring.step(dt);
      const cover = THREE.MathUtils.clamp(box.spring.x, 0, 1.15);
      box.group.visible = cover > 0.01 || box.target > 0;
      box.group.position.set(p.pos.x, (1 - Math.min(cover, 1)) * 2.4, p.pos.z);
      box.group.rotation.y = (p.destRot ?? p.rotY);
      const squash = Math.max(0, cover - 1) * 1.5;
      box.group.scale.set(1 + squash, 1 - squash, 1 + squash);
      const hidden = cover > 0.97;
      const waitForBox = p.prevMode === 'brb' && mode !== 'brb' && box.spring.x > 0.2;
      const standingMe = mode === 'seat' && p.id === this.meId && this.meStanding;

      // movement along path
      if (p.path.length && !waitForBox) {
        const next = p.path[0];
        tmp.copy(next).sub(p.pos);
        const dist = tmp.length();
        const speed = 2.2 * realDt;
        if (dist <= speed) { p.pos.copy(next); p.path.shift(); }
        else {
          tmp.normalize();
          p.pos.addScaledVector(tmp, speed);
          const want = Math.atan2(tmp.x, tmp.z);
          p.rotY = lerpAngle(p.rotY, want, dt * 10);
        }
        av.pose = 'walk';
        av.activity = 'idle';
        if (!p.path.length) p.arrived = true;
      } else {
        if (p.destRot !== undefined) p.rotY = lerpAngle(p.rotY, p.destRot, dt * 6);
        p.arrived = true;
        const d = display(m, this.helps);
        av.pose = mode === 'away' || mode === 'brb' || mode === 'standup' || standingMe ? 'stand' : 'sit';
        const speaking = mode === 'standup' && this.standup.order[this.standup.turn] === m.id;
        const out = mode === 'away' || mode === 'brb';
        if (p.waveUntil && t < p.waveUntil) av.activity = 'wave';
        else if (p.celebrateUntil && t < p.celebrateUntil && !out) av.activity = 'celebrate';
        else if (p.drinkUntil && t < p.drinkUntil && !out) av.activity = 'drink';
        else if (mode === 'standup') av.activity = speaking ? 'talk' : 'idle';
        else if (d.key === 'help') av.activity = 'raise';
        else if (mode === 'cafe') av.activity = 'eat';
        else if (mode === 'coffee') av.activity = 'drink';
        else if (out) av.activity = 'idle';
        else if (m.inCall) av.activity = 'talk';
        else if (m.state === 'meeting') av.activity = 'listen';
        else if (standingMe) av.activity = 'idle';
        else {
          // working; now and then a short glance around (not while focusing)
          if (t >= p.nextLook && m.state !== 'dnd') { p.lookUntil = t + 2.2; p.nextLook = t + 25 + Math.random() * 35; }
          av.activity = p.lookUntil && t < p.lookUntil ? 'look' : 'type';
        }
      }

      // Focus mode: aura once they're settled at the desk (bursts on as they switch Focus on)
      const focusing = m.state === 'dnd' && mode === 'seat' && !p.path.length;
      if (focusing && !p.aura) { p.aura = new FocusAura({ size: 1.3 }); this.scene.add(p.aura.group); }
      if (p.aura) {
        if (focusing && !p.aura.target) p.av.hop?.(0.6);
        p.aura.set(focusing, t);
        p.aura.update(t, dt, p.pos, { seated: true, faceCamera: this.camera });
      }

      // away people fade out once they've "left"; returning people fade back in
      const targetOpacity = mode === 'away' ? 0 : 1;
      av.root.visible = !hidden && av.opacity > 0.02;
      av.setOpacity(av.opacity + (targetOpacity - av.opacity) * Math.min(1, dt * 2.5));
      if (hidden) av.root.visible = false;

      // seated avatars sit slightly into the chair (local -z); standing at the desk: a bit further back
      av.root.position.copy(p.pos);
      if (!p.path.length && (mode === 'seat' || mode === 'meeting')) {
        const back = standingMe ? -0.1 : -0.05;
        av.root.position.x += Math.sin(p.rotY) * back;
        av.root.position.z += Math.cos(p.rotY) * back;
      }
      av.root.rotation.y = p.rotY;
      av.update(t, dt);

      // soft contact shadow
      if (av.root.visible && blobs < MAX_BLOBS) {
        const k = 0.75 * Math.max(0, av.opacity);
        _mtx.compose(_p.set(av.root.position.x, 0, av.root.position.z), _q.identity(), _s.set(k, 1, k * 0.9));
        this.personBlobs.setMatrixAt(blobs++, _mtx);
      }

      // pet: on the desk while its owner works, trotting after them otherwise
      if (p.pet) {
        const seat = this.seats[p.seatIndex];
        const onDesk = mode === 'seat' && !p.path.length && seat && !standingMe;
        let goal, goalRot;
        if (onDesk) {
          goal = seat.group.localToWorld(tmp.set(...PET_AT)).clone();
          goalRot = seat.rotY - 0.35;
        } else {
          const side = hidden ? 0.62 : 0.42;
          goal = new THREE.Vector3(p.pos.x + Math.cos(p.rotY) * side, 0, p.pos.z - Math.sin(p.rotY) * side - 0.1);
          goalRot = p.rotY;
        }
        if (!p.petPos) { p.petPos = goal.clone(); p.petRot = goalRot; }
        if (onDesk !== p.petOnDesk) { p.petOnDesk = onDesk; p.pet.hop(1.4); }
        const d = goal.clone().sub(p.petPos);
        const dist = d.length();
        const moving = dist > 0.04;
        if (moving) {
          p.petPos.addScaledVector(d.normalize(), Math.min(dist, 2.8 * realDt));
          const flat = Math.hypot(d.x, d.z);
          if (flat > 0.01) p.petRot = lerpAngle(p.petRot, Math.atan2(d.x, d.z), dt * 10);
        } else p.petRot = lerpAngle(p.petRot, goalRot, dt * 4);
        p.pet.root.position.copy(p.petPos);
        p.pet.root.rotation.y = p.petRot;
        p.pet.root.visible = mode !== 'away' || av.opacity > 0.3;
        p.pet.update(t, dt, {
          moving: moving && dist > 0.15,
          sleeping: onDesk && m.state === 'dnd',
          excited: this.helps.some(h => !h.claimedBy && h.from !== m.id),
        });
      }

      // floating badge
      const headY = hidden ? 1.6 : av.pose === 'sit' ? 1.78 : 1.95;
      if (p.badge) {
        const bob = Math.sin(t * 2 + p.av.phase) * 0.05;
        const base = mode === 'away' ? this.seats[p.seatIndex] : null;
        const bx = base ? base.x : av.root.position.x;
        const bz = base ? base.z : av.root.position.z;
        p.badge.position.set(bx + 0.28, headY - 0.05 + bob, bz);
        const k = Math.min(1, (t - (p.badge.userData.born ?? 0)) / 0.45);
        p.badge.scale.setScalar(p.badge.userData.size * Math.max(0.001, ease.outBack(k, 2.2)));
      }
      // reactions float up
      p.fx = p.fx.filter(s => {
        const age = t - s.userData.born;
        if (age > 2.2) { this.scene.remove(s); s.material.map.dispose(); s.material.dispose(); return false; }
        s.position.set(av.root.position.x + s.userData.x, headY + age * 0.6, av.root.position.z);
        s.material.opacity = 1 - Math.max(0, age - 1.4) / 0.8;
        s.scale.setScalar(s.userData.size * Math.max(0.001, ease.outBack(Math.min(1, age / 0.35), 2.4)));
        return true;
      });

      // label follows the head (or the empty chair)
      const anchor = mode === 'away' && this.seats[p.seatIndex]
        ? tmp.set(this.seats[p.seatIndex].x, 1.5, this.seats[p.seatIndex].z)
        : tmp.set(av.root.position.x, headY + 0.12, av.root.position.z);
      anchor.project(this.camera);
      const x = (anchor.x * 0.5 + 0.5) * this.width;
      const y = (-anchor.y * 0.5 + 0.5) * this.height;
      p.lx = x; p.ly = y; p.lz = anchor.z;
    }
    this.personBlobs.count = blobs;
    this.personBlobs.instanceMatrix.needsUpdate = true;

    // stand-up: rug in the middle, a spotlight + mic over whoever's talking
    if (this.standup || this.su3d) {
      const P = this.#standupProps();
      const on = !!this.standup;
      P.g.visible = on;
      const speaker = on && this.people.get(this.standup.order[this.standup.turn]);
      const there = speaker && !speaker.path.length && speaker.mode === 'standup';
      P.spot.visible = P.mic.visible = !!there;
      if (on) {
        const c = this.#circle();
        P.g.position.set(c.x, 0, c.z);
        P.rug.scale.setScalar(c.r + 0.35);
      }
      if (there) {
        const pp = speaker.av.root.position;
        P.spot.position.set(pp.x, 0.012, pp.z);
        P.spot.material.opacity = 0.6 + Math.sin(t * 3) * 0.2;
        P.mic.position.set(pp.x + 0.3, 2.1 + Math.sin(t * 3) * 0.04, pp.z);
      }
    }

    // interaction feedback: hover pulse + click pop
    if (this.hoverDirty) { this.hoverDirty = false; this.#updateHover(); }
    this.#interactionFx(t);

    this.#placeLabels();
    this.renderer.render(this.scene, this.camera);
  }

  // keep name tags from piling on top of each other
  #placeLabels() {
    const list = [...this.people.values()].filter(p => p.lx !== undefined);
    for (const p of list) { p.lw = p.label.offsetWidth || 90; p.ly2 = p.ly; }
    list.sort((a, b) => a.ly - b.ly);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        const overlapX = Math.abs(a.lx - b.lx) < (a.lw + b.lw) / 2 + 4;
        const dy = b.ly2 - a.ly2;
        if (overlapX && Math.abs(dy) < 24) {
          const push = (24 - Math.abs(dy)) / 2;
          if (dy >= 0) { a.ly2 -= push; b.ly2 += push; } else { a.ly2 += push; b.ly2 -= push; }
        }
      }
    }
    for (const p of list) {
      p.lx = Math.max(p.lw / 2 + 6, Math.min(this.width - p.lw / 2 - 6, p.lx));
      p.ly2 = Math.max(34, p.ly2);
      p.label.style.transform = `translate(${p.lx.toFixed(1)}px, ${p.ly2.toFixed(1)}px) translate(-50%, -100%)`;
      p.label.style.zIndex = String(1000 - Math.round(p.lz * 1000));
    }
  }

  // ---------- interactions ----------
  // Only my own desk's laptop, mug, chair, lamp and plant, plus the lounge table and cups.
  /** The person at a hovered/clicked desk, or the one using a meeting room. */
  #occupant(h) {
    for (const p of this.people.values()) {
      if (h.kind === 'desk' && p.seatIndex === h.seat) return p;
      if (h.kind === 'room' && this.#mode(p) === 'meeting' && p.meetSlot % this.meet.cols === h.room) return p;
    }
    return null;
  }

  #pickables() {
    const me = this.meId && this.people.get(this.meId);
    const seat = me && this.seats?.[me.seatIndex];
    return [...(seat ? [...seat.proxies, ...seat.chair.children] : []), ...this.cafe.proxies, ...this.seats.map(s => s.deskProxy), ...this.meetRooms.map(r => r.proxy)];
  }

  #hitTest(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const v = this._ndc || (this._ndc = new THREE.Vector2());
    v.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const roots = [...this.people.values()].filter(p => p.av.root.visible).map(p => p.av.root);
    const hits = this.raycaster.intersectObjects([...roots, ...this.#pickables()], true);
    for (const h of hits) {
      let o = h.object;
      if (o.userData.kind) return { kind: o.userData.kind, target: o.userData.target, source: o.userData.source || 'desk', seat: o.userData.seat, room: o.userData.room };
      while (o && !o.userData.personId) o = o.parent;
      if (o) return { personId: o.userData.personId };
    }
    return null;
  }

  #updateHover() {
    const at = this.hoverAt;
    const h = at ? this.#hitTest(at.x, at.y) : null;
    this.#setHover(h);
    if (h) this.#showTip(h);
  }

  #setHover(h) {
    const el = this.renderer.domElement;
    const target = h?.target || null;
    if ((this.hover?.target || null) !== target) {
      if (this.hover) this.#unhighlight(this.hover);
      this.hover = target ? { kind: h.kind, target, t0: this.t, swaps: [] } : null;
      if (this.hover) this.#highlight(this.hover);
    }
    const cursor = h ? 'pointer' : '';
    if (el.style.cursor !== cursor) el.style.cursor = cursor;
    const kind = h?.kind || (h?.personId ? 'person' : '');
    if ((el.dataset.hover || '') !== kind) el.dataset.hover = kind;
    this.#showTip(h);
  }

  // gentle warm emissive lift on the hovered object (temporary material clones)
  // small glass tooltip that says what the hovered thing does / who it belongs to
  #showTip(h) {
    if (!this.tip) { this.tip = document.createElement('div'); this.tip.className = 'tip'; this.labels.appendChild(this.tip); }
    let text = '';
    if (h && !(this.hoverAt === null)) {
      const who = (h.kind === 'desk' || h.kind === 'room') ? this.#occupant(h) : null;
      const TXT = {
        laptop: 'Laptop · set your status', cup: 'Coffee break ☕', lamp: 'Desk lamp · click to toggle', chair: this.meStanding ? 'Chair · sit down' : 'Chair · stand up',
        plant: 'Plant · grows with kudos', table: 'Coffee table · start a coffee chat',
      };
      if (h.kind === 'desk') text = who ? `${who.member.name}’s desk · ${display(who.member, this.helps).label}` : 'Empty desk';
      else if (h.kind === 'room') text = who ? `Meeting room · ${who.member.name}` : 'Meeting room · free';
      else if (h.personId) { const p = this.people.get(h.personId); text = p ? `${p.member.name} · ${display(p.member, this.helps).label}` : ''; }
      else text = TXT[h.kind] || '';
    }
    const t = this.tip;
    if (!text || !this.hoverAt) { t.classList.remove('on'); return; }
    t.textContent = text;
    const r = this.renderer.domElement.getBoundingClientRect();
    t.style.transform = `translate(${Math.round(this.hoverAt.x - r.left + 12)}px, ${Math.round(this.hoverAt.y - r.top + 14)}px)`;
    t.classList.add('on');
  }

  #highlight(hv) {
    hv.target.traverse(o => {
      if (!o.isMesh || o.userData.proxy || o.isInstancedMesh) return;
      const orig = o.material;
      if (Array.isArray(orig)) return;
      const hl = orig.clone();
      if (o.userData.pad) { hl.opacity = 0.32; o.visible = true; }
      else if (hl.emissive) {
        if (hl.emissive.getHex() === 0) { hl.emissive.copy(HL_EMISSIVE); hl.emissiveIntensity = 0.35; }
        else hl.emissiveIntensity = (orig.emissiveIntensity || 1) * 1.35;
      } else if (hl.color) hl.color.multiplyScalar(1.15);
      o.material = hl;
      hv.swaps.push({ mesh: o, orig, hl });
    });
  }

  #unhighlight(hv) {
    for (const s of hv.swaps) {
      if (s.mesh.userData.pad) s.mesh.visible = false;
      s.mesh.material = s.orig;
      s.hl.dispose();
    }
    hv.swaps = [];
    if (this.pop?.target !== hv.target) hv.target.scale.setScalar(1);
  }

  #refreshHover() {
    if (!this.hover) return;
    this.#unhighlight(this.hover);
    this.#highlight(this.hover);
  }

  #interactionFx(t) {
    const targets = new Set();
    if (this.hover) targets.add(this.hover.target);
    if (this.pop) targets.add(this.pop.target);
    for (const o of targets) {
      let k = 1;
      if (this.hover?.target === o) k += 0.022 * (0.5 - 0.5 * Math.cos((t - this.hover.t0) * 4.5));
      if (this.pop?.target === o) { const u = (t - this.pop.t0) / 0.32; if (u < 1) k += 0.09 * ease.bump(u); }
      o.scale.setScalar(k);
    }
    if (this.pop && t - this.pop.t0 > 0.32) {
      if (this.hover?.target !== this.pop.target) this.pop.target.scale.setScalar(1);
      this.pop = null;
    }
  }

  // screen-space box around an object (viewport coordinates, like getBoundingClientRect)
  #screenRect(obj) {
    const box = new THREE.Box3();
    obj.updateMatrixWorld(true);
    obj.traverse(o => {
      if (!o.isMesh || o.userData.proxy || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      box.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
    });
    if (box.isEmpty()) box.setFromCenterAndSize(obj.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0.2, 0.2, 0.2));
    const r = this.renderer.domElement.getBoundingClientRect();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const v = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(this.camera);
      const sx = r.left + (v.x * 0.5 + 0.5) * r.width, sy = r.top + (-v.y * 0.5 + 0.5) * r.height;
      x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
    }
    return { left: x0, top: y0, right: x1, bottom: y1, width: x1 - x0, height: y1 - y0, x: x0, y: y0 };
  }

  #interact(h) {
    const me = this.people.get(this.meId);
    const seat = me && this.seats[me.seatIndex];
    this.pop = { target: h.target, t0: this.t };
    const rect = this.#screenRect(h.kind === 'table' ? this.cafe.table : h.target);
    switch (h.kind) {
      case 'lamp': {
        this.lampOn = !this.lampOn;
        saveLamp(this.lampOn);
        if (me) this.#applyStatus(me);
        this.onInteract?.('lamp', { on: this.lampOn, rect });
        break;
      }
      case 'chair': {
        this.meStanding = !this.meStanding;
        if (me) { this.#applyStatus(me); me.av.hop?.(0.6); }
        this.onInteract?.('chair', { standing: this.meStanding, rect });
        break;
      }
      case 'plant': {
        if (seat) seat.wiggleT = this.t;
        me?.pet?.hop(0.8);
        this.onInteract?.('plant', { stage: seat?.plantStage ?? 0, rect });
        break;
      }
      case 'laptop': this.onInteract?.('laptop', { rect }); break;
      case 'cup': this.onInteract?.('cup', { source: h.source, rect }); break;
      case 'table': this.onInteract?.('table', { rect }); break;
    }
  }

  // ---------- input ----------
  #bindInput() {
    const el = this.renderer.domElement;
    // left-drag: orbit (sideways) and tilt (up/down)
    // right-drag, middle-drag or shift+drag: move the view across the floor
    // two fingers: move + pinch to zoom · scroll / trackpad pinch: zoom · double-click: reset
    const ptrs = new Map();   // pointerId -> {x, y}
    let drag = null;
    const start = (e) => {
      const pts = [...ptrs.values()];
      if (pts.length >= 2) {
        const [a, b] = pts;
        drag = { mode: 'touch2', mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: this.zoom, moved: true };
      } else {
        const pan = e.button === 1 || e.button === 2 || e.shiftKey;
        drag = { mode: pan ? 'pan' : 'orbit', x: e.clientX, y: e.clientY, yaw: this.yaw, tilt: this.tilt, moved: false };
      }
    };
    el.addEventListener('contextmenu', e => e.preventDefault());
    el.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      start(e);
    });
    el.addEventListener('pointermove', e => {
      if (!ptrs.size && e.pointerType !== 'touch') {   // hovering (not dragging)
        this.hoverAt = { x: e.clientX, y: e.clientY };
        this.hoverDirty = true;
      }
      if (!ptrs.has(e.pointerId) || !drag) return;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag.mode === 'touch2') {
        const [a, b] = [...ptrs.values()];
        if (!b) return;
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        this.#panBy(mx - drag.mx, my - drag.my);
        drag.mx = mx; drag.my = my;
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.zoom = clampZoom(drag.zoom * (drag.d / d));
        this.#markDirty();
        return;
      }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        if (!drag.moved) { this.hoverAt = null; this.#setHover(null); }
        drag.moved = true;
      }
      if (drag.moved) this.#markDirty();
      if (drag.mode === 'pan') {
        this.#panBy(dx, dy);
        drag.x = e.clientX; drag.y = e.clientY;
      } else if (drag.moved) {
        this.yaw = THREE.MathUtils.clamp(drag.yaw - dx * 0.006, -YAW_MAX, YAW_MAX);
        const base = this.elev || 0.62;
        this.tilt = THREE.MathUtils.clamp(drag.tilt + dy * 0.005, ELEV_MIN - base, ELEV_MAX - base);
      }
    });
    el.addEventListener('pointerleave', () => { if (!ptrs.size) { this.hoverAt = null; this.hoverDirty = true; } });
    const end = (e) => {
      const wasClick = drag && !drag.moved && drag.mode === 'orbit' && ptrs.size === 1;
      ptrs.delete(e.pointerId);
      if (wasClick && e.type === 'pointerup') this.#pick(e);
      if (ptrs.size) { const [id] = ptrs.keys(); const p = ptrs.get(id); start({ clientX: p.x, clientY: p.y, button: 0 }); drag.mode = 'pan'; drag.moved = true; }
      else drag = null;
      if (e.pointerType !== 'touch' && e.type === 'pointerup') { this.hoverAt = { x: e.clientX, y: e.clientY }; this.hoverDirty = true; }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => {
      e.preventDefault();
      // trackpad pinch arrives as ctrl+wheel with small deltas; make it as quick as a wheel notch
      const k = e.ctrlKey ? 0.01 : 0.001;
      this.zoom = clampZoom(this.zoom * (1 + e.deltaY * k));
      this.#markDirty();
    }, { passive: false });
    el.addEventListener('dblclick', () => this.resetView());
  }

  // move the look-at point so the floor follows the cursor
  #panBy(dx, dy) {
    if (!this.height) return;
    const dist = this.camDist * this.zoom;
    const perPx = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * dist) / this.height;
    const elev = THREE.MathUtils.clamp((this.elev || 0.62) + this.tilt, ELEV_MIN, ELEV_MAX);
    const yaw = this.yaw;
    // screen-right and screen-up, flattened onto the floor (up is stretched by the viewing angle)
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    const upScale = 1 / Math.max(0.35, Math.sin(elev));
    this.pan.x += -rx * dx * perPx + fx * dy * perPx * upScale;
    this.pan.z += -rz * dx * perPx + fz * dy * perPx * upScale;
    this.#clampPan();
  }

  #clampPan() {
    this.pan.x = THREE.MathUtils.clamp(this.pan.x, -this.extent.x, this.extent.x);
    this.pan.z = THREE.MathUtils.clamp(this.pan.z, -this.extent.z, this.extent.z);
  }

  #pick(e) {
    const h = this.#hitTest(e.clientX, e.clientY);
    if (!h) return this.onSelect?.(null);
    if (h.personId) {
      const p = this.people.get(h.personId);
      return this.onSelect?.(h.personId, p.label.getBoundingClientRect());
    }
    // a desk or a meeting room opens the profile card of whoever is there
    if (h.kind === 'desk' || h.kind === 'room') {
      const who = this.#occupant(h);
      if (who) return this.onSelect?.(who.id, who.label.getBoundingClientRect());
      return this.onInteract?.(h.kind === 'room' ? 'room' : 'emptyDesk', { rect: this.#screenRect(h.target) });
    }
    this.#interact(h);
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.laidOut) this.#frameCamera();
  }

  #markDirty() {
    this.viewTarget = null;                       // a hand on the camera cancels any eased move
    if (!this.viewDirty) { this.viewDirty = true; this.onViewDirty?.(true); }
  }

  /** Reset view: ease the camera in on my own character (falls back to the whole office if I'm not here). */
  resetView() {
    const me = this.people.get(this.meId);
    if (me && this.target) {
      const dist = 4.0;                           // close enough to see the person, their desk and laptop
      this.viewTarget = {
        zoom: clampZoom(dist / (this.camDist || dist)), yaw: 0, tilt: 0,
        pan: new THREE.Vector3(me.pos.x - this.target.x, 0.35, me.pos.z - this.target.z),
        follow: me,
      };
    } else {
      this.viewTarget = { zoom: 1, yaw: 0, tilt: 0, pan: new THREE.Vector3(0, 0, 0) };
    }
    if (this.viewDirty) { this.viewDirty = false; this.onViewDirty?.(false); }
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    if (this.hover) this.#unhighlight(this.hover);
    this.hover = null;
    for (const p of [...this.people.values()]) this.#remove(p);
    for (const s of this.seats || []) this.#disposeSeat(s);
    for (const m of this.instanced || []) m.dispose();
    this.personBlobs.dispose();
    this.sky.dispose?.();
    const seen = new Set();
    this.scene.traverse(o => {
      if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
      for (const m of o.material ? [].concat(o.material) : []) if (!seen.has(m)) { seen.add(m); m.map?.dispose(); m.dispose(); }
    });
    for (const m of Object.values(this.M)) m.dispose?.();
    this.envTex?.dispose();
    disposeKit();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.remove();
  }
}

const YAW_MAX = 1.35;                 // ~77° either way
const ELEV_MIN = 0.18, ELEV_MAX = 1.4; // from almost eye-level to almost straight down
const ZOOM_MIN = 0.15, ZOOM_MAX = 2.4;
const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));

function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, k);
}

