// Mundo 3D: estadio, cancha, arco, pelota y jugadores procedurales.
// Coordenadas: x a lo ancho, y hacia arriba, z desde la línea del arco (z = 0) hacia el medio de la cancha.

import * as THREE from '../../counter-huevike/vendor/three.module.min.js';

export { THREE };
export const HW = 3.66, GH = 2.44, BR = 0.11, PR = 0.06;

export const KITS = [
  { name: 'Amarillo', shirt: '#f5a00b', stripe: '#fff4d6', shorts: '#1f2937', socks: '#f5a00b', num: '#1f2937',
    gk: { shirt: '#22c55e', stripe: null, shorts: '#14532d', socks: '#22c55e', num: '#052e16', glove: '#facc15' } },
  { name: 'Azul', shirt: '#1d4ed8', stripe: '#60a5fa', shorts: '#f8fafc', socks: '#1d4ed8', num: '#ffffff',
    gk: { shirt: '#db2777', stripe: null, shorts: '#500724', socks: '#db2777', num: '#ffffff', glove: '#f8fafc' } },
];

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- Renderer, escena y cámara ----------
export const canvas = document.getElementById('gl');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 700);
const ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

// Cielo de tarde
scene.background = canvasTex(4, 256, (x, w, h) => {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#2f5d9e'); g.addColorStop(0.55, '#7fb0e0'); g.addColorStop(1, '#e7d9b8');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
scene.fog = new THREE.Fog(0xb9cde0, 120, 330);

scene.add(new THREE.HemisphereLight(0xdbeaff, 0x2f5a22, 1.25));
const sun = new THREE.DirectionalLight(0xfff3df, 2.6);
sun.position.set(-30, 55, 45);
sun.target.position.set(0, 0, 14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 34, bottom: -30, near: 20, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------- Cancha ----------
const G1 = '#3c8a2c', G2 = '#4b9c37';
const mod2 = (n) => ((n % 2) + 2) % 2;
function paintGrass(ctx, x0, z0, wM, hM, S, rnd) {
  for (let x = Math.floor(x0 / 5) * 5; x < x0 + wM; x += 5) {
    for (let z = Math.floor(z0 / 5) * 5; z < z0 + hM; z += 5) {
      ctx.fillStyle = mod2(Math.floor(x / 5) + Math.floor(z / 5)) ? G2 : G1;
      ctx.fillRect((x - x0) * S, (z - z0) * S, 5 * S + 1, 5 * S + 1);
    }
  }
  const W = wM * S, H = hM * S, n = wM * hM * 7;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rnd() < 0.5 ? 'rgba(0,0,0,.07)' : 'rgba(255,255,240,.05)';
    ctx.fillRect(rnd() * W, rnd() * H, 2, 3);
  }
}

{
  const rnd = mulberry32(7);
  const S = 20, X0 = -40, Z0 = -10;
  const tex = canvasTex(80 * S, 70 * S, (c) => {
    paintGrass(c, X0, Z0, 80, 70, S, rnd);
    const X = (x) => (x - X0) * S, Y = (z) => (z - Z0) * S;
    c.strokeStyle = 'rgba(255,255,255,.93)'; c.lineWidth = 0.12 * S; c.lineCap = 'butt';
    const line = (a, b, cc, d) => { c.beginPath(); c.moveTo(X(a), Y(b)); c.lineTo(X(cc), Y(d)); c.stroke(); };
    const rect = (x1, z1, x2, z2) => c.strokeRect(X(x1), Y(z1), (x2 - x1) * S, (z2 - z1) * S);
    line(-34, 0, 34, 0);
    line(-34, 0, -34, 60); line(34, 0, 34, 60);
    rect(-20.16, 0, 20.16, 16.5);
    rect(-9.16, 0, 9.16, 5.5);
    line(-34, 52.5, 34, 52.5);
    c.beginPath(); c.arc(X(0), Y(11), 9.15 * S, 0.645, Math.PI - 0.645); c.stroke();
    c.beginPath(); c.arc(X(0), Y(52.5), 9.15 * S, Math.PI, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(X(-34), Y(0), 1 * S, 0, Math.PI / 2); c.stroke();
    c.beginPath(); c.arc(X(34), Y(0), 1 * S, Math.PI / 2, Math.PI); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.95)';
    for (const z of [11, 52.5]) { c.beginPath(); c.arc(X(0), Y(z), 0.11 * S, 0, Math.PI * 2); c.fill(); }
  });
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(80, 70), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.set(0, 0.006, 25);
  pitch.receiveShadow = true;
  scene.add(pitch);

  const tile = canvasTex(200, 200, (c) => paintGrass(c, -150, -120, 10, 10, S, rnd), [30, 30]);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.MeshStandardMaterial({ map: tile, roughness: 0.95 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.set(0, 0, 30);
  outer.receiveShadow = true;
  scene.add(outer);
}

// ---------- Tribunas, carteles y techo ----------
{
  const rnd = mulberry32(11);
  const shirts = ['#f5a00b', '#f5a00b', '#1d4ed8', '#1d4ed8', '#f8fafc', '#e11d48', '#94a3b8', '#facc15', '#0ea5e9', '#334155'];
  const skins = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
  const crowd = canvasTex(512, 256, (c, w, h) => {
    for (let r = 0; r < 16; r++) {
      const y = r * 16;
      c.fillStyle = r % 2 ? '#26304a' : '#1f2840'; c.fillRect(0, y, w, 16);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(0, y + 14, w, 2);
      for (let px = 1 + rnd() * 4; px < w - 4; px += 6 + rnd() * 3) {
        if (rnd() < 0.22) continue;
        c.fillStyle = shirts[Math.floor(rnd() * shirts.length)];
        c.globalAlpha = 0.55 + rnd() * 0.3; c.fillRect(px, y + 7, 5, 8);
        c.fillStyle = skins[Math.floor(rnd() * skins.length)];
        c.beginPath(); c.arc(px + 2.5, y + 5, 2.4, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
        if (rnd() < 0.08) { c.fillStyle = shirts[Math.floor(rnd() * 4)]; c.fillRect(px - 1, y, 7, 4); }
      }
    }
  });
  crowd.wrapS = crowd.wrapT = THREE.RepeatWrapping;

  const standMat = (w, l) => { const t = crowd.clone(); t.needsUpdate = true; t.repeat.set(w / 36, l / 13.6); return new THREE.MeshStandardMaterial({ map: t, roughness: 1 }); };
  const slope = (width, bottom, xAxis, up) => {
    const len = up.length();
    const yAxis = up.clone().normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), standMat(width, len));
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis));
    m.position.copy(bottom).addScaledVector(up, 0.5);
    scene.add(m);
  };
  slope(160, new THREE.Vector3(0, 1.4, -8), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 21, -27));
  slope(150, new THREE.Vector3(41, 1.4, 35), new THREE.Vector3(0, 0, 1), new THREE.Vector3(27, 21, 0));
  slope(150, new THREE.Vector3(-41, 1.4, 35), new THREE.Vector3(0, 0, -1), new THREE.Vector3(-27, 21, 0));

  const dark = new THREE.MeshStandardMaterial({ color: 0x18213a, roughness: 0.9 });
  const box = (sx, sy, sz, x, y, z, mat = dark) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); b.position.set(x, y, z); scene.add(b); return b; };
  box(160, 1.4, 0.5, 0, 0.7, -8);
  box(0.5, 1.4, 150, 41, 0.7, 35);
  box(0.5, 1.4, 150, -41, 0.7, 35);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2b3448, roughness: 0.7, metalness: 0.2 });
  box(170, 0.8, 16, 0, 25, -31, roofMat);
  box(16, 0.8, 160, 60, 25, 35, roofMat);
  box(16, 0.8, 160, -60, 25, 35, roofMat);
  // reflectores
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
  for (const [x, z] of [[-45, -12], [45, -12], [-62, 70], [62, 70]]) {
    box(0.8, 34, 0.8, x, 17, z, roofMat);
    box(7, 3, 0.6, x, 35, z, lampMat);
  }

  // carteles de publicidad (LED)
  const ads = ['HUEVI GOL', 'HUEVI IMPOSTOR', 'COUNTER HUEVIKE', '¡DALE HUEVI!'];
  const adCols = [['#f59e0b', '#1f1300'], ['#1d4ed8', '#ffffff'], ['#111827', '#fbbf24'], ['#16a34a', '#ffffff']];
  const adTex = canvasTex(1024, 64, (c) => {
    ads.forEach((t, i) => {
      c.fillStyle = adCols[i][0]; c.fillRect(i * 256, 0, 256, 64);
      c.fillStyle = adCols[i][1]; c.font = 'italic 900 30px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(t, i * 256 + 128, 34, 236);
    });
  });
  adTex.wrapS = THREE.RepeatWrapping;
  const board = (len, x, z, rotY) => {
    const t = adTex.clone(); t.needsUpdate = true; t.repeat.set(len / 16, 1);
    const p = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    p.position.set(x, 0.45, z); p.rotation.y = rotY;
    scene.add(p);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.08), dark);
    back.position.copy(p.position); back.rotation.y = rotY;
    back.translateZ(-0.05);
    scene.add(back);
  };
  board(64, 0, -4.6, 0);
  board(64, 36.5, 30, -Math.PI / 2);
  board(64, -36.5, 30, Math.PI / 2);
}

