// Controles: táctil (joystick + botones), teclado/mouse y gamepad.

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.enabled = false;
    this.keys = new Set();
    this.s = this.blank();
    this.mouseFire = false; this.touchFire = false;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.look = new Map();
    this.defuseHeld = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.bind();
  }

  blank() { return { lookX: 0, lookY: 0, jump: false, aimToggle: false, swap: false, reload: false, interact: false, egg: null, wpick: false, slot: -1 }; }

  bind() {
    const c = this.canvas;
    // ---- Teclado ----
    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      const s = this.s;
      if (e.code === 'Space') { s.jump = true; e.preventDefault(); }
      if (e.code === 'KeyR') s.reload = true;
      if (e.code === 'KeyQ') s.swap = true;
      if (e.code === 'KeyE') { s.interact = true; this.defuseHeld = true; }
      if (e.code === 'KeyF') s.wpick = true;
      if (e.code.startsWith('Digit')) s.slot = Number(e.code.slice(5)) - 1;
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyE') this.defuseHeld = false; });
    addEventListener('blur', () => { this.keys.clear(); this.mouseFire = false; this.touchFire = false; this.defuseHeld = false; });
    // ---- Mouse ----
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.isTouchEvent) return;
      if (document.pointerLockElement !== c) { c.requestPointerLock?.(); return; }
      if (e.button === 0) this.mouseFire = true;
      if (e.button === 2) this.s.aimToggle = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseFire = false;
      if (e.button === 2 && this.enabled && document.pointerLockElement === c) this.s.aimToggle = true; // mantener para apuntar
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.enabled || document.pointerLockElement !== c) return;
      this.s.lookX += e.movementX; this.s.lookY += e.movementY;
    });
    addEventListener('wheel', (e) => { if (this.enabled && document.pointerLockElement === c && Math.abs(e.deltaY) > 10) this.s.swap = true; }, { passive: true });

    // ---- Táctil ----
    const layer = document.getElementById('touch');
    const joyEl = document.getElementById('joy'), knob = document.getElementById('joyKnob');
    const leftZone = (x) => (document.body.classList.contains('zurdo') ? x > innerWidth * 0.55 : x < innerWidth * 0.45);
    layer.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' || !this.enabled) return;
      this.isTouchEvent = true;
      const btn = e.target.closest('[data-btn]');
      if (btn) {
        e.preventDefault();
        btn.setPointerCapture?.(e.pointerId);
        btn.classList.add('down');
        const b = btn.dataset.btn;
        if (b === 'fire') { this.touchFire = true; this.look.set(e.pointerId, { x: e.clientX, y: e.clientY, btn }); }
        else if (b === 'jump') this.s.jump = true;
        else if (b === 'aim') this.s.aimToggle = true;
        else if (b === 'swap') this.s.swap = true;
        else if (b === 'reload') this.s.reload = true;
        else if (b === 'pick') this.s.egg = 'pick';
        else if (b === 'plant') this.s.egg = 'plant';
        else if (b === 'defuse') this.defuseHeld = true;
        else if (b === 'wpick') this.s.wpick = true;
        btn._pid = e.pointerId;
        return;
      }
      if (this.joy.id === null && leftZone(e.clientX)) {
        this.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
        joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px';
        joyEl.classList.add('on');
        knob.style.transform = 'translate(-50%,-50%)';
      } else this.look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }, { passive: false });
    const move = (e) => {
      if (e.pointerType === 'mouse') return;
      if (e.pointerId === this.joy.id) {
        const R = 55;
        let dx = e.clientX - this.joy.ox, dy = e.clientY - this.joy.oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        this.joy.x = dx / R; this.joy.y = dy / R;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
      const l = this.look.get(e.pointerId);
      if (l) {
        const k = 1.35;
        this.s.lookX += (e.clientX - l.x) * k; this.s.lookY += (e.clientY - l.y) * k;
        l.x = e.clientX; l.y = e.clientY;
      }
    };
    const up = (e) => {
      if (e.pointerType === 'mouse') return;
      if (e.pointerId === this.joy.id) { this.joy = { id: null, x: 0, y: 0 }; joyEl.classList.remove('on'); }
      const l = this.look.get(e.pointerId);
      if (l?.btn) this.touchFire = false;
      this.look.delete(e.pointerId);
      document.querySelectorAll('[data-btn].down').forEach((b) => {
        if (b._pid === e.pointerId) { b.classList.remove('down'); if (b.dataset.btn === 'defuse') this.defuseHeld = false; if (b.dataset.btn === 'fire') this.touchFire = false; }
      });
    };
    addEventListener('pointermove', move, { passive: true });
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    // Evitar zoom y scroll accidental.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    layer.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) { this.keys.clear(); this.mouseFire = this.touchFire = false; this.defuseHeld = false; this.look.clear(); this.joy = { id: null, x: 0, y: 0 }; document.getElementById('joy').classList.remove('on'); if (document.pointerLockElement) document.exitPointerLock?.(); }
  }

  // Lee y consume el estado del cuadro actual.
  read() {
    const k = this.keys, s = this.s;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let mz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (this.joy.id !== null) { mx = this.joy.x; mz = -this.joy.y; }
    let fire = this.mouseFire || this.touchFire;
    // Gamepad.
    const gp = navigator.getGamepads?.().find((g) => g && g.connected);
    if (gp && this.enabled) {
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      if (dz(gp.axes[0]) || dz(gp.axes[1])) { mx = dz(gp.axes[0]); mz = -dz(gp.axes[1]); }
      s.lookX += dz(gp.axes[2] ?? 0) * 14; s.lookY += dz(gp.axes[3] ?? 0) * 14;
      const b = (i) => gp.buttons[i]?.pressed;
      const prev = this.gpPrev || [];
      const edge = (i) => b(i) && !prev[i];
      if (b(7)) fire = true;
      if (edge(0)) s.jump = true;
      if (edge(6) || (prev[6] && !b(6))) s.aimToggle = true;
      if (edge(3)) s.swap = true;
      if (edge(1)) s.reload = true;
      if (edge(2)) s.interact = true;
      if (b(2)) this.defuseHeld = true; else if (prev[2]) this.defuseHeld = false;
      this.gpPrev = gp.buttons.map((x) => x.pressed);
    }
    const out = { ...s, mx, mz, fire, defuse: this.defuseHeld };
    this.s = this.blank();
    if (!this.enabled) { out.mx = out.mz = 0; out.fire = false; out.lookX = out.lookY = 0; }
    return out;
  }
}
