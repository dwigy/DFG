// DOM interface: HUD, toasts, dialogue, panels, keyboard/pad menu navigation.
G.UI = (function () {
  const $ = (id) => document.getElementById(id);
  let el = {};
  const menus = []; // stack of {root, idx, orient}
  let typing = null; // {full, shown, timer, done}
  let advance = null;

  function init() {
    el = {
      hud: $('hud'), day: $('hud-day'), clock: $('hud-clock'), phase: $('hud-phase'),
      toasts: $('toasts'), objective: $('objective'), prompt: $('prompt'),
      dialog: $('dialog'), portrait: $('portrait'), dname: $('dlg-name'), dtext: $('dlg-text'), dchoices: $('dlg-choices'),
      modal: $('modal'), mtitle: $('m-title'), mbody: $('m-body'), mactions: $('m-actions'),
      battle: $('battle'), blog: $('blog'), bactions: $('bactions'), bhud: $('battle-hud'),
      titleMenu: $('title-menu'), mute: $('btn-mute'),
    };
    document.querySelectorAll('img[data-icon]').forEach((img) => { img.src = G.ICON[img.dataset.icon]; img.alt = ''; });
    el.dialog.addEventListener('click', (e) => { if (!e.target.closest('button')) pressA(); });
    el.mute.addEventListener('click', () => { G.Audio.unlock(); setMute(G.Audio.toggleMute()); });
    setMute(G.Audio.muted);
    el.modal.addEventListener('click', (e) => { if (e.target === el.modal && panelState && panelState.dismissable) closePanel(); });
  }
  function setMute(m) { el.mute.classList.toggle('off', m); el.mute.setAttribute('aria-pressed', String(!m)); el.mute.title = m ? 'Sound off (M)' : 'Sound on (M)'; }

  // ---------- HUD ----------
  function hud() {
    const S = G.S, E = G.Eco;
    for (const k of ['gold', 'timber', 'stone', 'food']) $('r-' + k).textContent = G.fmt(S.res[k]);
    $('r-folk').textContent = `${S.folk}/${E.cap(S)}`;
    const dr = $('r-dread');
    dr.textContent = Math.round(S.dread);
    dr.parentElement.classList.toggle('warn', S.dread > 60);
    $('r-timber').parentElement.classList.toggle('warn', S.hearth > 0 && S.res.timber < 5);
    $('r-food').parentElement.classList.toggle('warn', S.res.food < 5);
    el.day.textContent = `Day ${S.day}`;
    const ph = E.phase(S.time);
    el.phase.src = G.ICON[ph === 'night' || ph === 'dusk' ? 'moon' : 'sun'];
    el.clock.style.width = (S.time * 100).toFixed(1) + '%';
    el.hud.classList.toggle('night', ph === 'night');
  }

  function toast(msg, kind) {
    const d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.textContent = msg;
    el.toasts.appendChild(d);
    while (el.toasts.children.length > 3) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(() => d.classList.add('out'), 3800);
    setTimeout(() => d.remove(), 4400);
  }
  function objective(text) { el.objective.hidden = !text; el.objective.innerHTML = text ? `<span class="obj-mark">Objective</span> ${text}` : ''; }
  function prompt(text) { el.prompt.innerHTML = text ? `<kbd>A</kbd> ${text}` : '<span class="hint">Walk with the arrows or WASD. Space acts. Tap the map to walk there.</span>'; }

  // ---------- menu navigation ----------
  function pushMenu(root, orient) {
    const m = { root, idx: 0, orient: orient || 'v' };
    menus.push(m);
    refreshSel(m);
    return m;
  }
  function popMenu(root) { const i = menus.findIndex((m) => m.root === root); if (i >= 0) menus.splice(i, 1); }
  function buttons(m) { return Array.from(m.root.querySelectorAll('button:not([disabled])')); }
  function refreshSel(m) {
    const bs = buttons(m);
    m.root.querySelectorAll('button').forEach((b) => b.classList.remove('sel'));
    if (!bs.length) return;
    m.idx = G.clamp(m.idx, 0, bs.length - 1);
    bs[m.idx].classList.add('sel');
  }
  function topMenu() { return menus.length ? menus[menus.length - 1] : null; }

  // Returns true if the UI consumed input this frame (the world should not move).
  function handleInput() {
    const q = G.Input.drain();
    const blocking = isBlocking();
    for (const k of q) {
      if (k === 'mute') { setMute(G.Audio.toggleMute()); continue; }
      if (!blocking) { G.Input.press(k); continue; }
      if (typing && !typing.done) { if (k === 'a') finishTyping(); continue; }
      if (advance && (k === 'a')) { pressA(); continue; }
      const m = topMenu();
      if (!m) continue;
      const bs = buttons(m);
      if (!bs.length) continue;
      const prev = (m.orient === 'v' && k === 'up') || (m.orient === 'h' && k === 'left') || (m.orient === 'g' && (k === 'left' || k === 'up'));
      const next = (m.orient === 'v' && k === 'down') || (m.orient === 'h' && k === 'right') || (m.orient === 'g' && (k === 'right' || k === 'down'));
      if (prev) { m.idx = (m.idx - 1 + bs.length) % bs.length; refreshSel(m); G.Audio.sfx('blip'); }
      else if (next) { m.idx = (m.idx + 1) % bs.length; refreshSel(m); G.Audio.sfx('blip'); }
      else if (k === 'a') { bs[m.idx].click(); }
      else if (k === 'b') { const back = m.root.querySelector('[data-back]'); if (back) back.click(); }
    }
    return blocking;
  }
  function isBlocking() { return !el.dialog.hidden || !el.modal.hidden || G.scene !== 'keep' || G.busy; }

  // ---------- dialogue ----------
  function drawPortrait(who) {
    const c = el.portrait.getContext('2d');
    c.clearRect(0, 0, 16, 16);
    const sp = G.Story.SPEAKERS[who] || {};
    el.portrait.hidden = !sp.art;
    if (!sp.art) return;
    if (G.SPR[sp.art]) c.drawImage(G.SPR[sp.art].down[0], 0, 0, 16, 11, 0, 3, 16, 11);
    else if (G.FOE[sp.art]) c.drawImage(G.FOE[sp.art].img, 0, 0);
    else if (sp.art === 'ember') { const im = new Image(); im.src = G.ICON.flame; im.onload = () => c.drawImage(im, 4, 4); }
  }
  function startTyping(text, pitch) {
    finishTyping();
    el.dtext.textContent = '';
    typing = { full: text, shown: 0, done: false };
    const t = typing;
    t.timer = setInterval(() => {
      t.shown += 2;
      el.dtext.textContent = t.full.slice(0, t.shown);
      if (t.shown % 6 === 0 && t.full[t.shown] !== ' ') G.Audio.sfx('talk', pitch);
      if (t.shown >= t.full.length) finishTyping();
    }, 28);
  }
  function finishTyping() {
    if (!typing) return;
    clearInterval(typing.timer);
    el.dtext.textContent = typing.full;
    const t = typing; t.done = true;
    if (t.onDone) { const f = t.onDone; t.onDone = null; f(); }
  }
  function openDialog(who) {
    const sp = G.Story.SPEAKERS[who] || { name: '' };
    el.dialog.hidden = false;
    el.prompt.hidden = true;
    el.dname.textContent = sp.name || '';
    el.dname.hidden = !sp.name;
    el.dialog.classList.toggle('narration', !sp.name);
    drawPortrait(who);
    return sp;
  }
  function closeDialog() {
    el.dialog.hidden = true; el.prompt.hidden = false;
    el.dchoices.innerHTML = '';
    popMenu(el.dchoices);
  }
  function pressA() {
    if (typing && !typing.done) { finishTyping(); return; }
    if (advance) { const f = advance; advance = null; G.Audio.sfx('blip'); f(); }
  }

  function say(who, text) {
    return new Promise((resolve) => {
      const sp = openDialog(who);
      el.dchoices.innerHTML = '<span class="more">&#9660;</span>';
      startTyping(text, sp.pitch);
      typing.onDone = () => { advance = () => { el.dchoices.innerHTML = ''; resolve(); }; };
    });
  }
  // options: [{label, disabled?, note?}] -> resolves index
  function choose(who, text, options) {
    return new Promise((resolve) => {
      const sp = openDialog(who);
      el.dchoices.innerHTML = '';
      startTyping(text, sp.pitch);
      typing.onDone = () => {
        options.forEach((o, i) => {
          const b = document.createElement('button');
          b.className = 'choice';
          b.innerHTML = `${o.label}${o.note ? `<small>${o.note}</small>` : ''}`;
          b.disabled = !!o.disabled;
          b.addEventListener('click', () => {
            G.Audio.sfx('confirm');
            popMenu(el.dchoices);
            el.dchoices.innerHTML = '';
            resolve(i);
          });
          el.dchoices.appendChild(b);
        });
        pushMenu(el.dchoices, 'v');
      };
    });
  }
  async function scene(lines) {
    for (const l of lines) await say(l[0], l[1]);
    closeDialog();
  }

  // ---------- panels ----------
  let panelState = null;
  function openPanel(render, opts) {
    return new Promise((resolve) => {
      panelState = { render, resolve, dismissable: !(opts && opts.locked) };
      el.modal.hidden = false;
      drawPanel();
    });
  }
  function drawPanel() {
    if (!panelState) return;
    const p = panelState.render();
    el.mtitle.textContent = p.title;
    el.mbody.innerHTML = p.body;
    el.mactions.innerHTML = '';
    popMenu(el.mactions);
    (p.actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.className = 'act' + (a.cls ? ' ' + a.cls : '');
      b.innerHTML = a.label;
      b.disabled = !!a.disabled;
      if (a.back) b.dataset.back = '1';
      b.addEventListener('click', () => {
        const r = a.onClick ? a.onClick() : 'close';
        if (r === 'close' || a.back) closePanel(a.value);
        else drawPanel();
      });
      el.mactions.appendChild(b);
    });
    const m = pushMenu(el.mactions, 'g');
    if (p.focus !== undefined) { m.idx = p.focus; refreshSel(m); }
  }
  function closePanel(value) {
    if (!panelState) return;
    const r = panelState.resolve;
    panelState = null;
    el.modal.hidden = true;
    popMenu(el.mactions);
    G.Audio.sfx('blip');
    r(value);
  }

  function costHTML(cost) {
    const S = G.S;
    return Object.keys(cost).map((k) => `<span class="cost${S.res[k] < cost[k] ? ' short' : ''}"><img src="${G.ICON[k]}" alt="">${cost[k]} ${k}</span>`).join(' ');
  }

  // ---------- battle dock ----------
  function battleShow(on) {
    el.battle.hidden = !on; el.bhud.hidden = !on;
    el.prompt.hidden = on; el.objective.hidden = on || !el.objective.innerHTML;
    if (!on) { popMenu(el.bactions); el.bactions.innerHTML = ''; el.blog.innerHTML = ''; }
  }
  function blog(msg, cls) {
    const p = document.createElement('p');
    if (cls) p.className = cls;
    p.textContent = msg;
    el.blog.appendChild(p);
    while (el.blog.children.length > 4) el.blog.removeChild(el.blog.firstChild);
  }
  function bactions(list) {
    return new Promise((resolve) => {
      el.bactions.innerHTML = '';
      popMenu(el.bactions);
      list.forEach((a) => {
        const b = document.createElement('button');
        b.className = 'bact' + (a.cls ? ' ' + a.cls : '');
        b.innerHTML = a.label + (a.sub ? `<small>${a.sub}</small>` : '');
        b.disabled = !!a.disabled;
        b.addEventListener('click', () => {
          G.Audio.sfx('blip');
          popMenu(el.bactions);
          el.bactions.innerHTML = '';
          resolve(a.id);
        });
        el.bactions.appendChild(b);
      });
      pushMenu(el.bactions, 'g');
    });
  }
  function bhud(h) {
    el.bhud.innerHTML = `
      <div class="bar hero"><span>Warden <em>Lv ${h.lvl}</em></span><i><b style="width:${(100 * h.hp / h.max).toFixed(0)}%"></b></i><small>${Math.max(0, Math.ceil(h.hp))}/${h.max}</small>
        <span class="pips">${('<img src="' + G.ICON.flame + '" alt="">').repeat(h.charges)}${h.tonics ? ' <img src="' + G.ICON.tonic + '" alt="">x' + h.tonics : ''}</span></div>
      ${h.foe ? `<div class="bar foe"><span>${h.foe.name}</span><i><b style="width:${(100 * Math.max(0, h.foe.hp) / h.foe.max).toFixed(0)}%"></b></i><small>${Math.max(0, Math.ceil(h.foe.hp))}/${h.foe.max}</small></div>` : `<div class="bar foe site"><span>${h.site}</span><small>${h.room}</small></div>`}`;
  }

  // ---------- title menu ----------
  function titleMenu(items) {
    el.titleMenu.innerHTML = '';
    popMenu(el.titleMenu);
    el.titleMenu.hidden = items.length === 0;
    items.forEach((it) => {
      const b = document.createElement('button');
      b.className = 'choice';
      b.textContent = it.label;
      b.addEventListener('click', () => { G.Audio.unlock(); G.Audio.sfx('confirm'); it.onClick(); });
      el.titleMenu.appendChild(b);
    });
    if (items.length) pushMenu(el.titleMenu, 'v');
  }

  return {
    init, hud, toast, objective, prompt, say, choose, scene, closeDialog, openPanel, closePanel, drawPanel,
    costHTML, handleInput, isBlocking, battleShow, blog, bactions, bhud, titleMenu,
    get panelOpen() { return !!panelState; },
  };
})();
