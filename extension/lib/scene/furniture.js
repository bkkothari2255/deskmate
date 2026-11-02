// Furniture for the office diorama. Geometry is built once per page and shared by every
// workstation: static desk props are baked (per surface class) into a single vertex-coloured
// geometry that the scene draws with one InstancedMesh for the whole team.
//
// Workstation space: the seated teammate is at the origin facing +z (towards the camera);
// the desk top (y = DESK_TOP) spans z ≈ 0.21 … 0.89.
import { THREE, C, roundedBox, roundedCylinder, lathe, sphere, cylinder, torus, bake, rod, roundedRectShape } from './kit.js';

export const DESK_TOP = 0.785;
export const DESK = { w: 1.12, d: 0.68, z: 0.55 };
export const LID_PIVOT = [0, 0.801, 0.475];
export const LID = { w: 0.4, h: 0.255 };
export const MUG_AT = [0.46, DESK_TOP, 0.36];
export const PLANT_AT = [-0.43, DESK_TOP, 0.56];
export const SHADE_AT = [-0.37, 1.13, 0.34];
export const GLOW_AT = [-0.34, 1.1, 0.34];
export const PET_AT = [0.42, DESK_TOP, 0.6];
export const PHONES_AT = [0.14, 0.801, 0.72];
export const ACC_AT = [0.34, DESK_TOP, 0.8];   // where each person's own desk object sits
export const DND_AT = [-0.3, DESK_TOP, 0.74];

/** Four little personal desk objects (succulent, framed photo, figurine, book stack), one per person by hash. */
let ACC = null;
export function deskAccessories() {
  if (ACC) return ACC;
  const stem = (x, y0, h, c) => rod([x, y0, 0], [x * 1.2, y0 + h, 0.01], 0.003, c, 5);
  ACC = [
    bake([   // succulent in a terracotta pot
      { g: lathe([[0, 0], [0.03, 0], [0.04, 0.05], [0.036, 0.055], [0, 0.05]], 14, 'accPot'), c: '#C98B62' },
      ...[0, 1, 2, 3, 4].map(i => ({ g: sphere(0.026, 10, 8), c: i % 2 ? '#7FA593' : '#9DBDAD', p: [Math.cos(i * 1.26) * 0.02, 0.07 + (i % 2) * 0.012, Math.sin(i * 1.26) * 0.02], s: [0.7, 1.2, 0.7] })),
    ]),
    bake([   // framed photo on a little easel
      { g: roundedBox(0.11, 0.085, 0.01, 0.004), c: '#754B36', p: [0, 0.05, 0], r: [-0.2, 0, 0] },
      { g: roundedBox(0.09, 0.065, 0.011, 0.003), c: '#8FB3D6', p: [0, 0.05, 0.001], r: [-0.2, 0, 0] },
      { g: roundedBox(0.04, 0.03, 0.011, 0.003), c: '#E8B878', p: [0.012, 0.043, 0.002], r: [-0.2, 0, 0] },
    ]),
    bake([   // amber figurine on a walnut plinth
      { g: roundedBox(0.07, 0.014, 0.07, 0.005), c: '#754B36', p: [0, 0.007, 0] },
      { g: sphere(0.026, 14, 10), c: '#E8B878', p: [0, 0.04, 0], s: [1, 1.15, 1] },
      { g: sphere(0.015, 12, 8), c: '#E8B878', p: [0, 0.075, 0] },
    ]),
    bake([   // book stack
      { g: roundedBox(0.12, 0.022, 0.085, 0.004), c: '#263C55', p: [0, 0.011, 0] },
      { g: roundedBox(0.105, 0.02, 0.08, 0.004), c: '#D6BFA0', p: [0.004, 0.032, 0], r: [0, 0.1, 0] },
      { g: roundedBox(0.095, 0.018, 0.07, 0.004), c: '#9DBDAD', p: [-0.003, 0.051, 0], r: [0, -0.15, 0] },
    ]),
  ];
  void stem;
  return ACC;
}

