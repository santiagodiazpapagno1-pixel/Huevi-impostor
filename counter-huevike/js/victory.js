// Escena final: el Huevero Freyre frente a la Huevería Freyre festejando (o consolando).

import * as THREE from 'three';
import { createFreyre, animateFreyre, createHueveria, createPlayerEgg } from './models.js';
import { ROLE_COLORS } from './config.js';

export class VictoryScene {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b7e0);
    this.scene.fog = new THREE.Fog(0x87b7e0, 12, 40);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6a5a4a, 1.2);
    const sun = new THREE.DirectionalLight(0xffe2b8, 2.4);
    sun.position.set(-4, 8, -6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6 });
    this.scene.add(hemi, sun);
    this.scene.add(createHueveria());
    this.freyre = createFreyre();
    this.freyre.rotation.y = Math.PI; // mirando a cámara (-z)
    this.freyre.rotation.y = 0;
    this.scene.add(this.freyre);
    this.eggs = [];
    this.confetti = null;
    this.t = 0;
    this.active = false;
  }

  show(win, color) {
    this.win = win; this.t = 0; this.active = true;
    for (const e of this.eggs) this.scene.remove(e);
    this.eggs = [];
    // Huevitos del equipo ganador festejando al lado del Huevero.
    for (let i = 0; i < 4; i++) {
      const e = createPlayerEgg(color);
      e.scale.setScalar(0.55);
      e.position.set(-2.4 + (i % 2) * 0.8 - (i > 1 ? 0.4 : 0), 0, -0.4 - Math.floor(i / 2) * 0.7);
      e.userData.ph = Math.random() * 6;
      this.scene.add(e); this.eggs.push(e);
    }
    if (this.confetti) this.scene.remove(this.confetti);
    if (win) {
      const n = 260, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      const pal = [0xffc531, 0xff5249, 0x3d8bff, 0x9dff4a, 0xffffff].map((c) => new THREE.Color(c));
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 8; pos[i * 3 + 1] = Math.random() * 7; pos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
        const c = pal[i % pal.length]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.confetti = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
      this.scene.add(this.confetti);
    } else this.confetti = null;
  }

  hide() { this.active = false; }

  render(dt) {
    if (!this.active) return;
    this.t += dt;
    const r = this.renderer;
    const w = innerWidth, h = innerHeight;
    this.camera.aspect = w / h;
    // Encuadre: más cerca en celulares verticales.
    const portrait = h > w;
    const intro = Math.min(1, this.t / 1.6), ease = 1 - Math.pow(1 - intro, 3);
    const dist = (portrait ? 7.5 : 5.2) + (1 - ease) * 3;
    this.camera.position.set(Math.sin(this.t * 0.25) * 0.6 - 0.6, 1.5 + (1 - ease) * 1.5, -dist);
    this.camera.lookAt(-0.6, portrait ? 1.6 : 1.25, 0);
    this.camera.updateProjectionMatrix();
    animateFreyre(this.freyre, this.t, this.win ? 'win' : 'lose');
    this.eggs.forEach((e, i) => {
      const jump = this.win ? Math.abs(Math.sin(this.t * 5 + e.userData.ph)) * 0.35 : 0;
      e.position.y = jump;
      e.rotation.y = Math.PI + Math.sin(this.t * 2 + i) * 0.4;
      e.rotation.z = this.win ? Math.sin(this.t * 8 + i) * 0.15 : 0.25;
    });
    if (this.confetti) {
      const p = this.confetti.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        let y = p.getY(i) - dt * (0.8 + (i % 7) * 0.15);
        if (y < 0) y = 7;
        p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(this.t * 2 + i) * dt * 0.3);
      }
      p.needsUpdate = true;
    }
    const prevExp = r.toneMappingExposure;
    r.toneMappingExposure = 1;
    r.render(this.scene, this.camera);
    r.toneMappingExposure = prevExp;
  }
}

export { ROLE_COLORS };
