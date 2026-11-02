// The cutaway room around the diorama: hardwood floor, a window wall on the left, a dark
// slatted wall at the back (screen + cove light), skirting and plants — a cosy, isometric
// "office in a box" look. Everything is generated (canvas textures + boxes), no assets.
import { THREE, glowTexture } from './kit.js';

export const WALL_H = 3.0;
const tex = (c, rx = 1, ry = 1) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

let CACHE = null;
function textures() {
  if (CACHE) return CACHE;
  // hardwood: 8 boards across, staggered end joints
  const f = canvas(512, 512), g = f.getContext('2d');
  for (let r = 0; r < 8; r++) {
    let x = -rnd() * 200;
    while (x < 512) {
      const w = 180 + rnd() * 220, l = 0.29 + rnd() * 0.06, h = 19 + rnd() * 5;
      g.fillStyle = `hsl(${h} 30% ${l * 100}%)`; g.fillRect(x, r * 64, w, 64);
      for (let k = 0; k < 7; k++) { g.fillStyle = `rgba(60,30,10,${0.04 + rnd() * 0.05})`; g.fillRect(x, r * 64 + rnd() * 60, w, 1 + rnd() * 2); }
      g.fillStyle = 'rgba(30,14,4,0.55)'; g.fillRect(x, r * 64, 1.5, 64);
      x += w;
    }
    g.fillStyle = 'rgba(30,14,4,0.55)'; g.fillRect(0, r * 64, 512, 1.5);
  }
  // annex floor: a lighter, warmer oak
  const f2 = canvas(512, 512), g2 = f2.getContext('2d');
  for (let r = 0; r < 8; r++) {
    let x = -rnd() * 200;
    while (x < 512) {
      const w = 160 + rnd() * 200, l = 0.62 + rnd() * 0.06, h = 33 + rnd() * 4;
      g2.fillStyle = `hsl(${h} 34% ${l * 100}%)`; g2.fillRect(x, r * 64, w, 64);
      for (let k = 0; k < 6; k++) { g2.fillStyle = `rgba(90,50,20,${0.04 + rnd() * 0.04})`; g2.fillRect(x, r * 64 + rnd() * 60, w, 1 + rnd() * 2); }
      g2.fillStyle = 'rgba(60,30,10,0.45)'; g2.fillRect(x, r * 64, 1.5, 64);
      x += w;
    }
    g2.fillStyle = 'rgba(60,30,10,0.45)'; g2.fillRect(0, r * 64, 512, 1.5);
  }
  // mural: a snowy peak over a city skyline at dusk
  const mu = canvas(1024, 512), m = mu.getContext('2d');
  const sky = m.createLinearGradient(0, 0, 0, 512); sky.addColorStop(0, '#2E4F8F'); sky.addColorStop(0.55, '#8FB1DA'); sky.addColorStop(1, '#F1C9A2');
  m.fillStyle = sky; m.fillRect(0, 0, 1024, 512);
  m.fillStyle = '#41526F'; m.beginPath(); m.moveTo(0, 400); m.lineTo(180, 270); m.lineTo(300, 330); m.lineTo(520, 60); m.lineTo(700, 300); m.lineTo(820, 230); m.lineTo(1024, 380); m.lineTo(1024, 512); m.lineTo(0, 512); m.fill();
  m.fillStyle = '#F4F7FB'; m.beginPath(); m.moveTo(520, 60); m.lineTo(450, 160); m.lineTo(490, 150); m.lineTo(520, 190); m.lineTo(560, 150); m.lineTo(600, 165); m.fill();
  for (let i = 0; i < 26; i++) {
    const w = 28 + rnd() * 34, h = 60 + rnd() * 150, x = i * 40 + rnd() * 10;
    m.fillStyle = `hsl(215 ${18 + rnd() * 14}% ${22 + rnd() * 12}%)`; m.fillRect(x, 512 - h, w, h);
    m.fillStyle = 'rgba(255,214,150,0.75)';
    for (let yy = 512 - h + 8; yy < 505; yy += 14) for (let xx = x + 5; xx < x + w - 6; xx += 10) if (rnd() > 0.45) m.fillRect(xx, yy, 4, 6);
  }
  // sign
  const sg = canvas(512, 128), q2 = sg.getContext('2d');
  q2.fillStyle = '#1B222D'; q2.beginPath(); q2.roundRect(2, 2, 508, 124, 28); q2.fill();
  q2.fillStyle = '#F3E9D6'; q2.font = '600 58px -apple-system, Segoe UI, sans-serif'; q2.textAlign = 'center'; q2.textBaseline = 'middle';
  q2.fillText('Dining & Café', 256, 68);
  // slatted wall: deep red-brown vertical battens with dark gaps
  const s = canvas(256, 256), q = s.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const l = 20 + rnd() * 5;
    const gr = q.createLinearGradient(i * 32, 0, i * 32 + 32, 0);
    gr.addColorStop(0, `hsl(19 40% ${l - 4}%)`); gr.addColorStop(0.5, `hsl(19 42% ${l + 4}%)`); gr.addColorStop(1, `hsl(19 40% ${l - 5}%)`);
    q.fillStyle = gr; q.fillRect(i * 32, 0, 30, 256);
    q.fillStyle = '#18283D'; q.fillRect(i * 32 + 30, 0, 2, 256);
  }
  // wall screen
  const t = canvas(512, 160), h = t.getContext('2d');
  const grd = h.createLinearGradient(0, 0, 512, 160); grd.addColorStop(0, '#0B1220'); grd.addColorStop(1, '#152447');
  h.fillStyle = grd; h.fillRect(0, 0, 512, 160);
  h.fillStyle = '#EAF1FF'; h.font = '600 64px -apple-system, Segoe UI, sans-serif'; h.textAlign = 'center'; h.textBaseline = 'middle';
  h.fillText('DESKMATE', 256, 74);
  h.fillStyle = '#6FA2FF'; h.fillRect(150, 118, 212, 4);
  CACHE = { floor: tex(f), floor2: tex(f2), slats: tex(s), screen: tex(t), mural: tex(mu), sign: tex(sg) };
  CACHE.screen.repeat.set(1, 1);
  return CACHE;
}

