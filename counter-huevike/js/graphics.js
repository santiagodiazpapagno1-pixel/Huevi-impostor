// Render, iluminación, cielo, postprocesado, calidad automática y efectos (partículas, trazadoras, explosiones).

import * as THREE from 'three';
import { Sky } from '../vendor/jsm/objects/Sky.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { VignetteShader } from '../vendor/jsm/shaders/VignetteShader.js';
import { getTexture } from './textures.js';

const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

export const QUALITY = {
  bajo: { pixelRatio: 0.75, shadows: false, shadowSize: 512, post: false, particles: 0.4, antialias: false },
  medio: { pixelRatio: 1.25, shadows: true, shadowSize: 1024, post: false, particles: 0.7, antialias: true },
  alto: { pixelRatio: 2, shadows: true, shadowSize: 2048, post: true, particles: 1, antialias: true },
};

export class Graphics {
  constructor(canvas, qualitySetting = 'auto') {
    this.setting = qualitySetting;
    this.level = qualitySetting === 'auto' ? (isMobile ? 'medio' : 'alto') : qualitySetting;
    const q = QUALITY[this.level];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.05, 900);
    this.scene.add(this.camera);
    this.baseFov = 75;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.shadow.camera.left = -32; this.sun.shadow.camera.right = 32;
    this.sun.shadow.camera.top = 32; this.sun.shadow.camera.bottom = -32;
    this.sun.shadow.camera.near = 1; this.sun.shadow.camera.far = 160;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    this.sunDir = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
    // Luz del fogonazo propio (siempre existe; solo cambia la intensidad para no recompilar shaders).
    this.flash = new THREE.PointLight(0xffc36b, 0, 9, 2);
    this.camera.add(this.flash);
    this.flash.position.set(0.2, -0.1, -0.8);

    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    this.scene.add(this.sky);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.effects = new Effects(this);
    this.fpsSamples = [];
    this.autoTimer = 0;
    this.applyQuality();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  applyQuality() {
    const q = QUALITY[this.level];
    this.q = q;
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = q.shadows;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.scene.traverse((o) => { if (o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
    if (q.post && !this.composer) this._buildComposer();
    this.resize();
  }

  _buildComposer() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.45, 0.88);
    this.composer.addPass(this.bloom);
    const vig = new ShaderPass(VignetteShader);
    vig.uniforms.offset.value = 0.95; vig.uniforms.darkness.value = 1.05;
    this.composer.addPass(vig);
    this.composer.addPass(new OutputPass());
  }

  setQuality(setting) {
    this.setting = setting;
    this.level = setting === 'auto' ? this.level : setting;
    this.applyQuality();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
    this.effects.resize(h * this.renderer.getPixelRatio());
  }

  // Ambiente de cada mapa: cielo, sol, niebla y reflejos.
  setEnvironment(env) {
    const u = this.sky.material.uniforms;
    u.turbidity.value = env.sky.turbidity; u.rayleigh.value = env.sky.rayleigh;
    u.mieCoefficient.value = 0.005; u.mieDirectionalG.value = 0.8;
    const phi = THREE.MathUtils.degToRad(90 - env.sky.elevation), theta = THREE.MathUtils.degToRad(env.sky.azimuth);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    u.sunPosition.value.copy(this.sunDir);
    this.scene.fog = new THREE.FogExp2(env.fog[0], env.fog[1]);
    this.hemi.color.setHex(env.hemi[0]); this.hemi.groundColor.setHex(env.hemi[1]); this.hemi.intensity = env.hemi[2];
    this.sun.color.setHex(env.sun[0]); this.sun.intensity = env.sun[1];
    this.renderer.toneMappingExposure = env.exposure;
    // Mapa de entorno a partir del cielo (reflejos de materiales PBR).
    const envScene = new THREE.Scene();
    const sky2 = new Sky(); sky2.scale.setScalar(1000);
    Object.keys(u).forEach((k) => { if (sky2.material.uniforms[k]?.value?.copy) sky2.material.uniforms[k].value.copy(u[k].value); else if (sky2.material.uniforms[k]) sky2.material.uniforms[k].value = u[k].value; });
    envScene.add(sky2);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(envScene, 0, 0.1, 1000);
    this.scene.environment = this.envRT.texture;
    if ('environmentIntensity' in this.scene) this.scene.environmentIntensity = 0.55;
    this.effects.setAmbient(env.particles);
  }

  followShadow(pos) {
    const s = this.sun;
    const snap = 64 / (QUALITY[this.level].shadowSize || 1024);
    const x = Math.round(pos.x / snap) * snap, z = Math.round(pos.z / snap) * snap;
    s.target.position.set(x, 0, z);
    s.position.set(x + this.sunDir.x * 80, this.sunDir.y * 80, z + this.sunDir.z * 80);
  }

  render(dt) {
    this.effects.update(dt);
    if (this.q.post && this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
    // Calidad automática: si los FPS caen, bajamos un nivel.
    if (this.setting === 'auto' && this.measuring) {
      this.fpsSamples.push(dt);
      this.autoTimer += dt;
      if (this.autoTimer > 4) {
        const avg = this.fpsSamples.reduce((a, b) => a + b, 0) / this.fpsSamples.length;
        const fps = 1 / avg;
        this.fpsSamples = []; this.autoTimer = 0;
        if (fps < 38 && this.level !== 'bajo') { this.level = this.level === 'alto' ? 'medio' : 'bajo'; this.applyQuality(); }
        else if (fps > 58 && this.level === 'bajo') { this.level = 'medio'; this.applyQuality(); this.measuring = false; }
      }
    }
  }
}

// ---------------- Efectos ----------------
const particleVS = `
attribute float size; attribute vec4 col;
varying vec4 vCol; uniform float scale;
void main(){ vCol = col; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }`;
const particleFS = `
uniform sampler2D map; varying vec4 vCol;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vCol.rgb, vCol.a * t.a); if (gl_FragColor.a < 0.01) discard; }`;

class ParticlePool {
  constructor(scene, max, additive) {
    this.max = max;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 4); this.grow = new Float32Array(max); this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: getTexture('particula', { repeat: false, size: 64, srgb: false }) }, scale: { value: 400 } },
      vertexShader: particleVS, fragmentShader: particleFS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.next = 0;
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, { grow = 0, grav = 0, drag = 0 } = {}) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life; this.size[i] = size;
    this.base[i * 4] = r; this.base[i * 4 + 1] = g; this.base[i * 4 + 2] = b; this.base[i * 4 + 3] = a;
    this.grow[i] = grow; this.grav[i] = grav; this.drag[i] = drag;
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = 1 - this.drag[i] * dt;
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      this.col[i * 4] = this.base[i * 4]; this.col[i * 4 + 1] = this.base[i * 4 + 1]; this.col[i * 4 + 2] = this.base[i * 4 + 2];
      this.col[i * 4 + 3] = this.base[i * 4 + 3] * Math.min(1, k * 1.6);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.col.needsUpdate = true;
    this.geo.attributes.size.needsUpdate = true;
  }
}

