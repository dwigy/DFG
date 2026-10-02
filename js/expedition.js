// Expeditions beyond the gate: side-view scenes, events and turn-based battles.
G.Exp = (function () {
  const P = G.PAL;
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x | 0, y | 0, w | 0, h | 0); };
  let X = null;
  // Battle layout scales with the screen: the ground sits 30px above the bottom.
  let GROUND = 150;
  const HX = () => Math.round(G.W * 0.22);
  const FX = () => Math.round(G.W * 0.74);

  const S = () => G.S;
  const E = () => G.Eco;

  function log(m, cls) { G.UI.blog(m, cls); }
  function hud() {
    const s = S();
    G.UI.bhud({
      lvl: s.hero.lvl, hp: s.hero.hp, max: E().maxHp(s), charges: X.charges, tonics: s.hero.tonics,
      foe: X.foe && X.foe.hp > 0 ? X.foe : null, site: X.site.name,
      room: X.room < X.rooms ? `Stretch ${X.room + 1} of ${X.rooms}` : X.bossRoom ? 'The heart of it' : 'Heading home',
    });
  }
  const wait = (ms) => G.sleep(ms);

  function walk(secs) {
    return new Promise((res) => { X.walking = secs; X.walkDone = res; });
  }
  function num(txt, x, y, col) { X.nums.push({ txt: String(txt), x, y, col, life: 1 }); }
  function burst(x, y, col, n) {
    for (let i = 0; i < n; i++) X.fx.push({ x, y, vx: G.rand(-50, 50), vy: G.rand(-70, 10), life: G.rand(0.4, 0.9), col });
  }
  function addLoot(k, v) { X.loot[k] = (X.loot[k] || 0) + v; }
  function rollLoot(table, mult) {
    const out = [];
    for (const k in table) { const v = Math.round(G.ri(table[k][0], table[k][1]) * (mult || 1)); addLoot(k, v); out.push(`${v} ${k}`); }
    return out.join(', ');
  }

  // ---------- Start ----------
  async function start(siteId) {
    const s = S();
    const site = G.SITES[siteId];
    X = {
      id: siteId, site, room: 0, rooms: site.rooms, bossRoom: !s.cleared[siteId], loot: {}, folkFound: 0,
      foe: null, charges: E().charges(s), hex: s.flags.cryptOpen ? 2 : 0, scroll: 0, walking: 0, anim: 0,
      heroOff: 0, foeFlash: 0, heroFlash: 0, shake: 0, nums: [], fx: [], foeAlpha: 0, bonusAtk: 0,
    };
    G.scene = 'expedition';
    G.busy = true;
    G.UI.battleShow(true);
    G.Audio.play('night');
    G.Audio.sfx('door');
    hud();
    log(site.intro);
    let outcome = 'home';
    for (X.room = 0; X.room < X.rooms; X.room++) {
      hud();
      await walk(1.3);
      if (X.room > 0 && Math.random() < 0.34) await eventRoom();
      else {
        const r = await fight(G.pick(site.pool));
        if (r !== 'won') { outcome = r; break; }
      }
      const heal = Math.round(E().maxHp(s) * 0.08);
      s.hero.hp = Math.min(E().maxHp(s), s.hero.hp + heal);
      hud();
      const last = X.room === X.rooms - 1;
      if (last && !X.bossRoom) break;
      const c = await G.UI.bactions([
        { id: 'on', label: last ? 'Face what waits ahead' : 'Press on', cls: 'primary' },
        { id: 'home', label: 'Return to the Keep', sub: 'keep your spoils' },
      ]);
      if (c === 'home') { outcome = 'home'; X.room = 99; break; }
    }
    if (outcome === 'home' && X.bossRoom && X.room === X.rooms) {
      X.room = X.rooms;
      hud();
      await walk(1.6);
      const r = await fight(site.boss);
      if (r === 'won') {
        s.cleared[siteId] = true;
        if (G.FOES[site.boss].final) return finale();
        log(`${site.name} is cleansed. Something golden glints in the ruin: a Shard of the Sun.`, 'gold');
        G.Audio.sfx('level');
        s.shards = Math.min(3, s.shards + 1);
        await wait(1600);
      } else outcome = r;
    }
    await finish(outcome);
  }

  async function finish(outcome) {
    const s = S();
    if (outcome === 'dead') {
      log('Your folk find you at the treeline at dawn and drag you home. Half your spoils are lost.', 'bad');
      for (const k in X.loot) X.loot[k] = Math.floor(X.loot[k] / 2);
      s.hero.hp = Math.ceil(E().maxHp(s) * 0.3);
      s.dread = Math.min(100, s.dread + 10);
      await wait(2200);
    }
    if (outcome === 'fled') { log('You run until the Keep\'s fire is in sight.'); await wait(1200); }
    E().gain(s, X.loot);
    s.folk += X.folkFound;
    const got = Object.keys(X.loot).filter((k) => X.loot[k] > 0).map((k) => `${X.loot[k]} ${k}`);
    if (X.folkFound) got.push(`${X.folkFound} survivor${X.folkFound > 1 ? 's' : ''}`);
    leave();
    if (got.length) G.UI.toast('Brought home: ' + got.join(', '));
  }
  function leave() {
    G.UI.battleShow(false);
    G.scene = 'keep';
    G.busy = false;
    X = null;
    G.World.placeHero(20 * 16, 24 * 16, 'up');
    G.World.syncNPCs();
    G.save();
  }

  // ---------- Events ----------
  const EVENTS = [
    {
      text: 'A toppled wagon, half-sunk in ash. A few crates are still sealed.',
      acts: [{ id: 'take', label: 'Pry them open' }],
      run: () => { log('Inside: ' + rollLoot({ timber: [8, 16], stone: [6, 14], food: [6, 14] }) + '.', 'gold'); },
    },
    {
      text: 'A roadside shrine to the old Sun. Someone left a candle here, long ago.',
      acts: [{ id: 'pray', label: 'Pray', sub: 'heal' }, { id: 'pry', label: 'Pry off the gold leaf', sub: 'gold' }],
      run: (a, s) => {
        if (a === 'pray') { const h = Math.round(E().maxHp(s) * 0.4); s.hero.hp = Math.min(E().maxHp(s), s.hero.hp + h); G.Audio.sfx('heal'); log(`Warmth, faint as a memory. +${h} health.`, 'good'); G.Story.align(2); }
        else { const g = G.ri(15, 25); addLoot('gold', g); G.Audio.sfx('coin'); log(`${g} gold. The candle stub topples over.`); G.Story.align(-3); }
      },
    },
    {
      text: 'Someone is hiding in a hollow log, shivering. A girl, maybe twelve. She has a knife and knows how to hold it.',
      acts: [{ id: 'take', label: 'Bring her home', sub: '+1 folk' }, { id: 'leave', label: 'Leave her some food' }],
      run: (a) => { if (a === 'take') { X.folkFound++; log('She follows three steps behind you, all the way.', 'good'); G.Story.align(3); } else log('She takes the food without a word.'); },
    },
    {
      text: 'A well in the middle of nowhere. It whispers your name.',
      acts: [{ id: 'drink', label: 'Drink' }, { id: 'walk', label: 'Walk on' }],
      run: (a, s) => {
        if (a !== 'drink') { log('The whispering follows you for a while.'); return; }
        if (Math.random() < 0.55) { s.hero.hp = E().maxHp(s); G.Audio.sfx('heal'); log('Cold and clean. You feel whole.', 'good'); }
        else { s.hero.hp = Math.max(1, s.hero.hp - E().maxHp(s) * 0.2); const up = E().gainXp(s, 10); G.Audio.sfx('hurt'); log('It tastes of ash and someone else\'s memories. +10 xp.', 'bad'); if (up) log('You feel stronger. Level up!', 'gold'); }
      },
    },
    {
      text: 'A fallen knight, still clutching a notched sword. His shield bears your house\'s flame.',
      acts: [{ id: 'take', label: 'Take his sword', sub: '+2 attack this trip' }, { id: 'bury', label: 'Bury him', sub: 'dread falls' }],
      run: (a, s) => {
        if (a === 'take') { X.bonusAtk += 2; log('It is heavier than yours, and better balanced.'); }
        else { s.dread = Math.max(0, s.dread - 8); G.Story.align(3); log('You say the old words. Somewhere far away, Maud looks up.', 'good'); }
      },
    },
  ];
  async function eventRoom() {
    const ev = G.pick(EVENTS);
    log(ev.text);
    const a = await G.UI.bactions(ev.acts);
    ev.run(a, S());
    hud();
    await wait(900);
  }

  // ---------- Battle ----------
  async function fight(foeId) {
    const s = S();
    const F = G.FOES[foeId];
    X.foe = Object.assign({}, F, { id: foeId, max: F.hp, hp: F.hp, turn: 0, charging: false });
    X.foeAlpha = 0;
    G.Audio.play(F.boss ? 'boss' : 'battle');
    log(F.boss ? `${F.name} rises out of the dark.` : `A ${F.name.toLowerCase()} lurches out of the dark.`, F.boss ? 'bad' : '');
    if (F.final) {
      log('He is taller than a man, and older than the Keep. His crown is made of nails.', 'bad');
    }
    hud();
    await wait(500);
    let guarding = false, riposte = false;
    for (;;) {
      hud();
      const atk = E().atk(s) + X.bonusAtk;
      const est = Math.max(1, atk - X.foe.def);
      const acts = [
        { id: 'strike', label: 'Strike', sub: `about ${riposte ? Math.round(est * 1.5) : est}`, cls: 'primary' },
        { id: 'guard', label: 'Guard', sub: 'blunt, then riposte' },
        { id: 'ember', label: 'Ember', sub: `${X.charges} left${F.hollow ? ', burns Hollow' : ''}`, disabled: X.charges <= 0 },
      ];
      if (s.flags.cryptOpen) acts.push({ id: 'hex', label: 'Hex', sub: `${X.hex} left, drains life`, disabled: X.hex <= 0 });
      acts.push({ id: 'tonic', label: 'Tonic', sub: `${s.hero.tonics} left`, disabled: s.hero.tonics <= 0 || s.hero.hp >= E().maxHp(s) });
      if (!F.boss) acts.push({ id: 'flee', label: 'Flee', sub: '60% chance' });
      const a = await G.UI.bactions(acts);
      guarding = false;

      if (a === 'strike') {
        await lunge();
        let d = Math.max(1, atk - X.foe.def + G.ri(-1, 2));
        const crit = Math.random() < 0.1;
        if (crit) d *= 2;
        if (riposte) d = Math.round(d * 1.5);
        riposte = false;
        hitFoe(d, crit ? P.y : P.w);
        log(crit ? `A clean blow! ${d} damage.` : `You strike for ${d}.`);
      } else if (a === 'guard') {
        guarding = true; riposte = true;
        G.Audio.sfx('guard');
        log('You set your feet and raise your guard.');
      } else if (a === 'ember') {
        X.charges--;
        G.Audio.sfx('ember');
        burst(HX() + 10, GROUND - 40, P.y, 18);
        await wait(250);
        let d = Math.round(atk * 1.6 * (F.hollow ? 1.5 : 1));
        hitFoe(d, P.o);
        burst(FX(), GROUND - 40, P.o, 26);
        log(F.hollow ? `Holy fire pours into the Hollow thing. ${d} damage!` : `The Ember flares. ${d} damage.`, 'gold');
      } else if (a === 'hex') {
        X.hex--;
        G.Audio.sfx('hex');
        const d = Math.round(atk * 1.2);
        hitFoe(d, P.P);
        burst(FX(), GROUND - 40, P.P, 18);
        const heal = Math.round(d * 0.5);
        s.hero.hp = Math.min(E().maxHp(s), s.hero.hp + heal);
        num('+' + heal, HX(), GROUND - 60, P.e);
        s.dread = Math.min(100, s.dread + 2);
        log(`The Hex drinks ${d} life and gives you ${heal} of it. It tastes of graves.`, 'hex');
      } else if (a === 'tonic') {
        s.hero.tonics--;
        const h = Math.round(E().maxHp(s) * 0.5);
        s.hero.hp = Math.min(E().maxHp(s), s.hero.hp + h);
        num('+' + h, HX(), GROUND - 60, P.e);
        G.Audio.sfx('heal');
        log(`Bitter. Effective. +${h} health.`, 'good');
      } else if (a === 'flee') {
        if (Math.random() < 0.6) { log('You break away into the dark.'); X.foe = null; return 'fled'; }
        log('It cuts off your escape!', 'bad');
      }
      hud();
      await wait(450);

      if (X.foe.hp <= 0) return victory();

      // Foe's turn
      X.foe.turn++;
      if (F.final && !X.foe.charging && X.foe.turn % 3 === 2) {
        X.foe.charging = true;
        log('The King draws the dark into himself. Guard!', 'bad');
        await wait(600);
        continue;
      }
      let mult = Math.random() < 0.15 ? 1.5 : 1;
      if (X.foe.charging) { mult = 2.2; X.foe.charging = false; }
      let d = Math.max(1, Math.round((X.foe.atk - E().def(s) + G.ri(-1, 2)) * mult));
      if (guarding) d = Math.max(1, Math.round(d * 0.4));
      X.foeLunge = 0.25;
      await wait(180);
      s.hero.hp -= d;
      X.heroFlash = 0.15; X.shake = 0.2;
      num(d, HX(), GROUND - 70, P.R);
      G.Audio.sfx('hurt');
      log(mult > 2 ? `A wave of dusk crashes over you. ${d} damage!` : mult > 1 ? `A savage blow! ${d} damage.` : `${X.foe.name} hits you for ${d}.`, 'bad');
      hud();
      await wait(450);
      if (s.hero.hp <= 0) { s.hero.hp = 0; log('The dark closes over you.', 'bad'); await wait(900); X.foe = null; return 'dead'; }
    }
  }
  function hitFoe(d, col) {
    X.foe.hp -= d;
    X.foeFlash = 0.15;
    num(d, FX(), GROUND - 80, col);
    G.Audio.sfx('hit');
  }
  function lunge() { X.heroOff = 0.25; return wait(180); }

  async function victory() {
    const s = S();
    const F = X.foe;
    X.dying = 1;
    G.Audio.sfx('coin');
    const g = G.ri(F.gold[0], F.gold[1]);
    if (g) addLoot('gold', g);
    const up = F.xp ? E().gainXp(s, F.xp) : 0;
    log(`${F.name} falls.${F.xp ? ` +${F.xp} xp` : ''}${g ? `, ${g} gold` : ''}.`, 'good');
    if (F.boss && !F.final) log('Spoils: ' + rollLoot(X.site.loot, 2) + '.', 'gold');
    else if (Math.random() < 0.5) log('You also find ' + rollLoot(X.site.loot, 0.5) + '.');
    if (up) { G.Audio.sfx('level'); log(`You are now level ${s.hero.lvl}. Your wounds close.`, 'gold'); }
    await wait(1100);
    X.foe = null; X.dying = 0;
    G.Audio.play('night');
    hud();
    return 'won';
  }

  async function finale() {
    G.UI.battleShow(false);
    X.foe = null;
    X.kneel = true;
    const kind = await G.Story.finale();
    const s = S();
    if (kind === 'dawn') s.flags.dawn = true;
    if (kind === 'ash') { s.flags.crown = true; s.raidPause = 99999; }
    if (kind === 'flame') s.hearth = Math.min(5, s.hearth + 1);
    X.ending = kind;
    await G.UI.scene(G.Story.epilogue(kind));
    const titles = { dawn: 'Dawn Rekindled', flame: 'The Last Flame', ash: 'Crown of Ash' };
    const choice = await G.UI.openPanel(() => ({
      title: titles[kind],
      body: `<p class="lore">You reached an ending of Ashen Keep. There are three. The Keep is still yours to tend, and the folk still need you.</p>`,
      actions: [{ label: 'Return to the Keep', cls: 'primary', value: 'keep' }, { label: 'Title screen', value: 'title' }],
    }), { locked: true });
    leave();
    G.Story.refreshObjective();
    if (choice === 'title') location.reload();
  }

  // ---------- Update / render ----------
  function update(dt) {
    if (!X) return;
    X.anim += dt;
    if (X.walking > 0) {
      X.walking -= dt; X.scroll += dt * 60;
      if (X.walking <= 0) { X.walking = 0; const f = X.walkDone; X.walkDone = null; f && f(); }
    }
    X.heroOff = Math.max(0, X.heroOff - dt);
    X.foeLunge = Math.max(0, (X.foeLunge || 0) - dt);
    X.foeFlash = Math.max(0, X.foeFlash - dt);
    X.heroFlash = Math.max(0, X.heroFlash - dt);
    X.shake = Math.max(0, X.shake - dt);
    if (X.foe) X.foeAlpha = Math.min(1, X.foeAlpha + dt * 2.5);
    if (X.dying) X.dying = Math.max(0, X.dying - dt * 1.2);
    for (let i = X.nums.length - 1; i >= 0; i--) { const n = X.nums[i]; n.life -= dt; n.y -= dt * 18; if (n.life <= 0) X.nums.splice(i, 1); }
    for (let i = X.fx.length - 1; i >= 0; i--) { const p = X.fx[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; if (p.life <= 0) X.fx.splice(i, 1); }
  }

  function pine(c, x, base, h, col) {
    for (let i = 0; i < h; i++) { const w = 1 + Math.floor((i % Math.ceil(h / 3)) * 0.8 + i * 0.15); R(c, x - w, base - h + i, w * 2, 1, col); }
    R(c, x - 1, base, 2, 6, col);
  }
  const mod = (a, m) => ((a % m) + m) % m;

  function background(c, kind, sc, t, lights) {
    const oy = GROUND - 150;
    const sky = { forest: '#120e1c', chapel: '#0e1220', mire: '#121812', throne: '#120a16' }[kind];
    R(c, 0, 0, G.W, G.H, sky);
    c.save();
    c.translate(0, oy);
    const shifted = [];
    backgroundBody(c, kind, sc, t, shifted);
    c.restore();
    for (const L of shifted) lights.push({ x: L.x, y: L.y + oy, r: L.r, s: L.s, w: L.w });
  }
  function backgroundBody(c, kind, sc, t, lights) {
    const GROUND = 150; // drawn in a 180-tall frame, shifted into place by background()
    if (kind === 'forest') {
      R(c, 0, -400, G.W, 580, '#120e1c'); R(c, 0, 50, G.W, 40, '#151020');
      for (let i = 0; i < 10; i++) pine(c, mod(i * 41 - sc * 0.25, Math.max(360, G.W + 60)) - 20, 120, 50 + (i * 7) % 20, '#1d1730');
      for (let i = 0; i < 7; i++) pine(c, mod(i * 59 - sc * 0.6, Math.max(400, G.W + 60)) - 40, 146, 80 + (i * 13) % 30, '#0f0b16');
      R(c, 0, GROUND, G.W, 30, '#1b1624'); R(c, 0, GROUND, G.W, 1, '#2a2438');
      for (let i = 0; i < 20; i++) R(c, mod(i * 23 - sc, Math.max(340, G.W + 60)) - 10, GROUND + 6 + (i * 7) % 20, 3, 1, '#2e2a3a');
      c.globalAlpha = 0.25; R(c, 0, 126, G.W, 10, '#6b6584'); c.globalAlpha = 1;
    } else if (kind === 'chapel') {
      R(c, 0, -400, G.W, 580, '#0e1220');
      for (let i = 0; i < 5; i++) {
        const x = mod(i * 90 - sc * 0.4, Math.max(450, G.W + 60)) - 60;
        R(c, x, 20, 14, 130, '#1a1e30'); R(c, x + 50, 20, 14, 130, '#1a1e30');
        for (let j = 0; j < 18; j++) { const w = Math.round(25 * Math.sin((j / 18) * Math.PI / 2)); R(c, x + 32 - w, 20 + 18 - j, w * 2, 1, '#1a1e30'); }
        R(c, x + 22, 46, 20, 40, '#22304a');
        lights.push({ x: x + 32, y: 66, r: 50, s: 0.55, w: 0 });
      }
      R(c, 0, GROUND - 6, G.W, 36, '#0c1820');
      for (let i = 0; i < 14; i++) R(c, mod(i * 31 - sc * 1.2 + Math.sin(t + i) * 4, Math.max(340, G.W + 60)) - 10, GROUND + (i * 5) % 26, 8, 1, '#2a4a5a');
    } else if (kind === 'mire') {
      R(c, 0, -400, G.W, 580, '#121812'); R(c, 0, 40, G.W, 60, '#151d15');
      for (let i = 0; i < 6; i++) {
        const x = mod(i * 70 - sc * 0.5, Math.max(420, G.W + 60)) - 50;
        for (let j = 0; j < 4; j++) {
          const rx = x + j * 12;
          for (let k = 0; k < 30; k++) { const yy = 140 - k * 2; const xx = rx + Math.round(Math.sin(k / 30 * 2.4) * 12); R(c, xx, yy, 3, 2, '#5a5648'); }
        }
      }
      R(c, 0, GROUND, G.W, 30, '#182016');
      for (let i = 0; i < 6; i++) { const x = mod(i * 63 - sc, Math.max(380, G.W + 60)) - 30; R(c, x, GROUND + 8 + (i * 5) % 12, 18, 3, '#223828'); }
      c.globalAlpha = 0.3; R(c, 0, 118, G.W, 20, '#3f5a3c'); c.globalAlpha = 1;
    } else {
      R(c, 0, -400, G.W, 580, '#120a16');
      for (let i = 0; i < 6; i++) {
        const x = mod(i * 70 - sc * 0.5, Math.max(420, G.W + 60)) - 50;
        R(c, x, -400, 18, GROUND + 400, '#24162a'); R(c, x + 2, -400, 2, GROUND + 400, '#2e1c36');
        R(c, x + 22, 30, 12, 34, P.r); R(c, x + 25, 40, 6, 6, P.k);
        R(c, x + 6, 70, 6, 6, P.k); R(c, x + 7, 66, 4, 4, P.o);
        lights.push({ x: x + 9, y: 66, r: 36, s: 0.75, w: 1 });
      }
      if (X && X.room >= X.rooms) { const tx = FX() - 8; R(c, tx, 60, 40, 90, '#0a060c'); R(c, tx + 4, 52, 4, 10, '#0a060c'); R(c, tx + 32, 52, 4, 10, '#0a060c'); }
      R(c, 0, GROUND, G.W, 30, '#1a1020');
      for (let i = 0; i < 16; i++) R(c, mod(i * 24 - sc, Math.max(340, G.W + 60)) - 10, GROUND, 1, 30, '#24162a');
    }
  }

  function render(ctx, t) {
    if (!X) return;
    GROUND = G.H - 30;
    const s = S();
    const lights = [];
    const sh = X.shake > 0 ? G.ri(-2, 2) : 0;
    ctx.setTransform(1, 0, 0, 1, sh, 0);
    ctx.imageSmoothingEnabled = false;
    background(ctx, X.site.bg, X.scroll, t, lights);

    // the Warden
    const hx = HX() + (X.heroOff > 0 ? Math.sin((X.heroOff / 0.25) * Math.PI) * 26 : 0);
    const frame = X.walking > 0 ? Math.floor(X.anim * 7) % 2 : 0;
    const himg = G.SPR.hero.right[frame];
    ctx.globalAlpha = 0.5; R(ctx, hx - 14, GROUND - 2, 28, 4, P.k); ctx.globalAlpha = 1;
    ctx.drawImage(himg, Math.round(hx - 24), GROUND - 48 - (frame ? 2 : 0), 48, 48);
    if (X.heroFlash > 0) { ctx.globalAlpha = 0.6; ctx.drawImage(G.silhouette(himg, '#c43a3a'), Math.round(hx - 24), GROUND - 48, 48, 48); ctx.globalAlpha = 1; }
    lights.push({ x: hx + 12, y: GROUND - 30, r: 78 + (s.flags.lantern ? 18 : 0), s: 0.92, w: 0.6 });

    // the foe
    if (X.foe || X.dying) {
      const f = X.foe || {};
      const spr = G.FOE[f.spr];
      if (spr) {
        const size = f.boss ? (f.final ? 96 : 80) : 64;
        const fx = FX() - (X.foeLunge > 0 ? Math.sin((X.foeLunge / 0.25) * Math.PI) * 24 : 0);
        const bob = Math.round(Math.sin(t * 3) * (f.spr && f.spr.indexOf('wraith') === 0 ? 3 : 1));
        ctx.globalAlpha = 0.5; R(ctx, fx - size / 3, GROUND - 2, (size * 2) / 3, 4, P.k);
        ctx.globalAlpha = X.dying ? X.dying : X.foeAlpha;
        ctx.drawImage(X.foeFlash > 0 ? spr.flash : spr.img, Math.round(fx - size / 2), GROUND - size + bob, size, size);
        ctx.globalAlpha = 1;
        lights.push({ x: fx, y: GROUND - size / 2, r: size, s: 0.6, w: 0 });
        if (f.charging) lights.push({ x: fx, y: GROUND - size / 2, r: 30, s: 0.9, w: 0 });
      }
    }
    if (X.kneel) {
      const spr = G.FOE.king;
      ctx.drawImage(spr.img, 0, 0, 16, 16, FX() - 36, GROUND - 60, 64, 64);
      lights.push({ x: FX() - 4, y: GROUND - 30, r: 70, s: 0.6, w: 0 });
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    G.Light.render(ctx, 0, 0, X.ending === 'dawn' ? 0.2 : 0.62, lights);

    for (const p of X.fx) { ctx.fillStyle = p.col; ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
    for (const n of X.nums) G.drawText(ctx, n.txt, n.x, Math.round(n.y), n.col, 2);
  }

  return { start, update, render, get active() { return !!X; } };
})();
