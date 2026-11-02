// Shared building blocks for the 3D office diorama: palette, rounded geometry, geometry baking
// (many small parts → one vertex-coloured BufferGeometry = one draw call) and a few soft
// canvas textures. Everything is cached at module level so every workstation shares GPU buffers.
import * as THREE from '../three.module.min.js';
import { mergeGeometries } from '../BufferGeometryUtils.js';
import { PALETTE } from '../status.js';

export { THREE };

// Colours: the Deskmate palette plus a few neutral supporting tones.
export const C = {
  ...PALETTE,
  walnutDark: '#8C6649', walnutLight: '#C9A07A', graphite: '#3B424C', steel: '#C7CCD2', steelDark: '#8E959E',
  paper: '#F3F0E8', ceramic: '#F2EEE6', coffee: '#4A2E1E', crema: '#B07A4E', keys: '#2C3139',
  leaf: '#6F9A78', leafDark: '#557F66', leafLight: '#8DB094', terracotta: '#C69072', clay: '#D9CBB8',
  fabricBlue: '#8398AC', fabricBeige: '#CDB9A2', fabricSage: '#97AD9B', fabricSlate: '#5E7286',
  floor: '#E6E0D5', warm: '#FFD7A0',
};

// ------------------------------------------------------------------ geometry
const geoCache = new Map();
const cached = (key, make) => {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
};

/** Box with rounded edges (non-indexed, smooth normals, no uv). */
export function roundedBox(w, h, d, r = 0.02, seg = 2) {
  return cached(`rb:${w}:${h}:${d}:${r}:${seg}`, () => {
    const s = seg * 2 + 1;
    const rr = Math.max(1e-4, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
    const g = new THREE.BoxGeometry(1, 1, 1, s, s, s).toNonIndexed();
    g.deleteAttribute('uv');
    const pos = g.attributes.position, nor = g.attributes.normal;
    const bx = w / 2 - rr, by = h / 2 - rr, bz = d / 2 - rr;
    const half = 0.5 / s;
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const sx = Math.sign(p.x), sy = Math.sign(p.y), sz = Math.sign(p.z);
      n.set(p.x - sx * half, p.y - sy * half, p.z - sz * half).normalize();
      pos.setXYZ(i, bx * sx + n.x * rr, by * sy + n.y * rr, bz * sz + n.z * rr);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  });
}

/** Lathe from [radius, y] pairs (y up). */
export function lathe(points, segs = 32, key = null) {
  const make = () => new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(Math.max(r, 0), y)), segs);
  return key ? cached('lathe:' + key, make) : make();
}

/** Cylinder with softly rounded top/bottom edges, base at y = 0. */
export function roundedCylinder(r, h, bevel = 0.01, segs = 32) {
  return cached(`rc:${r}:${h}:${bevel}:${segs}`, () => {
    const b = Math.min(bevel, r * 0.5, h * 0.5);
    const pts = [[0, 0]];
    for (let i = 0; i <= 4; i++) { const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2); pts.push([r - b + Math.cos(a) * b, b + Math.sin(a) * b]); }
    for (let i = 0; i <= 4; i++) { const a = (i / 4) * (Math.PI / 2); pts.push([r - b + Math.cos(a) * b, h - b + Math.sin(a) * b]); }
    pts.push([0, h]);
    return new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs);
  });
}