/** Materials (theme-aware colours are set by setShellTheme). */
export function shellMaterials() {
  const T = textures();
  return {
    floor: new THREE.MeshStandardMaterial({ map: T.floor, roughness: 0.62, metalness: 0 }),
    floor2: new THREE.MeshStandardMaterial({ map: T.floor2, roughness: 0.6 }),
    slats: new THREE.MeshStandardMaterial({ map: T.slats, roughness: 0.7 }),
    annexWall: new THREE.MeshStandardMaterial({ color: '#E3D3B8', roughness: 0.9 }),
    mural: new THREE.MeshStandardMaterial({ map: T.mural, roughness: 0.85 }),
    sign: new THREE.MeshBasicMaterial({ map: T.sign, transparent: true }),
    drape: new THREE.MeshStandardMaterial({ color: '#7FA593', roughness: 0.95 }),
    drapeDark: new THREE.MeshStandardMaterial({ color: '#5E8472', roughness: 0.95 }),
    shelf: new THREE.MeshStandardMaterial({ color: '#18283D', roughness: 0.55 }),
    shelfIn: new THREE.MeshStandardMaterial({ color: '#263C55', roughness: 0.7 }),
    lamp: new THREE.MeshStandardMaterial({ color: '#F3D39B', emissive: '#E8B878', emissiveIntensity: 1.0, roughness: 0.3 }),
    gold: new THREE.MeshStandardMaterial({ color: '#D9B25E', roughness: 0.35, metalness: 0.7 }),
    books: ['#C47A4E', '#E8B878', '#5C7FA6', '#9DBDAD', '#EFE5D2', '#754B36'].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })),
    left: new THREE.MeshStandardMaterial({ color: '#7F95AD', roughness: 0.88 }),
    trim: new THREE.MeshStandardMaterial({ color: '#EFE5D2', roughness: 0.75 }),
    base: new THREE.MeshStandardMaterial({ color: '#18283D', roughness: 0.65 }),
    frame: new THREE.MeshStandardMaterial({ color: '#18283D', roughness: 0.45, metalness: 0.35 }),
    glass: new THREE.MeshStandardMaterial({ color: '#8FB3D6', emissive: '#4A7AA8', emissiveIntensity: 0.5, roughness: 0.08, metalness: 0.25, envMapIntensity: 1.6 }),
    screen: new THREE.MeshBasicMaterial({ map: T.screen }),
    cove: new THREE.MeshBasicMaterial({ color: '#E8B878' }),
    pot: new THREE.MeshStandardMaterial({ color: '#263C55', roughness: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: '#6E9C85', roughness: 0.7 }),
  };
}
export function setShellTheme(SM, dark) {
  SM.floor.color.set(dark ? '#8C8CA0' : '#FFFFFF');
  SM.slats.color.set(dark ? '#9A98AA' : '#FFFFFF');
  SM.left.color.set(dark ? '#2A3646' : '#7F95AD');
  SM.floor2.color.set(dark ? '#8C8CA0' : '#FFFFFF');
  SM.annexWall.color.set(dark ? '#4A4F5C' : '#E3D3B8');
  SM.mural.color.set(dark ? '#9A9AB0' : '#FFFFFF');
  SM.trim.color.set(dark ? '#5B6474' : '#EFE5D2');
  SM.glass.emissiveIntensity = dark ? 0.9 : 0.55;
  SM.leaf.color.set(dark ? '#4B7562' : '#6E9C85');
}

function plantGeos() {
  const pot = new THREE.CylinderGeometry(0.17, 0.13, 0.36, 18); pot.translate(0, 0.18, 0);
  const leaf = new THREE.SphereGeometry(1, 12, 8); leaf.scale(0.07, 0.34, 0.025); leaf.translate(0, 0.34, 0);
  return { pot, leaf };
}

/** z positions of the bookcases along the L's inner wall (shared by the shelves and the lamp beside them). */
function shelfLayout(b, A) {
  const room = A.z0 - b.z0 - 1.0, n = room > 5 ? 3 : room > 3 ? 2 : 1;
  return Array.from({ length: n }, (_, i) => b.z0 + 1.3 + i * (room - 1.3) / Math.max(1, n - 0.4) + 0.4);
}

/** A bookcase / credenza facing +z at the origin of the returned group. */
export function shelfUnit(SM, own, { w = 1.5, h = 2.0, d = 0.36, seed = 1, lamp = false, plant = true } = {}) {
  const g = new THREE.Group();
  let sd = seed * 977;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const box = (bw, bh, bd, mat, x, y, z, cast = true) => {
    const geo = new THREE.BoxGeometry(bw, bh, bd); own.push(geo);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m;
  };
  const t = 0.04;
  box(w, h, 0.02, SM.shelfIn, 0, h / 2, -d / 2 + 0.01);                       // back
  box(t, h, d, SM.shelf, -w / 2 + t / 2, h / 2, 0); box(t, h, d, SM.shelf, w / 2 - t / 2, h / 2, 0);
  box(w, t, d, SM.shelf, 0, t / 2, 0); box(w, t, d, SM.shelf, 0, h - t / 2, 0);
  const rows = Math.max(2, Math.round(h / 0.5)), step = (h - t) / rows;
  box(0.03, h - 2 * t, d * 0.96, SM.shelf, 0, h / 2, 0);                       // centre divider
  for (let k = 1; k < rows; k++) box(w - 2 * t, 0.03, d * 0.96, SM.shelf, 0, k * step + t / 2, 0);
  // things on the shelves
  for (let k = 0; k < rows; k++) {
    const y0 = k * step + t + 0.015, avail = step - 0.05;
    for (const side of [-1, 1]) {
      const x0 = side * (w / 4), kind = r();
      if (kind < 0.55) {                                                          // a row of books
        let bx = x0 - w * 0.2;
        for (let b = 0; b < 6 && bx < x0 + w * 0.2; b++) {
          const bw = 0.03 + r() * 0.035, bh = Math.min(avail, 0.18 + r() * 0.14);
          box(bw, bh, d * 0.6, SM.books[Math.floor(r() * 6)], bx + bw / 2, y0 + bh / 2, 0.0, false);
          bx += bw + 0.004;
        }
      } else if (kind < 0.72 && avail > 0.3) {                                    // trophy
        const cg = new THREE.CylinderGeometry(0.035, 0.05, 0.16, 12); own.push(cg);
        const m = new THREE.Mesh(cg, SM.gold); m.position.set(x0, y0 + 0.08, 0.02); g.add(m);
      } else if (kind < 0.86) {                                                   // framed picture
        box(0.2, 0.15, 0.015, SM.frame, x0, y0 + 0.08, -d / 2 + 0.04, false);
        box(0.17, 0.12, 0.012, SM.mural, x0, y0 + 0.08, -d / 2 + 0.05, false);
      }
    }
  }
  if (plant) {   // little plant on top
    const pg = new THREE.CylinderGeometry(0.07, 0.055, 0.12, 14); own.push(pg);
    const pm = new THREE.Mesh(pg, SM.pot); pm.position.set(-w * 0.28, h + 0.06, 0); g.add(pm);
    const lg = new THREE.SphereGeometry(1, 10, 8); lg.scale(0.05, 0.2, 0.02); lg.translate(0, 0.2, 0); own.push(lg);
    for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(lg, SM.leaf); l.position.set(-w * 0.28, h + 0.1, 0); l.rotation.set(0, i * 2.4, 0.3 + (i % 3) * 0.25); g.add(l); }
  }
  if (lamp) {    // glowing teal lamp
    const lgeo = new THREE.SphereGeometry(0.075, 16, 12); own.push(lgeo);
    const lm = new THREE.Mesh(lgeo, SM.lamp); lm.position.set(w * 0.28, h + 0.12, 0); lm.scale.set(1, 1.15, 1); g.add(lm);
    box(0.05, 0.05, 0.05, SM.frame, w * 0.28, h + 0.025, 0, false);
  }
  return g;
}

