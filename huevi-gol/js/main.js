// Huevi Gol: fútbol de jugadas. Dibujás el pase y el tiro con el dedo.
// Duelo por turnos: cuando uno patea, el otro maneja en secreto al arquero.

import { THREE, HW, GH, BR, KITS, mulberry32, renderer, scene, camera, ball, trail, setGoldBall,
  makePlayer, disposePlayer, setRing, faceTo, animatePlayer } from './world.js';
import { Link } from './net.js';
import { sfx, audioUnlock, setMuted, isMuted } from './sound.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const V3 = THREE.Vector3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const gauss = (r) => { let u = 0; while (!u) u = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };

// ---------- Escenarios ----------
// att: atacantes [x, z] (el primero tiene la pelota). def: marcadores. wall: jugadores en la barrera.
const SCENARIOS = [
  { name: 'Penal', att: [[0, 11]], def: [], wall: 0 },
  { name: 'Tiro libre al borde del área', att: [[1, 21]], def: [], wall: 4 },
  { name: 'Contraataque', att: [[-3, 31], [9, 18], [-11, 15]], def: [[2, 24], [6, 11], [-6, 10], [0.5, 8]], wall: 0 },
  { name: 'Tiro libre de costado', att: [[-12, 19], [4, 13]], def: [[2, 9], [6, 12]], wall: 3 },
  { name: 'Mano a mano', att: [[-5, 16]], def: [[-4.6, 19.5]], wall: 0 },
  { name: 'Juego por el medio', att: [[8, 27], [0, 19], [-9, 12]], def: [[4, 22], [-3, 12.5], [6, 10.5], [1, 8]], wall: 0 },
  { name: 'Tiro libre lejano', att: [[-2, 27], [9, 15]], def: [[6.5, 11]], wall: 5 },
  { name: 'Desde la banda', att: [[-21, 13], [2, 10], [6, 17]], def: [[0.5, 6.5], [4, 12], [-3, 12], [9, 13]], wall: 0 },
];
const ZONES = [{ x: -2.35, y: 1.75 }, { x: 0, y: 1.75 }, { x: 2.35, y: 1.75 }, { x: -2.35, y: 0.55 }, { x: 0, y: 0.55 }, { x: 2.35, y: 0.55 }];
const zoneOf = (x, y) => (y > 1.15 ? 0 : 3) + (x < -1.2 ? 0 : x > 1.2 ? 2 : 1);
const ROUNDS = 5;
const SHOT_CLOCK = 25;
const MAX_PASSES = 3;

// ---------- Estado del mundo ----------
const W = { players: [], owner: null, keeper: null, scen: null, passes: 0, attSlot: 0 };
const M = { mode: null, active: false };
let link = null;

const attackers = () => W.players.filter((p) => p.role === 'att');
const blockers = () => W.players.filter((p) => p.role === 'def');
const goalDir = (p) => new V3(-p.pos.x, 0, -p.pos.z).normalize();

function ballSpot(p) { return p.pos.clone().addScaledVector(goalDir(p), 0.42).setY(BR); }

function setupScenario(scen, attSlot, seed) {
  for (const p of W.players) disposePlayer(p);
  W.players = []; W.scen = scen; W.attSlot = attSlot; W.passes = 0;
  const rng = mulberry32(seed);
  const ka = KITS[attSlot], kd = KITS[1 - attSlot];
  const nums = [10, 9, 7, 11, 8];
  scen.att.forEach(([x, z], i) => {
    const p = makePlayer(ka, { num: nums[i], rng });
    p.role = 'att'; p.holder.position.set(x, 0, z); W.players.push(p);
  });
  const owner = W.players[0];
  const B = owner.pos.clone();
  if (scen.wall) {
    const aim = Math.abs(B.x) > 3 ? new V3(Math.sign(B.x) * 1.6, 0, 0) : new V3(0, 0, 0);
    const dir = aim.sub(B).setY(0).normalize();
    const c = B.clone().addScaledVector(dir, 9.15);
    const perp = new V3(-dir.z, 0, dir.x);
    for (let i = 0; i < scen.wall; i++) {
      const p = makePlayer(kd, { num: 2 + i, rng });
      p.role = 'def'; p.type = 'wall'; p.anim = 'wall';
      p.holder.position.copy(c).addScaledVector(perp, (i - (scen.wall - 1) / 2) * 0.56);
      W.players.push(p);
    }
  }
  for (const [x, z] of scen.def) {
    const p = makePlayer(kd, { num: 3 + Math.floor(rng() * 4), rng });
    p.role = 'def'; p.type = 'mark'; p.anim = 'ready';
    p.holder.position.set(x, 0, z); W.players.push(p);
  }
  const gk = makePlayer(kd, { num: 1, rng, keeper: true });
  gk.role = 'gk'; gk.anim = 'gk';
  gk.base = new V3(clamp(B.x * 0.1, -1.2, 1.2), 0, 0.55);
  gk.holder.position.copy(gk.base);
  W.players.push(gk); W.keeper = gk;
  W.owner = owner;
  owner.anim = 'ready';
  ball.position.copy(ballSpot(owner));
  ball.rotation.set(0, 0, 0);
  setGoldBall(false);
  BALL.free = false; BALL.vel.set(0, 0, 0);
  faceAll();
  updateRings(false);
}

function faceAll() {
  const b = ball.position;
  for (const p of W.players) {
    if (p === W.owner) faceTo(p, 0, 0);
    else if (p.role === 'att') faceTo(p, lerp(b.x, 0, 0.5), lerp(b.z, 0, 0.5));
    else faceTo(p, b.x, b.z);
  }
}

function updateRings(on) {
  for (const p of W.players) setRing(p, on && p.role === 'att' ? (p === W.owner ? 'owner' : (W.passes < MAX_PASSES ? 'mate' : null)) : null);
}

