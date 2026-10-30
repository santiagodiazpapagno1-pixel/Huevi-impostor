// Los cinco mapas de Counter Huevike, construidos proceduralmente con cajas (colisión) y decoración.
// Todos usan semilla fija para que en el online todos los jugadores vean exactamente el mismo mapa.

import * as THREE from 'three';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { World } from './physics.js';
import { getTexture } from './textures.js';

const MATS = {
  asfalto: { tex: 'asfalto', rough: 0.95, uv: 6 },
  vereda: { tex: 'vereda', rough: 0.9, uv: 4 },
  ladrillo: { tex: 'ladrillo', rough: 0.9, uv: 4 },
  hormigon: { tex: 'hormigon', rough: 0.92, uv: 4 },
  ventanas: { tex: 'ventanas', rough: 0.85, uv: 8 },
  arena: { tex: 'arena', rough: 1, uv: 8 },
  adobe: { tex: 'adobe', rough: 0.95, uv: 4 },
  pasto: { tex: 'pasto', rough: 1, uv: 5 },
  tierra: { tex: 'tierra', rough: 1, uv: 5 },
  piedra: { tex: 'piedra', rough: 0.95, uv: 5 },
  musgo: { tex: 'musgo', rough: 0.95, uv: 4 },
  madera: { tex: 'madera', rough: 0.85, uv: 2.5 },
  metal: { tex: 'metal', rough: 0.45, metal: 0.6, uv: 2.5 },
  futurista: { tex: 'futurista', rough: 0.35, metal: 0.15, uv: 6 },
  baldosa: { tex: 'baldosa', rough: 0.4, metal: 0.05, uv: 4 },
  nieve: { tex: 'nieve', rough: 0.8, uv: 6 },
  bolsas: { tex: 'bolsas', rough: 1, uv: 1.6 },
  hojas: { tex: 'hojas', rough: 0.9, uv: 3 },
  oxido: { color: 0x8a4a2a, rough: 0.7, metal: 0.4 },
  autoRojo: { color: 0x8c2f22, rough: 0.5, metal: 0.4 },
  autoAzul: { color: 0x2c4c6e, rough: 0.5, metal: 0.4 },
  autoAmarillo: { color: 0xc89b2a, rough: 0.5, metal: 0.4 },
  quemado: { color: 0x2a2624, rough: 0.9, metal: 0.2 },
  vidrio: { color: 0x7fe9ff, rough: 0.05, metal: 0.1, transparent: true, opacity: 0.35 },
  neonCian: { color: 0x0a2a33, emissive: 0x38e8ff, ei: 2.2, rough: 0.3 },
  neonRosa: { color: 0x330a22, emissive: 0xff4fd8, ei: 2.0, rough: 0.3 },
  lampara: { color: 0xffffff, emissive: 0xffd28a, ei: 3, rough: 0.3 },
  tronco: { color: 0x5b3c22, rough: 1 },
  pino: { color: 0x1f4a2c, rough: 1 },
  copa: { color: 0x2f7a2a, rough: 1 },
  copaClara: { color: 0x4f9a35, rough: 1 },
  cactus: { color: 0x4a7f3a, rough: 0.9 },
  roca: { tex: 'piedra', rough: 1, uv: 3 },
  rocaRoja: { tex: 'adobe', color: 0xc07c56, rough: 1, uv: 6 },
  agua: { color: 0x2a6f8f, rough: 0.1, metal: 0.2, transparent: true, opacity: 0.8 },
  lona: { color: 0x5d6b3d, rough: 1 },
  blanco: { color: 0xf2f2f2, rough: 0.6 },
};

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const _v = new THREE.Vector3();

// Proyecta UV en coordenadas del mundo para que la textura tenga la misma escala en cajas grandes y chicas.
function worldUV(geo, scale) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    if (ny >= nx && ny >= nz) uv.setXY(i, x / scale, z / scale);
    else if (nx >= nz) uv.setXY(i, z / scale, y / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
  uv.needsUpdate = true;
}

export class MapBuilder {
  constructor(seed) {
    this.world = new World();
    this.group = new THREE.Group();
    this.batches = new Map();
    this.mats = new Map();
    this.R = rng(seed);
    this.data = {
      spawns: { A: [], B: [] }, bases: {}, center: new THREE.Vector3(),
      weaponSpots: [], medkits: [], lights: [], env: {}, deck: null,
    };
  }

  material(key) {
    if (this.mats.has(key)) return this.mats.get(key);
    const d = MATS[key];
    const m = new THREE.MeshStandardMaterial({
      color: d.color ?? 0xffffff, roughness: d.rough ?? 0.8, metalness: d.metal ?? 0,
      map: d.tex ? getTexture(d.tex) : null,
      transparent: !!d.transparent, opacity: d.opacity ?? 1,
      emissive: d.emissive ?? 0x000000, emissiveIntensity: d.ei ?? 1,
    });
    if (d.transparent) m.depthWrite = false;
    this.mats.set(key, m);
    return m;
  }

  addGeo(geo, mat, cast = true, uvScale) {
    if (uvScale !== undefined || MATS[mat]?.tex) worldUV(geo, uvScale ?? MATS[mat].uv ?? 4);
    const g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const key = mat + (cast ? '|c' : '|n');
    if (!this.batches.has(key)) this.batches.set(key, []);
    this.batches.get(key).push(g);
  }

  // Caja: centro x,z; base y0; tamaño w (x), h (y), d (z).
  box(x, y0, z, w, h, d, mat, { collide = true, cast = true, uv } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(x, y0 + h / 2, z);
    this.addGeo(geo, mat, cast, uv);
    if (collide) this.world.addBox(x - w / 2, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2);
  }

