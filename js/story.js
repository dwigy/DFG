// Story: speakers, the quest chain, scenes, folk chatter, keep events and endings.
G.Story = (function () {
  const UI = () => G.UI;
  const S = () => G.S;
  const say = (w, t) => G.UI.say(w, t);
  const choose = (w, t, o) => G.UI.choose(w, t, o);
  const end = () => G.UI.closeDialog();

  const SPEAKERS = {
    narrator: { name: '' },
    you: { name: 'You', art: 'hero', pitch: 1 },
    maud: { name: 'Sister Maud', art: 'maud', pitch: 1.3 },
    corvin: { name: 'Corvin', art: 'corvin', pitch: 0.7 },
    isolde: { name: 'Isolde the Pale', art: 'isolde', pitch: 1.5 },
    pip: { name: 'Pip', art: 'pip', pitch: 1.9 },
    envoy: { name: 'The Envoy', art: 'envoy', pitch: 0.5 },
    ember: { name: 'The Ember', art: 'ember', pitch: 2.2 },
    king: { name: 'The Hollow King', art: 'king', pitch: 0.45 },
    folk: { name: 'Villager', art: 'folk1', pitch: 1.1 },
  };
  const speakerName = (id) => (SPEAKERS[id] ? SPEAKERS[id].name : id);

  function align(n) { S().light = G.clamp(S().light + n, -100, 100); }

  // ---------- Quest chain ----------
  const STEPS = [
    { obj: 'Kneel at the cold hearth in the courtyard', done: (s) => s.hearth > 0, after: sceneMaud },
    { obj: "Build a Woodcutter's Hut and a Fungus Cellar", done: (s) => s.b.woodcutter > 0 && s.b.cellar > 0, after: sceneNightWarning },
    { obj: 'Survive your first night', done: (s) => s.day >= 2, after: sceneCorvin },
    { obj: 'Build Cottages and a Watchtower', done: (s) => s.b.cottages > 0 && s.b.watchtower > 0, after: sceneShardVision },
    { obj: 'Leave by the Gate and cleanse the Gloamwood', done: (s) => !!s.cleared.gloamwood, after: sceneIsolde },
    { obj: 'Build the Chapel and raise the Keep to level 2', done: (s) => s.b.chapel > 0 && s.keep >= 2, after: sceneBell },
    { obj: 'Cleanse the Drowned Chapel', done: (s) => !!s.cleared.drowned, after: sceneEnvoy },
    { obj: 'Raise the Hearth and the Watchtower to level 2', done: (s) => s.hearth >= 2 && s.b.watchtower >= 2, after: sceneMireCall },
    { obj: 'Cross the Bone Mire', done: (s) => !!s.cleared.mire, after: sceneRevelation },
    { obj: 'Raise the Keep to level 3, then march on the Hollow Throne', done: (s) => !!s.ending, after: null },
    { obj: 'Tend the Keep. The dark is patient.', done: () => false },
  ];

  let running = false;
  async function update() {
    if (running || G.UI.isBlocking()) return;
    const s = S();
    const st = STEPS[s.step];
    if (st && st.done(s)) {
      running = true;
      G.busy = true;
      s.step++;
      try { if (st.after) await st.after(); } finally { running = false; G.busy = false; }
      G.save();
      refreshObjective();
    }
    if (!G.busy && !running && s.step >= G.STEP.DEFEND && s.day >= s.nextEventDay && s.time > 0.1 && s.time < 0.5) {
      running = true; G.busy = true;
      try { await keepEvent(); } finally { running = false; G.busy = false; }
      s.nextEventDay = s.day + G.ri(1, 2);
      G.save();
    }
  }
  function refreshObjective() {
    const st = STEPS[S().step];
    G.UI.objective(st ? st.obj : '');
    G.World.syncNPCs();
  }

  function targets() {
    const s = S(), W = G.World, out = [];
    const plot = (id) => { if (!s.b[id]) out.push(W.plotPoint(id)); };
    switch (s.step) {
      case 0: out.push(W.hearthPoint()); break;
      case 1: plot('woodcutter'); plot('cellar'); break;
      case 3: plot('cottages'); plot('watchtower'); break;
      case 4: case 6: case 8: out.push(W.gatePoint()); break;
      case 5: plot('chapel'); if (s.keep < 2) out.push(W.keepPoint()); break;
      case 7: if (s.hearth < 2) out.push(W.hearthPoint()); if (s.b.watchtower < 2) out.push(W.plotPoint('watchtower')); break;
      case 9: out.push(s.keep < 3 ? W.keepPoint() : W.gatePoint()); break;
    }
    return out;
  }

  // ---------- Scenes ----------
  async function lightHearth() {
    G.busy = true;
    await say('narrator', 'Under a skin of grey ash, one ember still breathes. You cup it in your gauntlets. It is warm. It knows you.');
    await say('narrator', 'You feed it splinters from a broken door. It takes them like a starving thing. Light climbs the walls of Ashen Keep for the first time in seven winters.');
    end();
    S().hearth = 1;
    G.Audio.sfx('build');
    G.busy = false;
  }

  async function sceneMaud() {
    const W = G.World;
    const m = W.spawnTemp('maud_in', 'maud', 20 * 16, 25 * 16 + 8, 'up');
    await W.walkTo(m, 20 * 16, 17 * 16 + 8, 40);
    await say('maud', 'Light. Real light. I walked forty miles of dark following it, and I half thought it was a lie.');
    await say('maud', 'I am Maud, the last sister of the Flame. You wear the Warden\'s colours. So you came home.');
    await say('you', 'Home is a strong word for this ruin.');
    await say('maud', 'Ruins can be mended. That fire needs timber to eat, and the living need food. Nothing grows in the Dusk but mushrooms. Grim fare. It keeps.');
    await say('narrator', 'Walk to a ruined plot and press A to build. A gold arrow marks where you are needed.');
    end();
    W.removeTemp('maud_in');
  }

  async function sceneNightWarning() {
    await say('maud', 'Good. Smoke from a chimney. I had forgotten the smell.');
    await say('maud', 'Now listen. When the dark deepens, the Hollow come to the walls. Things that were people, once, before the light left them.');
    await say('maud', 'Keep the Hearth fed and your folk close. Watch the Dread. Fear spreads faster than fire in a place like this.');
    await say('narrator', 'Time now passes. Night falls every few minutes, and the Hollow test your defense at dawn. Check the Keep\'s ledger to compare your walls against the threat.');
    end();
  }

  async function sceneCorvin() {
    const W = G.World;
    const c = W.spawnTemp('corvin_in', 'corvin', 20 * 16, 25 * 16 + 8, 'up');
    await W.walkTo(c, 20 * 16, 21 * 16, 36);
    W.placeHero(20 * 16, 19 * 16, 'down');
    await say('corvin', 'Easy. I\'m not Hollow. Not yet. Name\'s Corvin. Sellsword, formerly. Now just tired.');
    await say('corvin', 'I\'ve six souls behind me. Farmers, a smith\'s widow, two children who stopped crying a week ago. We saw your fire from the ridge.');
    const i = await choose('corvin', 'We have nothing to pay you with but our hands. Will you open the gate?', [
      { label: 'Open the gate. All are welcome by the fire.', note: '+6 folk, -15 food' },
      { label: 'Only you, Corvin. I cannot feed six more.', note: '+gold, the others go back into the dark' },
    ]);
    S().flags.corvin = true;
    if (i === 0) {
      S().folk += 6; S().res.food = Math.max(0, S().res.food - 15); align(10);
      S().flags.sheltered = true;
      await say('corvin', 'Then my sword is yours, Warden. For as long as that fire burns, and a little after.');
    } else {
      S().res.gold += 25; align(-12);
      S().flags.turnedAway = true;
      await say('narrator', 'Corvin looks at the dark for a long moment. Then he presses a purse of coin into your hand, and goes to tell them.');
      await say('corvin', 'They took it well. Better than I did. I\'ll stand your walls, Warden. I\'ll also remember this.');
    }
    await say('corvin', 'The east wall is thin. A watchtower would help, and cottages, if more folk come. They will. Light draws them, like moths.');
    end();
    W.removeTemp('corvin_in');
    G.World.syncNPCs();
  }

  async function sceneShardVision() {
    G.World.placeHero(20 * 16, 17 * 16, 'up');
    await say('maud', 'Warden. Come look at the Hearth. Something moves in it.');
    await say('narrator', 'In the heart of the flame you see a forest of black pines, and between them, a light that is not fire. A splinter of gold, humming.');
    await say('ember', '...find... the pieces...');
    await say('maud', 'A Shard. The old hymns spoke of them. Pieces of the morning, carried by the first Wardens. The Gloamwood swallowed one.');
    await say('corvin', 'The Gloamwood swallows everything. I\'ll mind the walls. You\'ll want to go by the gate. Take food. Come back.');
    await say('narrator', 'Expeditions are fought in turns. Strike, Guard to blunt a blow and riposte, or spend an Ember charge for a burst of holy fire. Hollow foes take extra damage from Ember.');
    end();
  }

  async function sceneIsolde() {
    G.World.placeHero(20 * 16, 23 * 16, 'up');
    S().shards = Math.max(S().shards, 1);
    await say('narrator', 'You return through the gate with the Shard wrapped in your cloak. Its hum is louder inside the walls.');
    const W = G.World;
    const iso = W.spawnTemp('isolde_in', 'isolde', 30 * 16, 22 * 16, 'left');
    await W.walkTo(iso, 22 * 16, 23 * 16, 30);
    await say('isolde', 'What a pretty bauble. Do you know what it is, little Warden? It\'s a piece of the Sun.');
    await say('isolde', 'I am Isolde. I live in your crypt. Don\'t look like that. The dead are poor company but they don\'t ask for rent.');
    await say('isolde', 'Ask yourself a better question than where the Shards are. Ask who broke the Sun to make them.');
    const p = W.spawnTemp('pip_in', 'pip', 12 * 16, 15 * 16, 'right');
    await W.walkTo(p, 18 * 16, 22 * 16, 40);
    await say('pip', 'Warden! There\'s a bell under the floor. It rings when no one\'s touching it. Three times. Maud says I\'m dreaming.');
    await say('isolde', 'The child isn\'t dreaming. There is a bell beneath the crypt. It was hung to warn the Keep. Of what, nobody wrote down.');
    await say('maud', 'Raise a Chapel, Warden, and make the Keep strong. Whatever is under us, I\'d rather meet it on our feet.');
    end();
    W.removeTemp('isolde_in'); W.removeTemp('pip_in');
    G.World.syncNPCs();
  }

  async function sceneBell() {
    G.Audio.sfx('bell');
    G.World.placeHero(34 * 16 + 8, 22 * 16, 'up');
    await say('narrator', 'The bell rings beneath the crypt. Once. Twice. Three times. The whole Keep goes quiet.');
    await say('pip', 'Three times. Bells ring three times for kings.');
    await say('maud', 'Seal it, Warden. Whatever sleeps under there sleeps for a reason. The Chapel\'s blessing will hold it.');
    await say('isolde', 'Open it. The dead keep better records than the living, and your family has been lying to you for three hundred years.');
    const i = await choose('you', 'The iron door is cold under your hand.', [
      { label: 'Seal the crypt with the Chapel\'s blessing.', note: 'Chapel works 50% better. Isolde sulks.' },
      { label: 'Break the seal and go down.', note: 'Unlocks the Crypt (gold, but dread) and the Hex in battle.' },
    ]);
    if (i === 0) {
      S().flags.sealed = true; align(12);
      await say('narrator', 'Maud chalks the old sigils across the door and sings until her voice gives out. The bell falls silent.');
      await say('maud', 'There. The first Warden, Aldric, brought the Ember home in a hard winter. He built this Keep around it. We don\'t need to know more than that.');
      await say('isolde', 'You sealed my library. Rude. When you want the truth, it\'ll still be down there.');
    } else {
      S().flags.cryptOpen = true; align(-12);
      await say('narrator', 'Steps go down into cold. Wardens lie in rows, each with a sword and a candle that never burned. At the end is the tomb of Aldric, the first Warden.');
      await say('narrator', 'It is empty. On the lid, scratched by a desperate hand: FORGIVE ME, BROTHER. I ONLY MEANT TO BORROW IT.');
      await say('isolde', 'Bodies don\'t wander off, Warden. Unless they\'re carried. Or they walk.');
      await say('isolde', 'Stay a while among the dead and I\'ll teach you a Hex. It drinks a foe\'s life into yours. It isn\'t holy. It works.');
    }
    await say('corvin', 'Whatever this is, it\'s bigger than our walls. There\'s a ruin north of here, the Drowned Chapel. Folk say the bells there ring in answer to ours.');
    end();
  }

  async function sceneEnvoy() {
    const s = S(), W = G.World;
    s.shards = Math.max(s.shards, 2);
    W.placeHero(20 * 16, 21 * 16, 'down');
    await say('narrator', 'The second Shard sings against the first. That night, something walks up to the gate and knocks.');
    const e = W.spawnTemp('envoy_in', 'envoy', 20 * 16, 25 * 16 + 8, 'up');
    await W.walkTo(e, 20 * 16, 24 * 16, 20);
    await say('envoy', 'The King Beneath the Dusk sends greeting, little Warden. He asks only for what is his.');
    if (s.flags.turnedAway) await say('envoy', 'He has six of yours already. A farmer. A widow. Two children. They remember your gate. They remember it was closed.');
    await say('envoy', 'Give him five of your folk, and your walls will not be tested for three nights. A fair price. Folk are cheap. Walls are dear.');
    const opts = [
      { label: 'Take them. Then leave.', note: '-5 folk, no raids for 3 nights' },
      { label: 'Nothing that lives belongs to him.', note: 'Next raid is 50% stronger' },
    ];
    if (s.flags.corvin) opts.push({ label: 'Corvin. Cut it down.', note: 'Next raid doubled, but dread falls' });
    const i = await choose('you', 'The envoy waits. It does not breathe.', opts);
    if (i === 0) {
      const n = Math.min(5, s.folk - 1);
      s.folk -= n; s.raidPause = 3; align(-25);
      s.flags.tribute = true;
      await say('narrator', `You choose ${n}. You will remember their faces. They walk out behind the envoy without looking back.`);
      await say('maud', 'I will pray for them. I don\'t know who to pray to anymore.');
    } else if (i === 1) {
      s.raidMult = 1.5; align(10);
      await say('envoy', 'Brave. He loves brave. Brave burns longest.');
    } else {
      s.raidMult = 2; s.dread = Math.max(0, s.dread - 20); align(0);
      s.flags.envoySlain = true;
      await say('narrator', 'Corvin\'s blade passes through it like a sword through smoke. It comes apart in grey motes, still smiling. The folk on the walls cheer anyway.');
      await say('corvin', 'That felt good. It won\'t feel good tomorrow night.');
    }
    end();
    W.removeTemp('envoy_in');
    await say('maud', 'Strengthen the Hearth, Warden, and the tower. If the King is moving, so must we.');
    end();
  }

  async function sceneMireCall() {
    await say('narrator', 'Both Shards blaze in the Hearth, and the flame bends north. Toward the Bone Mire, where the last army of the Sun fell.');
    await say('corvin', 'My father died in that mire. They say the dead there are still fighting. They just forgot which side they were on.');
    end();
  }

  async function sceneRevelation() {
    const s = S();
    s.shards = 3;
    G.World.placeHero(20 * 16, 17 * 16, 'up');
    await say('narrator', 'You set the third Shard in the Hearth. The three pieces fit together like a broken plate. The Ember flares white, and speaks.');
    await say('ember', 'Warden. Child of Aldric. Listen, and do not look away.');
    await say('ember', 'Three hundred years ago a hard winter came. Aldric climbed the sky-stair and took the heart of the Sun to warm his Keep. He meant to return it in spring.');
    await say('ember', 'Spring did not come. The Sun began to bleed, slowly, over centuries. Seven winters ago it went dark. I am what is left of its heart.');
    await say('ember', 'Aldric\'s brother, Cael, was the Sun\'s true Warden. He went into the dark to take me back, and the dark took him. Now they call him the Hollow King.');
    await say('ember', 'He is not invading you, child. He is coming home for what was stolen.');
    await say('maud', 'Then every hymn I know was sung to a stolen thing. I\'ll keep singing. The folk need the tune, if not the truth.');
    if (s.flags.cryptOpen) await say('isolde', 'Forgive me, brother. I only meant to borrow it. Well. Now you know what the lid meant.');
    await say('corvin', 'Doesn\'t change the arithmetic. He\'s coming. Either we go to him or he comes to us.');
    await say('narrator', 'Make the Keep strong enough to stand without you. Then go to the Hollow Throne and decide what the Ember is for.');
    end();
  }

  // Called by the expedition after the King falls.
  async function finale() {
    const s = S();
    G.Audio.play('ending');
    await say('king', 'Kinsman. You have his face. Did you know that? Aldric\'s face. I have hated it for three hundred years.');
    await say('king', 'I am so tired. The dark is very heavy. Tell me. What will you do with the light my brother stole?');
    const i = await choose('you', 'The Ember beats in your hands like a second heart.', [
      { label: 'Return it to the sky.', note: 'The Sun may rise. The Keep will go cold.' },
      { label: 'Keep it. The Keep is all the light we need.', note: 'An island of fire in endless night.' },
      { label: 'Take his crown.', note: 'Rule the dark instead of fearing it.' },
    ]);
    s.ending = ['dawn', 'flame', 'ash'][i];
    G.World.syncNPCs();
    end();
    return s.ending;
  }

  function epilogue(kind) {
    const s = S();
    const lines = [];
    if (kind === 'dawn') {
      lines.push(['narrator', 'You climb the sky-stair your forefather climbed. At the top there is only wind, and a hole in the sky the shape of a heart.']);
      lines.push(['narrator', 'You set the Ember in it. For a long moment, nothing. Then the east turns the colour of a bruise, then of blood, then of gold.']);
      lines.push(['king', 'Ah. There it is. I had forgotten it was so warm.']);
      lines.push(['narrator', 'Cael crumbles into light. The Hearth in Ashen Keep goes out. That winter is the coldest anyone remembers. It is also the last.']);
    } else if (kind === 'flame') {
      lines.push(['narrator', 'You carry the Ember home. Cael does not stop you. He sits down on his throne, and the dark folds over him like a blanket.']);
      lines.push(['narrator', 'The world stays dark. But in the middle of it, Ashen Keep burns, and people walk a hundred miles to stand in its light.']);
      lines.push(['maud', 'It isn\'t dawn. It\'s a candle in a window. Some nights, that\'s the same thing.']);
    } else {
      lines.push(['narrator', 'You lift the iron crown from Cael\'s head. It weighs nothing at all. The dark leans toward you like a dog that has found its master.']);
      lines.push(['narrator', 'The Hollow kneel. The raids stop. Ashen Keep is never attacked again, because everything in the night now answers to you.']);
      lines.push(['isolde', 'Long live the King Beneath the Dusk. Do try to be a better one than the last.']);
    }
    if (s.flags.sheltered) lines.push(['corvin', 'The six I brought you have children of their own now. They tell them about the Warden who opened the gate.']);
    if (s.flags.turnedAway) lines.push(['narrator', 'Sometimes, at the edge of the light, six figures stand and watch the Keep. They never come closer.']);
    if (s.flags.tribute) lines.push(['narrator', 'You never learn what became of the five you gave away. You stop asking. That is its own kind of answer.']);
    lines.push(['narrator', s.light >= 25 ? 'They will remember you as the Warden of the Flame.' : s.light <= -25 ? 'They will remember you as the Warden who walked with the Hollow.' : 'They will remember you as the Warden who did what had to be done.']);
    return lines;
  }

  // ---------- Folk chatter ----------
  const seen = {};
  function lines(id) {
    const s = S(), st = s.step;
    const L = {
      maud: st < 4 ? ['Feed the Hearth, Warden. Timber is cheaper than prayers.', 'Seven winters I kept vigil alone. My knees are older than the dark.', 'Cottages before cathedrals. The living first.']
        : st < 9 ? ['The Shard hums when I pray. I can\'t tell if it\'s listening or laughing.', 'Your house built this Keep around that fire. Did you never wonder where the fire came from?', s.flags.sealed ? 'The seal holds. I check it every night. I hear knocking, sometimes. Small knocking.' : 'You went down there. I can smell the crypt on you.']
          : ['Every hymn I know was sung to a stolen thing. I sing them anyway.', s.ending ? 'The fire\'s quieter now. Or I am older.' : 'Whatever you choose at the Throne, choose it with your eyes open.'],
      corvin: [
        `Walls hold ${G.Eco.defense(s)} against tonight's ${G.Eco.threat(s)}. ${G.Eco.defense(s) >= G.Eco.threat(s) ? 'We\'ll hold.' : 'We won\'t hold. Build a tower or raise the Keep.'}`,
        'Hollow don\'t sleep. Neither do I, much.',
        'Saw a Hollow knight once that still saluted. Habit outlives the man.',
        s.flags.turnedAway ? 'Six. I counted them as they walked into the dark. You should count them too, some night.' : 'The widow you took in mends my cloak and won\'t take coin. Odd thing, kindness. Keeps better than food.',
      ],
      isolde: [
        'The dead are honest, Warden. They have nothing left to protect.',
        s.flags.cryptOpen ? 'Your forefather\'s tomb was empty. Haven\'t you wondered where he went?' : 'You sealed my library. I\'ve forgiven you. Mostly.',
        'Dread is a hunger, not a feeling. Feed the folk, light the dark, and it starves.',
      ],
      pip: [
        'When I grow up I want to see the Sun. Maud says it was yellow. Like soup.',
        'Corvin says the Hollow can\'t cross running water. There isn\'t any running water here.',
        'I counted the eyes on the wall last night. I stopped at forty.',
        'If you go out the gate, bring me back a pinecone. A normal one.',
      ],
    };
    return L[id] || ['...'];
  }
  async function talk(id) {
    const n = G.World.npc(id);
    if (n) { n.talk = true; const h = G.World.hero; n.dir = Math.abs(h.x - n.x) > Math.abs(h.y - n.y) ? (h.x > n.x ? 'right' : 'left') : h.y > n.y ? 'down' : 'up'; }
    const ls = lines(id);
    const k = id + ':' + S().step;
    seen[k] = (seen[k] || 0);
    await say(id, ls[seen[k] % ls.length]);
    seen[k]++;
    end();
    if (n) n.talk = false;
  }
  function hasNews(id) { return !seen[id + ':' + S().step]; }

  // ---------- Keep events ----------
  const EVENTS = [
    {
      id: 'tinker', when: (s) => !s.flags.lantern,
      run: async (s) => {
        const i = await choose('folk', 'A hunchbacked tinker at the gate, rattling with lamps. "A Warden\'s lantern, friend! Burns on sorrow. Forty gold."', [
          { label: 'Buy the lantern.', note: '40 gold. Your light reaches further.', disabled: s.res.gold < 40 },
          { label: 'Send the tinker on.' },
        ]);
        if (i === 0) { s.res.gold -= 40; s.flags.lantern = true; G.Audio.sfx('coin'); await say('narrator', 'The lantern hums on your belt. The dark keeps a little more distance.'); }
      },
    },
    {
      id: 'child', when: (s) => s.folk > 2,
      run: async (s) => {
        const i = await choose('folk', 'A mother, white-faced: "My boy followed a wisp past the gate. He\'s six. Please."', [
          { label: 'Go after him yourself.', note: 'Costs a third of your health. +1 folk.' },
          { label: 'Bar the gate. I can\'t risk it.', note: 'Dread rises.' },
        ]);
        if (i === 0) {
          s.hero.hp = Math.max(1, s.hero.hp - G.Eco.maxHp(s) / 3); s.folk++; align(6);
          await say('narrator', 'You find him in a ring of white mushrooms, singing to something that isn\'t there. Something follows you halfway home. You carry him the rest of the way.');
        } else { s.dread = Math.min(100, s.dread + 8); align(-6); await say('narrator', 'The mother sits by the gate all night. In the morning she is still there.'); }
      },
    },
    {
      id: 'crows', when: (s) => s.res.food > 20,
      run: async (s) => {
        const i = await choose('folk', 'Carrion crows have found the fungus cellar. They are bold, and they are many.', [
          { label: 'Build scarecrows.', note: '-15 timber' , disabled: s.res.timber < 15 },
          { label: 'Let them have their share.', note: '-20 food' },
        ]);
        if (i === 0) s.res.timber -= 15; else s.res.food = Math.max(0, s.res.food - 20);
      },
    },
    {
      id: 'hollowing', when: (s) => s.folk > 4,
      run: async (s) => {
        const opts = [
          { label: 'Exile him beyond the walls.', note: '-1 folk, dread falls' },
          { label: 'Let Maud sit with him.', note: 'A gamble' },
        ];
        if (s.flags.cryptOpen) opts.push({ label: 'Give him to Isolde.', note: '+40 gold. Don\'t ask.' });
        const i = await choose('folk', 'A woodcutter\'s eyes have gone grey. He stares at the dark and smiles. The others are afraid. He is Hollowing.', opts);
        if (i === 0) { s.folk--; s.dread = Math.max(0, s.dread - 8); align(-4); await say('narrator', 'He walks out without a word. He doesn\'t look back. That is the worst part.'); }
        else if (i === 1) {
          if (Math.random() < 0.6) { align(8); await say('maud', 'He wept for an hour, then asked for soup. He\'ll live. The Hollowing can be turned, if someone stays.'); }
          else { s.folk = Math.max(1, s.folk - 2); s.dread = Math.min(100, s.dread + 12); await say('narrator', 'In the night he turns. Corvin does what has to be done, but not before another is lost.'); }
        } else { s.folk--; s.res.gold += 40; align(-10); await say('isolde', 'Thank you, Warden. He\'ll be very useful. In a manner of speaking.'); }
      },
    },
    {
      id: 'merchant', when: () => true,
      run: async (s) => {
        const i = await choose('folk', 'A salt-road merchant, three mules and a crossbow. "Trade? I\'ve nowhere better to be. Nobody has."', [
          { label: 'Sell 30 timber for 25 gold.', disabled: s.res.timber < 30 },
          { label: 'Buy 30 stone for 30 food.', disabled: s.res.food < 30 },
          { label: 'Buy 40 food for 30 gold.', disabled: s.res.gold < 30 },
          { label: 'No trade today.' },
        ]);
        if (i === 0) { s.res.timber -= 30; s.res.gold += 25; }
        if (i === 1) { s.res.food -= 30; s.res.stone += 30; }
        if (i === 2) { s.res.gold -= 30; s.res.food += 40; }
        if (i < 3) G.Audio.sfx('coin');
      },
    },
    {
      id: 'feast', when: (s) => s.dread > 25,
      run: async (s) => {
        const i = await choose('folk', 'The folk ask for a feast. "Just one night where we eat until we\'re stupid, Warden."', [
          { label: 'Hold the feast.', note: '-30 food, dread falls sharply', disabled: s.res.food < 30 },
          { label: 'We can\'t spare it.', note: 'Dread rises' },
        ]);
        if (i === 0) { s.res.food -= 30; s.dread = Math.max(0, s.dread - 22); align(4); await say('narrator', 'Someone finds a fiddle. Someone else finds out they can dance. For one night, nobody looks at the dark.'); }
        else s.dread = Math.min(100, s.dread + 6);
      },
    },
    {
      id: 'well', when: () => true,
      run: async (s) => {
        const i = await choose('folk', 'Folk whisper about the well. At night a voice rises out of it, offering gold for a name.', [
          { label: 'Pray over the well.', note: 'Dread falls a little' },
          { label: 'Bargain with the voice.', note: '+50 gold, dread rises' },
        ]);
        if (i === 0) { s.dread = Math.max(0, s.dread - 6); align(4); }
        else { s.res.gold += 50; s.dread = Math.min(100, s.dread + 12); align(-8); await say('narrator', 'You give it a name. Not yours. In the morning there is gold in the bucket, and no one can remember a man called Edric.'); }
      },
    },
    {
      id: 'deserter', when: (s) => !s.flags.deserter && !s.flags.deserterDone && s.step >= G.STEP.BELL,
      run: async (s) => {
        s.flags.deserterDone = true;
        const i = await choose('folk', 'A Hollow soldier kneels at the gate, eyes clearing. "I remember my name. Please. Before I forget it again."', [
          { label: 'Let him in.', note: '+3 defense, forever' },
          { label: 'Put him to rest.', note: 'Mercy, of a kind' },
        ]);
        if (i === 0) { s.flags.deserter = true; align(6); await say('corvin', 'He knows how they think. Hate to say it, but he\'s worth two of my crossbows.'); }
        else { align(-3); await say('narrator', 'He thanks you. That stays with you longer than you expect.'); }
      },
    },
  ];
  async function keepEvent() {
    const s = S();
    const pool = EVENTS.filter((e) => e.when(s));
    if (!pool.length) return;
    const e = G.pick(pool);
    G.Audio.sfx('door');
    await e.run(s);
    end();
  }

  return {
    SPEAKERS, speakerName, STEPS, update, refreshObjective, targets, talk, hasNews,
    lightHearth, finale, epilogue, align,
  };
})();
