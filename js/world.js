// The Keep: tile map, procedural buildings, folk, the Warden, particles.
G.World = (function () {
  const TS = 16, MW = 40, MH = 28;
  const P = G.PAL;
  const solid = new Uint8Array(MW * MH);
  let bg = null;
  const lights = [];
  const particles = [];
  const eyes = [];
  const npcs = [];
  let villagers = [];
  const cam = { x: 0, y: 0 };
  const hero = { x: 20 * TS, y: 23 * TS, dir: 'up', anim: 0, moving: false, stepT: 0 };

  const KEEP = { tx: 16, ty: 2, w: 8, h: 5 };
  const HEARTH = { tx: 19, ty: 13, w: 2, h: 2 };
  const DECOR = [
    { type: 'well', tx: 11, ty: 12 }, { type: 'tree', tx: 25, ty: 9 }, { type: 'tree', tx: 8, ty: 9 },
    { type: 'tree', tx: 14, ty: 23 }, { type: 'tree', tx: 29, ty: 24 }, { type: 'cart', tx: 24, ty: 23 },
    { type: 'barrels', tx: 13, ty: 20 }, { type: 'grave', tx: 37 - 1, ty: 17 }, { type: 'grave', tx: 31, ty: 17 },
  ];

  // ---------- helpers ----------
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };
  function box(c, x, y, w, h, fill) { R(c, x, y, w, h, P.k); R(c, x + 1, y + 1, w - 2, h - 2, fill); }
  function bricks(c, x, y, w, h, fill, mortar) {
    R(c, x, y, w, h, fill);
    for (let j = 0; j < h; j += 4) {
      R(c, x, y + j, w, 1, mortar);
      const off = (j / 4) % 2 ? 3 : 0;
      for (let i = off; i < w; i += 7) R(c, x + i, y + j, 1, Math.min(4, h - j), mortar);
    }
  }
  function planks(c, x, y, w, h, fill, line) {
    R(c, x, y, w, h, fill);
    for (let i = 3; i < w; i += 4) R(c, x + i, y, 1, h, line);
  }
  function gable(c, x, y, w, h, fill, dark) {
    for (let i = 0; i < h; i++) {
      const inset = Math.round(((h - 1 - i) * (w / 2 - 2)) / h);
      R(c, x + inset - 1, y + i, w - 2 * inset + 2, 1, P.k);
      R(c, x + inset, y + i, w - 2 * inset, 1, i % 3 === 2 ? dark : fill);
    }
  }
  function win(c, x, y, lit) {
    R(c, x - 1, y - 1, 5, 6, P.k);
    R(c, x, y, 3, 4, lit ? P.y : P.d);
    if (lit) { R(c, x, y + 3, 3, 1, P.o); addLightIfDark(x + 1, y + 2, 18, 0.55, 0.9); }
  }
  function door(c, x, y, w, h, col) {
    R(c, x - 1, y - 1, w + 2, h + 1, P.k);
    R(c, x, y, w, h, col || '#2a1a14');
    R(c, x + w - 2, y + (h >> 1), 1, 1, P.y);
  }
  function shadow(c, x, y, w) { c.globalAlpha = 0.45; R(c, x - w / 2, y - 1, w, 3, P.k); c.globalAlpha = 1; }
  function dark() { return G.Eco.darkness(G.S.time) > 0.5 || G.scene === 'title'; }
  function addLight(x, y, r, s, w) { lights.push({ x, y, r, s, w }); }
  function addLightIfDark(x, y, r, s, w) { if (dark()) addLight(x, y, r, s, w); }
  function smoke(x, y, rate) {
    if (Math.random() < rate) particles.push({ x, y, vx: G.rand(-3, 3), vy: G.rand(-10, -6), life: G.rand(2, 3.5), col: Math.random() < 0.5 ? '#4a4560' : '#3a3352', s: 2 });
  }
  function fire(c, x, y, w, h, t) {
    for (let i = 0; i < w; i++) {
      const hh = Math.max(1, Math.round(h * (0.55 + 0.45 * Math.sin(t * 11 + i * 1.7)) * (1 - Math.abs(i - w / 2) / (w * 0.75))));
      R(c, x + i, y - hh, 1, hh, P.r);
      if (hh > 2) R(c, x + i, y - hh + 1, 1, hh - 1, P.o);
      if (hh > 4) R(c, x + i, y - hh + 3, 1, hh - 3, P.y);
    }
  }

  // ---------- map ----------
  function setSolid(tx, ty, w, h, v) {
    for (let j = ty; j < ty + h; j++) for (let i = tx; i < tx + w; i++) if (i >= 0 && j >= 0 && i < MW && j < MH) solid[j * MW + i] = v === undefined ? 1 : v;
  }
  function isPath(i, j) {
    if (j >= 7 && j <= 25 && (i === 19 || i === 20)) return true;
    if ((j === 7 || j === 14 || j === 21) && i >= 3 && i <= 36) return true;
    if (i >= 16 && i <= 23 && j >= 11 && j <= 16) return true;
    return false;
  }
  function buildMap() {
    solid.fill(0);
    setSolid(0, 0, MW, 2); setSolid(0, MH - 2, MW, 2); setSolid(0, 0, 2, MH); setSolid(MW - 2, 0, 2, MH);
    setSolid(KEEP.tx, KEEP.ty, KEEP.w, KEEP.h);
    setSolid(HEARTH.tx, HEARTH.ty, HEARTH.w, HEARTH.h);
    for (const id in G.BUILDINGS) { const [tx, ty] = G.BUILDINGS[id].tile; setSolid(tx, ty, 3, 3); }
    for (const d of DECOR) setSolid(d.tx, d.ty, 1, 1);
    buildBg();
  }

  function buildBg() {
    const rnd = G.mulberry(1337);
    bg = document.createElement('canvas');
    bg.width = MW * TS; bg.height = MH * TS;
    const c = bg.getContext('2d');
    const GROUND = ['#221c2c', '#251f30', '#282233'];
    for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
      const x = i * TS, y = j * TS;
      R(c, x, y, TS, TS, GROUND[Math.floor(rnd() * 3)]);
      for (let k = 0; k < 7; k++) R(c, x + rnd() * 16, y + rnd() * 16, 1, 1, rnd() < 0.5 ? '#302a3c' : '#1b1624');
      if (rnd() < 0.35) {
        const gx = x + rnd() * 13, gy = y + 3 + rnd() * 11;
        const gc = rnd() < 0.5 ? '#3b4032' : '#33382c';
        R(c, gx, gy, 1, 3, gc); R(c, gx + 2, gy - 1, 1, 4, gc); R(c, gx + 4, gy + 1, 1, 2, gc);
      }
      if (rnd() < 0.04) { R(c, x + 6, y + 8, 3, 1, P.b); R(c, x + 5, y + 7, 1, 1, P.b); R(c, x + 9, y + 9, 1, 1, P.b); }
      if (isPath(i, j)) {
        R(c, x, y, TS, TS, '#1c1724');
        for (let sy = 0; sy < 16; sy += 5) {
          const off = (sy / 5) % 2 ? 3 : 0;
          for (let sx = -off; sx < 16; sx += 6) {
            const w = 5, h = 4;
            const col = ['#423d55', '#3d384f', '#47425a'][Math.floor(rnd() * 3)];
            const cx0 = Math.max(x, x + sx), cw = Math.min(x + 16, x + sx + w) - cx0;
            if (cw <= 0) continue;
            R(c, cx0, y + sy, cw, Math.min(h, 16 - sy), col);
            R(c, cx0, y + sy, cw, 1, '#56506c');
          }
        }
      }
    }
    // top wall face
    bricks(c, 0, 0, MW * TS, 32, '#3a3550', '#25202f');
    for (let x = 0; x < MW * TS; x += 10) { R(c, x, 0, 6, 5, '#4a4560'); R(c, x, 0, 6, 1, '#5a5470'); R(c, x + 6, 0, 4, 5, P.k); }
    R(c, 0, 31, MW * TS, 1, P.k);
    c.globalAlpha = 0.5; R(c, 0, 32, MW * TS, 4, P.k); c.globalAlpha = 1;
    // side walls (walkways)
    for (const sx of [0, (MW - 2) * TS]) {
      R(c, sx, 32, 32, (MH - 4) * TS + 8, '#4a4460');
      for (let y = 32; y < (MH - 2) * TS; y += 8) { R(c, sx, y, 32, 1, '#332e44'); for (let x = sx + ((y / 8) % 2 ? 4 : 0); x < sx + 32; x += 8) R(c, x, y, 1, 8, '#332e44'); }
      const outer = sx === 0 ? 0 : sx + 28, inner = sx === 0 ? 28 : sx;
      for (let y = 32; y < (MH - 2) * TS; y += 10) { R(c, outer, y, 4, 6, '#5a5470'); R(c, outer, y + 6, 4, 4, P.k); }
      R(c, inner, 32, 4, (MH - 4) * TS, '#2a2438');
      c.globalAlpha = 0.45; R(c, sx === 0 ? 32 : sx - 4, 32, 4, (MH - 4) * TS, P.k); c.globalAlpha = 1;
    }
    // bottom wall walkway
    const by = (MH - 2) * TS;
    R(c, 0, by, MW * TS, 32, '#4a4460');
    for (let y = by; y < by + 32; y += 8) { R(c, 0, y, MW * TS, 1, '#332e44'); for (let x = (y / 8) % 2 ? 4 : 0; x < MW * TS; x += 8) R(c, x, y, 1, 8, '#332e44'); }
    R(c, 0, by, MW * TS, 4, '#2a2438');
    for (let x = 0; x < MW * TS; x += 10) { R(c, x, by + 27, 6, 5, '#5a5470'); R(c, x + 6, by + 27, 4, 5, P.k); }
    // gate opening
    R(c, 19 * TS, by, 32, 32, P.k);
    R(c, 19 * TS + 2, by, 28, 3, '#1d1730');
    for (let x = 19 * TS + 3; x < 21 * TS - 2; x += 4) R(c, x, by, 1, 6, '#5a5470');
    R(c, 19 * TS, by + 5, 32, 1, '#5a5470');
  }

  // ---------- buildings ----------
  const DRAW = {};
  DRAW.woodcutter = (c, X, Y, L, t) => {
    if (L >= 2) { for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) { R(c, X + 1 + j * 4 + i * 2, Y + 32 + (2 - i) * 4, 4, 4, P.k); R(c, X + 2 + j * 4 + i * 2, Y + 33 + (2 - i) * 4, 2, 2, P.N); } }
    planks(c, X + 8, Y + 24, 30, 20, P.n, '#3d2619');
    R(c, X + 7, Y + 24, 1, 20, P.k); R(c, X + 38, Y + 24, 1, 20, P.k); R(c, X + 7, Y + 44, 32, 1, P.k);
    gable(c, X + 4, Y + 10, 38, 16, '#4a4a3a', '#3a3a2e');
    if (L >= 3) { R(c, X + 30, Y + 8, 5, 10, P.k); R(c, X + 31, Y + 9, 3, 9, '#4a4560'); smoke(X + 32, Y + 6, 0.08); }
    door(c, X + 20, Y + 33, 7, 11);
    win(c, X + 12, Y + 30, true);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) { R(c, X + 38 + i * 4, Y + 34 + j * 4, 4, 4, P.k); R(c, X + 39 + i * 4, Y + 35 + j * 4, 2, 2, P.N); }
    R(c, X + 2, Y + 42, 6, 4, P.k); R(c, X + 3, Y + 42, 4, 3, P.N); R(c, X + 5, Y + 37, 1, 6, P.n); R(c, X + 3, Y + 37, 3, 2, P.g);
    if (L >= 4) { R(c, X + 44, Y + 22, 1, 12, P.k); R(c, X + 43, Y + 20, 3, 3, P.y); addLightIfDark(X + 44, Y + 21, 26, 0.6, 1); }
    if (L >= 5) { R(c, X + 22, Y + 14, 4, 6, P.r); R(c, X + 23, Y + 16, 2, 2, P.y); }
  };
  DRAW.quarry = (c, X, Y, L) => {
    R(c, X + 3, Y + 18, 42, 28, P.k);
    R(c, X + 4, Y + 19, 40, 26, '#141019');
    for (let i = 0; i < 4; i++) R(c, X + 6 + i * 3, Y + 22 + i * 5, 36 - i * 6, 2, i % 2 ? '#3a3352' : '#4a4560');
    for (let i = 0; i < 5; i++) { R(c, X + 30 + (i % 3) * 5, Y + 34 + Math.floor(i / 3) * -4, 6, 5, P.k); R(c, X + 31 + (i % 3) * 5, Y + 35 + Math.floor(i / 3) * -4, 4, 3, P.g); }
    R(c, X + 8, Y + 40, 8, 1, P.n); R(c, X + 8, Y + 38, 2, 3, P.g);
    if (L >= 2) { R(c, X + 6, Y + 2, 2, 24, P.n); R(c, X + 6, Y + 2, 18, 2, P.n); R(c, X + 22, Y + 4, 1, 16, P.b); R(c, X + 20, Y + 20, 5, 4, P.g); }
    if (L >= 3) { R(c, X + 14, Y + 44, 22, 1, P.g); R(c, X + 16, Y + 38, 10, 6, P.k); R(c, X + 17, Y + 39, 8, 4, P.n); }
    if (L >= 4) { R(c, X + 38, Y + 14, 7, 6, P.k); R(c, X + 39, Y + 15, 5, 4, P.g); }
    if (L >= 5) { R(c, X + 42, Y + 20, 1, 10, P.k); R(c, X + 41, Y + 18, 3, 3, P.y); addLightIfDark(X + 42, Y + 19, 26, 0.6, 1); }
  };
  DRAW.cellar = (c, X, Y, L, t) => {
    for (let i = 0; i < 16; i++) { const w = 40 - Math.round(Math.pow((16 - i) / 16, 2) * 28); R(c, X + 24 - w / 2 - 1, Y + 28 + i, w + 2, 1, P.k); R(c, X + 24 - w / 2, Y + 28 + i, w, 1, i % 4 ? '#2d3a2a' : '#26321f'); }
    R(c, X + 15, Y + 31, 18, 14, P.k); R(c, X + 16, Y + 32, 16, 12, '#4a4560');
    R(c, X + 18, Y + 34, 12, 10, P.n); R(c, X + 23, Y + 34, 1, 10, P.k); R(c, X + 18, Y + 38, 12, 1, '#3d2619');
    const n = 3 + L * 2;
    const rnd = G.mulberry(42);
    for (let i = 0; i < n; i++) {
      const mx = X + 4 + Math.floor(rnd() * 40), my = Y + 40 + Math.floor(rnd() * 7);
      const glow = 0.5 + 0.5 * Math.sin(t * 2 + i);
      R(c, mx, my - 2, 1, 3, P.b); R(c, mx - 1, my - 3, 3, 1, glow > 0.5 ? P.C : P.c);
    }
    if (dark()) addLight(X + 24, Y + 42, 22 + L * 3, 0.45, 0);
  };
  function cottage(c, x, y, roof, smokeOn) {
    R(c, x + 2, y + 8, 16, 12, P.k); planks(c, x + 3, y + 9, 14, 10, '#6a5a48', '#4a3a2e');
    gable(c, x, y, 20, 10, roof, P.k);
    door(c, x + 8, y + 13, 4, 6);
    win(c, x + 4, y + 12, true);
    R(c, x + 14, y - 2, 3, 6, P.k); R(c, x + 15, y - 1, 1, 5, '#4a4560');
    if (smokeOn) smoke(x + 15, y - 3, 0.05);
  }
  DRAW.cottages = (c, X, Y, L) => {
    if (L >= 4) { for (let i = 0; i < 48; i += 4) { R(c, X + i, Y + 44, 1, 4, P.n); } R(c, X, Y + 45, 48, 1, P.n); }
    if (L >= 3) cottage(c, X + 26, Y + 14, '#5b2a5e', true);
    if (L >= 2) cottage(c, X + 2, Y + 14, '#4a4a3a', true);
    cottage(c, X + 14, Y + 26, '#8c1c2b', true);
    if (L >= 5) { R(c, X + 40, Y + 30, 1, 14, P.k); R(c, X + 39, Y + 28, 3, 3, P.y); addLightIfDark(X + 40, Y + 29, 26, 0.6, 1); }
  };
  DRAW.tithe = (c, X, Y, L) => {
    bricks(c, X + 5, Y + 24, 38, 20, '#4f4964', '#332e44');
    R(c, X + 4, Y + 24, 1, 20, P.k); R(c, X + 43, Y + 24, 1, 20, P.k); R(c, X + 4, Y + 44, 40, 1, P.k);
    gable(c, X + 2, Y + 12, 44, 13, '#6b6584', '#4f4964');
    for (let i = 0; i < 4; i++) { R(c, X + 8 + i * 10, Y + 25, 3, 19, P.b); R(c, X + 8 + i * 10, Y + 25, 1, 19, P.w); }
    door(c, X + 21, Y + 34, 6, 10);
    R(c, X + 21, Y + 26, 6, 6, P.k); R(c, X + 22, Y + 27, 4, 4, P.y); R(c, X + 23, Y + 28, 1, 2, P.o);
    if (L >= 2) { R(c, X + 3, Y + 26, 3, 10, P.r); R(c, X + 42, Y + 26, 3, 10, P.r); }
    if (L >= 3) { R(c, X + 23, Y + 9, 2, 4, P.y); }
    if (L >= 4) { R(c, X + 0, Y + 38, 4, 8, P.k); R(c, X + 1, Y + 34, 2, 5, P.g); }
    if (L >= 5) { R(c, X + 2, Y + 24, 44, 1, P.y); }
  };
  DRAW.watchtower = (c, X, Y, L, t) => {
    const h = 36 + L * 7;
    const top = Y + 46 - h;
    R(c, X + 13, top, 22, h, P.k);
    bricks(c, X + 14, top + 1, 20, h - 1, '#4a4560', '#2e2940');
    R(c, X + 10, top - 4, 28, 6, P.k); R(c, X + 11, top - 3, 26, 4, '#5a5470');
    for (let i = 0; i < 5; i++) { R(c, X + 11 + i * 6, top - 8, 4, 5, P.k); R(c, X + 12 + i * 6, top - 7, 2, 4, '#5a5470'); }
    for (let i = 1; i < 3 + L; i++) R(c, X + 23, top + i * 8, 2, 4, P.k);
    door(c, X + 21, Y + 37, 6, 9);
    R(c, X + 21, top - 8, 6, 3, P.k);
    fire(c, X + 21, top - 8, 6, 6 + L, t);
    addLight(X + 24, top - 10, 40 + L * 6, 0.85, 1);
    if (L >= 3) { R(c, X + 34, top + 4, 10, 2, P.n); R(c, X + 42, top + 2, 2, 6, P.n); }
  };
  DRAW.chapel = (c, X, Y, L, t) => {
    bricks(c, X + 7, Y + 24, 34, 20, '#6a6380', '#4a4560');
    R(c, X + 6, Y + 24, 1, 20, P.k); R(c, X + 41, Y + 24, 1, 20, P.k); R(c, X + 6, Y + 44, 36, 1, P.k);
    gable(c, X + 4, Y + 14, 40, 12, '#3a3352', P.k);
    R(c, X + 19, Y - 6, 10, 22, P.k); bricks(c, X + 20, Y - 5, 8, 21, '#6a6380', '#4a4560');
    gable(c, X + 17, Y - 16, 14, 11, '#3a3352', P.k);
    fire(c, X + 22, Y - 16, 4, 5, t);
    addLight(X + 24, Y - 18, 30, 0.7, 1);
    R(c, X + 20, Y + 27, 8, 7, P.k);
    const cols = [P.R, P.y, P.c, P.P];
    for (let i = 0; i < 4; i++) R(c, X + 21 + (i % 2) * 3, Y + 28 + Math.floor(i / 2) * 3, 3, 3, cols[i]);
    addLightIfDark(X + 24, Y + 32, 22, 0.5, 0.6);
    door(c, X + 21, Y + 36, 6, 8);
    if (L >= 2) { R(c, X + 22, Y + 0, 4, 4, P.y); }
    if (L >= 3) { R(c, X + 3, Y + 30, 4, 14, P.k); R(c, X + 4, Y + 31, 2, 13, '#6a6380'); R(c, X + 41, Y + 30, 4, 14, P.k); R(c, X + 42, Y + 31, 2, 13, '#6a6380'); }
    if (L >= 4) { win(c, X + 11, Y + 31, true); win(c, X + 34, Y + 31, true); }
    if (L >= 5) { R(c, X + 23, Y - 26, 2, 8, P.y); R(c, X + 21, Y - 23, 6, 2, P.y); }
  };
  DRAW.forge = (c, X, Y, L, t) => {
    R(c, X + 32, Y + 2, 8, 30, P.k); bricks(c, X + 33, Y + 3, 6, 29, '#4a4560', '#2e2940');
    smoke(X + 36, Y + 1, 0.25);
    R(c, X + 4, Y + 22, 2, 22, P.n); R(c, X + 30, Y + 22, 2, 22, P.n);
    for (let i = 0; i < 8; i++) R(c, X + 1, Y + 16 + i, 36, 1, i === 0 || i === 7 ? P.k : i % 2 ? '#4a4a3a' : '#3a3a2e');
    R(c, X + 28, Y + 30, 16, 15, P.k); bricks(c, X + 29, Y + 31, 14, 13, '#4a4560', '#2e2940');
    R(c, X + 32, Y + 36, 8, 7, P.k);
    const fl = 0.6 + 0.4 * Math.sin(t * 9);
    R(c, X + 33, Y + 37, 6, 6, fl > 0.7 ? P.y : P.o);
    addLight(X + 36, Y + 40, 34, 0.8, 1);
    R(c, X + 12, Y + 38, 10, 3, P.k); R(c, X + 13, Y + 38, 8, 2, P.g); R(c, X + 15, Y + 41, 4, 4, P.k);
    if (L >= 2) { for (let i = 0; i < 3; i++) { R(c, X + 6 + i * 3, Y + 28, 1, 10, P.b); R(c, X + 5 + i * 3, Y + 34, 3, 1, P.n); } }
    if (L >= 3) { R(c, X + 22, Y + 40, 5, 5, P.k); R(c, X + 23, Y + 41, 3, 3, P.c); }
    if (L >= 4) { R(c, X + 1, Y + 40, 4, 5, P.k); R(c, X + 2, Y + 41, 2, 3, P.g); }
  };
  DRAW.apothecary = (c, X, Y, L, t) => {
    planks(c, X + 9, Y + 24, 28, 20, '#3a2a2a', '#2a1c1c');
    R(c, X + 8, Y + 24, 1, 20, P.k); R(c, X + 37, Y + 24, 1, 20, P.k); R(c, X + 8, Y + 44, 30, 1, P.k);
    gable(c, X + 5, Y + 8, 36, 17, P.m, '#2d3a2a');
    door(c, X + 15, Y + 34, 6, 10);
    win(c, X + 28, Y + 30, true);
    for (let i = 0; i < 3 + L; i++) R(c, X + 10 + i * 4, Y + 25, 1, 3 + (i % 2), i % 2 ? P.M : P.m);
    R(c, X + 38, Y + 38, 9, 7, P.k); R(c, X + 39, Y + 39, 7, 5, P.s);
    const b = Math.sin(t * 5) > 0;
    R(c, X + 40, Y + 37, 5, 2, P.e); if (b) R(c, X + 42, Y + 34, 1, 1, P.e);
    addLightIfDark(X + 42, Y + 38, 18, 0.5, 0);
    if (L >= 3) { R(c, X + 1, Y + 34, 7, 10, P.k); for (let i = 0; i < 3; i++) R(c, X + 2 + i * 2, Y + 36, 1, 2, [P.R, P.e, P.c][i]); }
  };
  DRAW.crypt = (c, X, Y, L, t) => {
    bricks(c, X + 8, Y + 20, 32, 24, '#4a4560', '#2e2940');
    R(c, X + 7, Y + 20, 1, 24, P.k); R(c, X + 40, Y + 20, 1, 24, P.k); R(c, X + 7, Y + 44, 34, 1, P.k);
    gable(c, X + 5, Y + 10, 38, 11, '#5a5470', P.k);
    R(c, X + 9, Y + 22, 3, 22, P.b); R(c, X + 36, Y + 22, 3, 22, P.b);
    R(c, X + 18, Y + 28, 12, 16, P.k);
    const g = 0.5 + 0.5 * Math.sin(t * 2);
    R(c, X + 19, Y + 30, 10, 14, g > 0.5 ? '#1f3a2a' : '#173022');
    R(c, X + 22, Y + 23, 4, 4, P.b); R(c, X + 23, Y + 24, 1, 1, P.k); R(c, X + 25, Y + 24, 1, 1, P.k);
    addLight(X + 24, Y + 40, 26 + L * 3, 0.5, 0);
    for (let i = 0; i < L; i++) { const gx = X + 2 + (i % 2) * 40, gy = Y + 30 + Math.floor(i / 2) * 6; R(c, gx, gy, 5, 7, P.k); R(c, gx + 1, gy + 1, 3, 6, P.g); }
  };
  function ruins(c, X, Y, id) {
    const rnd = G.mulberry(X * 31 + Y);
    for (let i = 0; i < 9; i++) {
      const x = X + 4 + rnd() * 36, y = Y + 20 + rnd() * 24, w = 3 + rnd() * 6, h = 2 + rnd() * 4;
      R(c, x, y, w, h, P.k); R(c, x + 1, y, w - 2, h - 1, rnd() < 0.5 ? '#4a4560' : '#3a3352');
    }
    R(c, X + 6, Y + 18, 10, 12, P.k); bricks(c, X + 7, Y + 19, 8, 11, '#3a3552', '#25202f');
    R(c, X + 30, Y + 26, 6, 6, P.k); bricks(c, X + 31, Y + 27, 4, 5, '#3a3552', '#25202f');
    if (id === 'crypt') {
      R(c, X + 14, Y + 20, 20, 24, P.k); bricks(c, X + 15, Y + 21, 18, 23, '#3a3552', '#25202f');
      R(c, X + 19, Y + 28, 10, 16, P.k);
      R(c, X + 19, Y + 30, 10, 1, P.g); R(c, X + 19, Y + 36, 10, 1, P.g);
      if (G.S.flags.sealed) { R(c, X + 22, Y + 31, 4, 4, P.y); }
    } else {
      R(c, X + 22, Y + 32, 1, 12, P.n); R(c, X + 18, Y + 32, 9, 5, P.n); R(c, X + 19, Y + 33, 7, 3, P.N);
    }
  }
  function drawPlot(c, id, t) {
    const [tx, ty] = G.BUILDINGS[id].tile;
    const X = tx * TS, Y = ty * TS;
    const L = G.S.b[id];
    if (L > 0) { shadow(c, X + 24, Y + 46, 40); DRAW[id](c, X, Y, L, t); } else ruins(c, X, Y, id);
  }

  function drawKeep(c, t) {
    const S = G.S, X = KEEP.tx * TS, Y = KEEP.ty * TS, lit = S.hearth > 0, L = S.keep;
    shadow(c, X + 64, Y + 80, 128);
    bricks(c, X, Y + 22, 128, 58, '#3f3a55', '#28233a');
    R(c, X, Y + 22, 1, 58, P.k); R(c, X + 127, Y + 22, 1, 58, P.k); R(c, X, Y + 79, 128, 1, P.k);
    for (let x = X; x < X + 128; x += 8) { R(c, x, Y + 16, 5, 7, P.k); R(c, x + 1, Y + 17, 3, 5, '#4f4964'); }
    R(c, X + 40, Y - 14, 48, 94, P.k);
    bricks(c, X + 41, Y - 13, 46, 92, '#46405c', '#2c2740');
    for (let x = X + 38; x < X + 90; x += 8) { R(c, x, Y - 20, 5, 7, P.k); R(c, x + 1, Y - 19, 3, 6, '#56506c'); }
    R(c, X + 63, Y - 32, 1, 12, P.k);
    const wave = Math.sin(t * 3) > 0 ? 1 : 0;
    R(c, X + 64, Y - 32, 10, 6 + wave, P.r); R(c, X + 67, Y - 30, 3, 2, P.y);
    if (L >= 2) for (const tx of [X - 4, X + 116]) {
      R(c, tx, Y - 4, 16, 50, P.k); bricks(c, tx + 1, Y - 3, 14, 48, '#46405c', '#2c2740');
      gable(c, tx - 2, Y - 18, 20, 15, '#5b2a5e', P.k);
      win(c, tx + 6, Y + 12, lit);
    }
    win(c, X + 54, Y - 4, lit); win(c, X + 71, Y - 4, lit);
    win(c, X + 62, Y + 8, lit);
    for (const wx of [X + 12, X + 26, X + 98, X + 112]) win(c, wx, Y + 38, lit);
    R(c, X + 54, Y + 54, 20, 26, P.k);
    R(c, X + 55, Y + 56, 18, 24, '#3d2619');
    R(c, X + 57, Y + 54, 14, 2, P.k);
    for (let i = 0; i < 3; i++) R(c, X + 55, Y + 60 + i * 7, 18, 1, P.k);
    R(c, X + 69, Y + 68, 2, 2, P.y);
    for (const bx of [X + 44, X + 78]) {
      R(c, bx, Y + 50, 7, 20, P.k); R(c, bx + 1, Y + 51, 5, 18, P.r);
      R(c, bx + 2, Y + 57, 3, 4, P.y); R(c, bx + 3, Y + 55, 1, 2, P.o);
    }
    if (L >= 3) for (const bx of [X + 4, X + 117]) { R(c, bx, Y + 26, 7, 16, P.k); R(c, bx + 1, Y + 27, 5, 14, P.r); R(c, bx + 2, Y + 32, 3, 3, P.y); }
    if (L >= 4) { R(c, X + 61, Y - 24, 6, 4, P.y); }
    if (L >= 5) for (const bx of [X + 6, X + 118]) { fire(c, bx, Y + 16, 5, 6, t + bx); addLight(bx + 2, Y + 12, 34, 0.8, 1); }
    R(c, X + 50, Y + 80, 28, 3, '#56506c'); R(c, X + 50, Y + 83, 28, 1, P.k);
  }

  function drawHearth(c, t) {
    const S = G.S, cx = HEARTH.tx * TS + 16, cy = HEARTH.ty * TS + 16, L = S.hearth;
    shadow(c, cx, cy + 12, 34);
    R(c, cx - 16, cy - 2, 32, 14, P.k);
    R(c, cx - 15, cy - 1, 30, 12, '#5a5470');
    for (let i = 0; i < 6; i++) R(c, cx - 15 + i * 5, cy - 1, 1, 12, '#3a3352');
    R(c, cx - 15, cy + 5, 30, 1, '#3a3352');
    R(c, cx - 15, cy - 1, 30, 1, '#7a7490');
    R(c, cx - 12, cy - 5, 24, 5, P.k); R(c, cx - 11, cy - 4, 22, 3, '#1a1524');
    if (L >= 3) { R(c, cx - 16, cy - 2, 32, 1, P.y); R(c, cx - 16, cy + 11, 32, 1, P.y); }
    if (L >= 2) { R(c, cx - 18, cy - 6, 2, 18, P.k); R(c, cx + 16, cy - 6, 2, 18, P.k); }
    if (L > 0) {
      const starved = S.res.timber <= 0;
      const h = starved ? 4 : 10 + L * 3;
      fire(c, cx - 9, cy - 3, 18, h, t);
      if (!starved && Math.random() < 0.5) particles.push({ x: cx + G.rand(-8, 8), y: cy - 6, vx: G.rand(-6, 6), vy: G.rand(-30, -14), life: G.rand(0.6, 1.4), col: Math.random() < 0.5 ? P.o : P.y, s: 1 });
      const fl = Math.sin(t * 13) * 2 + Math.random() * 2;
      addLight(cx, cy - 4, (starved ? 34 : 64 + L * 16) + fl, 0.95, 1);
    } else {
      R(c, cx - 8, cy - 4, 16, 2, '#4a4560');
      if (Math.sin(t * 3) > 0) R(c, cx, cy - 4, 1, 1, P.o);
      addLight(cx, cy - 4, 10, 0.5, 1);
    }
  }

  function drawDecor(c, d, t) {
    const x = d.tx * TS, y = d.ty * TS;
    if (d.type === 'well') {
      shadow(c, x + 8, y + 15, 16);
      R(c, x + 1, y + 6, 14, 10, P.k); bricks(c, x + 2, y + 7, 12, 8, '#4a4560', '#2e2940');
      R(c, x + 3, y + 7, 10, 2, P.k);
      R(c, x + 2, y - 4, 1, 11, P.n); R(c, x + 13, y - 4, 1, 11, P.n); R(c, x + 1, y - 5, 14, 2, P.n);
    } else if (d.type === 'tree') {
      shadow(c, x + 8, y + 15, 12);
      R(c, x + 6, y - 8, 4, 24, P.k); R(c, x + 7, y - 7, 2, 22, '#2e2420');
      R(c, x + 2, y - 4, 5, 1, P.k); R(c, x + 2, y - 7, 1, 3, P.k);
      R(c, x + 9, y - 1, 6, 1, P.k); R(c, x + 14, y - 5, 1, 4, P.k);
      R(c, x + 4, y - 12, 1, 5, P.k); R(c, x + 11, y - 13, 1, 6, P.k);
    } else if (d.type === 'cart') {
      R(c, x - 2, y + 6, 18, 6, P.k); R(c, x - 1, y + 7, 16, 4, P.n);
      R(c, x, y + 11, 5, 5, P.k); R(c, x + 1, y + 12, 3, 3, P.N); R(c, x + 10, y + 11, 5, 5, P.k); R(c, x + 11, y + 12, 3, 3, P.N);
    } else if (d.type === 'barrels') {
      for (let i = 0; i < 2; i++) { R(c, x + 1 + i * 7, y + 5, 7, 10, P.k); R(c, x + 2 + i * 7, y + 6, 5, 8, P.n); R(c, x + 2 + i * 7, y + 9, 5, 1, P.k); }
    } else if (d.type === 'grave') {
      R(c, x + 4, y + 4, 8, 11, P.k); R(c, x + 5, y + 5, 6, 10, P.g); R(c, x + 7, y + 7, 2, 5, P.s); R(c, x + 6, y + 8, 4, 1, P.s);
    }
  }

  function drawCornerTowers(c, t) {
    for (const [x, y, top] of [[0, 0, true], [MW * TS - 40, 0, true], [0, MH * TS - 40, false], [MW * TS - 40, MH * TS - 40, false]]) {
      if (top) {
        R(c, x, y, 40, 44, P.k); bricks(c, x + 1, y, 38, 43, '#46405c', '#2c2740');
        for (let i = 0; i < 5; i++) { R(c, x + 1 + i * 8, y + 34, 5, 6, P.k); }
        R(c, x + 16, y + 14, 8, 10, P.k); R(c, x + 17, y + 15, 6, 9, P.d);
      } else {
        R(c, x, y, 40, 40, P.k); R(c, x + 1, y + 1, 38, 38, '#56506c');
        for (let i = 0; i < 5; i++) { R(c, x + 2 + i * 8, y + 1, 5, 4, '#6b6584'); R(c, x + 2 + i * 8, y + 35, 5, 4, '#6b6584'); }
        R(c, x + 14, y + 16, 12, 8, P.k);
        fire(c, x + 15, y + 18, 10, 7, t + x);
        addLight(x + 20, y + 14, 42, 0.85, 1);
      }
    }
    for (const gx of [18 * TS - 6, 21 * TS + 6]) {
      const gy = (MH - 2) * TS - 10;
      R(c, gx, gy, 16, 26, P.k); R(c, gx + 1, gy + 1, 14, 24, '#56506c');
      R(c, gx + 4, gy + 4, 8, 4, P.k); fire(c, gx + 4, gy + 6, 8, 6, t + gx);
      addLight(gx + 8, gy + 2, 40, 0.85, 1);
    }
  }

  // ---------- characters ----------
  function drawWalker(c, spr, x, y, dir, frame, bob) {
    shadow(c, x, y, 10);
    c.drawImage(G.SPR[spr][dir][frame], Math.round(x - 8), Math.round(y - 16 - (bob || 0)));
  }

  const NPC_DEF = {
    maud: { spr: 'maud', home: [17 * TS, 17 * TS + 8], when: (S) => S.step >= 1 },
    corvin: { spr: 'corvin', home: [30 * TS, 15 * TS], when: (S) => !!S.flags.corvin },
    isolde: { spr: 'isolde', home: [36 * TS, 22 * TS + 8], when: (S) => S.step >= G.STEP.BELL },
    pip: { spr: 'pip', home: [12 * TS, 15 * TS], when: (S) => S.step >= G.STEP.BELL },
  };
  function syncNPCs() {
    for (const id in NPC_DEF) {
      const def = NPC_DEF[id];
      const have = npcs.find((n) => n.id === id);
      if (def.when(G.S) && !have) npcs.push({ id, spr: def.spr, x: def.home[0], y: def.home[1], hx: def.home[0], hy: def.home[1], dir: 'down', wait: G.rand(1, 3), tx: null, ty: null, anim: 0, talk: false });
      if (!def.when(G.S) && have) npcs.splice(npcs.indexOf(have), 1);
    }
    const want = Math.min(10, Math.max(0, G.S.folk));
    const spots = [[8, 15], [14, 8], [26, 15], [24, 22], [16, 22], [30, 8], [6, 22], [22, 10], [10, 15], [33, 22], [28, 21], [8, 8]];
    while (villagers.length < want) {
      const i = villagers.length;
      const [sx, sy] = spots[i % spots.length];
      villagers.push({ spr: 'folk' + ((i % 4) + 1), x: sx * TS + 8, y: sy * TS + 12, hx: sx * TS + 8, hy: sy * TS + 12, dir: 'down', wait: G.rand(0, 4), tx: null, ty: null, anim: 0 });
    }
    if (villagers.length > want) villagers.length = want;
  }
  function spawnTemp(id, spr, x, y, dir) {
    const n = { id, spr, x, y, hx: x, hy: y, dir: dir || 'up', wait: 999, anim: 0, temp: true };
    npcs.push(n);
    return n;
  }
  function removeTemp(id) { const i = npcs.findIndex((n) => n.id === id); if (i >= 0) npcs.splice(i, 1); }

  function blocked(x, y) {
    for (const [ox, oy] of [[-4, -3], [4, -3], [-4, 0], [4, 0]]) {
      const tx = Math.floor((x + ox) / TS), ty = Math.floor((y + oy) / TS);
      if (tx < 0 || ty < 0 || tx >= MW || ty >= MH || solid[ty * MW + tx]) return true;
    }
    return false;
  }
  function moveBody(b, dx, dy) {
    let moved = false;
    if (dx && !blocked(b.x + dx, b.y)) { b.x += dx; moved = true; }
    if (dy && !blocked(b.x, b.y + dy)) { b.y += dy; moved = true; }
    return moved;
  }
  function wander(n, dt, speed) {
    if (n.talk || n.temp) return;
    if (n.tx === null) {
      n.wait -= dt; n.moving = false;
      if (n.wait <= 0) { n.tx = n.hx + G.rand(-28, 28); n.ty = n.hy + G.rand(-14, 14); }
      return;
    }
    const dx = n.tx - n.x, dy = n.ty - n.y, d = Math.hypot(dx, dy);
    if (d < 2) { n.tx = null; n.wait = G.rand(2, 6); return; }
    const vx = (dx / d) * speed * dt, vy = (dy / d) * speed * dt;
    n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    n.moving = true; n.anim += dt;
    if (!moveBody(n, vx, vy)) { n.tx = null; n.wait = G.rand(1, 3); }
  }

  // ---------- interactions ----------
  function interactables() {
    const S = G.S, list = [];
    list.push({ kind: 'hearth', x: HEARTH.tx * TS + 16, y: HEARTH.ty * TS + 16, r: 30, label: S.hearth ? `The Hearth (Lv ${S.hearth})` : 'Kneel at the cold hearth' });
    list.push({ kind: 'keep', x: KEEP.tx * TS + 64, y: (KEEP.ty + KEEP.h) * TS + 6, r: 22, label: `The Keep (Lv ${S.keep}) - ledger & rest`, box: [KEEP.tx * TS + 36, 0, KEEP.tx * TS + 92, (KEEP.ty + KEEP.h) * TS + 14] });
    list.push({ kind: 'gate', x: 20 * TS, y: (MH - 2) * TS - 4, r: 22, label: 'The Gate - venture out' });
    for (const id in G.BUILDINGS) {
      const B = G.BUILDINGS[id];
      const [tx, ty] = B.tile;
      const L = S.b[id];
      list.push({ kind: 'plot', id, x: tx * TS + 24, y: ty * TS + 52, r: 20, label: L ? `${B.name} (Lv ${L})` : G.Keep.plotLabel(id), box: [tx * TS, ty * TS - 24, tx * TS + 48, ty * TS + 56] });
    }
    for (const n of npcs) if (!n.temp) list.push({ kind: 'npc', id: n.id, x: n.x, y: n.y, r: 18, label: `Talk to ${G.Story.speakerName(n.id)}`, npc: n });
    return list;
  }
  function nearest() {
    let best = null, bd = 1e9;
    for (const it of interactables()) {
      const d = Math.hypot(it.x - hero.x, it.y - hero.y);
      if (d < it.r && d < bd) { bd = d; best = it; }
    }
    return best;
  }
  // What did the player tap? Buildings count anywhere on their picture.
  function itemAt(px, py) {
    let best = null, bd = 1e9;
    for (const it of interactables()) {
      if (it.box && px >= it.box[0] && px <= it.box[2] && py >= it.box[1] && py <= it.box[3]) return it;
      const d = Math.min(Math.hypot(it.x - px, it.y - py), it.kind === 'npc' ? Math.hypot(it.x - px, it.y - 8 - py) : 1e9);
      if (d < it.r + 12 && d < bd) { bd = d; best = it; }
    }
    return best;
  }

  // ---------- update / render ----------
  function update(dt, controllable) {
    const S = G.S;
    let dx = 0, dy = 0;
    if (controllable) {
      const H = G.Input.held;
      if (H.left) dx -= 1; if (H.right) dx += 1; if (H.up) dy -= 1; if (H.down) dy += 1;
      if (G.Input.target && !dx && !dy) {
        const tx = G.Input.target.x - hero.x, ty = G.Input.target.y - hero.y;
        const d = Math.hypot(tx, ty);
        if (d < 3) G.Input.target = null; else { dx = tx / d; dy = ty / d; }
      }
    }
    if (dx || dy) {
      const len = Math.hypot(dx, dy), sp = 66 * dt;
      const vx = (dx / len) * sp, vy = (dy / len) * sp;
      if (Math.abs(dx) > Math.abs(dy) + 0.01) hero.dir = dx > 0 ? 'right' : 'left'; else hero.dir = dy > 0 ? 'down' : 'up';
      const moved = moveBody(hero, vx, vy);
      if (!moved) G.Input.target = null;
      hero.moving = moved; hero.anim += dt;
      hero.stepT += dt;
      if (moved && hero.stepT > 0.28) { hero.stepT = 0; G.Audio.sfx('step'); }
    } else hero.moving = false;
    S.hero.x = hero.x; S.hero.y = hero.y; S.hero.dir = hero.dir;

    for (const n of npcs) wander(n, dt, 18);
    for (const v of villagers) wander(v, dt, 14);

    // particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.ash) p.vx = Math.sin(G.t * 1.3 + p.seed) * 6;
      if (p.life <= 0) particles.splice(i, 1);
    }
    if (Math.random() < 0.6) particles.push({ ash: true, x: cam.x + G.rand(-20, G.W + 20), y: cam.y - 4, vx: 0, vy: G.rand(6, 14), life: 16, col: Math.random() < 0.6 ? '#6b6584' : '#9a94ad', s: 1, seed: Math.random() * 9 });

    // eyes in the dark
    if (G.Eco.isNight(S.time) || G.scene === 'title') {
      if (eyes.length < 10 && Math.random() < 0.03) {
        const side = G.ri(0, 2);
        const e = side === 0 ? { x: G.rand(48, MW * TS - 48), y: G.rand(10, 26) } : side === 1 ? { x: G.rand(4, 26), y: G.rand(48, MH * TS - 60) } : { x: G.rand(MW * TS - 28, MW * TS - 6), y: G.rand(48, MH * TS - 60) };
        e.life = G.rand(3, 7); e.max = e.life; e.col = Math.random() < 0.8 ? P.R : P.C;
        eyes.push(e);
      }
    }
    for (let i = eyes.length - 1; i >= 0; i--) { eyes[i].life -= dt; if (eyes[i].life <= 0) eyes.splice(i, 1); }
  }

  function camFollow(tx, ty) {
    cam.x = Math.round(G.clamp(tx - G.W / 2, 0, MW * TS - G.W));
    cam.y = Math.round(G.clamp(ty - G.H / 2, 0, MH * TS - G.H));
  }

  function render(ctx, t, opts) {
    opts = opts || {};
    const S = G.S;
    lights.length = 0;
    if (opts.cam) camFollow(opts.cam[0], opts.cam[1]); else camFollow(hero.x, hero.y - 8);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, cam.x, cam.y, G.W, G.H, 0, 0, G.W, G.H);
    ctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);

    const ents = [];
    ents.push({ y: (KEEP.ty + KEEP.h) * TS, d: () => drawKeep(ctx, t) });
    ents.push({ y: (HEARTH.ty + HEARTH.h) * TS, d: () => drawHearth(ctx, t) });
    for (const id in G.BUILDINGS) { const ty = G.BUILDINGS[id].tile[1]; ents.push({ y: (ty + 3) * TS - 1, d: () => drawPlot(ctx, id, t) }); }
    for (const d of DECOR) ents.push({ y: (d.ty + 1) * TS - 1, d: () => drawDecor(ctx, d, t) });
    for (const v of villagers) ents.push({ y: v.y, d: () => drawWalker(ctx, v.spr, v.x, v.y, v.dir, v.moving ? Math.floor(v.anim * 5) % 2 : 0) });
    for (const n of npcs) ents.push({ y: n.y, d: () => drawWalker(ctx, n.spr, n.x, n.y, n.dir, n.moving ? Math.floor(n.anim * 5) % 2 : 0) });
    if (!opts.noHero) ents.push({ y: hero.y, d: () => drawWalker(ctx, 'hero', hero.x, hero.y, hero.dir, hero.moving ? Math.floor(hero.anim * 7) % 2 : 0, hero.moving && Math.floor(hero.anim * 7) % 2 ? 1 : 0) });
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.d();
    drawCornerTowers(ctx, t);

    for (const p of particles) {
      if (p.ash) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); continue; }
      ctx.globalAlpha = Math.min(1, p.life);
      ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      ctx.globalAlpha = 1;
    }

    if (!opts.noHero) lights.push({ x: hero.x, y: hero.y - 8, r: 44 + (S.flags.lantern ? 16 : 0), s: 0.8, w: 0.5 });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    G.Light.render(ctx, cam.x, cam.y, opts.ambient !== undefined ? opts.ambient : G.Eco.darkness(S.time), lights);

    // glowing things drawn over the dark
    ctx.setTransform(1, 0, 0, 1, -cam.x, -cam.y);
    for (const e of eyes) {
      const a = Math.min(1, e.life, e.max - e.life);
      if (Math.sin(G.t * 4 + e.x) > 0.93) continue;
      ctx.globalAlpha = a; ctx.fillStyle = e.col;
      ctx.fillRect(Math.round(e.x), Math.round(e.y), 1, 1); ctx.fillRect(Math.round(e.x) + 3, Math.round(e.y), 1, 1);
      ctx.globalAlpha = 1;
    }
    for (const p of particles) if (!p.ash && (p.col === P.o || p.col === P.y)) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }

    if (!opts.noMarkers && G.scene === 'keep') {
      const bounce = Math.round(Math.sin(t * 5) * 2);
      for (const m of G.Story.targets()) {
        const x = Math.round(m.x), y = Math.round(m.y) + bounce;
        ctx.fillStyle = P.k; ctx.fillRect(x - 3, y - 1, 7, 5);
        ctx.fillStyle = P.y; ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x - 1, y + 1, 3, 1); ctx.fillRect(x, y + 2, 1, 1);
      }
      for (const n of npcs) {
        if (G.Story.hasNews(n.id)) {
          const x = Math.round(n.x), y = Math.round(n.y) - 24 + bounce;
          ctx.fillStyle = P.k; ctx.fillRect(x - 2, y - 1, 5, 9);
          ctx.fillStyle = P.w; ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x + 1, y + 1, 1, 2); ctx.fillRect(x, y + 3, 1, 1); ctx.fillRect(x, y + 5, 1, 1);
        }
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function screenToWorld(sx, sy) { return { x: sx + cam.x, y: sy + cam.y }; }

  function placeHero(x, y, dir) { hero.x = x; hero.y = y; hero.dir = dir || 'up'; G.Input.target = null; }

  return {
    TS, MW, MH, hero, cam, npcs, buildMap, syncNPCs, update, render, nearest, itemAt, placeHero, screenToWorld,
    spawnTemp, removeTemp, HEARTH, KEEP,
    plotPoint(id) { const [tx, ty] = G.BUILDINGS[id].tile; return { x: tx * TS + 24, y: ty * TS + 10 }; },
    gatePoint() { return { x: 20 * TS, y: (MH - 2) * TS - 18 }; },
    hearthPoint() { return { x: HEARTH.tx * TS + 16, y: HEARTH.ty * TS - 18 }; },
    keepPoint() { return { x: KEEP.tx * TS + 64, y: (KEEP.ty + KEEP.h) * TS - 34 }; },
    npc(id) { return npcs.find((n) => n.id === id); },
    walkTo(n, x, y, speed) {
      return new Promise((res) => {
        const step = () => {
          const dx = x - n.x, dy = y - n.y, d = Math.hypot(dx, dy);
          if (d < 1.5) { n.moving = false; res(); return; }
          const s = Math.min(d, (speed || 30) / 60);
          n.x += (dx / d) * s; n.y += (dy / d) * s; n.anim += 1 / 60; n.moving = true;
          n.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
          setTimeout(step, 16);
        };
        step();
      });
    },
  };
})();