// ---------- Arco con red ----------
export const goalGroup = new THREE.Group();
{
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const back = new THREE.MeshStandardMaterial({ color: 0xbfc7d2, roughness: 0.5 });
  const cyl = (len, r = PR, mat = m) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat); c.castShadow = true; return c; };
  for (const s of [-1, 1]) {
    const p = cyl(GH + PR); p.position.set(s * HW, (GH + PR) / 2, 0); goalGroup.add(p);
    const bp = cyl(2.25, 0.03, back); bp.position.set(s * HW, GH / 2, -1.5); bp.rotation.x = -Math.atan2(1, GH); goalGroup.add(bp);
    const top = cyl(1, 0.03, back); top.rotation.x = Math.PI / 2; top.position.set(s * HW, GH, -0.5); goalGroup.add(top);
  }
  const bar = cyl(2 * HW + 2 * PR); bar.rotation.z = Math.PI / 2; bar.position.set(0, GH, 0); goalGroup.add(bar);
  const bb = cyl(2 * HW, 0.03, back); bb.rotation.z = Math.PI / 2; bb.position.set(0, GH, -1); goalGroup.add(bb);
  const gb = cyl(2 * HW, 0.03, back); gb.rotation.z = Math.PI / 2; gb.position.set(0, 0.03, -2); goalGroup.add(gb);

  // red: techo, fondo inclinado y costados
  const pts = [];
  const seg = (a, b) => pts.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  const backZ = (y) => -1 - (1 - y / GH);
  const st = 0.16;
  for (let x = -HW; x <= HW + 1e-6; x += st) { seg([x, GH, 0], [x, GH, -1]); seg([x, GH, -1], [x, 0, -2]); }
  for (let z = 0; z >= -1; z -= st) seg([-HW, GH, z], [HW, GH, z]);
  for (let y = 0; y <= GH + 1e-6; y += st) {
    seg([-HW, y, backZ(y)], [HW, y, backZ(y)]);
    for (const s of [-1, 1]) seg([s * HW, y, 0], [s * HW, y, backZ(y)]);
  }
  for (let z = 0; z >= -2; z -= st) {
    const yTop = z >= -1 ? GH : GH * (1 - (-1 - z));
    for (const s of [-1, 1]) seg([s * HW, 0, z], [s * HW, Math.max(0, yTop), z]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  goalGroup.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })));
  scene.add(goalGroup);
}

