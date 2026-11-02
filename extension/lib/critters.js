// Deskmate heroes — premium, high-poly stylised chibi superhero teammates.
//
// Eight ORIGINAL hero designs (armoured android, cosmic alien, speedster, guardian knight,
// hooded vigilante, fire elemental, ice hero, little robot sidekick) built only from generic
// genre tropes — masks, helmets, visors, capes, armour, emblems, powers — sculpted from smooth
// lathes / deformed spheres. Colours and markings are painted into vertex colours (no
// textures), so all heroes share a handful of materials and each rig node bakes down to one
// mesh per material. The person's colour tints each hero's accent (cape / emblem / stripe).
//
// Same API as createAvatar() in avatar.js: root / pose / activity / phase / opacity /
// setOpacity / hop / setHeadphones / update / dispose, plus ready + character.
// Proportions match avatar.js (hips at SIT_HIPS on the chair, same arm chain so the
// hands land on the laptop keyboard, head no taller than the kid's).
//
// Performance: one prototype per hero is built on first use and cloned per teammate.
// Clones share geometry + materials; the only per-instance resources are material
// clones made the first time a character fades (setOpacity < 1).
import { THREE, Spring, ease } from './toon.js';
import { mergeGeometries } from './BufferGeometryUtils.js';

const TAU = Math.PI * 2;
const V3 = THREE.Vector3;
export const HEAD_R = 0.27;
const NECK_Y = 0.48;        // hips → neck pivot
const HEAD_Y = 0.28;        // neck pivot → head centre
export const STAND_HIPS = 0.58;
export const SIT_HIPS = 0.47;
const SH_X = 0.2, SH_Y = 0.42;
const X_AXIS = new V3(1, 0, 0);

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const C = (h) => new THREE.Color(h);
const mixC = (a, b, t) => (t <= 0 ? a : t >= 1 ? b : a.clone().lerp(b, t));
const grey = (k) => new THREE.Color(k, k, k);   // vertex-colour multiplier for tinted fabric

// ------------------------------------------------------------------ geometry helpers
/** Recompute normals and average them across coincident vertices (hides lathe/sphere seams). */
function smoothNormals(g) {
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const groups = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
    const a = groups.get(k);
    if (a) a.push(i); else groups.set(k, [i]);
  }
  const v = new V3();
  for (const a of groups.values()) {
    if (a.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of a) { v.x += nor.getX(i); v.y += nor.getY(i); v.z += nor.getZ(i); }
    v.normalize();
    for (const i of a) nor.setXYZ(i, v.x, v.y, v.z);
  }
  nor.needsUpdate = true;
  return g;
}

function deform(g, fn, smooth = true) {
  const pos = g.attributes.position;
  const v = new V3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v, i);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  pos.needsUpdate = true;
  if (smooth) smoothNormals(g);
  g.computeBoundingSphere();
  return g;
}

/** Fill a colour attribute from a Color or fn(position, normal) → Color. */
function colorize(g, fn) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  const arr = new Float32Array(pos.count * 3);
  const p = new V3(), n = new V3();
  for (let i = 0; i < pos.count; i++) {
    let c = fn;
    if (typeof fn === 'function') { p.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i); c = fn(p, n); }
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

const sphere = (r, w = 40, h = 28, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
const ellip = (rx, ry, rz, w = 40, h = 28) => sphere(1, w, h).scale(rx, ry, rz);
const capsule = (r, len, cap = 8, radial = 20) => new THREE.CapsuleGeometry(r, len, cap, radial);

function lathe(pts, segs = 48, n = 48, smooth = true) {
  const curve = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y)));
  const P = curve.getPoints(n).map(v => new THREE.Vector2(Math.max(0, v.x), v.y));
  const g = new THREE.LatheGeometry(P, segs);
  if (smooth) smoothNormals(g);
  return g;
}

/** r(y) lookup along a lathe profile (for shells that hug a body). */
function profileR(pts) {
  const P = new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(200);
  return (y) => {
    for (let i = 1; i < P.length; i++) {
      const a = P[i - 1], b = P[i];
      if ((y >= a.y && y <= b.y) || (y <= a.y && y >= b.y)) return lerp(a.x, b.x, (y - a.y) / ((b.y - a.y) || 1));
    }
    return 0;
  };
}


// ------------------------------------------------------------------ materials (shared)
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const phys = (o) => new THREE.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, metalness: 0, ...o });
  MAT = {
    skin: phys({ roughness: 0.55, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffe2d0'), clearcoat: 0.06, clearcoatRoughness: 0.6 }),
    suit: phys({ roughness: 0.48, sheen: 0.6, sheenRoughness: 0.4, sheenColor: new THREE.Color('#e8eef6'), clearcoat: 0.25, clearcoatRoughness: 0.45 }),
    armor: phys({ roughness: 0.3, metalness: 0.22, clearcoat: 0.85, clearcoatRoughness: 0.14 }),
    gloss: phys({ roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    ice: phys({ roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, emissive: new THREE.Color('#4f8fbf'), emissiveIntensity: 0.28 }),
    glow: new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false }),
    mouth: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.55, metalness: 0 }),
    shine: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    fabric: phys({ roughness: 0.78, sheen: 1, sheenRoughness: 0.5 }),
  };
  for (const k of ['mouth', 'shine', 'glow']) MAT[k].userData.noShadow = true;
  return MAT;
}

const fabricCache = new Map();
/** Cape / emblem / stripe material tinted with the person's colour (cached per colour). */
function fabricFor(color) {
  const key = color.getHexString();
  if (!fabricCache.has(key)) {
    const m = mats().fabric.clone();
    m.color.copy(color);
    m.sheenColor = color.clone().lerp(new THREE.Color('#ffffff'), 0.45);
    fabricCache.set(key, m);
  }
  return fabricCache.get(key);
}