// ---------- Cámara ----------
const CAM = { pos: new V3(0, 12, 40), look: new V3(0, 1, 0), tPos: new V3(0, 12, 40), tLook: new V3(0, 1, 0), speed: 2.5 };
function camBehind(p, instant = false) {
  const d = goalDir(p), D = Math.hypot(p.pos.x, p.pos.z);
  CAM.tPos.copy(p.pos).addScaledVector(d, -(6.8 + D * 0.12)).setY(4.6 + D * 0.1);
  CAM.tLook.copy(p.pos).addScaledVector(d, Math.min(D * 0.62, 15)).setY(0.2);
  if (instant) { CAM.pos.copy(CAM.tPos); CAM.look.copy(CAM.tLook); }
}
function camIntro(p) {
  const d = goalDir(p);
  CAM.pos.copy(p.pos).addScaledVector(d, -16).setY(13).add(new V3(d.z * 8, 0, -d.x * 8));
  CAM.look.set(p.pos.x * 0.5, 0, p.pos.z * 0.5);
  CAM.speed = 1.6;
  camBehind(p);
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const hf = 64 * Math.PI / 180;
  camera.fov = clamp(2 * Math.atan(Math.tan(hf / 2) / camera.aspect) * 180 / Math.PI, 44, 76);
  camera.updateProjectionMatrix();
  fx.width = w * devicePixelRatio; fx.height = h * devicePixelRatio;
}
const fx = $('#fx'), fxc = fx.getContext('2d');
addEventListener('resize', resize);

// ---------- Tweens y física de la pelota ----------
const tweens = new Set();
function tween(dur, fn) {
  return new Promise((res) => { const tw = { t: 0, dur: Math.max(0.001, dur), fn, res }; tweens.add(tw); fn(0); });
}
const BALL = { free: false, vel: new V3(), inNet: false, trailOn: false, trailGold: false, hist: [] };
function freeBall(vel, inNet = false) { BALL.free = true; BALL.vel.copy(vel); BALL.inNet = inNet; }

function stepBall(dt) {
  if (!BALL.free) return;
  const p = ball.position, v = BALL.vel;
  v.y -= 9.8 * dt;
  p.addScaledVector(v, dt);
  if (p.y < BR) { p.y = BR; if (v.y < 0) v.y = -v.y * 0.45; v.x *= 0.85; v.z *= 0.85; if (Math.abs(v.y) < 0.4) v.y = 0; }
  if (BALL.inNet) {
    const back = -1 - (1 - clamp(p.y / GH, 0, 1));
    if (p.z < back + 0.15) { p.z = back + 0.15; v.z = Math.abs(v.z) * 0.08; v.x *= 0.4; }
    if (p.y > GH - 0.15) { p.y = GH - 0.15; v.y = Math.min(0, v.y); }
    if (Math.abs(p.x) > HW - 0.15) { p.x = Math.sign(p.x) * (HW - 0.15); v.x *= -0.2; }
  }
  v.x *= 1 - dt * 0.5; v.z *= 1 - dt * 0.5;
  spinBall(v, dt);
}
function spinBall(v, dt) {
  const s = Math.hypot(v.x, v.z);
  if (s < 0.01) return;
  ball.rotation.x -= (v.z / BR) * dt * 0.5;
  ball.rotation.z += (v.x / BR) * dt * 0.5;
}

// ---------- Planificación de jugadas (determinística, igual en los dos celulares) ----------
function bez(S, C, T, t, out = new V3()) {
  const u = 1 - t;
  return out.set(u * u * S.x + 2 * u * t * C.x + t * t * T.x, u * u * S.y + 2 * u * t * C.y + t * t * T.y, u * u * S.z + 2 * u * t * C.z + t * t * T.z);
}

function planPass(toIdx, lofted) {
  const recv = W.players[toIdx];
  const S = ball.position.clone().setY(BR);
  const dir = recv.pos.clone().sub(S).setY(0).normalize();
  const R = recv.pos.clone().addScaledVector(dir, -0.4).setY(BR);
  const dist = S.distanceTo(R);
  let hit = -1, tHit = 1;
  W.players.forEach((d, i) => {
    if (d.role !== 'def') return;
    let t = 2;
    if (lofted) { if (Math.hypot(d.pos.x - R.x, d.pos.z - R.z) < 1.35) t = 0.94; }
    else {
      const ax = R.x - S.x, az = R.z - S.z, L2 = ax * ax + az * az;
      const u = clamp(((d.pos.x - S.x) * ax + (d.pos.z - S.z) * az) / L2, 0, 1);
      const dd = Math.hypot(S.x + ax * u - d.pos.x, S.z + az * u - d.pos.z);
      if (dd < 0.95 && u > 0.04) t = u;
    }
    if (t < tHit) { tHit = t; hit = i; }
  });
  return { S, R, dist, lofted, dur: dist / (lofted ? 12.5 : 16.5) + 0.08, peak: lofted ? 1.3 + dist * 0.13 : 0, hit, tHit: hit >= 0 ? tHit : 1 };
}

