// Sonido 100% generado con Web Audio API (sin archivos). Arranca después del primer toque.

import { WEAPONS } from './config.js';

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, sfx: 0.9, music: 0.45 };
    this.musicOn = false;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.sfx = this.ctx.createGain();
    this.music = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    this.sfx.connect(this.master); this.music.connect(this.master);
    this.master.connect(comp); comp.connect(this.ctx.destination);
    // Buffer de ruido reutilizable.
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.sfx.gain.value = this.vol.sfx;
    this.music.gain.value = this.vol.music * 0.5;
  }

  // Ganancia y paneo según la posición del sonido respecto al oyente.
  _spatial(pos, maxDist = 70) {
    if (!pos) return { gain: 1, pan: 0 };
    const L = this.listener;
    const dx = pos.x - L.x, dz = pos.z - L.z, dy = (pos.y ?? 0) - L.y;
    const dist = Math.hypot(dx, dy, dz);
    const gain = Math.max(0, 1 - dist / maxDist) ** 1.6;
    const ang = Math.atan2(dx, -dz) + L.yaw; // relativo a la mirada
    return { gain, pan: Math.max(-1, Math.min(1, Math.sin(ang))) * Math.min(1, dist / 4) };
  }

  _out(pos, maxDist) {
    const { gain, pan } = this._spatial(pos, maxDist);
    if (gain <= 0.002) return null;
    const g = this.ctx.createGain(); g.gain.value = gain;
    if (this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }

  _noise(out, t, dur, { freq = 1000, q = 0.8, type = 'lowpass', vol = 1, attack = 0.002, decay } = {}) {
    const src = this.ctx.createBufferSource(); src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + (decay ?? dur));
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    return f;
  }

  _tone(out, t, dur, { freq = 440, to, type = 'sine', vol = 0.5, attack = 0.005 } = {}) {
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }

  play(name, pos, opt = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    const out = this._out(pos, opt.maxDist ?? 70);
    if (!out) return;
    const fn = this.sounds[name];
    if (fn) fn.call(this, out, t, opt);
  }

  get sounds() {
    return {
      shot(out, t, { weapon = 'pistola' }) {
        const s = WEAPONS[weapon].sound;
        this._noise(out, t, s.len, { freq: 2600 * s.pitch, q: 0.6, vol: 0.9, decay: s.len });
        this._noise(out, t, s.len * 1.8, { freq: 500 * s.pitch, q: 1, vol: 0.8 * s.body, decay: s.len * 1.8 });
        this._tone(out, t, s.len, { freq: 160 * s.pitch, to: 45, type: 'triangle', vol: 0.6 * s.body });
        if (weapon === 'francotirador') this._noise(out, t + 0.05, 0.8, { freq: 300, vol: 0.3, decay: 0.8 });
      },
      hit(out, t) { this._tone(out, t, 0.06, { freq: 1700, type: 'square', vol: 0.12 }); },
      headshot(out, t) { this._tone(out, t, 0.08, { freq: 2300, type: 'square', vol: 0.14 }); this._tone(out, t + 0.05, 0.1, { freq: 3100, type: 'square', vol: 0.1 }); },
      impact(out, t) { this._noise(out, t, 0.07, { freq: 3500, type: 'bandpass', q: 2, vol: 0.25 }); },
      hurt(out, t) { this._tone(out, t, 0.18, { freq: 220, to: 110, type: 'sawtooth', vol: 0.18 }); },
      reload(out, t, { dur = 1.5 }) {
        this._noise(out, t, 0.05, { freq: 4000, type: 'highpass', vol: 0.4 });
        this._tone(out, t + 0.02, 0.04, { freq: 900, type: 'square', vol: 0.08 });
        this._noise(out, t + dur * 0.55, 0.05, { freq: 3000, type: 'highpass', vol: 0.35 });
        this._noise(out, t + dur - 0.12, 0.06, { freq: 2500, type: 'bandpass', q: 3, vol: 0.5 });
        this._tone(out, t + dur - 0.1, 0.05, { freq: 600, type: 'square', vol: 0.1 });
      },
      empty(out, t) { this._tone(out, t, 0.04, { freq: 1200, type: 'square', vol: 0.08 }); },
      step(out, t) { this._noise(out, t, 0.06, { freq: 380 + Math.random() * 200, q: 1, vol: 0.22 }); },
      jump(out, t) { this._noise(out, t, 0.1, { freq: 600, vol: 0.18 }); },
      land(out, t) { this._noise(out, t, 0.12, { freq: 260, vol: 0.35 }); },
      crack(out, t) { // eliminación: cáscara que se rompe
        for (let i = 0; i < 5; i++) this._noise(out, t + i * 0.025, 0.05, { freq: 2500 + Math.random() * 2500, type: 'bandpass', q: 4, vol: 0.5 });
        this._tone(out, t, 0.25, { freq: 300, to: 60, type: 'triangle', vol: 0.4 });
        this._noise(out, t + 0.05, 0.3, { freq: 700, vol: 0.4 }); // splash de yema
      },
      killding(out, t) { this._tone(out, t, 0.15, { freq: 880, type: 'triangle', vol: 0.25 }); this._tone(out, t + 0.08, 0.25, { freq: 1320, type: 'triangle', vol: 0.22 }); },
      pickup(out, t) { this._tone(out, t, 0.1, { freq: 520, type: 'triangle', vol: 0.3 }); this._tone(out, t + 0.07, 0.12, { freq: 780, type: 'triangle', vol: 0.3 }); },
      heal(out, t) { for (let i = 0; i < 4; i++) this._tone(out, t + i * 0.06, 0.12, { freq: 600 + i * 150, type: 'sine', vol: 0.2 }); },
      eggPick(out, t) { this._tone(out, t, 0.3, { freq: 200, to: 420, type: 'sawtooth', vol: 0.2 }); this._noise(out, t, 0.4, { freq: 300, vol: 0.2 }); },
      eggDrop(out, t) { this._tone(out, t, 0.3, { freq: 380, to: 140, type: 'sawtooth', vol: 0.22 }); this._noise(out, t + 0.05, 0.15, { freq: 500, vol: 0.4 }); },
      plant(out, t) { for (let i = 0; i < 3; i++) this._tone(out, t + i * 0.12, 0.1, { freq: 1000, type: 'square', vol: 0.18 }); this._tone(out, t + 0.4, 0.5, { freq: 300, to: 150, type: 'sawtooth', vol: 0.25 }); },
      beep(out, t, { hi }) { this._tone(out, t, 0.08, { freq: hi ? 1600 : 1100, type: 'square', vol: 0.16 }); },
      defuseTick(out, t) { this._tone(out, t, 0.04, { freq: 700, type: 'square', vol: 0.07 }); },
      defused(out, t) { this._tone(out, t, 0.6, { freq: 900, to: 200, type: 'sine', vol: 0.3 }); this._noise(out, t, 0.3, { freq: 2000, type: 'highpass', vol: 0.2 }); },
      explosion(out, t) {
        this._noise(out, t, 2.2, { freq: 900, vol: 1, decay: 2.2 });
        this._noise(out, t, 1.2, { freq: 160, q: 1.4, vol: 1, decay: 1.2 });
        this._tone(out, t, 1.2, { freq: 90, to: 25, type: 'sine', vol: 0.9 });
        this._tone(out, t + 0.3, 1.5, { freq: 120, to: 70, type: 'sawtooth', vol: 0.12 }); // "pedo" de huevo podrido
      },
      swap(out, t) { this._noise(out, t, 0.06, { freq: 3000, type: 'highpass', vol: 0.3 }); this._tone(out, t + 0.05, 0.04, { freq: 700, type: 'square', vol: 0.06 }); },
      respawn(out, t) { this._tone(out, t, 0.4, { freq: 300, to: 900, type: 'sine', vol: 0.2 }); },
      ui(out, t) { this._tone(out, t, 0.05, { freq: 900, type: 'triangle', vol: 0.15 }); },
      roundWin(out, t) { [523, 659, 784, 1047].forEach((f, i) => this._tone(out, t + i * 0.12, 0.35, { freq: f, type: 'triangle', vol: 0.3 })); },
      roundLose(out, t) { [392, 349, 311, 262].forEach((f, i) => this._tone(out, t + i * 0.18, 0.4, { freq: f, type: 'triangle', vol: 0.28 })); },
      victory(out, t) {
        const m = [523, 523, 659, 784, 659, 784, 1047, 1047];
        m.forEach((f, i) => { this._tone(out, t + i * 0.16, 0.3, { freq: f, type: 'square', vol: 0.12 }); this._tone(out, t + i * 0.16, 0.3, { freq: f / 2, type: 'triangle', vol: 0.2 }); });
        for (let i = 0; i < 8; i++) this._noise(out, t + 0.8 + i * 0.15, 0.08, { freq: 6000, type: 'highpass', vol: 0.15 });
      },
      defeat(out, t) { [330, 311, 294, 262, 196].forEach((f, i) => this._tone(out, t + i * 0.3, 0.5, { freq: f, type: 'sawtooth', vol: 0.12 })); },
      freyre(out, t) { // fanfarria de aparición del Huevero
        [392, 523, 659, 784].forEach((f, i) => this._tone(out, t + i * 0.09, 0.5, { freq: f, type: 'triangle', vol: 0.28 }));
        this._tone(out, t + 0.45, 0.25, { freq: 900, to: 1400, type: 'sine', vol: 0.2 });
      },
    };
  }

  // ---------- Música procedural ----------
  startMusic(kind = 'battle') {
    if (!this.ctx) return;
    this.stopMusic();
    this.musicOn = true;
    this.musicKind = kind;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step16 = 0;
    this.timer = setInterval(() => this._schedule(), 50);
  }

  stopMusic() { this.musicOn = false; clearInterval(this.timer); }

  _schedule() {
    if (!this.musicOn || !this.ctx) return;
    const bpm = this.musicKind === 'menu' ? 92 : 124;
    const spb = 60 / bpm / 4;
    const bass = this.musicKind === 'menu' ? [45, 45, 52, 50] : [40, 40, 43, 38];
    while (this.nextNote < this.ctx.currentTime + 0.2) {
      const t = this.nextNote, s = this.step16 % 16, bar = Math.floor(this.step16 / 16) % 4;
      const out = this.music;
      const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
      if (this.musicKind !== 'menu') {
        if (s % 4 === 0) this._tone(out, t, 0.18, { freq: 120, to: 40, type: 'sine', vol: 0.7 });      // bombo
        if (s === 4 || s === 12) this._noise(out, t, 0.15, { freq: 1800, type: 'bandpass', q: 0.7, vol: 0.35 }); // redoblante
        if (s % 2 === 1) this._noise(out, t, 0.03, { freq: 8000, type: 'highpass', vol: 0.12 });       // hi-hat
      } else if (s % 8 === 0) this._tone(out, t, 0.3, { freq: 90, to: 50, type: 'sine', vol: 0.4 });
      if (s % 2 === 0) {
        const n = bass[bar] + ([0, 0, 12, 0, 7, 0, 12, 10][(s / 2) | 0]);
        this._tone(out, t, spb * 1.8, { freq: midi(n), type: 'sawtooth', vol: 0.09 });
      }
      if (this.musicKind === 'menu' && (s === 0 || s === 6 || s === 10)) {
        const ch = [69, 72, 76, 74][bar];
        this._tone(out, t, spb * 5, { freq: midi(ch), type: 'triangle', vol: 0.08 });
      }
      this.nextNote += spb;
      this.step16++;
    }
  }

  speak(text) {
    try {
      if (!('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-AR'; u.rate = 1.05; u.pitch = 1.1; u.volume = this.vol.master;
      const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('es'));
      if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch { /* sin voz disponible */ }
  }
}

export const audio = new AudioSystem();