export const sphere = (r, w = 16, h = 12) => cached(`sp:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
export const cylinder = (rt, rb, h, s = 16) => cached(`cy:${rt}:${rb}:${h}:${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s));
export const torus = (r, t, rs = 8, ts = 20, arc = Math.PI * 2) => cached(`to:${r}:${t}:${rs}:${ts}:${arc}`, () => new THREE.TorusGeometry(r, t, rs, ts, arc));
export const box = (w, h, d) => cached(`bx:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));

/** Rounded rectangle shape centred on the origin. */
export function roundedRectShape(w, d, r) {
  r = Math.min(r, w / 2, d / 2);
  const s = new THREE.Shape();
  const x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

/** Prepare one geometry for merging: non-indexed, position + normal (+ colour) only. */
function prep(geo, matrix, color) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.morphAttributes = {};
  g.clearGroups();
  if (matrix) g.applyMatrix4(matrix);
  if (color !== undefined) {
    const c = color instanceof THREE.Color ? color : new THREE.Color(color);
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  }
  return g;
}

/**
 * Bake parts into one vertex-coloured geometry.
 * part: { g: geometry, c: colour, p: [x,y,z], r: [rx,ry,rz], s: number | [sx,sy,sz], m: Matrix4 }
 */
export function bake(parts) {
  const geos = parts.map(pt => {
    let mtx;
    if (pt.m) mtx = pt.m;
    else {
      const sc = pt.s === undefined ? [1, 1, 1] : typeof pt.s === 'number' ? [pt.s, pt.s, pt.s] : pt.s;
      _e.set(...(pt.r || [0, 0, 0]));
      mtx = _m.compose(_v.set(...(pt.p || [0, 0, 0])), _q.setFromEuler(_e), _s.set(...sc));
    }
    return prep(pt.g, mtx, pt.c ?? '#ffffff');
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach(g => g.dispose());
  merged.computeBoundingSphere();
  return merged;
}

/** A cylinder part running from point a to point b. */
export function rod(a, b, r, c, segs = 10) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const mid = A.clone().add(B).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return { g: cylinder(r, r, len, segs), c, m: new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)) };
}

/**
 * Flatten every mesh under `root` (children of it, recursively, minus `skip`) into one
 * vertex-coloured geometry, in root's local space. Colours come from each mesh's material.
 */
export function flattenMeshes(root, skip = new Set()) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const parts = [];
  root.traverse(o => {
    if (!o.isMesh || skip.has(o)) return;
    for (let a = o.parent; a && a !== root; a = a.parent) if (skip.has(a)) return;
    parts.push({ g: o.geometry, c: o.material.color, m: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld) });
  });
  return parts.length ? bake(parts) : null;
}

/**
 * Merge the direct, childless mesh children of `parent` (except `keep`) into one
 * vertex-coloured mesh using `material`. Returns the new mesh (or null).
 */
export function mergeChildren(parent, material, keep = new Set()) {
  const list = parent.children.filter(o => o.isMesh && !keep.has(o) && !o.children.length);
  if (list.length < 2) return null;
  const parts = list.map(o => { o.updateMatrix(); return { g: o.geometry, c: o.material.color, m: o.matrix.clone() }; });
  const geo = bake(parts);
  for (const o of list) { parent.remove(o); o.geometry.dispose(); }
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

// ------------------------------------------------------------------ materials
let MATS = null;
/** Shared surface classes (all vertex coloured): matte wood/fabric, satin metal, glossy ceramic. */
export function surfaces() {
  return MATS ||= {
    matte: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0 }),
    fabric: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }),
    satin: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.45 }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0 }),
  };
}

// ------------------------------------------------------------------ textures
let GLOW = null, BLOB = null;
const canvasTex = (size, draw) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
/** Soft warm glow for lamp halos (use with additive blending). */
export const glowTexture = () => GLOW ||= canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(0.6, 'rgba(255,255,255,0.12)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
/** Soft round contact shadow (alpha falls off smoothly). */
export const blobTexture = () => BLOB ||= canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.45, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});

/** Forget cached GPU resources (after a scene disposed them they'd be re-uploaded anyway). */
export function disposeKit() {
  for (const g of geoCache.values()) g.dispose?.();
  geoCache.clear();
  if (MATS) for (const m of Object.values(MATS)) m.dispose();
  MATS = null;
  GLOW?.dispose(); BLOB?.dispose(); GLOW = BLOB = null;
}