  // Caja por esquinas.
  rect(x0, z0, x1, z1, y0, y1, mat, opts) {
    this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), mat, opts);
  }

  mesh(geo, mat, x, y, z, { ry = 0, rx = 0, rz = 0, s = 1, cast = true } = {}) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s).multiply(_v.set(1, 1, 1)));
    const g = geo.clone().applyMatrix4(m);
    this.addGeo(g, mat, cast);
  }

  // Escalera: arranca en (x,z) y sube hacia dir ('+x','-x','+z','-z'), escalones de 1 m de profundidad.
  stairs(x, z, dir, width, steps, y0 = 0, stepH = 0.5, mat = 'hormigon') {
    for (let i = 0; i < steps; i++) {
      const top = y0 + stepH * (i + 1);
      const off = i + 0.5;
      const cx = dir === '+x' ? x + off : dir === '-x' ? x - off : x;
      const cz = dir === '+z' ? z + off : dir === '-z' ? z - off : z;
      const along = dir.endsWith('x');
      this.box(cx, y0 - 0.5, cz, along ? 1 : width, top - y0 + 0.5, along ? width : 1, mat);
    }
  }

  crate(x, z, s = 1.2, y0 = 0, mat = 'madera') { this.box(x, y0, z, s, s, s, mat); }

  barrel(x, z, y0 = 0, mat = 'oxido') {
    const g = new THREE.CylinderGeometry(0.45, 0.45, 1.2, 12);
    this.mesh(g, mat, x, y0 + 0.6, z);
    this.world.addBox(x - 0.42, y0, z - 0.42, x + 0.42, y0 + 1.2, z + 0.42);
  }

  sandbags(x, z, w, d, y0 = 0, h = 1.1) { this.box(x, y0, z, w, h, d, 'bolsas', { uv: 1.6 }); }

  car(x, z, alongX = true, mat = 'autoRojo', y0 = 0) {
    const L = 4.2, W = 1.9;
    const w = alongX ? L : W, d = alongX ? W : L;
    this.box(x, y0 + 0.3, z, w, 0.85, d, mat, { collide: false });
    this.box(x, y0 + 1.15, z, alongX ? 2.3 : W * 0.9, 0.6, alongX ? W * 0.9 : 2.3, mat, { collide: false });
    this.box(x, y0 + 1.17, z, alongX ? 2.32 : W * 0.7, 0.45, alongX ? W * 0.7 : 2.32, 'vidrio', { collide: false, cast: false });
    const wheel = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wx = alongX ? x + sx * 1.35 : x + sz * (W / 2);
      const wz = alongX ? z + sz * (W / 2) : z + sx * 1.35;
      this.mesh(wheel, 'quemado', wx, y0 + 0.36, wz, alongX ? { rx: Math.PI / 2 } : { rz: Math.PI / 2 });
    }
    this.world.addBox(x - w / 2, y0, z - d / 2, x + w / 2, y0 + 1.5, z + d / 2);
  }

  rock(x, z, s, y0 = 0, mat = 'roca') {
    const g = new THREE.DodecahedronGeometry(s, 0);
    g.scale(1, 0.75, 1);
    this.mesh(g, mat, x, y0 + s * 0.45, z, { ry: this.R() * 6 });
    const c = s * 0.72;
    this.world.addBox(x - c, y0, z - c, x + c, y0 + s * 1.1, z + c);
  }

  tree(x, z, y0 = 0, kind = 'selva') {
    const R = this.R;
    if (kind === 'pino') {
      const h = 5 + R() * 3;
      this.mesh(new THREE.CylinderGeometry(0.22, 0.3, h * 0.4, 7), 'tronco', x, y0 + h * 0.2, z);
      for (let i = 0; i < 3; i++) this.mesh(new THREE.ConeGeometry(1.8 - i * 0.45, h * 0.42, 8), 'pino', x, y0 + h * (0.38 + i * 0.2), z, { ry: R() });
      this.world.addBox(x - 0.35, y0, z - 0.35, x + 0.35, y0 + h * 0.6, z + 0.35);
      return;
    }
    if (kind === 'cactus') {
      const h = 2 + R() * 1.5;
      this.mesh(new THREE.CylinderGeometry(0.28, 0.32, h, 8), 'cactus', x, y0 + h / 2, z);
      this.mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.9, 7), 'cactus', x + 0.45, y0 + h * 0.6, z, { rz: 0.2 });
      this.world.addBox(x - 0.35, y0, z - 0.35, x + 0.35, y0 + h, z + 0.35);
      return;
    }
    const h = 6 + R() * 5;
    this.mesh(new THREE.CylinderGeometry(0.32, 0.5, h, 8), 'tronco', x, y0 + h / 2, z);
    const mat = R() > 0.5 ? 'copa' : 'copaClara';
    for (let i = 0; i < 3; i++) {
      const g = new THREE.IcosahedronGeometry(1.6 + R() * 1.4, 0);
      this.mesh(g, mat, x + (R() - 0.5) * 2, y0 + h - 0.5 + i * 0.9, z + (R() - 0.5) * 2, { ry: R() * 6 });
    }
    this.world.addBox(x - 0.45, y0, z - 0.45, x + 0.45, y0 + h, z + 0.45);
  }

  bush(x, z, y0 = 0) {
    const g = new THREE.IcosahedronGeometry(0.8 + this.R() * 0.6, 0);
    g.scale(1.3, 0.75, 1.3);
    this.mesh(g, this.R() > 0.5 ? 'copa' : 'copaClara', x, y0 + 0.4, z, { ry: this.R() * 6, cast: false });
  }

  lamp(x, z, y0 = 0) {
    this.mesh(new THREE.CylinderGeometry(0.08, 0.1, 5, 6), 'metal', x, y0 + 2.5, z);
    this.box(x, y0 + 4.9, z, 0.6, 0.18, 0.35, 'lampara', { collide: false, cast: false });
    this.world.addBox(x - 0.12, y0, z - 0.12, x + 0.12, y0 + 5, z + 0.12);
    this.data.lights.push(new THREE.Vector3(x, y0 + 4.7, z));
  }

  // Borde del mapa.
  border(h, mat, inset = 0) {
    const B = this.world.bounds;
    this.rect(B.minX - 1 + inset, B.minZ - 1 + inset, B.maxX + 1 - inset, B.minZ + inset, -1, h, mat);
    this.rect(B.minX - 1 + inset, B.maxZ - inset, B.maxX + 1 - inset, B.maxZ + 1 - inset, -1, h, mat);
    this.rect(B.minX - 1 + inset, B.minZ + inset, B.minX + inset, B.maxZ - inset, -1, h, mat);
    this.rect(B.maxX - inset, B.minZ + inset, B.maxX + 1 - inset, B.maxZ - inset, -1, h, mat);
  }

  // Base de un equipo: paredes con 5 entradas, coberturas, zona de instalación y puntos de reaparición.
  base(team, cx, y0, wallMat, opts = {}) {
    const side = cx < 0 ? -1 : 1;           // -1 = izquierda (equipo A)
    const front = cx - side * 9;            // pared frontal (mirando al centro)
    const back = cx + side * 9;
    const hw = 11, H = opts.wallH ?? 3.2, T = 1;
    const x0 = Math.min(front, back), x1 = Math.max(front, back);
    // Pared frontal con puerta central y puertas en las esquinas.
    const fx0 = front - T / 2, fx1 = front + T / 2;
    this.rect(fx0, -hw + 3, fx1, -2.5, y0, y0 + H, wallMat);
    this.rect(fx0, 2.5, fx1, hw - 3, y0, y0 + H, wallMat);
    // Paredes laterales con una puerta.
    for (const sz of [-1, 1]) {
      const z0 = sz * hw - T / 2, z1 = sz * hw + T / 2;
      this.rect(x0, z0, cx - 2, z1, y0, y0 + H, wallMat);
      this.rect(cx + 2, z0, x1, z1, y0, y0 + H, wallMat);
    }
    // Coberturas internas (para defender el huevo).
    const c1 = cx - side * 4.5;
    this.box(c1, y0, -5, 0.8, 1.15, 3.5, opts.coverMat ?? 'bolsas', { uv: 1.6 });
    this.box(c1, y0, 5, 0.8, 1.15, 3.5, opts.coverMat ?? 'bolsas', { uv: 1.6 });
    this.box(cx + side * 3, y0, -7.5, 2.2, 1.6, 1.2, opts.crateMat ?? 'madera');
    this.box(cx + side * 3, y0, 7.5, 2.2, 1.6, 1.2, opts.crateMat ?? 'madera');
    // Zona de instalación (marca en el piso).
    const ring = new THREE.Mesh(new THREE.CircleGeometry(4.2, 48), new THREE.MeshBasicMaterial({ map: getTexture('zona', { repeat: false, size: 256 }), transparent: true, opacity: 0.8, depthWrite: false, color: 0xffffff }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(cx, y0 + 0.04, 0); ring.renderOrder = 2;
    this.group.add(ring);
    // Bandera.
    this.mesh(new THREE.CylinderGeometry(0.07, 0.07, 6, 6), 'metal', cx + side * 6.5, y0 + 3, 0);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3, 8, 4), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(cx + side * 6.5 - side * 1.1, y0 + 5.2, 0);
    flag.rotation.y = side < 0 ? 0 : Math.PI;
    this.group.add(flag);
    this.data.bases[team] = { pos: new THREE.Vector3(cx, y0, 0), side, ring, flag };
    // Puntos de reaparición detrás de la zona.
    for (let i = 0; i < 2; i++) for (let k = 0; k < 6; k++) {
      this.data.spawns[team].push(new THREE.Vector3(cx + side * (5.5 + i * 1.8), y0, -7.5 + k * 3));
    }
    for (const sz of [-1, 1]) for (let k = 0; k < 2; k++) this.data.spawns[team].push(new THREE.Vector3(cx - side * (1 + k * 2), y0, sz * 8.5));
  }

  // Barandas automáticas alrededor de las plataformas (mapa flotante): donde termina el piso aparece una pared de vidrio.
  rails(deckRects, h = 1.35) {
    const B = this.world.bounds;
    const W = B.maxX - B.minX, D = B.maxZ - B.minZ;
    const deck = new Uint8Array(W * D);
    const idx = (i, j) => j * W + i;
    for (const [x0, z0, x1, z1] of deckRects) {
      for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) {
        const i = x - B.minX, j = z - B.minZ;
        if (i >= 0 && j >= 0 && i < W && j < D) deck[idx(i, j)] = 1;
      }
    }
    const isDeck = (i, j) => i >= 0 && j >= 0 && i < W && j < D && deck[idx(i, j)] === 1;
    const t = 0.18;
    // Segmentos a lo largo de X (bordes norte/sur de cada celda).
    for (let j = 0; j < D; j++) for (const dir of [-1, 1]) {
      let run = -1;
      for (let i = 0; i <= W; i++) {
        const edge = i < W && isDeck(i, j) && !isDeck(i, j + dir);
        if (edge && run < 0) run = i;
        if (!edge && run >= 0) {
          const z = B.minZ + j + (dir > 0 ? 1 : 0);
          this.rect(B.minX + run, z - (dir > 0 ? t : 0), B.minX + i, z + (dir > 0 ? 0 : t), 0, h, 'vidrio', { cast: false });
          this.rect(B.minX + run, z - (dir > 0 ? t : 0) - 0.02, B.minX + i, z + (dir > 0 ? 0 : t) + 0.02, h, h + 0.08, 'neonCian', { collide: false, cast: false });
          run = -1;
        }
      }
    }
    for (let i = 0; i < W; i++) for (const dir of [-1, 1]) {
      let run = -1;
      for (let j = 0; j <= D; j++) {
        const edge = j < D && isDeck(i, j) && !isDeck(i + dir, j);
        if (edge && run < 0) run = j;
        if (!edge && run >= 0) {
          const x = B.minX + i + (dir > 0 ? 1 : 0);
          this.rect(x - (dir > 0 ? t : 0), B.minZ + run, x + (dir > 0 ? 0 : t), B.minZ + j, 0, h, 'vidrio', { cast: false });
          this.rect(x - (dir > 0 ? t : 0) - 0.02, B.minZ + run, x + (dir > 0 ? 0 : t) + 0.02, B.minZ + j, h, h + 0.08, 'neonCian', { collide: false, cast: false });
          run = -1;
        }
      }
    }
  }

  finish() {
    for (const [key, geos] of this.batches) {
      const [mat, c] = key.split('|');
      const merged = mergeGeometries(geos, false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.material(mat));
      mesh.castShadow = c === 'c' && !MATS[mat].transparent;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    this.batches.clear();
    const w = this.world;
    for (const s of this.data.weaponSpots) s.y = w.floorAt(s.x, s.z, 50);
    for (const s of this.data.medkits) s.y = w.floorAt(s.x, s.z, 50);
    this.data.center.y = w.floorAt(this.data.center.x, this.data.center.z, 50);
    w.buildNav(1);
    return { world: w, group: this.group, ...this.data };
  }
}