/** Soften very saturated colours (legacy neon picks) so they sit in the product palette. */
function accentColor(hex, fallback) {
  const c = new THREE.Color(fallback);
  if (typeof hex === 'string' && /^#?[0-9a-f]{6}$/i.test(hex.trim())) c.set(hex.trim().startsWith('#') ? hex.trim() : '#' + hex.trim());
  const hsl = {};
  c.getHSL(hsl, THREE.SRGBColorSpace);
  if (hsl.s > 0.58) c.setHSL(hsl.h, 0.58 + (hsl.s - 0.58) * 0.35, clamp(hsl.l, 0.32, 0.64), THREE.SRGBColorSpace);
  return c;
}

const eyeMats = new Map();
/**
 * Eyeball: a 1-D gradient wrapped from the front pole. Normal eyes: pupil → iris → limbal
 * ring → sclera, glossy. Glowing eyes (aliens / elementals): hot core → iris → dim rim, unlit.
 */
function eyeMat(iris, glow = false) {
  const key = iris + (glow ? ':glow' : '');
  if (eyeMats.has(key)) return eyeMats.get(key);
  let map = null;
  const I = new THREE.Color(iris);
  if (typeof document !== 'undefined') {
    const cv = document.createElement('canvas');
    cv.width = 4; cv.height = 256;
    const ctx = cv.getContext('2d');
    const at = (a) => a / Math.PI;
    const hex = (c) => '#' + c.getHexString();
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    if (glow) {
      g.addColorStop(0, '#ffffff');
      g.addColorStop(at(0.2), hex(I.clone().lerp(new THREE.Color('#ffffff'), 0.65)));
      g.addColorStop(at(0.55), hex(I));
      g.addColorStop(at(0.75), hex(I.clone().multiplyScalar(0.55)));
      g.addColorStop(1, hex(I.clone().multiplyScalar(0.25)));
    } else {
      g.addColorStop(0, '#050608');
      g.addColorStop(at(0.27), '#0a0b0e');
      g.addColorStop(at(0.31), hex(I.clone().multiplyScalar(0.55)));
      g.addColorStop(at(0.38), hex(I.clone().lerp(new THREE.Color('#ffffff'), 0.22)));
      g.addColorStop(at(0.56), hex(I));
      g.addColorStop(at(0.66), hex(I.clone().multiplyScalar(0.5)));
      g.addColorStop(at(0.7), '#231c18');
      g.addColorStop(at(0.74), '#f7f4ef');
      g.addColorStop(at(1.7), '#ece6de');
      g.addColorStop(1, '#cfc6bc');
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
    map = new THREE.CanvasTexture(cv);
    map.colorSpace = THREE.SRGBColorSpace;
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
  }
  const m = glow
    ? new THREE.MeshBasicMaterial({ color: map ? '#ffffff' : iris, map, toneMapped: false })
    : new THREE.MeshPhysicalMaterial({ color: map ? '#ffffff' : iris, map, roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
  m.userData.noShadow = true;
  eyeMats.set(key, m);
  return m;
}

// ------------------------------------------------------------------ shape helpers
/** Drop triangles whose centroid fails keep(c) — for hoods / open helmets. */
function keepTris(g, keep) {
  const idx = g.index.array, pos = g.attributes.position;
  const a = new V3(), b = new V3(), c = new V3();
  const out = [];
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(pos, idx[i]); b.fromBufferAttribute(pos, idx[i + 1]); c.fromBufferAttribute(pos, idx[i + 2]);
    if (keep(a.add(b).add(c).divideScalar(3))) out.push(idx[i], idx[i + 1], idx[i + 2]);
  }
  g.setIndex(out);
  return g;
}
/** Distance-to-edge of a hex grid (small near cell borders). */
function hexEdge(u, v, s) {
  const ax = u / s, ay = v / s, ry = 1.7320508;
  const m = (x, n) => x - n * Math.floor(x / n);
  const a1 = m(ax, 1) - 0.5, b1 = m(ay, ry) - ry / 2;
  const a2 = m(ax - 0.5, 1) - 0.5, b2 = m(ay - ry / 2, ry) - ry / 2;
  return Math.abs(Math.hypot(a1, b1) - Math.hypot(a2, b2));
}
/**
 * Cape / scarf panel: a thin closed slab hanging from y=0 down to -h, flaring from w0 to w1,
 * wrapped around the back (centre further back than the edges), with soft folds.
 */
function capeGeo(w0, w1, h, { wrap = 0.05, tatter = 0, folds = 0.006, thick = 0.012 } = {}) {
  const g = new THREE.BoxGeometry(1, 1, 1, 16, 12, 1);
  return deform(g, (v) => {
    const t = 0.5 - v.y;                       // 0 top … 1 bottom
    const w = lerp(w0, w1, t);
    const x = v.x * w;
    let y = -t * h;
    if (tatter) y -= tatter * Math.pow(t, 6) * (0.5 + 0.5 * Math.sin(v.x * 23));
    const z = v.z * thick - wrap * (1 - (2 * v.x) ** 2) + folds * Math.sin(v.x * 19) * (0.3 + t);
    v.set(x, y, z);
  });
}

// ------------------------------------------------------------------ heroes
// Head-space helpers (head centre at origin, before the head's own x/y stretch).
const blushAt = (u, x0 = 0.5, y0 = -0.32) =>
  Math.exp(-(((Math.abs(u.x) - x0) ** 2) / 0.022 + ((u.y - y0) ** 2) / 0.018)) * sm(0.0, 0.35, u.z);
const frontMask = (u, a = -0.25, b = 0.1) => sm(a, b, u.z);
const BLUSH = C('#E99A8E');

const BODY = {
  hero: [[0, -0.03], [0.15, -0.025], [0.192, 0.04], [0.186, 0.14], [0.2, 0.26], [0.214, 0.35], [0.198, 0.42], [0.13, 0.49], [0, 0.53]],
  bulk: [[0, -0.035], [0.16, -0.03], [0.205, 0.04], [0.2, 0.14], [0.216, 0.26], [0.232, 0.35], [0.214, 0.42], [0.14, 0.49], [0, 0.53]],
  slim: [[0, -0.03], [0.14, -0.025], [0.18, 0.04], [0.172, 0.14], [0.186, 0.26], [0.2, 0.35], [0.186, 0.42], [0.12, 0.49], [0, 0.53]],
  egg: [[0, -0.06], [0.15, -0.055], [0.212, 0.03], [0.232, 0.15], [0.224, 0.29], [0.19, 0.39], [0.13, 0.47], [0.05, 0.525], [0, 0.535]],
};
// generic limb painter: upper/fore/hand/thigh/shin/boot → palette keys
const limbPaint = (P, map) => (part) => P[map[part]] || P.suit;

// Every hero: palette, sculpt params, painters and a builder for the unique gear.
// Painters receive positions in the space of the rig node they are baked into.
const HEROES = {
  titan: {
    name: 'Titan', color: '#7FA3C8',
    pal: { plate: '#56708C', plate2: '#6F89A6', seam: '#2B3846', dark: '#252E3A', glow: '#B4DEFF', visor: '#0C141D', light: '#C4D2E0', suit: '#56708C' },
    face: 'visor', headMat: 'armor', head: { sx: 1.06, sy: 1.0, box: 0.5 }, body: 'bulk', bodyMat: 'armor', limbMat: 'armor',
    eyes: { x: 0.088, y: 0.004, shape: 'bar' }, mouthY: -0.15,
    paintHead(u, P) {
      let c = mixC(P.plate, P.plate2, sm(0.2, 0.7, u.y));
      c = mixC(c, P.seam, sm(0.035, 0.015, Math.abs(u.x)) * sm(0.3, 0.4, u.y));
      c = mixC(c, P.seam, sm(0.03, 0.012, Math.abs(u.y + 0.36)));
      const vent = sm(0.35, 0.12, Math.abs(Math.sin((u.y + 0.55) * 34))) * sm(0.24, 0.18, Math.abs(u.x)) * sm(-0.47, -0.52, u.y) * sm(-0.72, -0.66, u.y) * frontMask(u, 0.3, 0.5);
      return mixC(c, P.dark, vent);
    },
    paintBody(p, P) {
      let c = mixC(P.plate, P.plate2, p.z > 0 ? sm(1, 0.6, (p.x / 0.15) ** 2 + ((p.y - 0.34) / 0.12) ** 2) : 0);
      for (const y0 of [0.1, 0.17, 0.24]) c = mixC(c, P.seam, sm(0.012, 0.004, Math.abs(p.y - y0)) * sm(0.05, 0.12, p.z));
      return mixC(c, P.dark, sm(0.05, 0.03, Math.abs(p.y - 0.035)));
    },
    limb: (P) => (part, p) => {
      const base = { upper: P.plate2, fore: P.plate, hand: P.dark, thigh: P.plate, shin: P.plate2, boot: P.dark }[part];
      return mixC(base, P.seam, part === 'fore' || part === 'shin' ? sm(0.012, 0.004, Math.abs(p.y + 0.02)) : 0);
    },
    gear(x) {
      const { P, M, F, part, head, body, sh, hp } = x;
      // visor band over the eyes
      const R = HEAD_R * 1.045;
      const visor = deform(sphere(R, 48, 12, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.41, Math.PI * 0.18), (v) => { v.x *= hp.sx; });
      part(head, visor, M.gloss, { paint: P.visor });
      x.probe(visor);
      // audio fins + crest ridge
      for (const s of [-1, 1]) {
        part(head, ellip(0.03, 0.095, 0.115, 28, 20), M.armor, { p: [s * HEAD_R * hp.sx * 0.98, 0.02, -0.02], paint: P.plate2 });
        part(head, sphere(0.012, 12, 10), M.glow, { p: [s * (HEAD_R * hp.sx * 0.98 + 0.028), 0.03, 0.0], paint: P.glow });
      }
      part(head, ellip(0.032, 0.035, 0.2, 24, 18), M.armor, { p: [0, HEAD_R * 0.93, -0.03], r: [-0.25, 0, 0], paint: P.plate2 });
      // chunky shoulder pads
      for (const [s, n] of sh) part(n, deform(ellip(0.105, 0.075, 0.1, 32, 22), (v) => { if (v.y < 0) v.y *= 0.4; }), M.armor, { p: [s * 0.015, 0.035, 0], r: [0, 0, -s * 0.25], paint: (p) => mixC(P.plate2, P.seam, sm(0.008, 0.0, Math.abs(p.y - 0.035 - 0.01))) });
      // tinted chevron on the chest, thruster pack on the back
      const zc = x.bodyR(0.33) * 0.9 * 1.0;
      for (const s of [-1, 1]) part(body, capsule(0.022, 0.13, 6, 14), F, { p: [s * 0.055, 0.33, zc + 0.004], r: [0, 0, s * 0.85], s: [1, 1, 0.45], paint: grey(1) });
      part(body, ellip(0.12, 0.13, 0.06, 32, 22), M.armor, { p: [0, 0.3, -x.bodyR(0.3) * 0.9 - 0.02], paint: P.plate2 });
      for (const s of [-1, 1]) {
        part(body, new THREE.CylinderGeometry(0.03, 0.036, 0.05, 20), M.armor, { p: [s * 0.055, 0.17, -x.bodyR(0.3) * 0.9 - 0.03], paint: P.dark });
        part(body, new THREE.CircleGeometry(0.024, 18), M.glow, { p: [s * 0.055, 0.144, -x.bodyR(0.3) * 0.9 - 0.03], r: [Math.PI / 2, 0, 0], paint: P.glow });
      }
    },
  },
  nova: {
    name: 'Nova', color: '#8A76C4',
    pal: { skin: '#B6A2DA', skin2: '#A08BCB', mark: '#3FAEA3', suit: '#2C2E58', suit2: '#3B3F78', pipe: '#56C9BC', glove: '#22424C', glow: '#7FF2E2', brow: '#6F5C9C', lip: '#5A3C6E' },
    face: 'eyes', headMat: 'skin', head: { sx: 1.0, sy: 1.04, elong: 1 }, body: 'slim', bodyMat: 'suit', limbMat: 'suit',
    eyes: { r: 0.06, x: 0.1, y: 0.02, iris: '#5FE3D3', glow: true }, noNose: true,
    paintHead(u, P) {
      let c = mixC(P.skin, P.skin2, sm(0.2, 0.9, u.y) * 0.5);
      const line = Math.abs(Math.abs(u.x) - (0.45 - 0.28 * u.y));
      c = mixC(c, P.mark, sm(0.04, 0.02, line) * sm(0.05, 0.2, u.y) * sm(1.0, 0.75, u.y));
      c = mixC(c, P.mark, sm(0.08, 0.05, Math.hypot(u.x, u.y + 0.62)) * frontMask(u));
      return mixC(c, BLUSH, blushAt(u) * 0.2);
    },
    paintBody(p, P) {
      let c = mixC(P.suit, P.suit2, sm(0.2, 0.45, p.y) * (p.z > 0 ? 1 : 0.4));
      const a = Math.atan2(p.x, p.z);
      return mixC(c, P.pipe, sm(0.03, 0.012, Math.abs(Math.abs(a) - 0.75 + (p.y - 0.25) * 0.8)) * sm(0.02, 0.06, p.y) * sm(0.46, 0.4, p.y));
    },
    limb: (P) => (part, p) => {
      if (part === 'hand') return P.glove;
      if (part === 'boot') return P.suit;
      return mixC(part === 'upper' || part === 'thigh' ? P.suit2 : P.suit, P.pipe, sm(0.012, 0.004, Math.abs(p.x)) * sm(0.0, 0.05, p.z) * 0.8);
    },
    gear(x) {
      const { P, M, F, part, head, body, hips } = x;
      // glowing forehead crest + temple dots
      const cz = x.surf(0, 0.17);
      part(head, new THREE.OctahedronGeometry(1, 0), M.glow, { p: [0, 0.17, cz - 0.004], s: [0.026, 0.05, 0.012], paint: P.glow });
      for (const s of [-1, 1]) part(head, sphere(0.011, 12, 10), M.glow, { p: [s * 0.2, 0.1, x.surf(s * 0.2, 0.1) - 0.003], paint: P.glow });
      // high flared collar behind the head
      const collarPts = [[0.12, 0.43], [0.2, 0.62], [0.214, 0.62], [0.134, 0.43]].map(([r, y]) => new THREE.Vector2(r, y));
      part(body, new THREE.LatheGeometry(collarPts, 40, Math.PI * 0.42, Math.PI * 1.16), M.suit, { paint: P.suit2 });
      // starfield cape (tinted)
      x.cape({ w0: 0.3, w1: 0.42, h1: 0.3, h2: 0.32, wrap: 0.06, stand: [0.32, -0.14], walk: [0.5, 0.3],
        paint: (p) => grey((hash3(p) > 0.985 ? 1.9 : 1) * (0.72 + 0.28 * sm(0, -0.3, p.y))), mat: F });
    },
  },
  bolt: {
    name: 'Bolt', color: '#6E9E78',
    pal: { skin: '#E4B690', helm: '#ECE7DD', stripe: '#5E8A68', suit: '#E9E4DA', suit2: '#D4CEC2', panel: '#7E9F86', dark: '#2F3A33', lens: '#E3A64A', brow: '#6B4A35', glove: '#5E8A68' },
    face: 'eyes', headMat: 'skin', head: { sx: 1.04, sy: 0.98 }, body: 'slim', bodyMat: 'suit', limbMat: 'suit',
    eyes: { r: 0.054, x: 0.1, y: 0.03, iris: '#6A8F4C' },
    paintHead: (u, P) => mixC(P.skin, BLUSH, blushAt(u) * 0.35),
    paintBody(p, P) {
      const side = sm(0.12, 0.16, Math.abs(p.x)) * (p.z > -0.05 ? 1 : 0);
      return mixC(P.suit, P.panel, side);
    },
    limb: (P) => (part, p) => {
      if (part === 'hand') return P.glove;
      if (part === 'boot') return mixC(P.suit, P.dark, sm(-0.31, -0.33, p.y));
      return mixC(part === 'upper' || part === 'thigh' ? P.suit : P.suit2, P.stripe, sm(0.016, 0.008, Math.abs(p.x)) * sm(-0.02, 0.03, p.z));
    },
    gear(x) {
      const { P, M, F, part, head, body, hp, node } = x;
      const R = HEAD_R * 1.06;
      const helmPaint = (p) => mixC(P.helm, P.stripe, sm(0.04, 0.025, Math.abs(p.x)));
      const top = deform(sphere(R, 56, 18, 0, TAU, 0, Math.PI * 0.36), (v) => { v.x *= hp.sx; v.y *= hp.sy; });
      part(head, top, M.armor, { paint: helmPaint });
      const back = deform(keepTris(sphere(R, 56, 16, 0, TAU, Math.PI * 0.36, Math.PI * 0.26), (c) => c.z < R * 0.25), (v) => { v.x *= hp.sx; v.y *= hp.sy; });
      part(head, back, M.armor, { paint: helmPaint });
      const helmProbe = x.probe(top, {}, false);
      // swept fin
      const fin = deform(ellip(0.02, 0.07, 0.17, 24, 18), (v) => { const t = clamp((0.17 - v.z) / 0.34, 0, 1); v.y *= 0.5 + t; v.y += t * 0.03; });
      part(head, fin, M.armor, { p: [0, R * hp.sy * 0.96, -0.06], r: [0.15, 0, 0], paint: P.stripe });
      // goggles resting on the brim
      for (const s of [-1, 1]) {
        const gx = s * 0.085, gy = 0.175, gz = x.surf(gx, gy, [helmProbe]);
        const g = x.group(head, { p: [gx, gy, gz + 0.008], r: [-0.55, s * 0.32, 0] });
        part(g, new THREE.TorusGeometry(0.042, 0.011, 12, 36), M.armor, { paint: P.dark });
        part(g, ellip(0.038, 0.038, 0.012, 28, 14), M.armor, { paint: P.lens });
      }
      // springy side wings (use the "ear" springs)
      for (const s of [-1, 1]) {
        const e = node('ear' + (s < 0 ? 'L' : 'R'), head, s * R * hp.sx * 0.97, 0.05, -0.03);
        e.rotation.set(-1.2, s * 0.25, -s * 0.5);
        part(e, deform(ellip(0.016, 0.07, 0.035, 20, 16), (v) => { const t = clamp(v.y / 0.07, -1, 1); v.z += 0.02 * t * t; }), M.armor, { p: [0, 0.05, 0], paint: (p) => mixC(P.helm, P.stripe, sm(0.06, 0.1, p.y)) });
      }
      // tinted zig-zag across the chest
      const zz = [];
      for (let i = 0; i <= 6; i++) {
        const y = 0.42 - i * 0.055, xx = -0.12 + i * 0.04 + (i % 2 ? 0.05 : -0.02);
        const r = x.bodyR(y) * 1.0;
        zz.push(new V3(xx, y, Math.sqrt(Math.max(0, r * r - xx * xx)) * 0.9 + 0.006));
      }
      part(body, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(zz, false, 'catmullrom', 0.1), 60, 0.014, 8, false), F, { paint: grey(1) });
      // trailing speed-scarf (two strips) on the "cape" springs
      x.cape({ w0: 0.07, w1: 0.06, h1: 0.16, h2: 0.18, wrap: 0, folds: 0.004, double: 0.045, pos: [0, 0.47, -0.1],
        stand: [0.75, 0.35], walk: [1.0, 0.5], sitPos: [0, 0.63, -0.15], sit: [1.25, 0.15], mat: F, paint: (p) => grey(p.y < -0.13 ? 0.8 : 1) });
    },
  },
  aegis: {
    name: 'Aegis', color: '#C49A52',
    pal: { skin: '#C8936F', suit: '#33475F', hexl: '#4D6788', steel: '#DAD5CB', steel2: '#B9B3A7', dark: '#232F3E', brow: '#4A3326', lip: '#6E3B32' },
    face: 'eyes', headMat: 'skin', head: { sx: 1.06, sy: 0.98 }, body: 'bulk', bodyMat: 'suit', limbMat: 'armor',
    eyes: { r: 0.052, x: 0.1, y: 0.03, iris: '#4C7A5C' },
    paintHead: (u, P) => mixC(P.skin, BLUSH, blushAt(u) * 0.25),
    paintBody(p, P) {
      const a = Math.atan2(p.x, p.z) * 0.2;
      const c = mixC(P.suit, P.hexl, sm(0.07, 0.03, hexEdge(a / 0.2 * 0.19, p.y, 0.045)));
      return mixC(c, P.dark, sm(0.04, 0.025, Math.abs(p.y - 0.04)));
    },
    limb: (P) => (part, p) => {
      if (part === 'fore' || part === 'hand') return mixC(P.steel, P.steel2, sm(-0.1, -0.2, p.y));
      if (part === 'boot' || part === 'shin') return part === 'boot' ? P.steel2 : P.steel;
      return P.suit;
    },
    gear(x) {
      const { P, M, F, part, head, body, hp, group, sh, el } = x;
      // open-faced helm worn slightly back, brim, cheek guards
      const hg = group(head, { p: [0, 0.01, -0.012], r: [-0.3, 0, 0] });
      const R = HEAD_R * 1.07, th = Math.PI * 0.4;
      part(hg, deform(sphere(R, 56, 20, 0, TAU, 0, th), (v) => { v.x *= hp.sx; v.y *= hp.sy; }), M.armor, { paint: P.steel });
      part(hg, deform(new THREE.TorusGeometry(R * Math.sin(th), 0.016, 10, 72), (v) => { v.x *= hp.sx; }), M.armor, { p: [0, R * Math.cos(th) * hp.sy, 0], r: [Math.PI / 2, 0, 0], paint: P.steel2 });
      part(hg, deform(keepTris(sphere(R, 48, 14, 0, TAU, th, Math.PI * 0.28), (c) => c.z < -R * 0.1), (v) => { v.x *= hp.sx; v.y *= hp.sy; }), M.armor, { paint: P.steel2 });
      for (const s of [-1, 1]) part(head, ellip(0.035, 0.11, 0.09, 24, 18), M.armor, { p: [s * HEAD_R * hp.sx * 0.95, -0.05, 0.03], r: [0, s * 0.3, s * 0.12], paint: P.steel });
      // tinted crest plume arcing front → back
      const crest = deform(new THREE.TorusGeometry(0.21, 0.034, 12, 40, Math.PI * 0.62), (v) => { v.z *= 0.45; const a = Math.atan2(v.y, v.x); v.multiplyScalar(1 + 0.05 * Math.sin(a * 30) * 0.3); });
      part(head, crest, F, { p: [0, 0.11, -0.02], r: [0, Math.PI / 2, Math.PI * 0.19], paint: (p) => grey(0.85 + 0.15 * Math.sin(p.z * 160)) });
      // pauldrons + gauntlet flares
      for (const [s, n] of sh) part(n, deform(sphere(0.098, 32, 16, 0, TAU, 0, Math.PI * 0.55), (v) => { v.z *= 1.05; }), M.armor, { p: [s * 0.012, 0.01, 0], r: [0, 0, -s * 0.35], paint: (p) => mixC(P.steel, P.steel2, sm(0.0, -0.02, p.y)) });
      for (const n of el) part(n, new THREE.CylinderGeometry(0.072, 0.058, 0.08, 28, 1, true), M.armor, { p: [0, -0.15, 0], paint: P.steel2 });
      // round geometric emblem: ring + hexagon (tinted)
      const ez = x.bodyR(0.32) * 0.9 + 0.004;
      part(body, new THREE.TorusGeometry(0.058, 0.01, 10, 48), F, { p: [0, 0.32, ez], paint: grey(0.85) });
      part(body, new THREE.CylinderGeometry(0.04, 0.04, 0.012, 6), F, { p: [0, 0.32, ez], r: [Math.PI / 2, 0, 0], paint: grey(1.05) });
      x.cape({ w0: 0.32, w1: 0.4, h1: 0.28, h2: 0.26, wrap: 0.06, stand: [0.3, -0.12], walk: [0.45, 0.25], mat: F,
        paint: (p) => grey(Math.abs(p.x) > 0.17 || p.y < -0.22 ? 0.7 : 0.92) });
    },
  },
  shade: {
    name: 'Shade', color: '#A8463C',
    pal: { skin: '#D6A47E', mask: '#1B2331', suit: '#1F2A3A', suit2: '#2C3B50', hood: '#232F40', dark: '#141B26', brow: '#141B26', lip: '#6E3B32', cape: '#1A2230' },
    face: 'eyes', headMat: 'skin', head: { sx: 1.04, sy: 0.98 }, body: 'hero', bodyMat: 'suit', limbMat: 'suit',
    eyes: { r: 0.054, x: 0.1, y: 0.035, iris: '#8C9AA8' },
    paintHead(u, P) {
      const edge = 0.33 - 0.12 * Math.abs(u.x);
      const mask = sm(-0.16, -0.08, u.y - 0.08 * Math.abs(u.x)) * sm(edge + 0.04, edge, u.y) * frontMask(u, -0.1, 0.2);
      return mixC(mixC(P.skin, BLUSH, blushAt(u) * 0.25), P.mask, mask);
    },
    paintBody(p, P) {
      const c = mixC(P.suit, P.suit2, p.z > 0 ? sm(0.12, 0.06, Math.abs(p.x)) * sm(0.18, 0.28, p.y) : 0);
      return c;
    },
    limb: (P) => (part) => ({ upper: P.suit2, fore: P.suit, hand: P.dark, thigh: P.suit, shin: P.suit2, boot: P.dark }[part]),
    gear(x) {
      const { P, M, F, part, head, body, hp } = x;
      // hood with a peak, open at the face, falling into a cowl
      const R = HEAD_R * 1.12;
      const hood = keepTris(sphere(R, 56, 40), (c) => !(c.z > R * 0.32 && c.y < R * 0.55 && c.y > -R * 0.85));
      deform(hood, (v) => {
        const ny = v.y / R, nz = v.z / R;
        v.y += 0.05 * sm(0.55, 1, ny) * sm(-0.1, 0.5, nz);
        v.z += 0.03 * sm(0.55, 1, ny) * sm(-0.1, 0.5, nz);
        if (ny < -0.3) { const k = sm(-0.3, -1, ny); v.x *= 1 + 0.25 * k; v.z *= 1 + 0.15 * k; v.y -= 0.04 * k; }
        v.x *= hp.sx;
      });
      part(head, hood, M.suit, { paint: (p) => mixC(P.hood, P.dark, sm(R * 0.2, R * 0.4, p.z)) });
      // utility belt + pouches (tinted)
      const br = x.bodyR(0.06) * 1.0 + 0.006;
      part(body, new THREE.TorusGeometry(br, 0.02, 10, 64), F, { p: [0, 0.06, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1], paint: grey(0.8) });
      for (const a of [-1.2, -0.45, 0.45, 1.2]) part(body, ellip(0.03, 0.035, 0.018, 18, 12), F, { p: [Math.sin(a) * br, 0.06, Math.cos(a) * br * 0.9 + 0.012], r: [0, a, 0], paint: grey(1) });
      part(body, new THREE.CylinderGeometry(0.026, 0.026, 0.012, 24), M.armor, { p: [0, 0.06, br * 0.9 + 0.016], r: [Math.PI / 2, 0, 0], paint: C('#B9B3A7') });
      // short tattered cape
      x.cape({ w0: 0.3, w1: 0.38, h1: 0.24, h2: 0.22, wrap: 0.06, tatter: 0.05, stand: [0.3, -0.1], walk: [0.5, 0.3], mat: M.suit,
        paint: (p) => mixC(P.cape, P.suit2, sm(-0.02, 0.01, -p.z - 0.07) * 0.0 + (p.z > 0 ? 0.25 : 0)) });
    },
  },
  blaze: {
    name: 'Blaze', color: '#E07A3A',
    pal: { skin: '#BE7D5D', scalp: '#7A2E16', suit: '#C8642E', suit2: '#DA7A3C', plate: '#3A2C28', glow: '#FFB04A', brow: '#FF8A3A', lip: '#5A2A22', flameIn: '#FFE7A0', flameMid: '#FFB347', flameOut: '#F2622E' },
    face: 'eyes', headMat: 'skin', head: { sx: 1.04, sy: 0.98 }, body: 'hero', bodyMat: 'suit', limbMat: 'suit',
    eyes: { r: 0.056, x: 0.1, y: 0.03, iris: '#FFB347', glow: true }, browMat: 'glow',
    paintHead(u, P) {
      let c = mixC(P.skin, BLUSH, blushAt(u) * 0.2);
      return mixC(c, P.scalp, sm(0.38, 0.55, u.y + 0.25 * sm(0, -0.6, u.z)));
    },
    paintBody(p, P) {
      let c = mixC(P.suit, P.suit2, sm(0.25, 0.4, p.y));
      const plate = (p.z > 0 ? sm(0.1, 0.07, Math.abs(p.x)) * sm(0.04, 0.08, p.y) * sm(0.24, 0.2, p.y) : 0) + sm(0.16, 0.19, Math.abs(p.x)) * sm(0.02, 0.06, p.y) * sm(0.36, 0.3, p.y);
      c = mixC(c, P.plate, clamp(plate, 0, 1));
      for (const y0 of [0.1, 0.16]) c = mixC(c, P.suit, sm(0.008, 0.002, Math.abs(p.y - y0)) * (p.z > 0 ? 1 : 0));
      return c;
    },
    limb: (P) => (part, p) => {
      if (part === 'hand' || part === 'boot') return P.plate;
      return mixC(part === 'upper' || part === 'thigh' ? P.suit2 : P.suit, P.plate, part === 'upper' ? sm(-0.02, 0.02, p.y) : 0);
    },
    gear(x) {
      const { P, M, F, part, head, body, node } = x;
      // two layers of flame tongues (animated in step)
      const tongue = (r, h, curl) => deform(new THREE.ConeGeometry(r, h, 14, 8), (v) => {
        const t = clamp((v.y + h / 2) / h, 0, 1);
        v.z -= curl * t * t; v.x += 0.012 * Math.sin(t * 5);
      });
      const flamePaint = (inner) => (p) => {
        const t = clamp((p.y - 0.0) / 0.2, 0, 1);
        return inner ? mixC(P.flameIn, P.flameMid, t) : mixC(P.flameMid, P.flameOut, t);
      };
      for (const [nm, inner] of [['flameA', false], ['flameB', true]]) {
        const f = node(nm, head, 0, 0.13, -0.03);
        const n = inner ? 6 : 9;
        for (let i = 0; i < n; i++) {
          const a = (i / (n - 1) - 0.5) * (inner ? 2.0 : 2.8);
          const h = (inner ? 0.14 : 0.2) * (1 - Math.abs(a) * 0.18);
          const g = x.group(f, { p: [Math.sin(a) * 0.17, 0.05 + Math.cos(a) * 0.04, -0.02 - Math.abs(a) * 0.04], r: [-0.45, 0, -a * 0.45] });
          part(g, tongue(inner ? 0.045 : 0.06, h, 0.06), M.glow, { p: [0, h / 2, inner ? 0.02 : 0], paint: flamePaint(inner) });
        }
      }
      // tinted belt + chest strap
      part(body, new THREE.TorusGeometry(x.bodyR(0.05) + 0.006, 0.02, 10, 64), F, { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1], paint: grey(1) });
      part(body, new THREE.CylinderGeometry(0.022, 0.022, 0.012, 24), M.glow, { p: [0, 0.05, (x.bodyR(0.05) + 0.006) * 0.9 + 0.018], r: [Math.PI / 2, 0, 0], paint: P.glow });
      for (const s of [-1, 1]) part(body, capsule(0.016, 0.2, 6, 12), F, { p: [s * 0.07, 0.31, x.bodyR(0.31) * 0.9 + 0.004], r: [-0.2, 0, s * 0.42], s: [1, 1, 0.5], paint: grey(0.9) });
    },
  },
  frost: {
    name: 'Frost', color: '#5FB0C8',
    pal: { skin: '#E8DAD0', hair: '#E3EBF3', hair2: '#B8C9DB', suit: '#A9C6DD', suit2: '#EEF3F7', line: '#7FA6C6', ice: '#D7F0FF', ice2: '#9FD4F2', brow: '#9AAFC4', lip: '#9A5E66', glove: '#EEF3F7' },
    face: 'eyes', headMat: 'skin', head: { sx: 1.04, sy: 0.98 }, body: 'slim', bodyMat: 'suit', limbMat: 'suit',
    eyes: { r: 0.056, x: 0.1, y: 0.03, iris: '#6FC3E6' },
    paintHead: (u, P) => mixC(mixC(P.skin, C('#F2B5B5'), blushAt(u) * 0.35), P.hair, sm(0.42, 0.52, u.y + 0.3 * sm(0, -0.8, u.z))),
    paintBody(p, P) {
      let c = mixC(P.suit, P.suit2, p.z > 0 ? sm(0.02, 0.0, Math.abs(Math.abs(p.x) * 1.4 - (0.42 - p.y) * 0.6) - 0.03) : 0);
      return mixC(c, P.line, sm(0.01, 0.003, Math.abs(p.y - 0.045)));
    },
    limb: (P) => (part, p) => (part === 'hand' || part === 'boot' ? P.glove : mixC(P.suit, P.suit2, sm(0.012, 0.004, Math.abs(p.x)) * 0.6)),
    gear(x) {
      const { P, M, F, part, head, body, hp, sh, group } = x;
      // swept silver hair cap with spiky back points
      const R = HEAD_R * 1.05;
      const hair = deform(sphere(R, 56, 24, 0, TAU, 0, Math.PI * 0.5), (v) => {
        const a = Math.atan2(v.x, v.z), back = sm(0.2, -0.6, v.z / R), lowEdge = sm(R * 0.35, 0, v.y);
        v.y -= lowEdge * back * 0.06 * (0.6 + 0.4 * Math.cos(a * 9));
        v.z -= back * 0.03;
        v.x *= hp.sx; v.y *= hp.sy;
      });
      part(head, hair, M.skin, { p: [0, 0.012, -0.02], r: [-0.42, 0, 0], paint: (p) => mixC(P.hair, P.hair2, sm(0.6, 0.0, Math.sin(Math.atan2(p.x, p.z) * 14) * 0.5 + 0.5) * 0.5) });
      // crystal crown
      const shard = new THREE.OctahedronGeometry(1, 0);
      const crown = group(head, { p: [0, 0.17, 0.05], r: [-0.35, 0, 0] });
      for (let i = 0; i < 5; i++) {
        const a = (i - 2) * 0.32, h = 0.07 - Math.abs(i - 2) * 0.012;
        part(crown, shard, M.ice, { p: [Math.sin(a) * 0.2, Math.cos(a) * 0.05 + h * 0.6, Math.cos(a) * 0.08 - 0.08], r: [0, 0, -a * 0.7], s: [0.022, h, 0.022], paint: (p) => mixC(P.ice2, P.ice, sm(0, 0.08, p.y)) });
      }
      // shoulder shard clusters + tinted sash
      for (const [s, n] of sh) {
        for (let i = 0; i < 3; i++) {
          part(n, shard, M.ice, { p: [s * (0.02 + i * 0.025), 0.06 + (i === 1 ? 0.02 : 0), -0.02 + i * 0.02], r: [i * 0.4 - 0.4, 0, -s * (0.3 + i * 0.25)], s: [0.022, 0.065 - i * 0.012, 0.022], paint: P.ice2 });
        }
      }
      part(body, new THREE.TorusGeometry(0.205, 0.02, 10, 72), F, { p: [0, 0.27, 0], r: [Math.PI / 2, 0.42, 0], s: [1, 0.9, 1], paint: grey(1) });
      part(body, new THREE.TorusGeometry(x.bodyR(0.05) + 0.006, 0.016, 10, 64), F, { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.9, 1], paint: grey(0.85) });
    },
  },
  gizmo: {
    name: 'Gizmo', color: '#E0AE45',
    pal: { shell: '#ECE7DD', shell2: '#D6D0C4', joint: '#455B70', screen: '#0F151C', glow: '#7FF0CF', dark: '#2A3442', suit: '#ECE7DD' },
    face: 'screen', headMat: 'armor', head: { sx: 1.05, sy: 0.95 }, body: 'egg', bodyMat: 'armor', limbMat: 'armor',
    eyes: { x: 0.085, y: 0.0, shape: 'round' }, mouthY: -0.1,
    paintHead(u, P) {
      let c = mixC(P.shell, P.shell2, sm(-0.2, -0.7, u.y));
      return mixC(c, P.joint, sm(0.02, 0.008, Math.abs(u.y + 0.62)));
    },
    paintBody(p, P) {
      let c = mixC(P.shell, P.shell2, sm(0.15, -0.02, p.y));
      return mixC(c, P.joint, sm(0.012, 0.004, Math.abs(p.y - 0.42)));
    },
    limb: (P) => (part, p) => {
      if (part === 'hand' || part === 'boot') return P.joint;
      return mixC(P.shell, P.joint, sm(0.02, 0.0, Math.abs(p.y)) + (part === 'fore' || part === 'shin' ? sm(0.015, 0.0, Math.abs(p.y + 0.01)) : 0));
    },
    gear(x) {
      const { P, M, F, part, head, body, node, hp } = x;
      // dark screen face
      const R = HEAD_R * 1.012;
      const screen = deform(sphere(R, 48, 24, Math.PI / 2 - 0.85, 1.7, Math.PI * 0.3, Math.PI * 0.4), (v) => { v.x *= hp.sx; v.y *= hp.sy; });
      part(head, screen, M.gloss, { paint: P.screen });
      x.probe(screen);
      // ear discs
      for (const s of [-1, 1]) {
        part(head, new THREE.CylinderGeometry(0.055, 0.055, 0.035, 32), M.armor, { p: [s * HEAD_R * hp.sx, 0, 0], r: [0, 0, Math.PI / 2], paint: P.joint });
        part(head, new THREE.TorusGeometry(0.035, 0.007, 8, 28), M.glow, { p: [s * (HEAD_R * hp.sx + 0.019), 0, 0], r: [0, Math.PI / 2, 0], paint: P.glow });
      }
      // springy antenna (uses an "ear" spring)
      const ant = node('earR', head, 0.07, HEAD_R * hp.sy * 0.95, -0.02);
      ant.rotation.set(-0.15, 0, -0.25);
      part(ant, capsule(0.008, 0.12, 4, 10), M.armor, { p: [0, 0.06, 0], paint: P.joint });
      part(ant, sphere(0.022, 18, 14), M.glow, { p: [0, 0.135, 0], paint: P.glow });
      // tinted chest panel, glow buttons, jetpack
      const zc = x.bodyR(0.25) * 0.9;
      part(body, ellip(0.1, 0.085, 0.03, 32, 20), F, { p: [0, 0.25, zc - 0.006], paint: grey(1) });
      for (const [bx, col] of [[-0.04, P.glow], [0, '#FFD27A'], [0.04, '#FF8A7A']]) part(body, sphere(0.011, 12, 10), M.glow, { p: [bx, 0.25, zc + 0.022], paint: C(col) });
      const zb = -x.bodyR(0.28) * 0.9;
      for (const s of [-1, 1]) {
        part(body, capsule(0.045, 0.16, 8, 20), M.armor, { p: [s * 0.06, 0.28, zb - 0.03], paint: (p) => mixC(C(P.joint), C(P.joint).multiplyScalar(0.7), sm(0.33, 0.37, p.y)) });
        part(body, capsule(0.047, 0.03, 4, 20), F, { p: [s * 0.06, 0.31, zb - 0.03], paint: grey(1) });
        part(body, new THREE.ConeGeometry(0.035, 0.05, 20, 1, true), M.armor, { p: [s * 0.06, 0.155, zb - 0.03], paint: P.dark });
        part(body, new THREE.CircleGeometry(0.03, 18), M.glow, { p: [s * 0.06, 0.135, zb - 0.03], r: [Math.PI / 2, 0, 0], paint: C('#9FE8FF') });
      }
    },
  },
};
const hash3 = (p) => { const s = Math.sin(p.x * 127.1 + p.y * 311.7 + p.z * 74.7) * 43758.5453; return s - Math.floor(s); };

