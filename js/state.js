// Game state, economy simulation, day/night clock and saving.
(function () {
  const SAVE_KEY = 'ashenkeep.save.v1';
  G.DAY_LEN = 180; // seconds of real time per full day

  G.newState = function () {
    const b = {};
    for (const k in G.BUILDINGS) b[k] = 0;
    return {
      v: 1, day: 1, time: 0.1, step: 0,
      res: { gold: 50, timber: 30, stone: 15, food: 30 },
      folk: 3, dread: 10, light: 0,
      b, hearth: 0, keep: 1, shards: 0,
      hero: { lvl: 1, xp: 0, hp: 26, weapon: 0, armor: 0, tonics: 1, x: 20 * 16, y: 23 * 16, dir: 'up' },
      cleared: {}, flags: {}, raidMult: 1, raidPause: 0, nextEventDay: 3, ending: null,
      saved: Date.now(),
    };
  };
  G.S = G.newState();

  const E = (G.Eco = {});
  E.cap = (S) => 2 + 2 * S.keep + 4 * S.b.cottages;
  E.workers = (S) => {
    let n = 0;
    for (const k in G.BUILDINGS) if (G.BUILDINGS[k].worker) n += S.b[k];
    return n;
  };
  E.eff = (S) => { const w = E.workers(S); return w ? Math.min(1, S.folk / w) : 1; };
  E.dreadMult = (S) => (S.dread > 85 ? 0.5 : S.dread > 60 ? 0.75 : 1);
  E.maxLevel = (S) => Math.min(5, S.keep + 1);

  E.phase = (t) => (t < 0.55 ? 'day' : t < 0.65 ? 'dusk' : t < 0.95 ? 'night' : 'dawn');
  E.isNight = (t) => t >= 0.6 && t < 0.95;
  E.darkness = (t) => {
    const D = G.S && G.S.flags.dawn ? 0.12 : 0.36, N = G.S && G.S.flags.dawn ? 0.6 : 0.8;
    if (t < 0.55) return D;
    if (t < 0.65) return D + (N - D) * ((t - 0.55) / 0.1);
    if (t < 0.92) return N;
    return N - (N - D) * ((t - 0.92) / 0.08);
  };

  E.rates = function (S) {
    const m = E.eff(S) * E.dreadMult(S);
    const night = E.isNight(S.time);
    const r = {
      timber: 0.5 * S.b.woodcutter * m,
      stone: 0.35 * S.b.quarry * m,
      food: 0.6 * S.b.cellar * m,
      gold: ((0.2 + 0.03 * S.folk) * S.b.tithe + 0.4 * S.b.crypt) * m,
    };
    const burn = S.hearth ? 0.06 + 0.04 * S.hearth : 0;
    r.timber -= burn;
    r.food -= 0.05 * S.folk;
    let d = night ? 0.06 + 0.004 * S.day : -0.015;
    d -= 0.012 * S.hearth;
    d -= 0.03 * S.b.chapel * (S.flags.sealed ? 1.5 : 1);
    d += 0.015 * S.b.crypt;
    if (S.hearth && S.res.timber <= 0) d += 0.25;
    if (S.res.food <= 0) d += 0.1;
    r.dread = d;
    r.burn = burn;
    return r;
  };

  E.defense = (S) => 3 + 3 * S.keep + 6 * S.b.watchtower + 2 * S.hearth + 2 * S.hero.lvl +
    (S.flags.corvin ? 4 : 0) + (S.flags.deserter ? 3 : 0);
  E.threat = (S) => Math.round((4 + 2.6 * Math.min(S.day, 12) + 1.6 * Math.max(0, S.day - 12)) * S.raidMult);

  // Hero
  E.maxHp = (S) => 20 + 6 * S.hero.lvl + 6 * S.hero.armor;
  E.atk = (S) => 4 + 2 * S.hero.lvl + 3 * S.hero.weapon;
  E.def = (S) => 1 + S.hero.lvl + 2 * S.hero.armor;
  E.xpNeed = (lvl) => 10 * lvl + 4 * lvl * lvl;
  E.charges = (S) => Math.max(1, S.hearth) + (S.shards > 0 ? 1 : 0);
  E.maxTonics = (S) => 1 + 2 * S.b.apothecary;

  E.canAfford = (S, cost) => Object.keys(cost).every((k) => S.res[k] >= cost[k]);
  E.pay = (S, cost) => { for (const k in cost) S.res[k] -= cost[k]; };
  E.gain = (S, loot) => { for (const k in loot) S.res[k] = (S.res[k] || 0) + loot[k]; };

  E.gainXp = function (S, xp) {
    S.hero.xp += xp;
    let ups = 0;
    while (S.hero.xp >= E.xpNeed(S.hero.lvl)) {
      S.hero.xp -= E.xpNeed(S.hero.lvl);
      S.hero.lvl++;
      ups++;
    }
    if (ups) S.hero.hp = E.maxHp(S);
    return ups;
  };

  // ---------- Simulation ----------
  const acc = { grow: 0, starve: 0, flee: 0, save: 0, warn: 0 };

  E.tick = function (S, dt) {
    const clockRuns = S.step >= G.STEP.NIGHT;
    const r = E.rates(S);
    for (const k of ['gold', 'timber', 'stone', 'food']) {
      S.res[k] = Math.max(0, S.res[k] + r[k] * dt);
    }
    S.dread = G.clamp(S.dread + r.dread * dt, 0, 100);

    const maxHp = E.maxHp(S);
    S.hero.hp = Math.min(maxHp, S.hero.hp + (0.5 + 0.3 * S.b.apothecary) * dt);

    // Folk arrive, starve or flee
    acc.grow += dt; acc.starve += dt; acc.flee += dt;
    if (acc.grow > 15) {
      acc.grow = 0;
      if (S.hearth && S.res.food > 10 && S.folk < E.cap(S) && S.dread < 60) {
        S.folk++;
        G.UI.toast(G.pick(['A wanderer follows the light to your gate.', 'A family arrives, ash on their shoulders.', 'Someone new warms their hands at the Hearth.']) + ' +1 folk');
      }
    }
    if (acc.starve > 12) {
      acc.starve = 0;
      if (S.res.food <= 0 && S.folk > 1) { S.folk--; G.UI.toast('The cellars are empty. One of your folk wasted away.', 'bad'); }
    }
    if (acc.flee > 20) {
      acc.flee = 0;
      if (S.dread > 85 && S.folk > 1) { S.folk--; G.UI.toast('Dread grips the Keep. Someone fled into the dark.', 'bad'); }
    }
    acc.warn += dt;
    if (acc.warn > 25 && S.hearth && S.res.timber <= 0) {
      acc.warn = 0;
      G.UI.toast('The Hearth gutters. It needs timber.', 'bad');
    }

    // Clock
    if (clockRuns) {
      const prevPhase = E.phase(S.time);
      S.time += dt / G.DAY_LEN;
      const ph = E.phase(S.time);
      if (ph !== prevPhase) {
        if (ph === 'dusk') G.UI.toast('Dusk deepens. The Hollow will come with the dark.');
        if (ph === 'night') G.Audio.sfx('bell');
      }
      if (S.time >= 1) {
        S.time -= 1;
        G.Keep && G.Keep.dawn();
      }
    }

    acc.save += dt;
    if (acc.save > 10) { acc.save = 0; G.save(); }
  };

  // Resolve the night's raid and start a new day. Returns a report.
  E.resolveRaid = function (S) {
    const threat = E.threat(S);
    const def = E.defense(S);
    const rep = { day: S.day, threat, def, lines: [] };
    if (S.raidPause > 0) {
      S.raidPause--;
      rep.held = true;
      rep.lines.push('The Hollow kept their bargain. No one came to the walls.');
    } else if (threat <= def) {
      rep.held = true;
      const g = 2 + S.day;
      S.res.gold += g;
      rep.lines.push(`The Hollow came at the walls. The walls held.`);
      rep.lines.push(`Your folk pried ${g} gold from the fallen.`);
    } else {
      rep.held = false;
      const deficit = threat - def;
      const lost = Math.min(S.folk - 1, Math.ceil(deficit / 5));
      S.folk -= lost;
      for (const k of ['gold', 'timber', 'stone', 'food']) S.res[k] = Math.floor(S.res[k] * 0.85);
      S.dread = Math.min(100, S.dread + 12);
      rep.lines.push('The Hollow breached the walls before dawn drove them back.');
      if (lost > 0) rep.lines.push(`${lost} of your folk ${lost === 1 ? 'was' : 'were'} taken into the dark.`);
      rep.lines.push('Stores were looted. Dread rises.');
    }
    S.raidMult = 1;
    S.day++;
    return rep;
  };

  // ---------- Save / load ----------
  G.save = function () {
    if (G.scene === 'title') return;
    try {
      G.S.saved = Date.now();
      localStorage.setItem(SAVE_KEY, JSON.stringify(G.S));
    } catch (e) {}
  };
  G.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };
  G.load = function () {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      const base = G.newState();
      const merged = Object.assign(base, s);
      merged.res = Object.assign(base.res, s.res);
      merged.b = Object.assign(G.newState().b, s.b);
      merged.hero = Object.assign(G.newState().hero, s.hero);
      merged.flags = s.flags || {};
      merged.cleared = s.cleared || {};
      return merged;
    } catch (e) { return null; }
  };
  G.wipe = function () { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} };

  // Production while the player was away: half rate, capped at two hours.
  E.offline = function (S) {
    const secs = Math.min(7200, Math.max(0, (Date.now() - (S.saved || Date.now())) / 1000));
    if (secs < 60 || S.step < G.STEP.NIGHT) return null;
    const r = E.rates(Object.assign({}, S, { time: 0.2 }));
    const got = {};
    for (const k of ['gold', 'timber', 'stone', 'food']) {
      const v = Math.floor(Math.max(0, r[k]) * secs * 0.5);
      if (v > 0) { got[k] = v; S.res[k] += v; }
    }
    return { mins: Math.round(secs / 60), got };
  };
})();
