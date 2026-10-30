// Multijugador online con WebRTC (PeerJS). El dueño de la sala hace de servidor: simula la partida y los bots.
// Para encontrarse, los dispositivos usan el servidor público gratuito de PeerJS (0.peerjs.com).

const PREFIX = 'counterhuevike-v1-';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function peerAvailable() { return typeof window.Peer === 'function'; }

// Servidor de salas propio opcional: ?servidor=https://mi-servidor.com:443/ (por defecto, el público de PeerJS).
function peerOpts() {
  const s = new URLSearchParams(location.search).get('servidor');
  if (!s) return { debug: 0 };
  const u = new URL(s.includes('://') ? s : 'https://' + s);
  const secure = u.protocol === 'https:';
  return { debug: 0, host: u.hostname, port: Number(u.port) || (secure ? 443 : 80), path: u.pathname || '/', secure };
}

export class Net {
  constructor() {
    this.peer = null;
    this.conns = new Map();   // id -> DataConnection (solo dueño)
    this.host = null;         // conexión al dueño (solo invitado)
    this.isHost = false;
    this.handlers = {};
  }

  on(ev, fn) { this.handlers[ev] = fn; return this; }
  _emit(ev, ...a) { this.handlers[ev]?.(...a); }

  // Crear sala. Reintenta con otro código si está ocupado.
  createRoom() {
    return new Promise((resolve, reject) => {
      if (!peerAvailable()) return reject(new Error('No se pudo cargar PeerJS.'));
      let tries = 0;
      const attempt = () => {
        const code = randomCode();
        const peer = new window.Peer(PREFIX + code, peerOpts());
        let opened = false;
        const timer = setTimeout(() => { if (!opened) { peer.destroy(); reject(new Error('No hay respuesta del servidor de salas. Revisá tu conexión a internet.')); } }, 12000);
        peer.on('open', () => {
          opened = true; clearTimeout(timer);
          this.peer = peer; this.isHost = true; this.code = code;
          peer.on('connection', (conn) => this._acceptConn(conn));
          peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* sin conexión */ } });
          resolve(code);
        });
        peer.on('error', (err) => {
          clearTimeout(timer);
          if (err.type === 'unavailable-id' && tries++ < 4) { peer.destroy(); attempt(); return; }
          if (!opened) reject(new Error(this._msg(err)));
          else this._emit('error', this._msg(err));
        });
      };
      attempt();
    });
  }

  _acceptConn(conn) {
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
      conn.on('data', (m) => this._emit('message', conn.peer, m));
      conn.on('close', () => { this.conns.delete(conn.peer); this._emit('leave', conn.peer); });
      conn.on('error', () => { this.conns.delete(conn.peer); this._emit('leave', conn.peer); });
    });
  }

  // Unirse a una sala con su código.
  joinRoom(code) {
    return new Promise((resolve, reject) => {
      if (!peerAvailable()) return reject(new Error('No se pudo cargar PeerJS.'));
      code = code.trim().toUpperCase();
      const peer = new window.Peer(peerOpts());
      let done = false;
      const timer = setTimeout(() => { if (!done) { peer.destroy(); reject(new Error('No se encontró la sala. Revisá el código y que el dueño siga conectado.')); } }, 15000);
      peer.on('open', (id) => {
        this.peer = peer; this.myId = id;
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => {
          done = true; clearTimeout(timer);
          this.host = conn; this.code = code;
          conn.on('data', (m) => this._emit('message', 'host', m));
          conn.on('close', () => this._emit('hostLost'));
          resolve(id);
        });
        conn.on('error', () => { if (!done) { clearTimeout(timer); reject(new Error('No se pudo conectar con la sala.')); } });
      });
      peer.on('error', (err) => {
        if (done) { this._emit('error', this._msg(err)); return; }
        clearTimeout(timer); done = true;
        reject(new Error(err.type === 'peer-unavailable' ? 'Esa sala no existe o ya se cerró.' : this._msg(err)));
      });
    });
  }

  _msg(err) {
    const t = err?.type;
    if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Problema de conexión con el servidor de salas.';
    if (t === 'browser-incompatible') return 'Este navegador no soporta WebRTC.';
    return err?.message || 'Error de red.';
  }

  send(m) { if (this.host?.open) this.host.send(m); }
  sendTo(id, m) { const c = this.conns.get(id); if (c?.open) c.send(m); }
  broadcast(m) { for (const c of this.conns.values()) if (c.open) c.send(m); }
  kick(id) { const c = this.conns.get(id); if (c) { c.send({ t: 'kick' }); setTimeout(() => c.close(), 200); } }

  close() {
    this.handlers = {}; // salir a propósito no debe disparar avisos de "se perdió la conexión"
    try { for (const c of this.conns.values()) c.close(); this.host?.close(); this.peer?.destroy(); } catch { /* nada */ }
    this.conns.clear(); this.host = null; this.peer = null; this.isHost = false;
  }
}