function planShot(a) {
  const B = ball.position.clone().setY(BR);
  const T = new V3(a.tx, a.ty, 0);
  const hd = new V3(T.x - B.x, 0, T.z - B.z);
  const D = hd.length(); hd.normalize();
  const perp = new V3(-hd.z, 0, hd.x);
  const C = B.clone().add(T).multiplyScalar(0.5).addScaledVector(perp, a.c * D * 0.9);
  const hMid = Math.max(T.y * 0.55 + (1 - a.p) * D * 0.1 + 0.12, 0.18);
  C.y = Math.max(0, 2 * hMid - (B.y + T.y) / 2);
  let len = 0; const q = new V3(), prev = B.clone();
  for (let i = 1; i <= 24; i++) { bez(B, C, T, i / 24, q); len += q.distanceTo(prev); prev.copy(q); }
  const speed = a.gold ? 31 : lerp(15, 28.5, a.p);
  const plan = { B, C, T, D, dur: len / speed, speed, out: null, tEnd: 1, blocker: -1 };

  // ¿lo tapa la barrera o un defensor?
  for (let i = 1; i <= 90 && plan.out == null; i++) {
    const t = i / 90; bez(B, C, T, t, q);
    for (let j = 0; j < W.players.length; j++) {
      const d = W.players[j];
      if (d.role !== 'def') continue;
      const top = d.type === 'wall' ? 2.25 : 1.95;
      if ((q.x - d.pos.x) ** 2 + (q.z - d.pos.z) ** 2 < 0.4 * 0.4 && q.y < top) { plan.out = 'bloqueo'; plan.tEnd = t; plan.blocker = j; break; }
    }
  }
  if (plan.out == null) {
    const ax = Math.abs(T.x), y = T.y;
    const post = Math.abs(ax - HW) < 0.17 && y < GH + 0.06;
    const bar = Math.abs(y - GH) < 0.17 && ax < HW + 0.06;
    if (post || bar) plan.out = 'palo';
    else if (ax < HW && y < GH) {
      const z = ZONES[a.zone ?? 4];
      let reach = 1.15 + 0.5 * (1 - a.p) + Math.max(0, D - 12) * 0.022 - 0.55 * Math.abs(a.c);
      if (a.gold) reach *= 0.6;
      reach = clamp(reach, 0.55, 1.85);
      plan.out = Math.hypot(T.x - z.x, T.y - z.y) < reach ? 'atajada' : 'gol';
    } else plan.out = 'afuera';
    if (plan.out === 'atajada') {
      let t = 1;
      for (let i = 90; i >= 0; i--) { bez(B, C, T, i / 90, q); if (q.z > 0.6) { t = i / 90; break; } }
      plan.tEnd = t;
    }
  }
  // en la repetición manda lo que calculó el que pateó
  if (a.out) { plan.out = a.out; plan.tEnd = a.tEnd; plan.blocker = a.blocker; }
  return plan;
}

// ---------- Ejecutar jugadas (animación) ----------
async function execAction(a) {
  if (a.k === 'pass') return execPass(a);
  if (a.k === 'shot') return execShot(a);
  if (a.k === 'timeout') return 'tiempo';
  return null;
}

async function execPass(a) {
  updateRings(false);
  const owner = W.owner, recv = W.players[a.to];
  faceTo(owner, recv.pos.x, recv.pos.z);
  owner.anim = 'kick'; owner.t = 0;
  await sleep(250);
  sfx.kick(0.4);
  const plan = planPass(a.to, a.lofted);
  const tEnd = a.out === 'int' ? a.tHit : 1;
  BALL.trailOn = true;
  const q = new V3();
  await tween(plan.dur * tEnd, (k) => {
    const t = k * tEnd;
    q.lerpVectors(plan.S, plan.R, t); q.y = BR + plan.peak * 4 * t * (1 - t);
    ball.position.copy(q);
    spinBall(plan.R.clone().sub(plan.S).multiplyScalar(1 / plan.dur), 1 / 60);
  });
  BALL.trailOn = false;
  owner.anim = 'idle';
  if (a.out === 'int') {
    const d = W.players[a.hit];
    d.anim = 'cheer'; d.t = 0;
    freeBall(plan.R.clone().sub(plan.S).setY(0).normalize().multiplyScalar(-1.5).setY(1));
    sfx.ooh();
    return 'intercepcion';
  }
  W.owner = recv; W.passes++;
  recv.anim = 'ready';
  faceTo(recv, 0, 0);
  const spot = ballSpot(recv);
  const from = ball.position.clone();
  // los defensores achican hacia la pelota
  const moves = [];
  for (const d of blockers()) {
    if (d.type !== 'mark') continue;
    const to = spot.clone().sub(d.pos).setY(0);
    const dist = to.length();
    if (dist < 2.2) continue;
    const step = Math.min(1.7, dist - 2);
    const start = d.pos.clone(), end = d.pos.clone().addScaledVector(to.normalize(), step);
    d.anim = 'run';
    moves.push(tween(0.75, (k) => { d.holder.position.lerpVectors(start, end, easeOut(k)); faceTo(d, spot.x, spot.z); }).then(() => { d.anim = 'ready'; }));
  }
  const kp = W.keeper, kStart = kp.pos.clone(), kEnd = new V3(clamp(spot.x * 0.1, -1.2, 1.2), 0, 0.55);
  kp.base = kEnd;
  moves.push(tween(0.6, (k) => { kp.holder.position.lerpVectors(kStart, kEnd, k); faceTo(kp, spot.x, spot.z); }));
  moves.push(tween(0.3, (k) => ball.position.lerpVectors(from, spot, k)));
  camBehind(recv); CAM.speed = 2.6;
  for (const p of attackers()) if (p !== recv) faceTo(p, lerp(spot.x, 0, 0.5), lerp(spot.z, 0, 0.5));
  await Promise.all(moves);
  await sleep(350);
  return null;
}

