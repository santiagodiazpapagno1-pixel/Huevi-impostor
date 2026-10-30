// Arranque, menús, sala de espera, bucle principal e instalación como app (PWA).

import * as THREE from 'three';
import { MAP_LIST, MODES, RULES, BOT_NAMES, PHRASES, ROLE_COLORS, VERSION } from './config.js';
import { Graphics } from './graphics.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI, esc } from './ui.js';
import { Net } from './net.js';
import { audio } from './audio.js';
import { buildMap } from './maps.js';
import { VictoryScene } from './victory.js';

const $ = (id) => document.getElementById(id);
const screens = ['loading', 'menu', 'setup', 'online', 'lobby', 'settings', 'howto', 'installIos'];
const MAP_COLORS = { ciudad: '#4f4a46', selva: '#2f5e2a', desierto: '#b48a4f', flotante: '#5f8fc4', montana: '#5d6b74' };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ---------- Ajustes ----------
const DEFAULTS = { master: 0.8, sfx: 0.9, music: 0.45, musicOn: true, sensitivity: 1, quality: 'auto', btnScale: 1, btnOpacity: 0.75, leftHanded: false, name: '' };
const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('chk-settings') || '{}')); } catch { /* almacenamiento no disponible */ }
const saveSettings = () => { try { localStorage.setItem('chk-settings', JSON.stringify(settings)); } catch { /* nada */ } };

let gfx, ui, input, victory;
let game = null, net = null, preview = null;
let lobby = null;           // estado de la sala (dueño o invitado)
let lastCfg = null;
let settingsReturn = 'menu';

function show(id) {
  for (const s of screens) $(s).classList.toggle('active', s === id);
  if (id !== 'loading') audio.play('ui');
}

function modal(text) {
  $('modalText').textContent = text;
  $('modal').hidden = false;
}
$('modalOk').onclick = () => { $('modal').hidden = true; };

function applySettings() {
  document.body.classList.toggle('zurdo', !!settings.leftHanded);
  document.body.style.setProperty('--bs', settings.btnScale);
  document.body.style.setProperty('--bo', settings.btnOpacity);
  audio.setVolumes({ master: settings.master, sfx: settings.sfx, music: settings.musicOn ? settings.music : 0 });
}

// ---------- Carga ----------
async function boot() {
  const bar = $('loadBar'), txt = $('loadText');
  const step = async (p, t) => { bar.style.width = p + '%'; txt.textContent = t; await new Promise((r) => setTimeout(r, 30)); };
  if (isTouch) document.body.classList.add('touch');
  applySettings();
  await step(10, 'Preparando el motor 3D…');
  gfx = new Graphics($('c'), settings.quality);
  ui = new UI();
  input = new Input($('c'), settings);
  victory = new VictoryScene(gfx.renderer);
  ui.handlers.matchEnd = onMatchEnd;
  await step(35, 'Cocinando texturas…');
  await document.fonts?.ready;
  await step(60, 'Armando el escenario…');
  startPreview('flotante');
  await step(85, 'Calentando la sartén…');
  gfx.renderer.compile(gfx.scene, gfx.camera);
  await step(100, '¡Listo!');
  setupMenus();
  show('menu');
  requestAnimationFrame(frame);
  registerSW();
}

// Fondo del menú: un mapa con cámara girando.
function startPreview(id) {
  stopPreview();
  const m = buildMap(id);
  gfx.scene.add(m.group);
  gfx.setEnvironment(m.env);
  if (m.clouds) gfx.effects.addClouds();
  preview = { map: m, t: 0 };
}
function stopPreview() {
  if (!preview) return;
  gfx.scene.remove(preview.map.group);
  gfx.effects.setAmbient(null);
  preview = null;
}

// ---------- Bucle ----------
let last = performance.now();
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  if (victory.active) victory.render(dt);
  else if (game) { game.update(dt); gfx.render(dt); }
  else if (preview) {
    preview.t += dt;
    const a = preview.t * 0.06;
    gfx.camera.position.set(Math.cos(a) * 46, 16 + Math.sin(preview.t * 0.2) * 3, Math.sin(a) * 34);
    gfx.camera.lookAt(0, 0, 0);
    gfx.followShadow(new THREE.Vector3());
    gfx.render(dt);
  }
  requestAnimationFrame(frame);
}

