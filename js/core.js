// Core namespace, math helpers and input.
window.G = {
  W: 320, H: 180, TS: 16,
  scene: 'title',
  t: 0,
};

G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
G.rand = (a, b) => a + Math.random() * (b - a);
G.ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
G.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
G.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
G.fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.floor(n)));
G.mulberry = function (seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Short vibration on phones that support it (Android); silently ignored elsewhere.
G.buzz = function (pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
};

// ---------- Input ----------
G.Input = (function () {
  const held = { up: false, down: false, left: false, right: false };
  const queue = [];
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'a', Enter: 'a', KeyE: 'a', KeyZ: 'a',
    Escape: 'b', KeyX: 'b', KeyQ: 'b', Backspace: 'b',
    KeyM: 'mute',
  };
  function press(name) { queue.push(name); }

  window.addEventListener('keydown', (e) => {
    const k = KEYS[e.code];
    if (!k) return;
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    if (k in held) {
      if (!held[k]) press(k);
      held[k] = true;
    } else if (!e.repeat) press(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYS[e.code];
    if (k && k in held) held[k] = false;
  });
  window.addEventListener('blur', () => { for (const k in held) held[k] = false; });

  // Touch pad: a thumb stick (slide to steer, diagonals allowed) plus A and B.
  function bindPad() {
    const stick = document.querySelector('[data-stick]');
    if (stick) {
      const knob = stick.querySelector('i');
      let id = null;
      const DIRS = [['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up'], ['up', 'right']];
      const set = (dirs) => {
        for (const k of ['up', 'down', 'left', 'right']) {
          const on = dirs.indexOf(k) >= 0;
          if (on && !held[k]) press(k);
          held[k] = on;
        }
      };
      const move = (e) => {
        const r = stick.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2, d = Math.hypot(dx, dy);
        const k = Math.min(1, max / Math.max(1, d)) * 0.6;
        knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        if (d < max * 0.22) { set([]); return; }
        const sector = (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
        set(DIRS[sector]);
      };
      const end = (e) => {
        if (e.pointerId !== id) return;
        id = null; set([]);
        knob.style.transform = '';
        stick.classList.remove('on');
      };
      stick.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        id = e.pointerId;
        try { stick.setPointerCapture(id); } catch (err) {}
        stick.classList.add('on');
        G.Audio && G.Audio.unlock();
        move(e);
      });
      stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
      stick.addEventListener('pointerup', end);
      stick.addEventListener('pointercancel', end);
      stick.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    document.querySelectorAll('[data-pad]').forEach((btn) => {
      const k = btn.dataset.pad;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.classList.add('on');
        press(k);
        G.buzz(8);
        G.Audio && G.Audio.unlock();
      });
      const up = () => btn.classList.remove('on');
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointerleave', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  return {
    held, press, bindPad,
    take(name) {
      const i = queue.indexOf(name);
      if (i >= 0) { queue.splice(i, 1); return true; }
      return false;
    },
    drain() { const q = queue.slice(); queue.length = 0; return q; },
    clear() { queue.length = 0; },
  };
})();