class Effects {
  constructor(gfx) {
    this.gfx = gfx;
    const scene = gfx.scene;
    this.glow = new ParticlePool(scene, 900, true);
    this.smoke = new ParticlePool(scene, 500, false);
    // Fragmentos de cáscara (instanciados, con luz y sombra).
    this.shellMax = 300;
    const shellGeo = new THREE.TetrahedronGeometry(0.09, 0);
    this.shells = new THREE.InstancedMesh(shellGeo, new THREE.MeshStandardMaterial({ roughness: 0.5 }), this.shellMax);
    this.shells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shells.frustumCulled = false;
    this.shellData = Array.from({ length: this.shellMax }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), s: 1 }));
    this.shellNext = 0;
    const black = new THREE.Color(0);
    for (let i = 0; i < this.shellMax; i++) { this.shells.setColorAt(i, black); this.shells.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); }
    scene.add(this.shells);
    // Trazadoras.
    this.tracerMax = 60;
    this.tracers = new THREE.InstancedMesh(new THREE.BoxGeometry(0.025, 0.025, 1).translate(0, 0, -0.5), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), this.tracerMax);
    this.tracers.frustumCulled = false;
    this.tracerData = Array.from({ length: this.tracerMax }, () => ({ life: 0, m: new THREE.Matrix4() }));
    this.tracerNext = 0;
    for (let i = 0; i < this.tracerMax; i++) this.tracers.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    scene.add(this.tracers);
    // Anillos de onda expansiva.
    this.rings = [];
    // Ambiente.
    this.ambient = null;
    this.clouds = [];
    this.shake = 0;
  }

  resize(h) {
    const s = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.gfx.camera.fov / 2)));
    this.glow.mat.uniforms.scale.value = s;
    this.smoke.mat.uniforms.scale.value = s;
    if (this.ambient) this.ambient.material.uniforms.scale.value = s;
  }

  get pf() { return this.gfx.q?.particles ?? 1; }

  muzzle(pos, dir, big = 1) {
    for (let i = 0; i < 5 * big; i++) {
      const s = 2 + Math.random() * 5;
      this.glow.spawn(pos.x, pos.y, pos.z, dir.x * s + (Math.random() - 0.5), dir.y * s + (Math.random() - 0.5), dir.z * s + (Math.random() - 0.5), 0.06, 0.25 * big, 1, 0.75, 0.35, 1);
    }
  }

  impact(p, n, flesh = false) {
    const c = Math.ceil(6 * this.pf);
    for (let i = 0; i < c; i++) {
      const vx = n.x * 2 + (Math.random() - 0.5) * 4, vy = n.y * 2 + Math.random() * 3, vz = n.z * 2 + (Math.random() - 0.5) * 4;
      if (flesh) this.glow.spawn(p.x, p.y, p.z, vx, vy, vz, 0.3, 0.12, 1, 0.85, 0.2, 1, { grav: 9 });
      else this.glow.spawn(p.x, p.y, p.z, vx, vy, vz, 0.2, 0.07, 1, 0.8, 0.45, 1, { grav: 9 });
    }
    if (!flesh) this.smoke.spawn(p.x + n.x * 0.05, p.y + n.y * 0.05, p.z + n.z * 0.05, n.x * 0.4, 0.4, n.z * 0.4, 0.6, 0.3, 0.6, 0.58, 0.55, 0.5, { grow: 0.9 });
  }

  tracer(from, to) {
    const d = this.tracerData[this.tracerNext];
    const i = this.tracerNext; this.tracerNext = (this.tracerNext + 1) % this.tracerMax;
    const len = from.distanceTo(to);
    if (len < 0.5) return;
    const o = new THREE.Object3D();
    o.position.copy(from); o.lookAt(to); o.scale.set(1, 1, len);
    o.updateMatrix();
    d.m.copy(o.matrix); d.life = 0.05;
    this.tracers.setMatrixAt(i, d.m);
    this.tracers.instanceMatrix.needsUpdate = true;
  }

  // Muerte de un jugador: el huevo explota en cáscaras y yema.
  eggBurst(pos, color) {
    const c = new THREE.Color(color);
    const n = Math.ceil(26 * this.pf);
    for (let i = 0; i < n; i++) {
      const s = this.shellData[this.shellNext];
      this.shells.setColorAt(this.shellNext, i % 3 === 0 ? new THREE.Color(0xf5efe1) : c);
      this.shellNext = (this.shellNext + 1) % this.shellMax;
      s.life = 2.5 + Math.random();
      s.p.set(pos.x + (Math.random() - 0.5) * 0.6, pos.y + 0.4 + Math.random() * 1.0, pos.z + (Math.random() - 0.5) * 0.6);
      s.v.set((Math.random() - 0.5) * 7, 3 + Math.random() * 5, (Math.random() - 0.5) * 7);
      s.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      s.s = 0.6 + Math.random() * 1.4;
      s.floor = pos.y;
    }
    this.shells.instanceColor.needsUpdate = true;
    for (let i = 0; i < 18 * this.pf; i++) { // yema
      this.glow.spawn(pos.x, pos.y + 0.8, pos.z, (Math.random() - 0.5) * 5, Math.random() * 5, (Math.random() - 0.5) * 5, 0.7, 0.35, 1, 0.75, 0.1, 0.9, { grav: 12, drag: 1 });
    }
    for (let i = 0; i < 6 * this.pf; i++) this.smoke.spawn(pos.x, pos.y + 0.7, pos.z, (Math.random() - 0.5) * 1.5, 0.8, (Math.random() - 0.5) * 1.5, 1.2, 0.8, 0.95, 0.92, 0.85, 0.45, { grow: 1.6, drag: 1 });
  }

  // Explosión del huevo podrido.
  bigExplosion(pos) {
    for (let i = 0; i < 160 * this.pf; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI * 0.5, s = 6 + Math.random() * 16;
      const green = Math.random() > 0.45;
      this.glow.spawn(pos.x, pos.y + 0.5, pos.z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s, Math.sin(a) * Math.cos(e) * s, 0.9 + Math.random() * 0.8, 1.2 + Math.random() * 1.5,
        green ? 0.55 : 1, green ? 1 : 0.55, green ? 0.25 : 0.15, 1, { drag: 2.2, grow: 1.5 });
    }
    for (let i = 0; i < 70 * this.pf; i++) {
      const a = Math.random() * Math.PI * 2, s = 2 + Math.random() * 6;
      this.smoke.spawn(pos.x, pos.y + 0.5 + Math.random() * 2, pos.z, Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s, 3 + Math.random() * 2, 2.5, 0.45, 0.55, 0.2, 0.55, { grow: 3, drag: 1 });
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.4, 48), new THREE.MeshBasicMaterial({ color: 0xb8ff6a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(pos.x, pos.y + 0.2, pos.z);
    this.gfx.scene.add(ring);
    this.rings.push({ m: ring, life: 1.2 });
    this.shake = 1.2;
  }

  sparkle(pos, color = 0xffd36b) {
    const c = new THREE.Color(color);
    for (let i = 0; i < 14; i++) this.glow.spawn(pos.x, pos.y + 0.5, pos.z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.6, 0.16, c.r, c.g, c.b, 1, { drag: 2 });
  }

  stink(pos) {
    if (Math.random() > 0.35 * this.pf) return;
    this.smoke.spawn(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.6, pos.z + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3, 1.5, 0.35, 0.55, 0.85, 0.25, 0.35, { grow: 0.6 });
  }

  setAmbient(p) {
    if (this.ambient) { this.gfx.scene.remove(this.ambient); this.ambient.geometry.dispose(); this.ambient = null; }
    for (const c of this.clouds) this.gfx.scene.remove(c);
    this.clouds = [];
    if (!p) return;
    const n = Math.ceil(p.count * this.pf);
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 4), size = new Float32Array(n);
    const c = new THREE.Color(p.color);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * p.area; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * p.area;
      col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = p.glow ? 0.9 : 0.55;
      size[i] = p.size * (0.6 + Math.random() * 0.8);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('col', new THREE.BufferAttribute(col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: getTexture('particula', { repeat: false, size: 64, srgb: false }) }, scale: { value: this.glow.mat.uniforms.scale.value } },
      vertexShader: particleVS, fragmentShader: particleFS, transparent: true, depthWrite: false, blending: p.glow ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.ambient = new THREE.Points(g, m);
    this.ambient.frustumCulled = false;
    this.ambient.userData = p;
    this.gfx.scene.add(this.ambient);
  }

  addClouds() {
    const tex = getTexture('nube', { repeat: false, size: 256 });
    for (let i = 0; i < 46; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false, fog: true });
      const s = new THREE.Sprite(mat);
      const below = i < 30;
      const a = Math.random() * Math.PI * 2, r = below ? Math.random() * 90 : 70 + Math.random() * 80;
      s.position.set(Math.cos(a) * r, below ? -16 - Math.random() * 25 : -5 + Math.random() * 30, Math.sin(a) * r * 0.8);
      const sc = below ? 30 + Math.random() * 40 : 25 + Math.random() * 30;
      s.scale.set(sc, sc * 0.5, 1);
      s.userData.v = 0.4 + Math.random() * 0.8;
      this.gfx.scene.add(s);
      this.clouds.push(s);
    }
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let any = false;
    for (let i = 0; i < this.shellMax; i++) {
      const s = this.shellData[i];
      if (s.life <= 0) continue;
      any = true;
      s.life -= dt;
      s.v.y -= 18 * dt;
      s.p.addScaledVector(s.v, dt);
      if (s.p.y < s.floor + 0.04) { s.p.y = s.floor + 0.04; s.v.multiplyScalar(0.4); s.v.y = Math.abs(s.v.y) * 0.3; }
      else { s.r.x += dt * 8; s.r.y += dt * 6; }
      const k = s.life < 0.5 ? s.life / 0.5 : 1;
      m.compose(s.p, q.setFromEuler(s.r), sc.setScalar(s.s * k));
      this.shells.setMatrixAt(i, m);
      if (s.life <= 0) this.shells.setMatrixAt(i, m.makeScale(0, 0, 0));
    }
    if (any) this.shells.instanceMatrix.needsUpdate = true;
    let tr = false;
    for (let i = 0; i < this.tracerMax; i++) {
      const d = this.tracerData[i];
      if (d.life <= 0) continue;
      d.life -= dt; tr = true;
      if (d.life <= 0) this.tracers.setMatrixAt(i, m.makeScale(0, 0, 0));
    }
    if (tr) this.tracers.instanceMatrix.needsUpdate = true;
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.m.scale.setScalar(1 + (1.2 - r.life) * 14);
      r.m.material.opacity = Math.max(0, r.life / 1.2);
      if (r.life <= 0) { this.gfx.scene.remove(r.m); r.m.geometry.dispose(); this.rings.splice(i, 1); }
    }
    // Partículas de ambiente que siguen a la cámara.
    if (this.ambient) {
      const p = this.ambient.userData, cam = this.gfx.camera.getWorldPosition(new THREE.Vector3());
      const a = this.ambient.geometry.attributes.position, arr = a.array, half = p.area / 2;
      const t = performance.now() * 0.001;
      for (let i = 0; i < a.count; i++) {
        let x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
        if (p.snow) { y += p.speed * dt; x += Math.sin(t + i) * 0.3 * dt; }
        else { x += p.speed * dt * (0.5 + (i % 5) * 0.2); y += Math.sin(t * 0.7 + i) * 0.2 * dt; }
        if (x - cam.x > half) x -= p.area; if (x - cam.x < -half) x += p.area;
        if (z - cam.z > half) z -= p.area; if (z - cam.z < -half) z += p.area;
        if (y < cam.y - 3) y += 15; if (y > cam.y + 12) y -= 15;
        arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
      }
      a.needsUpdate = true;
    }
    for (const c of this.clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 160) c.position.x = -160; }
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }
}
