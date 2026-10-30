// Inteligencia artificial de los bots: objetivos del huevo, navegación, combate, cobertura y recoger armas/botiquines.

import * as THREE from 'three';
import { WEAPONS, RULES, PLAYER } from './config.js';

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpC = new THREE.Vector3();
export const PREF = { pistola: 0, revolver: 2, smg: 3, escopeta: 3, rifle: 5, ametralladora: 4, francotirador: 4 };

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export class BotBrain {
  constructor(game, p) {
    this.g = game; this.p = p;
    this.path = null; this.pathIdx = 0; this.pathGoal = new THREE.Vector3(1e9, 0, 0); this.repathAt = 0;
    this.goal = new THREE.Vector3(); this.goalKind = 'idle';
    this.target = null; this.targetSince = 0; this.lastSeen = new THREE.Vector3(); this.lastSeenAt = -99;
    this.perceiveAt = 0; this.thinkAt = 0;
    this.strafe = 1; this.strafeUntil = 0;
    this.aimErr = new THREE.Vector2(); this.reaction = 0.28 + Math.random() * 0.25;
    this.cover = null; this.coverUntil = 0;
    this.stuckCheck = 0; this.stuckPos = new THREE.Vector3(); this.jumpNext = false;
    this.skill = 0.55 + Math.random() * 0.35;
    this.laneBias = Math.floor(Math.random() * 3) - 1;
    this.lastHurt = -99;
  }

  onHurt(attacker) {
    this.lastHurt = this.g.now;
    if (!this.target && attacker && attacker.alive) { this.target = attacker; this.targetSince = this.g.now; this.lastSeen.copy(attacker.pos); this.lastSeenAt = this.g.now; }
  }

  // Elige el objetivo táctico según el estado del huevo.
  think() {
    const g = this.g, p = this.p, egg = g.egg;
    const role = g.roleOf(p.team);
    const enemyBase = g.enemyBaseOf(p.team).pos, myBase = g.baseOf(p.team).pos;
    const mates = g.players.filter((q) => q.team === p.team && q.alive);
    const rankTo = (pos) => mates.filter((q) => q.pos.distanceToSquared(pos) < p.pos.distanceToSquared(pos)).length;
    const laneZ = this.laneBias * 20;
    const set = (v, kind) => { this.goal.copy(v); this.goalKind = kind; };

    if (egg.state === 'carried' && egg.carrier === p.id) {
      if (role === 'atk') set(enemyBase, 'plant');
      else set(tmpA.set(myBase.x + g.baseOf(p.team).side * 6, myBase.y, (Math.random() - 0.5) * 8), 'hold');
      return;
    }
    // Botiquín si está herido y sin enemigo cerca.
    if (p.hp < 45 && !this.target) {
      const mk = this.nearest(g.medkits.filter((m) => m.active), 22);
      if (mk) return set(mk.pos, 'medkit');
    }
    // Arma si hay lugar.
    if (!this.target && Math.random() < 0.8) {
      const wp = this.nearest(g.pickups.filter((w) => w.active && !(w.lockId === p.id && g.now < w.lockUntil) && this.wants(w.weapon)), 16);
      if (wp) return set(wp.pos, 'weapon');
    }
    if (egg.state === 'loose') {
      const r = rankTo(egg.pos);
      if (r < 2 || p.pos.distanceTo(egg.pos) < 12) return set(egg.pos, 'egg');
      if (role === 'atk') return set(tmpA.set(enemyBase.x * 0.45, 0, laneZ), 'push');
      return set(tmpA.set(myBase.x * 0.7, myBase.y, laneZ * 0.6), 'defend');
    }
    if (egg.state === 'carried') {
      const carrier = g.byId(egg.carrier);
      const mine = carrier && carrier.team === p.team;
      if (mine) {
        if (role === 'atk') return set(tmpA.copy(carrier.pos).lerp(enemyBase, 0.25).add(tmpB.set(0, 0, this.laneBias * 3)), 'escort');
        return set(tmpA.set(myBase.x * 0.85, myBase.y, laneZ * 0.4), 'defend');
      }
      // El rival tiene el huevo: a cazarlo (o defender la base si somos defensores lejanos).
      if (role === 'def' && rankTo(carrier.pos) > 3) return set(tmpA.copy(myBase).add(tmpB.set(-g.baseOf(p.team).side * 4, 0, laneZ * 0.3)), 'defend');
      return set(carrier.pos, 'hunt');
    }
    if (egg.state === 'planted') {
      if (role === 'def') {
        const r = rankTo(egg.pos);
        if (r === 0 || egg.timer < 20) return set(egg.pos, 'defuse');
        return set(tmpA.copy(egg.pos).add(tmpB.set((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8)), 'retake');
      }
      return set(tmpA.copy(egg.pos).add(tmpB.set((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10)), 'guard');
    }
    set(g.map.center, 'push');
  }

  wants(wid) {
    const p = this.p;
    if (p.weapons.some((w) => w.id === wid)) return p.weapons.find((w) => w.id === wid).reserve < WEAPONS[wid].reserve * 0.5;
    if (p.weapons.length < RULES.maxWeapons) return true;
    const worst = Math.min(...p.weapons.filter((w) => w.id !== 'pistola').map((w) => PREF[w.id]));
    return PREF[wid] > worst;
  }

  nearest(list, maxD) {
    let best = null, bd = maxD * maxD;
    for (const o of list) { const d = o.pos.distanceToSquared(this.p.pos); if (d < bd) { bd = d; best = o; } }
    return best;
  }

  perceive() {
    const g = this.g, p = this.p;
    const eye = g.eyePos(p, tmpA);
    let best = null, bd = Infinity;
    const fwdYaw = p.yaw;
    for (const q of g.players) {
      if (!q.alive || q.team === p.team) continue;
      const d = q.pos.distanceTo(p.pos);
      if (d > 70) continue;
      const ang = Math.atan2(-(q.pos.x - p.pos.x), -(q.pos.z - p.pos.z));
      const inFov = Math.abs(angleDiff(ang, fwdYaw)) < 1.25 || d < 6 || (g.now - this.lastHurt < 1.5);
      if (!inFov) continue;
      const tgt = tmpB.set(q.pos.x, q.pos.y + 1.0, q.pos.z);
      if (!g.world.lineOfSight(eye, tgt)) continue;
      const score = d * (q.id === g.egg.carrier ? 0.5 : 1) * (this.target === q ? 0.7 : 1);
      if (score < bd) { bd = score; best = q; }
    }
    if (best) {
      if (best !== this.target) { this.target = best; this.targetSince = g.now; this.aimErr.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3); }
      this.lastSeen.copy(best.pos); this.lastSeenAt = g.now;
    } else if (this.target && (!this.target.alive || g.now - this.lastSeenAt > 0.6)) this.target = null;
  }

  findCover(from) {
    const g = this.g, p = this.p;
    const eye = tmpC.set(from.x, from.y + PLAYER.eye, from.z);
    let best = null, bd = Infinity;
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 6;
      const x = p.pos.x + Math.cos(a) * r, z = p.pos.z + Math.sin(a) * r;
      const c = g.world.cellOf(x, z);
      if (c < 0 || !g.world.nav.walk[c]) continue;
      const pt = g.world.cellCenter(c, new THREE.Vector3());
      if (g.world.lineOfSight(eye, tmpB.set(pt.x, pt.y + 1.2, pt.z))) continue;
      const d = pt.distanceTo(p.pos);
      if (d < bd) { bd = d; best = pt; }
    }
    return best;
  }

  update(dt) {
    const g = this.g, p = this.p;
    const out = p.botOut;
    out.mx = 0; out.mz = 0; out.jump = false; out.fire = false; out.interact = false; out.defuse = false; out.plant = false; out.swap = -1;
    if (!p.alive) { this.path = null; this.target = null; return out; }
    if (g.now >= this.perceiveAt) { this.perceive(); this.perceiveAt = g.now + 0.18 + Math.random() * 0.1; }
    if (g.now >= this.thinkAt) { this.think(); this.thinkAt = g.now + 0.9 + Math.random() * 0.5; }

    const w = p.weapons[p.cur];
    const wd = WEAPONS[w.id];
    const target = this.target;
    let moveTo = this.goal;
    let urgent = this.goalKind === 'plant' || this.goalKind === 'defuse' || this.goalKind === 'egg';

    // Elegir la mejor arma para la distancia.
    if (target && p.reloadEnd === 0 && g.now > (p.swapLock || 0)) {
      const d = target.pos.distanceTo(p.pos);
      let bestI = p.cur, bestS = -1;
      p.weapons.forEach((x, i) => {
        if (x.mag <= 0 && x.reserve <= 0) return;
        const W = WEAPONS[x.id];
        const s = (d < W.range ? 3 : 0) + PREF[x.id] - (x.mag <= 0 ? 4 : 0) - (W.range < 20 && d > 18 ? 4 : 0) - (x.id === 'francotirador' && d < 12 ? 4 : 0);
        if (s > bestS) { bestS = s; bestI = i; }
      });
      if (bestI !== p.cur) { out.swap = bestI; p.swapLock = g.now + 2.5; }
    }

    // Cobertura al recargar o con poca vida.
    if (target && !urgent && (p.reloadEnd > 0 || p.hp < 35)) {
      if (!this.cover || g.now > this.coverUntil) { this.cover = this.findCover(target.pos); this.coverUntil = g.now + 2; }
      if (this.cover) moveTo = this.cover;
    } else this.cover = null;

    // Mirar: al objetivo si hay, si no hacia donde camina.
    let wantYaw = p.yaw, wantPitch = 0;
    if (target) {
      const aimY = target.pos.y + (Math.random() < 0.15 * this.skill ? 1.2 : 0.75);
      const dx = target.pos.x - p.pos.x, dz = target.pos.z - p.pos.z, dy = aimY - (p.pos.y + PLAYER.eye);
      const dist = Math.hypot(dx, dz);
      this.aimErr.multiplyScalar(Math.pow(0.25, dt * this.skill * 2));
      wantYaw = Math.atan2(-dx, -dz) + this.aimErr.x * (1.4 - this.skill);
      wantPitch = Math.atan2(dy, dist) + this.aimErr.y * (1.4 - this.skill);
      const err = Math.abs(angleDiff(wantYaw, p.yaw)) + Math.abs(wantPitch - p.pitch);
      const ready = g.now - this.targetSince > this.reaction;
      if (ready && err < 0.06 + 0.6 / Math.max(dist, 2) && dist < wd.range * 1.4 && w.mag > 0) {
        // Disparo manual "humano": los semiautomáticos con pausas.
        out.fire = wd.auto ? true : Math.random() < 0.55;
      }
      // Distancia según el arma.
      if (!urgent && !this.cover) {
        if (wd.range < 20 && dist > 7) moveTo = target.pos;
        else if (wd.id === 'francotirador' && dist < 15) moveTo = tmpA.copy(p.pos).addScaledVector(tmpB.copy(p.pos).sub(target.pos).normalize(), 5);
        else if (dist > wd.range * 0.9) moveTo = target.pos;
        else moveTo = null; // pelea en el lugar haciendo strafe
      }
    } else if (g.now - this.lastSeenAt < 3 && !urgent) {
      moveTo = this.lastSeen;
    }

    // Movimiento por camino.
    let mvx = 0, mvz = 0;
    if (moveTo) {
      if (!this.path || g.now > this.repathAt || moveTo.distanceTo(this.pathGoal) > 3) {
        this.path = g.world.findPath(p.pos.x, p.pos.z, moveTo.x, moveTo.z);
        this.pathIdx = 1; this.pathGoal.copy(moveTo); this.repathAt = g.now + 2.5 + Math.random();
      }
      if (this.path && this.pathIdx < this.path.length) {
        const wp = this.path[this.pathIdx];
        const dx = wp.x - p.pos.x, dz = wp.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) this.pathIdx++;
        else { mvx = dx / d; mvz = dz / d; }
      } else {
        const dx = moveTo.x - p.pos.x, dz = moveTo.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.8) { mvx = dx / d; mvz = dz / d; }
      }
      if (!target) wantYaw = (mvx || mvz) ? Math.atan2(-mvx, -mvz) : wantYaw;
    }
    if (target && !urgent) { // strafe
      if (g.now > this.strafeUntil) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeUntil = g.now + 0.5 + Math.random() * 1.1; if (Math.random() < 0.12) out.jump = true; }
      const ry = p.yaw;
      mvx += Math.cos(ry) * this.strafe * 0.8; mvz += -Math.sin(ry) * this.strafe * 0.8;
    }

    // Girar con velocidad limitada.
    const turn = (target ? 5 + this.skill * 5 : 6) * dt;
    const dy = angleDiff(wantYaw, p.yaw);
    p.yaw += Math.max(-turn, Math.min(turn, dy));
    p.pitch += Math.max(-turn, Math.min(turn, wantPitch - p.pitch));

    // Convertir movimiento de mundo a local (adelante/derecha) según la mirada.
    const len = Math.hypot(mvx, mvz);
    if (len > 0.01) {
      mvx /= len; mvz /= len;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      out.mz = mvx * fx + mvz * fz;
      out.mx = mvx * rx + mvz * rz;
    }

    // Atascado: saltar y recalcular.
    if (g.now > this.stuckCheck) {
      if (len > 0.1 && p.pos.distanceTo(this.stuckPos) < 0.6) { out.jump = true; this.path = null; this.laneBias = Math.floor(Math.random() * 3) - 1; this.thinkAt = 0; }
      this.stuckPos.copy(p.pos); this.stuckCheck = g.now + 1.2;
    }

    // Acciones del huevo.
    const egg = g.egg;
    if (egg.state === 'loose' && p.pos.distanceTo(egg.pos) < RULES.pickupRadius) out.interact = true;
    if (egg.state === 'carried' && egg.carrier === p.id && g.roleOf(p.team) === 'atk' && g.inPlantZone(p)) out.plant = true;
    if (egg.state === 'planted' && g.roleOf(p.team) === 'def' && p.pos.distanceTo(egg.pos) < RULES.defuseRadius - 0.3) {
      const danger = target && target.pos.distanceTo(p.pos) < 10 && egg.timer > 12;
      if (!danger) { out.defuse = true; out.mx = 0; out.mz = 0; out.fire = false; }
    }
    if (this.goalKind === 'defuse' && egg.state === 'planted' && p.pos.distanceTo(egg.pos) < 1.2) { out.mx = 0; out.mz = 0; }
    if (this.goalKind === 'plant' && g.inPlantZone(p) && out.plant) { out.mx *= 0.2; out.mz *= 0.2; }
    return out;
  }
}
