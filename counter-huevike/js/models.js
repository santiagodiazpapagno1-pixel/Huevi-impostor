// Modelos 3D procedurales: huevos jugadores, huevo podrido, armas, objetos y el Huevero Freyre.

import * as THREE from 'three';
import { WEAPONS } from './config.js';
import { textTexture } from './textures.js';

function eggProfile(h, w, n = 20, k = 0.14) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI;
    const y = (1 - Math.cos(t)) / 2 * h;
    const r = Math.max(0.0001, Math.sin(t) * (w / 2) * (1 + k * Math.cos(t)));
    pts.push(new THREE.Vector2(r, y));
  }
  return pts;
}

const shared = {};
function eggGeo() { return shared.egg || (shared.egg = new THREE.LatheGeometry(eggProfile(1.55, 1.0), 28)); }
const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
const eyeBlack = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });

// Huevo jugador: sencillo, sin ropa ni accesorios. Solo ojitos y el arma en la mano.
export function createPlayerEgg(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.0 });
  const body = new THREE.Mesh(eggGeo(), mat);
  body.castShadow = true;
  g.add(body);
  const eyeG = shared.eye || (shared.eye = new THREE.SphereGeometry(0.11, 12, 10));
  const pupG = shared.pup || (shared.pup = new THREE.SphereGeometry(0.055, 10, 8));
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(eyeG, eyeWhite); e.position.set(sx * 0.16, 1.1, -0.4); g.add(e);
    const p = new THREE.Mesh(pupG, eyeBlack); p.position.set(sx * 0.16, 1.1, -0.5); g.add(p);
  }
  const gunHolder = new THREE.Group();
  gunHolder.position.set(0.42, 0.78, -0.35);
  g.add(gunHolder);
  g.userData = { mat, body, gunHolder, gunId: null };
  return g;
}

export function setEggGun(egg, id) {
  const ud = egg.userData;
  if (ud.gunId === id) return;
  ud.gunId = id;
  ud.gunHolder.clear();
  if (!id) return;
  const m = createWeaponModel(id, 0.75);
  ud.gunHolder.add(m);
}

// Huevo podrido (objetivo): verde amarronado con manchas, brillo tóxico y moscas.
let rottenTex;
function rottenTexture() {
  if (rottenTex) return rottenTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#9aa53a'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = ['#5d4a1c', '#6f7d22', '#3d3a14', '#c4c95a'][i % 4];
    ctx.globalAlpha = 0.65;
    ctx.beginPath(); ctx.ellipse(Math.random() * 256, Math.random() * 256, 4 + Math.random() * 16, 3 + Math.random() * 10, Math.random() * 3, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = '#2d2a10'; ctx.lineWidth = 2;
  for (let i = 0; i < 5; i++) { ctx.beginPath(); let x = Math.random() * 256, y = Math.random() * 256; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 30; y += (Math.random() - 0.5) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
  rottenTex = new THREE.CanvasTexture(c);
  rottenTex.colorSpace = THREE.SRGBColorSpace;
  return rottenTex;
}

export function createRottenEgg() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ map: rottenTexture(), color: 0xffffff, roughness: 0.6, emissive: 0x6dff3a, emissiveIntensity: 0.25 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(eggProfile(0.75, 0.55), 24), mat);
  body.castShadow = true;
  g.add(body);
  // Aura tóxica.
  const aura = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({ color: 0x8dff4a, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.position.y = 0.37; g.add(aura);
  // Moscas.
  const flies = new THREE.Group();
  const flyG = new THREE.SphereGeometry(0.025, 5, 4), flyM = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (let i = 0; i < 6; i++) { const f = new THREE.Mesh(flyG, flyM); f.userData.ph = Math.random() * 6; f.userData.r = 0.45 + Math.random() * 0.3; flies.add(f); }
  g.add(flies);
  // Luz de alarma (cuando está instalado).
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
  beacon.position.y = 0.82; beacon.visible = false; g.add(beacon);
  const light = new THREE.PointLight(0x9dff4a, 2.5, 7, 2);
  light.position.y = 0.6; g.add(light);
  g.userData = { body, aura, flies, beacon, light, mat };
  return g;
}

export function animateRottenEgg(egg, t, planted) {
  const { flies, aura, beacon, light } = egg.userData;
  flies.children.forEach((f, i) => {
    const a = t * (3 + i * 0.4) + f.userData.ph;
    f.position.set(Math.cos(a) * f.userData.r, 0.5 + Math.sin(a * 1.7) * 0.25, Math.sin(a) * f.userData.r);
  });
  aura.scale.setScalar(1 + Math.sin(t * 4) * 0.08);
  beacon.visible = planted && Math.sin(t * (planted.fast ? 22 : 9)) > 0;
  light.color.setHex(planted ? 0xff3b2a : 0x9dff4a);
  light.intensity = planted ? (beacon.visible ? 4 : 1) : 2.5;
}

// ---------- Armas ----------
const gunMats = new Map();
function gm(color, metal = 0.5, rough = 0.45, emissive = 0) {
  const k = `${color}-${metal}-${rough}-${emissive}`;
  if (!gunMats.has(k)) gunMats.set(k, new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, emissive, emissiveIntensity: emissive ? 1.4 : 0 }));
  return gunMats.get(k);
}