export const SPECIES_IDS = ['titan', 'nova', 'bolt', 'aegis', 'shade', 'blaze', 'frost', 'gizmo'];
const SPECIES = HEROES;
for (const id of SPECIES_IDS) {
  const sp = HEROES[id];
  sp.id = id;
  sp.P = Object.fromEntries(Object.entries(sp.pal).map(([k, v]) => [k, C(v)]));
}
/** [{ id, name, color }] — the roster shown in setup. */
export const SPECIES_LIST = SPECIES_IDS.map(id => ({ id, name: HEROES[id].name, color: HEROES[id].color }));

/** Hero for a saved avatar.model. Unknown / legacy ids map deterministically from the seed. */
export function speciesFor(model, seed = '') {
  const m = String(model ?? '').toLowerCase().trim();
  if (HEROES[m]) return m;
  const key = String(seed || m || 'deskmate');
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return SPECIES_IDS[h % SPECIES_IDS.length];
}

// ------------------------------------------------------------------ prototype builder
const protos = new Map();

function buildProto(id) {
  const sp = HEROES[id];
  const P = sp.P;
  const M = mats();
  const F = M.fabric;
  const root = new THREE.Group();
  root.name = 'hero';
  const node = (name, parent, x = 0, y = 0, z = 0) => {
    const g = new THREE.Group();
    g.name = name; g.userData.node = true;
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const group = (parent, o = {}) => {
    const g = new THREE.Group();
    if (o.p) g.position.set(...o.p);
    if (o.r) g.rotation.set(...o.r);
    if (o.s) g.scale.set(...o.s);
    parent.add(g);
    return g;
  };
  // paint: Color | fn(p, n) in node space | undefined (geometry already has colours / none needed)
  const part = (parent, geo, mat, o = {}) => {
    const m = new THREE.Mesh(geo, mat);
    if (o.p) m.position.set(...o.p);
    if (o.r) m.rotation.set(...o.r);
    if (o.s) m.scale.set(...o.s);
    m.userData.paint = typeof o.paint === 'string' ? C(o.paint) : o.paint;
    parent.add(m);
    return m;
  };
  const headM = M[sp.headMat], bodyM = M[sp.bodyMat], limbM = M[sp.limbMat];
  const limbC = sp.limb(P);

  // ================= rig
  const rig = node('rig', root);
  const hips = node('hips', rig, 0, SIT_HIPS, 0);
  const body = node('body', hips);
  const headG = node('headG', hips, 0, NECK_Y, 0);
  const head = node('head', headG, 0, HEAD_Y, 0);

  // ================= body
  const prof = BODY[sp.body];
  const bodyR = profileR(prof);
  const torsoGeo = deform(lathe(prof, 48, 36, false), (v) => {
    const r = Math.hypot(v.x, v.z);
    if (r < 1e-5) { v.z *= 0.9; return; }
    let k = 1;
    if (v.z > 0) k += 0.05 * Math.exp(-(((v.y - 0.33) / 0.1) ** 2)) * (v.z / r);   // chest
    v.x *= k; v.z *= k * 0.9;
  });
  part(body, torsoGeo, bodyM, { paint: (p) => sp.paintBody(p, P) });
  // neck
  part(body, capsule(0.07, 0.06), headM === M.skin ? M.skin : limbM, { p: [0, NECK_Y + 0.03, 0], paint: headM === M.skin ? sp.paintHead({ x: 0, y: -0.9, z: 0.3 }, P) : (P.joint || P.seam || P.suit) });

  // ================= head
  const H = sp.head;
  const headGeo = deform(sphere(HEAD_R, 60, 44), (v) => {
    const nx = v.x / HEAD_R, ny = v.y / HEAD_R, nz = v.z / HEAD_R;
    if (H.box) {   // rounded-box helmet
      const f = 1 / Math.pow(Math.abs(nx) ** 3 + Math.abs(ny) ** 3 + Math.abs(nz) ** 3, 1 / 3);
      v.multiplyScalar(lerp(1, f * 0.93, H.box));
    }
    let x = v.x * H.sx, y = v.y * H.sy, z = v.z;
    if (!H.box) {
      // Realistic proportions: a longer, narrower skull with a defined jaw, cheekbones,
      // brow ridge and a chin — not a ball. (Helmet/screen heads keep their boxy shape.)
      const front = sm(-0.2, 0.6, nz);                          // 0 at the back → 1 on the face
      const jaw = sm(0.05, -0.85, ny);                          // 0 at the cranium → 1 at the chin
      x *= 0.95 * (1 - 0.2 * jaw * jaw - 0.07 * jaw);          // taper the lower face to the jaw
      y *= 1.04;
      if (ny < -0.1) y -= HEAD_R * 0.05 * sm(-0.1, -0.8, ny);   // lengthen the lower face
      z *= 0.96 + 0.04 * (1 - jaw);
      z += HEAD_R * 0.10 * Math.exp(-(((ny + 0.82) / 0.2) ** 2)) * front * (1 - 0.6 * Math.abs(nx));  // chin
      x *= 1 + 0.07 * Math.exp(-(((ny + 0.12) / 0.2) ** 2)) * front;                                   // cheekbones
      z += HEAD_R * 0.05 * Math.exp(-(((ny - 0.3) / 0.14) ** 2)) * front * (1 - 0.5 * Math.abs(nx));   // brow ridge
      z -= HEAD_R * 0.035 * Math.exp(-((Math.abs(nx) - 0.55) ** 2 / 0.05 + ((ny + 0.35) / 0.25) ** 2)) * front; // hollow under cheekbone
      if (z < 0) z *= 0.95;
    }
    if (H.elong) {   // swept-back alien cranium
      const k = sm(-0.1, 0.9, ny) * sm(0.4, -0.7, nz);
      y += 0.075 * k; z -= 0.06 * k;
    }
    v.set(x, y, z);
  });
  const uOf = (p) => ({ x: p.x / (HEAD_R * H.sx), y: p.y / (HEAD_R * H.sy), z: p.z / HEAD_R });
  part(head, headGeo, headM, { paint: (p) => sp.paintHead(uOf(p), P) });

  // raycast helpers: where is the face surface at (x, y)?
  const probes = [new THREE.Mesh(headGeo)];
  const ray = new THREE.Raycaster();
  const surf = (x, y, list = probes.slice(0, 1)) => {
    ray.set(new V3(x, y, 1), new V3(0, 0, -1));
    for (const m of list) m.updateMatrixWorld(true);
    const hit = ray.intersectObjects(list, false)[0];
    return hit ? hit.point.z : HEAD_R * 0.9;
  };
  const probe = (geo, o = {}, face = true) => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    if (o.p) m.position.set(...o.p); if (o.r) m.rotation.set(...o.r); if (o.s) m.scale.set(...o.s);
    if (face) probes.push(m);
    return m;
  };
  const faceZ = (x, y) => surf(x, y, probes);

  // ================= arms (built before gear so gear can add pads / shards)
  const sh = [], el = [];
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const shN = node('shoulder' + tag, hips, s * SH_X, SH_Y, 0);
    const elN = node('elbow' + tag, shN, 0, -0.2, 0);
    node('hand' + tag, elN, 0, -0.215, 0);
    sh.push([s, shN]); el.push(elN);
    const up = (p, n) => limbC('upper', p, n), fore = (p, n) => limbC(p.y < -0.17 ? 'hand' : 'fore', p, n);
    part(shN, sphere(0.066, 24, 18), limbM, { paint: up });
    part(shN, capsule(0.058, 0.12), limbM, { p: [0, -0.1, 0], paint: up });
    part(elN, capsule(0.054, 0.1), limbM, { p: [0, -0.085, 0], paint: fore });
    part(elN, new THREE.TorusGeometry(0.056, 0.014, 10, 32), limbM, { p: [0, -0.165, 0], r: [Math.PI / 2, 0, 0], paint: (p, n) => limbC('hand', p, n) });
    part(elN, ellip(0.056, 0.06, 0.047, 32, 24), limbM, { p: [0, -0.212, 0.004], paint: fore });
    for (const dx of [-0.024, 0, 0.024]) part(elN, capsule(0.017, 0.028, 4, 12), limbM, { p: [dx, -0.258, 0.008 - Math.abs(dx) * 0.15], paint: fore });
    part(elN, capsule(0.018, 0.022, 6, 14), limbM, { p: [-s * 0.046, -0.2, 0.02], r: [0.4, 0, -s * 0.6], paint: fore });
  }

  // ================= legs
  for (const s of [-1, 1]) {
    const tag = s < 0 ? 'L' : 'R';
    const th = node('thigh' + tag, hips, s * 0.1, 0.03, 0);
    const kn = node('knee' + tag, th, 0, -0.25, 0);
    part(th, capsule(0.086, 0.12), limbM, { p: [0, -0.12, 0], paint: (p, n) => limbC('thigh', p, n) });
    const low = (p, n) => limbC(p.y < -0.17 ? 'boot' : 'shin', p, n);
    part(kn, capsule(0.072, 0.11), limbM, { p: [0, -0.1, 0], paint: low });
    part(kn, new THREE.TorusGeometry(0.073, 0.017, 10, 32), limbM, { p: [0, -0.175, 0], r: [Math.PI / 2, 0, 0], paint: (p, n) => limbC('boot', p, n) });
    const boot = deform(ellip(0.076, 0.062, 0.118, 32, 22), (v) => { if (v.y < 0) v.y *= 0.5; });
    part(kn, boot, limbM, { p: [0, -0.29, 0.035], paint: (p, n) => mixC(limbC('boot', p, n), C('#1d232c'), sm(-0.55, -0.85, n.y) * 0.7) });
  }

  // ================= hero gear
  let capeCfg = null;
  const ctx = {
    P, M, F, part, node, group, head, body, hips, hp: H, sh, el, bodyR, surf, probe, faceZ,
    cape(o) {
      const pos = o.pos || [0, 0.46, -0.16];
      const A = node('capeA', hips, ...pos);
      const B = node('capeB', A, 0, -o.h1 + 0.015, 0);
      const mat = o.mat || F;
      const wMid = o.w0 + (o.w1 - o.w0) * (o.h1 / (o.h1 + o.h2));
      const strips = o.double ? [-o.double, o.double] : [0];
      for (const dx of strips) {
        part(A, capeGeo(o.w0, wMid, o.h1, { wrap: o.wrap, folds: o.folds ?? 0.006 }), mat, { p: [dx, 0, 0], r: [0, 0, dx * 2], paint: o.paint });
        part(B, capeGeo(wMid, o.w1, o.h2 + 0.015, { wrap: o.wrap, tatter: o.tatter, folds: o.folds ?? 0.006 }), mat, { p: [dx * 1.4, 0.015, 0], r: [0, 0, dx * 3], paint: o.paint ? (p) => o.paint(new V3(p.x, p.y - o.h1, p.z)) : undefined });
      }
      capeCfg = { stand: o.stand, walk: o.walk || [0.5, 0.3], sit: o.sit || [0.05, 0.0], sitPos: o.sitPos || [0, 0.58, -0.27], pos };
    },
  };
  sp.gear(ctx);

  // ================= face
  const E = sp.eyes;
  const glowFace = sp.face !== 'eyes';
  if (!glowFace) {
    const eyeM = eyeMat(E.iris, !!E.glow);
    const lidCol = (s) => sp.paintHead(uOf(new V3(s * E.x, E.y + E.r * 0.8, surf(s * E.x, E.y + E.r * 0.8))), P);
    for (const s of [-1, 1]) {
      const tag = s < 0 ? 'L' : 'R';
      const ez = surf(s * E.x, E.y) - E.r * 0.72 * 0.42;
      const eg = group(head, { p: [s * E.x, E.y, ez], r: [0, s * 0.28, 0], s: [0.82, 0.88, 0.66] });
      const ball = node('eye' + tag, eg);
      ball.rotation.y = -s * 0.2;
      part(ball, sphere(E.r, 40, 28).rotateX(Math.PI / 2), eyeM);
      if (!E.glow) {
        part(eg, ellip(0.2 * E.r, 0.2 * E.r, 0.08 * E.r, 16, 12), M.shine, { p: [0.36 * E.r, 0.42 * E.r, 0.84 * E.r] });
        part(eg, ellip(0.1 * E.r, 0.1 * E.r, 0.05 * E.r, 12, 10), M.shine, { p: [-0.3 * E.r, -0.38 * E.r, 0.88 * E.r] });
      }
      const lid = node('lid' + tag, eg);
      const lc = lidCol(s), lash = mixC(P.brow, C('#120e0c'), 0.6);
      part(lid, sphere(E.r * 1.09, 36, 14, 0, TAU, 0, Math.PI / 2), M.skin, { paint: (p) => mixC(lc, lash, sm(E.r * 0.22, E.r * 0.06, p.y)) });
    }
    for (const s of [-1, 1]) {
      const by = E.y + E.r + 0.032;
      const bg = node('brow' + (s < 0 ? 'L' : 'R'), head, s * E.x, by, surf(s * E.x, by) - 0.005);
      bg.rotation.set(-0.35, s * 0.3, 0);
      part(bg, new THREE.TorusGeometry(0.07, 0.012, 10, 28, 0.7), sp.browMat ? M[sp.browMat] : M.skin,
        { p: [0, -0.063, 0], r: [0, 0, Math.PI / 2 - 0.35], s: [1, 1, 0.6], paint: P.brow });
    }
    if (!sp.noNose) {
      const ny = -0.055, nz = surf(0, ny);
      part(head, ellip(0.03, 0.028, 0.028, 24, 18), M.skin, { p: [0, ny, nz - 0.008], paint: sp.paintHead({ x: 0, y: -0.2, z: 1 }, P) });
    }
    const my = -0.135, mz = surf(0, my);
    const mouth = node('mouth', head, 0, my, mz - 0.003);
    mouth.rotation.x = 0.4;
    const smile = node('smile', mouth);
    part(smile, new THREE.TorusGeometry(0.034, 0.0062, 8, 28, Math.PI * 0.7), M.mouth, { r: [0, 0, Math.PI + Math.PI * 0.15], p: [0, 0.02, 0], paint: P.lip || C('#5A2E2A') });
    const open = node('open', mouth);
    part(open, ellip(0.036, 0.03, 0.014, 32, 22), M.mouth, { p: [0, -0.006, 0], paint: (p) => mixC(mixC(C('#431A20'), C('#E28895'), sm(-0.012, -0.024, p.y) * sm(0.0, 0.01, p.z)), C('#FBF8F2'), sm(0.014, 0.02, p.y) * sm(0.004, 0.01, p.z)) });
  } else {
    // visor / screen face: glowing eye shapes that blink by squashing
    const glow = P.glow;
    const gp = (p) => mixC(glow, C('#ffffff'), sm(0.012, 0.0, Math.hypot(p.x * 0.6, p.y)) * 0.5);
    for (const s of [-1, 1]) {
      const tag = s < 0 ? 'L' : 'R';
      const ex = s * E.x, ey = E.y, ez = faceZ(ex, ey) + 0.002;
      const n = node('eye' + tag, head, ex, ey, ez);
      n.rotation.y = s * 0.3;
      n.userData.screen = true;
      if (E.shape === 'bar') part(n, capsule(0.016, 0.036, 6, 14), M.glow, { r: [0, 0, Math.PI / 2], s: [1, 1, 0.3], paint: gp });
      else part(n, ellip(0.03, 0.04, 0.008, 28, 16), M.glow, { paint: gp });
      const by = ey + (E.shape === 'bar' ? 0.036 : 0.062);
      const b = node('brow' + tag, head, ex, by, faceZ(ex, by) + 0.002);
      b.rotation.set(0, s * 0.3, 0);
      part(b, capsule(0.006, 0.03, 4, 8), M.glow, { r: [0, 0, Math.PI / 2], s: [1, 1, 0.4], paint: glow.clone().multiplyScalar(0.8) });
    }
    const my = sp.mouthY ?? -0.12, mz = faceZ(0, my);
    const mouth = node('mouth', head, 0, my, mz + 0.002);
    const smile = node('smile', mouth);
    part(smile, new THREE.TorusGeometry(0.03, 0.006, 8, 28, Math.PI * 0.7), M.glow, { r: [0, 0, Math.PI + Math.PI * 0.15], p: [0, 0.018, 0], s: [1, 1, 0.4], paint: glow });
    const open = node('open', mouth);
    part(open, ellip(0.032, 0.026, 0.006, 28, 16), M.glow, { paint: (p) => mixC(glow, C('#ffffff'), sm(0.01, 0.0, Math.abs(p.y)) * 0.4) });
  }

  // ================= headphones (focus / calls)
  const phones = node('phones', head);
  const bandR = HEAD_R * H.sx + 0.045;
  const gear = C('#2A2F38');
  part(phones, new THREE.TorusGeometry(bandR, 0.019, 12, 64, Math.PI), M.gloss, { r: [-0.28, 0, 0], s: [1, (HEAD_R * H.sy + 0.07) / bandR, 1], paint: gear });
  for (const s of [-1, 1]) {
    part(phones, new THREE.CylinderGeometry(0.074, 0.074, 0.06, 40), M.gloss, { p: [s * bandR, 0, 0], r: [0, 0, Math.PI / 2], paint: gear });
    part(phones, new THREE.TorusGeometry(0.058, 0.02, 12, 32), F, { p: [s * (bandR - 0.033), 0, 0], r: [0, Math.PI / 2, 0], paint: grey(1) });
  }
  const mic = node('mic', phones);
  const mouthY = root.getObjectByName('mouth').position.y;
  const mz0 = faceZ(0, mouthY) + 0.02;
  const boom = new THREE.QuadraticBezierCurve3(new V3(bandR + 0.01, -0.03, 0.02), new V3(bandR - 0.02, -0.13, mz0 * 0.6), new V3(0.1, mouthY - 0.03, mz0));
  part(mic, new THREE.TubeGeometry(boom, 20, 0.008, 8, false), M.gloss, { paint: gear });
  part(mic, sphere(0.02, 20, 14), F, { p: [0.1, mouthY - 0.03, mz0], paint: grey(0.9) });
  phones.visible = false;

  // ================= props (in the right hand; holders are kept upright each frame)
  const handR = root.getObjectByName('handR');
  const cupH = node('cupH', handR);
  const cup = node('cup', cupH, -0.045, -0.055, 0.05);
  const cupPts = [[0, 0], [0.03, 0], [0.034, 0.004], [0.04, 0.078], [0.043, 0.084], [0.039, 0.086], [0.035, 0.014], [0, 0.014]].map(([r, y]) => new THREE.Vector2(r, y));
  const ivory = C('#EFE8DC'), sage = C('#A5BBA9');
  part(cup, new THREE.LatheGeometry(cupPts, 40), M.gloss, { paint: (p) => (Math.hypot(p.x, p.z) > 0.036 && p.y > 0.03 && p.y < 0.05 ? sage : ivory) });
  part(cup, new THREE.CircleGeometry(0.036, 32), M.gloss, { p: [0, 0.07, 0], r: [-Math.PI / 2, 0, 0], paint: C('#5E3F2B') });
  part(cup, new THREE.TorusGeometry(0.021, 0.0065, 10, 24, Math.PI * 1.2), M.gloss, { p: [-0.04, 0.046, 0], r: [0, 0, Math.PI - Math.PI * 0.6], paint: ivory });
  cupH.visible = false;

  const bowlH = node('bowlH', handR);
  const bowl = node('bowl', bowlH, -0.015, -0.03, 0.075);
  part(bowl, sphere(0.085, 40, 18, 0, TAU, Math.PI / 2, Math.PI / 2), M.gloss, { paint: C('#8DA8C2') });
  part(bowl, new THREE.TorusGeometry(0.084, 0.009, 10, 48), M.gloss, { r: [Math.PI / 2, 0, 0], paint: ivory });
  part(bowl, new THREE.CircleGeometry(0.078, 32), M.gloss, { p: [0, -0.012, 0], r: [-Math.PI / 2, 0, 0], paint: C('#EBC67A') });
  part(bowl, sphere(0.024, 16, 12), M.gloss, { p: [0.03, -0.006, 0.01], s: [1, 0.45, 0.8], paint: C('#FBF7EF') });
  part(bowl, new THREE.CircleGeometry(0.011, 16), M.gloss, { p: [0.03, 0.0045, 0.01], r: [-Math.PI / 2, 0, 0], paint: C('#F2B640') });
  for (let i = 0; i < 6; i++) part(bowl, sphere(0.007, 8, 6), M.gloss, { p: [Math.cos(i * 2.3) * 0.045 - 0.01, -0.009, Math.sin(i * 2.3) * 0.045], paint: C('#7FA37A') });
  for (const s of [-1, 1]) part(bowl, capsule(0.0055, 0.22, 4, 8), M.gloss, { p: [0.02 * s, 0.08, -0.01], r: [-0.3, 0, -0.3 + s * 0.06], paint: C('#B98B64') });
  bowlH.visible = false;

  // drop hidden helper meshes, then bake each rig node → one mesh per material
  bake(root);
  return { root, cape: capeCfg };
}

