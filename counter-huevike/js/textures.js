// Texturas procedurales dibujadas en canvas (no hace falta descargar imágenes).

import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function noise(ctx, size, base, vari, count, rand, alpha = 0.25, rMax = 3) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    const v = vari[(rand() * vari.length) | 0];
    ctx.globalAlpha = alpha * (0.4 + rand() * 0.6);
    ctx.fillStyle = v;
    const r = 0.5 + rand() * rMax;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
  ctx.globalAlpha = 1;
}

const painters = {
  asfalto(ctx, s, R) {
    noise(ctx, s, '#4a4c50', ['#2f3134', '#5d6064', '#3c3e42', '#6b6d70'], 9000, R, 0.35, 2);
    ctx.strokeStyle = 'rgba(20,20,22,0.7)'; ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { // grietas
      ctx.beginPath(); let x = R() * s, y = R() * s; ctx.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (R() - 0.5) * 40; y += (R() - 0.5) * 40; ctx.lineTo(x, y); }
      ctx.stroke();
    }
  },
  vereda(ctx, s, R) {
    noise(ctx, s, '#8d8a84', ['#77746e', '#a29f98', '#6a6862'], 5000, R, 0.3, 2);
    ctx.strokeStyle = 'rgba(50,50,50,0.5)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * s / 4, 0); ctx.lineTo(i * s / 4, s); ctx.moveTo(0, i * s / 4); ctx.lineTo(s, i * s / 4); ctx.stroke(); }
  },
  ladrillo(ctx, s, R) {
    ctx.fillStyle = '#5b5550'; ctx.fillRect(0, 0, s, s);
    const rows = 16, bh = s / rows, bw = s / 6;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 7; c++) {
      const off = (r % 2) * bw / 2;
      const t = 0.75 + R() * 0.35;
      ctx.fillStyle = `rgb(${(128 * t) | 0},${(62 * t) | 0},${(48 * t) | 0})`;
      ctx.fillRect(c * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
    noise(ctx, s, 'rgba(0,0,0,0)', ['#000', '#fff'], 3000, R, 0.08, 2);
  },
  hormigon(ctx, s, R) {
    noise(ctx, s, '#9a968f', ['#87837c', '#aaa69f', '#7a776f', '#b5b1aa'], 7000, R, 0.3, 3);
    ctx.fillStyle = 'rgba(40,35,30,0.18)';
    for (let i = 0; i < 10; i++) ctx.fillRect(R() * s, R() * s * 0.2 + s * 0.8 * R(), 2 + R() * 3, 20 + R() * 60); // manchas
    ctx.strokeStyle = 'rgba(60,60,60,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, s - 2, s - 2);
  },
  ventanas(ctx, s, R) {
    noise(ctx, s, '#6e6a63', ['#5a5650', '#827d75'], 4000, R, 0.3, 3);
    const cols = 4, rows = 4, w = s / cols, h = s / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const lit = R();
      ctx.fillStyle = lit > 0.85 ? '#d9b36a' : lit > 0.5 ? '#1c2229' : '#2b333c';
      ctx.fillRect(c * w + w * 0.2, r * h + h * 0.2, w * 0.6, h * 0.55);
      if (lit < 0.3) { ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(c * w + w * 0.2, r * h + h * 0.2); ctx.lineTo(c * w + w * 0.8, r * h + h * 0.75); ctx.stroke(); }
    }
  },
  arena(ctx, s, R) {
    noise(ctx, s, '#d8b47a', ['#c89f63', '#e6c78f', '#b98e55', '#f0d7a4'], 9000, R, 0.3, 2);
    ctx.strokeStyle = 'rgba(160,115,60,0.25)'; ctx.lineWidth = 3;
    for (let i = 0; i < 9; i++) {
      ctx.beginPath(); const y = R() * s;
      for (let x = 0; x <= s; x += 8) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 6);
      ctx.stroke();
    }
  },
  adobe(ctx, s, R) {
    noise(ctx, s, '#c49a6c', ['#b0855a', '#d4ab7c', '#a07650'], 6000, R, 0.35, 3);
    ctx.strokeStyle = 'rgba(110,70,40,0.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(R() * s, R() * s); ctx.lineTo(R() * s, R() * s); ctx.stroke(); }
  },
  pasto(ctx, s, R) {
    noise(ctx, s, '#3f7a33', ['#2f6527', '#4f8f3c', '#5d9c45', '#2a5420'], 9000, R, 0.45, 2);
    ctx.lineWidth = 1;
    for (let i = 0; i < 1400; i++) {
      ctx.strokeStyle = R() > 0.5 ? 'rgba(110,170,70,0.5)' : 'rgba(25,60,20,0.5)';
      const x = R() * s, y = R() * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 3, y - 3 - R() * 4); ctx.stroke();
    }
  },
  tierra(ctx, s, R) {
    noise(ctx, s, '#6b5137', ['#5a432c', '#7d6043', '#4a3725', '#8a6c4c'], 8000, R, 0.4, 3);
  },
  piedra(ctx, s, R) {
    noise(ctx, s, '#7c7a76', ['#64625f', '#918e89', '#55534f', '#a29f99'], 8000, R, 0.4, 4);
    ctx.strokeStyle = 'rgba(40,40,40,0.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 7; i++) { ctx.beginPath(); const y = R() * s; ctx.moveTo(0, y); ctx.bezierCurveTo(s * 0.3, y + 10, s * 0.6, y - 10, s, y + 4); ctx.stroke(); }
  },
  musgo(ctx, s, R) {
    painters.piedra(ctx, s, R);
    for (let i = 0; i < 2500; i++) { ctx.globalAlpha = 0.35; ctx.fillStyle = R() > 0.5 ? '#3f6b2a' : '#5b8a3a'; ctx.fillRect(R() * s, R() * s, 3, 3); }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(30,30,30,0.5)'; ctx.lineWidth = 3;
    for (let r = 1; r < 4; r++) { ctx.beginPath(); ctx.moveTo(0, r * s / 4); ctx.lineTo(s, r * s / 4); ctx.stroke(); }
  },
  madera(ctx, s, R) {
    ctx.fillStyle = '#7a5532'; ctx.fillRect(0, 0, s, s);
    const n = 8;
    for (let i = 0; i < n; i++) {
      const t = 0.8 + R() * 0.3;
      ctx.fillStyle = `rgb(${(122 * t) | 0},${(85 * t) | 0},${(50 * t) | 0})`;
      ctx.fillRect(0, i * s / n + 1, s, s / n - 2);
      ctx.strokeStyle = 'rgba(60,35,15,0.35)';
      for (let k = 0; k < 4; k++) { ctx.beginPath(); const y = i * s / n + R() * s / n; ctx.moveTo(0, y); ctx.lineTo(s, y + (R() - 0.5) * 4); ctx.stroke(); }
    }
  },
  metal(ctx, s, R) {
    noise(ctx, s, '#8b939b', ['#7a828a', '#9ea6ad', '#6b737b'], 5000, R, 0.25, 2);
    ctx.strokeStyle = 'rgba(40,45,50,0.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, s / 2 - 4, s - 4); ctx.strokeRect(s / 2 + 2, 2, s / 2 - 4, s - 4);
    ctx.fillStyle = 'rgba(30,30,30,0.6)';
    for (const x of [8, s / 2 - 8, s / 2 + 8, s - 8]) for (const y of [8, s - 8]) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); }
  },
  futurista(ctx, s, R) {
    noise(ctx, s, '#e6ecf2', ['#d5dde5', '#f5f8fb', '#c8d2dc'], 3000, R, 0.25, 2);
    ctx.strokeStyle = 'rgba(120,140,160,0.5)'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, i * s / 4); ctx.lineTo(s, i * s / 4); ctx.stroke(); }
    ctx.fillStyle = 'rgba(80,220,255,0.55)'; ctx.fillRect(0, s / 2 - 3, s, 6);
  },
  baldosa(ctx, s, R) {
    ctx.fillStyle = '#c9d3dc'; ctx.fillRect(0, 0, s, s);
    const n = 4;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const t = 0.9 + R() * 0.12;
      ctx.fillStyle = `rgb(${(200 * t) | 0},${(212 * t) | 0},${(222 * t) | 0})`;
      ctx.fillRect(i * s / n + 2, j * s / n + 2, s / n - 4, s / n - 4);
    }
  },
  nieve(ctx, s, R) {
    noise(ctx, s, '#e9eef3', ['#d6dee6', '#ffffff', '#c7d1db'], 6000, R, 0.35, 3);
  },
  bolsas(ctx, s, R) {
    ctx.fillStyle = '#6d6448'; ctx.fillRect(0, 0, s, s);
    const rows = 6, h = s / rows;
    for (let r = 0; r < rows; r++) for (let c = -1; c < 4; c++) {
      const off = (r % 2) * s / 8;
      ctx.fillStyle = R() > 0.5 ? '#8b7f5a' : '#7c7150';
      ctx.beginPath(); ctx.roundRect(c * s / 4 + off + 2, r * h + 2, s / 4 - 4, h - 4, 8); ctx.fill();
    }
  },
  zona(ctx, s) { // marca de la zona de instalación
    ctx.clearRect(0, 0, s, s);
    const c = s / 2;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = s * 0.05;
    ctx.beginPath(); ctx.arc(c, c, s * 0.44, 0, 7); ctx.stroke();
    ctx.setLineDash([s * 0.06, s * 0.05]); ctx.lineWidth = s * 0.025;
    ctx.beginPath(); ctx.arc(c, c, s * 0.34, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `bold ${s * 0.2}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff'; ctx.fillText('🥚', c, c);
  },
  nube(ctx, s, R) {
    ctx.clearRect(0, 0, s, s);
    for (let i = 0; i < 22; i++) {
      const x = s * (0.2 + R() * 0.6), y = s * (0.35 + R() * 0.3), r = s * (0.1 + R() * 0.16);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    }
  },
  particula(ctx, s) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  },
  hojas(ctx, s, R) {
    noise(ctx, s, '#2f6a2a', ['#245a20', '#3e7f34', '#4f9440', '#1d4a19'], 7000, R, 0.6, 5);
  },
};

export function getTexture(name, { repeat = true, size = 256, srgb = true } = {}) {
  const key = name + size;
  if (cache.has(key)) return cache.get(key);
  const [c, ctx] = canvas(size);
  painters[name](ctx, size, rng(name.length * 7919 + size));
  const tex = new THREE.CanvasTexture(c);
  if (repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; }
  tex.anisotropy = 4;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

// Cartel con texto (para la Huevería Freyre y carteles del mapa).
export function textTexture(text, { w = 512, h = 128, bg = '#7a1f12', fg = '#ffe9b8', font = 'bold 64px Impact, sans-serif', border = '#ffd36b' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = border; ctx.lineWidth = 8; ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