async function execShot(a) {
  updateRings(false);
  const owner = W.owner;
  const plan = planShot(a);
  if (a.gold) { setGoldBall(true); M.gold[attackerSlot()] = 0; showToast('¡HUEVO DE ORO!', ''); sfx.gold(); }
  faceTo(owner, plan.T.x, plan.T.z);
  owner.anim = 'kick'; owner.t = 0;
  await sleep(270);
  sfx.kick(0.6 + a.p * 0.4);
  for (const p of blockers()) if (p.type === 'wall') p.jump = 0;
  // el arquero se tira a la zona elegida
  const kp = W.keeper, zone = ZONES[a.zone ?? 4];
  const diveStart = plan.dur * 0.3, diveDur = Math.max(0.25, plan.dur * 0.75);
  const kFrom = kp.pos.clone();
  setTimeout(() => {
    const side = Math.abs(zone.x) > 1 ? Math.sign(zone.x) : 0;
    kp.anim = side ? 'dive' : (zone.y > 1 ? 'dive' : 'block');
    tween(diveDur, (k) => {
      const e = easeOut(k);
      kp.holder.position.x = lerp(kFrom.x, zone.x * 0.62, e);
      kp.holder.position.y = side ? Math.max(0, zone.y - 1.05) * Math.sin(Math.PI * Math.min(1, e * 1.1)) * 0.9 + 0.35 * e : (zone.y > 1 ? Math.sin(Math.PI * Math.min(1, k * 1.2)) * 0.45 : 0);
      kp.holder.rotation.z = -side * 1.3 * e;
    });
  }, diveStart * 1000);

  BALL.trailOn = true; BALL.trailGold = !!a.gold;
  const q = new V3(), prev = plan.B.clone();
  await tween(plan.dur * plan.tEnd, (k) => {
    bez(plan.B, plan.C, plan.T, k * plan.tEnd, q);
    const v = q.clone().sub(prev).multiplyScalar(60); prev.copy(q);
    ball.position.copy(q); spinBall(v, 1 / 60);
  });
  BALL.trailOn = false;
  const tE = plan.tEnd, tan = new V3();
  tan.copy(plan.T).sub(plan.C).multiplyScalar(2 * tE).add(plan.C.clone().sub(plan.B).multiplyScalar(2 * (1 - tE))).normalize().multiplyScalar(plan.speed);
  const out = plan.out;
  owner.anim = 'idle';
  if (out === 'gol') { freeBall(tan.multiplyScalar(0.45), true); sfx.net(); }
  else if (out === 'atajada') {
    if (Math.abs(plan.T.x - kp.pos.x) < 1.1 && !a.gold) {
      const from = ball.position.clone();
      tween(0.15, (k) => ball.position.lerpVectors(from, kp.pos.clone().add(new V3(0, 1.1 + kp.pos.y * 0.3, 0.3)), k));
    } else freeBall(new V3(Math.sign(plan.T.x || 1) * 3.5, 2.5, 6));
    sfx.save();
  } else if (out === 'palo') { freeBall(new V3(-Math.sign(plan.T.x) * 1.5 + tan.x * 0.2, 1.2, Math.abs(tan.z) * 0.45)); sfx.post(); }
  else if (out === 'bloqueo') { freeBall(new V3(tan.x * 0.15, 3.5, Math.abs(tan.z) * 0.3)); sfx.block(); }
  else freeBall(tan);
  return out;
}

// ---------- Entrada: deslizar el dedo ----------
const swipe = { on: false, pts: [], fade: [] , fadeT: 0 };
let inputOn = false;
const ray = new THREE.Raycaster();

function screenOf(v) { const p = v.clone().project(camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight, front: p.z < 1 }; }

fx.parentElement; // (el canvas de efectos no recibe toques)
const glc = $('#gl');
glc.addEventListener('pointerdown', (e) => {
  audioUnlock();
  if (!inputOn) return;
  swipe.on = true; swipe.pts = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
  glc.setPointerCapture?.(e.pointerId);
});
glc.addEventListener('pointermove', (e) => {
  if (!swipe.on) return;
  const l = swipe.pts[swipe.pts.length - 1];
  if (Math.hypot(e.clientX - l.x, e.clientY - l.y) > 3) swipe.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
});
const endSwipe = (e) => {
  if (!swipe.on) return;
  swipe.on = false;
  swipe.pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  swipe.fade = swipe.pts; swipe.fadeT = 0.5;
  if (inputOn) handleSwipe(swipe.pts);
};
glc.addEventListener('pointerup', endSwipe);
glc.addEventListener('pointercancel', () => { swipe.on = false; });

