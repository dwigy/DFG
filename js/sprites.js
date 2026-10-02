// Pixel art: palette, sprite sheets drawn from strings, tiny pixel font.
(function () {
  const PAL = {
    k: '#0d0b14', d: '#1d1730', s: '#3a3352', g: '#6b6584', b: '#c9bfa7', w: '#efe6d0',
    r: '#8c1c2b', R: '#c43a3a', o: '#e8772e', y: '#f4c95d', m: '#3f5a3c', M: '#6b8a4e',
    n: '#5a3a2a', N: '#8a5a3a', c: '#6fa3b8', C: '#a8d4e0', p: '#5b2a5e', P: '#8e4a8f',
    f: '#d9a07a', F: '#a86a4a', e: '#7fe0a0',
  };
  G.PAL = PAL;

  function make(rows, recolor) {
    const h = rows.length, w = rows[0].length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const x = cv.getContext('2d');
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        let ch = rows[j][i];
        if (ch === '.') continue;
        if (recolor && recolor[ch]) ch = recolor[ch];
        x.fillStyle = PAL[ch] || ch;
        x.fillRect(i, j, 1, 1);
      }
    }
    return cv;
  }
  function flip(src) {
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const x = cv.getContext('2d');
    x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
    return cv;
  }
  function silhouette(src, col) {
    const cv = document.createElement('canvas');
    cv.width = src.width; cv.height = src.height;
    const x = cv.getContext('2d');
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = col; x.fillRect(0, 0, cv.width, cv.height);
    return cv;
  }
  G.makeSprite = make;
  G.flipSprite = flip;
  G.silhouette = silhouette;

  // ---------- Humanoid template (the Warden and the folk of the keep) ----------
  const DOWN = [
    '................',
    '.....kkkkkk.....',
    '....kssssssk....',
    '...ksssggsssk...',
    '...kssffffssk...',
    '...ksfkffkfsk...',
    '...ksffffffsk...',
    '...kssFffFssk...',
    '...kkrrrrrrkk...',
    '..ksgrrssssgsk..',
    '..kfsgsggsgsfk..',
    '..kfsnnyynnsfk..',
    '...kssssssssk...',
    '....kss..ssk....',
    '....knk..knk....',
    '....kkk..kkk....',
  ];
  const UP = [
    '................',
    '.....kkkkkk.....',
    '....kssssssk....',
    '...ksssggsssk...',
    '...kssssssssk...',
    '...ksssggsssk...',
    '...kssssssssk...',
    '...kssssssssk...',
    '...kkrrrrrrkk...',
    '..kssssssssssk..',
    '..kfssssssssfk..',
    '..kfsssnnsssfk..',
    '...kssssssssk...',
    '....kss..ssk....',
    '....knk..knk....',
    '....kkk..kkk....',
  ];
  const RIGHT = [
    '................',
    '.....kkkkk......',
    '....ksssssk.....',
    '...kssssgssk....',
    '...ksssffffk....',
    '...kssffkfk.....',
    '...ksssffffk....',
    '....ksssFfk.....',
    '....kkrrrrk.....',
    '...ksrrssssk....',
    '...kssgsfgsk....',
    '...ksnnnyynk....',
    '....kssssssk....',
    '....kss.ssk.....',
    '....knk.knk.....',
    '....kkk.kkk.....',
  ];
  const LEGS_FB = ['...kss....ssk...', '...knk....knk...', '...kkk....kkk...'];
  const LEGS_SIDE = ['...kss...ssk....', '...knk...knk....', '...kkk...kkk....'];
  const walk = (rows, legs) => rows.slice(0, 13).concat(legs);

  function walker(recolor) {
    const d0 = make(DOWN, recolor), d1 = make(walk(DOWN, LEGS_FB), recolor);
    const u0 = make(UP, recolor), u1 = make(walk(UP, LEGS_FB), recolor);
    const r0 = make(RIGHT, recolor), r1 = make(walk(RIGHT, LEGS_SIDE), recolor);
    return { down: [d0, d1], up: [u0, u1], right: [r0, r1], left: [flip(r0), flip(r1)] };
  }

  const LOOKS = {
    hero: null,
    maud: { s: 'b', g: 'w', r: 'R', n: 'r', y: 'y' },
    corvin: { s: 'n', g: 'N', r: 'm', n: 'k', y: 'g' },
    isolde: { s: 'p', g: 'P', r: 'k', n: 'k', y: 'e', f: 'w', F: 'C' },
    pip: { s: 'm', g: 'M', r: 'o', n: 'n' },
    envoy: { s: 'd', g: 'c', r: 'C', n: 'd', y: 'R', f: 'C', F: 'c' },
    folk1: { s: 'n', g: 'b', r: 'N', n: 'k' },
    folk2: { s: 'g', g: 'b', r: 'r', n: 'n' },
    folk3: { s: 'm', g: 'n', r: 'b', n: 'k' },
    folk4: { s: 'F', g: 'N', r: 'g', n: 'n' },
  };

  // ---------- Foes ----------
  const FOES = {
    ghoul: [
      '................', '......kkkk......', '.....kMMMMk.....', '....kMRMMRMk....',
      '....kMMMMMMk....', '....kMkwkwMk....', '.....kMMMMk.....', '...kkmMMMMmkk...',
      '..kMmmMMMMmmMk..', '.kMk.kmMMmk.kMk.', '.kbk.kmmmmk.kbk.', '.bkb.kmMMmk.bkb.',
      '.....kmk.kmk....', '.....kMk.kMk....', '....kMMk.kMMk...', '....kkkk.kkkk...',
    ],
    wraith: [
      '................', '......kkkk......', '.....kCCCCk.....', '....kCCCCCCk....',
      '....kCkCCkCk....', '....kCkCCkCk....', '....kCCCCCCk....', '....kCCkkCCk....',
      '...kcCCCCCCck...', '..kcckCCCCkcck..', '.kc.kcCCCCck.ck.', '....kcCCCCck....',
      '....kccCCcck....', '.....kccccck....', '.....kc.kc.k....', '......k...k.....',
    ],
    knight: [
      '.......kk.......', '......krrk......', '.....kssssk.....', '....ksggggsk....',
      '....ksRkkRsk....', '....ksggggsk....', '.....kssssk.....', '..kkksggggskkk..',
      '.ksgksssssskgsk.', '.ksgksgrrgskgsk.', '.kfk.ksgsssk.kbk', '.kkk.ksssssk.kbk',
      '.....ksk.ksk.kbk', '.....ksk.ksk.kwk', '....kssk.kssk.k.', '....kkkk.kkkk...',
    ],
    hound: [
      '................', '................', '................', '..........kk.k..',
      '.........kbbkbk.', '........kbbbbbk.', '........kbRbbbbk', '.k.....kbbbbkwwk',
      'kbk...kbbbbbkkk.', '.kbkkkbbkbkbk...', '..kbbbbkbkbbk...', '..kbbkbbbbbbk...',
      '..kbk.kbk.kbk...', '..kbk.kbk.kbk...', '.kbbk.kbbkkbbk..', '.kkk..kkk.kkk...',
    ],
    bishop: [
      '......kyyk......', '.....kybbyk.....', '.....kyrryk.....', '.....kybbyk.....',
      '....kkkkkkkk....', '....kcyccyck....', '....kcckkcck....', '...kbkccccckbk..',
      '..kbbbkmmkbbbk..', '..kbbbbrrbbbbk..', '.kcbbbbrrbbbbck.', '.kckbbbrrbbbkck.',
      '..k.kbbrrbbk.k..', '...kmbbbbbbmk...', '..kmmmbbbbmmmk..', '.kmkmkmkmkmkmmk.',
    ],
    king: [
      '...k.k.kk.k.k...', '...kykykkykyk...', '...kyyyyyyyyk...', '...kkbbbbbbkk...',
      '...kbbbbbbbbk...', '...kbkkbbkkbk...', '...kbkRbbRkbk...', '...kbbbkkbbbk...',
      '....kbwkwkbk....', '..kkpkbbbbkpkk..', '.kppppkkkkppppk.', 'kpPpppbbbbpppPpk',
      'kpPppbkbbkbppPpk', 'kpkpppbbbbpppkpk', '.k.kpppppppppk..', '...kkkkkkkkkk...',
    ],
  };

  // ---------- 8x8 icons ----------
  const ICONS = {
    gold: ['..kkkk..', '.kyyyyk.', 'kyywyyok', 'kywyyyok', 'kyyyyyok', 'kyyyyook', '.kooook.', '..kkkk..'],
    timber: ['........', '.kkkkkk.', 'knNnNnbk', 'kNnNnkbk', 'knNnNnbk', '.kkkkkk.', 'kNnNnNbk', '.kkkkkk.'],
    stone: ['........', '..kkkk..', '.kgggbk.', 'kgggggbk', 'ksgggggk', 'kssgggsk', '.kkkkkk.', '........'],
    food: ['..kkkk..', '.kRRwRk.', 'kRwRRRRk', 'kkkkkkkk', '..kbbk..', '..kbbk..', '..kbbk..', '..kkkk..'],
    folk: ['..kkkk..', '..kffk..', '..kffk..', '.kssssk.', 'kssssssk', '.kssssk.', '.ks..sk.', '.kk..kk.'],
    dread: ['.kkkkkk.', 'kbbbbbbk', 'kbkbbkbk', 'kbkbbkbk', 'kbbbbbbk', '.kbkkbk.', '.kbbbbk.', '..kkkk..'],
    flame: ['...k....', '..kok...', '..kyok..', '.koyyok.', '.kyywyk.', 'koywwyok', '.kyyyyk.', '..kkkk..'],
    moon: ['..kkkk..', '.kCCk...', 'kCCk....', 'kCCk....', 'kCCk....', 'kCCCk..k', '.kCCCCk.', '..kkkk..'],
    sun: ['...kk...', '.k.yy.k.', '..kyyk..', 'kyyyyyyk', 'kyyyyyyk', '..kyyk..', '.k.yy.k.', '...kk...'],
    heart: ['........', '.kk..kk.', 'kRRkkRRk', 'kRwRRRRk', 'kRRRRRRk', '.kRRRRk.', '..kRRk..', '...kk...'],
    shard: ['...kk...', '..kyyk..', '.kywyok.', '.kyyyok.', 'kywyyook', '.kyyyok.', '..kyok..', '...kk...'],
    shield: ['kkkkkkkk', 'kggbggsk', 'kgbbbgsk', 'kggbggsk', '.kggbsk.', '.kgggsk.', '..kgsk..', '...kk...'],
    sword: ['......kk', '.....kbk', '....kbk.', '...kbk..', 'k.kbk...', '.kyk....', '.kky....', 'k..k....'],
    tonic: ['..kkkk..', '...kk...', '..kbbk..', '.kbeebk.', 'keeeeeek', 'keweeeek', 'keeeeeek', '.kkkkkk.'],
  };

  G.SPR = {};
  G.ICON = {};
  G.buildSprites = function () {
    for (const k in LOOKS) G.SPR[k] = walker(LOOKS[k]);
    const foe = (rows, rc) => {
      const img = make(rows, rc);
      return { img, flash: silhouette(img, '#ffffff') };
    };
    G.FOE = {
      ghoul: foe(FOES.ghoul),
      rotmother: foe(FOES.ghoul, { M: 'R', m: 'r', b: 'y' }),
      drowned: foe(FOES.ghoul, { M: 'c', m: 's', R: 'y' }),
      hound: foe(FOES.hound),
      mirehound: foe(FOES.hound, { b: 'M', w: 'b' }),
      wyrm: foe(FOES.hound, { b: 'P', R: 'y', w: 'b' }),
      wraith: foe(FOES.wraith),
      wraithElite: foe(FOES.wraith, { C: 'P', c: 'p' }),
      knight: foe(FOES.knight),
      knightElite: foe(FOES.knight, { s: 'p', g: 'P', r: 'y' }),
      bishop: foe(FOES.bishop),
      king: foe(FOES.king),
    };
    for (const k in ICONS) G.ICON[k] = make(ICONS[k]).toDataURL();
  };

  // ---------- 3x5 pixel font for numbers on canvas ----------
  const FONT = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'],
    2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '011', '001', '111'],
    4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'],
    8: ['111', '101', '111', '101', '111'], 9: ['111', '101', '111', '001', '111'],
    '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
    '!': ['010', '010', '010', '000', '010'], '?': ['111', '001', '011', '000', '010'],
    ' ': ['000', '000', '000', '000', '000'],
  };
  G.drawText = function (ctx, str, x, y, col, scale) {
    scale = scale || 1;
    str = String(str);
    const w = (str.length * 4 - 1) * scale;
    let cx = Math.round(x - w / 2);
    for (const ch of str) {
      const gl = FONT[ch] || FONT[' '];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) {
        if (gl[j][i] === '1') {
          ctx.fillStyle = '#0d0b14';
          ctx.fillRect(cx + i * scale + scale, y + j * scale + scale, scale, scale);
          ctx.fillStyle = col;
          ctx.fillRect(cx + i * scale, y + j * scale, scale, scale);
        }
      }
      cx += 4 * scale;
    }
  };
})();