// ---------- Pelota y Huevo de Oro ----------
export const ball = new THREE.Group();
{
  const tex = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#fbfbfb'; c.fillRect(0, 0, w, h);
    const poly = (cx, cy, r, n, rot) => { c.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i * Math.PI * 2 / n; c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); } c.closePath(); c.fill(); };
    c.fillStyle = '#121212';
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 5; i++) {
        const cx = (i + (row % 2) * 0.5) * (w / 5) + 20, cy = 40 + row * 88;
        poly(cx, cy, 26, 5, row * 0.6);
        poly(cx + w, cy, 26, 5, row * 0.6); poly(cx - w, cy, 26, 5, row * 0.6);
      }
    }
    c.fillRect(0, 0, w, 10); c.fillRect(0, h - 10, w, 10);
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(BR, 28, 18), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
  sphere.castShadow = true;
  const prof = [];
  for (let i = 0; i <= 20; i++) { const t = i / 20 * Math.PI; prof.push(new THREE.Vector2(Math.max(0.0001, Math.sin(t) * 0.12 * (1 + 0.16 * Math.cos(t))), -0.15 + (1 - Math.cos(t)) / 2 * 0.3)); }
  const egg = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), new THREE.MeshStandardMaterial({ color: 0xffc928, metalness: 0.85, roughness: 0.22, emissive: 0x7a4b00, emissiveIntensity: 0.6 }));
  egg.castShadow = true;
  egg.visible = false;
  ball.add(sphere, egg);
  ball.userData = { sphere, egg };
  scene.add(ball);
}
export function setGoldBall(on) { ball.userData.sphere.visible = !on; ball.userData.egg.visible = on; }