function handleSwipe(pts) {
  const s = pts[0], e = pts[pts.length - 1];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  if (len < 35) return;
  const H = innerHeight;
  const dur = Math.max(0.06, (e.t - s.t) / 1000);
  const v = (len / H) / dur; // pantallas por segundo
  // ¿pase a un compañero?
  if (W.passes < MAX_PASSES) {
    let best = -1, bd = Math.max(46, H * 0.065);
    W.players.forEach((p, i) => {
      if (p.role !== 'att' || p === W.owner) return;
      const sp = screenOf(p.pos.clone().setY(0.9));
      const d = Math.hypot(sp.x - e.x, sp.y - e.y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) { myPass(best, v > 1.9); return; }
  }
  if (e.y > s.y - 30) { flashHint('Deslizá hacia el arco para patear'); return; }
  // tiro: punto del arco donde soltaste el dedo
  ray.setFromCamera(new THREE.Vector2(e.x / innerWidth * 2 - 1, -(e.y / innerHeight) * 2 + 1), camera);
  const hit = new V3();
  if (!ray.ray.intersectPlane(new THREE.Plane(new V3(0, 0, 1), 0), hit)) return;
  let tx = clamp(hit.x, -14, 14), ty = clamp(hit.y, 0.12, 6);
  // efecto: cuánto se curva el trazo
  const cx = e.x - s.x, cy = e.y - s.y, cl = Math.hypot(cx, cy);
  let dev = 0;
  for (const p of pts) { const c = (cx * (p.y - s.y) - cy * (p.x - s.x)) / cl; if (Math.abs(c) > Math.abs(dev)) dev = c; }
  let c = clamp(dev / cl, -0.42, 0.42);
  if (Math.abs(c) < 0.05) c = 0;
  const p = clamp((v - 0.7) / 2.6, 0, 1);
  myShot(tx, ty, c, p);
}

function myPass(to, lofted) {
  const plan = planPass(to, lofted);
  const a = { k: 'pass', to, lofted, out: plan.hit >= 0 ? 'int' : 'ok', hit: plan.hit, tHit: plan.tHit };
  doMyAction(a);
}

function myShot(tx, ty, c, p) {
  const gold = M.goldArmed && M.gold[M.me] > 0;
  const D = Math.hypot(ball.position.x - tx, ball.position.z);
  const sd = gold ? 0 : (0.07 + 0.38 * p * p + 0.3 * Math.abs(c)) * (D / 18);
  tx += gauss(Math.random) * sd; ty = Math.max(0.12, ty + gauss(Math.random) * sd * 0.7);
  const a = { k: 'shot', tx: +tx.toFixed(3), ty: +ty.toFixed(3), c: +c.toFixed(3), p: +p.toFixed(3), gold };
  a.zone = M.mode === 'online' ? M.zones[M.turn] : cpuKeeperZone(a);
  const plan = planShot(a);
  Object.assign(a, { out: plan.out, tEnd: plan.tEnd, blocker: plan.blocker });
  M.goldArmed = false;
  const pct = Math.round(p * 100);
  flashHint(`Potencia ${pct}%${c ? ` · efecto ${c > 0 ? '↻' : '↺'}` : ''}`);
  doMyAction(a);
}

function cpuKeeperZone(a) {
  const real = zoneOf(a.tx, a.ty);
  const read = clamp(0.4 - 0.15 * a.p - 0.35 * Math.abs(a.c), 0.12, 0.42);
  if (Math.random() < read) return real;
  const others = [0, 1, 2, 3, 4, 5].filter((z) => z !== real);
  return others[Math.floor(Math.random() * others.length)];
}

async function doMyAction(a) {
  inputOn = false; setClock(false);
  $('#goldBtn').classList.add('hidden');
  if (M.mode === 'online') link.send({ t: 'act', turn: M.turn, a });
  const out = await execAction(a);
  if (!M.active) return;
  if (out) endTurn(out);
  else enableAttack();
}

// ---------- Flujo del partido ----------
const attackerSlot = () => (M.mode === 'practice' ? 0 : M.turn % 2);
const iAttack = () => attackerSlot() === M.me;

function newMatch(cfg) {
  const rng = mulberry32(cfg.seed);
  const order = SCENARIOS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  if (cfg.mode === 'practice') order.sort((a, b) => a - b);
  Object.assign(M, {
    mode: cfg.mode, me: cfg.me, names: cfg.names, seed: cfg.seed, order,
    scores: [0, 0], log: [[], []], turn: 0, ended: -1, gold: [1, 1], goldArmed: false,
    zones: {}, zoneWait: null, queue: [], pumping: false, active: true, rematch: [false, false], tries: 0,
  });
  showScreen(null);
  $('#hud').classList.remove('hidden');
  $('#n0').textContent = M.names[0]; $('#n1').textContent = M.names[1];
  $$('.s0 .kit')[0].style.background = KITS[0].shirt; $$('.s1 .kit')[0].style.background = KITS[1].shirt;
  renderBoard();
  sfx.whistle();
  startTurn();
}

function renderBoard() {
  const prac = M.mode === 'practice';
  $('#s0').textContent = M.scores[0];
  $('#s1').textContent = prac ? M.tries : M.scores[1];
  if (prac) $('#n1').textContent = 'Tiros';
  const round = Math.floor(M.turn / 2) + 1;
  $('#roundLbl').textContent = prac ? `#${M.turn + 1}` : (round > ROUNDS ? 'MS' : `${Math.min(round, ROUNDS)}/${ROUNDS}`);
  for (const i of [0, 1]) {
    const box = $('#d' + i); box.innerHTML = '';
    if (prac) continue;
    const n = Math.max(ROUNDS, M.log[i].length);
    for (let k = 0; k < n; k++) {
      const d = document.createElement('i');
      if (k < M.log[i].length) d.className = M.log[i][k] ? 'ok' : 'no';
      box.appendChild(d);
    }
  }
}

async function startTurn() {
  const turn = M.turn;
  const round = M.mode === 'practice' ? turn : Math.floor(turn / 2);
  const scen = SCENARIOS[M.order[round % M.order.length]];
  const att = attackerSlot();
  setupScenario(scen, att, M.seed + round * 31 + att);
  W.keeper.holder.rotation.z = 0;
  camIntro(W.owner);
  renderBoard();
  const mine = att === M.me;
  showToast(scen.name, M.mode === 'practice' ? 'A patear' : mine ? 'Te toca patear' : `Patea ${M.names[att]} · vos atajás`);
  setHint('');
  await sleep(1300);
  if (!M.active || M.turn !== turn) return;
  if (mine) {
    if (M.mode === 'online') {
      if (M.zones[turn] == null) {
        setHint(`${M.names[1 - M.me]} está acomodando al arquero…`);
        await new Promise((r) => { M.zoneWait = { turn, r }; });
        if (!M.active || M.turn !== turn) return;
      }
    }
    sfx.whistle(true);
    M.clock = SHOT_CLOCK;
    enableAttack(true);
  } else {
    const zone = await keeperPick();
    if (!M.active || M.turn !== turn) return;
    M.myZone = zone;
    if (M.mode === 'online') { link.send({ t: 'keeper', turn, zone }); setHint(`Mirá la jugada de ${M.names[att]}…`); pumpQueue(); }
    else { setHint('Mirá la jugada de la compu…'); cpuAttack(turn, zone); }
  }
}

let hintSeen = { shot: false, pass: false };
function enableAttack(first = false) {
  if (!M.active) return;
  inputOn = true;
  updateRings(true);
  const mates = W.passes < MAX_PASSES && attackers().length > 1;
  if (first) {
    let h = 'Deslizá hacia el arco: soltá donde querés que entre. Curvá el trazo para darle efecto.';
    if (mates) h = hintSeen.pass ? 'Pasala a un compañero (aro celeste) o pateá al arco.' : 'Deslizá hasta un compañero (aro celeste) para pasarla, o directo al arco para patear. Rápido = por arriba.';
    else if (hintSeen.shot) h = W.scen.wall ? 'Curvá el trazo para pasar la barrera. Lento = más bombeado.' : 'Deslizá hacia el arco.';
    hintSeen.shot = true; if (mates) hintSeen.pass = true;
    setHint(h);
  }
  $('#goldBtn').classList.toggle('hidden', !(M.gold[M.me] > 0));
  $('#goldBtn').classList.toggle('armed', !!M.goldArmed);
  setClock(true);
}

function setClock(on) { M.clockOn = on; $('#clock').classList.toggle('on', on); }

async function pumpQueue() {
  if (M.pumping) return;
  M.pumping = true;
  while (M.active && M.queue.length) {
    const { turn, a } = M.queue.shift();
    if (turn !== M.turn) continue;
    const out = await execAction(a);
    if (out) { M.queue = M.queue.filter((x) => x.turn !== turn); M.pumping = false; endTurn(out); return; }
  }
  M.pumping = false;
}

const OUT_TEXT = {
  gol: ['¡GOOOL!', 'gol'], atajada: ['¡ATAJADA!', 'bad'], palo: ['¡PALO!', 'bad'], afuera: ['¡AFUERA!', 'bad'],
  bloqueo: ['¡TAPADA!', 'bad'], intercepcion: ['¡LA CORTARON!', 'bad'], tiempo: ['¡SE ACABÓ EL TIEMPO!', 'bad'],
};

async function endTurn(out) {
  if (M.ended === M.turn) return;
  M.ended = M.turn;
  inputOn = false; setClock(false); updateRings(false);
  $('#goldBtn').classList.add('hidden');
  hideKeeper();
  const att = attackerSlot(), goal = out === 'gol';
  M.log[att].push(goal);
  if (goal) M.scores[att]++;
  if (M.mode === 'practice') M.tries++;
  renderBoard();
  // festejos
  for (const p of W.players) {
    if (p.role === 'att') { p.anim = goal ? 'cheer' : 'sad'; p.t = 0; }
    else if (p.role === 'def' && p.anim !== 'cheer') { p.anim = goal ? 'sad' : 'idle'; }
  }
  setTimeout(() => { if (!goal && out !== 'intercepcion') { W.keeper.anim = out === 'atajada' ? 'cheer' : 'idle'; W.keeper.holder.rotation.z = 0; W.keeper.holder.position.y = 0; } }, 900);
  if (goal) { sfx.cheer(); navigator.vibrate?.(60); CAM.tPos.lerp(new V3(0, 2.4, 6), 0.35); CAM.speed = 1.2; }
  else if (out !== 'tiempo') sfx.ooh();
  const [txt, cls] = OUT_TEXT[out] || ['', ''];
  let sub = '';
  if (M.mode !== 'practice') {
    const who = M.names[att];
    sub = goal ? (att === M.me ? '¡Golazo tuyo!' : `Gol de ${who}`) : (att === M.me ? '' : (out === 'atajada' ? '¡La sacaste vos!' : '¡Zafaste!'));
  }
  showBanner(txt, sub, cls);
  setHint('');
  await sleep(2800);
  if (!M.active) return;
  if (matchOver()) { showEnd(); return; }
  M.turn++;
  startTurn();
}

function matchOver() {
  if (M.mode === 'practice') return false;
  const [a, b] = [M.log[0].length, M.log[1].length], [s0, s1] = M.scores;
  if (a <= ROUNDS && b <= ROUNDS) {
    if (s0 > s1 + (ROUNDS - b) || s1 > s0 + (ROUNDS - a)) return true;
    return a === ROUNDS && b === ROUNDS && s0 !== s1;
  }
  return a === b && s0 !== s1;
}

function showEnd() {
  M.active = false;
  $('#hud').classList.add('hidden');
  const [s0, s1] = M.scores, won = (M.me === 0 ? s0 > s1 : s1 > s0);
  $('#endTitle').textContent = won ? '¡Ganaste el duelo!' : 'Perdiste el duelo';
  $('#endN0').textContent = M.names[0]; $('#endN1').textContent = M.names[1];
  $('#endScore').textContent = `${s0} - ${s1}`;
  $('#endStatus').textContent = '';
  $('[data-act=rematch]').disabled = false;
  showScreen('end');
  won ? sfx.cheer() : sfx.ooh();
}

// ---------- La compu ----------
async function cpuAttack(turn, zone) {
  const alive = () => M.active && M.turn === turn;
  await sleep(900);
  let passes = 0;
  while (alive() && passes < 2) {
    const owner = W.owner, od = Math.hypot(owner.pos.x, owner.pos.z);
    let best = -1, bd = od - 3;
    W.players.forEach((p, i) => { if (p.role === 'att' && p !== owner) { const d = Math.hypot(p.pos.x, p.pos.z); if (d < bd) { bd = d; best = i; } } });
    if (best < 0 || Math.random() < 0.2) break;
    let plan = planPass(best, false), lofted = false;
    if (plan.hit >= 0) { lofted = true; plan = planPass(best, true); }
    const a = { k: 'pass', to: best, lofted, out: plan.hit >= 0 ? 'int' : 'ok', hit: plan.hit, tHit: plan.tHit };
    const out = await execAction(a);
    if (!alive()) return;
    if (out) { endTurn(out); return; }
    passes++;
    await sleep(500 + Math.random() * 500);
  }
  if (!alive()) return;
  const r = Math.random;
  const wall = blockers().some((p) => p.type === 'wall');
  const side = r() < 0.5 ? -1 : 1;
  const tx = r() < 0.75 ? side * (1.6 + r() * 1.9) : (r() - 0.5) * 1.6;
  const ty = r() < 0.5 ? 0.3 + r() * 0.6 : 1.3 + r() * 1.0;
  const p = wall ? 0.25 + r() * 0.35 : 0.45 + r() * 0.5;
  const c = wall ? side * (0.12 + r() * 0.15) * (W.owner.pos.x * side > 0 ? 1 : -1) : (r() - 0.5) * 0.3;
  const gold = M.gold[attackerSlot()] > 0 && r() < 0.22;
  const D = Math.hypot(W.owner.pos.x - tx, W.owner.pos.z);
  const sd = gold ? 0 : (0.07 + 0.38 * p * p + 0.3 * Math.abs(c)) * (D / 18);
  const a = { k: 'shot', tx: tx + gauss(r) * sd, ty: Math.max(0.12, ty + gauss(r) * sd * 0.7), c, p, gold, zone };
  const plan = planShot(a);
  Object.assign(a, { out: plan.out, tEnd: plan.tEnd, blocker: plan.blocker });
  const out = await execAction(a);
  if (alive()) endTurn(out);
}

// ---------- Panel del arquero ----------
let keeperRes = null;
function keeperPick() {
  return new Promise((res) => {
    const panel = $('#keeper');
    panel.classList.remove('hidden', 'locked');
    $$('#keeper .goal button').forEach((b) => b.classList.remove('sel'));
    setHint('');
    const T = 10;
    const bar = $('#keeper .ktimer i');
    const t0 = performance.now();
    const tick = () => {
      if (!keeperRes) return;
      const k = 1 - (performance.now() - t0) / (T * 1000);
      bar.style.transform = `scaleX(${Math.max(0, k)})`;
      if (k <= 0) choose(Math.floor(Math.random() * 6));
      else requestAnimationFrame(tick);
    };
    const choose = (z) => {
      if (!keeperRes) return;
      keeperRes = null;
      panel.classList.add('locked');
      panel.querySelector(`[data-z="${z}"]`).classList.add('sel');
      setTimeout(hideKeeper, 700);
      res(z);
    };
    keeperRes = choose;
    tick();
  });
}
function hideKeeper() { $('#keeper').classList.add('hidden'); }
$$('#keeper .goal button').forEach((b) => b.addEventListener('click', () => { audioUnlock(); keeperRes?.(+b.dataset.z); }));

// ---------- HUD ----------
let toastTimer, bannerTimer, hintTimer;
function showToast(title, sub) {
  const t = $('#toast');
  t.querySelector('b').textContent = title; t.querySelector('span').textContent = sub;
  t.querySelector('span').style.display = sub ? '' : 'none';
  t.classList.add('on'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 1900);
}
function showBanner(txt, sub, cls) {
  const b = $('#banner');
  b.className = ''; void b.offsetWidth;
  b.querySelector('b').textContent = txt;
  const s = b.querySelector('small'); s.textContent = sub; s.style.display = sub ? '' : 'none';
  b.classList.add('on', cls);
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.classList.remove('on'); b.classList.add('out'); }, 2300);
}
let baseHint = '';
function setHint(h) { baseHint = h; clearTimeout(hintTimer); $('#hint').textContent = h; }
function flashHint(h) { $('#hint').textContent = h; clearTimeout(hintTimer); hintTimer = setTimeout(() => { $('#hint').textContent = baseHint; }, 1800); }