function part(g, geo, mat, x, y, z, rx = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m;
}

// Modelo del arma apuntando hacia -Z. Escala 1 = vista en primera persona.
export function createWeaponModel(id, scale = 1) {
  const w = WEAPONS[id];
  const g = new THREE.Group();
  const body = gm(w.color, 0.55, 0.42), acc = gm(w.accent, 0.3, 0.4, w.accent), dark = gm(0x1b1d20, 0.6, 0.5), wood = gm(0x6b4126, 0, 0.7);
  const B = (sx, sy, sz) => new THREE.BoxGeometry(sx, sy, sz);
  const C = (r, l) => new THREE.CylinderGeometry(r, r, l, 10).rotateX(Math.PI / 2);
  switch (id) {
    case 'pistola':
      part(g, B(0.07, 0.09, 0.26), body, 0, 0, -0.05);
      part(g, B(0.06, 0.16, 0.08), dark, 0, -0.1, 0.04);
      part(g, C(0.018, 0.08), dark, 0, 0.01, -0.21);
      part(g, B(0.072, 0.012, 0.2), acc, 0, 0.05, -0.05);
      break;
    case 'revolver':
      part(g, B(0.07, 0.08, 0.16), body, 0, 0, 0);
      part(g, new THREE.CylinderGeometry(0.055, 0.055, 0.09, 10).rotateX(Math.PI / 2), dark, 0, 0, -0.05);
      part(g, C(0.022, 0.26), body, 0, 0.02, -0.22);
      part(g, B(0.06, 0.16, 0.08), wood, 0, -0.1, 0.08);
      part(g, B(0.072, 0.012, 0.1), acc, 0, 0.05, 0);
      break;
    case 'smg':
      part(g, B(0.08, 0.11, 0.38), body, 0, 0, -0.06);
      part(g, C(0.02, 0.14), dark, 0, 0.01, -0.31);
      part(g, B(0.05, 0.2, 0.06), dark, 0, -0.14, -0.12);
      part(g, B(0.05, 0.13, 0.07), dark, 0, -0.1, 0.08);
      part(g, B(0.04, 0.05, 0.18), body, 0, -0.01, 0.2);
      part(g, B(0.082, 0.015, 0.3), acc, 0, 0.06, -0.06);
      break;
    case 'rifle':
      part(g, B(0.08, 0.12, 0.52), body, 0, 0, -0.08);
      part(g, C(0.022, 0.32), dark, 0, 0.02, -0.5);
      part(g, B(0.06, 0.2, 0.08), dark, 0, -0.15, -0.12);
      part(g, B(0.05, 0.13, 0.07), dark, 0, -0.1, 0.08);
      part(g, B(0.07, 0.12, 0.26), body, 0, -0.02, 0.3);
      part(g, B(0.04, 0.04, 0.16), dark, 0, 0.09, -0.08);
      part(g, B(0.082, 0.02, 0.34), acc, 0, 0.0, -0.3);
      break;
    case 'escopeta':
      part(g, B(0.09, 0.11, 0.36), body, 0, 0, 0);
      part(g, C(0.03, 0.55), dark, 0, 0.03, -0.42);
      part(g, C(0.028, 0.4), wood, 0, -0.04, -0.36);
      part(g, B(0.07, 0.13, 0.3), wood, 0, -0.04, 0.3);
      part(g, B(0.092, 0.015, 0.16), acc, 0, 0.06, 0);
      break;
    case 'francotirador':
      part(g, B(0.08, 0.11, 0.6), body, 0, 0, -0.05);
      part(g, C(0.02, 0.6), dark, 0, 0.02, -0.62);
      part(g, C(0.045, 0.3), dark, 0, 0.12, -0.05);
      part(g, new THREE.CircleGeometry(0.04, 12), gm(0x72ffd0, 0.1, 0.1, 0x2a8f6a), 0, 0.12, -0.201).rotation.y = Math.PI;
      part(g, B(0.05, 0.13, 0.07), dark, 0, -0.1, 0.1);
      part(g, B(0.07, 0.14, 0.32), body, 0, -0.03, 0.38);
      part(g, B(0.082, 0.015, 0.4), acc, 0, 0.06, -0.15);
      break;
    case 'ametralladora':
      part(g, B(0.11, 0.14, 0.56), body, 0, 0, -0.05);
      part(g, C(0.03, 0.42), dark, 0, 0.02, -0.52);
      part(g, B(0.16, 0.14, 0.16), gm(0x55602f, 0.2, 0.8), 0.02, -0.14, -0.08);
      part(g, B(0.05, 0.13, 0.07), dark, 0, -0.11, 0.1);
      part(g, B(0.08, 0.13, 0.26), body, 0, -0.02, 0.33);
      part(g, B(0.112, 0.02, 0.4), acc, 0, 0.08, -0.12);
      break;
  }
  // Punto de salida del fogonazo.
  const muzzle = new THREE.Object3D();
  const len = { pistola: -0.26, revolver: -0.36, smg: -0.4, rifle: -0.68, escopeta: -0.7, francotirador: -0.93, ametralladora: -0.74 }[id];
  muzzle.position.set(0, 0.02, len);
  g.add(muzzle);
  g.userData.muzzle = muzzle;
  g.scale.setScalar(scale);
  return g;
}

