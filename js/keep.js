// Keep management: interactions, building panels, ledger, forge, gate, dawn reports.
G.Keep = (function () {
  const S = () => G.S;
  const E = () => G.Eco;
  const ICON = (k) => `<img class="ico" src="${G.ICON[k]}" alt="">`;

  function unlocked(id) {
    const u = G.BUILDINGS[id].unlock;
    return u === 'crypt' ? !!S().flags.cryptOpen : S().step >= u;
  }
  function plotLabel(id) { return unlocked(id) ? `Build ${G.BUILDINGS[id].name}` : 'Ruins'; }

  function row(label, value, cls) { return `<div class="row${cls ? ' ' + cls : ''}"><span>${label}</span><b>${value}</b></div>`; }
  function rate(v) { const r = Math.round(v * 60); return `${r >= 0 ? '+' : ''}${r}/min`; }

  async function interact(it) {
    G.Audio.sfx('blip');
    if (it.kind === 'npc') return G.Story.talk(it.id);
    if (it.kind === 'hearth') return S().hearth ? hearthPanel() : G.Story.lightHearth();
    if (it.kind === 'keep') return keepPanel();
    if (it.kind === 'gate') return gatePanel();
    if (it.kind === 'plot') return plotPanel(it.id);
  }

  function tryPay(cost) {
    if (!E().canAfford(S(), cost)) { G.Audio.sfx('deny'); G.UI.toast('Not enough supplies.', 'bad'); return false; }
    E().pay(S(), cost);
    return true;
  }

  // ---------- Buildings ----------
  function plotPanel(id) {
    const B = G.BUILDINGS[id];
    if (!unlocked(id)) {
      const hint = id === 'crypt' ? (S().flags.sealed ? 'The crypt is sealed with Maud\'s blessing. It stays that way.' : 'An iron door, chained shut. Something below it hums.')
        : 'Rubble and old foundations. Your folk will be ready to rebuild here as the story unfolds.';
      return G.UI.openPanel(() => ({ title: 'Ruins', body: `<p class="lore">${hint}</p>`, actions: [{ label: 'Leave', back: true }] }));
    }
    return G.UI.openPanel(() => {
      const s = S(), L = s.b[id], max = E().maxLevel(s);
      const cost = G.buildCost(id, L);
      const atMax = L >= 5, keepCap = L >= max;
      let body = `<p class="lore">${B.lore}</p><div class="rows">`;
      body += row('Level', L ? `${L} / 5` : 'Ruined');
      if (L) body += row('Now', B.eff(L));
      if (!atMax) body += row(L ? 'Next' : 'Built', B.eff(L + 1), 'next');
      if (B.worker) body += row('Workers', `needs ${L + (atMax ? 0 : 1)} folk at next level`);
      body += '</div>';
      if (!atMax) body += keepCap ? `<p class="warn-line">Raise the Keep to level ${L} to build higher.</p>` : `<p class="cost-line">${G.UI.costHTML(cost)}</p>`;
      const actions = [];
      if (!atMax) actions.push({
        label: L ? `Upgrade to Lv ${L + 1}` : 'Build', cls: 'primary', disabled: keepCap || !E().canAfford(s, cost),
        onClick: () => { if (tryPay(cost)) { s.b[id]++; G.Audio.sfx('build'); G.UI.toast(`${B.name} ${L ? 'upgraded to level ' + (L + 1) : 'built'}.`); G.save(); } return L ? 'stay' : 'close'; },
      });
      if (id === 'forge' && L) forgeActions(actions);
      if (id === 'apothecary' && L) {
        const full = s.hero.tonics >= E().maxTonics(s);
        actions.push({ label: `Brew tonic (${s.hero.tonics}/${E().maxTonics(s)})`, sub: '', disabled: full || !E().canAfford(s, G.TONIC_COST), onClick: () => { if (tryPay(G.TONIC_COST)) { s.hero.tonics++; G.Audio.sfx('heal'); } return 'stay'; } });
        body += `<p class="cost-line">Tonic: ${G.UI.costHTML(G.TONIC_COST)}. Restores half your health in battle.</p>`;
      }
      if (id === 'forge' && L) body += forgeBody();
      actions.push({ label: 'Leave', back: true });
      return { title: B.name, body, actions };
    });
  }
  function forgeBody() {
    const s = S();
    const wc = G.weaponCost(s.hero.weapon), ac = G.armorCost(s.hero.armor);
    return `<div class="rows">${row(ICON('sword') + ' Blade', `rank ${s.hero.weapon} (attack ${E().atk(s)})`)}${row('Temper', G.UI.costHTML(wc))}
      ${row(ICON('shield') + ' Armor', `rank ${s.hero.armor} (defense ${E().def(s)})`)}${row('Reinforce', G.UI.costHTML(ac))}</div>`;
  }
  function forgeActions(actions) {
    const s = S(), L = s.b.forge;
    const wc = G.weaponCost(s.hero.weapon), ac = G.armorCost(s.hero.armor);
    actions.push({ label: `Temper blade to rank ${s.hero.weapon + 1}`, disabled: s.hero.weapon >= L || !E().canAfford(s, wc), onClick: () => { if (tryPay(wc)) { s.hero.weapon++; G.Audio.sfx('hit'); G.UI.toast('Your blade rings truer.'); } return 'stay'; } });
    actions.push({ label: `Reinforce armor to rank ${s.hero.armor + 1}`, disabled: s.hero.armor >= L || !E().canAfford(s, ac), onClick: () => { if (tryPay(ac)) { s.hero.armor++; s.hero.hp += 6; G.Audio.sfx('guard'); G.UI.toast('Your armor is heavier, and so is your step.'); } return 'stay'; } });
  }

  // ---------- Hearth ----------
  function hearthPanel() {
    return G.UI.openPanel(() => {
      const s = S(), L = s.hearth, cost = G.hearthCost(L);
      let body = `<p class="lore">The last ember of the old world. It eats timber and gives back light, warmth, and something like courage.</p><div class="rows">`;
      body += row('Level', `${L} / 5`);
      body += row('Burns', `${Math.round(E().rates(s).burn * 60)} timber / min`);
      body += row('Ember charges in battle', E().charges(s));
      body += row('Shards of the Sun', `${ICON('shard')} ${s.shards} / 3`);
      if (L < 5) body += row('Next level', 'Wider light, less dread, +2 defense, +1 Ember charge', 'next');
      body += '</div>';
      if (L < 5) body += `<p class="cost-line">${G.UI.costHTML(cost)}</p>`;
      if (s.res.timber <= 0) body += '<p class="warn-line">The Hearth is starving. Dread will climb until it has timber.</p>';
      const actions = [];
      if (L < 5) actions.push({ label: `Stoke to Lv ${L + 1}`, cls: 'primary', disabled: !E().canAfford(s, cost), onClick: () => { if (tryPay(cost)) { s.hearth++; G.Audio.sfx('ember'); G.UI.toast('The Hearth roars higher.'); G.save(); } return 'stay'; } });
      actions.push({ label: 'Gaze into the Ember', onClick: () => { G.UI.toast(gazeHint()); return 'close'; } });
      actions.push({ label: 'Leave', back: true });
      return { title: 'The Hearth', body, actions };
    });
  }
  function gazeHint() {
    const s = S();
    if (s.res.food < 10 && s.b.cellar < 2) return 'You see empty bowls. Your cellar needs to grow.';
    if (E().threat(s) > E().defense(s)) return 'You see the walls breaking. More towers, or a stronger Keep.';
    if (s.dread > 60) return 'You see your folk staring at the dark. Build the Chapel; hold a feast.';
    if (E().workers(s) > s.folk) return 'You see idle tools. Too few hands. Build cottages.';
    return 'The flame is steady. It is waiting for you to finish what Aldric started.';
  }

  // ---------- The Keep: ledger, upgrade, rest ----------
  function keepPanel() {
    let confirmWipe = false;
    return G.UI.openPanel(() => {
      const s = S(), e = E(), r = e.rates(s), cost = G.keepCost(s.keep);
      const def = e.defense(s), thr = e.threat(s);
      const lightPct = (s.light + 100) / 2;
      let body = `<div class="rows">`;
      body += row(`${ICON('folk')} Folk`, `${s.folk} housed of ${e.cap(s)}; ${e.workers(s)} needed at work (${Math.round(e.eff(s) * 100)}% output)`);
      body += row(`${ICON('timber')} Timber`, rate(r.timber));
      body += row(`${ICON('stone')} Stone`, rate(r.stone));
      body += row(`${ICON('food')} Food`, rate(r.food));
      body += row(`${ICON('gold')} Gold`, rate(r.gold));
      body += row(`${ICON('dread')} Dread`, `${Math.round(s.dread)} (${rate(r.dread)})${s.dread > 60 ? ' - output slowed' : ''}`, s.dread > 60 ? 'bad' : '');
      body += row(`${ICON('shield')} Tonight`, `defense ${def} vs threat ${thr}${s.raidPause ? ' (truce)' : ''}`, def >= thr || s.raidPause ? 'good' : 'bad');
      body += row(`${ICON('heart')} Warden`, `Lv ${s.hero.lvl} | ${Math.ceil(s.hero.hp)}/${e.maxHp(s)} hp | atk ${e.atk(s)} | def ${e.def(s)} | xp ${s.hero.xp}/${e.xpNeed(s.hero.lvl)}`);
      body += '</div>';
      body += `<div class="align"><span>Flame</span><i><b style="left:${100 - lightPct}%"></b></i><span>Hollow</span></div>`;
      body += `<p class="lore small">Keep level ${s.keep}: houses folk, adds defense, and lets buildings rise to level ${e.maxLevel(s)}.</p>`;
      if (s.keep < 5) body += `<p class="cost-line">Raise to Lv ${s.keep + 1}: ${G.UI.costHTML(cost)}</p>`;
      if (confirmWipe) body += '<p class="warn-line">This erases your save and starts over. Are you sure?</p>';
      const actions = [];
      if (confirmWipe) {
        actions.push({ label: 'Yes, erase and restart', cls: 'danger', onClick: () => { G.wipe(); location.reload(); return 'close'; } });
        actions.push({ label: 'Keep playing', onClick: () => { confirmWipe = false; return 'stay'; } });
        return { title: 'Ashen Keep', body, actions };
      }
      if (s.keep < 5) actions.push({ label: `Raise the Keep to Lv ${s.keep + 1}`, cls: 'primary', disabled: !e.canAfford(s, cost), onClick: () => { if (tryPay(cost)) { s.keep++; G.Audio.sfx('build'); G.UI.toast(`The Keep rises. Buildings may now reach level ${e.maxLevel(s)}.`); G.save(); } return 'stay'; } });
      const night = e.isNight(s.time) || e.phase(s.time) === 'dusk';
      if (s.step >= G.STEP.NIGHT && night) actions.push({ label: 'Sleep until dawn', onClick: () => { s.time = 0.9999; s.hero.hp = e.maxHp(s); return 'close'; } });
      actions.push({ label: 'Restart game', cls: 'quiet', onClick: () => { confirmWipe = true; return 'stay'; } });
      actions.push({ label: 'Leave', back: true });
      return { title: 'Ashen Keep', body, actions };
    });
  }

  // ---------- Gate ----------
  function gatePanel() {
    return G.UI.openPanel(() => {
      const s = S();
      const open = Object.keys(G.SITES).filter((k) => G.SITES[k].unlock(s));
      let body = '';
      if (!open.length) body = '<p class="lore">Beyond the gate the dark is total. You have no reason to go out there yet. Not until the Hearth shows you where.</p>';
      else {
        body = `<p class="lore">You have ${Math.ceil(s.hero.hp)} of ${E().maxHp(s)} health and ${s.hero.tonics} tonic${s.hero.tonics === 1 ? '' : 's'}. Time stands still while you are away.</p><div class="sites">`;
        for (const k of open) {
          const st = G.SITES[k];
          const lockedKeep = st.needKeep && s.keep < st.needKeep;
          body += `<div class="site"><h3>${st.name}${s.cleared[k] ? ' <em>cleansed</em>' : ''}</h3><p>${st.blurb}</p><small>Suggested level ${st.rec}${lockedKeep ? ` | Needs Keep level ${st.needKeep}` : ''}${s.cleared[k] ? ' | Return to scavenge supplies' : ''}</small></div>`;
        }
        body += '</div>';
      }
      const actions = open.map((k) => {
        const st = G.SITES[k];
        return { label: `Set out: ${st.name}`, cls: s.cleared[k] ? '' : 'primary', disabled: !!(st.needKeep && s.keep < st.needKeep) || (k === 'throne' && !!s.ending), onClick: () => { setTimeout(() => G.Exp.start(k), 50); return 'close'; } };
      });
      actions.push({ label: 'Stay inside', back: true });
      return { title: 'The Gate', body, actions };
    });
  }

  // ---------- Dawn ----------
  async function dawn() {
    const s = S();
    const rep = E().resolveRaid(s);
    G.Audio.sfx(rep.held ? 'confirm' : 'hurt');
    G.save();
    G.busy = true;
    await G.UI.openPanel(() => ({
      title: `Dawn of Day ${s.day}`,
      body: `<p class="lore">${rep.lines.join(' ')}</p><div class="rows">${row('Hollow at the walls', rep.threat)}${row('Your defense', rep.def, rep.held ? 'good' : 'bad')}${row('Next night', `threat ${E().threat(s)}`)}</div>`,
      actions: [{ label: 'Face the new day', cls: 'primary' }],
    }), { locked: true });
    G.busy = false;
  }

  return { interact, plotLabel, dawn, unlocked };
})();
