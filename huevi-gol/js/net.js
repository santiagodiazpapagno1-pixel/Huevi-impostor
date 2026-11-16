// Conexión 1 contra 1 para el duelo online.
// Usa PeerJS (WebRTC) con el servidor público gratuito para encontrarse (0.peerjs.com).
// Para probar en una misma compu con dos pestañas: agregá ?red=local a la URL (usa BroadcastChannel).

const PREFIX = 'huevigol-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

// Servidor de salas propio opcional: ?servidor=https://mi-servidor.com:443/
function peerOpts() {
  const s = new URLSearchParams(location.search).get('servidor');
  if (!s) return { debug: 0 };
  const u = new URL(s.includes('://') ? s : 'https://' + s);
  const secure = u.protocol === 'https:';
  return { debug: 0, host: u.hostname, port: Number(u.port) || (secure ? 443 : 80), path: u.pathname || '/', secure };
}

function peerError(err) {
  const t = err?.type;
  if (t === 'peer-unavailable') return 'Esa sala no existe o ya se cerró.';
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Problema de conexión con el servidor de salas.';
  if (t === 'browser-incompatible') return 'Este navegador no soporta juego online (WebRTC).';
  return err?.message || 'Error de red.';
}

export class Link {
  constructor() {
    this.h = {};
    this.local = new URLSearchParams(location.search).get('red') === 'local';
    this.peer = null; this.conn = null; this.ch = null;
    this.connected = false; this.isHost = false; this.code = '';
  }

  on(ev, fn) { this.h[ev] = fn; return this; }
  _e(ev, ...a) { this.h[ev]?.(...a); }

  host() { this.isHost = true; return this.local ? this._hostLocal() : this._hostPeer(); }
  join(code) { this.isHost = false; code = code.trim().toUpperCase(); return this.local ? this._joinLocal(code) : this._joinPeer(code); }

  send(m) {
    if (!this.connected) return;
    if (this.ch) this.ch.postMessage(m);
    else if (this.conn?.open) this.conn.send(m);
  }

  close() {
    try { this.send({ t: 'bye' }); } catch { /* nada */ }
    this.connected = false;
    const conn = this.conn, peer = this.peer, ch = this.ch;
    this.conn = null; this.peer = null; this.ch = null;
    setTimeout(() => { try { conn?.close(); peer?.destroy(); ch?.close(); } catch { /* nada */ } }, 150);
  }

  // ---------- PeerJS ----------
  _hostPeer() {
    return new Promise((resolve, reject) => {
      if (typeof window.Peer !== 'function') return reject(new Error('No se pudo cargar el módulo online.'));
      let tries = 0;
      const attempt = () => {
        const code = randomCode();
        const peer = new window.Peer(PREFIX + code, peerOpts());
        let opened = false;
        const timer = setTimeout(() => { if (!opened) { peer.destroy(); reject(new Error('No hay respuesta del servidor de salas. Revisá tu conexión.')); } }, 12000);
        peer.on('open', () => {
          opened = true; clearTimeout(timer);
          this.peer = peer; this.code = code;
          peer.on('connection', (conn) => {
            if (this.conn) { conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); }); return; }
            this._bind(conn);
          });
          peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* sin red */ } });
          resolve(code);
        });
        peer.on('error', (err) => {
          clearTimeout(timer);
          if (err.type === 'unavailable-id' && tries++ < 4) { peer.destroy(); attempt(); return; }
          if (!opened) reject(new Error(peerError(err)));
        });
      };
      attempt();
    });
  }

  _bind(conn, onOpen) {
    this.conn = conn;
    conn.on('open', () => { this.connected = true; onOpen?.(); this._e('connected'); });
    conn.on('data', (m) => this._e('msg', m));
    const lost = () => { if (this.conn === conn && this.connected) { this.connected = false; this.conn = null; this._e('lost'); } };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  _joinPeer(code) {
    return new Promise((resolve, reject) => {
      if (typeof window.Peer !== 'function') return reject(new Error('No se pudo cargar el módulo online.'));
      const peer = new window.Peer(peerOpts());
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('No se encontró la sala. Revisá el código y que tu amigo siga en la sala.'), 15000);
      peer.on('open', () => {
        this.peer = peer; this.code = code;
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        this._bind(conn, () => { done = true; clearTimeout(timer); resolve(code); });
      });
      peer.on('error', (err) => { if (!done) fail(peerError(err)); });
    });
  }

  // ---------- Local (pruebas con dos pestañas) ----------
  _hostLocal() {
    const code = randomCode();
    this.code = code;
    this.ch = new BroadcastChannel('huevigol-' + code);
    this.ch.onmessage = (ev) => {
      const m = ev.data;
      if (m?.__join) { if (!this.connected) { this.connected = true; this.ch.postMessage({ __ok: 1 }); this._e('connected'); } return; }
      this._local(m);
    };
    return Promise.resolve(code);
  }

  _joinLocal(code) {
    return new Promise((resolve, reject) => {
      this.code = code;
      this.ch = new BroadcastChannel('huevigol-' + code);
      const timer = setTimeout(() => reject(new Error('No se encontró la sala.')), 3000);
      this.ch.onmessage = (ev) => {
        const m = ev.data;
        if (m?.__ok) { clearTimeout(timer); this.connected = true; this._e('connected'); resolve(code); return; }
        this._local(m);
      };
      this.ch.postMessage({ __join: 1 });
    });
  }

  _local(m) {
    if (!this.connected) return;
    if (m?.t === 'bye') { this.connected = false; this._e('lost'); return; }
    this._e('msg', m);
  }
}
