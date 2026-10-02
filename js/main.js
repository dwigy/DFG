// Boot, title screen and the main loop.
(function () {
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  G.buildSprites();
  G.World.buildMap();
  G.UI.init();
  G.Input.bindPad();

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

  // Tap the map to walk there; tap something close by to use it.
  cv.addEventListener('pointerdown', (e) => {
    G.Audio.unlock();
    if (G.scene !== 'keep' || G.UI.isBlocking()) return;
    const r = cv.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * G.W, sy = ((e.clientY - r.top) / r.height) * G.H;
    const w = G.World.screenToWorld(sx, sy);
    const near = G.World.nearest();
    if (near && Math.hypot(near.x - w.x, near.y - w.y) < near.r + 14) { G.Keep.interact(near); return; }
    G.Input.target = { x: w.x, y: w.y + 6 };
  });

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
        if (G.Input.take('a') && it) G.Keep.interact(it);
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

  document.addEventListener('visibilitychange', () => { if (document.hidden) G.save(); });
  window.addEventListener('pagehide', () => G.save());

  showTitle();
  G.UI.prompt('');
  requestAnimationFrame(frame);
})();
