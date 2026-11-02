// Sky behind the office diorama: an atmospheric gradient backdrop that follows the viewer's local
// time of day (dawn, day, dusk, night) and their weather (sun, clouds, rain, snow, fog, storms with
// lightning). It also tells the desk how to tint its lighting. Everything hangs off the camera.
// Cheap: one backdrop quad, a few cloud sprites, one Points cloud for rain/snow (300 drops).
import { THREE } from './avatar.js';
import { WEATHER } from './weather.js';

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const sunTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,250,236,1)'); r.addColorStop(0.22, 'rgba(255,240,214,0.95)'); r.addColorStop(0.3, 'rgba(255,226,190,0.35)'); r.addColorStop(1, 'rgba(255,220,180,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
});
const moonTex = () => canvasTex(128, 128, (g) => {
  const r = g.createRadialGradient(64, 64, 18, 64, 64, 64);
  r.addColorStop(0, 'rgba(214,224,240,0.35)'); r.addColorStop(1, 'rgba(214,224,240,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#EEEADF'; g.beginPath(); g.arc(64, 64, 22, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.arc(76, 57, 20, 0, Math.PI * 2); g.fill();   // crescent
});
// soft, wide, layered cloud bank
const cloudTex = () => canvasTex(256, 128, (g) => {
  const puffs = [[46, 84, 30], [80, 70, 40], [122, 60, 48], [166, 68, 42], [204, 82, 32], [100, 90, 34], [146, 92, 36], [60, 96, 22], [190, 96, 24]];
  for (const [x, y, r] of puffs) {
    const gr = g.createRadialGradient(x, y, r * 0.1, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
});
// thin, slanted rain streak
const dropTex = () => canvasTex(32, 32, (g) => {
  const gr = g.createLinearGradient(16, 0, 16, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,0.85)');
  g.strokeStyle = gr; g.lineWidth = 1.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(18.5, 2); g.lineTo(14.5, 30); g.stroke();
});
const flakeTex = () => canvasTex(32, 32, (g) => {
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
});

const col = (c) => new THREE.Color(c);
const mix = (a, b, k) => col(a).lerp(col(b), k);

// time of day from the local clock: 0 = midnight … 24
export function dayPhase(date = new Date()) {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 5.5 || h >= 21) return 'night';
  if (h < 7.5) return 'dawn';
  if (h < 17.5) return 'day';
  return 'dusk';
}

// Backdrop gradients (top of the view → horizon haze → below the diorama)
const SKIES = {
  day:   { top: '#8DA8C2', mid: '#C8D3DD', bottom: '#E3E1DB' },
  dawn:  { top: '#8EA2BC', mid: '#D8C5B8', bottom: '#E5DCD3' },
  dusk:  { top: '#53687F', mid: '#B79C8B', bottom: '#D2C3B5' },
  night: { top: '#111C2B', mid: '#22334A', bottom: '#2A3A50' },
};
const OVERCAST = { top: '#7B8B9B', mid: '#AEB8C2', bottom: '#CDD1D4' };
const STORM = { top: '#465260', mid: '#738090', bottom: '#98A0A8' };
const MIDNIGHT = '#182638';

const VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = /* glsl */`
  uniform vec3 uTop, uMid, uBottom;
  uniform float uFlash;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float y = vUv.y;
    vec3 c = mix(uBottom, uMid, smoothstep(0.05, 0.5, y));
    c = mix(c, uTop, smoothstep(0.45, 1.0, y));
    // soft vignette towards the corners
    vec2 q = vUv - 0.5;
    c *= 1.0 - dot(q, q) * 0.22;
    c += uFlash * vec3(0.35, 0.38, 0.45);
    c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;   // dither: no banding
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Everything hangs off the camera, far behind the desks.
const D = 40;

export class Sky {
  constructor(camera, container) {
    this.camera = camera;
    this.container = container;
    this.group = new THREE.Group();
    this.group.position.z = -D;
    camera.add(this.group);
    this.weather = null;
    this.kind = 'clear';
    this.flash = 0;
    this.nextFlash = 4;
    this.dark = false;

    // gradient backdrop: drawn first, never writes depth
    this.uniforms = { uTop: { value: col('#8DA8C2') }, uMid: { value: col('#C8D3DD') }, uBottom: { value: col('#E3E1DB') }, uFlash: { value: 0 } };
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, depthTest: false, depthWrite: false, fog: false,
    }));
    this.backdrop.renderOrder = -100;
    this.backdrop.frustumCulled = false;
    this.backdrop.position.z = -2;
    this.group.add(this.backdrop);

    const sprite = (tex, size) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
      s.scale.set(size, size, 1);
      s.renderOrder = -10;
      this.group.add(s);
      return s;
    };
    this.sun = sprite(sunTex(), 1);
    this.moon = sprite(moonTex(), 1);
    const ct = cloudTex();
    this.clouds = Array.from({ length: 6 }, (_, i) => {
      const c = sprite(ct, 1);
      c.material.opacity = 0;
      c.userData = { u0: i / 6 + (i % 2) * 0.07, v: 0.48 + (i % 3) * 0.15, w: 0.5 + (i % 3) * 0.14, speed: 0.004 + (i % 4) * 0.0018 };
      return c;
    });
    // stars
    const N = 70, sp = new Float32Array(N * 3);
    this.starSeed = Array.from({ length: N }, () => [Math.random() * 2 - 1, 0.25 + Math.random() * 0.75]);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: '#ffffff', size: 0.3, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.stars.frustumCulled = false;
    this.group.add(this.stars);
    // rain / snow, out in the background (subtle, a few hundred drops)
    const P = 300;
    this.precipSeed = Array.from({ length: P }, () => ({ u: Math.random() * 2 - 1, v: Math.random() * 2 - 1, z: (Math.random() - 0.5) * 6, s: 0.75 + Math.random() * 0.5, w: Math.random() * 6 }));
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P * 3), 3));
    this.dropTex = dropTex(); this.flakeTex = flakeTex();
    this.precip = new THREE.Points(pg, new THREE.PointsMaterial({ map: this.dropTex, size: 1.6, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    this.precip.frustumCulled = false;
    this.group.add(this.precip);
    this.set(null);
  }

  // light / dark panel: the backdrop and precipitation tint follow the theme
  setTheme(dark) { this.dark = dark; this.lastKey = null; this.set(this.weather); }

  // weather: { code, isDay, temp } for the viewer (or null for "just the clock")
  set(weather) {
    this.weather = weather;
    this.kind = weather ? WEATHER(weather.code).kind : 'clear';
    const snow = this.kind === 'snow';
    this.precip.material.map = snow ? this.flakeTex : this.dropTex;
    this.precip.material.size = snow ? 0.8 : 1.6;
    this.precip.material.color.set(snow ? (this.dark ? '#E6ECF5' : '#F4F6FA') : (this.dark ? '#9FB3CC' : '#E9EEF4'));
    this.precip.material.needsUpdate = true;
    this.lastKey = null;
  }

  // Lighting multipliers for the scene, the backdrop colours and the lamp level (0 … 1)
  look(date = new Date()) {
    const phase = dayPhase(date);
    const k = this.kind;
    const grey = { clear: 0, partly: 0.18, cloudy: 0.55, fog: 0.65, rain: 0.7, snow: 0.4, storm: 0.85 }[k] ?? 0;
    const base = SKIES[phase];
    const over = k === 'storm' ? STORM : OVERCAST;
    const gk = phase === 'night' ? grey * 0.25 : grey;
    const g = {};
    for (const key of ['top', 'mid', 'bottom']) {
      let c = mix(base[key], over[key], gk);
      if (this.dark) c = c.lerp(col(MIDNIGHT), phase === 'night' ? 0.35 : 0.62);
      g[key] = c;
    }
    const sunColor = phase === 'night' ? '#9FB0D8' : phase === 'day' ? mix('#FFF4E6', '#D8E0EA', grey).getStyle() : '#FFC59A';
    const sun = (phase === 'night' ? 0.35 : phase === 'day' ? 1 : 0.75) * (1 - grey * 0.35);
    const hemi = (phase === 'night' ? 0.6 : phase === 'day' ? 1 : 0.85) * (1 - grey * 0.12);
    const lamp = Math.min(1, (phase === 'night' ? 1 : phase === 'day' ? 0.35 : 0.75) + grey * 0.3);
    return { phase, sky: '#' + g.mid.getHexString(), top: g.top, mid: g.mid, bottom: g.bottom, sunColor, sun, hemi, lamp, mix: phase === 'night' ? 34 : 22 };
  }

  update(t, dt) {
    const now = new Date();
    // the colours only change with the clock (minutes), weather or theme
    const key = `${now.getHours()}:${now.getMinutes()}:${this.kind}:${this.dark}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.L = this.look(now);
      this.uniforms.uTop.value.copy(this.L.top);
      this.uniforms.uMid.value.copy(this.L.mid);
      this.uniforms.uBottom.value.copy(this.L.bottom);
      if (this.L.sky !== this.lastSky) {
        this.lastSky = this.L.sky;
        this.container.style.setProperty('--sky', this.L.sky);
        this.container.style.setProperty('--sky-mix', this.L.mix + '%');
      }
    }
    const L = this.L;
    // size of the view at the sky's distance: positions below are fractions of it
    const cam = this.camera;
    const hH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * D;
    const hW = hH * cam.aspect;
    this.backdrop.scale.set(hW * 1.2, hH * 1.2, 1);
    const k = this.kind, night = L.phase === 'night';
    const cloudy = { clear: 1, partly: 3, cloudy: 5, fog: 4, rain: 6, snow: 4, storm: 6 }[k] ?? 1;
    // sun / moon travel across the sky with the clock
    const h = now.getHours() + now.getMinutes() / 60;
    const dayK = THREE.MathUtils.clamp((h - 6) / 13, 0, 1);            // 6:00 → 19:00
    const nightK = THREE.MathUtils.clamp(((h + 24 - 19) % 24) / 11, 0, 1); // 19:00 → 06:00
    const arc = (u) => [(-0.8 + u * 1.6) * hW, (0.5 + Math.sin(u * Math.PI) * 0.35) * hH];
    const sz = hH * 0.36;
    this.sun.position.set(...arc(dayK), 0); this.sun.scale.set(sz, sz, 1);
    this.moon.position.set(...arc(nightK), 0); this.moon.scale.set(sz * 0.55, sz * 0.55, 1);
    this.sun.material.opacity = night ? 0 : Math.max(0, 0.85 - cloudy * 0.15);
    this.moon.material.opacity = night ? Math.max(0.15, 0.95 - cloudy * 0.14) : 0;
    // stars
    this.stars.material.opacity = night ? Math.max(0, 0.75 - cloudy * 0.18) * (0.85 + 0.15 * Math.sin(t * 1.5)) : 0;
    if (this.stars.material.opacity > 0.01) {
      const sa = this.stars.geometry.attributes.position.array;
      this.starSeed.forEach(([u, v], i) => { sa[i * 3] = u * hW; sa[i * 3 + 1] = v * hH; sa[i * 3 + 2] = -1; });
      this.stars.geometry.attributes.position.needsUpdate = true;
    }
    // clouds drift slowly; blue-grey when it's wet, warm white on a fair day
    const tint = k === 'storm' ? '#7D8794' : k === 'rain' || k === 'cloudy' || k === 'fog' ? '#B4BEC9' : night ? '#56647A' : '#F7F5F0';
    this.clouds.forEach((c, i) => {
      const u = c.userData;
      const show = i < cloudy;
      const target = show ? (k === 'storm' ? 0.9 : k === 'clear' ? 0.45 : 0.75) * (this.dark ? 0.6 : 1) : 0;
      c.material.opacity += (target - c.material.opacity) * Math.min(1, dt * 0.8);
      c.visible = c.material.opacity > 0.01;
      if (!c.visible) return;
      c.material.color.set(tint);
      const x = (((u.u0 + t * u.speed) % 1) * 2.8 - 1.4) * hW;
      c.position.set(x, u.v * hH, 0.5);
      c.scale.set(u.w * hW, u.w * hW * 0.42, 1);
    });
    // rain / snow, falling behind the diorama
    const wet = k === 'rain' || k === 'storm' || k === 'snow';
    this.precip.material.opacity += ((wet ? (k === 'snow' ? 0.85 : 0.55) : 0) - this.precip.material.opacity) * Math.min(1, dt * 2);
    this.precip.visible = this.precip.material.opacity > 0.01;
    if (this.precip.visible) {
      const arr = this.precip.geometry.attributes.position.array;
      const fall = k === 'snow' ? 0.1 : k === 'storm' ? 1.4 : 1.05;
      this.precipSeed.forEach((p, i) => {
        p.v -= fall * p.s * dt;
        if (p.v < -1) p.v += 2;
        const drift = k === 'snow' ? Math.sin(t + p.w) * 0.02 : (p.v + 1) * 0.03;   // rain slants a touch
        arr[i * 3] = (p.u + drift) * hW;
        arr[i * 3 + 1] = p.v * hH;
        arr[i * 3 + 2] = p.z;
      });
      this.precip.geometry.attributes.position.needsUpdate = true;
    }
    // lightning
    if (k === 'storm') {
      this.nextFlash -= dt;
      if (this.nextFlash < 0) { this.flash = 1; this.nextFlash = 5 + Math.random() * 8; }
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    this.uniforms.uFlash.value = this.flash * 0.6;
    return { ...L, flash: this.flash };
  }

  dispose() {
    this.camera.remove(this.group);
    const seen = new Set();
    this.group.traverse(o => {
      o.geometry?.dispose();
      if (o.material && !seen.has(o.material)) { seen.add(o.material); o.material.map?.dispose(); o.material.dispose(); }
    });
    this.dropTex.dispose(); this.flakeTex.dispose();
  }
}
