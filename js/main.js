// Boot, title screen and the main loop.
(function () {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  G.buildSprites();
  G.World.buildMap();
  G.UI.init();
  G.Input.bindPad();

  // Size the pixel canvas to the space the layout gives it. Desktop stays 320x180;
  // phones get fewer, bigger pixels and a taller view in portrait.
  const stage = document.getElementById('stage');
  function fitCanvas() {
    const r = stage.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return;
    let W, H;
    if (r.width / r.height > 1.9) {
      // Wide landscape phone: fix the height, widen the view instead of letterboxing.
      H = Math.round(G.clamp(r.height / 1.75, 150, 180));
      W = Math.round(G.clamp((H * r.width) / r.height, 320, 560));
    } else {
      W = r.width >= 640 ? 320 : Math.round(G.clamp(r.width / 1.75, 200, 320));
      H = Math.round(G.clamp((W * r.height) / r.width, 150, 420));
    }
    if (W === G.W && H === G.H) return;
    G.W = W; G.H = H;
    cv.width = W; cv.height = H;
    ctx.imageSmoothingEnabled = false;
    G.Light.resize(W, H);
  }
  let fitQueued = false;
  const queueFit = () => { if (!fitQueued) { fitQueued = true; requestAnimationFrame(() => { fitQueued = false; fitCanvas(); }); } };
  if (window.ResizeObserver) new ResizeObserver(queueFit).observe(stage);
  window.addEventListener('resize', queueFit);
  fitCanvas();

  // Keep the screen awake while playing (where the browser allows it).
  let wake = null;
  async function keepAwake() {
    try { if (navigator.wakeLock && !wake && !document.hidden) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } } catch (e) { wake = null; }
  }

  // A finished Keep at night, shown behind the title as a promise of what's to come.
  function showcase() {
    const s = G.newState();
    Object.assign(s.b, { woodcutter: 3, quarry: 2, cellar: 3, cottages: 3, tithe: 2, watchtower: 3, chapel: 2, forge: 2, apothecary: 1 });
    s.hearth = 3; s.keep = 3; s.folk = 9; s.time = 0.75; s.step = 6; s.flags.corvin = true;
    return s;
  }

  function showTitle() {
    G.scene = 'title';
    G.S = showcase();
    G.World.syncNPCs();
    document.body.classList.add('at-title');
    const saved = G.load();
    const items = [];
    if (saved) items.push({ label: `Continue - Day ${saved.day}`, onClick: () => begin(saved) });
    items.push({ label: saved ? 'New game' : 'Begin', onClick: () => (saved ? confirmNew() : begin(null)) });
    G.UI.titleMenu(items);
    G.Audio.play('title');
  }
  function confirmNew() {
    G.UI.titleMenu([
      { label: 'Erase my save and begin anew', onClick: () => { G.wipe(); begin(null); } },
      { label: 'Go back', onClick: showTitle },
    ]);
  }

  async function begin(state) {
    G.UI.titleMenu([]);
    document.body.classList.remove('at-title');
    G.S = state || G.newState();
    G.scene = 'keep';
    G.World.placeHero(G.S.hero.x, G.S.hero.y, G.S.hero.dir);
    G.World.syncNPCs();
    G.Story.refreshObjective();
    G.UI.hud();
    G.Audio.unlock();
    keepAwake();
    if (!state) {
      G.busy = true;
      G.Audio.play('night');
      await G.UI.scene([
        ['narrator', 'Seven winters ago, the Sun went out.'],
        ['narrator', 'No eclipse. No cloud. It guttered like a candle pinched between two fingers, and it did not come back.'],
        ['narrator', 'Then came the Long Dusk. Then came the Hollow: the ones who walk when the light is gone.'],
        ['narrator', 'Your house swore to guard the flame of Ashen Keep. You are the last of that house.'],
        ['narrator', 'You have come home. The Keep is a ruin, and the Hearth is cold.'],
        ['narrator', 'Almost.'],
      ]);
      G.busy = false;
      G.save();
    } else {
      G.S.nextEventDay = Math.max(G.S.nextEventDay, G.S.day + 1);
      const off = G.Eco.offline(G.S);
      if (off && Object.keys(off.got).length) {
        G.UI.toast(`While you were away (${off.mins} min), your folk gathered ` + Object.keys(off.got).map((k) => `${off.got[k]} ${k}`).join(', ') + '.');
      }
    }
  }

  // Tap the map to walk there. Tap a building or person to walk over and use it.
  let pending = null;
  cv.addEventListener('pointerdown', (e) => {
    G.Audio.unlock();
    if (G.UI.tapAdvance()) return;
    if (G.scene !== 'keep' || G.UI.isBlocking()) return;
    const r = cv.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * G.W, sy = ((e.clientY - r.top) / r.height) * G.H;
    const w = G.World.screenToWorld(sx, sy);
    const tapped = G.World.itemAt(w.x, w.y);
    const near = G.World.nearest();
    if (tapped && near && same(tapped, near)) { pending = null; G.Input.target = null; G.Keep.interact(near); return; }
    pending = tapped;
    G.Input.target = tapped ? { x: tapped.x, y: tapped.y } : { x: w.x, y: w.y + 6 };
  });
  // The "A: Build..." prompt line is itself a button on touch screens.
  document.getElementById('prompt').addEventListener('click', (e) => {
    if (e.target !== e.currentTarget && !e.target.closest('#prompt')) return;
    if (G.UI.isBlocking()) return;
    const near = G.World.nearest();
    if (G.scene === 'keep' && near) G.Keep.interact(near);
  });
  const same = (a, b) => a.kind === b.kind && a.id === b.id;

  let last = performance.now(), hudT = 0, lastPrompt = '#';
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    G.t += dt;
    const blocking = G.UI.handleInput();

    if (G.scene === 'keep') {
      if (!blocking) {
        G.World.update(dt, true);
        G.Eco.tick(G.S, dt);
        const it = G.World.nearest();
        const label = it ? it.label : '';
        if (label !== lastPrompt) { G.UI.prompt(label); lastPrompt = label; }
        if (G.Input.take('a') && it) { pending = null; G.Keep.interact(it); }
        else if (pending && it && same(pending, it)) { pending = null; G.Input.target = null; G.Keep.interact(it); }
        else if (pending && !G.Input.target) pending = null;
      } else G.World.update(dt, false);
      G.Story.update();
      G.World.render(ctx, G.t);
      const ph = G.Eco.phase(G.S.time);
      if (!G.busy || G.S.step > 0) G.Audio.play(ph === 'night' || ph === 'dusk' ? 'night' : 'keep');
    } else if (G.scene === 'title') {
      G.World.update(dt, false);
      G.World.render(ctx, G.t, { cam: [320, 190], noHero: true, ambient: 0.82, noMarkers: true });
    } else if (G.scene === 'expedition') {
      G.Exp.update(dt);
      G.Exp.render(ctx, G.t);
    }
    G.Input.clear();

    hudT += dt;
    if (hudT > 0.2 && G.scene !== 'title') { hudT = 0; G.UI.hud(); }
    requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) G.save(); else if (G.scene !== 'title') keepAwake(); });
  window.addEventListener('pagehide', () => G.save());

  showTitle();
  G.UI.prompt('');
  requestAnimationFrame(frame);
})();