/** Merge every node's static meshes (in node space) into one mesh per material. */
function bake(root) {
  root.updateMatrixWorld(true);
  const nodes = [];
  root.traverse(o => { if (o.userData.node) nodes.push(o); });
  const isNode = new Set(nodes);
  const white = new THREE.Color(1, 1, 1);
  const srcGeos = new Set();
  for (const N of nodes) {
    const inv = N.matrixWorld.clone().invert();
    const byMat = new Map();
    const victims = [];
    const visit = (o) => {
      for (const c of o.children) {
        if (isNode.has(c)) continue;
        if (c.isMesh) {
          let g = c.geometry.clone();
          if (!g.index) g = mergeable(g);
          g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
          const paint = c.userData.paint;
          if (paint !== undefined || !g.attributes.color) colorize(g, paint ?? white);
          for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
          if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
          g.morphAttributes = {};
          g.clearGroups();
          if (!byMat.has(c.material)) byMat.set(c.material, []);
          byMat.get(c.material).push(g);
          victims.push(c);
        }
        visit(c);
      }
    };
    visit(N);
    for (const v of victims) { v.parent.remove(v); srcGeos.add(v.geometry); }
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      geos.forEach(g => g.dispose());
      if (!merged) continue;
      merged.computeBoundingSphere();
      const m = new THREE.Mesh(merged, mat);
      // only sizeable parts (body, head, big limbs) cast into the shadow map: eyes, whiskers,
      // brows etc. would cost a shadow draw each for no visible shadow (the scene also draws
      // a soft contact blob under every character)
      m.castShadow = !mat.userData.noShadow && merged.boundingSphere.radius > 0.12;
      m.receiveShadow = !mat.userData.noShadow;
      N.add(m);
    }
  }
  for (const g of srcGeos) g.dispose();
}
function mergeable(g) {
  const idx = [];
  for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
  g.setIndex(idx);
  return g;
}

