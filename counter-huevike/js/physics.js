// Física simple y estable: el mundo está hecho de cajas alineadas a los ejes (AABB).
// Incluye movimiento de personajes con escalones, raycasts para disparos y la grilla de navegación de los bots.

import { PLAYER } from './config.js';

export class World {
  constructor() {
    this.boxes = [];
    this.bounds = { minX: -60, maxX: 60, minZ: -40, maxZ: 40 };
    this.killY = -12;
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = '') {
    const b = { minX, minY, minZ, maxX, maxY, maxZ, tag };
    this.boxes.push(b);
    return b;
  }

  // Altura del piso debajo de un punto (o -Infinity si es vacío).
  floorAt(x, z, fromY = Infinity, r = 0) {
    let best = -Infinity;
    for (const b of this.boxes) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ && b.maxY <= fromY + 0.01 && b.maxY > best) best = b.maxY;
    }
    return best;
  }

  _blockedAt(x, z, y, h, r) {
    for (const b of this.boxes) {
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ && y + h > b.minY && y + 0.02 < b.maxY) return b;
    }
    return null;
  }

  // Mueve un personaje (pos = pies). Devuelve si está apoyado en el piso.
  moveCharacter(pos, vel, dt, wasGrounded) {
    const r = PLAYER.radius, h = PLAYER.height, step = PLAYER.step;
    let grounded = false;
    let stepTo = -Infinity;

    // Eje X y Z por separado para deslizar contra paredes.
    for (const axis of ['x', 'z']) {
      const d = vel[axis] * dt;
      if (d === 0) continue;
      const nx = axis === 'x' ? pos.x + d : pos.x;
      const nz = axis === 'z' ? pos.z + d : pos.z;
      let blocked = false;
      for (const b of this.boxes) {
        if (!(nx + r > b.minX && nx - r < b.maxX && nz + r > b.minZ && nz - r < b.maxZ)) continue;
        if (!(pos.y + h > b.minY && pos.y + 0.02 < b.maxY)) continue;
        const rise = b.maxY - pos.y;
        if (rise <= step && (wasGrounded || vel.y <= 0) && !this._blockedAt(nx, nz, b.maxY, h, r)) {
          stepTo = Math.max(stepTo, b.maxY);
          continue;
        }
        blocked = true;
        if (axis === 'x') pos.x = d > 0 ? Math.min(pos.x, b.minX - r - 0.001) : Math.max(pos.x, b.maxX + r + 0.001);
        else pos.z = d > 0 ? Math.min(pos.z, b.minZ - r - 0.001) : Math.max(pos.z, b.maxZ + r + 0.001);
        vel[axis] = 0;
        break;
      }
      if (!blocked) pos[axis] = axis === 'x' ? nx : nz;
    }
    if (stepTo > -Infinity && stepTo > pos.y) { pos.y = stepTo; vel.y = Math.max(0, vel.y); grounded = true; }

    // Eje vertical.
    const ny = pos.y + vel.y * dt;
    if (vel.y <= 0) {
      let land = -Infinity;
      for (const b of this.boxes) {
        if (!(pos.x + r > b.minX && pos.x - r < b.maxX && pos.z + r > b.minZ && pos.z - r < b.maxZ)) continue;
        if (b.maxY <= pos.y + 0.05 && b.maxY >= ny - (wasGrounded ? step * 0.6 : 0) && b.maxY > land) land = b.maxY;
      }
      if (land > -Infinity) { pos.y = land; vel.y = 0; grounded = true; }
      else pos.y = ny;
    } else {
      let ceil = Infinity;
      for (const b of this.boxes) {
        if (!(pos.x + r > b.minX && pos.x - r < b.maxX && pos.z + r > b.minZ && pos.z - r < b.maxZ)) continue;
        if (b.minY >= pos.y + h - 0.05 && b.minY < ny + h && b.minY < ceil) ceil = b.minY;
      }
      if (ceil < Infinity) { pos.y = ceil - h; vel.y = 0; } else pos.y = ny;
    }
    return grounded;
  }

  // Raycast contra las cajas. Devuelve { t, nx, ny, nz } o null.
  raycast(ox, oy, oz, dx, dy, dz, maxT) {
    let bestT = maxT, hit = null;
    const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
    for (const b of this.boxes) {
      let t1 = (b.minX - ox) * ix, t2 = (b.maxX - ox) * ix;
      let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
      t1 = (b.minY - oy) * iy; t2 = (b.maxY - oy) * iy;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      t1 = (b.minZ - oz) * iz; t2 = (b.maxZ - oz) * iz;
      tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
      if (tmax >= Math.max(tmin, 0) && tmin < bestT && tmin >= 0) { bestT = tmin; hit = b; }
    }
    if (!hit) return null;
    const px = ox + dx * bestT, py = oy + dy * bestT, pz = oz + dz * bestT;
    const e = 0.002;
    let nx = 0, ny = 0, nz = 0;
    if (Math.abs(px - hit.minX) < e) nx = -1; else if (Math.abs(px - hit.maxX) < e) nx = 1;
    else if (Math.abs(py - hit.minY) < e) ny = -1; else if (Math.abs(py - hit.maxY) < e) ny = 1;
    else if (Math.abs(pz - hit.minZ) < e) nz = -1; else nz = 1;
    return { t: bestT, nx, ny, nz, box: hit };
  }

  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.001) return true;
    return !this.raycast(a.x, a.y, a.z, dx / len, dy / len, dz / len, len - 0.05);
  }

  // ---------- Grilla de navegación ----------
  buildNav(cell = 1) {
    const B = this.bounds;
    const w = Math.ceil((B.maxX - B.minX) / cell), d = Math.ceil((B.maxZ - B.minZ) / cell);
    const floor = new Float32Array(w * d).fill(-Infinity);
    const walk = new Uint8Array(w * d);
    const r = PLAYER.radius + 0.05;
    for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
      const x = B.minX + (i + 0.5) * cell, z = B.minZ + (j + 0.5) * cell;
      const f = this.floorAt(x, z);
      floor[j * w + i] = f;
      if (f === -Infinity || f < this.killY + 2) continue;
      // Libre si en el radio del jugador nada sobresale por encima del escalón y hay pared de cabeza libre.
      let ok = true;
      for (const b of this.boxes) {
        if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ && b.maxY > f + PLAYER.step && b.minY < f + PLAYER.height) { ok = false; break; }
      }
      // Evitar bordes al vacío: las 4 esquinas deben tener piso cercano.
      if (ok) {
        for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
          const g = this.floorAt(x + ox, z + oz, f + 0.1);
          if (g < f - 1.5) { ok = false; break; }
        }
      }
      walk[j * w + i] = ok ? 1 : 0;
    }
    this.nav = { cell, w, d, floor, walk, comp: new Int32Array(w * d).fill(-1) };
    // Componentes conectadas.
    let c = 0;
    const comp = this.nav.comp;
    const stack = [];
    for (let k = 0; k < w * d; k++) {
      if (!walk[k] || comp[k] >= 0) continue;
      comp[k] = c; stack.push(k);
      while (stack.length) {
        const n = stack.pop();
        for (const m of this._neighbors(n)) if (comp[m] < 0) { comp[m] = c; stack.push(m); }
      }
      c++;
    }
  }

  _neighbors(n) {
    const { w, d, floor, walk } = this.nav;
    const i = n % w, j = (n / w) | 0;
    const out = [];
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= w || nj >= d) continue;
      const m = nj * w + ni;
      if (!walk[m]) continue;
      if (Math.abs(floor[m] - floor[n]) > PLAYER.step) continue;
      if (di && dj && (!walk[j * w + ni] || !walk[nj * w + i])) continue;
      out.push(m);
    }
    return out;
  }

  cellOf(x, z) {
    const { cell, w, d } = this.nav;
    const i = Math.floor((x - this.bounds.minX) / cell), j = Math.floor((z - this.bounds.minZ) / cell);
    if (i < 0 || j < 0 || i >= w || j >= d) return -1;
    return j * w + i;
  }

  cellCenter(n, out) {
    const { cell, w, floor } = this.nav;
    out.x = this.bounds.minX + ((n % w) + 0.5) * cell;
    out.z = this.bounds.minZ + (((n / w) | 0) + 0.5) * cell;
    out.y = floor[n];
    return out;
  }

  // Celda caminable más cercana (opcionalmente en la misma componente).
  nearestWalkable(x, z, comp = -1, maxR = 12) {
    const { w, d, walk } = this.nav;
    const c0 = this.cellOf(x, z);
    if (c0 >= 0 && walk[c0] && (comp < 0 || this.nav.comp[c0] === comp)) return c0;
    const i0 = Math.floor((x - this.bounds.minX) / this.nav.cell), j0 = Math.floor((z - this.bounds.minZ) / this.nav.cell);
    for (let rr = 1; rr <= maxR; rr++) {
      let best = -1, bd = Infinity;
      for (let j = j0 - rr; j <= j0 + rr; j++) for (let i = i0 - rr; i <= i0 + rr; i++) {
        if (i < 0 || j < 0 || i >= w || j >= d) continue;
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== rr) continue;
        const k = j * w + i;
        if (!walk[k] || (comp >= 0 && this.nav.comp[k] !== comp)) continue;
        const dd = (i - i0) ** 2 + (j - j0) ** 2;
        if (dd < bd) { bd = dd; best = k; }
      }
      if (best >= 0) return best;
    }
    return -1;
  }

  // A* con heurística octil. Devuelve lista de puntos {x,y,z} suavizada.
  findPath(sx, sz, tx, tz) {
    const s = this.nearestWalkable(sx, sz);
    if (s < 0) return null;
    const comp = this.nav.comp[s];
    const t = this.nearestWalkable(tx, tz, comp, 30);
    if (t < 0) return null;
    const { w } = this.nav;
    const g = this._g || (this._g = new Float32Array(this.nav.w * this.nav.d));
    const from = this._from || (this._from = new Int32Array(this.nav.w * this.nav.d));
    const stamp = this._stamp || (this._stamp = new Uint32Array(this.nav.w * this.nav.d));
    const closed = this._closed || (this._closed = new Uint32Array(this.nav.w * this.nav.d));
    this._run = (this._run || 0) + 1;
    const run = this._run;
    const ti = t % w, tj = (t / w) | 0;
    const h = (n) => { const dx = Math.abs((n % w) - ti), dz = Math.abs(((n / w) | 0) - tj); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    const heap = new MinHeap();
    g[s] = 0; stamp[s] = run; from[s] = -1;
    heap.push(s, h(s));
    let found = false, iter = 0;
    while (heap.size) {
      const n = heap.pop();
      if (n === t) { found = true; break; }
      if (closed[n] === run) continue;
      closed[n] = run;
      if (++iter > 12000) break;
      const ni = n % w, nj = (n / w) | 0;
      for (const m of this._neighbors(n)) {
        if (closed[m] === run) continue;
        const diag = (m % w) !== ni && ((m / w) | 0) !== nj;
        const ng = g[n] + (diag ? Math.SQRT2 : 1);
        if (stamp[m] !== run || ng < g[m]) {
          stamp[m] = run; g[m] = ng; from[m] = n;
          heap.push(m, ng + h(m));
        }
      }
    }
    if (!found) return null;
    const cells = [];
    for (let n = t; n !== -1; n = from[n]) cells.push(n);
    cells.reverse();
    // Suavizado: saltear puntos si la línea es caminable.
    const pts = cells.map((n) => this.cellCenter(n, {}));
    const out = [pts[0]];
    let a = 0;
    while (a < pts.length - 1) {
      let b = Math.min(pts.length - 1, a + 14);
      while (b > a + 1 && !this.lineWalkable(pts[a], pts[b])) b--;
      out.push(pts[b]);
      a = b;
    }
    return out;
  }

  lineWalkable(a, b) {
    const dist = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(dist / 0.45);
    let prevF = a.y;
    for (let s = 1; s <= steps; s++) {
      const x = a.x + (b.x - a.x) * s / steps, z = a.z + (b.z - a.z) * s / steps;
      const c = this.cellOf(x, z);
      if (c < 0 || !this.nav.walk[c]) return false;
      const f = this.nav.floor[c];
      if (Math.abs(f - prevF) > PLAYER.step) return false;
      prevF = f;
    }
    return true;
  }
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (v[p] <= v[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  }
}

// Rayo contra esfera: devuelve t o -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const disc = b * b - c;
  if (disc < 0) return -1;
  const s = Math.sqrt(disc);
  const t = -b - s;
  if (t >= 0) return t;
  const t2 = -b + s;
  return t2 >= 0 ? 0 : -1;
}