// estela de la pelota
export const trail = [];
{
  const g = new THREE.SphereGeometry(BR * 0.8, 10, 8);
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(m); trail.push(m);
  }
}

// ---------- Jugadores ----------
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#d9a066'];
const HAIRS = ['#1b1b1b', '#3b2416', '#6b4423', '#c8a165', '#0d0d0d', '#5a3a1a'];
const geo = {
  thigh: new THREE.CapsuleGeometry(0.072, 0.3, 4, 10),
  shortLeg: new THREE.CylinderGeometry(0.1, 0.095, 0.2, 12),
  shin: new THREE.CapsuleGeometry(0.06, 0.3, 4, 10),
  boot: new THREE.BoxGeometry(0.1, 0.08, 0.26),
  hips: new THREE.CylinderGeometry(0.19, 0.2, 0.2, 16),
  torso: new THREE.CylinderGeometry(0.215, 0.17, 0.54, 20, 1),
  upperArm: new THREE.CapsuleGeometry(0.058, 0.2, 4, 10),
  foreArm: new THREE.CapsuleGeometry(0.046, 0.2, 4, 10),
  hand: new THREE.SphereGeometry(0.05, 10, 8),
  glove: new THREE.SphereGeometry(0.08, 12, 10),
  neck: new THREE.CylinderGeometry(0.055, 0.06, 0.12, 10),
  head: new THREE.SphereGeometry(0.115, 18, 14),
  hair: new THREE.SphereGeometry(0.122, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
  ring: new THREE.RingGeometry(0.42, 0.56, 32),
  shadowDisc: new THREE.CircleGeometry(0.4, 20),
};
const matCache = new Map();
const mat = (color, rough = 0.8) => {
  const k = color + rough;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough }));
  return matCache.get(k);
};
const shirtCache = new Map();
function shirtMat(kit, num) {
  const k = kit.shirt + kit.stripe + num;
  if (shirtCache.has(k)) return shirtCache.get(k);
  const t = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = kit.shirt; c.fillRect(0, 0, w, h);
    if (kit.stripe) { c.fillStyle = kit.stripe; for (let i = 0; i < 8; i++) c.fillRect(i * 32 + 9, 0, 14, h); }
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, 0, w, 7);
    if (num != null) {
      c.font = '900 62px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 7; c.strokeStyle = kit.stripe ? kit.shirt : 'rgba(0,0,0,.25)';
      c.strokeText(String(num), 128, 66); c.fillStyle = kit.num; c.fillText(String(num), 128, 66);
      c.font = '900 20px Arial'; c.fillText(String(num), 36, 34); // número chico adelante
    }
  });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
  shirtCache.set(k, m);
  return m;
}
const ringMats = { owner: new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.9, depthWrite: false }),
  mate: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85, depthWrite: false }) };