export function createMedkit() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.45), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 }));
  g.add(box);
  const red = new THREE.MeshStandardMaterial({ color: 0xff2b2b, emissive: 0xff2b2b, emissiveIntensity: 0.6 });
  for (const s of [-1, 1]) {
    const a = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.02), red); a.position.z = s * 0.23; g.add(a);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.3, 0.02), red); b.position.z = s * 0.23; g.add(b);
  }
  g.children.forEach((c) => (c.castShadow = true));
  return g;
}

export function createPickupRing(color = 0xffd36b) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------- Huevero Freyre ----------
// Joven vendedor de huevos: gorra marrón, delantal oscuro, remera clara y una sonrisa grande.
export function createFreyre() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe9b48f, roughness: 0.6 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.8 });
  const apron = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.85 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x3b4a63, roughness: 0.9 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x7a4e2c, roughness: 0.75 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  const hips = new THREE.Group(); hips.position.y = 0.95; g.add(hips);
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(s * 0.13, 0, 0); hips.add(leg);
    add(leg, new THREE.CylinderGeometry(0.085, 0.075, 0.85, 10), pants, 0, -0.43, 0);
    add(leg, new THREE.BoxGeometry(0.15, 0.09, 0.28), shoe, 0, -0.88, -0.05);
    legs.push(leg);
  }
  const torso = new THREE.Group(); hips.add(torso);
  add(torso, new THREE.CylinderGeometry(0.22, 0.2, 0.62, 14), shirt, 0, 0.32, 0);
  // Delantal oscuro con tiras y bolsillo.
  const ap = add(torso, new THREE.BoxGeometry(0.42, 0.8, 0.04), apron, 0, 0.12, -0.21);
  ap.castShadow = false;
  add(torso, new THREE.BoxGeometry(0.2, 0.09, 0.02), new THREE.MeshStandardMaterial({ color: 0x15171a }), 0, 0.02, -0.235);
  for (const s of [-1, 1]) add(torso, new THREE.BoxGeometry(0.04, 0.3, 0.42), apron, s * 0.15, 0.52, 0);
  add(torso, new THREE.BoxGeometry(0.46, 0.05, 0.44), apron, 0, 0.1, 0);
  const arms = [];
  for (const s of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(s * 0.29, 0.58, 0); torso.add(sh);
    add(sh, new THREE.SphereGeometry(0.085, 10, 8), shirt, 0, 0, 0);
    add(sh, new THREE.CylinderGeometry(0.07, 0.06, 0.32, 10), shirt, 0, -0.17, 0);
    add(sh, new THREE.CylinderGeometry(0.055, 0.05, 0.3, 10), skin, 0, -0.45, 0);
    add(sh, new THREE.SphereGeometry(0.065, 10, 8), skin, 0, -0.62, 0);
    arms.push(sh);
  }
  // Huevo en la mano derecha.
  const eggInHand = add(arms[1], new THREE.LatheGeometry(eggProfile(0.16, 0.12, 12), 14), new THREE.MeshStandardMaterial({ color: 0xf3e2c6, roughness: 0.4 }), 0, -0.76, -0.02);
  eggInHand.rotation.x = Math.PI;
  const head = new THREE.Group(); head.position.y = 0.75; torso.add(head);
  add(head, new THREE.CylinderGeometry(0.06, 0.07, 0.12, 10), skin, 0, -0.02, 0);
  const face = add(head, new THREE.SphereGeometry(0.2, 20, 16), skin, 0, 0.2, 0);
  face.scale.set(0.95, 1.08, 0.95);
  add(head, new THREE.SphereGeometry(0.205, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 0.21, 0.03).scale.set(1, 0.9, 1);
  for (const s of [-1, 1]) {
    add(head, new THREE.SphereGeometry(0.045, 8, 6), skin, s * 0.2, 0.19, 0); // orejas
    add(head, new THREE.SphereGeometry(0.026, 8, 6), eyeWhite, s * 0.072, 0.25, -0.18);
    add(head, new THREE.SphereGeometry(0.015, 8, 6), eyeBlack, s * 0.072, 0.25, -0.2);
    const brow = add(head, new THREE.BoxGeometry(0.07, 0.014, 0.01), hair, s * 0.072, 0.3, -0.19);
    brow.rotation.z = s * -0.15;
  }
  add(head, new THREE.SphereGeometry(0.03, 8, 6), skin, 0, 0.19, -0.2); // nariz
  const smile = add(head, new THREE.TorusGeometry(0.06, 0.011, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a2f2a }), 0, 0.12, -0.185);
  smile.rotation.z = Math.PI;
  // Gorra marrón con visera.
  const capG = new THREE.Group(); capG.position.set(0, 0.33, 0); head.add(capG);
  add(capG, new THREE.CylinderGeometry(0.2, 0.215, 0.11, 18), cap, 0, 0.02, 0);
  add(capG, new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 0.07, 0).scale.set(1, 0.55, 1);
  const brim = add(capG, new THREE.CylinderGeometry(0.16, 0.16, 0.02, 16, 1, false, Math.PI / 2, Math.PI), cap, 0, -0.02, -0.12);
  brim.scale.set(1.05, 1, 1.25);
  add(capG, new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), cap, 0, 0.18, 0);
  g.userData = { hips, torso, head, arms, legs, smile };
  return g;
}

