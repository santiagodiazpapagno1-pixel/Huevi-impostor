// Sonidos sintetizados con WebAudio (sin archivos): patada, silbato, red, palo y la hinchada.

let ac = null, master = null, crowd = null, noiseBuf = null, muted = false;
try { muted = localStorage.getItem('hueviGolMute') === '1'; } catch { /* nada */ }

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('hueviGolMute', m ? '1' : '0'); } catch { /* nada */ }
  if (master) master.gain.value = m ? 0 : 0.9;
}

export function audioUnlock() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ac = new AC();
  master = ac.createGain(); master.gain.value = muted ? 0 : 0.9; master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // murmullo de la hinchada
  const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.6;
  crowd = ac.createGain(); crowd.gain.value = 0.05;
  src.connect(bp).connect(crowd).connect(master); src.start();
}

function noise(dur, { type = 'lowpass', freq = 1000, q = 0.7, gain = 0.5, attack = 0.005 } = {}) {
  if (!ac) return;
  const t = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function tone(freq, dur, { type = 'sine', gain = 0.4, slide = 0 } = {}) {
  if (!ac) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function swell(level, dur) {
  if (!crowd) return;
  const t = ac.currentTime;
  crowd.gain.cancelScheduledValues(t);
  crowd.gain.setValueAtTime(crowd.gain.value, t);
  crowd.gain.linearRampToValueAtTime(level, t + 0.25);
  crowd.gain.linearRampToValueAtTime(0.05, t + dur);
}

export const sfx = {
  kick(power = 0.7) { tone(95, 0.12, { gain: 0.5 * power + 0.2, slide: -50 }); noise(0.07, { freq: 2500, gain: 0.25 * power }); },
  whistle(short = false) {
    if (!ac) return;
    const t = ac.currentTime, dur = short ? 0.28 : 0.55;
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 2950;
    const lfo = ac.createOscillator(); lfo.frequency.value = 38; const lg = ac.createGain(); lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.setValueAtTime(0.18, t + dur - 0.05); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g).connect(master); o.start(t); lfo.start(t); o.stop(t + dur); lfo.stop(t + dur);
  },
  net() { noise(0.35, { freq: 900, gain: 0.3 }); },
  post() { tone(1250, 0.5, { type: 'triangle', gain: 0.25 }); tone(1870, 0.35, { type: 'sine', gain: 0.12 }); },
  save() { noise(0.12, { freq: 700, gain: 0.45 }); },
  block() { noise(0.1, { freq: 500, gain: 0.45 }); },
  gold() { [880, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.25, { type: 'triangle', gain: 0.18 }), i * 70)); },
  cheer() { swell(0.42, 3.2); noise(2.6, { type: 'highpass', freq: 1400, gain: 0.12, attack: 0.2 }); },
  ooh() { swell(0.2, 1.6); },
};