export function makePlayer(kit, { num = null, rng = Math.random, keeper = false } = {}) {
  const skin = mat(SKINS[Math.floor(rng() * SKINS.length)], 0.7);
  const hairC = HAIRS[Math.floor(rng() * HAIRS.length)];
  const k = keeper ? kit.gk : kit;
  const holder = new THREE.Group();     // posición en el mundo y rodado (estiradas del arquero)
  const root = new THREE.Group();       // giro hacia donde mira (adelante = -z local)
  const body = new THREE.Group();       // salto y altura
  holder.add(root); root.add(body);
  const add = (parent, g, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };

  const legs = [], knees = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.1, 0.93, 0); body.add(leg);
    add(leg, geo.thigh, skin, 0, -0.22, 0);
    add(leg, geo.shortLeg, mat(k.shorts), 0, -0.08, 0);
    const knee = new THREE.Group(); knee.position.y = -0.45; leg.add(knee);
    add(knee, geo.shin, mat(k.socks, 0.9), 0, -0.21, 0);
    add(knee, geo.boot, mat('#151515', 0.5), 0, -0.44, -0.05);
    legs.push(leg); knees.push(knee);
  }
  const upper = new THREE.Group(); upper.position.y = 0.93; body.add(upper);
  add(upper, geo.hips, mat(k.shorts), 0, 0.03, 0);
  const torso = add(upper, geo.torso, shirtMat(k, num), 0, 0.37, 0);
  torso.scale.z = 0.72; torso.rotation.y = Math.PI;
  const arms = [], elbows = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(s * 0.26, 0.58, 0); upper.add(arm);
    add(arm, geo.upperArm, shirtMat({ ...k, stripe: null }, null), 0, -0.14, 0);
    const elb = new THREE.Group(); elb.position.y = -0.29; arm.add(elb);
    add(elb, geo.foreArm, keeper ? shirtMat({ ...k, stripe: null }, null) : skin, 0, -0.13, 0);
    add(elb, keeper ? geo.glove : geo.hand, keeper ? mat(k.glove, 0.6) : skin, 0, -0.29, 0);
    arms.push(arm); elbows.push(elb);
  }
  add(upper, geo.neck, skin, 0, 0.69, 0);
  const head = add(upper, geo.head, skin, 0, 0.83, 0);
  head.scale.set(1, 1.1, 1);
  if (rng() > 0.12) { const h = add(upper, geo.hair, mat(hairC, 0.9), 0, 0.845, 0.01); h.scale.set(1, 1.05, 1.03); }

  const ring = new THREE.Mesh(geo.ring, ringMats.mate);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.visible = false;
  holder.add(ring);

  scene.add(holder);
  return {
    holder, root, body, upper, legs, knees, arms, elbows, ring,
    anim: 'idle', t: 0, ph: rng() * 6, jump: -1, keeper,
    get pos() { return holder.position; },
  };
}

export function disposePlayer(p) { scene.remove(p.holder); }
export function setRing(p, kind) {
  if (!kind) { p.ring.visible = false; return; }
  p.ring.visible = true; p.ring.material = ringMats[kind];
}

export function faceTo(p, x, z) {
  p.root.rotation.y = Math.atan2(-(x - p.holder.position.x), -(z - p.holder.position.z));
}