$('#goldBtn').addEventListener('click', () => {
  audioUnlock();
  if (!inputOn || !(M.gold[M.me] > 0)) return;
  M.goldArmed = !M.goldArmed;
  $('#goldBtn').classList.toggle('armed', M.goldArmed);
  flashHint(M.goldArmed ? 'Huevo de Oro listo: tu próximo tiro va exacto adonde apuntes' : 'Huevo de Oro guardado');
});
$('#soundBtn').addEventListener('click', () => { setMuted(!isMuted()); $('#soundBtn').textContent = isMuted() ? '🔇' : '🔊'; });
$('#quit').addEventListener('click', () => {
  if (!confirm(M.mode === 'online' ? '¿Abandonar el duelo?' : '¿Salir al menú?')) return;
  leaveMatch();
});

// ---------- Pantallas y menú ----------
function showScreen(id) {
  for (const s of $$('.screen')) s.classList.toggle('hidden', s.id !== id);
}
function showMsg(text, then) {
  const m = $('#msg');
  m.querySelector('p').textContent = text;
  m.classList.remove('hidden');
  m.querySelector('button').onclick = () => { m.classList.add('hidden'); then?.(); };
}

function myName() {
  const n = $('#name').value.trim() || 'Jugador';
  try { localStorage.setItem('hueviGolName', n); } catch { /* sin almacenamiento */ }
  return n;
}
try { $('#name').value = localStorage.getItem('hueviGolName') || ''; } catch { /* nada */ }