function protoFor(id) {
  if (!protos.has(id)) protos.set(id, buildProto(id));
  return protos.get(id);
}

// ------------------------------------------------------------------ the character
/**
 * makeCritter({ species, color }) → same API as createAvatar().
 * species: one of SPECIES_IDS (anything else maps via speciesFor). color: accent tint.
 */
export function makeCritter({ species, color, seed = '' } = {}) {
  const id = HEROES[species] ? species : speciesFor(species, seed);
  const sp = SPECIES[id];
  const proto = protoFor(id);
  const root = proto.root.clone(true);
  root.name = 'hero:' + id;
  const N = {};
  root.traverse(o => { if (o.userData.node) N[o.name] = o; });
  const fab = fabricFor(accentColor(color, sp.color));
  const M = mats();
  root.traverse(o => { if (o.isMesh && o.material === M.fabric) o.material = fab; });

  const { rig, hips, body, headG, head, phones, mic } = N;
  const arm = (t) => ({ shoulder: N['shoulder' + t], elbow: N['elbow' + t], hand: N['hand' + t] });
  const armL = arm('L'), armR = arm('R');
  const legL = { thigh: N.thighL, knee: N.kneeL }, legR = { thigh: N.thighR, knee: N.kneeR };
  const eyes = ['L', 'R'].map((t, i) => ({ ball: N['eye' + t], lid: N['lid' + t], restY: N['eye' + t].rotation.y, rest: N['eye' + t].position.clone(), screen: !!N['eye' + t].userData.screen, side: i ? 1 : -1 }));
  const brows = [N.browL, N.browR];
  const browY = N.browL.position.y;
  const ears = [N.earL, N.earR].map((e, i) => e && ({ node: e, rest: e.rotation.clone(), side: i ? 1 : -1 })).filter(Boolean);
  const capeA = N.capeA, capeB = N.capeB, cc = proto.cape;
  const capeStandPos = capeA ? capeA.position.clone() : null;
  const capeSitPos = cc ? new V3(...cc.sitPos) : null;
  const flames = [N.flameA, N.flameB].filter(Boolean);
  const amp = 1;

  // ================= motion
  const S = {
    hipsY: new Spring(SIT_HIPS, 220, 22),
    squash: new Spring(0, 320, 9),
    lean: new Spring(0, 120, 14),
    aLx: new Spring(-0.5, 240, 20), aLz: new Spring(0, 240, 20), eL: new Spring(-1, 260, 22), eLz: new Spring(0, 260, 22),
    aRx: new Spring(-0.5, 240, 20), aRz: new Spring(0, 240, 20), eR: new Spring(-1, 260, 22), eRz: new Spring(0, 260, 22),
    lift: new Spring(0, 200, 18),
    hX: new Spring(0, 90, 11), hY: new Spring(0, 70, 10), hZ: new Spring(0, 90, 11),
    thigh: new Spring(-Math.PI / 2, 300, 28), knee: new Spring(Math.PI / 2, 300, 28),
    mouth: new Spring(0, 260, 18), brow: new Spring(0, 200, 16), browTilt: new Spring(0, 200, 16), browAsym: new Spring(0, 160, 14),
    eye: new Spring(1, 400, 30), gazeX: new Spring(0, 160, 18), gazeY: new Spring(0, 160, 18),
    earX: new Spring(0, 140, 10), earZ: new Spring(0, 90, 6), earL: new Spring(0, 160, 7), earR: new Spring(0, 160, 7), earOut: new Spring(0, 120, 6),
    sitK: new Spring(1, 110, 18), tailX: new Spring(0, 60, 6), tailZ: new Spring(0, 55, 6), tailB: new Spring(0, 70, 6),
    cupTilt: new Spring(0, 160, 18),
  };
  const timers = { nextBlink: 1 + Math.random() * 3, blinkAt: -1, double: false, nextLook: Math.random() * 2, lookY: 0, lookX: 0, nextHop: 0, nextTwitch: 1 + Math.random() * 4 };
  let lastActivity = null, lastPose = null, lastYaw = null, yawVel = 0;
  let own = null;   // per-instance material clones (made the first time we fade)
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

  const api = {
    root, hips, headG, armL, armR, legL, legR, phones, mic, bowl: N.bowlH, cup: N.cupH,
    character: id, species: id, ready: true,
    pose: 'sit',        // sit | stand | walk
    activity: 'type',   // idle | type | eat | drink | raise | wave | talk | listen | cross | celebrate | look
    phase: Math.random() * 10,
    walkPhase: 0,
    opacity: 1,
    setHeadphones(on, withMic = false) { phones.visible = !!on; mic.visible = !!on && !!withMic; },
    hop(strength = 1) { S.squash.kick(-2.2 * strength); },
    setOpacity(o) {
      if (Math.abs(o - api.opacity) < 0.001) return;
      api.opacity = o;
      if (!own && o < 0.999) {
        own = new Map();
        root.traverse(m => {
          if (!m.isMesh) return;
          if (!own.has(m.material)) own.set(m.material, m.material.clone());
          m.material = own.get(m.material);
        });
      }
      if (own) {
        for (const m of own.values()) {
          m.transparent = o < 0.999;
          m.opacity = o;
          m.depthWrite = o > 0.6;
        }
      }
      root.visible = o > 0.02;
    },
    update(t, dt) { step(t, Math.min(Math.max(dt, 0), 0.1)); },
    dispose() {
      if (own) for (const m of own.values()) m.dispose();
      own = null;
      root.parent?.remove(root);
    },
  };

  function step(t, dt) {
    const p = t + api.phase;
    const pose = api.pose, act = api.activity;

    // anticipation / landing impulses
    if (act !== lastActivity) {
      if (lastActivity !== null && (act === 'raise' || act === 'wave' || act === 'celebrate')) S.squash.kick(2.6);
      if (act === 'raise') timers.nextHop = t + 0.18;
      if (act === 'celebrate') timers.nextHop = t + 0.12;
      if (act === 'look') timers.nextLook = t;
      lastActivity = act;
    }
    if (pose !== lastPose) {
      if (lastPose === 'walk' && pose === 'sit') S.squash.kick(3.2);
      if (lastPose === 'sit' && pose !== 'sit') S.squash.kick(-2);
      lastPose = pose;
    }
    // how fast the scene is turning us (tail/ears drag behind)
    const yaw = root.rotation.y;
    if (lastYaw !== null && dt > 0) {
      let d = yaw - lastYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      yawVel += (d / dt - yawVel) * Math.min(1, dt * 8);
    }
    lastYaw = yaw;

    // blinking (sometimes a double blink)
    if (t >= timers.nextBlink) {
      timers.blinkAt = t;
      timers.double = Math.random() < 0.2;
      timers.nextBlink = t + 2.2 + Math.random() * 3.5;
    }
    let blink = ease.bump((t - timers.blinkAt) / 0.13);
    if (timers.double) blink = Math.max(blink, ease.bump((t - timers.blinkAt - 0.2) / 0.13));

    // glance around now and then
    if (t >= timers.nextLook) {
      const wide = act === 'idle' || act === 'listen' || act === 'look' || pose !== 'sit';
      timers.lookY = (Math.random() - 0.5) * (wide ? 0.9 : 0.35);
      timers.lookX = (Math.random() - 0.5) * 0.15;
      timers.nextLook = t + (act === 'look' ? 0.8 + Math.random() * 1.4 : 1.2 + Math.random() * (act === 'type' ? 4 : 2.5));
    }
    // ear twitches
    if (t >= timers.nextTwitch && ears.length) {
      (Math.random() < 0.5 ? S.earL : S.earR).kick((Math.random() < 0.5 ? -1 : 1) * 3.2 * Math.min(1.2, amp));
      timers.nextTwitch = t + 2.5 + Math.random() * 5;
    }

    let hipsY, thigh, knee, lean = 0;
    let aLx, aLz, aRx, aRz, eL, eR, eLz = 0, eRz = 0, lift = 0;
    let hX = timers.lookX, hY = timers.lookY, hZ = 0;
    let mouth = 0, brow = 0, browTilt = 0, browAsym = 0, eye = 1;
    let gazeX = timers.lookY * 0.6, gazeY = 0;
    let perk = 0, wag = 0, cupTilt = 0;
    const breath = Math.sin(p * 1.6);

    if (pose === 'sit') { hipsY = SIT_HIPS; thigh = -Math.PI / 2; knee = Math.PI / 2; }
    else if (pose === 'walk') { hipsY = STAND_HIPS + 0.01; thigh = 0; knee = 0.1; lean = 0.12; }
    else { hipsY = STAND_HIPS; thigh = 0; knee = 0; }

    const restL = () => {
      if (pose === 'sit') { aLx = -0.45; aLz = 0.12; eL = -1.05; }
      else { aLx = 0.05 + breath * 0.03; aLz = -0.12; eL = -0.25; }
    };
    const rest = () => {
      restL();
      if (pose === 'sit') { aRx = -0.45; aRz = -0.12; eR = -1.05; }
      else { aRx = 0.05 - breath * 0.03; aRz = 0.12; eR = -0.25; }
    };

    switch (act) {
      case 'type': {
        // bursts of typing on the laptop, then a short pause to read the screen
        const burst = Math.sin(p * 0.55) + Math.sin(p * 1.3) * 0.5 > -0.6 ? 1 : 0;
        const tap = (o) => burst * Math.max(0, Math.sin(p * 17 + o)) ** 3;
        aLx = -0.62; aRx = -0.62;
        aLz = 0.2; aRz = -0.2;
        eL = -1.68 + tap(0) * 0.14; eR = -1.68 + tap(2.1) * 0.14;
        lean = pose === 'sit' ? 0.1 : 0;
        hX = 0.12 + burst * Math.sin(p * 17) * 0.008 + (1 - burst) * 0.04;
        hY = timers.lookY * (burst ? 0.12 : 0.45);
        gazeY = -0.6; gazeX = Math.sin(p * 0.9) * 0.4 * burst;
        brow = burst ? -0.12 : 0;
        perk = -0.06;
        break;
      }
      case 'eat': {
        const cyc = (p * 0.45) % 1;
        const up = ease.inOut(cyc < 0.5 ? cyc * 2 : 2 - cyc * 2);
        aRx = -0.35 - up * 0.25; aRz = -0.15 - up * 0.15; eR = -1.35 - up * 0.85;
        aLx = -0.45; aLz = 0.12; eL = -1.05;
        hX = 0.12 - up * 0.08; hY = -up * 0.1;
        mouth = up > 0.7 ? 0.45 + Math.sin(p * 18) * 0.25 : 0.05;
        eye = up > 0.8 ? 0.4 : 1;
        brow = 0.2; gazeY = -0.4;
        cupTilt = 0.35 - up * 0.25;
        break;
      }
      case 'drink': {
        // lift the cup, a slow contented sip, lower it, hold it warm
        const cyc = (p * 0.22) % 1;
        const up = cyc < 0.16 ? ease.inOut(cyc / 0.16) : cyc < 0.48 ? 1 : cyc < 0.62 ? 1 - ease.inOut((cyc - 0.48) / 0.14) : 0;
        aRx = lerp(-0.55, -1.3, up); aRz = lerp(-0.14, -0.5, up); eR = lerp(-1.5, -1.72, up);
        if (pose === 'sit') { aLx = -0.5; aLz = 0.1; eL = -1.2; } else restL();
        hX = lerp(0.05, -0.14, up); hY = timers.lookY * (1 - up) * 0.4;
        eye = up > 0.85 ? 0.12 : 1; brow = up > 0.85 ? 0.18 : 0.05;
        gazeY = -0.3 * (1 - up); gazeX *= 1 - up;
        cupTilt = up > 0.85 ? -0.75 : -0.08 - up * 0.3;
        break;
      }
      case 'raise': {
        aRx = -Math.PI + 0.12; aRz = 0.28 + Math.sin(p * 7) * 0.12; eR = -0.1 + Math.sin(p * 7) * 0.1;
        lift = 0.06;
        aLx = pose === 'sit' ? -0.45 : 0.1; aLz = pose === 'sit' ? 0.12 : -0.25; eL = pose === 'sit' ? -1.05 : -0.3;
        hX = -0.12; hY = Math.sin(p * 2.2) * 0.25; hZ = Math.sin(p * 3.1) * 0.08;
        brow = 0.4; browTilt = 0.4; mouth = 0.3 + Math.sin(p * 4) * 0.05; gazeY = 0.3;
        perk = 0.15;
        if (t >= timers.nextHop) { S.squash.kick(-2.4); timers.nextHop = t + 2.4; }
        break;
      }
      case 'wave': {
        aRx = -Math.PI + 0.45; aRz = 0.45 + Math.sin(p * 9) * 0.45; eR = -0.35;
        lift = 0.05;
        aLx = pose === 'sit' ? -0.45 : 0.05; aLz = pose === 'sit' ? 0.12 : -0.15; eL = pose === 'sit' ? -1.05 : -0.25;
        hZ = Math.sin(p * 9) * 0.06; hX = -0.08; hY *= 0.3;
        brow = 0.3; mouth = 0.4; eye = 0.9; gazeX = 0; gazeY = 0;
        perk = 0.12; wag = 0.6;
        break;
      }
      case 'celebrate': {
        const pump = Math.sin(p * 7);
        aLx = aRx = -Math.PI + 0.28 + pump * 0.12;
        aLz = -0.42 - pump * 0.08; aRz = 0.42 + pump * 0.08;
        eL = eR = -0.22 - Math.max(0, pump) * 0.35;
        lift = 0.04;
        hX = -0.1; hZ = Math.sin(p * 3.5) * 0.1; hY = Math.sin(p * 1.7) * 0.2;
        mouth = 0.55 + pump * 0.08; eye = 0.5; brow = 0.45; gazeY = 0.2; gazeX = 0;
        perk = 0.2; wag = 1;
        if (t >= timers.nextHop) { S.squash.kick(pose === 'sit' ? -1.7 : -2.7); timers.nextHop = t + 0.85; }
        break;
      }
      case 'talk': {
        aLx = -0.35 + Math.sin(p * 2.3) * 0.15; aRx = -0.4 + Math.sin(p * 2.9 + 1) * 0.2;
        aLz = 0.05 - Math.max(0, Math.sin(p * 1.7)) * 0.3; aRz = -0.05 + Math.max(0, Math.sin(p * 2.1)) * 0.3;
        eL = -1.3 + Math.sin(p * 2.3) * 0.35; eR = -1.4 + Math.sin(p * 2.9) * 0.4;
        mouth = 0.08 + Math.abs(Math.sin(p * 11) * Math.sin(p * 3.7)) * 0.5;
        hX = Math.sin(p * 2.6) * 0.06; brow = Math.sin(p * 1.9) * 0.25;
        perk = 0.05;
        break;
      }
      case 'cross': {    // arms folded, cool and relaxed
        aLx = -1.25; aRx = -1.1; aLz = -0.12; aRz = 0.12; eL = -0.15; eR = -0.05; eLz = 1.5; eRz = -1.5;
        hZ = Math.sin(p * 0.8) * 0.05; hY = timers.lookY * 0.5; mouth = 0; brow = 0.05;
        hX = -0.04; browAsym = 0.25;
        break;
      }
      case 'listen':
        rest();
        hX = 0.05 + Math.max(0, Math.sin(p * 2.2)) * 0.12;   // nodding along
        brow = 0.1; perk = 0.12;
        break;
      case 'look': {   // curious: big slow glances, head tilts, one brow up
        rest();
        hY = clamp(timers.lookY * 1.6, -0.75, 0.75);
        hZ = -timers.lookY * 0.3;
        hX = timers.lookX - 0.06;
        gazeX = clamp(timers.lookY * 1.4, -1, 1); gazeY = 0.12;
        brow = 0.3; browAsym = timers.lookY > 0 ? 0.6 : -0.6; eye = 1.12;
        perk = 0.22;
        break;
      }
      default:
        rest();
    }

    if (pose === 'walk') {
      api.walkPhase += dt * 10;
      const s = Math.sin(api.walkPhase);
      aLx = -s * 0.55; aRx = s * 0.55; aLz = -0.1; aRz = 0.1; eL = eR = -0.35; eLz = eRz = 0;
      hY = 0; hX = 0.02; mouth = 0.05; gazeX = 0; gazeY = 0;
    }

    S.hipsY.target = hipsY; S.lean.target = lean; S.thigh.target = thigh; S.knee.target = knee;
    S.aLx.target = aLx; S.aLz.target = aLz; S.eL.target = eL; S.eLz.target = eLz;
    S.aRx.target = aRx; S.aRz.target = aRz; S.eR.target = eR; S.eRz.target = eRz;
    S.lift.target = lift;
    S.hX.target = hX; S.hY.target = hY; S.hZ.target = hZ;
    S.mouth.target = mouth; S.brow.target = brow; S.browTilt.target = browTilt; S.browAsym.target = browAsym; S.eye.target = eye;
    S.gazeX.target = gazeX; S.gazeY.target = gazeY;
    S.squash.target = 0;
    // ears: perk with interest, lag behind head turns, flop on hops
    S.earX.target = perk - S.hX.v * 0.05;
    S.earZ.target = clamp(-S.hY.v * 0.08 - yawVel * 0.05, -0.5, 0.5) * amp;
    S.earOut.target = clamp(S.squash.x * 0.9 + S.squash.v * 0.03, -0.4, 0.4) * amp;
    S.earL.target = 0; S.earR.target = 0;
    // tail: gentle sway, wag when happy, drags behind turns and steps
    const sitting = pose === 'sit';
    S.sitK.target = sitting ? 1 : 0;
    const walkSway = pose === 'walk' ? Math.sin(api.walkPhase) * 0.18 : 0;
    S.tailZ.target = Math.sin(p * 0.9) * 0.05 * (sitting ? 0.3 : 1) + wag * Math.sin(p * 7) * 0.12 + walkSway * 0.4 - clamp(yawVel * 0.12, -0.5, 0.5);
    S.tailX.target = Math.sin(p * 0.8) * 0.04 + (pose === 'walk' ? Math.sin(api.walkPhase * 2) * 0.06 : 0) + clamp(-S.squash.v * 0.012, -0.2, 0.3) + wag * 0.08;
    S.tailB.target = Math.sin(p * 1.1 - 0.9) * 0.06 + (pose === 'walk' ? Math.sin(api.walkPhase * 2 - 1) * 0.1 : 0) + wag * Math.sin(p * 9 - 1.2) * 0.08;
    S.cupTilt.target = cupTilt;
    for (const k in S) S[k].step(dt);

    // ---- legs + body
    let bounce = 0;
    if (pose === 'walk') {
      const s = Math.sin(api.walkPhase);
      bounce = Math.abs(Math.cos(api.walkPhase)) * 0.04;
      legL.thigh.rotation.x = s * 0.55; legR.thigh.rotation.x = -s * 0.55;
      legL.knee.rotation.x = Math.max(0, -s) * 0.7 + 0.05; legR.knee.rotation.x = Math.max(0, s) * 0.7 + 0.05;
    } else {
      legL.thigh.rotation.x = legR.thigh.rotation.x = S.thigh.x;
      legL.knee.rotation.x = legR.knee.rotation.x = S.knee.x;
    }
    const sq = clamp(S.squash.x, -0.22, 0.22);
    const air = Math.max(0, -S.squash.x) * 0.5;
    hips.position.y = S.hipsY.x + bounce + air * (pose === 'sit' ? 0.3 : 1);
    rig.scale.set(1 + sq * 0.4, 1 - sq, 1 + sq * 0.4);
    hips.rotation.x = S.lean.x;
    body.scale.set(1 + breath * 0.012, 1 + breath * 0.005, 1 + breath * 0.012);

    // ---- arms
    armL.shoulder.rotation.set(S.aLx.x, 0, S.aLz.x);
    armR.shoulder.rotation.set(S.aRx.x, 0, S.aRz.x);
    armL.elbow.rotation.set(S.eL.x, 0, S.eLz.x);
    armR.elbow.rotation.set(S.eR.x, 0, S.eRz.x);
    armR.shoulder.position.y = SH_Y + S.lift.x;

    // ---- head + face
    headG.rotation.set(S.hX.x, S.hY.x, S.hZ.x);
    head.position.y = HEAD_Y + breath * 0.003;
    const eyeOpen = Math.max(0, S.eye.x * (1 - blink));
    const edge = lerp(-1.45, 0.7, Math.min(eyeOpen, 1)) + Math.max(0, eyeOpen - 1) * 2.2 - Math.max(0, -S.gazeY.x) * 0.3;
    for (const e of eyes) {
      if (e.screen) {   // glowing visor / screen eyes: blink by squashing, look by sliding
        e.ball.scale.y = Math.max(0.08, Math.min(1.15, eyeOpen) * (1 - Math.max(0, -S.gazeY.x) * 0.25));
        e.ball.position.set(e.rest.x + S.gazeX.x * 0.014, e.rest.y + S.gazeY.x * 0.01, e.rest.z);
      } else {
        e.ball.rotation.set(-S.gazeY.x * 0.3, e.restY + S.gazeX.x * 0.38, 0);
        e.lid.rotation.x = -edge;
      }
    }
    brows[0].position.y = browY + S.brow.x * 0.022 - S.browAsym.x * 0.012;
    brows[1].position.y = browY + S.brow.x * 0.022 + S.browAsym.x * 0.012;
    brows[0].rotation.z = -S.browTilt.x * 0.35; brows[1].rotation.z = S.browTilt.x * 0.35;
    const mo = Math.max(0, S.mouth.x);
    if (N.jaw) N.jaw.rotation.x = Math.min(0.6, mo * 0.75);
    else {
      N.smile.visible = mo < 0.12;
      N.open.visible = mo >= 0.12;
      N.open.scale.set(0.75 + mo * 0.45, Math.min(1.25, mo * 1.6), 1);
    }
    for (const e of ears) {
      const tw = e.side < 0 ? S.earL.x : S.earR.x;
      e.node.rotation.set(e.rest.x + (S.earX.x + tw * 0.25) * amp, e.rest.y, e.rest.z + S.earZ.x - e.side * (S.earOut.x + Math.abs(tw) * 0.1));
    }

    // ---- cape / scarf: hangs behind, flows back when walking, drapes over the chair back when seated
    if (capeA) {
      const k = clamp(S.sitK.x, -0.1, 1.1);
      const walk = pose === 'walk' ? 1 : 0;
      capeA.position.lerpVectors(capeStandPos, capeSitPos, k);
      capeA.rotation.set(lerp(cc.stand[0], cc.sit[0], k) + walk * (cc.walk[0] - cc.stand[0]) + S.tailX.x, 0, S.tailZ.x * 0.35);
      capeB.rotation.set(lerp(cc.stand[1], cc.sit[1], k) + walk * (cc.walk[1] - cc.stand[1]) + S.tailB.x, 0, S.tailZ.x * 0.25);
    }
    // ---- living flames
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i], o = i * 1.7;
      f.scale.set(1 + Math.sin(p * 7 + o) * 0.04, 1 + Math.sin(p * 9 + o) * 0.1 + Math.sin(p * 14.3 + o) * 0.05, 1);
      f.rotation.set(-S.hX.v * 0.04 + Math.sin(p * 5 + o) * 0.04 - (pose === 'walk' ? 0.25 : 0), 0, Math.sin(p * 6.1 + o) * 0.05 - S.hY.v * 0.03);
    }

    // ---- props (holders stay upright in body space)
    const showCup = act === 'drink' && pose !== 'walk';
    const showBowl = act === 'eat' && pose !== 'walk';
    N.cupH.visible = showCup; N.bowlH.visible = showBowl;
    if (showCup || showBowl) {
      qa.copy(hips.quaternion).multiply(armR.shoulder.quaternion).multiply(armR.elbow.quaternion).invert();
      qb.setFromAxisAngle(X_AXIS, S.cupTilt.x);
      (showCup ? N.cupH : N.bowlH).quaternion.copy(qa).multiply(qb);
    }
  }

  step(0, 0.016);
  for (const k in S) S[k].snap(S[k].target);
  step(0, 0.016);
  return api;
}

export { THREE };
