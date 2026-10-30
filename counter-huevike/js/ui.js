// HUD, minimapa, mensajes, tabla y botones contextuales.

import { WEAPONS, RULES, ROLE_CSS } from './config.js';

const $ = (id) => document.getElementById(id);
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

export class UI {
  constructor() {
    this.el = {};
    for (const id of ['hud', 'touch', 'scoreMine', 'scoreTheirs', 'roundLabel', 'timer', 'roleTag', 'eggStatus', 'plantTimer', 'feed', 'toasts', 'banner', 'crosshair',
      'hitmarker', 'defuseBar', 'hpFill', 'hpText', 'eggIcon', 'weaponName', 'ammo', 'reserve', 'slots', 'reloadBar', 'damage', 'scope', 'death', 'deathBy', 'deathTimer',
      'board', 'boardBody', 'minimap', 'ctxPick', 'ctxPlant', 'ctxDefuse', 'ctxWeapon', 'topbar']) this.el[id] = $(id);
    this.cache = {};
    this.mm = this.el.minimap.getContext('2d');
    this.mmImage = null;
    this.handlers = {};
    this.boardOpen = false;
    this.bannerTimer = 0;
    addEventListener('keydown', (e) => { if (e.code === 'Tab' && !this.el.hud.hidden) { e.preventDefault(); this.boardOpen = true; } });
    addEventListener('keyup', (e) => { if (e.code === 'Tab') this.boardOpen = false; });
    $('btnBoard').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.boardOpen = !this.boardOpen; });
  }

  set(key, el, prop, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    if (prop === 'text') el.textContent = val;
    else if (prop === 'hidden') el.hidden = val;
    else if (prop === 'html') el.innerHTML = val;
    else el.style.setProperty(prop, val);
  }

  showHud(v) {
    this.el.hud.hidden = !v;
    this.el.touch.hidden = !v;
    this.cache = {};
    if (!v) { this.el.feed.innerHTML = ''; this.el.toasts.innerHTML = ''; this.el.banner.hidden = true; this.hideDeath(); }
  }

  // Imagen del minimapa a partir de la grilla de navegación.
  buildMinimap(game) {
    const w = game.world, nav = w.nav;
    const c = document.createElement('canvas');
    c.width = nav.w; c.height = nav.d;
    const x = c.getContext('2d');
    const img = x.createImageData(nav.w, nav.d);
    let maxF = 0.1;
    for (let i = 0; i < nav.floor.length; i++) if (nav.walk[i] && nav.floor[i] > maxF) maxF = nav.floor[i];
    for (let i = 0; i < nav.floor.length; i++) {
      const f = nav.floor[i];
      let r, g, b, a = 255;
      if (f === -Infinity) { r = g = b = 0; a = 0; }
      else if (nav.walk[i]) { const k = 70 + (f / maxF) * 60; r = k + 10; g = k + 5; b = k - 5; }
      else { r = 25; g = 22; b = 18; a = 230; }
      img.data.set([r, g, b, a], i * 4);
    }
    x.putImageData(img, 0, 0);
    this.mmImage = c;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const cw = this.el.minimap.clientWidth || 170, ch = this.el.minimap.clientHeight || 108;
    this.el.minimap.width = cw * dpr; this.el.minimap.height = ch * dpr;
    this.mmScale = dpr;
  }

  drawMinimap(game) {
    if (!this.mmImage) return;
    const ctx = this.mm, cv = this.el.minimap, me = game.me;
    const W = cv.width, H = cv.height;
    const B = game.world.bounds;
    const sx = W / (B.maxX - B.minX), sz = H / (B.maxZ - B.minZ);
    const flip = me.team === 'B'; // la base propia siempre a la izquierda
    const tx = (x) => (flip ? (B.maxX - x) : (x - B.minX)) * sx;
    const tz = (z) => (flip ? (B.maxZ - z) : (z - B.minZ)) * sz;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (flip) { ctx.translate(W, H); ctx.rotate(Math.PI); }
    ctx.globalAlpha = 0.9;
    ctx.drawImage(this.mmImage, 0, 0, W, H);
    ctx.restore();
    const d = this.mmScale;
    // Bases.
    for (const team of ['A', 'B']) {
      const b = game.map.bases[team].pos;
      const role = game.roleOf(team);
      ctx.strokeStyle = ROLE_CSS[role]; ctx.lineWidth = 2 * d;
      ctx.fillStyle = role === 'atk' ? 'rgba(255,82,73,0.2)' : 'rgba(61,139,255,0.25)';
      ctx.beginPath(); ctx.arc(tx(b.x), tz(b.z), RULES.plantRadius * sx * 1.2, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${8 * d}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(team === me.team ? 'TU BASE' : 'RIVAL', tx(b.x), tz(b.z) - RULES.plantRadius * sx * 1.4);
    }
    // Compañeros.
    for (const p of game.players) {
      if (p === me || p.team !== me.team || !p.alive) continue;
      ctx.fillStyle = ROLE_CSS[game.roleOf(p.team)];
      ctx.beginPath(); ctx.arc(tx(p.pos.x), tz(p.pos.z), 2.6 * d, 0, 7); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1 * d; ctx.stroke();
    }
    // Huevo.
    const e = game.egg;
    const blink = e.state !== 'planted' || Math.sin(performance.now() / 120) > 0;
    if (blink) {
      ctx.fillStyle = '#9dff4a'; ctx.strokeStyle = '#1d3a07'; ctx.lineWidth = 1.5 * d;
      ctx.beginPath(); ctx.ellipse(tx(e.pos.x), tz(e.pos.z), 3.4 * d, 4.4 * d, 0, 0, 7); ctx.fill(); ctx.stroke();
    }
    // Yo.
    const a = me.yaw + (flip ? Math.PI : 0);
    ctx.save(); ctx.translate(tx(me.pos.x), tz(me.pos.z)); ctx.rotate(-a);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1 * d;
    ctx.beginPath(); ctx.moveTo(0, -6 * d); ctx.lineTo(4 * d, 4 * d); ctx.lineTo(0, 2 * d); ctx.lineTo(-4 * d, 4 * d); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  hud(game) {
    const me = game.me, s = game.state, el = this.el;
    if (!me) return;
    const myRole = game.roleOf(me.team);
    const other = me.team === 'A' ? 'B' : 'A';
    const theirRole = myRole === 'atk' ? 'def' : 'atk';
    this.set('mineC', el.topbar, '--mine', ROLE_CSS[myRole]);
    this.set('theirC', el.topbar, '--theirs', ROLE_CSS[theirRole]);
    this.set('sm', el.scoreMine, 'text', String(s.score[me.team]));
    this.set('st', el.scoreTheirs, 'text', String(s.score[other]));
    const label = s.spec.sudden ? 'MUERTE SÚBITA' : s.spec.half ? `R3 · MITAD ${s.spec.half} (${s.halves[me.team]}-${s.halves[other]})` : `RONDA ${s.spec.round}`;
    this.set('rl', el.roundLabel, 'text', label);
    const timeTxt = s.phase === 'intermission' ? fmt(s.inter) : s.overtime ? 'EXTRA' : fmt(s.time);
    this.set('tm', el.timer, 'text', timeTxt);
    this.set('tmc', el.timer, 'color', s.overtime ? '#9dff4a' : (s.phase === 'live' && s.time < 30 ? '#ff8a65' : ''));
    this.set('role', el.roleTag, 'html', `<span style="color:${ROLE_CSS[myRole]}">${myRole === 'atk' ? 'ATACÁS' : 'DEFENDÉS'}</span> · Elim. ${s.pk[me.team]}-${s.pk[other]}`);
    // Estado del huevo.
    const e = game.egg;
    let eggTxt = '';
    if (e.state === 'loose') eggTxt = e.pos.distanceTo(game.map.center) < 1 ? '🥚 Huevo en el centro del mapa' : '🥚 Huevo tirado en el piso';
    else if (e.state === 'carried') { const c = game.byId(e.carrier); eggTxt = c === me ? '🥚 ¡Tenés el huevo!' + (myRole === 'atk' ? ' Llevalo al centro de la base rival' : '') : c && c.team === me.team ? `🥚 Lo lleva ${c.name}` : '🥚 ¡Lo tiene el rival!'; }
    else if (e.state === 'planted') eggTxt = myRole === 'def' ? '🥚 ¡Desactivalo en tu base!' : '🥚 Instalado: defendelo';
    this.set('egg', el.eggStatus, 'text', eggTxt);
    const planted = e.state === 'planted';
    this.set('pt', el.plantTimer, 'hidden', !planted);
    if (planted) {
      this.set('ptv', el.plantTimer.lastElementChild, 'text', String(Math.max(0, Math.ceil(e.timer))));
      el.plantTimer.classList.toggle('danger', e.timer < 10);
    }
    const defusingMe = planted && e.defuser === me.id;
    this.set('db', el.defuseBar, 'hidden', !(planted && e.defuser));
    if (planted && e.defuser) {
      el.defuseBar.querySelector('i').style.width = `${(e.progress / RULES.defuseTime) * 100}%`;
      el.defuseBar.querySelector('small').textContent = defusingMe ? 'DESACTIVANDO… NO SUELTES' : 'UN DEFENSOR ESTÁ DESACTIVANDO';
    }
    // Vida y arma.
    const hp = Math.max(0, Math.ceil(me.hp));
    this.set('hp', el.hpText, 'text', String(hp));
    this.set('hpw', el.hpFill, 'width', hp + '%');
    el.hpFill.classList.toggle('low', hp < 35);
    this.set('eggI', el.eggIcon, 'hidden', !(e.state === 'carried' && e.carrier === me.id));
    const w = me.weapons[me.cur];
    if (w) {
      const W = WEAPONS[w.id];
      this.set('wn', el.weaponName, 'text', W.name.toUpperCase());
      this.set('am', el.ammo, 'text', String(w.mag));
      el.ammo.classList.toggle('low', w.mag <= Math.ceil(W.mag * 0.25));
      this.set('rs', el.reserve, 'text', '/ ' + (w.reserve === Infinity ? '∞' : w.reserve));
      this.set('sl', el.slots, 'html', me.weapons.map((_, i) => `<i class="${i === me.cur ? 'on' : ''}"></i>`).join(''));
      const rel = me.reloadEnd > 0 && game.authority !== undefined ? me.reloadEnd : 0;
      this.set('rb', el.reloadBar, 'hidden', !rel);
      if (rel) el.reloadBar.firstElementChild.style.width = `${(1 - (rel - game.now) / W.reload) * 100}%`;
      // Mira dinámica.
      const sp = Math.min(30, ((W.hipSpread && !me.aiming ? W.hipSpread : W.spread) * (me.aiming ? 0.55 : 1) + me.bloom) * 500 * (me.moveSpeed > 1.5 ? 1.5 : 1));
      el.crosshair.style.setProperty('--spread', sp.toFixed(1) + 'px');
      const scoped = me.aiming && w.id === 'francotirador' && me.alive;
      this.set('sc', el.scope, 'hidden', !scoped);
      el.crosshair.classList.toggle('hide', scoped || !me.alive);
    }
    // Muerte.
    if (!me.alive) {
      const left = game.authority ? me.respawnAt - game.now : (me.respawnIn ?? 0);
      this.set('dt', el.deathTimer, 'text', left > 0 ? String(Math.ceil(left)) : '…');
    }
    // Botones contextuales.
    const c = game.context || {};
    this.set('cp', el.ctxPick, 'hidden', !c.pick);
    this.set('cpl', el.ctxPlant, 'hidden', !c.plant);
    this.set('cd', el.ctxDefuse, 'hidden', !c.defuse);
    this.set('cw', el.ctxWeapon, 'hidden', !c.wpick);
    if (c.wpick) this.set('cwt', el.ctxWeapon, 'html', `AGARRAR<br>${WEAPONS[c.wpick.weapon].short}`);
    // Tabla.
    this.set('bo', el.board, 'hidden', !this.boardOpen);
    if (this.boardOpen) {
      const rows = [...game.players].sort((a, b) => (a.team === me.team ? 0 : 1) - (b.team === me.team ? 0 : 1) || b.kills - a.kills);
      el.boardBody.innerHTML = rows.map((p) => `<tr class="${game.roleOf(p.team)} ${p === me ? 'me' : ''}"><td>${esc(p.name)}${p.bot ? ' 🤖' : ''}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`).join('');
    }
    this.mmT = (this.mmT || 0) + 1;
    if (this.mmT % 3 === 0) this.drawMinimap(game);
  }

  toast(text, cls = 'info') {
    const d = document.createElement('div');
    d.className = 'toast ' + cls; d.textContent = text;
    this.el.toasts.appendChild(d);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => d.remove(), 2900);
  }

  banner(big, small, cls = 'info', secs = 3) {
    const b = this.el.banner;
    b.className = cls;
    b.querySelector('b').textContent = big;
    b.querySelector('small').textContent = small || '';
    b.querySelector('small').hidden = !small;
    b.hidden = false;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { b.hidden = true; }, secs * 1000);
  }

  feed(killer, victim, weapon, head, kRole, vRole) {
    const d = document.createElement('div');
    d.innerHTML = (killer ? `<span class="${kRole}">${esc(killer)}</span>` : '') + `<span class="w">${head ? '🎯 ' : ''}${esc(weapon)}</span><span class="${vRole}">${esc(victim)}</span>`;
    this.el.feed.appendChild(d);
    while (this.el.feed.children.length > 5) this.el.feed.firstChild.remove();
    setTimeout(() => d.remove(), 5000);
  }

  hitmarker(head) {
    const h = this.el.hitmarker;
    h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
    h.classList.toggle('head', head);
  }

  damage(angle) {
    const d = this.el.damage;
    d.style.opacity = 1;
    clearTimeout(this.dmgT);
    this.dmgT = setTimeout(() => (d.style.opacity = 0), 350);
    const arc = document.createElement('div');
    arc.className = 'arc';
    arc.style.transform = `rotate(${-angle}rad)`;
    d.appendChild(arc);
    setTimeout(() => arc.remove(), 1000);
  }

  showDeath(killer, phrase) {
    this.el.death.hidden = false;
    this.el.deathBy.textContent = (killer ? `Te eliminó ${killer}. ` : '') + (phrase || '');
  }

  hideDeath() { this.el.death.hidden = true; }

  matchEnd(game, ev) { this.handlers.matchEnd?.(game, ev); }
}

export function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