function leaveMatch() {
  M.active = false;
  inputOn = false; setClock(false); hideKeeper();
  if (M.zoneWait) { M.zoneWait.r(); M.zoneWait = null; }
  link?.close(); link = null;
  $('#hud').classList.add('hidden');
  showScreen('menu');
  menuCamera();
}

function menuCamera() {
  setupScenario(SCENARIOS[1], 0, 3);
  CAM.tPos.set(14, 9, 30); CAM.tLook.set(0, 1, 6); CAM.speed = 0.6;
}

const actions = {
  menu: () => showScreen('menu'),
  howto: () => showScreen('howto'),
  practice: () => { myName(); newMatch({ mode: 'practice', me: 0, names: [myName(), ''], seed: Math.floor(Math.random() * 1e9) }); },
  cpu: () => newMatch({ mode: 'cpu', me: 0, names: [myName(), 'La Compu'], seed: Math.floor(Math.random() * 1e9) }),
  online: () => { myName(); $('#onlineStatus').textContent = ''; showScreen('online'); },
  host: async () => {
    const st = $('#onlineStatus'); st.textContent = 'Creando sala…';
    link?.close(); link = makeLink();
    try {
      const code = await link.host();
      $('#roomCode').textContent = code;
      showScreen('lobby');
    } catch (e) { st.textContent = e.message; link = null; }
  },
  join: async () => {
    const code = $('#code').value.trim().toUpperCase();
    const st = $('#onlineStatus');
    if (code.length < 4) { st.textContent = 'Escribí el código de 4 letras.'; return; }
    st.textContent = 'Conectando…';
    link?.close(); link = makeLink();
    try { await link.join(code); st.textContent = '¡Conectado! Arrancando…'; link.send({ t: 'hello', name: myName() }); }
    catch (e) { st.textContent = e.message; link = null; }
  },
  leave: () => { link?.close(); link = null; showScreen('online'); },
  share: async () => {
    const url = `${location.origin}${location.pathname}?sala=${$('#roomCode').textContent}`;
    const text = `¡Te desafío a un duelo de Huevi Gol! Código: ${$('#roomCode').textContent}`;
    try { if (navigator.share) await navigator.share({ title: 'Huevi Gol', text, url }); else { await navigator.clipboard.writeText(`${text} ${url}`); showMsg('Link copiado. Pegáselo a tu amigo.'); } }
    catch { /* cancelado */ }
  },
  rematch: () => {
    if (M.mode !== 'online') { newMatch({ mode: M.mode, me: 0, names: M.names, seed: Math.floor(Math.random() * 1e9) }); return; }
    if (!link?.connected) { showMsg('Tu rival ya no está conectado.', () => { showScreen('menu'); }); return; }
    M.rematch[M.me] = true;
    link.send({ t: 'rematch' });
    $('[data-act=rematch]').disabled = true;
    $('#endStatus').textContent = M.rematch[1 - M.me] ? '' : `Esperando que ${M.names[1 - M.me]} acepte…`;
    tryRematch();
  },
  exit: () => { link?.close(); link = null; showScreen('menu'); menuCamera(); },
};
for (const b of $$('[data-act]')) b.addEventListener('click', () => { audioUnlock(); actions[b.dataset.act]?.(); });
$('#code').addEventListener('keydown', (e) => { if (e.key === 'Enter') actions.join(); });