// ------------------------------------------------------------------
// MAPA 1: CIUDAD ABANDONADA
// ------------------------------------------------------------------
function ciudad() {
  const M = new MapBuilder(101);
  const R = M.R;
  M.world.bounds = { minX: -54, maxX: 54, minZ: -34, maxZ: 34 };
  M.box(0, -1, 0, 110, 1, 70, 'asfalto');
  M.border(5, 'hormigon');
  // Manzanas de edificios con callejones.
  const blocks = [[-32, -22], [-18, -8], [8, 18], [22, 32]];
  for (const sz of [-1, 1]) {
    for (const [x0, x1] of blocks) {
      const z0 = sz * 7, z1 = sz * 15;
      M.rect(x0 - 0.8, Math.min(z0, z1) - 0.8, x1 + 0.8, Math.max(z0, z1) + 0.8, 0, 0.18, 'vereda'); // vereda
      let x = x0;
      while (x < x1) {
        const w = Math.min(x1 - x, 3.5 + Math.floor(R() * 3));
        const h = 6 + Math.floor(R() * 9);
        M.rect(x, Math.min(z0, z1), x + w, Math.max(z0, z1), 0.18, h, R() > 0.4 ? 'ventanas' : 'ladrillo');
        M.rect(x - 0.15, Math.min(z0, z1) - 0.15, x + w + 0.15, Math.max(z0, z1) + 0.15, h, h + 0.35, 'hormigon');
        x += w;
      }
    }
    // Faroles en la vereda.
    for (const lx of [-27, -13, 13, 27]) M.lamp(lx, sz * 6.4, 0.18);
  }
  // Autos abandonados y barricadas en las tres calles.
  const carMats = ['autoRojo', 'autoAzul', 'autoAmarillo', 'quemado'];
  const cars = [[-26, 2.5, true], [-12, -3, true], [13, 3.5, true], [26, -2.5, true], [-30, 24, true], [-16, 28, false], [-2, 21, true],
    [10, 26, true], [24, 21, false], [-24, -23, false], [-8, -27, true], [4, -21, true], [18, -28, true], [30, -22, true]];
  cars.forEach(([x, z, a], i) => M.car(x, z, a, carMats[i % 4]));
  // Plaza central: fuente rota y coberturas.
  M.box(0, 0, 6, 6, 0.5, 1.2, 'hormigon');
  M.box(0, 0, -6, 6, 0.5, 1.2, 'hormigon');
  M.box(-5.5, 0, 0, 1.2, 1.2, 4, 'hormigon');
  M.box(5.5, 0, 0, 1.2, 1.2, 4, 'hormigon');
  for (const [x, z] of [[-20, 0], [20, 0], [-2, 27], [2, -27], [-40, 22], [40, -22], [-40, -24], [40, 24]]) M.box(x, 0, z, 1.4, 1.1, 4, 'hormigon');
  // Escombros.
  for (let i = 0; i < 16; i++) {
    const x = -34 + R() * 68, z = (R() > 0.5 ? 1 : -1) * (18 + R() * 14);
    if (Math.abs(x) < 3) continue;
    M.box(x, 0, z, 0.8 + R() * 1.2, 0.4 + R() * 0.5, 0.8 + R() * 1.2, R() > 0.5 ? 'hormigon' : 'ladrillo');
  }
  for (const [x, z] of [[-34, 10], [34, -10], [-6, 31], [6, -31], [-36, -30], [36, 30]]) { M.barrel(x, z); M.barrel(x + 1, z + 0.6); }
  M.base('A', -45, 0, 'hormigon');
  M.base('B', 45, 0, 'hormigon');
  // Horizonte: edificios fuera del mapa.
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2, r = 80 + R() * 30;
    const h = 15 + R() * 35, w = 8 + R() * 10;
    M.box(Math.cos(a) * r * 1.2, 0, Math.sin(a) * r * 0.85, w, h, w, R() > 0.5 ? 'ventanas' : 'hormigon', { collide: false, cast: false });
  }
  M.data.center.set(0, 0, 0);
  M.data.weaponSpots.push(...[[-20, 4], [20, -4], [-12, 24], [12, -24], [0, 30], [0, -30], [-36, 0], [36, 0], [-20, -20], [20, 20]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.medkits.push(...[[-28, -28], [28, 28], [-6, 12], [6, -12], [-28, 18], [28, -18]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.env = {
    sky: { turbidity: 10, rayleigh: 2.2, elevation: 9, azimuth: 205 },
    fog: [0x9a8a7a, 0.012], hemi: [0xffd9b0, 0x3a3a40, 0.75], sun: [0xffc58f, 2.6], exposure: 0.9,
    particles: { color: 0xd8c8b0, count: 300, size: 0.08, speed: 0.3, area: 60 },
  };
  return M.finish();
}

// ------------------------------------------------------------------
// MAPA 2: SELVA
// ------------------------------------------------------------------
function selva() {
  const M = new MapBuilder(202);
  const R = M.R;
  M.world.bounds = { minX: -54, maxX: 54, minZ: -34, maxZ: 34 };
  M.box(0, -1, 0, 110, 1, 70, 'pasto');
  M.border(7, 'musgo');
  // Senderos de tierra.
  M.box(0, 0, 0, 74, 0.03, 4, 'tierra', { collide: false, cast: false });
  M.box(0, 0, 21, 74, 0.03, 3.5, 'tierra', { collide: false, cast: false });
  M.box(0, 0, -21, 74, 0.03, 3.5, 'tierra', { collide: false, cast: false });
  for (const x of [-26, 26]) M.box(x, 0, 0, 3, 0.03, 42, 'tierra', { collide: false, cast: false });
  // Templo central escalonado.
  M.box(0, 0, 0, 14, 0.5, 14, 'musgo');
  M.box(0, 0.5, 0, 10, 0.5, 10, 'musgo');
  M.box(0, 1.0, 0, 6, 0.5, 6, 'musgo');
  for (const [x, z] of [[-6.5, -6.5], [6.5, -6.5], [-6.5, 6.5], [6.5, 6.5]]) M.box(x, 0, z, 1, 3.5, 1, 'musgo');
  // Ruinas: paredes partidas que forman cobertura y caminos.
  const ruins = [[-16, 9, 6, 1], [-16, -9, 6, 1], [16, 9, 6, 1], [16, -9, 6, 1], [-30, 12, 1, 6], [30, -12, 1, 6], [-30, -12, 1, 6], [30, 12, 1, 6],
    [-10, 27, 5, 1], [10, -27, 5, 1], [-10, -15, 1, 5], [10, 15, 1, 5], [0, 14, 4, 1], [0, -14, 4, 1]];
  for (const [x, z, w, d] of ruins) M.box(x, 0, z, w, 1.6 + R() * 1.6, d, 'musgo');
  for (const [x, z] of [[-20, 24], [20, -24], [-4, 30], [4, -30], [-38, 28], [38, -28]]) { M.box(x, 0, z, 3, 3, 3, 'musgo'); M.box(x, 3, z, 3.6, 0.4, 3.6, 'musgo'); }
  // Árboles (evitando senderos y bases).
  let placed = 0, guard = 0;
  while (placed < 70 && guard++ < 2000) {
    const x = -36 + R() * 72, z = -32 + R() * 64;
    if (Math.abs(z) < 3.5 || Math.abs(Math.abs(z) - 21) < 3 || (Math.abs(Math.abs(x) - 26) < 2.5 && Math.abs(z) < 21)) continue;
    if (Math.abs(x) < 9 && Math.abs(z) < 9) continue;
    if (M.world.floorAt(x, z, 20, 1.2) > 0.05) continue;
    M.tree(x, z, 0, 'selva');
    placed++;
  }
  for (let i = 0; i < 60; i++) {
    const x = -50 + R() * 100, z = -32 + R() * 64;
    if (Math.abs(x) < 6 && Math.abs(z) < 6) continue;
    if (Math.abs(x) > 34 && Math.abs(z) < 12) continue;
    M.bush(x, z);
  }
  for (const [x, z] of [[-22, 3], [22, -3], [-6, 18], [6, -18], [-36, -18], [36, 18]]) M.rock(x, z, 1.1);
  M.base('A', -45, 0, 'musgo', { coverMat: 'musgo', crateMat: 'madera' });
  M.base('B', 45, 0, 'musgo', { coverMat: 'musgo', crateMat: 'madera' });
  // Selva densa fuera del mapa.
  for (let i = 0; i < 90; i++) {
    const a = R() * Math.PI * 2, r = 64 + R() * 30;
    M.tree(Math.cos(a) * r, Math.sin(a) * r * 0.75, 0, 'selva');
  }
  M.world.boxes = M.world.boxes.filter((b) => b.minX > -60 && b.maxX < 60 && b.minZ > -40 && b.maxZ < 40);
  M.data.center.set(0, 0, 0);
  M.data.weaponSpots.push(...[[-16, 12], [16, -12], [-24, 21], [24, -21], [0, 21], [0, -21], [-34, 0], [34, 0], [-8, -26], [8, 26]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.medkits.push(...[[-26, -28], [26, 28], [-8, 4], [8, -4], [-26, 14], [26, -14]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.env = {
    sky: { turbidity: 6, rayleigh: 1.4, elevation: 38, azimuth: 140 },
    fog: [0x6f8f6a, 0.02], hemi: [0xcdeebf, 0x2b3a1f, 0.9], sun: [0xfff1c7, 2.4], exposure: 0.85,
    particles: { color: 0xeaff8a, count: 160, size: 0.12, speed: 0.4, area: 50, glow: true },
  };
  return M.finish();
}

// ------------------------------------------------------------------
// MAPA 3: DESIERTO
// ------------------------------------------------------------------
function desierto() {
  const M = new MapBuilder(303);
  const R = M.R;
  M.world.bounds = { minX: -54, maxX: 54, minZ: -34, maxZ: 34 };
  M.box(0, -1, 0, 110, 1, 70, 'arena');
  M.border(6, 'adobe');
  // Plaza central con pozo.
  M.box(0, 0, 0, 12, 0.3, 12, 'adobe');
  M.box(0, 0.3, 0, 2.6, 1.0, 0.4, 'adobe'); // brocal (dejamos lugar para el huevo al costado)
  M.data.center.set(0, 0, 3);
  for (const [x, z, w, d] of [[-7, 4, 1, 5], [7, -4, 1, 5], [-3, -8, 5, 1], [3, 8, 5, 1]]) M.box(x, 0, z, w, 1.4 + R(), d, 'adobe');
  // Torres de vigilancia con escalera (dos en el medio, una por base en cada carril).
  const tower = (x, z, dir) => {
    M.box(x, 0, z, 4, 3, 4, 'adobe');
    for (const [px, pz, w, d] of [[0, 1.8, 4, 0.4], [0, -1.8, 4, 0.4], [1.8, 0, 0.4, 4], [-1.8, 0, 0.4, 4]]) {
      if ((dir === '+z' && pz < -1) || (dir === '-z' && pz > 1)) {
        M.box(x + px - 1.4, 3, z + pz, 1.2, 1.0, d, 'adobe');
        M.box(x + px + 1.4, 3, z + pz, 1.2, 1.0, d, 'adobe');
        continue;
      }
      M.box(x + px, 3, z + pz, w, 1.0, d, 'adobe');
    }
    M.box(x, 4.6, z, 4.6, 0.3, 4.6, 'madera', { collide: false });
    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) M.box(x + px * 0.95, 4, z + pz * 0.95, 0.2, 0.6, 0.2, 'madera', { collide: false });
    // Escalera de 6 escalones (0.5 m) que llega a 3 m.
    if (dir === '+z') M.stairs(x, z - 8, '+z', 2, 6, 0, 0.5, 'adobe');
    else M.stairs(x, z + 8, '-z', 2, 6, 0, 0.5, 'adobe');
  };
  tower(-14, 20, '+z');
  tower(14, -20, '-z');
  // Fortalezas en ruinas y muros.
  for (const [x, z, w, d, h] of [[-22, -6, 1, 8, 2.6], [22, 6, 1, 8, 2.6], [-22, 14, 8, 1, 2], [22, -14, 8, 1, 2], [-6, 24, 1, 6, 2], [6, -24, 1, 6, 2],
    [-30, -22, 6, 1, 2.4], [30, 22, 6, 1, 2.4], [0, 16, 1, 4, 1.6], [0, -16, 1, 4, 1.6]]) M.box(x, 0, z, w, h, d, 'adobe');
  // Rocas y dunas bajas.
  for (const [x, z, s] of [[-28, 4, 1.6], [28, -4, 1.6], [-10, -22, 1.3], [10, 22, 1.3], [-34, 26, 2], [34, -26, 2], [-18, 30, 1.4], [18, -30, 1.4], [-6, -29, 1.2], [6, 29, 1.2]]) M.rock(x, z, s, 0, 'rocaRoja');
  for (const [x, z] of [[-30, -10], [30, 10], [-12, 8], [12, -8]]) { M.box(x, 0, z, 6, 0.4, 4, 'arena'); M.box(x, 0.4, z, 3.5, 0.4, 2.4, 'arena'); }
  for (let i = 0; i < 14; i++) {
    const x = -34 + R() * 68, z = -32 + R() * 64;
    if (M.world.floorAt(x, z, 20, 1) > 0.05 || Math.abs(z) < 4) continue;
    M.tree(x, z, 0, 'cactus');
  }
  for (const [x, z] of [[-26, 28], [26, -28], [-36, 10], [36, -10]]) { M.crate(x, z, 1.3); M.crate(x + 1.4, z, 1.0); M.barrel(x, z + 1.5, 0, 'madera'); }
  M.base('A', -45, 0, 'adobe', { wallH: 3.6, coverMat: 'adobe' });
  M.base('B', 45, 0, 'adobe', { wallH: 3.6, coverMat: 'adobe' });
  for (const team of ['A', 'B']) { // torres decorativas en las esquinas de las fortalezas
    const b = M.data.bases[team].pos;
    for (const sz of [-1, 1]) M.box(b.x - M.data.bases[team].side * 9, 0, sz * 11, 2.4, 5, 2.4, 'adobe');
  }
  // Mesetas en el horizonte.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2, r = 95 + R() * 40;
    const w = 14 + R() * 20, h = 10 + R() * 22;
    M.box(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8, w, h, w * 0.8, 'rocaRoja', { collide: false, cast: false });
  }
  M.data.weaponSpots.push(...[[-14, 22.5], [14, -22.5], [-20, 0], [20, 0], [0, 26], [0, -26], [-36, 18], [36, -18], [-8, -12], [8, 12]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.medkits.push(...[[-24, -28], [24, 28], [-4, -5], [4, 5], [-30, 20], [30, -20]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.env = {
    sky: { turbidity: 4, rayleigh: 0.9, elevation: 55, azimuth: 160 },
    fog: [0xe5cfa8, 0.009], hemi: [0xfff3da, 0x8a6a45, 0.85], sun: [0xfff2d6, 3.2], exposure: 0.8,
    particles: { color: 0xe8c890, count: 260, size: 0.07, speed: 1.4, area: 60 },
  };
  return M.finish();
}

// ------------------------------------------------------------------
// MAPA 4: CIUDAD FLOTANTE
// ------------------------------------------------------------------
function flotante() {
  const M = new MapBuilder(404);
  const R = M.R;
  M.world.bounds = { minX: -56, maxX: 56, minZ: -36, maxZ: 36 };
  M.world.killY = -14;
  // Rectángulos de piso [x0, z0, x1, z1] alineados a 1 m (las barandas se generan solas).
  const decks = [
    [-54, -13, -34, 13], [34, -13, 54, 13],          // islas de las bases
    [-8, -8, 8, 8],                                     // isla central
    [-25, -4, -17, 4], [17, -4, 25, 4],                 // plataformas del carril medio
    [-34, -2, -25, 2], [-17, -2, -8, 2], [8, -2, 17, 2], [25, -2, 34, 2], // puentes medio
    [-30, 17, -18, 27], [-7, 17, 7, 27], [18, 17, 30, 27],   // carril norte
    [-30, -27, -18, -17], [-7, -27, 7, -17], [18, -27, 30, -17], // carril sur
    [-18, 20, -7, 24], [7, 20, 18, 24], [-18, -24, -7, -20], [7, -24, 18, -20],
    [-38, 13, -35, 24], [-35, 20, -30, 24], [35, 13, 38, 24], [30, 20, 35, 24],
    [-38, -24, -35, -13], [-35, -24, -30, -20], [35, -24, 38, -13], [30, -24, 35, -20],
    [-2, 8, 2, 17], [-2, -17, 2, -8],                   // del centro a los carriles
  ];
  for (const [x0, z0, x1, z1] of decks) {
    const big = (x1 - x0) * (z1 - z0) > 60;
    M.rect(x0, z0, x1, z1, big ? -2 : -0.6, 0, big ? 'baldosa' : 'metal');
    if (big) { // panza de roca flotante
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rad = Math.min(x1 - x0, z1 - z0) * 0.55;
      M.mesh(new THREE.ConeGeometry(rad, rad * 1.6, 7), 'roca', cx, -2 - rad * 0.8, cz, { rx: Math.PI, ry: R() * 6, cast: false });
    }
  }
  M.rails(decks);
  // Edificios futuristas.
  const tower = (x, z, w, d, h) => {
    M.box(x, 0, z, w, h, d, 'futurista');
    M.box(x, h, z, w + 0.4, 0.3, d + 0.4, 'neonCian', { collide: false, cast: false });
    M.box(x, h * 0.5, z, w + 0.06, 0.15, d + 0.06, R() > 0.5 ? 'neonRosa' : 'neonCian', { collide: false, cast: false });
  };
  tower(-24, 25, 3, 2, 7); tower(24, -25, 3, 2, 7); tower(-24, -25, 3, 2, 9); tower(24, 25, 3, 2, 9);
  tower(-4.5, 22, 2, 3, 5); tower(4.5, -22, 2, 3, 5);
  tower(-21, 0, 2, 1.2, 1.4); tower(21, 0, 2, 1.2, 1.4);
  M.box(0, 0, 4.5, 4, 1.2, 0.8, 'futurista'); M.box(0, 0, -4.5, 4, 1.2, 0.8, 'futurista');
  M.box(-4.5, 0, 0, 0.8, 1.2, 3, 'futurista'); M.box(4.5, 0, 0, 0.8, 1.2, 3, 'futurista');
  for (const [x, z] of [[-22, 3], [22, -3], [0, 25], [0, -25], [-27, -19], [27, 19]]) M.crate(x, z, 1.1, 0, 'metal');
  M.base('A', -45, 0, 'futurista', { coverMat: 'metal', crateMat: 'metal' });
  M.base('B', 45, 0, 'futurista', { coverMat: 'metal', crateMat: 'metal' });
  // Islas lejanas de decoración.
  for (let i = 0; i < 18; i++) {
    const a = R() * Math.PI * 2, r = 85 + R() * 60, y = -20 + R() * 40;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const s = 6 + R() * 10;
    M.box(x, y, z, s, 1.5, s, 'baldosa', { collide: false, cast: false });
    M.mesh(new THREE.ConeGeometry(s * 0.6, s * 1.4, 6), 'roca', x, y - s * 0.7, z, { rx: Math.PI, cast: false });
    M.box(x, y + 1.5, z, s * 0.3, 4 + R() * 12, s * 0.3, 'futurista', { collide: false, cast: false });
  }
  M.data.center.set(0, 0, 0);
  M.data.weaponSpots.push(...[[-21, 2.5], [21, -2.5], [-26, 22], [26, -22], [0, 20], [0, -20], [-26, -22], [26, 22], [-36.5, 18.5], [36.5, -18.5]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.medkits.push(...[[-12, 22], [12, -22], [-12, -22], [12, 22], [-6, 6], [6, -6]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.clouds = true;
  M.data.env = {
    sky: { turbidity: 2, rayleigh: 1.2, elevation: 24, azimuth: 120 },
    fog: [0xbcd6ef, 0.007], hemi: [0xe0f0ff, 0x7a8fae, 1.0], sun: [0xffffff, 2.8], exposure: 0.9,
    particles: { color: 0xffffff, count: 120, size: 0.1, speed: 0.6, area: 60 },
  };
  return M.finish();
}

// ------------------------------------------------------------------
// MAPA 5: MONTAÑA
// ------------------------------------------------------------------
function montana() {
  const M = new MapBuilder(505);
  const R = M.R;
  M.world.bounds = { minX: -54, maxX: 54, minZ: -34, maxZ: 34 };
  M.box(0, -1, 0, 110, 1, 70, 'piedra');
  M.border(8, 'piedra');
  const PL = 2.5; // altura de las mesetas de las bases
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -54 : 30, x1 = side < 0 ? -30 : 54;
    M.rect(x0, -34, x1, 34, -1, PL, 'pasto');
    // Escaleras de 4 escalones (0.5 m) que suben del valle a la meseta en los tres carriles.
    const edge = side < 0 ? -30 : 30;
    for (const [z, w] of [[0, 6], [21, 5], [-21, 5]]) {
      for (let i = 0; i < 4; i++) {
        const top = 0.5 * (i + 1);
        M.box(edge - side * (3.5 - i), -0.5, z, 1, top + 0.5, w, 'piedra');
      }
    }
  }
  // Colina central.
  M.box(0, 0, 0, 12, 0.5, 12, 'pasto');
  M.box(0, 0.5, 0, 7, 0.5, 7, 'pasto');
  // Crestas rocosas que separan los carriles (con pasos).
  for (const sz of [-1, 1]) {
    for (const [x0, x1] of [[-24, -9], [9, 24]]) {
      M.rect(x0, sz * 10 - 1.5, x1, sz * 10 + 1.5, 0, 3.5 + R() * 2, 'piedra');
      M.rock((x0 + x1) / 2, sz * 12.5, 1.6);
    }
    // Repisas elevadas en los carriles exteriores.
    M.rect(-14, sz * 17, 14, sz * 27, 0, 1.0, 'pasto');
    M.stairs(-16, sz * 22, '+x', 4, 2, 0, 0.5, 'piedra');
    M.stairs(16, sz * 22, '-x', 4, 2, 0, 0.5, 'piedra');
  }
  // Búnkeres y bolsas de arena.
  for (const [x, z] of [[-18, 4], [18, -4]]) { M.box(x, 0, z, 4, 2.4, 3, 'hormigon'); M.box(x, 2.4, z, 4.6, 0.3, 3.6, 'hormigon'); }
  for (const [x, z, w, d] of [[-8, 4, 0.8, 3], [8, -4, 0.8, 3], [-24, 0, 0.8, 4], [24, 0, 0.8, 4], [-6, 22, 3, 0.8], [6, -22, 3, 0.8], [6, 22, 3, 0.8], [-6, -22, 3, 0.8]]) {
    const y = M.world.floorAt(x, z, 20);
    M.sandbags(x, z, w, d, y);
  }
  // Torre de vigilancia de madera (sobre la repisa norte).
  M.box(0, 1.0, 30.5, 3, 2.5, 3, 'madera');
  M.stairs(0, 24, '+z', 2, 5, 1.0, 0.5, 'madera');
  M.box(0, 1.0, -30.5, 3, 2.5, 3, 'madera');
  M.stairs(0, -24, '-z', 2, 5, 1.0, 0.5, 'madera');
  // Pinos.
  let n = 0, g = 0;
  while (n < 40 && g++ < 1500) {
    const x = -50 + R() * 100, z = -32 + R() * 64;
    const f = M.world.floorAt(x, z, 20, 0.8);
    if (Math.abs(z) < 4 || Math.abs(Math.abs(z) - 21) < 3.5) continue;
    if (Math.abs(x) > 34 && Math.abs(z) < 13) continue;
    if (Math.abs(x) < 7 && Math.abs(z) < 7) continue;
    if (f !== M.world.floorAt(x, z, 20, 0) || (f !== 0 && f !== PL && f !== 1)) continue;
    M.tree(x, z, f, 'pino');
    n++;
  }
  M.base('A', -45, PL, 'hormigon', { coverMat: 'bolsas' });
  M.base('B', 45, PL, 'hormigon', { coverMat: 'bolsas' });
  // Montañas nevadas en el horizonte.
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2, r = 110 + R() * 40;
    const h = 30 + R() * 45, w = 25 + R() * 25;
    M.mesh(new THREE.ConeGeometry(w, h, 6), 'piedra', Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r * 0.85, { ry: R() * 6, cast: false });
    M.mesh(new THREE.ConeGeometry(w * 0.36, h * 0.36, 6), 'nieve', Math.cos(a) * r, h - h * 0.18 - 2 + 0.3, Math.sin(a) * r * 0.85, { ry: R() * 6, cast: false });
  }
  M.data.center.set(0, 0, 0);
  M.data.weaponSpots.push(...[[-18, 7], [18, -7], [-10, 22], [10, -22], [0, 15], [0, -15], [-34, 14], [34, -14], [-12, -28], [12, 28]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.medkits.push(...[[-26, -28], [26, 28], [-4, 8], [4, -8], [-26, 28], [26, -28]].map(([x, z]) => new THREE.Vector3(x, 0, z)));
  M.data.env = {
    sky: { turbidity: 3, rayleigh: 1.6, elevation: 20, azimuth: 230 },
    fog: [0xb7c4d2, 0.011], hemi: [0xdbe7f5, 0x4b4a3a, 0.85], sun: [0xfff0e0, 2.7], exposure: 0.85,
    particles: { color: 0xffffff, count: 350, size: 0.07, speed: -0.9, area: 55, snow: true },
  };
  return M.finish();
}

const BUILDERS = { ciudad, selva, desierto, flotante, montana };

export function buildMap(id) {
  const m = BUILDERS[id]();
  m.id = id;
  return m;
}
