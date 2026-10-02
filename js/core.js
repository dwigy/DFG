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

  // Touch pad
  function bindPad() {
    document.querySelectorAll('[data-pad]').forEach((btn) => {
      const k = btn.dataset.pad;
      const down = (e) => {
        e.preventDefault();
        btn.classList.add('on');
        if (k in held) { held[k] = true; press(k); } else press(k);
        G.Audio && G.Audio.unlock();
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('on');
        if (k in held) held[k] = false;
      };
      btn.addEventListener('pointerdown', down);
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