export function animateFreyre(f, t, mood = 'win') {
  const { hips, torso, head, arms, legs } = f.userData;
  if (mood === 'win') {
    const jump = Math.max(0, Math.sin(t * 5)) * 0.18;
    hips.position.y = 0.95 + jump;
    arms[1].rotation.z = Math.PI * 0.85 + Math.sin(t * 10) * 0.25;   // brazo con el huevo, arriba
    arms[0].rotation.z = -Math.PI * 0.7 - Math.sin(t * 10 + 1) * 0.3; // saludando
    torso.rotation.y = Math.sin(t * 2) * 0.15;
    head.rotation.z = Math.sin(t * 5) * 0.08;
    legs[0].rotation.x = -jump * 1.5; legs[1].rotation.x = jump * 1.5;
  } else {
    hips.position.y = 0.95;
    const s = (Math.sin(t * 2) + 1) / 2;
    arms[0].rotation.z = -0.5 - s * 0.6; arms[1].rotation.z = 0.5 + s * 0.6; // hombros arriba: "y bueno..."
    arms[0].rotation.x = arms[1].rotation.x = -0.4;
    head.rotation.z = Math.sin(t * 1.5) * 0.15;
    torso.rotation.y = 0;
  }
}

// Escenario de la Huevería Freyre para la pantalla final.
export function createHueveria() {
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 0.3), new THREE.MeshStandardMaterial({ color: 0xf0e2c4, roughness: 0.9 }));
  wall.position.set(0, 2.25, 1.6); wall.receiveShadow = true; g.add(wall);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 1.0), new THREE.MeshStandardMaterial({ map: textTexture('HUEVERÍA FREYRE', { w: 1024, h: 232, font: 'bold 130px Impact, Arial Black, sans-serif' }), roughness: 0.6 }));
  sign.position.set(0, 3.6, 1.44); sign.rotation.y = Math.PI; g.add(sign);
  // Toldo a rayas.
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const x = c.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f5f0e6' : '#b9342a'; x.fillRect(i * 32, 0, 32, 32); }
  const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
  const awn = new THREE.Mesh(new THREE.BoxGeometry(6, 0.08, 1.4), new THREE.MeshStandardMaterial({ map: tt, roughness: 0.8 }));
  awn.position.set(0, 2.9, 0.9); awn.rotation.x = -0.35; awn.castShadow = true; g.add(awn);
  // Mostrador con maples de huevos.
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.8), new THREE.MeshStandardMaterial({ color: 0x7a5532, roughness: 0.8 }));
  counter.position.set(1.9, 0.45, 0.9); counter.castShadow = counter.receiveShadow = true; g.add(counter);
  const eggG = new THREE.LatheGeometry(eggProfile(0.09, 0.07, 10), 10);
  const eggM = new THREE.MeshStandardMaterial({ color: 0xf2ddbf, roughness: 0.5 });
  const trayM = new THREE.MeshStandardMaterial({ color: 0xa8a39a, roughness: 1 });
  for (let t = 0; t < 3; t++) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.55), trayM);
    tray.position.set(0.8 + t * 0.95, 0.92, 0.9); g.add(tray);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 4; j++) {
      const e = new THREE.Mesh(eggG, eggM); e.position.set(0.55 + t * 0.95 + i * 0.12, 0.94, 0.72 + j * 0.12); g.add(e);
    }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: 0x9c958a, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  return g;
}