/** Soft, textured rug for a w×d footprint (rounded corners). style: 'main' | 'soft' | 'round'. */
export function rugMesh(w, d, radius, y, style, dark) {
  const sh = new THREE.Shape(), r = Math.min(radius, w / 2, d / 2), x = -w / 2, z = -d / 2;
  sh.moveTo(x + r, z); sh.lineTo(x + w - r, z); sh.quadraticCurveTo(x + w, z, x + w, z + r);
  sh.lineTo(x + w, z + d - r); sh.quadraticCurveTo(x + w, z + d, x + w - r, z + d);
  sh.lineTo(x + r, z + d); sh.quadraticCurveTo(x, z + d, x, z + d - r); sh.lineTo(x, z + r); sh.quadraticCurveTo(x, z, x + r, z);
  const geo = new THREE.ShapeGeometry(sh, 10);
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + d / 2) / d);
  geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
  const px = 1024, py = Math.max(256, Math.round(1024 * d / w)), c = canvas(px, py), g = c.getContext('2d');
  const P = {
    main: { base: '#18283D', mid: '#263C55', edge: '#E8B878', ink: '#D6BFA0', ring: true },
    soft: { base: '#263C55', mid: '#33506F', edge: '#9DBDAD', ink: '#D6BFA0', ring: false },
    round: { base: '#D6BFA0', mid: '#E6D3B4', edge: '#9DBDAD', ink: '#754B36', ring: false },
  }[style];
  const mask = () => { g.beginPath(); g.roundRect(0, 0, px, py, r / w * px); };
  mask(); g.fillStyle = P.base; g.fill(); g.save(); mask(); g.clip();
  // pile noise
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * px, Math.random() * py, 2 + Math.random() * 6, 1); }
  // inner field
  const inset = px * 0.055;
  g.fillStyle = P.mid; g.beginPath(); g.roundRect(inset, inset, px - 2 * inset, py - 2 * inset, r / w * px * 0.7); g.fill();
  // double border stripes
  g.lineWidth = px * 0.006; g.strokeStyle = P.edge;
  g.beginPath(); g.roundRect(inset * 0.5, inset * 0.5, px - inset, py - inset, r / w * px * 0.9); g.stroke();
  g.lineWidth = px * 0.0035; g.strokeStyle = P.ink; g.globalAlpha = 0.7;
  g.beginPath(); g.roundRect(inset * 1.35, inset * 1.35, px - inset * 2.7, py - inset * 2.7, r / w * px * 0.6); g.stroke(); g.globalAlpha = 1;
  if (P.ring) {   // big emblem: soft ring + monogram, like a branded office carpet
    const cx = px * 0.5, cy = py * 0.5, R = Math.min(px, py) * 0.36;
    g.strokeStyle = P.edge; g.globalAlpha = 0.55; g.lineWidth = R * 0.16;
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.35; g.lineWidth = R * 0.04; g.strokeStyle = P.ink;
    g.beginPath(); g.arc(cx, cy, R * 0.78, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.5; g.fillStyle = P.ink; g.font = `700 ${R * 1.15}px -apple-system, Segoe UI, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('D', cx, cy + R * 0.06); g.globalAlpha = 1;
    // diamond lattice in the corners
    g.strokeStyle = P.ink; g.globalAlpha = 0.12; g.lineWidth = 2;
    for (let i = -py; i < px + py; i += px * 0.05) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + py, py); g.stroke(); g.beginPath(); g.moveTo(i, py); g.lineTo(i + py, 0); g.stroke(); }
    g.globalAlpha = 1;
  } else if (style === 'round') {
    g.strokeStyle = P.edge; g.globalAlpha = 0.6; g.lineWidth = px * 0.012;
    for (const k of [0.3, 0.2]) { g.beginPath(); g.arc(px / 2, py / 2, px * k, 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = 1;
  } else {
    g.strokeStyle = P.ink; g.globalAlpha = 0.25; g.lineWidth = 4;
    for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(inset * 2, py * i / 8); g.lineTo(px - inset * 2, py * i / 8); g.stroke(); }
    g.globalAlpha = 1;
  }
  g.restore();
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({ map, roughness: 1, transparent: true });
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true;
  return m;
}

/** L-shaped slab: main rect b plus annex rect A (shares b's right edge). Absolute world coords, top at y = 0. */
export function platformGeometryL(b, A, thickness = 0.2) {
  const P = [[b.x0, b.z0], [b.x1, b.z0], [b.x1, A.z0], [A.x1, A.z0], [A.x1, b.z1], [b.x0, b.z1]];
  const shape = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(x, -z)));
  const bevel = 0.035;
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(thickness + bevel), 0);
  return g;
}

/** Builds the L-shaped shell: main block b (windows + slatted wall) and the dining annex A. Returns { group, own }. */
export function buildShell(b, SM, A) {
  const g = new THREE.Group(), own = [];
  const w = b.x1 - b.x0, d = b.z1 - b.z0, cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2, H = WALL_H;
  const box = (bw, bh, bd, mat, x, y, z, cast = false) => {
    const geo = new THREE.BoxGeometry(bw, bh, bd); own.push(geo);
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; m.castShadow = cast; g.add(m); return m;
  };
  const cloneTex = (t, rx, ry) => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(rx, ry); own.push(c); return c; };
  const floorOf = (rect, base, name) => {
    const rw = rect.x1 - rect.x0, rd = rect.z1 - rect.z0;
    const fm = base.clone(); fm.map = cloneTex(base.map, rw / 2.2, rd / 2.2); own.push(fm);
    const fg = new THREE.PlaneGeometry(rw, rd); own.push(fg);
    const f = new THREE.Mesh(fg, fm); f.rotation.x = -Math.PI / 2; f.position.set((rect.x0 + rect.x1) / 2, 0.001, (rect.z0 + rect.z1) / 2); f.receiveShadow = true; f.name = name; g.add(f);
  };
  floorOf(b, SM.floor, 'floorMain');
  floorOf(A, SM.floor2, 'floorAnnex');
  // main: slatted back wall, window wall on the left, painted wall closing the right (the L's inner side)
  const bm = SM.slats.clone(); bm.map = cloneTex(SM.slats.map, w / 1.3, H / 1.3); own.push(bm);
  box(w + 0.32, H, 0.16, bm, cx, H / 2, b.z0 - 0.08);
  box(0.16, H, d + 0.16, SM.left, b.x0 - 0.08, H / 2, cz);
  const pz = (b.z0 + A.z0) / 2, pd = A.z0 - b.z0;
  box(0.16, H, pd + 0.16, SM.left, b.x1 + 0.08, H / 2, pz);
  box(w + 0.4, 0.06, 0.24, SM.trim, cx, H + 0.03, b.z0 - 0.08);
  box(0.24, 0.06, d + 0.24, SM.trim, b.x0 - 0.08, H + 0.03, cz);
  box(0.24, 0.06, pd + 0.24, SM.trim, b.x1 + 0.08, H + 0.03, pz);
  box(w, 0.14, 0.03, SM.base, cx, 0.07, b.z0 + 0.015);
  box(0.03, 0.14, d, SM.base, b.x0 + 0.015, 0.07, cz);
  box(0.03, 0.14, pd, SM.base, b.x1 - 0.015, 0.07, pz);
  box(w - 0.4, 0.035, 0.04, SM.cove, cx, H - 0.14, b.z0 + 0.03);
  // soft ambient-occlusion: dark gradient strips where the floor meets the walls
  const aoTex = (() => { const c = canvas(8, 64), x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(10,18,30,0.5)'); gr.addColorStop(1, 'rgba(10,18,30,0)'); x.fillStyle = gr; x.fillRect(0, 0, 8, 64); const t = new THREE.CanvasTexture(c); own.push(t); return t; })();
  const aoMat = new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false }); own.push(aoMat);
  const ao = (len, x, z, rot, wd = 0.9) => { const ag = new THREE.PlaneGeometry(len, wd); own.push(ag); const m = new THREE.Mesh(ag, aoMat); m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, 0.004, z); m.renderOrder = 1; g.add(m); };
  ao(w, cx, b.z0 + 0.45, 0);                                // back wall (gradient runs wall → room)
  ao(d, b.x0 + 0.45, cz, Math.PI / 2);                     // window wall
  ao(A.z0 - b.z0, b.x1 - 0.45, (b.z0 + A.z0) / 2, -Math.PI / 2);   // the L's inner wall
  ao(A.x1 - A.x0, (A.x0 + A.x1) / 2, A.z0 + 0.45, 0);      // annex back wall
  ao(A.z1 - A.z0, A.x1 - 0.45, (A.z0 + A.z1) / 2, -Math.PI / 2);  // annex side wall
  // windows on the left wall
  const WIN_W = 1.05, GAP = 0.45, nWin = Math.max(1, Math.floor((d - 0.8) / (WIN_W + GAP)));
  const span = nWin * WIN_W + (nWin - 1) * GAP, z00 = cz - span / 2 + WIN_W / 2;
  const wins = [], sway = [];
  for (let i = 0; i < nWin; i++) {
    const wz = z00 + i * (WIN_W + GAP), y0 = 0.55, wh = 2.1;
    wins.push(wz);
    box(0.03, wh, WIN_W, SM.glass, b.x0 + 0.02, y0 + wh / 2, wz);
    for (const k of [-1, -1 / 3, 1 / 3, 1]) box(0.06, wh + 0.05, 0.04, SM.frame, b.x0 + 0.03, y0 + wh / 2, wz + k * WIN_W / 2);
    for (const yy of [y0, y0 + wh * 0.5, y0 + wh]) box(0.06, 0.04, WIN_W + 0.04, SM.frame, b.x0 + 0.03, yy, wz);
  }
  // wall screen above the meeting rooms
  box(1.5, 0.52, 0.04, SM.frame, cx, 2.62, b.z0 + 0.04);
  const sg = new THREE.PlaneGeometry(1.42, 0.44); own.push(sg);
  const sm = new THREE.Mesh(sg, SM.screen); sm.position.set(cx, 2.62, b.z0 + 0.065); g.add(sm);

  // ---- dining annex: warm walls, mural, sign, curtain at the opening
  const aw = A.x1 - A.x0, ad = A.z1 - A.z0, acx = (A.x0 + A.x1) / 2;
  box(aw + 0.16, H, 0.16, SM.annexWall, acx + 0.08, H / 2, A.z0 - 0.08);
  box(0.16, H, ad + 0.16, SM.annexWall, A.x1 + 0.08, H / 2, (A.z0 + A.z1) / 2);
  box(aw + 0.4, 0.06, 0.24, SM.trim, acx, H + 0.03, A.z0 - 0.08);
  box(0.24, 0.06, ad + 0.24, SM.trim, A.x1 + 0.08, H + 0.03, (A.z0 + A.z1) / 2);
  box(aw, 0.14, 0.03, SM.base, acx, 0.07, A.z0 + 0.015);
  box(0.03, 0.14, ad, SM.base, A.x1 - 0.015, 0.07, (A.z0 + A.z1) / 2);
  box(aw - 0.2, 0.035, 0.04, SM.cove, acx, H - 0.14, A.z0 + 0.03);
  const mg = new THREE.PlaneGeometry(2.9, 1.3); own.push(mg);
  box(3.0, 1.4, 0.03, SM.frame, acx, 1.95, A.z0 + 0.03);
  const mm = new THREE.Mesh(mg, SM.mural); mm.position.set(acx, 1.95, A.z0 + 0.052); g.add(mm);
  const sgeo = new THREE.PlaneGeometry(1.1, 0.275); own.push(sgeo);
  const sgn = new THREE.Mesh(sgeo, SM.sign); sgn.position.set(acx, 2.82, A.z0 + 0.04); g.add(sgn);
  // curtain across the first part of the opening (a darker drape + folds)
  const cl = 1.5;
  box(0.1, H - 0.1, cl, SM.drape, A.x0, (H - 0.1) / 2, A.z0 + cl / 2 + 0.02);
  for (let i = 0; i < 9; i++) box(0.05, H - 0.14, 0.09, SM.drapeDark, A.x0 + (i % 2 ? 0.06 : -0.06), (H - 0.14) / 2, A.z0 + 0.12 + i * (cl - 0.2) / 8);
  box(0.16, 0.07, cl + 0.06, SM.frame, A.x0, H - 0.05, A.z0 + cl / 2 + 0.02);

  // ---- shelves, elsewhere: along the main block's right wall + the annex side wall
  const place = (grp, x, z, rotY) => { grp.position.set(x, 0, z); grp.rotation.y = rotY; g.add(grp); };
  const sdep = 0.36;
  const L = -Math.PI / 2;                       // face -x
  const shelfZs = shelfLayout(b, A);
  for (let i = 0; i < shelfZs.length; i++) {
    const zz = shelfZs[i];
    const tall = i % 2 === 0;
    place(shelfUnit(SM, own, tall ? { w: 1.5, h: 2.1, d: sdep, seed: 3 + i, lamp: i === 0 } : { w: 1.5, h: 0.85, d: 0.42, seed: 9 + i, plant: true }), b.x1 - sdep / 2 - 0.02, zz, L);
  }
  place(shelfUnit(SM, own, { w: 1.4, h: 2.0, d: sdep, seed: 21, lamp: true }), A.x1 - sdep / 2 - 0.02, A.z0 + 1.5, L);
  place(shelfUnit(SM, own, { w: 1.4, h: 0.85, d: 0.42, seed: 25 }), A.x1 - 0.23, A.z0 + 3.0, L);

  // plants
  const plantGeos = () => {
    const pot = new THREE.CylinderGeometry(0.17, 0.13, 0.36, 18); pot.translate(0, 0.18, 0);
    const leaf = new THREE.SphereGeometry(1, 12, 8); leaf.scale(0.07, 0.34, 0.025); leaf.translate(0, 0.34, 0);
    return { pot, leaf };
  };
  const P = plantGeos(); own.push(P.pot, P.leaf);
  const plant = (x, z, s = 1) => {
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.scale.setScalar(s);
    const pot = new THREE.Mesh(P.pot, SM.pot); pot.castShadow = true; grp.add(pot);
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(P.leaf, SM.leaf); l.castShadow = true;
      l.rotation.set(0, i * 2.4, 0.25 + (i % 3) * 0.28); l.scale.y = 0.8 + (i % 4) * 0.2; grp.add(l);
    }
    g.add(grp); sway.push({ grp, phase: x * 1.7 + z });
  };
  plant(b.x0 + 0.45, b.z0 + 0.5, 1.15);
  plant(b.x0 + 0.45, b.z1 - 0.6, 0.95);
  plant(b.x1 - 0.5, b.z1 - 0.7, 1.0);
  plant(A.x1 - 0.45, A.z1 - 0.55, 1.1);
  return { group: g, own, wins, sway };
}


/**
 * Things that make the office feel alive: a real wall clock, a live wall screen, sunbeams through the
 * windows with drifting dust, plants that sway, a robot vacuum on patrol and a fish tank in the dining room.
 * Returns { group, own, update(t), setDark(dark) }.
 */
export function buildLively(b, A, SM, shell, obstacles = [], steamAt = []) {
  const g = new THREE.Group(), own = [];
  const mat = (o) => { const m = new THREE.MeshStandardMaterial(o); own.push(m); return m; };
  const basic = (o) => { const m = new THREE.MeshBasicMaterial(o); own.push(m); return m; };
  const geo = (x) => { own.push(x); return x; };
  const H = WALL_H, cx = (b.x0 + b.x1) / 2;

  // --- wall clock (real time) on the slatted wall, left of the screen
  const clock = new THREE.Group(); clock.position.set(b.x0 + 1.5, 2.55, b.z0 + 0.05); g.add(clock);
  const face = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 40)), mat({ color: '#F2EFE8', roughness: 0.5 })); face.rotation.x = Math.PI / 2; clock.add(face);
  const rim = new THREE.Mesh(geo(new THREE.TorusGeometry(0.3, 0.025, 10, 40)), SM.frame); clock.add(rim);
  const tickGeo = geo(new THREE.BoxGeometry(0.012, 0.04, 0.01));
  for (let i = 0; i < 12; i++) { const k = new THREE.Mesh(tickGeo, SM.frame); const a = i / 12 * Math.PI * 2; k.position.set(Math.sin(a) * 0.25, Math.cos(a) * 0.25, 0.03); k.rotation.z = -a; clock.add(k); }
  const hand = (len, wd, col) => { const gr = new THREE.Group(); const m = new THREE.Mesh(geo(new THREE.BoxGeometry(wd, len, 0.012)), col); m.position.y = len / 2 - 0.02; gr.add(m); gr.position.z = 0.04; clock.add(gr); return gr; };
  const hH = hand(0.17, 0.022, SM.frame), hM = hand(0.25, 0.015, SM.frame), hS = hand(0.27, 0.007, mat({ color: '#D9573A', roughness: 0.5 }));

  // --- live wall screen: time + a little animated bar chart
  const scr = SM.screen.map.image, sx = scr.getContext('2d'), scrTex = SM.screen.map;
  let lastScr = -1;
  const drawScreen = (t) => {
    const k = Math.floor(t * 2); if (k === lastScr) return; lastScr = k;
    const W = scr.width, Hh = scr.height, d = new Date();
    const gr = sx.createLinearGradient(0, 0, W, Hh); gr.addColorStop(0, '#0B1220'); gr.addColorStop(1, '#152447');
    sx.fillStyle = gr; sx.fillRect(0, 0, W, Hh);
    sx.fillStyle = '#EAF1FF'; sx.font = '600 44px -apple-system, Segoe UI, sans-serif'; sx.textAlign = 'left'; sx.textBaseline = 'middle';
    sx.fillText('DESKMATE', 28, 42);
    sx.font = '600 52px ui-monospace, Menlo, monospace'; sx.textAlign = 'right';
    sx.fillText(`${String(d.getHours()).padStart(2, '0')}${d.getSeconds() % 2 ? ':' : ' '}${String(d.getMinutes()).padStart(2, '0')}`, W - 28, 42);
    for (let i = 0; i < 22; i++) {
      const hgt = 10 + (Math.sin(t * 1.3 + i * 0.7) * 0.5 + 0.5) * 60 * (0.5 + 0.5 * Math.sin(i * 1.9 + 1));
      sx.fillStyle = i % 5 === 0 ? '#F0B35A' : '#6FA2FF'; sx.fillRect(28 + i * 21, Hh - 18 - hgt, 14, hgt);
    }
    scrTex.needsUpdate = true;
  };

  // --- soft sunbeams: for each window a feathered floor glow (with faint mullion shadows) plus two
  // airy ribbons that fade out toward the floor. Their strength, warmth, length and sweep follow the
  // real time of day and the weather (see update()).
  const patchTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
    x.filter = 'blur(14px)'; x.fillStyle = '#fff'; x.fillRect(40, 40, 176, 176);
    x.filter = 'blur(4px)'; x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,0.55)';
    for (const px of [92, 128, 164]) x.fillRect(px - 2.5, 30, 5, 196);
    x.fillRect(30, 124, 196, 5);
    const t = new THREE.CanvasTexture(c); own.push(t); return t;
  })();
  const patchMat = new THREE.MeshBasicMaterial({ map: patchTex, color: '#FFE9C4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); own.push(patchMat);
  const patchGeo = geo(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const ribMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); own.push(ribMat);
  const mkRibbon = () => {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3));
    bg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(24), 4));
    bg.setIndex([0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4]); own.push(bg);
    const m = new THREE.Mesh(bg, ribMat); m.renderOrder = 5; m.frustumCulled = false; g.add(m); return m;
  };
  const beams = shell.wins.map((wz) => {
    const patch = new THREE.Mesh(patchGeo, patchMat); patch.renderOrder = 4; patch.receiveShadow = false; g.add(patch);
    return { wz, patch, up: mkRibbon(), low: mkRibbon() };
  });
  const setRibbon = (m, p0, p1, w0, w1, col, a0) => {   // p0 at the window, p1 on the floor; 3 columns, edges feathered to 0
    const pos = m.geometry.attributes.position, colr = m.geometry.attributes.color;
    for (let r = 0; r < 2; r++) {
      const p = r ? p1 : p0, w = r ? w1 : w0, a = r ? 0 : a0;
      for (let c = 0; c < 3; c++) {
        const i = r * 3 + c;
        pos.setXYZ(i, p.x, p.y, p.z + (c - 1) * w);
        colr.setXYZW(i, col.r, col.g, col.b, c === 1 ? a : 0);
      }
    }
    pos.needsUpdate = true; colr.needsUpdate = true;
  };
  const N = 140, dp = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { seed[i * 3] = Math.random() * 6.28; seed[i * 3 + 1] = Math.random() * 6.28; seed[i * 3 + 2] = Math.random(); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3)); own.push(dg);
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: '#FFFFFF', size: 0.035, transparent: true, opacity: 0.4, depthWrite: false })); own.push(dust.material);
  dust.frustumCulled = false; g.add(dust);
  let dark = false, sunK = 0, warmK = 0;
  const cWarm = new THREE.Color('#FFC987'), cNoon = new THREE.Color('#FFF3DC'), cMoon = new THREE.Color('#9FB8FF'), tmpC = new THREE.Color();
  const WEATHER = { clear: 1, partly: 0.7, cloudy: 0.28, fog: 0.35, rain: 0.1, snow: 0.3, storm: 0.04 };

  // --- robot vacuum on a lazy loop across the front of the room
  const vac = new THREE.Group(); g.add(vac);
  const body = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 28)), mat({ color: '#E7E9EE', roughness: 0.4 })); body.position.y = 0.045; body.castShadow = true; vac.add(body);
  const lid = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.12, 0.12, 0.012, 24)), mat({ color: '#2B303A', roughness: 0.3 })); lid.position.y = 0.085; vac.add(lid);
  const led = new THREE.Mesh(geo(new THREE.SphereGeometry(0.014, 8, 6)), basic({ color: '#4FD6A0' })); led.position.set(0.0, 0.092, 0.07); vac.add(led);
  const bump = new THREE.Mesh(geo(new THREE.TorusGeometry(0.17, 0.008, 6, 28, Math.PI)), mat({ color: '#2B303A' })); bump.rotation.set(Math.PI / 2, 0, -Math.PI / 2); bump.position.y = 0.05; vac.add(bump);
  // roams the whole floor, main room and dining annex, bumping off furniture like a real robot vacuum
  const R = 0.22, WM = 0.6;                                   // robot radius + clearance kept from walls (shelves, plants)
  const tankBox = { x0: A.x0 + 0.2, x1: A.x0 + 1.5, z0: A.z0, z1: A.z0 + 0.9 };
  const curtain = { x0: b.x1 - 0.25, x1: b.x1 + 0.25, z0: A.z0, z1: A.z0 + 1.75 };
  const shelfZs = shelfLayout(b, A);   // so a lamp can stand beside the last bookcase
  // neon standing lamps in the corners (positions shared with the robot vacuum's no-go list)
  const lampPos = [
    [b.x0 + 1.0, b.z0 + 0.6], [b.x1 - 1.0, b.z0 + 0.6], [b.x0 + 1.0, b.z1 - 0.7], [b.x1 - 1.0, b.z1 - 0.7],
    [A.x1 - 1.0, A.z0 + 0.55], [A.x1 - 1.0, A.z1 - 0.7], [A.x0 + 1.0, A.z1 - 0.7],
    [b.x1 - 0.32, Math.min(shelfZs[shelfZs.length - 1] + 1.2, A.z0 - 0.4)],   // past the last bookcase, towards the curtain
  ];
  const blocks = [...obstacles, tankBox, curtain, ...lampPos.map(([x, z]) => ({ x0: x - 0.18, x1: x + 0.18, z0: z - 0.18, z1: z + 0.18 }))];
  const free = (x, z) => {
    const inMain = x > b.x0 + WM && x < b.x1 - WM && z > b.z0 + WM && z < b.z1 - WM;
    const inAnnex = x > b.x1 - WM - 0.01 && x < A.x1 - WM && z > A.z0 + WM && z < A.z1 - WM;
    if (!inMain && !inAnnex) return false;
    for (const o of blocks) if (x > o.x0 - R && x < o.x1 + R && z > o.z0 - R && z < o.z1 + R) return false;
    return true;
  };
  const rob = { x: cx, z: b.z1 - 0.95, h: 0, turn: 0, pause: 0, lastT: 0, stuck: 0, steerAt: 4, wanderUntil: 5, route: null };
  for (let i = 0; i < 80 && !free(rob.x, rob.z); i++) { rob.x = b.x0 + WM + Math.random() * (b.x1 - b.x0 - 2 * WM); rob.z = b.z0 + WM + Math.random() * (b.z1 - b.z0 - 2 * WM); }
  rob.h = Math.random() * 6.28;
  const rnd = Math.random;
  // coarse grid over the whole L so it can plan a route round desks, rooms and through the doorway
  const CS = 0.3, GW = Math.ceil((A.x1 - b.x0) / CS), GH = Math.ceil((b.z1 - b.z0) / CS);
  const cellOk = new Uint8Array(GW * GH);
  const cx2x = (i) => b.x0 + (i + 0.5) * CS, cz2z = (j) => b.z0 + (j + 0.5) * CS;
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) cellOk[j * GW + i] = free(cx2x(i), cz2z(j)) ? 1 : 0;
  const cellOf = (x, z) => [Math.max(0, Math.min(GW - 1, Math.floor((x - b.x0) / CS))), Math.max(0, Math.min(GH - 1, Math.floor((z - b.z0) / CS)))];
  const planRoute = () => {   // BFS flood from the robot; pick a reachable destination (often in the dining room) and return its route
    const [si, sj] = cellOf(rob.x, rob.z), start = sj * GW + si;
    const prev = new Int32Array(GW * GH).fill(-2); prev[start] = -1;
    const q = [start], reach = [];
    for (let h = 0; h < q.length; h++) {
      const c = q[h], ci = c % GW, cj = (c / GW) | 0; reach.push(c);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH || prev[nj * GW + ni] !== -2 || !cellOk[nj * GW + ni]) continue;
        if (di && dj && (!cellOk[cj * GW + ni] || !cellOk[nj * GW + ci])) continue;   // no cutting corners
        prev[nj * GW + ni] = c; q.push(nj * GW + ni);
      }
    }
    if (reach.length < 4) return null;
    const annexCells = reach.filter(c => cx2x(c % GW) > b.x1 + 0.4), pool = annexCells.length && rnd() < 0.4 ? annexCells : reach;
    let goal = pool[(rnd() * pool.length) | 0];
    const path = [];
    for (let c = goal; c !== -1 && c !== start; c = prev[c]) path.push({ x: cx2x(c % GW), z: cz2z((c / GW) | 0) });
    return path.reverse();
  };

  // --- fish tank in the dining room
  const tank = new THREE.Group(); tank.position.set(A.x0 + 0.85, 0, A.z0 + 0.32); g.add(tank);
  const stand = new THREE.Mesh(geo(new THREE.BoxGeometry(1.0, 0.7, 0.4)), SM.shelf); stand.position.y = 0.35; stand.castShadow = true; tank.add(stand);
  const water = new THREE.Mesh(geo(new THREE.BoxGeometry(0.92, 0.5, 0.34)), mat({ color: '#6EC5E8', transparent: true, opacity: 0.35, roughness: 0.1, depthWrite: false })); water.position.y = 0.97; water.renderOrder = 4; tank.add(water);
  const sand = new THREE.Mesh(geo(new THREE.BoxGeometry(0.92, 0.05, 0.34)), mat({ color: '#E8D8B0', roughness: 1 })); sand.position.y = 0.745; tank.add(sand);
  for (const tx of [-0.5, 0.5]) { const fr = new THREE.Mesh(geo(new THREE.BoxGeometry(0.03, 0.56, 0.03)), SM.frame); fr.position.set(tx * 0.94, 0.98, 0.18); tank.add(fr); }
  const light = new THREE.Mesh(geo(new THREE.BoxGeometry(0.96, 0.03, 0.38)), basic({ color: '#BFE9FF' })); light.position.y = 1.24; tank.add(light);
  const weedG = geo(new THREE.SphereGeometry(1, 8, 6)); weedG.scale(0.025, 0.14, 0.012);
  for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(weedG, SM.leaf); w.position.set(-0.35 + i * 0.14, 0.88, (i % 2 ? 0.07 : -0.07)); w.rotation.z = (i - 3) * 0.08; tank.add(w); }
  const fishG = geo(new THREE.SphereGeometry(1, 10, 8)); fishG.scale(0.06, 0.032, 0.02);
  const tailG = geo(new THREE.ConeGeometry(0.03, 0.06, 6)); tailG.rotateZ(Math.PI / 2); tailG.translate(-0.07, 0, 0);
  const fish = ['#F08A3C', '#F4C542', '#5CA8F0', '#F06C8C', '#F08A3C'].map((c, i) => {
    const fm = mat({ color: c, roughness: 0.4 });
    const f = new THREE.Group(); f.add(new THREE.Mesh(fishG, fm)); f.add(new THREE.Mesh(tailG, fm)); tank.add(f);
    return { f, ph: i * 1.7, sp: 0.35 + i * 0.07, y: 0.88 + (i % 3) * 0.1, z: (i % 2 ? 0.06 : -0.06) };
  });

  // --- coffee steam: a few soft puffs per source, rising and fading (additive, so black = invisible)
  const SP = 6, SN = steamAt.length * SP, sp = new Float32Array(SN * 3), sc = new Float32Array(SN * 3);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3)); own.push(sg);
  const steamPts = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTexture(), size: 0.11, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); own.push(steamPts.material);
  steamPts.frustumCulled = false; if (SN) g.add(steamPts);
  // --- warm-white neon standing lamps: a bright tube, a big soft halo and a pool of light on the floor
  const tubeMat = basic({ color: '#FFF0D2' });
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#FFD59A', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }); own.push(haloMat);
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: '#FFC983', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }); own.push(poolMat);
  const poolGeo = geo(new THREE.PlaneGeometry(3.6, 3.6).rotateX(-Math.PI / 2));
  const baseG = geo(new THREE.CylinderGeometry(0.16, 0.19, 0.03, 24)), poleG = geo(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8)), tubeG = geo(new THREE.CapsuleGeometry(0.02, 0.95, 6, 12)), capG = geo(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 12));
  const lampMat = mat({ color: '#18283D', roughness: 0.45, metalness: 0.4 });
  for (const [lx, lz] of lampPos) {
    const L = new THREE.Group(); L.position.set(lx, 0, lz); g.add(L);
    const bs = new THREE.Mesh(baseG, lampMat); bs.position.y = 0.015; bs.castShadow = true; L.add(bs);
    const pl = new THREE.Mesh(poleG, lampMat); pl.position.y = 0.53; L.add(pl);
    for (const y of [1.0, 1.98]) { const c = new THREE.Mesh(capG, lampMat); c.position.y = y; L.add(c); }
    const tb = new THREE.Mesh(tubeG, tubeMat); tb.position.y = 1.49; L.add(tb);
    const hl = new THREE.Sprite(haloMat); hl.position.y = 1.5; hl.scale.set(1.5, 2.3, 1); hl.renderOrder = 6; L.add(hl);
    const pool = new THREE.Mesh(poolGeo, poolMat); pool.position.y = 0.009; pool.renderOrder = 3; L.add(pool);
  }
  const tmpD = new THREE.Vector3();
  return {
    group: g, own, robot: rob, free,
    setDark(d) { dark = d; },
    update(t, env = {}) {
      // clock (real time)
      const d = new Date(), sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
      hS.rotation.z = -sec / 60 * Math.PI * 2; hM.rotation.z = -min / 60 * Math.PI * 2; hH.rotation.z = -hr / 12 * Math.PI * 2;
      drawScreen(t);
      // ---- sun position + strength from the clock and the weather
      const h = env.hour ?? (d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600);
      const day = h >= 6 && h <= 19, u = THREE.MathUtils.clamp((h - 6) / 13, 0, 1), arc = Math.sin(Math.PI * u);   // 0 at the edges → 1 at midday
      const wx = WEATHER[env.kind] ?? 1;
      let target = day ? (0.18 + 0.82 * arc) * wx : 0.1 * (WEATHER[env.kind] != null ? Math.min(1, wx * 2) : 1);   // faint moonlight at night
      // drifting cloud shadows: partly cloudy swings widely, clear days only shimmer
      const gust = env.kind === 'partly' ? 0.55 + 0.45 * Math.sin(t * 0.22) ** 2 : 0.93 + 0.07 * Math.sin(t * 0.31);
      target *= gust;
      const ease = env.hour !== undefined ? 1 : 0.04;   // a debug hour snaps straight to its look
      sunK += (target - sunK) * ease;
      warmK += ((day ? 1 - arc : 0) - warmK) * ease;
      const shade = dark ? 0.7 : 1;
      tmpC.copy(day ? cNoon : cMoon).lerp(cWarm, day ? Math.pow(warmK, 0.8) : 0);
      const len = 4.4 - 2.3 * arc, shift = (u - 0.5) * 2.2, sweep = Math.atan2(shift, len);   // low sun = long, sliding beams
      const x0 = b.x0 + 0.05, pl = len * 0.78;
      patchMat.color.copy(tmpC); patchMat.opacity = Math.min(0.6, sunK * 0.5 * shade);
      for (const bm of beams) {
        bm.patch.position.set(x0 + pl * 0.5 + 0.35, 0.006, bm.wz + shift * 0.9);
        bm.patch.scale.set(pl, 1, 1.35); bm.patch.rotation.y = -sweep * 0.8;
        const fx = x0 + len, fz = bm.wz + shift;
        const a0 = Math.min(0.16, sunK * 0.14 * shade);
        setRibbon(bm.up, new THREE.Vector3(x0, 2.55, bm.wz), new THREE.Vector3(fx, 0.01, fz), 0.46, 0.58, tmpC, a0);
        setRibbon(bm.low, new THREE.Vector3(x0, 0.7, bm.wz), new THREE.Vector3(x0 + len * 0.5, 0.01, bm.wz + shift * 0.5), 0.46, 0.56, tmpC, a0 * 0.8);
      }
      // the neon lamps glow brighter as daylight fades, with a faint hum
      const glowK = 0.45 + 0.55 * (1 - Math.min(1, sunK)), hum = 0.97 + 0.03 * Math.sin(t * 9.3);
      haloMat.opacity = 0.62 * glowK * hum; poolMat.opacity = 0.5 * glowK * hum * (dark ? 1.2 : 1);
      dust.material.opacity = (0.12 + 0.5 * sunK) * (dark ? 0.8 : 1);
      dust.material.color.copy(tmpC).lerp(new THREE.Color('#fff'), 0.4);
      for (let i = 0; i < N; i++) {
        const a = seed[i * 3], c = seed[i * 3 + 1], k = seed[i * 3 + 2];
        const wi = shell.wins[i % shell.wins.length] ?? 0;
        const along = (k * 3.2 + t * 0.05 * (0.5 + k)) % 3.2;
        dp[i * 3] = b.x0 + 0.3 + along;
        dp[i * 3 + 1] = Math.max(0.1, 2.2 * (1 - along / 3.4) * (0.4 + 0.6 * Math.sin(a + t * 0.25 * (0.4 + k)) ** 2) + 0.2);
        dp[i * 3 + 2] = wi + shift * (along / len) + Math.sin(c + t * 0.2) * 0.45;
      }
      dg.attributes.position.needsUpdate = true;
      // plants sway
      for (const s of shell.sway) { s.grp.rotation.z = Math.sin(t * 0.9 + s.phase) * 0.025; s.grp.rotation.x = Math.cos(t * 0.7 + s.phase) * 0.02; }
      // vacuum: drive straight, bump-and-turn off anything in the way, now and then wander off on a new heading
      const dtv = Math.min(0.1, Math.max(0, t - rob.lastT)); rob.lastT = t;
      if (rob.pause > 0) rob.pause -= dtv;
      else if (rob.route && rob.route.length) {
        // following a planned route: steer at the next waypoint, easing round corners
        const w = rob.route[0], want = Math.atan2(w.x - rob.x, w.z - rob.z);
        let dd = ((want - rob.h + Math.PI) % (Math.PI * 2)); if (dd < 0) dd += Math.PI * 2; dd -= Math.PI;
        rob.h += Math.max(-3.2 * dtv, Math.min(3.2 * dtv, dd));
        const sp = 0.7 * Math.max(0.25, 1 - Math.abs(dd) / 1.4);
        const rx = rob.x + Math.sin(rob.h) * sp * dtv, rz = rob.z + Math.cos(rob.h) * sp * dtv;
        if (free(rx, rz)) { rob.x = rx; rob.z = rz; }
        else { rob.route = null; rob.pause = 0.3; rob.wanderUntil = t + 1; }   // clipped a corner: stop and re-plan
        if (rob.route && Math.hypot(w.x - rob.x, w.z - rob.z) < 0.18) rob.route.shift();
        if (rob.route && !rob.route.length) { rob.route = null; rob.pause = 0.6 + rnd(); rob.wanderUntil = t + 6 + rnd() * 14; }
      } else {
        if (t > rob.wanderUntil) { rob.route = planRoute(); rob.wanderUntil = t + 30; if (rob.route) rob.h = rob.h; }
        const sp = 0.6, look = 0.28;
        const nx = rob.x + Math.sin(rob.h) * (sp * dtv + look), nz = rob.z + Math.cos(rob.h) * (sp * dtv + look);
        if (!free(nx, nz)) {
          // blocked ahead: spin to a fresh heading (try a few until the way is clear)
          let h = rob.h, ok = false;
          for (let k = 0; k < 10 && !ok; k++) { h = rob.h + (rnd() > 0.5 ? 1 : -1) * (1.2 + rnd() * 1.9); ok = free(rob.x + Math.sin(h) * look, rob.z + Math.cos(h) * look); }
          rob.h = h; rob.pause = 0.25 + rnd() * 0.3; rob.stuck = ok ? 0 : rob.stuck + 1;
          if (rob.stuck > 6) { for (let i = 0; i < 80; i++) { const x = b.x0 + WM + rnd() * (A.x1 - b.x0 - 2 * WM), z = b.z0 + WM + rnd() * (b.z1 - b.z0 - 2 * WM); if (free(x, z)) { rob.x = x; rob.z = z; break; } } rob.stuck = 0; }
        } else {
          rob.x += Math.sin(rob.h) * sp * dtv; rob.z += Math.cos(rob.h) * sp * dtv;
          if (t > rob.steerAt) { rob.h += (rnd() - 0.5) * 1.4; rob.steerAt = t + 3 + rnd() * 6; }
        }
      }
      let dh = ((rob.h - vac.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI; if (dh < -Math.PI) dh += Math.PI * 2;
      vac.rotation.y += dh * Math.min(1, dtv * 8);
      vac.position.set(rob.x, 0.003 + (rob.pause > 0 ? 0 : Math.sin(t * 9) * 0.0015), rob.z);
      led.material.color.set(Math.sin(t * 3) > 0 ? '#4FD6A0' : '#2B8F6B');
      // steam
      for (let i = 0; i < SN; i++) {
        const src = steamAt[(i / SP) | 0], ph = (t * 0.45 + (i % SP) / SP + i * 0.137) % 1, k = Math.sin(ph * Math.PI);   // 0 → 1 → 0 over the puff's life
        sp[i * 3] = src[0] + Math.sin(ph * 6 + i) * 0.03 * ph;
        sp[i * 3 + 1] = src[1] + ph * 0.34;
        sp[i * 3 + 2] = src[2] + Math.cos(ph * 5 + i * 1.3) * 0.03 * ph;
        const v = 0.28 * k * (dark ? 0.8 : 1); sc[i * 3] = sc[i * 3 + 1] = sc[i * 3 + 2] = v;
      }
      if (SN) { sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true; }
      // fish
      for (const f of fish) {
        const u = t * f.sp + f.ph, x = Math.sin(u) * 0.38;
        f.f.position.set(x, f.y + Math.sin(u * 2.3) * 0.04, f.z);
        f.f.rotation.y = Math.cos(u) > 0 ? 0 : Math.PI;
        f.f.rotation.z = Math.sin(u * 5) * 0.08;
      }
    },
  };
}