// ---------- Menús ----------
const sel = { soloMap: 'ciudad', soloSize: 5 };

function mapCards(container, current, onPick, disabled) {
  container.innerHTML = '';
  for (const m of MAP_LIST) {
    const b = document.createElement('button');
    b.className = 'map-card' + (m.id === current ? ' sel' : '');
    b.style.setProperty('--mapbg', MAP_COLORS[m.id]);
    b.innerHTML = `<b>${m.name}</b><small>${m.desc}</small>`;
    b.disabled = !!disabled;
    b.onclick = () => onPick(m.id);
    container.appendChild(b);
  }
}

function stepper(container, value, min, max, onChange, disabled) {
  container.innerHTML = '';
  const minus = document.createElement('button'), plus = document.createElement('button'), lbl = document.createElement('b');
  minus.textContent = '−'; plus.textContent = '+';
  lbl.textContent = `${value} vs ${value}`;
  minus.disabled = plus.disabled = !!disabled;
  minus.onclick = () => onChange(Math.max(min, value - 1));
  plus.onclick = () => onChange(Math.min(max, value + 1));
  container.append(minus, lbl, plus);
}

function playerName() {
  const n = ($('playerName').value || '').trim().slice(0, 14);
  return n || 'Huevito';
}

function setupMenus() {
  $('playerName').value = settings.name || '';
  $('playerName').addEventListener('change', () => { settings.name = playerName(); saveSettings(); });
  document.addEventListener('pointerdown', () => { audio.unlock(); if (!audio.musicOn && settings.musicOn && !game) audio.startMusic('menu'); }, { once: false });

  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => {
    const go = b.dataset.go;
    if (go === 'solo') { renderSolo(); show('setup'); }
    else if (go === 'coop' || go === 'privada') openOnline(go);
    else if (go === 'settings') { settingsReturn = 'menu'; renderSettings(); show('settings'); }
    else show(go);
  }));

  $('soloStart').onclick = () => {
    settings.name = playerName(); saveSettings();
    const cfg = { mode: 'solo', map: sel.soloMap, size: sel.soloSize, roster: makeRoster([{ id: 'yo', name: settings.name }], sel.soloSize, 'solo') };
    startGame(cfg, 'yo', true);
  };

  // Ajustes.
  $('settingsBack').onclick = () => { if (settingsReturn === 'pause') { $('settings').classList.remove('active'); $('pause').hidden = false; } else show('menu'); };
  document.querySelectorAll('[data-set]').forEach((el) => {
    const k = el.dataset.set;
    const ev = el.type === 'range' ? 'input' : 'change';
    el.addEventListener(ev, () => {
      settings[k] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
      saveSettings(); applySettings();
      if (k === 'quality') gfx.setQuality(settings.quality);
      if (k === 'musicOn') { if (settings.musicOn) audio.startMusic(game ? 'battle' : 'menu'); else audio.stopMusic(); }
    });
  });

  // Online.
  $('createRoom').onclick = createRoom;
  $('joinRoom').onclick = joinRoom;
  $('joinCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
  $('leaveLobby').onclick = leaveOnline;
  $('copyCode').onclick = () => { navigator.clipboard?.writeText(lobby?.code || '').then(() => toastLobby('Código copiado')).catch(() => toastLobby(lobby?.code || '')); };
  $('shareCode').onclick = () => {
    const text = `¡Sumate a mi sala de Counter Huevike! Código: ${lobby?.code}`;
    if (navigator.share) navigator.share({ title: 'Counter Huevike', text, url: location.href }).catch(() => {});
    else navigator.clipboard?.writeText(text + ' ' + location.href).then(() => toastLobby('Invitación copiada'));
  };
  $('startMatch').onclick = hostStart;
  $('shuffleTeams').onclick = () => { shuffleTeams(); broadcastLobby(); renderLobby(); };

  // Pausa.
  $('btnPause').addEventListener('pointerdown', (e) => { e.stopPropagation(); openPause(); });
  addEventListener('keydown', (e) => { if (e.code === 'Escape' && game && !game.ended && $('pause').hidden) openPause(); });
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && game && !game.ended && !isTouch && $('pause').hidden && !victory.active) openPause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && game && game.mode === 'solo' && !game.ended) openPause(); });
  $('resume').onclick = closePause;
  $('pauseSettings').onclick = () => { settingsReturn = 'pause'; renderSettings(); $('pause').hidden = true; $('settings').classList.add('active'); };
  $('quit').onclick = () => { $('pause').hidden = true; quitToMenu(); };

  // Final.
  $('endAgain').onclick = () => {
    if (!lastCfg) return;
    if (lastCfg.mode === 'solo') { const cfg = { ...lastCfg, roster: makeRoster([{ id: 'yo', name: settings.name || 'Huevito' }], lastCfg.size, 'solo') }; startGame(cfg, 'yo', true); }
    else if (net?.isHost) { endGameCleanup(); net.broadcast({ t: 'toLobby' }); lobby.inGame = false; show('lobby'); renderLobby(); broadcastLobby(); }
  };
  $('endMenu').onclick = () => quitToMenu();

  // Instalación.
  setupInstall();
  addEventListener('resize', () => { if (game) ui.buildMinimap(game); });
}

