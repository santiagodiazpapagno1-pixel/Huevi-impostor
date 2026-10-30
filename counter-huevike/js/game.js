// Motor de la partida: reglas del huevo podrido, rondas, armas, vida, reapariciones, bots y sincronización online.
// El "authority" (modo solo o el dueño de la sala) simula todo; los invitados mandan su posición/disparos y reciben el estado.

import * as THREE from 'three';
import { RULES, PLAYER, WEAPONS, PICKUP_WEAPONS, ROLE_COLORS, PHRASES, pick } from './config.js';
import { buildMap } from './maps.js';
import { createPlayerEgg, setEggGun, createRottenEgg, animateRottenEgg, createWeaponModel, createMedkit, createPickupRing } from './models.js';
import { BotBrain, PREF } from './bots.js';
import { audio } from './audio.js';
import { raySphere } from './physics.js';

const WIDS = Object.keys(WEAPONS);
const PH = ['live', 'intermission', 'over'];
const EGG_ST = ['loose', 'carried', 'planted'];
const r2 = (v) => Math.round(v * 100) / 100;
const v3 = new THREE.Vector3(), v3b = new THREE.Vector3(), v3c = new THREE.Vector3();

function angleDiff(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

export class Game {
  constructor({ gfx, ui, input, net, mapId, roster, myId, authority, mode, settings }) {
    Object.assign(this, { gfx, ui, input, net, mapId, myId, authority, mode, settings });
    this.now = 0;
    this.paused = false;
    this.map = buildMap(mapId);
    this.world = this.map.world;
    gfx.scene.add(this.map.group);
    gfx.setEnvironment(this.map.env);
    if (this.map.clouds) gfx.effects.addClouds();
    this.objects = [this.map.group];

    // Jugadores.
    this.players = [];
    this.byIdMap = new Map();
    for (const r of roster) this.addPlayer(r);
    this.me = this.byId(myId);

    // Huevo podrido.
    this.eggMesh = createRottenEgg();
    gfx.scene.add(this.eggMesh); this.objects.push(this.eggMesh);
    this.egg = { state: 'loose', pos: this.map.center.clone(), carrier: null, timer: 0, progress: 0, defuser: null };

    // Armas en el mapa (en pares espejados para que sea justo) y botiquines.
    this.pickups = [];
    this.pickupSeq = 0;
    this.map.weaponSpots.forEach((pos, i) => this.addPickup(PICKUP_WEAPONS[Math.floor(i / 2) % PICKUP_WEAPONS.length], pos, false));
    this.medkits = this.map.medkits.map((pos, i) => {
      const mesh = createMedkit(); mesh.position.copy(pos).add(v3.set(0, 0.5, 0));
      gfx.scene.add(mesh); this.objects.push(mesh);
      return { id: i, pos, active: true, respawnAt: 0, mesh };
    });

    // Vista en primera persona.
    this.viewmodel = new THREE.Group();
    gfx.camera.add(this.viewmodel);
    this.vmState = { id: null, kick: 0, swap: 0, bob: 0, swayX: 0, swayY: 0 };
    this.aiming = false;
    this.camShake = 0;
    this.stepTimer = 0;
    this.deathCam = null;

    // Estado de la partida.
    this.state = { phase: 'intermission', time: 0, inter: 4, attacker: 'A', score: { A: 0, B: 0 }, halves: { A: 0, B: 0 }, overtime: false,
      spec: { round: 1, attacker: 'A', dur: RULES.roundTime }, pk: { A: 0, B: 0 }, r3k: { A: 0, B: 0 }, next: null, winner: null };
    this.events = [];
    this.snapTimer = 0; this.inputTimer = 0;
    this.invVerSeen = -1;
    this.lastBeep = 0;
    this.warned = {};
    this.stats = {};

    if (authority) {
      this.state.next = { round: 1, attacker: 'A', dur: RULES.roundTime };
      this.resetRound(true);
    }
    this.applyRoleColors();
    this.lastPhaseKey = '';
  }

  // ---------- Jugadores ----------
  addPlayer(r) {
    const p = {
      id: r.id, name: r.name, team: r.team, bot: !!r.bot, human: !r.bot,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, grounded: false,
      hp: RULES.maxHp, alive: true, respawnAt: 0, deathAt: 0, lastDamage: -99, life: 0,
      weapons: [{ id: 'pistola', mag: WEAPONS.pistola.mag, reserve: Infinity }], cur: 0, reloadEnd: 0, nextShot: 0, bloom: 0,
      kills: 0, deaths: 0, streak: 0, invVer: 0, aiming: false, defuseHeld: false,
      netPos: new THREE.Vector3(), netYaw: 0, netPitch: 0, stepT: 0, lastPos: new THREE.Vector3(), moveSpeed: 0,
      botOut: {},
    };
    p.mesh = createPlayerEgg(0xffffff);
    setEggGun(p.mesh, 'pistola');
    this.gfx.scene.add(p.mesh); this.objects.push(p.mesh);
    if (p.bot) p.brain = new BotBrain(this, p);
    this.players.push(p);
    this.byIdMap.set(p.id, p);
    return p;
  }

  byId(id) { return this.byIdMap.get(id); }
  roleOf(team) { return team === this.state.attacker ? 'atk' : 'def'; }
  baseOf(team) { return this.map.bases[team]; }
  enemyBaseOf(team) { return this.map.bases[team === 'A' ? 'B' : 'A']; }
  eyePos(p, out) { return out.set(p.pos.x, p.pos.y + PLAYER.eye, p.pos.z); }
  inPlantZone(p) {
    const b = this.enemyBaseOf(p.team).pos;
    return Math.hypot(p.pos.x - b.x, p.pos.z - b.z) < RULES.plantRadius && Math.abs(p.pos.y - b.y) < 1.5;
  }

  // Cuando un jugador se desconecta, un bot toma su lugar.
  replaceWithBot(id) {
    const p = this.byId(id);
    if (!p || p.bot) return;
    p.bot = true; p.human = false;
    p.name = p.name + ' (bot)';
    p.brain = new BotBrain(this, p);
    this.emit({ e: 'msg', text: `${p.name.replace(' (bot)', '')} se desconectó: lo reemplaza un bot`, cls: 'info' });
  }

  applyRoleColors() {
    for (const p of this.players) {
      p.mesh.userData.mat.color.setHex(ROLE_COLORS[this.roleOf(p.team)]);
      p.mesh.visible = p.alive && p.id !== this.myId;
    }
    for (const team of ['A', 'B']) {
      const b = this.map.bases[team];
      const c = ROLE_COLORS[this.roleOf(team)];
      b.flag.material.color.setHex(c);
      b.ring.material.color.setHex(this.roleOf(team) === 'def' ? 0xff6b5a : 0x7fb0ff);
      b.ring.material.opacity = this.roleOf(team) === 'def' ? 0.85 : 0.25; // la zona a atacar se resalta
    }
    this.buildNameTags();
  }

  buildNameTags() {
    for (const p of this.players) {
      if (p.tag) { p.mesh.remove(p.tag); p.tag.material.map.dispose(); p.tag.material.dispose(); p.tag = null; }
      if (!this.me || p.team !== this.me.team || p === this.me) continue;
      const c = document.createElement('canvas'); c.width = 256; c.height = 64;
      const x = c.getContext('2d');
      x.font = 'bold 34px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.8)'; x.strokeText(p.name.slice(0, 14), 128, 32);
      x.fillStyle = this.roleOf(p.team) === 'atk' ? '#ffb3ad' : '#b5d3ff'; x.fillText(p.name.slice(0, 14), 128, 32);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
      s.scale.set(1.6, 0.4, 1); s.position.y = 2.0; s.renderOrder = 10;
      p.mesh.add(s); p.tag = s;
    }
  }

  // ---------- Objetos del mapa ----------
  addPickup(weapon, pos, temp, mag, reserve) {
    const mesh = new THREE.Group();
    const gun = createWeaponModel(weapon, 1.4);
    gun.rotation.y = Math.PI / 2;
    mesh.add(gun);
    const ring = createPickupRing(temp ? 0xbfe3ff : 0xffd36b); ring.position.y = -0.48; mesh.add(ring);
    mesh.position.copy(pos).add(v3.set(0, 0.55, 0));
    this.gfx.scene.add(mesh); this.objects.push(mesh);
    const W = WEAPONS[weapon];
    const pu = { id: this.pickupSeq++, weapon, pos: pos.clone(), active: true, respawnAt: 0, temp, expire: this.now + RULES.weaponRespawn,
      mag: mag ?? W.mag, reserve: reserve ?? W.reserve, mesh };
    this.pickups.push(pu);
    return pu;
  }

  removePickup(pu) {
    this.gfx.scene.remove(pu.mesh);
    this.pickups.splice(this.pickups.indexOf(pu), 1);
  }

  // ---------- Rondas ----------
  resetRound(first) {
    const spec = this.state.next;
    const s = this.state;
    s.spec = spec; s.attacker = spec.attacker; s.time = spec.dur; s.overtime = false;
    s.pk = { A: 0, B: 0 };
    s.phase = first ? 'intermission' : 'live';
    if (first) s.inter = 4;
    // Huevo al centro.
    Object.assign(this.egg, { state: 'loose', carrier: null, timer: 0, progress: 0, defuser: null });
    this.egg.pos.copy(this.map.center);
    // Objetos.
    for (const pu of [...this.pickups]) { if (pu.temp) this.removePickup(pu); else { pu.active = true; const W = WEAPONS[pu.weapon]; pu.mag = W.mag; pu.reserve = W.reserve; } }
    for (const m of this.medkits) m.active = true;
    // Todos a su base con vida completa (conservan armas y munición).
    for (const p of this.players) {
      p.alive = true; p.hp = RULES.maxHp; p.respawnAt = 0; p.reloadEnd = 0; p.streak = 0;
      this.spawnAt(p, this.findSpawn(p, true));
    }
    this.emit({ e: 'phase', spec, first: !!first });
  }

  endPhase(winner, reason) {
    const s = this.state;
    if (s.phase !== 'live') return;
    const spec = s.spec;
    if (spec.half) { s.r3k.A += s.pk.A; s.r3k.B += s.pk.B; }
    let next = null, matchWinner = null;
    if (spec.sudden) {
      matchWinner = winner || this.otherTeam(spec.attacker);
      s.score[matchWinner]++;
    } else if (spec.half) {
      if (winner) s.halves[winner]++;
      if (spec.half === 1) next = { round: 3, half: 2, attacker: this.otherTeam(spec.attacker), dur: RULES.halfTime };
      else {
        let w3 = s.halves.A > s.halves.B ? 'A' : s.halves.B > s.halves.A ? 'B' : null;
        if (!w3) w3 = s.r3k.A > s.r3k.B ? 'A' : s.r3k.B > s.r3k.A ? 'B' : null;
        if (w3) { s.score[w3]++; matchWinner = w3; }
        else next = { round: 4, sudden: true, attacker: Math.random() < 0.5 ? 'A' : 'B', dur: RULES.suddenDeathTime };
      }
    } else {
      if (winner) s.score[winner]++;
      if (spec.round === 1) next = { round: 2, attacker: 'B', dur: RULES.roundTime };
      else if (s.score.A !== s.score.B) matchWinner = s.score.A > s.score.B ? 'A' : 'B';
      else next = { round: 3, half: 1, attacker: 'A', dur: RULES.halfTime };
    }
    s.phase = 'intermission';
    s.inter = RULES.intermission;
    s.next = next;
    s.winner = matchWinner;
    this.emit({ e: 'roundEnd', winner, reason, score: { ...s.score }, halves: { ...s.halves }, spec, pk: { ...s.pk }, matchWinner });
  }

  otherTeam(t) { return t === 'A' ? 'B' : 'A'; }

  winnerByKills() { const k = this.state.pk; return k.A > k.B ? 'A' : k.B > k.A ? 'B' : null; }

  // ---------- Reaparición ----------
  findSpawn(p, force) {
    const pts = [...this.map.spawns[p.team]].sort(() => Math.random() - 0.5);
    const enemies = this.players.filter((q) => q.alive && q.team !== p.team && q !== p);
    let fallback = pts[0], fbScore = -1;
    for (const pt of pts) {
      if (this.players.some((q) => q !== p && q.alive && q.pos.distanceTo(pt) < 0.9)) continue;
      let minD = Infinity, seen = false;
      for (const e of enemies) {
        const d = e.pos.distanceTo(pt);
        minD = Math.min(minD, d);
        if (d < 45 && this.world.lineOfSight(this.eyePos(e, v3), v3b.set(pt.x, pt.y + 1.1, pt.z))) seen = true;
      }
      if (minD > 10 && !seen) return pt;
      if (minD > fbScore) { fbScore = minD; fallback = pt; }
    }
    return force ? fallback : null;
  }

  spawnAt(p, pt) {
    p.pos.copy(pt); p.vel.set(0, 0, 0);
    p.netPos.copy(pt);
    const c = this.map.center;
    p.yaw = Math.atan2(-(c.x - pt.x), -(c.z - pt.z)); p.pitch = 0;
    p.alive = true; p.hp = RULES.maxHp; p.lastDamage = -99; p.life++;
    p.reloadEnd = 0; p.invVer++;
    this.emit({ e: 'spawn', id: p.id, p: [r2(pt.x), r2(pt.y), r2(pt.z)], yaw: r2(p.yaw), life: p.life });
  }

  // ---------- Armas ----------
  startReload(p) {
    const w = p.weapons[p.cur], W = WEAPONS[w.id];
    if (p.reloadEnd > 0 || w.mag >= W.mag) return;
    if (w.reserve <= 0) { if (p === this.me) audio.play('empty'); return; }
    p.reloadEnd = this.now + W.reload;
    if (p === this.me) audio.play('reload', null, { dur: W.reload });
  }

  updateReload(p) {
    if (p.reloadEnd > 0 && this.now >= p.reloadEnd) {
      const w = p.weapons[p.cur], W = WEAPONS[w.id];
      const take = Math.min(W.mag - w.mag, w.reserve);
      w.mag += take; if (w.reserve !== Infinity) w.reserve -= take;
      p.reloadEnd = 0;
    }
  }

  // Devuelve true si el arma disparó (respeta cadencia, cargador y recarga automática).
  tryFire(p) {
    if (!p.alive || this.state.phase !== 'live') return false;
    this.updateReload(p);
    if (p.reloadEnd > 0 || this.now < p.nextShot) return false;
    const w = p.weapons[p.cur];
    if (w.mag <= 0) { this.startReload(p); return false; }
    const W = WEAPONS[w.id];
    w.mag--;
    p.nextShot = this.now + W.rate;
    if (w.mag === 0) this.startReload(p);
    return true;
  }

  shotDirs(p) {
    const W = WEAPONS[p.weapons[p.cur].id];
    const moving = p.moveSpeed > 1.5;
    let spread = (W.hipSpread && !p.aiming) ? W.hipSpread : W.spread;
    spread *= (p.aiming ? 0.55 : 1) * (moving ? 1.5 : 1) * (p.grounded || p.bot ? 1 : 2.2);
    spread += p.bloom;
    if (p.bot) spread *= 1.35;
    const dirs = [];
    const fwd = v3.set(0, 0, -1).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
    const right = v3b.set(1, 0, 0).applyEuler(new THREE.Euler(p.pitch, p.yaw, 0, 'YXZ'));
    const up = v3c.crossVectors(right, fwd);
    for (let i = 0; i < W.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const d = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      dirs.push(d);
    }
    p.bloom = Math.min(W.spread * 2.5, p.bloom + W.spread * 0.35);
    return dirs;
  }

  // Resolución de impactos (solo authority). origin: Vector3, dirs: Vector3[]
  resolveShot(shooter, origin, dirs, wid) {
    const W = WEAPONS[wid];
    const maxT = Math.min(160, W.range * 2.5);
    const ends = [];
    const dmgBy = new Map();
    for (const d of dirs) {
      const wh = this.world.raycast(origin.x, origin.y, origin.z, d.x, d.y, d.z, maxT);
      let bestT = wh ? wh.t : maxT, victim = null, head = false;
      for (const q of this.players) {
        if (!q.alive || q === shooter || q.team === shooter.team) continue;
        if (Math.abs(q.pos.x - origin.x) > maxT || Math.abs(q.pos.z - origin.z) > maxT) continue;
        const th = raySphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, q.pos.x, q.pos.y + 1.18, q.pos.z, 0.3);
        const tb = raySphere(origin.x, origin.y, origin.z, d.x, d.y, d.z, q.pos.x, q.pos.y + 0.62, q.pos.z, 0.5);
        if (th >= 0 && th < bestT && (tb < 0 || th <= tb + 0.2)) { bestT = th; victim = q; head = true; }
        else if (tb >= 0 && tb < bestT) { bestT = tb; victim = q; head = false; }
      }
      const end = origin.clone().addScaledVector(d, bestT);
      if (victim) {
        const dist = bestT;
        const fall = dist <= W.range ? 1 : Math.max(W.falloff, 1 - (dist - W.range) / W.range * (1 - W.falloff));
        const dmg = W.dmg * fall * (head ? W.head : 1);
        const prev = dmgBy.get(victim) || { dmg: 0, head: false };
        prev.dmg += dmg; prev.head = prev.head || head;
        dmgBy.set(victim, prev);
        ends.push([r2(end.x), r2(end.y), r2(end.z), 2]);
      } else if (wh) {
        ends.push([r2(end.x), r2(end.y), r2(end.z), 1, wh.nx, wh.ny, wh.nz]);
      } else ends.push([r2(end.x), r2(end.y), r2(end.z), 0]);
    }
    this.emit({ e: 'shot', id: shooter.id, w: wid, o: [r2(origin.x), r2(origin.y), r2(origin.z)], ends });
    for (const [victim, h] of dmgBy) this.damage(victim, h.dmg, shooter, h.head, wid);
  }

  damage(victim, amount, attacker, head, wid) {
    if (!victim.alive || this.state.phase !== 'live') return;
    victim.hp -= amount;
    victim.lastDamage = this.now;
    if (victim.brain) victim.brain.onHurt(attacker);
    this.emit({ e: 'hit', v: victim.id, a: attacker?.id, h: head ? 1 : 0, amt: Math.round(amount), ap: attacker ? [r2(attacker.pos.x), r2(attacker.pos.z)] : null });
    if (victim.hp <= 0) this.kill(victim, attacker, head, wid);
  }

  kill(victim, attacker, head, wid, fall = false) {
    if (!victim.alive) return;
    victim.alive = false; victim.hp = 0; victim.deaths++; victim.streak = 0;
    victim.deathAt = this.now; victim.respawnAt = this.now + RULES.respawnTime;
    victim.reloadEnd = 0; victim.defuseHeld = false;
    let streak = 0;
    if (attacker && attacker !== victim && attacker.team !== victim.team) {
      attacker.kills++; attacker.streak++; streak = attacker.streak;
      this.state.pk[attacker.team]++;
    }
    if (this.egg.state === 'carried' && this.egg.carrier === victim.id) this.dropEgg(victim.pos);
    this.emit({ e: 'kill', k: attacker && attacker !== victim ? attacker.id : null, v: victim.id, w: wid, h: head ? 1 : 0, fall: fall ? 1 : 0, st: streak, p: [r2(victim.pos.x), r2(victim.pos.y), r2(victim.pos.z)] });
    // Muerte súbita: la primera eliminación define.
    if (this.state.spec.sudden && this.state.phase === 'live') {
      const w = attacker && attacker.team !== victim.team ? attacker.team : this.otherTeam(victim.team);
      this.endPhase(w, 'sudden');
    }
  }

  // ---------- Huevo ----------
  dropEgg(pos) {
    const f = this.world.floorAt(pos.x, pos.z, pos.y + 0.5);
    this.egg.state = 'loose'; this.egg.carrier = null;
    if (f < this.world.killY + 2 || f === -Infinity) this.egg.pos.copy(this.map.center);
    else this.egg.pos.set(pos.x, f, pos.z);
    this.emit({ e: 'egg', k: 'drop' });
  }

  doInteract(p, kind, arg) {
    if (!p.alive || this.state.phase !== 'live') return;
    const egg = this.egg;
    if (kind === 'pick' && egg.state === 'loose' && p.pos.distanceTo(egg.pos) < RULES.pickupRadius + 0.4) {
      egg.state = 'carried'; egg.carrier = p.id;
      this.emit({ e: 'egg', k: 'pick', id: p.id });
    } else if (kind === 'plant' && egg.state === 'carried' && egg.carrier === p.id && this.roleOf(p.team) === 'atk' && this.inPlantZone(p)) {
      egg.state = 'planted'; egg.carrier = null; egg.timer = RULES.plantTime; egg.progress = 0; egg.defuser = null;
      egg.pos.copy(p.pos);
      this.emit({ e: 'egg', k: 'plant', id: p.id });
    } else if (kind === 'wpick') {
      const pu = this.pickups.find((x) => x.id === arg && x.active);
      if (pu && pu.pos.distanceTo(p.pos) < 2) this.swapPickup(p, pu);
    }
  }

  swapPickup(p, pu) {
    // Nunca se suelta la pistola (munición infinita). Los bots sueltan su peor arma.
    let slot = p.cur;
    if (p.bot || p.weapons[slot].id === 'pistola') {
      slot = -1;
      p.weapons.forEach((w, i) => { if (w.id !== 'pistola' && (slot < 0 || (p.bot && PREF[w.id] < PREF[p.weapons[slot].id]))) slot = i; });
    }
    if (slot < 0) return;
    const old = p.weapons[slot];
    p.weapons[slot] = { id: pu.weapon, mag: pu.mag, reserve: pu.reserve };
    p.cur = slot; p.reloadEnd = 0; p.invVer++;
    this.takePickup(pu);
    const drop = this.addPickup(old.id, v3.copy(p.pos).add(v3b.set(Math.sin(p.yaw) * 0.8, 0, Math.cos(p.yaw) * 0.8)).setY(this.world.floorAt(p.pos.x, p.pos.z, p.pos.y + 0.5)), true, old.mag, old.reserve);
    drop.lockId = p.id; drop.lockUntil = this.now + 4; // el que la soltó no la vuelve a agarrar enseguida
    this.emit({ e: 'pk', id: p.id, w: pu.weapon });
  }

  takePickup(pu) {
    if (pu.temp) this.removePickup(pu);
    else { pu.active = false; pu.respawnAt = this.now + RULES.weaponRespawn; }
  }

  updateEgg(dt) {
    const egg = this.egg, s = this.state;
    if (egg.state === 'carried') {
      const c = this.byId(egg.carrier);
      if (!c || !c.alive) this.dropEgg(c ? c.pos : this.map.center);
      else egg.pos.copy(c.pos);
    }
    if (egg.state === 'planted') {
      egg.timer -= dt;
      // Desactivación: un defensor tiene que mantener apretado 5 segundos sin alejarse ni morir.
      let def = null;
      for (const p of this.players) {
        if (p.alive && p.defuseHeld && this.roleOf(p.team) === 'def' && p.pos.distanceTo(egg.pos) < RULES.defuseRadius) {
          if (p.id === egg.defuser) { def = p; break; }
          if (!def) def = p;
        }
      }
      if (def) {
        if (egg.defuser !== def.id) { egg.defuser = def.id; egg.progress = 0; }
        egg.progress += dt;
        if (egg.progress >= RULES.defuseTime) {
          egg.state = 'loose'; egg.defuser = null; egg.progress = 0;
          this.emit({ e: 'egg', k: 'defuse', id: def.id });
          if (s.overtime) this.endPhase(this.winnerByKills(), 'defuse-ot');
          return;
        }
      } else { egg.defuser = null; egg.progress = 0; }
      if (egg.timer <= 0) {
        this.emit({ e: 'egg', k: 'explode', p: [egg.pos.x, egg.pos.y, egg.pos.z] });
        egg.state = 'loose'; egg.timer = 0;
        this.endPhase(s.attacker, 'explode');
        return;
      }
    }
    if (egg.state === 'loose' && s.overtime) this.endPhase(this.winnerByKills(), 'drop-ot');
  }

  // ---------- Bucle principal ----------
  update(dt) {
    if (this.paused) { this.updateCamera(dt); return; }
    dt = Math.min(dt, 0.1);
    this.now += dt;
    const s = this.state;
    if (this.authority) this.updateAuthority(dt);
    this.updateLocal(dt);
    this.updateVisuals(dt);
    this.updateCamera(dt);
    // Avisos de tiempo.
    if (s.phase === 'live') {
      const key = s.spec.round + '-' + (s.spec.half || 0);
      if (this.lastPhaseKey !== key) { this.lastPhaseKey = key; this.warned = {}; }
      if (!s.overtime && s.time < 30 && !this.warned[30]) { this.warned[30] = 1; this.ui.toast(PHRASES.last30, 'warn'); }
      if (!s.overtime && s.time < 10 && !this.warned[10]) { this.warned[10] = 1; this.ui.toast(PHRASES.last10, 'warn'); }
    }
    // Pitidos del huevo instalado (más rápidos al final).
    if (this.egg.state === 'planted') {
      const t = this.egg.timer, iv = t > 30 ? 1 : t > 10 ? 0.5 : 0.22;
      if (this.now - this.lastBeep > iv) { this.lastBeep = this.now; audio.play('beep', this.egg.pos, { hi: t < 10, maxDist: 90 }); }
    }
    this.ui.hud(this);
    this.flushNet(dt);
  }

  updateAuthority(dt) {
    const s = this.state;
    if (s.phase === 'intermission') {
      s.inter -= dt;
      if (s.inter <= 0) {
        if (s.winner) { s.phase = 'over'; this.emit({ e: 'matchEnd', winner: s.winner, score: { ...s.score }, stats: this.statsTable() }); }
        else if (s.next === s.spec) { s.phase = 'live'; s.next = null; } // fin de la cuenta inicial
        else if (s.next) this.resetRound(false);
      }
    } else if (s.phase === 'live') {
      if (!s.overtime) s.time -= dt;
      this.updateEgg(dt);
      if (s.phase === 'live' && !s.overtime && s.time <= 0) {
        s.time = 0;
        if (this.egg.state === 'planted') { s.overtime = true; this.emit({ e: 'msg', text: PHRASES.overtime, cls: 'warn' }); }
        else if (s.spec.sudden) this.endPhase(this.otherTeam(s.attacker), 'time');
        else this.endPhase(this.winnerByKills(), 'time');
      }
    }
    const live = s.phase === 'live';
    for (const p of this.players) {
      if (p === this.me) continue;
      if (p.bot) {
        const out = p.brain.update(dt);
        if (live) {
          if (out.swap >= 0 && out.swap < p.weapons.length) { p.cur = out.swap; p.reloadEnd = 0; p.nextShot = this.now + 0.4; }
          this.updateReload(p);
          if (p.alive && p.weapons[p.cur].mag <= 0) this.startReload(p);
          if (out.fire && this.tryFire(p)) {
            const o = this.eyePos(p, new THREE.Vector3());
            this.resolveShot(p, o, this.shotDirs(p), p.weapons[p.cur].id);
          }
          if (out.interact) this.doInteract(p, 'pick');
          if (out.plant) this.doInteract(p, 'plant');
          p.defuseHeld = out.defuse;
          if (p.alive) this.stepMove(p, out.mx, out.mz, out.jump, dt);
        }
      } else if (p.alive) {
        // Invitado: posición que manda su dispositivo (suavizada).
        p.pos.lerp(p.netPos, Math.min(1, dt * 15));
        if (p.pos.distanceTo(p.netPos) > 4) p.pos.copy(p.netPos);
        if (p.pos.y < this.world.killY) this.kill(p, null, false, null, true);
      }
      p.bloom = Math.max(0, p.bloom - dt * 0.12);
    }
    for (const p of this.players) {
      // Caídas al vacío.
      if (p.alive && p.pos.y < this.world.killY && (p.bot || p === this.me)) this.kill(p, null, false, null, true);
      // Reaparición a los 7 segundos en un punto seguro.
      if (!p.alive && s.phase === 'live' && this.now >= p.respawnAt) {
        const pt = this.findSpawn(p, this.now > p.respawnAt + 4);
        if (pt) this.spawnAt(p, pt);
      }
      if (!p.alive || !live) continue;
      // Regeneración lenta.
      if (this.now - p.lastDamage > RULES.regenDelay && p.hp < RULES.maxHp) p.hp = Math.min(RULES.maxHp, p.hp + RULES.regenRate * dt);
      // Botiquines.
      for (const m of this.medkits) {
        if (m.active && p.hp < RULES.maxHp && p.pos.distanceTo(m.pos) < 1.4) {
          p.hp = Math.min(RULES.maxHp, p.hp + RULES.medkitHeal); m.active = false; m.respawnAt = this.now + RULES.medkitRespawn;
          this.emit({ e: 'pk', id: p.id, w: 'medkit' });
        }
      }
      // Armas: se agarran solas si hay lugar o si es la misma (munición).
      for (const pu of [...this.pickups]) {
        if (!pu.active || p.pos.distanceTo(pu.pos) > 1.3 || (pu.lockId === p.id && this.now < pu.lockUntil)) continue;
        const has = p.weapons.find((w) => w.id === pu.weapon);
        const W = WEAPONS[pu.weapon];
        if (has) {
          if (has.reserve !== Infinity && has.reserve < W.reserve * 2) {
            has.reserve = Math.min(W.reserve * 2, has.reserve + pu.mag + pu.reserve); p.invVer++;
            this.takePickup(pu); this.emit({ e: 'pk', id: p.id, w: pu.weapon, ammo: 1 });
          }
        } else if (p.weapons.length < RULES.maxWeapons) {
          p.weapons.push({ id: pu.weapon, mag: pu.mag, reserve: pu.reserve }); p.invVer++;
          if (p.bot) p.cur = p.weapons.length - 1;
          this.takePickup(pu); this.emit({ e: 'pk', id: p.id, w: pu.weapon });
        } else if (p.bot && p.brain.wants(pu.weapon)) this.swapPickup(p, pu);
      }
    }
    // Reaparición de objetos.
    for (const pu of [...this.pickups]) {
      if (pu.temp && this.now > pu.expire) this.removePickup(pu);
      else if (!pu.active && !pu.temp && this.now > pu.respawnAt) pu.active = true;
    }
    for (const m of this.medkits) if (!m.active && this.now > m.respawnAt) m.active = true;
    // Empujar bots que se superponen.
    for (let i = 0; i < this.players.length; i++) for (let j = i + 1; j < this.players.length; j++) {
      const a = this.players[i], b = this.players[j];
      if (!a.alive || !b.alive || !(a.bot || b.bot)) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.8 && d > 0.001 && Math.abs(a.pos.y - b.pos.y) < 1.2) {
        const push = (0.8 - d) / 2;
        if (a.bot) { a.pos.x -= dx / d * push; a.pos.z -= dz / d * push; }
        if (b.bot) { b.pos.x += dx / d * push; b.pos.z += dz / d * push; }
      }
    }
  }

  stepMove(p, mx, mz, jump, dt) {
    const W = WEAPONS[p.weapons[p.cur].id];
    const speed = PLAYER.speed * W.move * (p.aiming ? 0.6 : 1) * (this.egg.carrier === p.id ? 0.92 : 1) * (p.defuseHeld ? 0.3 : 1);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    let wx = fx * mz + rx * mx, wz = fz * mz + rz * mx;
    const l = Math.hypot(wx, wz);
    if (l > 1) { wx /= l; wz /= l; }
    wx *= speed; wz *= speed;
    const steps = dt > 1 / 45 ? 2 : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acc = PLAYER.accel * h * (p.grounded ? 1 : PLAYER.airControl);
      const dvx = wx - p.vel.x, dvz = wz - p.vel.z, dl = Math.hypot(dvx, dvz);
      if (dl > acc) { p.vel.x += dvx / dl * acc; p.vel.z += dvz / dl * acc; } else { p.vel.x = wx; p.vel.z = wz; }
      p.vel.y -= PLAYER.gravity * h;
      if (jump && p.grounded && i === 0) { p.vel.y = PLAYER.jump; p.grounded = false; if (p === this.me) audio.play('jump'); }
      const was = p.grounded;
      p.grounded = this.world.moveCharacter(p.pos, p.vel, h, p.grounded);
      if (!was && p.grounded && p === this.me) audio.play('land');
    }
  }

  // Jugador local: controles, cámara, disparo e interacción.
  updateLocal(dt) {
    const me = this.me;
    if (!me) return;
    const inp = this.input.read();
    const s = this.state;
    const live = s.phase === 'live';
    const sens = this.settings.sensitivity;
    // Girar cámara.
    const aimMul = this.aiming ? (WEAPONS[me.weapons[me.cur].id].id === 'francotirador' ? 0.35 : 0.65) : 1;
    me.yaw -= inp.lookX * 0.0032 * sens * aimMul;
    me.pitch -= inp.lookY * 0.0032 * sens * aimMul;
    me.pitch = Math.max(-1.45, Math.min(1.45, me.pitch));
    this.vmState.swayX += inp.lookX * 0.00004; this.vmState.swayY += inp.lookY * 0.00004;
    if (!me.alive) { this.aiming = false; me.aiming = false; return; }
    if (inp.aimToggle) this.aiming = !this.aiming;
    me.aiming = this.aiming;
    // Cambiar de arma.
    if (inp.swap && me.weapons.length > 1) {
      me.cur = (me.cur + 1) % me.weapons.length; me.reloadEnd = 0; me.nextShot = this.now + 0.35;
      this.vmState.swap = 1; audio.play('swap');
      if (WEAPONS[me.weapons[me.cur].id].id !== 'francotirador' && this.aiming) this.aiming = false;
    }
    if (inp.slot >= 0 && inp.slot < me.weapons.length && inp.slot !== me.cur) { me.cur = inp.slot; me.reloadEnd = 0; me.nextShot = this.now + 0.35; this.vmState.swap = 1; audio.play('swap'); }
    if (inp.reload) this.startReload(me);
    this.updateReload(me);
    // Moverse.
    if (live) this.stepMove(me, inp.mx, inp.mz, inp.jump, dt);
    if (me.pos.y < this.world.killY) {
      if (this.authority) this.kill(me, null, false, null, true);
      return;
    }
    // Empujarse con otros jugadores.
    for (const q of this.players) {
      if (q === me || !q.alive) continue;
      const dx = me.pos.x - q.pos.x, dz = me.pos.z - q.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.8 && d > 0.001 && Math.abs(me.pos.y - q.pos.y) < 1.2) { me.pos.x += dx / d * (0.8 - d); me.pos.z += dz / d * (0.8 - d); }
    }
    // Disparo manual (mientras se mantiene el botón, según la cadencia del arma).
    const W = WEAPONS[me.weapons[me.cur].id];
    if (inp.fire && live && (W.auto || !this._firedHeld)) {
      if (this.tryFire(me)) this.fireLocal(me, W);
      else if (me.weapons[me.cur].mag <= 0 && me.weapons[me.cur].reserve <= 0 && !this._firedHeld) audio.play('empty');
      this._firedHeld = !W.auto;
    }
    if (!inp.fire) this._firedHeld = false;
    me.bloom = Math.max(0, me.bloom - dt * 0.12);
    // Acciones contextuales.
    this.context = this.computeContext();
    if (inp.interact) {
      const c = this.context;
      if (c.pick) this.action('pick');
      else if (c.plant) this.action('plant');
      else if (c.wpick) this.action('wpick', c.wpick.id);
    }
    if (inp.egg === 'pick' && this.context.pick) this.action('pick');
    if (inp.egg === 'plant' && this.context.plant) this.action('plant');
    if (inp.wpick && this.context.wpick) this.action('wpick', this.context.wpick.id);
    me.defuseHeld = !!(inp.defuse && this.context.defuse);
  }

  computeContext() {
    const me = this.me, egg = this.egg, c = {};
    if (!me.alive || this.state.phase !== 'live') return c;
    const role = this.roleOf(me.team);
    if (egg.state === 'loose' && me.pos.distanceTo(egg.pos) < RULES.pickupRadius) c.pick = true;
    if (egg.state === 'carried' && egg.carrier === me.id && role === 'atk' && this.inPlantZone(me)) c.plant = true;
    if (egg.state === 'planted' && role === 'def' && me.pos.distanceTo(egg.pos) < RULES.defuseRadius) c.defuse = true;
    for (const pu of this.pickups) {
      if (!pu.active || pu.pos.distanceTo(me.pos) > 1.8) continue;
      if (me.weapons.length >= RULES.maxWeapons && !me.weapons.some((w) => w.id === pu.weapon)) { c.wpick = pu; break; }
    }
    return c;
  }

  action(kind, arg) {
    if (this.authority) this.doInteract(this.me, kind, arg);
    else this.net.send({ t: 'a', k: kind, i: arg });
  }

  fireLocal(me, W) {
    const o = this.eyePos(me, new THREE.Vector3());
    const dirs = this.shotDirs(me);
    // Retroceso.
    me.pitch += W.recoil * (this.aiming ? 0.6 : 1) * (0.8 + Math.random() * 0.4);
    me.yaw += (Math.random() - 0.5) * W.recoil * 0.5;
    this.vmState.kick = Math.min(1.5, this.vmState.kick + 0.6 + W.recoil * 6);
    this.gfx.flash.intensity = 6;
    const wid = me.weapons[me.cur].id;
    audio.play('shot', null, { weapon: wid });
    if (this.authority) this.resolveShot(me, o, dirs, wid);
    else {
      this.net.send({ t: 'f', w: wid, o: [r2(o.x), r2(o.y), r2(o.z)], d: dirs.map((d) => [r2(d.x * 1000) / 1000, r2(d.y * 1000) / 1000, r2(d.z * 1000) / 1000]) });
      // Efectos locales inmediatos (los impactos reales los decide el dueño de la sala).
      for (const d of dirs) {
        const wh = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 120);
        const end = o.clone().addScaledVector(d, wh ? wh.t : 120);
        this.drawTracer(me, end);
        if (wh) this.gfx.effects.impact(end, v3.set(wh.nx, wh.ny, wh.nz));
      }
    }
  }

  muzzleWorld(p, out) {
    if (p === this.me && this.viewmodel.userData.muzzle) return this.viewmodel.userData.muzzle.getWorldPosition(out);
    const m = p.mesh.userData.gunHolder.children[0]?.userData.muzzle;
    if (m) return m.getWorldPosition(out);
    return this.eyePos(p, out);
  }

  drawTracer(p, end) {
    const from = this.muzzleWorld(p, new THREE.Vector3());
    if (Math.random() < 0.8) this.gfx.effects.tracer(from, end);
    this.gfx.effects.muzzle(from, v3c.copy(end).sub(from).normalize(), p === this.me ? 0.6 : 1);
  }

  // ---------- Eventos (se ejecutan en todos los dispositivos) ----------
  emit(ev) {
    this.events.push(ev);
    this.onEvent(ev);
  }

  onEvent(ev) {
    const me = this.me, ui = this.ui, fx = this.gfx.effects;
    switch (ev.e) {
      case 'shot': {
        const p = this.byId(ev.id);
        if (!p) break;
        if (p === me && this.authority) { // efectos de mi propio disparo
          for (const e of ev.ends) { const end = v3b.set(e[0], e[1], e[2]); this.drawTracer(p, end); if (e[3] === 1) fx.impact(end, v3.set(e[4], e[5], e[6])); else if (e[3] === 2) fx.impact(end, v3.set(0, 1, 0), true); }
          break;
        }
        if (p === me) { for (const e of ev.ends) if (e[3] === 2) fx.impact(v3b.set(e[0], e[1], e[2]), v3.set(0, 1, 0), true); break; }
        audio.play('shot', p.pos, { weapon: ev.w, maxDist: 90 });
        for (const e of ev.ends) {
          const end = v3b.set(e[0], e[1], e[2]);
          this.drawTracer(p, end);
          if (e[3] === 1) fx.impact(end, v3.set(e[4], e[5], e[6]));
          else if (e[3] === 2) fx.impact(end, v3.set(0, 1, 0), true);
        }
        break;
      }
      case 'hit': {
        if (ev.a === this.myId) { ui.hitmarker(!!ev.h); audio.play(ev.h ? 'headshot' : 'hit'); }
        if (ev.v === this.myId) {
          audio.play('hurt');
          if (ev.ap) ui.damage(Math.atan2(-(ev.ap[0] - me.pos.x), -(ev.ap[1] - me.pos.z)) - me.yaw);
          this.camShake = Math.min(0.5, this.camShake + 0.15);
        }
        break;
      }
      case 'kill': {
        const v = this.byId(ev.v), k = ev.k ? this.byId(ev.k) : null;
        if (!v) break;
        v.alive = false;
        v.mesh.visible = false;
        fx.eggBurst(v3.set(ev.p[0], ev.p[1], ev.p[2]), ROLE_COLORS[this.roleOf(v.team)]);
        audio.play('crack', v3);
        ui.feed(k ? k.name : null, v.name, ev.fall ? 'CAÍDA' : (ev.w ? WEAPONS[ev.w].short : ''), !!ev.h, k ? this.roleOf(k.team) : null, this.roleOf(v.team));
        if (k === me) {
          audio.play('killding');
          if (ev.h) ui.toast(pick(PHRASES.headshot), 'gold');
          const st = PHRASES.streak[ev.st];
          ui.toast(st ? `${st} · ${pick(PHRASES.kill)}` : pick(PHRASES.kill), 'kill');
        }
        if (v === me) {
          this.deathCam = { from: me.pos.clone(), killer: k ? k.id : null, t: 0 };
          ui.showDeath(k ? k.name : null, ev.fall ? 'Te caíste al vacío' : pick(PHRASES.died));
          this.aiming = false;
        }
        break;
      }
      case 'spawn': {
        const p = this.byId(ev.id);
        if (!p) break;
        p.alive = true;
        p.life = ev.life;
        if (p === me || !this.authority) { p.pos.set(ev.p[0], ev.p[1], ev.p[2]); p.netPos.copy(p.pos); p.vel.set(0, 0, 0); }
        if (p === me) { me.yaw = ev.yaw; me.pitch = 0; me.hp = RULES.maxHp; this.deathCam = null; ui.hideDeath(); }
        if (p !== me) p.mesh.visible = true;
        if (p === me && this.state.phase === 'live') audio.play('respawn');
        break;
      }
      case 'egg': {
        const p = ev.id ? this.byId(ev.id) : null;
        const mine = p && me && p.team === me.team;
        if (ev.k === 'pick') {
          audio.play('eggPick', this.egg.pos);
          if (p === me) ui.toast(PHRASES.pickedMine + (this.roleOf(me.team) === 'atk' ? ': LLEVALO A LA BASE ENEMIGA' : ': ¡QUE NO LO RECUPEREN!'), 'egg');
          else ui.toast(mine ? `${p.name.toUpperCase()} TIENE EL HUEVO` : PHRASES.pickedEnemy, mine ? 'info' : 'warn');
        } else if (ev.k === 'drop') { audio.play('eggDrop', this.egg.pos); ui.toast(PHRASES.dropped, 'info'); }
        else if (ev.k === 'plant') {
          audio.play('plant', null);
          ui.banner(PHRASES.planted, '60 segundos para que explote', this.roleOf(me.team) === 'atk' ? 'atk' : 'def', 3);
        } else if (ev.k === 'defuse') {
          audio.play('defused', null);
          ui.banner(this.roleOf(me.team) === 'def' ? PHRASES.defused : PHRASES.defusedEnemy, p ? `Lo desactivó ${p.name}` : '', 'def', 2.5);
        } else if (ev.k === 'explode') {
          const pos = v3.set(ev.p[0], ev.p[1], ev.p[2]);
          fx.bigExplosion(pos);
          audio.play('explosion', null);
          this.camShake = 1.2;
          ui.banner(PHRASES.exploded, '', 'atk', 2.5);
        }
        break;
      }
      case 'pk': {
        const p = this.byId(ev.id);
        if (p === me) {
          if (ev.w === 'medkit') { audio.play('heal'); ui.toast('+50 VIDA', 'heal'); }
          else { audio.play('pickup'); ui.toast(ev.ammo ? `+MUNICIÓN ${WEAPONS[ev.w].short}` : `AGARRASTE: ${WEAPONS[ev.w].name.toUpperCase()}`, 'info'); }
        }
        break;
      }
      case 'phase': {
        const sp = ev.spec;
        this.state.attacker = sp.attacker;
        this.applyRoleColors();
        const role = me ? this.roleOf(me.team) : 'atk';
        const title = sp.sudden ? 'MUERTE SÚBITA' : sp.half ? `RONDA 3 · ${sp.half === 1 ? 'PRIMERA' : 'SEGUNDA'} MITAD` : `RONDA ${sp.round}`;
        const sub = sp.sudden ? PHRASES.suddenDeath : role === 'atk' ? 'ATACÁS: llevá el huevo podrido a la base enemiga' : 'DEFENDÉS: que no instalen el huevo en tu base';
        ui.banner(title, sub, role, 3.5);
        this.lastPhaseKey = '';
        break;
      }
      case 'roundEnd': {
        this.lastRound = ev;
        const myTeam = me.team, other = myTeam === 'A' ? 'B' : 'A';
        const sc = ev.spec.half && !ev.matchWinner && ev.spec.half === 1 ? ev.halves : ev.score;
        const reason = { explode: '¡Explotó el huevo podrido!', time: 'Se terminó el tiempo: deciden las eliminaciones', sudden: 'Primera eliminación de la muerte súbita', 'defuse-ot': 'Desactivado en tiempo extra: deciden las eliminaciones', 'drop-ot': 'El huevo cayó en tiempo extra: deciden las eliminaciones' }[ev.reason] || '';
        if (!ev.winner) { ui.banner(PHRASES.roundDraw, reason, 'info', 4.5); audio.play('roundLose'); }
        else if (ev.winner === myTeam) { ui.banner(PHRASES.roundWin(sc[myTeam], sc[other]), reason, 'win', 4.5); audio.play('roundWin'); }
        else { ui.banner(PHRASES.roundLose, reason + ` · ${sc[myTeam]}-${sc[other]}`, 'lose', 4.5); audio.play('roundLose'); }
        break;
      }
      case 'matchEnd': {
        this.state.phase = 'over';
        this.ended = ev;
        setTimeout(() => ui.matchEnd(this, ev), 600);
        break;
      }
      case 'msg': ui.toast(ev.text, ev.cls || 'info'); break;
    }
  }

  statsTable() {
    return this.players.map((p) => ({ id: p.id, name: p.name, team: p.team, k: p.kills, d: p.deaths, bot: p.bot }));
  }

  // ---------- Visuales ----------
  updateVisuals(dt) {
    const t = this.now;
    const fx = this.gfx.effects;
    for (const p of this.players) {
      // Interpolación de jugadores remotos (en los invitados).
      if (!this.authority && p !== this.me) {
        p.pos.lerp(p.netPos, Math.min(1, dt * 12));
        p.yaw += angleDiff(p.netYaw, p.yaw) * Math.min(1, dt * 12);
        p.pitch += (p.netPitch - p.pitch) * Math.min(1, dt * 12);
      }
      const mv = Math.hypot(p.pos.x - p.lastPos.x, p.pos.z - p.lastPos.z) / Math.max(dt, 1e-4);
      p.moveSpeed = p.moveSpeed * 0.8 + mv * 0.2;
      p.lastPos.copy(p.pos);
      if (p === this.me) continue;
      const m = p.mesh;
      m.visible = p.alive;
      if (!p.alive) continue;
      m.position.copy(p.pos);
      m.rotation.y = p.yaw;
      const walk = Math.min(1, p.moveSpeed / 5);
      p.stepT += dt * (6 + p.moveSpeed);
      m.rotation.z = Math.sin(p.stepT) * 0.12 * walk;
      m.position.y += Math.abs(Math.sin(p.stepT)) * 0.08 * walk;
      m.userData.gunHolder.rotation.x = p.pitch;
      setEggGun(m, p.weapons[p.cur]?.id || 'pistola');
      // Pasos de los demás (sirven para ubicar enemigos).
      if (walk > 0.4) {
        p.stepAcc = (p.stepAcc || 0) + dt;
        if (p.stepAcc > 0.38) { p.stepAcc = 0; audio.play('step', p.pos, { maxDist: 22 }); }
      }
    }
    // Huevo podrido.
    const egg = this.egg, em = this.eggMesh;
    const carrier = egg.state === 'carried' ? this.byId(egg.carrier) : null;
    if (carrier) {
      if (carrier === this.me) em.visible = false;
      else {
        em.visible = true;
        em.position.set(carrier.mesh.position.x + Math.sin(carrier.yaw) * 0.45, carrier.mesh.position.y + 0.55, carrier.mesh.position.z + Math.cos(carrier.yaw) * 0.45);
        em.rotation.set(0.3, carrier.yaw, 0);
        em.scale.setScalar(0.8);
      }
    } else {
      em.visible = true;
      em.scale.setScalar(1);
      em.position.copy(egg.pos);
      if (egg.state === 'loose') { em.position.y += 0.25 + Math.sin(t * 2.5) * 0.12; em.rotation.set(0, t * 1.2, 0); }
      else em.rotation.set(0, 0, 0);
    }
    animateRottenEgg(em, t, egg.state === 'planted' ? { fast: egg.timer < 10 } : null);
    if (em.visible) fx.stink(em.position);
    // Objetos.
    for (const pu of this.pickups) {
      pu.mesh.visible = pu.active;
      pu.mesh.position.y = pu.pos.y + 0.55 + Math.sin(t * 2 + pu.id) * 0.1;
      pu.mesh.children[0].rotation.y = t * 1.5 + pu.id;
    }
    for (const m of this.medkits) { m.mesh.visible = m.active; m.mesh.rotation.y = t * 1.3; m.mesh.position.y = m.pos.y + 0.5 + Math.sin(t * 2 + m.id) * 0.08; }
    this.gfx.flash.intensity = Math.max(0, this.gfx.flash.intensity - dt * 60);
  }

  updateViewmodel(dt) {
    const me = this.me, vm = this.viewmodel, st = this.vmState;
    const id = me.weapons[me.cur]?.id;
    if (st.id !== id) {
      vm.clear();
      const g = createWeaponModel(id, 1);
      g.traverse((o) => { o.castShadow = false; });
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: ROLE_COLORS[this.roleOf(me.team)], roughness: 0.4 }));
      hand.position.set(0, -0.09, 0.05); hand.scale.set(1, 1.2, 1.4);
      g.add(hand);
      vm.add(g);
      vm.userData.muzzle = g.userData.muzzle;
      vm.userData.hand = hand;
      st.id = id; st.swap = 1;
    }
    if (vm.userData.hand) vm.userData.hand.material.color.setHex(ROLE_COLORS[this.roleOf(me.team)]);
    const W = WEAPONS[id];
    st.kick = Math.max(0, st.kick - dt * 8);
    st.swap = Math.max(0, st.swap - dt * 3.5);
    st.swayX *= Math.pow(0.001, dt); st.swayY *= Math.pow(0.001, dt);
    const moving = me.moveSpeed > 1 && me.grounded;
    st.bob += dt * (moving ? 10 : 2);
    const bobA = moving ? 0.012 : 0.003;
    const reloading = me.reloadEnd > 0 ? Math.sin(Math.min(1, 1 - (me.reloadEnd - this.now) / W.reload) * Math.PI) : 0;
    const aim = this.aiming;
    const tx = aim ? 0 : 0.13, ty = aim ? -0.085 : -0.13, tz = aim ? -0.22 : -0.28;
    vm.position.set(
      tx + Math.sin(st.bob) * bobA - st.swayX * 3,
      ty + Math.abs(Math.cos(st.bob)) * bobA - reloading * 0.12 - st.swap * 0.15 + st.swayY * 3,
      tz + st.kick * 0.05,
    );
    vm.rotation.set(st.kick * 0.12 - reloading * 0.6, -st.swayX * 6, reloading * 0.4);
    vm.scale.setScalar(0.55);
    vm.visible = me.alive && !(aim && id === 'francotirador');
  }

  updateCamera(dt) {
    const cam = this.gfx.camera, me = this.me;
    if (!me) return;
    this.camShake = Math.max(this.camShake, this.gfx.effects.shake * 0.5);
    this.camShake = Math.max(0, this.camShake - dt * 1.5);
    const sh = this.camShake * 0.06;
    if (me.alive || !this.deathCam) {
      const bob = me.grounded && me.moveSpeed > 1 ? Math.sin(this.now * 11) * 0.03 : 0;
      cam.position.set(me.pos.x + (Math.random() - 0.5) * sh, me.pos.y + PLAYER.eye + bob + (Math.random() - 0.5) * sh, me.pos.z);
      cam.rotation.set(me.pitch, me.yaw, 0, 'YXZ');
      // Pasos propios.
      if (me.alive && me.grounded && me.moveSpeed > 2) { this.stepTimer += dt; if (this.stepTimer > 0.36) { this.stepTimer = 0; audio.play('step', null); } }
    } else {
      // Cámara de muerte: se eleva y mira a quien te eliminó.
      const d = this.deathCam;
      d.t += dt;
      const k = Math.min(1, d.t / 1.2);
      cam.position.set(d.from.x, d.from.y + 1.4 + k * 2.5, d.from.z);
      const killer = d.killer ? this.byId(d.killer) : null;
      const look = killer && killer.alive ? killer.pos : d.from;
      const dx = look.x - cam.position.x, dz = look.z - cam.position.z, dy = (look.y + 1) - cam.position.y;
      const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(dy, Math.hypot(dx, dz) || 1);
      cam.rotation.set(pitch * k + me.pitch * (1 - k), yaw * k + me.yaw * (1 - k), 0, 'YXZ');
    }
    const W = WEAPONS[me.weapons[me.cur]?.id];
    const targetFov = this.aiming ? (W?.id === 'francotirador' ? 28 : this.gfx.baseFov * 0.78) : this.gfx.baseFov;
    if (Math.abs(cam.fov - targetFov) > 0.1) { cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14); cam.updateProjectionMatrix(); }
    this.updateViewmodel(dt);
    audio.listener = { x: cam.position.x, y: cam.position.y, z: cam.position.z, yaw: me.yaw };
    this.gfx.followShadow(me.pos);
  }

  // ---------- Red ----------
  flushNet(dt) {
    if (!this.net) { this.events.length = 0; return; }
    if (this.authority) {
      if (this.events.length) { this.net.broadcast({ t: 'ev', l: this.events }); this.events = []; }
      this.snapTimer += dt;
      if (this.snapTimer > 1 / 12) { this.snapTimer = 0; this.net.broadcast(this.snapshot()); }
    } else {
      this.events.length = 0;
      this.inputTimer += dt;
      if (this.inputTimer > 1 / 20) {
        this.inputTimer = 0;
        const me = this.me;
        this.net.send({ t: 'i', p: [r2(me.pos.x), r2(me.pos.y), r2(me.pos.z)], y: r2(me.yaw), pi: r2(me.pitch), c: me.cur, a: me.aiming ? 1 : 0, dh: me.defuseHeld ? 1 : 0, l: me.life,
          inv: me.weapons.map((w) => [w.mag, w.reserve === Infinity ? -1 : w.reserve]), iv: me.invVer });
      }
    }
  }

  snapshot() {
    const s = this.state, e = this.egg;
    return {
      t: 's', n: r2(this.now),
      st: [PH.indexOf(s.phase), r2(s.time), s.attacker, s.score.A, s.score.B, s.overtime ? 1 : 0, s.halves.A, s.halves.B, s.pk.A, s.pk.B, s.spec.round, s.spec.half || 0, s.spec.sudden ? 1 : 0, r2(s.inter)],
      egg: [EGG_ST.indexOf(e.state), r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), e.carrier, r2(e.timer), r2(e.progress), e.defuser],
      p: this.players.map((p) => [p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), Math.ceil(p.hp), p.alive ? 1 : 0, p.cur,
        (p.aiming ? 1 : 0) | (p.reloadEnd > 0 ? 2 : 0) | (p.bot ? 4 : 0), p.kills, p.deaths, r2(Math.max(0, p.respawnAt - this.now)), p.invVer,
        p.weapons.map((w) => [WIDS.indexOf(w.id), w.mag, w.reserve === Infinity ? -1 : w.reserve]), p.name, p.life]),
      pu: this.pickups.map((pu) => [pu.id, WIDS.indexOf(pu.weapon), r2(pu.pos.x), r2(pu.pos.y), r2(pu.pos.z), pu.active ? 1 : 0, pu.temp ? 1 : 0]),
      mk: this.medkits.map((m) => (m.active ? 1 : 0)),
    };
  }

  // Invitado: aplica el estado que manda el dueño.
  applySnapshot(m) {
    const s = this.state;
    const st = m.st;
    s.phase = PH[st[0]]; s.time = st[1];
    if (s.attacker !== st[2]) { s.attacker = st[2]; this.applyRoleColors(); }
    s.score = { A: st[3], B: st[4] }; s.overtime = !!st[5]; s.halves = { A: st[6], B: st[7] }; s.pk = { A: st[8], B: st[9] };
    s.spec = { round: st[10], half: st[11] || undefined, sudden: !!st[12], attacker: st[2] }; s.inter = st[13];
    const e = this.egg;
    e.state = EGG_ST[m.egg[0]]; e.pos.set(m.egg[1], m.egg[2], m.egg[3]); e.carrier = m.egg[4]; e.timer = m.egg[5]; e.progress = m.egg[6]; e.defuser = m.egg[7];
    for (const a of m.p) {
      const p = this.byId(a[0]);
      if (!p) continue;
      p.hp = a[6]; p.kills = a[10]; p.deaths = a[11]; p.respawnIn = a[12]; p.name = a[15];
      p.bot = !!(a[9] & 4);
      const wasAlive = p.alive;
      p.alive = !!a[7];
      if (p === this.me) {
        if (a[13] !== this.invVerSeen) {
          this.invVerSeen = a[13];
          p.weapons = a[14].map(([wi, mag, res]) => ({ id: WIDS[wi], mag, reserve: res < 0 ? Infinity : res }));
          p.cur = Math.min(a[8], p.weapons.length - 1);
          p.invVer = a[13];
        }
        if (wasAlive && !p.alive && !this.deathCam) { this.deathCam = { from: p.pos.clone(), killer: null, t: 0 }; this.ui.showDeath(null, pick(PHRASES.died)); }
        continue;
      }
      p.netPos.set(a[1], a[2], a[3]); p.netYaw = a[4]; p.netPitch = a[5];
      if (!wasAlive && p.alive) p.pos.copy(p.netPos);
      p.cur = a[8]; p.aiming = !!(a[9] & 1); p.reloadEnd = (a[9] & 2) ? 1 : 0;
      p.weapons = a[14].map(([wi, mag, res]) => ({ id: WIDS[wi], mag, reserve: res < 0 ? Infinity : res }));
    }
    // Objetos.
    const seen = new Set();
    for (const [id, wi, x, y, z, act, temp] of m.pu) {
      seen.add(id);
      let pu = this.pickups.find((q) => q.id === id);
      if (!pu) { pu = this.addPickup(WIDS[wi], new THREE.Vector3(x, y, z), !!temp); pu.id = id; }
      pu.active = !!act;
    }
    for (const pu of [...this.pickups]) if (!seen.has(pu.id)) this.removePickup(pu);
    m.mk.forEach((a, i) => { if (this.medkits[i]) this.medkits[i].active = !!a; });
  }

  // Dueño: procesa mensajes de un invitado.
  onClientMessage(id, m) {
    const p = this.byId(id);
    if (!p || p.bot) return;
    if (m.t === 'i') {
      if (m.l !== p.life) return; // posición vieja (antes de reaparecer)
      if (!p.alive) return;
      p.netPos.set(m.p[0], m.p[1], m.p[2]);
      p.yaw = m.y; p.pitch = m.pi;
      p.cur = Math.min(m.c, p.weapons.length - 1);
      p.aiming = !!m.a; p.defuseHeld = !!m.dh;
      if (m.iv === p.invVer && Array.isArray(m.inv)) m.inv.forEach(([mag, res], i) => { if (p.weapons[i]) { p.weapons[i].mag = mag; p.weapons[i].reserve = res < 0 ? Infinity : res; } });
    } else if (m.t === 'f') {
      if (!p.alive || this.state.phase !== 'live') return;
      const W = WEAPONS[m.w];
      if (!W || !p.weapons.some((w) => w.id === m.w)) return;
      if (this.now - (p.lastNetShot || 0) < W.rate * 0.6) return; // límite de cadencia
      p.lastNetShot = this.now;
      const dirs = m.d.slice(0, W.pellets).map((d) => new THREE.Vector3(d[0], d[1], d[2]).normalize());
      const o = new THREE.Vector3(m.o[0], m.o[1], m.o[2]);
      if (o.distanceTo(this.eyePos(p, v3)) > 3) o.copy(v3);
      this.resolveShot(p, o, dirs, m.w);
    } else if (m.t === 'a') this.doInteract(p, m.k, m.i);
  }

  onHostEvents(list) { for (const ev of list) this.onEvent(ev); }

  dispose() {
    for (const o of this.objects) this.gfx.scene.remove(o);
    this.gfx.camera.remove(this.viewmodel);
    this.gfx.effects.setAmbient(null);
    this.gfx.scene.traverse(() => {});
  }
}