let WS = null;
/** Shared geometry for one workstation (cached). */
export function workstationKit() {
  if (WS) return WS;
  const T = DESK_TOP;
  // --- matte: walnut desk top, felt modesty panel, notebook
  const matte = bake([
    { g: roundedBox(DESK.w, 0.05, DESK.d, 0.024, 3), c: C.walnut, p: [0, T - 0.025, DESK.z] },
    { g: roundedBox(DESK.w - 0.08, 0.012, DESK.d - 0.08, 0.005), c: C.walnutDark, p: [0, T - 0.056, DESK.z] },      // shadow-gap under the slab
    { g: roundedBox(0.78, 0.005, 0.34, 0.0025), c: '#2B3038', p: [0, T + 0.0025, 0.45] },                           // leather desk mat
    { g: roundedBox(0.78, 0.0012, 0.006, 0.0005), c: '#C9A66B', p: [0, T + 0.0054, 0.285] },                        // brass stitch line
    { g: roundedBox(0.96, 0.3, 0.02, 0.008), c: C.sage, p: [0, 0.55, 0.82] },
    { g: roundedBox(0.15, 0.012, 0.205, 0.004), c: C.paper, p: [0.14, T + 0.006, 0.72], r: [0, -0.2, 0] },
    { g: roundedBox(0.155, 0.004, 0.21, 0.0018), c: C.slate, p: [0.14, T + 0.014, 0.72], r: [0, -0.2, 0] },
  ]);
  // --- satin: legs, laptop base, keyboard deck, trackpad, mouse, lamp base + arm
  // sit-stand style frame: two slim slab legs on long feet, and a cable tray
  const legs = [];
  for (const x of [-0.5, 0.5]) {
    legs.push({ g: roundedBox(0.045, T - 0.085, 0.46, 0.014, 3), c: C.graphite, p: [x, (T - 0.085) / 2 + 0.03, 0.55] });
    legs.push({ g: roundedBox(0.07, 0.032, 0.66, 0.014, 3), c: C.graphite, p: [x, 0.016, 0.55] });
    legs.push({ g: roundedBox(0.075, 0.03, 0.5, 0.012), c: C.steelDark, p: [x, T - 0.08, 0.55] });
  }
  legs.push({ g: roundedBox(0.96, 0.04, 0.05, 0.012), c: C.graphite, p: [0, T - 0.09, 0.83] });
  legs.push({ g: roundedBox(0.62, 0.045, 0.13, 0.012, 3), c: C.graphite, p: [0, T - 0.105, 0.72] });
  const elbow = [-0.49, 1.1, 0.26], armEnd = [-0.39, 1.18, 0.34];
  const satin = bake([
    ...legs,
    { g: roundedBox(0.4, 0.016, 0.27, 0.006), c: C.steel, p: [0, T + 0.008, 0.34] },
    { g: roundedBox(0.34, 0.003, 0.1, 0.001), c: C.keys, p: [0, T + 0.0165, 0.395] },
    { g: roundedBox(0.12, 0.002, 0.065, 0.0009), c: C.steelDark, p: [0, T + 0.0163, 0.27] },
    { g: sphere(0.03, 16, 10), c: '#E4E6E9', p: [0.3, T + 0.006, 0.34], s: [0.7, 0.38, 1.05] },
    { g: roundedCylinder(0.055, 0.014, 0.006, 24), c: C.graphite, p: [-0.47, T, 0.27] },
    rod([-0.47, T + 0.01, 0.27], elbow, 0.008, C.graphite),
    rod(elbow, armEnd, 0.007, C.graphite),
    { g: sphere(0.014, 10, 8), c: C.graphite, p: elbow },
  ]);
  // --- headphones resting on the notebook (instanced; hidden while worn)
  const ph = new THREE.Matrix4().compose(new THREE.Vector3(...PHONES_AT), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -0.2, 0)), new THREE.Vector3(1, 1, 1));
  const at = (g, c, p, r = [0, 0, 0]) => ({ g, c, m: ph.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1))) });
  const phones = bake([
    at(torus(0.07, 0.009, 8, 24, Math.PI), C.graphite, [0, 0.009, 0], [-Math.PI / 2, 0, 0]),
    at(roundedCylinder(0.038, 0.024, 0.009, 20), C.slate, [0.07, 0, 0]),
    at(roundedCylinder(0.038, 0.024, 0.009, 20), C.slate, [-0.07, 0, 0]),
  ]);
  // --- laptop lid (pivot at its hinge), screen + logo planes
  const lid = roundedBox(LID.w, LID.h, 0.012, 0.006);
  const screen = new THREE.PlaneGeometry(LID.w - 0.03, LID.h - 0.035);
  const logo = new THREE.CircleGeometry(0.02, 24);
  // --- mug (ceramic, coffee, handle)
  const mug = bake([
    { g: lathe([[0, 0.001], [0.036, 0], [0.043, 0.006], [0.045, 0.094], [0.042, 0.098], [0.039, 0.092], [0.038, 0.076], [0, 0.076]], 24, 'mug'), c: C.ceramic },
    { g: cylinder(0.038, 0.038, 0.003, 20), c: C.coffee, p: [0, 0.079, 0] },
    { g: torus(0.026, 0.0075, 8, 14, Math.PI), c: C.ceramic, p: [0.044, 0.05, 0], r: [0, 0, -Math.PI / 2] },
  ]);
  // --- gaming chair: racing-style bucket seat + tall back with headrest and lumbar pillows.
  // Tinted fabric = seat/back centre panels + pillows; the dark frame carries side bolsters, arms, base.
  const wrapGeo = (geo, k) => {            // curve a panel gently around the sitter (z += k·x²), tilting normals
    const g = geo.clone(), pos = g.attributes.position, nor = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setZ(i, pos.getZ(i) + x * x * k);
      const n = new THREE.Vector3(nor.getX(i), nor.getY(i), nor.getZ(i));
      n.x -= 2 * k * x * n.z; n.normalize();
      nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  };
  const backPanel = wrapGeo(roundedBox(0.34, 0.66, 0.07, 0.03, 3), 0.5);
  const headPillow = wrapGeo(roundedBox(0.25, 0.13, 0.075, 0.035, 3), 0.8);
  const lumbarPillow = wrapGeo(roundedBox(0.28, 0.11, 0.07, 0.035, 3), 0.8);
  const chairFabric = bake([
    { g: roundedBox(0.36, 0.08, 0.46, 0.035, 3), c: '#ffffff', p: [0, 0.432, 0.01], r: [0.03, 0, 0] },
    { g: backPanel, c: '#ffffff', p: [0, 0.9, -0.265], r: [-0.14, 0, 0] },
    { g: headPillow, c: '#ffffff', p: [0, 1.285, -0.335], r: [-0.14, 0, 0] },
    { g: lumbarPillow, c: '#ffffff', p: [0, 0.64, -0.215], r: [-0.14, 0, 0] },
  ]);
  for (const g of [backPanel, headPillow, lumbarPillow]) g.dispose();
  const ACCENT = '#D9573A';
  const frame = [
    // seat pan + raised side bolsters
    { g: roundedBox(0.44, 0.03, 0.42, 0.012), c: C.graphite, p: [0, 0.385, 0.01] },
    ...[-1, 1].flatMap((sx) => [
      { g: roundedBox(0.085, 0.09, 0.46, 0.035, 3), c: C.graphite, p: [sx * 0.235, 0.445, 0.01], r: [0.03, 0, sx * -0.18] },
      { g: roundedBox(0.012, 0.012, 0.36, 0.005), c: ACCENT, p: [sx * 0.222, 0.495, 0.02], r: [0.03, 0, sx * -0.18] },
      // back wings: sweep forward and rise to the shoulders, then taper up the headrest
      { g: roundedBox(0.085, 0.62, 0.13, 0.035, 3), c: C.graphite, p: [sx * 0.235, 0.86, -0.235], r: [-0.14, sx * 0.1, sx * 0.05] },
      { g: roundedBox(0.012, 0.5, 0.012, 0.005), c: ACCENT, p: [sx * 0.222, 0.86, -0.173], r: [-0.14, sx * 0.1, sx * 0.05] },
      { g: roundedBox(0.07, 0.17, 0.1, 0.03, 3), c: C.graphite, p: [sx * 0.15, 1.28, -0.33], r: [-0.14, sx * 0.25, 0] },
      // armrests: post, pad (4D arms)
      { g: roundedBox(0.04, 0.2, 0.05, 0.015), c: C.graphite, p: [sx * 0.31, 0.5, -0.04] },
      { g: roundedBox(0.075, 0.035, 0.27, 0.016, 3), c: C.graphite, p: [sx * 0.31, 0.62, 0.02] },
    ]),
    // spine behind the back, tilt mechanism, gas lift, base hub
    rod([0, 0.385, -0.12], [0, 0.55, -0.31], 0.018, C.graphite),
    rod([0, 0.55, -0.31], [0, 1.3, -0.4], 0.016, C.graphite),
    { g: roundedBox(0.2, 0.05, 0.22, 0.015), c: C.graphite, p: [0, 0.35, -0.02] },
    { g: cylinder(0.03, 0.034, 0.26, 14), c: C.steelDark, p: [0, 0.21, 0] },
    { g: cylinder(0.04, 0.044, 0.07, 14), c: C.steel, p: [0, 0.3, 0] },
    { g: cylinder(0.048, 0.056, 0.05, 16), c: C.graphite, p: [0, 0.075, 0] },
  ];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const ex = Math.sin(a) * 0.3, ez = Math.cos(a) * 0.3;
    frame.push(rod([0, 0.075, 0], [ex, 0.06, ez], 0.02, C.graphite, 8));
    frame.push({ g: roundedCylinder(0.026, 0.026, 0.012, 10), c: C.graphite, p: [ex, 0.004, ez] });   // caster
    frame.push({ g: sphere(0.02, 10, 8), c: C.steelDark, p: [ex, 0.02, ez] });
  }
  const chairFrame = bake(frame);
  // --- lamp head: dome shade + bulb (glows when on)
  const shade = bake([
    { g: lathe([[0, 0.058], [0.022, 0.056], [0.045, 0.046], [0.061, 0.022], [0.068, 0.0], [0.064, 0.0]], 24, 'shade'), c: C.ivory },
    { g: sphere(0.022, 12, 8), c: '#FFF4DE', p: [0, 0.006, 0] },
  ]);
  // --- soft contact shadow under each desk + chair
  const blob = new THREE.PlaneGeometry(1.5, 1.35); blob.rotateX(-Math.PI / 2); blob.translate(0, 0.006, 0.28);
  WS = { matte, satin, phones, lid, screen, logo, mug, chairFabric, chairFrame, shade, blob };
  return WS;
}