function tryRematch() {
  if (link?.isHost && M.rematch[0] && M.rematch[1]) startOnline(M.names[1]);
}

function startOnline(guestName) {
  const seed = Math.floor(Math.random() * 1e9);
  const names = [myName(), guestName];
  link.send({ t: 'start', seed, names });
  newMatch({ mode: 'online', me: 0, names, seed });
}

function makeLink() {
  const l = new Link();
  l.on('msg', (m) => {
    switch (m.t) {
      case 'hello': if (l.isHost) startOnline(String(m.name || 'Rival').slice(0, 12)); break;
      case 'full': showMsg('Esa sala ya tiene dos jugadores.'); l.close(); if (link === l) link = null; break;
      case 'start': if (!l.isHost) newMatch({ mode: 'online', me: 1, names: m.names, seed: m.seed }); break;
      case 'keeper':
        M.zones[m.turn] = m.zone;
        if (M.zoneWait && M.zoneWait.turn === m.turn) { const w = M.zoneWait; M.zoneWait = null; w.r(); }
        break;
      case 'act': M.queue.push({ turn: m.turn, a: m.a }); if (!M.pumping) pumpQueue(); break;
      case 'rematch':
        M.rematch[1 - M.me] = true;
        if (!M.rematch[M.me]) $('#endStatus').textContent = `${M.names[1 - M.me]} quiere la revancha`;
        tryRematch();
        break;
      case 'bye': lost(); break;
    }
  });
  const lost = () => {
    if (link !== l) return;
    link = null;
    const wasPlaying = M.active && M.mode === 'online';
    if (wasPlaying) { M.active = false; inputOn = false; setClock(false); hideKeeper(); $('#hud').classList.add('hidden'); }
    if (wasPlaying || !$('#lobby').classList.contains('hidden') || !$('#end').classList.contains('hidden')) {
      showMsg('Tu rival se desconectó.', () => { showScreen('menu'); menuCamera(); });
    }
  };
  l.on('lost', lost);
  return l;
}

// ---------- Bucle principal ----------
const lookTmp = new V3();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  for (const tw of [...tweens]) {
    tw.t += dt; const k = Math.min(1, tw.t / tw.dur);
    tw.fn(k);
    if (k >= 1) { tweens.delete(tw); tw.res(); }
  }
  stepBall(dt);
  for (const p of W.players) animatePlayer(p, dt);
  // estela
  BALL.hist.unshift(ball.position.clone());
  if (BALL.hist.length > trail.length * 2) BALL.hist.length = trail.length * 2;
  trail.forEach((m, i) => {
    const h = BALL.hist[i * 2 + 1];
    m.visible = BALL.trailOn && !!h;
    if (h) { m.position.copy(h); m.material.opacity = 0.45 * (1 - i / trail.length); m.material.color.set(BALL.trailGold ? 0xffc928 : 0xffffff); m.scale.setScalar(1 - i / trail.length * 0.6); }
  });
  if (!BALL.trailOn) BALL.trailGold = false;
  // cámara
  const k = 1 - Math.exp(-dt * CAM.speed);
  CAM.pos.lerp(CAM.tPos, k); CAM.look.lerp(CAM.tLook, k);
  if (!M.active) { const a = now / 9000; CAM.tPos.set(Math.sin(a) * 18, 9, 26 + Math.cos(a) * 6); }
  camera.position.copy(CAM.pos); camera.lookAt(lookTmp.copy(CAM.look));
  // reloj de tiro
  if (M.active && M.clockOn && inputOn) {
    M.clock -= dt;
    $('#clock i').style.transform = `scaleX(${Math.max(0, M.clock / SHOT_CLOCK)})`;
    if (M.clock <= 0) doMyAction({ k: 'timeout' });
  }
  drawFx(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

function drawFx(dt) {
  const r = devicePixelRatio;
  fxc.setTransform(r, 0, 0, r, 0, 0);
  fxc.clearRect(0, 0, innerWidth, innerHeight);
  let pts = null, alpha = 1;
  if (swipe.on) pts = swipe.pts;
  else if (swipe.fadeT > 0) { swipe.fadeT -= dt; pts = swipe.fade; alpha = Math.max(0, swipe.fadeT / 0.5); }
  if (!pts || pts.length < 2) return;
  fxc.lineCap = 'round'; fxc.lineJoin = 'round';
  for (const [w, c] of [[14, `rgba(251,191,36,${0.25 * alpha})`], [5, `rgba(255,255,255,${0.95 * alpha})`]]) {
    fxc.lineWidth = w; fxc.strokeStyle = c; fxc.beginPath();
    pts.forEach((p, i) => (i ? fxc.lineTo(p.x, p.y) : fxc.moveTo(p.x, p.y)));
    fxc.stroke();
  }
  const e = pts[pts.length - 1];
  fxc.fillStyle = `rgba(255,255,255,${alpha})`; fxc.beginPath(); fxc.arc(e.x, e.y, 6, 0, Math.PI * 2); fxc.fill();
}

// ---------- Arranque ----------
resize();
menuCamera();
showScreen('menu');
requestAnimationFrame(frame);
{
  const sala = new URLSearchParams(location.search).get('sala');
  if (sala) { $('#code').value = sala.toUpperCase().slice(0, 4); showScreen('online'); }
}
// para pruebas automáticas
window.__hg = { M, W, actions, handleSwipe, screenOf, ball, get inputOn() { return inputOn; } };