// Pose por cuadro según la animación del jugador
const P = {};
export function animatePlayer(p, dt) {
  p.t += dt;
  const t = p.t, ph = p.ph;
  P.lL = 0; P.lR = 0; P.kL = -0.05; P.kR = -0.05; P.aLx = 0; P.aRx = 0; P.aLz = -0.13; P.aRz = 0.13; P.eL = 0.2; P.eR = 0.2; P.lean = 0; P.y = 0;
  const br = Math.sin(t * 2.2 + ph);
  switch (p.anim) {
    case 'idle':
      P.aLz -= br * 0.03; P.aRz += br * 0.03; P.kL = P.kR = -0.08 - br * 0.02; P.y = -0.005 + br * 0.004;
      break;
    case 'ready':
      P.lean = 0.12; P.kL = P.kR = -0.25; P.lL = P.lR = 0.12; P.y = -0.03; P.aLz = -0.28; P.aRz = 0.28; P.eL = P.eR = 0.5;
      break;
    case 'run': {
      const s = Math.sin(t * 10 + ph);
      P.lL = s * 0.75; P.lR = -s * 0.75;
      P.kL = -0.25 - Math.max(0, -s) * 1.1; P.kR = -0.25 - Math.max(0, s) * 1.1;
      P.aLx = -s * 0.7; P.aRx = s * 0.7; P.eL = P.eR = 1.1; P.lean = 0.18; P.y = Math.abs(Math.cos(t * 10 + ph)) * 0.05;
      break;
    }
    case 'kick': {
      const k = Math.min(1, t / 0.42);
      if (k < 0.6) { const e = k / 0.6; P.lR = -0.95 * e; P.kR = -0.05 - 1.35 * e; P.aLz = -0.13 - 0.9 * e; P.aRx = -0.5 * e; P.lean = -0.08 * e; }
      else { const e = (k - 0.6) / 0.4; P.lR = -0.95 + 2.4 * e; P.kR = -1.4 + 1.35 * e; P.aLz = -1.03 + 0.4 * e; P.aRx = -0.5 + 0.9 * e; P.lean = -0.08 - 0.12 * e; }
      P.kL = -0.25; P.y = -0.02;
      break;
    }
    case 'gk': {
      const b = Math.sin(t * 6 + ph) * 0.015;
      P.lean = 0.28; P.lL = P.lR = 0.35; P.kL = P.kR = -0.65; P.y = -0.08 + b;
      P.aLz = -0.75; P.aRz = 0.75; P.aLx = 0.4; P.aRx = 0.4; P.eL = P.eR = 0.6;
      break;
    }
    case 'dive':
      P.aLz = -2.85; P.aRz = 2.85; P.eL = P.eR = 0.05; P.lL = 0.25; P.lR = -0.2; P.kL = -0.3; P.kR = -0.15;
      break;
    case 'block':
      P.aLz = -0.5; P.aRz = 0.5; P.aLx = 1.1; P.aRx = 1.1; P.eL = P.eR = 0.2; P.lean = 0.15; P.kL = P.kR = -0.4; P.y = -0.1;
      break;
    case 'wall':
      P.aLz = 0.45; P.aRz = -0.45; P.aLx = 0.35; P.aRx = 0.35; P.eL = P.eR = 0.9; P.kL = P.kR = -0.06;
      break;
    case 'cheer':
      P.aLz = -2.7 + Math.sin(t * 9) * 0.2; P.aRz = 2.7 - Math.sin(t * 9) * 0.2; P.eL = P.eR = 0.2;
      P.y = Math.abs(Math.sin(t * 6 + ph)) * 0.35; P.lL = P.lR = 0.1; P.kL = P.kR = -0.3;
      break;
    case 'sad':
      P.lean = 0.35; P.aLz = 0.1; P.aRz = -0.1; P.aLx = 0.2; P.aRx = 0.2; P.eL = P.eR = 0.3; P.kL = P.kR = -0.15;
      break;
    case 'down':
      break;
  }
  if (p.jump >= 0) { p.jump += dt; const j = p.jump / 0.62; if (j >= 1) p.jump = -1; else { P.y += Math.sin(Math.PI * j) * 0.42; P.aLz = -2.5; P.aRz = 2.5; } }
  p.legs[0].rotation.x = P.lL; p.legs[1].rotation.x = P.lR;
  p.knees[0].rotation.x = P.kL; p.knees[1].rotation.x = P.kR;
  p.arms[0].rotation.set(P.aLx, 0, P.aLz); p.arms[1].rotation.set(P.aRx, 0, P.aRz);
  p.elbows[0].rotation.x = P.eL; p.elbows[1].rotation.x = P.eR;
  p.upper.rotation.x = -P.lean;
  p.body.position.y = P.y;
}