// ------------------------------------------------------------------ lounge
export const LOUNGE = { top: 0.62, slotR: 0.95, extent: { x0: -1.5, x1: 1.5, z0: -1.95, z1: 1.4 } };
export const CUPS_AT = [[0.12, 0.08, 0.3], [-0.24, 0.17, 2.2], [0.25, -0.18, 4.1], [-0.1, -0.27, 1.2]];
export const STATION_AT = [0.15, -1.62];
export const ARC_SHADE_AT = [0, 2.0, 0];

function armchair(fab, cushion, out) {
  const parts = [
    { g: roundedBox(0.66, 0.24, 0.6, 0.05, 3), c: fab, p: [0, 0.22, -0.02] },
    { g: roundedBox(0.5, 0.1, 0.5, 0.04, 3), c: cushion, p: [0, 0.4, 0.04] },
    { g: roundedBox(0.66, 0.42, 0.14, 0.06, 3), c: fab, p: [0, 0.56, -0.27], r: [-0.15, 0, 0] },
    { g: roundedBox(0.11, 0.2, 0.56, 0.045, 3), c: fab, p: [-0.3, 0.42, -0.01] },
    { g: roundedBox(0.11, 0.2, 0.56, 0.045, 3), c: fab, p: [0.3, 0.42, -0.01] },
  ];
  for (const x of [-0.27, 0.27]) for (const z of [-0.26, 0.22]) parts.push({ g: cylinder(0.018, 0.012, 0.11, 8), c: C.walnutDark, p: [x, 0.055, z] });
  return out(parts);
}

