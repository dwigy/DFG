// Static game data: buildings, foes, expedition sites.
(function () {
  // Story step indices (see story.js STEPS)
  G.STEP = { LIGHT: 0, BUILD: 1, NIGHT: 2, DEFEND: 3, GLOAM: 4, BELL: 5, DROWNED: 6, PREPARE: 7, MIRE: 8, THRONE: 9, FREE: 10 };

  const f1 = (n) => (Math.round(n * 100) / 100).toString();

  G.BUILDINGS = {
    woodcutter: {
      name: "Woodcutter's Hut", tile: [4, 4], base: { gold: 15 }, unlock: 1, worker: true,
      lore: 'Axes bite the black pines at the edge of the Gloamwood. The sap runs dark as tar, and burns twice as long.',
      eff: (L) => `${f1(0.5 * L)} timber / sec`,
    },
    quarry: {
      name: 'Stone Quarry', tile: [10, 4], base: { gold: 25, timber: 15 }, unlock: 1, worker: true,
      lore: 'The fallen curtain wall gives up its bones. Every block was cut by a Warden three hundred years dead.',
      eff: (L) => `${f1(0.35 * L)} stone / sec`,
    },
    cellar: {
      name: 'Fungus Cellar', tile: [27, 4], base: { gold: 20, timber: 15 }, unlock: 1, worker: true,
      lore: 'Nothing grows in the Long Dusk but pale caps and blue-gilled things. Grim fare. It keeps.',
      eff: (L) => `${f1(0.6 * L)} food / sec`,
    },
    cottages: {
      name: 'Cottages', tile: [33, 4], base: { timber: 30, stone: 10 }, unlock: 1,
      lore: 'Thatch, daub and a door that bars from the inside. In the Long Dusk, that is wealth.',
      eff: (L) => `Houses ${4 * L} more folk`,
    },
    tithe: {
      name: 'Tithe Hall', tile: [4, 11], base: { timber: 25 }, unlock: 1, worker: true,
      lore: 'Folk who are fed and warm will pay to stay that way. More folk, more coin.',
      eff: (L) => `${f1(0.2 * L)} gold / sec, +${f1(0.03 * L)} per folk`,
    },
    watchtower: {
      name: 'Watchtower', tile: [33, 11], base: { timber: 30, stone: 35 }, unlock: 1,
      lore: 'Crossbows, pitch and a bell to wake the sleepers. The Hollow hate a high place with a fire on it.',
      eff: (L) => `+${6 * L} defense against night raids`,
    },
    chapel: {
      name: 'Chapel of the Flame', tile: [4, 18], base: { gold: 50, stone: 50 }, unlock: 5,
      lore: 'Hymns to a Sun no one under twenty has seen. The singing helps more than the words.',
      eff: (L) => `Dread falls by ${f1(0.03 * L * 60)} / min`,
    },
    forge: {
      name: 'Forge', tile: [10, 18], base: { gold: 40, timber: 40, stone: 40 }, unlock: 4, worker: true,
      lore: 'An anvil older than the Keep. The smith swears it rings a different note when the Hollow are near.',
      eff: (L) => `Temper arms and armor up to rank ${L}`,
    },
    apothecary: {
      name: 'Apothecary', tile: [27, 18], base: { gold: 35, timber: 30, food: 25 }, unlock: 4, worker: true,
      lore: 'Bitterroot, grave-moss and a little prayer, boiled until the smell is unbearable.',
      eff: (L) => `Brew and carry up to ${2 * L} tonics; you heal faster at home`,
    },
    crypt: {
      name: 'The Crypt', tile: [33, 18], base: { stone: 40 }, unlock: 'crypt', worker: true,
      lore: 'The Wardens buried their dead with their wealth. The dead have no further use for it.',
      eff: (L) => `${f1(0.4 * L)} gold / sec, but dread creeps upward`,
    },
  };
  G.PLOT_ORDER = Object.keys(G.BUILDINGS);

  G.costFor = function (base, lvl, mult) {
    const out = {};
    for (const k in base) out[k] = Math.round(base[k] * Math.pow(mult || 1.75, lvl));
    return out;
  };
  G.buildCost = (id, cur) => G.costFor(G.BUILDINGS[id].base, cur);
  G.hearthCost = (cur) => G.costFor({ gold: 40, timber: 50, stone: 30 }, cur - 1, 1.9);
  G.keepCost = (cur) => G.costFor({ gold: 60, timber: 60, stone: 60 }, cur - 1, 2);
  G.weaponCost = (cur) => G.costFor({ gold: 30, stone: 15 }, cur, 1.8);
  G.armorCost = (cur) => G.costFor({ gold: 25, stone: 25 }, cur, 1.8);
  G.TONIC_COST = { gold: 10, food: 15 };

  G.FOES = {
    ghoul: { name: 'Ghoul', spr: 'ghoul', hp: 14, atk: 6, def: 1, xp: 6, gold: [2, 6] },
    hound: { name: 'Bone Hound', spr: 'hound', hp: 11, atk: 7, def: 0, xp: 5, gold: [1, 4] },
    rotmother: { name: 'The Rotmother', spr: 'rotmother', hp: 40, atk: 7, def: 2, xp: 24, gold: [20, 30], boss: true },
    wraith: { name: 'Wraith', spr: 'wraith', hp: 20, atk: 10, def: 2, xp: 12, gold: [4, 9], hollow: true },
    drowned: { name: 'Drowned Penitent', spr: 'drowned', hp: 26, atk: 10, def: 4, xp: 14, gold: [5, 10] },
    bishop: { name: 'The Drowned Bishop', spr: 'bishop', hp: 80, atk: 13, def: 5, xp: 48, gold: [40, 60], boss: true, hollow: true },
    mirehound: { name: 'Mire Hound', spr: 'mirehound', hp: 32, atk: 15, def: 5, xp: 22, gold: [6, 12] },
    knight: { name: 'Hollow Knight', spr: 'knight', hp: 40, atk: 16, def: 8, xp: 28, gold: [8, 16], hollow: true },
    wyrm: { name: 'The Bone Wyrm', spr: 'wyrm', hp: 130, atk: 18, def: 8, xp: 85, gold: [70, 90], boss: true },
    knightElite: { name: 'Thronesworn', spr: 'knightElite', hp: 55, atk: 21, def: 10, xp: 40, gold: [14, 24], hollow: true },
    wraithElite: { name: 'Grief Wraith', spr: 'wraithElite', hp: 48, atk: 23, def: 7, xp: 38, gold: [14, 24], hollow: true },
    king: { name: 'The Hollow King', spr: 'king', hp: 280, atk: 26, def: 10, xp: 0, gold: [0, 0], boss: true, hollow: true, final: true },
  };

  G.SITES = {
    gloamwood: {
      name: 'The Gloamwood', rec: 1, rooms: 3, pool: ['ghoul', 'hound'], boss: 'rotmother', bg: 'forest',
      unlock: (S) => S.step >= G.STEP.GLOAM, loot: { timber: [15, 30], gold: [4, 10] },
      blurb: 'Black pines and the things that nest in them. The first Shard was lost here.',
      intro: 'The pines close behind you like a door.',
    },
    drowned: {
      name: 'The Drowned Chapel', rec: 3, rooms: 3, pool: ['wraith', 'drowned'], boss: 'bishop', bg: 'chapel',
      unlock: (S) => S.step >= G.STEP.DROWNED, loot: { stone: [15, 30], gold: [8, 18] },
      blurb: 'A cathedral sunk to its knees in black water. The bells still ring beneath it.',
      intro: 'Cold water fills your boots. Somewhere below, a hymn is being sung backwards.',
    },
    mire: {
      name: 'The Bone Mire', rec: 5, rooms: 4, pool: ['mirehound', 'knight'], boss: 'wyrm', bg: 'mire',
      unlock: (S) => S.step >= G.STEP.MIRE, loot: { food: [20, 35], gold: [12, 25] },
      blurb: 'The battlefield where the last sunlit army fell. It never stopped fighting.',
      intro: 'Ribs the size of doorways rise from the fog.',
    },
    throne: {
      name: 'The Hollow Throne', rec: 7, rooms: 3, pool: ['knightElite', 'wraithElite'], boss: 'king', bg: 'throne',
      unlock: (S) => S.step >= G.STEP.THRONE, needKeep: 3, loot: { gold: [30, 50] },
      blurb: 'Where the light went to die. Where the King waits.',
      intro: 'The road ends at a door that was expecting you.',
    },
  };
})();