function renderSolo() {
  mapCards($('soloMaps'), sel.soloMap, (id) => { sel.soloMap = id; renderSolo(); });
  stepper($('soloSize'), sel.soloSize, RULES.minTeam, RULES.maxTeam, (v) => { sel.soloSize = v; renderSolo(); });
}

function renderSettings() {
  document.querySelectorAll('[data-set]').forEach((el) => {
    const v = settings[el.dataset.set];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  });
}

// ---------- Equipos ----------
function shuffled(a) { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// humans: [{id, name, team?}] -> roster completo con bots hasta "size" por equipo.
function makeRoster(humans, size, mode) {
  const roster = [];
  if (mode === 'solo') { const t = Math.random() < 0.5 ? 'A' : 'B'; roster.push({ ...humans[0], team: t }); }
  else if (mode === 'coop') { const t = Math.random() < 0.5 ? 'A' : 'B'; humans.forEach((h) => roster.push({ id: h.id, name: h.name, team: t })); }
  else humans.forEach((h) => roster.push({ id: h.id, name: h.name, team: h.team }));
  const names = shuffled(BOT_NAMES);
  let n = 0;
  for (const team of ['A', 'B']) {
    while (roster.filter((r) => r.team === team).length < size) roster.push({ id: 'bot' + n, name: names[n++ % names.length], team, bot: true });
  }
  return roster;
}

// ---------- Partida ----------
function startGame(cfg, myId, authority) {
  endGameCleanup();
  stopPreview();
  lastCfg = cfg;
  $('end').hidden = true;
  for (const s of screens) $(s).classList.remove('active');
  gfx.camera.fov = gfx.baseFov; gfx.camera.updateProjectionMatrix();
  game = new Game({ gfx, ui, input, net: cfg.mode === 'solo' ? null : net, mapId: cfg.map, roster: cfg.roster, myId, authority, mode: cfg.mode, settings });
  ui.showHud(true);
  ui.buildMinimap(game);
  input.setEnabled(true);
  gfx.measuring = true;
  audio.unlock();
  if (settings.musicOn) audio.startMusic('battle'); else audio.stopMusic();
  goFullscreen();
}

function endGameCleanup() {
  victory.hide();
  $('end').hidden = true;
  if (game) { game.dispose(); game = null; }
  ui.showHud(false);
  input.setEnabled(false);
  speechSynthesis?.cancel?.();
}

function quitToMenu() {
  endGameCleanup();
  leaveOnline(true);
  startPreview(MAP_LIST[Math.floor(Math.random() * MAP_LIST.length)].id);
  show('menu');
  if (settings.musicOn) audio.startMusic('menu');
}

function openPause() {
  if (!game || game.ended) return;
  $('pause').hidden = false;
  $('pauseHint').textContent = game.mode === 'solo' ? 'La partida está en pausa.' : 'Partida online: el juego sigue corriendo mientras estás en este menú.';
  if (game.mode === 'solo') game.paused = true;
  input.setEnabled(false);
}
function closePause() {
  $('pause').hidden = true;
  $('settings').classList.remove('active');
  if (game) { game.paused = false; input.setEnabled(true); if (!isTouch) $('c').requestPointerLock?.(); }
}

function onMatchEnd(g, ev) {
  if (g !== game) return;
  input.setEnabled(false);
  ui.showHud(false);
  const me = g.me;
  const win = ev.winner === me.team;
  const other = me.team === 'A' ? 'B' : 'A';
  $('endTitle').textContent = win ? '¡VICTORIA!' : 'DERROTA';
  $('endTitle').className = win ? '' : 'lose';
  $('endScore').textContent = `${ev.score[me.team]} - ${ev.score[other]}`;
  $('endMessage').textContent = win ? PHRASES.matchWin : PHRASES.matchLose;
  const table = (team) => ev.stats.filter((s) => s.team === team).sort((a, b) => b.k - a.k)
    .map((s) => `<tr class="${s.id === me.id ? 'me' : ''}"><td>${esc(s.name)}${s.bot ? ' 🤖' : ''}</td><td>${s.k} elim.</td><td>${s.d} muertes</td></tr>`).join('');
  const kills = (team) => ev.stats.filter((s) => s.team === team).reduce((a, s) => a + s.k, 0);
  $('endTeamA').textContent = `Tu equipo · ${kills(me.team)} eliminaciones`;
  $('endTeamB').textContent = `Rivales · ${kills(other)} eliminaciones`;
  $('endA').innerHTML = table(me.team);
  $('endB').innerHTML = table(other);
  const solo = g.mode === 'solo';
  $('endAgain').hidden = !(solo || net?.isHost);
  $('endAgain').textContent = solo ? 'Jugar de nuevo' : 'Volver a la sala';
  $('endMenu').textContent = solo || net?.isHost ? 'Menú' : 'Salir';
  if (!solo && !net?.isHost) $('endMessage').textContent += '';
  if (document.pointerLockElement) document.exitPointerLock();
  // El Huevero Freyre aparece.
  victory.show(win, ROLE_COLORS[g.roleOf(win ? me.team : other)]);
  $('end').hidden = false;
  audio.stopMusic();
  audio.play('freyre');
  setTimeout(() => audio.play(win ? 'victory' : 'defeat'), 500);
  setTimeout(() => audio.speak(win ? PHRASES.matchWin : PHRASES.matchLose), 1300);
}

function goFullscreen() {
  const standalone = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || navigator.standalone;
  if (!isTouch || standalone || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape').catch(() => {})).catch(() => {});
}

// ---------- Online ----------
function openOnline(mode) {
  settings.name = playerName(); saveSettings();
  lobby = { mode };
  $('onlineTitle').textContent = MODES[mode].name;
  $('onlineHint').textContent = mode === 'coop'
    ? 'Creá una sala y pasales el código a tus amigos: juegan todos en el mismo equipo contra la IA.'
    : 'Creá una sala y pasales el código: se reparten al azar en dos equipos y juegan entre ustedes. La IA solo completa lugares vacíos.';
  $('onlineError').textContent = '';
  show('online');
}

async function createRoom() {
  $('onlineError').textContent = 'Creando sala…';
  net?.close();
  net = new Net();
  try {
    const code = await net.createRoom();
    lobby = { mode: lobby.mode, code, host: true, map: 'ciudad', size: lobby.mode === 'coop' ? 5 : 4, inGame: false,
      players: [{ id: 'host', name: settings.name || 'Dueño', team: 'A', host: true }] };
    net.on('message', onHostMessage).on('leave', onHostLeave).on('error', (m) => toastLobby(m));
    $('onlineError').textContent = '';
    show('lobby'); renderLobby();
  } catch (e) { $('onlineError').textContent = e.message; net = null; }
}

async function joinRoom() {
  const code = $('joinCode').value.trim().toUpperCase();
  if (code.length < 5) { $('onlineError').textContent = 'El código tiene 5 letras.'; return; }
  $('onlineError').textContent = 'Conectando…';
  net?.close();
  net = new Net();
  try {
    const myId = await net.joinRoom(code);
    lobby = { mode: lobby.mode, code, host: false, myId, players: [] };
    net.on('message', (_, m) => onGuestMessage(m)).on('hostLost', () => {
      if (game && !game.ended) { endGameCleanup(); }
      leaveOnline(true); show('menu'); modal('Se perdió la conexión con el dueño de la sala. La partida terminó.');
    });
    net.send({ t: 'hello', name: settings.name || 'Huevito', v: VERSION });
    $('onlineError').textContent = 'Esperando a la sala…';
  } catch (e) { $('onlineError').textContent = e.message; net = null; }
}

function leaveOnline(silent) {
  if (net) { try { if (net.isHost) net.broadcast({ t: 'closed' }); } catch { /* nada */ } net.close(); }
  net = null;
  if (!silent) show('menu');
  lobby = null;
}

function toastLobby(text) { $('lobbyStatus').textContent = text; setTimeout(() => { if (lobby) renderLobbyStatus(); }, 2200); }

function capacity() { return lobby.mode === 'coop' ? lobby.size : lobby.size * 2; }

function onHostMessage(id, m) {
  if (m.t === 'hello') {
    if (lobby.inGame) { net.sendTo(id, { t: 'busy' }); setTimeout(() => net.kick(id), 300); return; }
    if (lobby.players.length >= capacity()) { net.sendTo(id, { t: 'full' }); setTimeout(() => net.kick(id), 300); return; }
    const name = String(m.name || 'Huevito').slice(0, 14);
    const cA = lobby.players.filter((p) => p.team === 'A').length, cB = lobby.players.filter((p) => p.team === 'B').length;
    lobby.players.push({ id, name, team: lobby.mode === 'coop' ? 'A' : (cA <= cB ? 'A' : 'B') });
    net.sendTo(id, { t: 'welcome', id });
    broadcastLobby(); renderLobby();
    return;
  }
  if (game) game.onClientMessage(id, m);
}

function onHostLeave(id) {
  if (!lobby) return;
  const p = lobby.players.find((x) => x.id === id);
  lobby.players = lobby.players.filter((x) => x.id !== id);
  if (game && !game.ended) game.replaceWithBot(id);
  else if (p) { broadcastLobby(); renderLobby(); }
}

function shuffleTeams() {
  const ps = shuffled(lobby.players);
  ps.forEach((p, i) => { p.team = i % 2 === 0 ? 'A' : 'B'; });
  lobby.players = ps;
}

function broadcastLobby() {
  if (!net?.isHost) return;
  net.broadcast({ t: 'lobby', mode: lobby.mode, map: lobby.map, size: lobby.size, code: lobby.code, players: lobby.players });
}

function hostStart() {
  if (!net?.isHost) return;
  if (lobby.mode === 'privada') {
    // Reparto aleatorio y equilibrado entre los dos equipos.
    shuffleTeams();
  }
  const humans = lobby.players.map((p) => ({ id: p.id, name: p.name, team: p.team }));
  const roster = makeRoster(humans, lobby.size, lobby.mode);
  const cfg = { mode: lobby.mode, map: lobby.map, size: lobby.size, roster };
  lobby.inGame = true;
  net.broadcast({ t: 'start', cfg });
  startGame(cfg, 'host', true);
}

function onGuestMessage(m) {
  if (m.t === 'lobby') {
    Object.assign(lobby, { mode: m.mode, map: m.map, size: m.size, code: m.code, players: m.players });
    if (!game) { if (!$('lobby').classList.contains('active')) show('lobby'); renderLobby(); }
  } else if (m.t === 'start') {
    lobby.inGame = true;
    startGame(m.cfg, lobby.myId, false);
  } else if (m.t === 's') { if (game) game.applySnapshot(m); }
  else if (m.t === 'ev') { if (game) game.onHostEvents(m.l); }
  else if (m.t === 'toLobby') { endGameCleanup(); lobby.inGame = false; show('lobby'); renderLobby(); }
  else if (m.t === 'busy' || m.t === 'full' || m.t === 'closed' || m.t === 'kick') {
    const msg = { busy: 'La partida de esa sala ya empezó.', full: 'La sala está llena.', closed: 'El dueño cerró la sala.', kick: 'Te sacaron de la sala.' }[m.t];
    endGameCleanup(); leaveOnline(true); show('menu'); modal(msg);
  }
}

function renderLobby() {
  if (!lobby) return;
  const host = lobby.host;
  $('lobbyMode').textContent = MODES[lobby.mode].name;
  $('lobbyCode').textContent = lobby.code;
  mapCards($('lobbyMaps'), lobby.map, (id) => { lobby.map = id; broadcastLobby(); renderLobby(); }, !host);
  const minSize = Math.max(RULES.minTeam, lobby.mode === 'coop' ? lobby.players.length : Math.ceil(lobby.players.length / 2));
  stepper($('lobbySize'), lobby.size, minSize, RULES.maxTeam, (v) => { lobby.size = v; broadcastLobby(); renderLobby(); }, !host);
  $('lobbyInfo').textContent = host ? 'Vos elegís el mapa y el tamaño. La partida no arranca sola: la iniciás vos.' : 'El dueño elige mapa y tamaño, y arranca la partida.';
  const me = host ? 'host' : lobby.myId;
  const list = (team, title) => {
    const ul = $(team === 'A' ? 'teamA' : 'teamB');
    ul.dataset.title = title;
    const ps = lobby.players.filter((p) => (lobby.mode === 'coop' ? team === 'A' : p.team === team));
    let html = ps.map((p) => `<li class="${p.id === me ? 'me' : ''}"><span>${esc(p.name)}</span><span class="tag">${p.host ? '👑 dueño' : ''}</span></li>`).join('');
    const empty = lobby.size - ps.length;
    for (let i = 0; i < empty; i++) html += `<li class="empty">🤖 lugar libre (IA)</li>`;
    ul.innerHTML = html;
  };
  if (lobby.mode === 'coop') { list('A', 'AMIGOS'); $('teamB').dataset.title = 'IA RIVAL'; $('teamB').innerHTML = Array.from({ length: lobby.size }, () => '<li class="empty">🤖 IA</li>').join(''); }
  else { list('A', 'EQUIPO 1'); list('B', 'EQUIPO 2'); }
  $('lobbyCount').textContent = `(${lobby.players.length}/${capacity()} personas)`;
  $('shuffleTeams').hidden = !(host && lobby.mode === 'privada');
  $('startMatch').hidden = !host;
  renderLobbyStatus();
}

function renderLobbyStatus() {
  if (!lobby) return;
  const cap = capacity(), n = lobby.players.length;
  if (lobby.host) {
    const full = n >= cap;
    $('startMatch').textContent = full ? 'INICIAR PARTIDA' : 'INICIAR PARTIDA (la IA completa)';
    $('lobbyStatus').textContent = full ? '✔ Sala completa: ¡todo listo!' : `Esperando jugadores: ${n}/${cap}. Recomendado esperar a que se llene; si iniciás antes, los bots ocupan los lugares vacíos.`;
  } else $('lobbyStatus').textContent = `Conectados ${n}/${cap}. Esperando que el dueño inicie la partida…`;
}

// ---------- PWA ----------
let installPrompt = null;
function isStandalone() { return matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true; }
function setupInstall() {
  const btn = $('installBtn');
  const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (isStandalone()) { btn.hidden = true; return; }
  if (ios) btn.hidden = false;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; btn.hidden = false; });
  addEventListener('appinstalled', () => { btn.hidden = true; installPrompt = null; });
  btn.onclick = async () => {
    if (installPrompt) { installPrompt.prompt(); const r = await installPrompt.userChoice.catch(() => null); if (r?.outcome === 'accepted') btn.hidden = true; installPrompt = null; }
    else if (ios) show('installIos');
    else modal('Para instalar: abrí el menú del navegador (⋮) y elegí “Instalar app” o “Agregar a pantalla de inicio”.');
  };
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline */ });
}

window.__chk = { get game() { return game; }, get gfx() { return gfx; }, startGame, makeRoster, buildMap };
boot().catch((e) => { console.error(e); $('loadText').textContent = 'Error al cargar: ' + e.message; });