function placed(parts, x, z, rotY) {
  const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, 0, z);
  return parts.map(pt => {
    const sc = pt.s === undefined ? [1, 1, 1] : typeof pt.s === 'number' ? [pt.s, pt.s, pt.s] : pt.s;
    const local = pt.m ? pt.m.clone() : new THREE.Matrix4().compose(new THREE.Vector3(...(pt.p || [0, 0, 0])), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(pt.r || [0, 0, 0]))), new THREE.Vector3(...sc));
    return { g: pt.g, c: pt.c, m: m.clone().multiply(local) };
  });
}

function leafyPlant(x, z, y0, scale, rnd) {
  const parts = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const a = i * 2.39996, k = i / n;
    const h = (0.35 + k * 0.85) * scale;
    const r = (0.05 + (1 - k) * 0.12) * scale;
    const lx = x + Math.cos(a) * r, lz = z + Math.sin(a) * r;
    parts.push(rod([x, y0, z], [lx, y0 + h, lz], 0.006 * scale + 0.002, C.leafDark, 6));
    parts.push({ g: sphere(0.09, 14, 10), c: [C.leaf, C.leafDark, C.leafLight][i % 3], p: [lx + Math.cos(a) * 0.05 * scale, y0 + h, lz + Math.sin(a) * 0.05 * scale], r: [0.5 + rnd() * 0.4, a, 0.3], s: [0.55 * scale, 0.16 * scale, 1.1 * scale] });
  }
  return parts;
}

/** Build the coffee & relaxation lounge. Returns meshes + seat slots + interactive bits. */
export function buildLounge(S, { compact = false } = {}) {
  const group = new THREE.Group();
  const T = LOUNGE.top;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const mesh = (geo, mat, { cast = true, receive = true } = {}) => {
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; group.add(m); return m;
  };

  // seat slots around the table (same angles as the old café)
  const slots = [];
  const fabric = [], matte = [], satin = [], gloss = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 0.35 + i * (Math.PI * 2 / 6);
    const x = Math.cos(a) * LOUNGE.slotR, z = Math.sin(a) * LOUNGE.slotR;
    const rotY = Math.atan2(-x, -z);
    slots.push({ x, z, rotY });
    // the two slots nearest the camera get low poufs so they never hide the table
    if (z > 0.5) fabric.push(...placed([{ g: roundedCylinder(0.23, 0.44, 0.09, 32), c: i % 2 ? C.fabricBeige : C.fabricSage }], x, z, rotY));
    else armchair(i % 2 ? C.fabricBlue : C.fabricBeige, i % 2 ? '#93A7BA' : '#D8C6B1', parts => fabric.push(...placed(parts, x, z, rotY)));
  }

  // coffee station: walnut cabinet, stone top, espresso machine
  const [sx, sz] = STATION_AT;
  const top = 0.835;
  matte.push(
    { g: roundedBox(0.95, 0.8, 0.4, 0.025, 3), c: C.walnut, p: [sx, 0.4, sz] },
    { g: roundedBox(0.99, 0.035, 0.43, 0.012), c: '#ECE7DE', p: [sx, top - 0.0175, sz] },
    { g: roundedBox(0.008, 0.6, 0.004, 0.002), c: C.walnutDark, p: [sx, 0.4, sz + 0.201] },
  );
  const mx = sx + 0.18;
  satin.push(
    { g: roundedBox(0.26, 0.26, 0.22, 0.03, 3), c: C.steel, p: [mx, top + 0.13, sz - 0.03] },
    { g: roundedBox(0.24, 0.02, 0.2, 0.008), c: C.graphite, p: [mx, top + 0.27, sz - 0.03] },
    { g: cylinder(0.028, 0.028, 0.035, 16), c: C.graphite, p: [mx, top + 0.15, sz + 0.1] },
    { g: roundedBox(0.2, 0.02, 0.09, 0.006), c: C.graphite, p: [mx, top + 0.01, sz + 0.12] },
    rod([mx, top + 0.13, sz + 0.11], [mx + 0.1, top + 0.125, sz + 0.2], 0.009, C.graphite, 8),
  );
  // chalkboard menu leaning beside the station + a pastry stand on the counter
  matte.push(
    { g: roundedBox(0.5, 0.7, 0.03, 0.012), c: C.walnut, p: [sx - 0.82, 0.36, sz + 0.12], r: [-0.14, 0.25, 0] },
    { g: roundedBox(0.44, 0.62, 0.012, 0.006), c: '#18283D', p: [sx - 0.82, 0.37, sz + 0.135], r: [-0.14, 0.25, 0] },
    ...[0, 1, 2, 3].map(i => ({ g: roundedBox(i === 0 ? 0.24 : 0.3 - i * 0.03, 0.012, 0.004, 0.002), c: i === 0 ? '#E8B878' : '#D6BFA0', p: [sx - 0.82 + 0.01 * i, 0.5 - i * 0.1, sz + 0.145], r: [-0.14, 0.25, 0] })),
    { g: cylinder(0.075, 0.075, 0.01, 24), c: C.ivory, p: [sx + 0.05, top + 0.005, sz + 0.13] },
    { g: cylinder(0.012, 0.012, 0.05, 8), c: C.ivory, p: [sx + 0.05, top + 0.035, sz + 0.13] },
    { g: cylinder(0.075, 0.07, 0.008, 24), c: C.ivory, p: [sx + 0.05, top + 0.062, sz + 0.13] },
    ...[0, 1, 2].map(i => ({ g: sphere(0.026, 10, 8), c: i % 2 ? '#C98B62' : '#E8B878', p: [sx + 0.05 + Math.cos(i * 2.1) * 0.035, top + 0.085, sz + 0.13 + Math.sin(i * 2.1) * 0.035], s: [1, 0.7, 1] })),
  );
  if (!compact) {
    satin.push(
      { g: cylinder(0.05, 0.056, 0.16, 20), c: C.graphite, p: [sx - 0.1, top + 0.08, sz - 0.04] },
      { g: lathe([[0.02, 0], [0.06, 0.09], [0.058, 0.095], [0, 0.095]], 20, 'hopper'), c: C.steelDark, p: [sx - 0.1, top + 0.16, sz - 0.04] },
    );
    for (let k = 0; k < 3; k++) gloss.push(...cupParts(sx - 0.33, top + k * 0.052, sz - 0.02, k * 0.7, false));
    matte.push(...leafyPlant(sx + 0.42, sz - 0.08, top + 0.1, 0.35, rnd));
    matte.push({ g: lathe([[0, 0], [0.05, 0], [0.06, 0.1], [0.055, 0.105], [0, 0.1]], 20, 'potS'), c: C.clay, p: [sx + 0.42, top, sz - 0.08] });
    // tall floor plant in a ceramic planter, back left
    matte.push({ g: lathe([[0, 0], [0.12, 0], [0.16, 0.32], [0.15, 0.34], [0, 0.32]], 28, 'planter'), c: C.ivory, p: [-1.22, 0, -1.25] });
    matte.push(...leafyPlant(-1.22, -1.25, 0.32, 1.0, rnd));
  }
  // cups on the espresso machine
  gloss.push(...cupParts(mx - 0.06, top + 0.28, sz - 0.05, 0.4, false), ...cupParts(mx + 0.06, top + 0.28, sz - 0.02, 2.1, false));

  // arc floor lamp leaning over the table
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(-1.15, 0.03, -0.85), new THREE.Vector3(-1.15, 1.7, -0.85), new THREE.Vector3(-0.6, 2.4, -0.45), new THREE.Vector3(0, 2.18, 0));
  const tube = new THREE.TubeGeometry(curve, 32, 0.012, 6, false);
  satin.push(
    { g: tube, c: C.graphite },
    { g: roundedCylinder(0.16, 0.03, 0.012, 32), c: C.graphite, p: [-1.15, 0, -0.85] },
    rod([0, 2.18, 0], [0, ARC_SHADE_AT[1] + 0.1, 0], 0.006, C.graphite, 6),
  );

  if (fabric.length) mesh(bake(fabric), S.fabric);
  if (matte.length) mesh(bake(matte), S.matte);
  if (satin.length) mesh(bake(satin), S.satin);
  if (gloss.length) mesh(bake(gloss), S.gloss);
  tube.dispose();

  // the round coffee table (interactive)
  const table = mesh(bake([
    { g: roundedCylinder(0.5, 0.036, 0.014, 48), c: C.walnut, p: [0, T - 0.036, 0] },
    { g: cylinder(0.035, 0.045, T - 0.06, 14), c: C.graphite, p: [0, (T - 0.06) / 2 + 0.02, 0] },
    { g: roundedCylinder(0.22, 0.024, 0.01, 32), c: C.graphite, p: [0, 0, 0] },
    // little vase of flowers at the centre
    { g: lathe([[0, 0], [0.03, 0], [0.04, 0.05], [0.025, 0.1], [0.03, 0.115], [0, 0.11]], 16, 'vase'), c: C.sage, p: [-0.02, T, -0.02] },
    ...[0, 1, 2, 3, 4].map(i => ({ g: sphere(0.026, 10, 8), c: i % 2 ? C.cream || '#F3E7D3' : '#E8B878', p: [-0.02 + Math.cos(i * 1.4) * 0.035, T + 0.15 + (i % 2) * 0.02, -0.02 + Math.sin(i * 1.4) * 0.035] })),
    rod([-0.02, T + 0.1, -0.02], [-0.02, T + 0.15, -0.02], 0.004, C.leafDark, 5),
  ]), S.matte);

  // coffee cups on the table (interactive, one mesh each)
  const cupGeo = cupGeometry();
  const cups = CUPS_AT.map(([x, z, ry]) => {
    const c = mesh(cupGeo, S.gloss);
    c.position.set(x, T, z); c.rotation.y = ry;
    return c;
  });

  // arc lamp shade (glows) — position only; the scene owns the shade material + light
  const shadeGeo = bake([
    { g: lathe([[0, 0.13], [0.05, 0.125], [0.11, 0.09], [0.15, 0.03], [0.165, 0], [0.155, 0]], 32, 'arcShade'), c: C.ivory },
    { g: sphere(0.04, 12, 8), c: '#FFF4DE', p: [0, 0.02, 0] },
  ]);
  return { group, slots, table, cups, shadeGeo };
}

function cupParts(x, y, z, ry, saucer = true) {
  const parts = [];
  const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  const at = (g, c, p = [0, 0, 0], r = [0, 0, 0]) => parts.push({ g, c, m: m.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(1, 1, 1))) });
  const y0 = saucer ? 0.006 : 0;
  if (saucer) at(lathe([[0, 0], [0.07, 0], [0.095, 0.012], [0.09, 0.014], [0.06, 0.006], [0, 0.006]], 28, 'saucer'), C.ceramic);
  at(lathe([[0, 0], [0.035, 0], [0.048, 0.014], [0.058, 0.062], [0.055, 0.066], [0.051, 0.058], [0, 0.058]], 24, 'cup'), C.ceramic, [0, y0, 0]);
  at(cylinder(0.05, 0.05, 0.002, 20), C.coffee, [0, y0 + 0.06, 0]);
  at(torus(0.02, 0.0055, 6, 12, Math.PI), C.ceramic, [0.058, y0 + 0.034, 0], [0, 0, -Math.PI / 2]);
  return parts;
}
let CUP = null;
export const cupGeometry = () => CUP ||= bake(cupParts(0, 0, 0, 0, true));

// ------------------------------------------------------------------ platform
/** Diorama slab: rounded rectangle with visible thickness (top at y = 0). Groups: 0 = top/bottom, 1 = sides. */
export function platformGeometry(w, d, thickness = 0.2, radius = 0.5) {
  const shape = roundedRectShape(w, d, radius);
  const bevel = 0.035;
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);          // extrusion now runs up +y
  g.translate(0, -(thickness + bevel), 0);
  return g;
}

/** Flat rounded-rectangle rug. */
export function rugGeometry(w, d, radius, y = 0.004) {
  const g = new THREE.ShapeGeometry(roundedRectShape(w, d, radius), 8);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}
