(function () {
  'use strict';

  const { ROW, COL, BOX, PEERS } = Sudoku;
  const LEVELS = ['easy', 'normal', 'hard', 'extreme'];
  const LABEL = { easy: 'Easy', normal: 'Normal', hard: 'Hard', extreme: 'Extreme' };
  const HINTS = 3;
  const KEY = { games: 'ccs.games.v1', stats: 'ccs.stats.v1', prefs: 'ccs.prefs.v1', level: 'ccs.level.v1' };

  const $ = s => document.querySelector(s);
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const games = store.get(KEY.games, {});
  const stats = store.get(KEY.stats, {});
  const prefs = Object.assign({ showMistakes: true, sameNumbers: true }, store.get(KEY.prefs, {}));
  let level = LEVELS.includes(store.get(KEY.level)) ? store.get(KEY.level) : 'easy';
  let game = null;       // current game state
  let sel = -1;          // selected cell
  let notesMode = false;
  let paused = false;

  /* ---------- DOM setup ---------- */
  const boardEl = $('#board'), padEl = $('#pad'), levelsEl = $('.levels');
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('div');
    el.className = `cell r${ROW[i]} c${COL[i]}`;
    el.setAttribute('role', 'gridcell');
    el.addEventListener('pointerdown', e => { e.preventDefault(); select(i); });
    boardEl.appendChild(el);
    cells.push(el);
  }
  const keys = [];
  for (let d = 1; d <= 9; d++) {
    const k = document.createElement('button');
    k.type = 'button';
    k.className = 'key';
    k.innerHTML = `<span>${d}</span><small></small>`;
    k.addEventListener('click', () => input(d));
    padEl.appendChild(k);
    keys.push(k);
  }

  levelsEl.querySelectorAll('button').forEach(b => b.addEventListener('click', () => switchLevel(b.dataset.level)));
  $('#t-undo').addEventListener('click', undo);
  $('#t-erase').addEventListener('click', erase);
  $('#t-notes').addEventListener('click', toggleNotes);
  $('#t-hint').addEventListener('click', hint);
  $('#btn-pause').addEventListener('click', () => setPaused(!paused));
  $('#btn-resume').addEventListener('click', () => setPaused(false));
  $('#btn-menu').addEventListener('click', openMenu);
  $('#scrim').addEventListener('click', closeSheet);

  document.addEventListener('keydown', e => {
    if (!$('#sheet').hidden) { if (e.key === 'Escape') closeSheet(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) { if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); } return; }
    if (/^[1-9]$/.test(e.key)) return input(+e.key);
    const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (move) {
      e.preventDefault();
      if (sel < 0) return select(40);
      let n = sel + move;
      if (move === -1 && COL[sel] === 0) n = sel + 8;
      if (move === 1 && COL[sel] === 8) n = sel - 8;
      return select((n + 81) % 81);
    }
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') return erase();
    if (e.key === 'n' || e.key === 'N') return toggleNotes();
    if (e.key === 'h' || e.key === 'H') return hint();
    if (e.key === ' ') { e.preventDefault(); setPaused(!paused); }
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (game && !game.done) setPaused(true); save(); } });
  window.addEventListener('pagehide', save);

  /* ---------- Game lifecycle ---------- */
  function newGame(lvl) {
    const loading = $('#loading');
    loading.hidden = false;
    $('#loading-text').textContent = lvl === 'extreme' ? 'Building an extreme puzzle' : 'Building puzzle';
    return new Promise(resolve => {
      // Let the spinner paint before the generator runs.
      requestAnimationFrame(() => setTimeout(() => {
        const g = Sudoku.generate(lvl);
        games[lvl] = {
          level: lvl,
          puzzle: g.puzzle,
          solution: g.solution,
          values: g.puzzle.slice(),
          notes: new Array(81).fill(0),
          mistakes: 0,
          hints: HINTS,
          elapsed: 0,
          history: [],
          done: false,
          counted: false,
        };
        bump(lvl, 'played');
        loading.hidden = true;
        resolve(games[lvl]);
      }, 30));
    });
  }

  async function switchLevel(lvl, forceNew) {
    if (lvl !== level) save();
    level = lvl;
    store.set(KEY.level, lvl);
    sel = -1;
    paintLevels();
    if (forceNew || !games[lvl] || games[lvl].done) {
      game = null;
      render();
      game = await newGame(lvl);
    } else {
      game = games[lvl];
    }
    setPaused(false);
    render();
    save();
  }

  function save() {
    if (game) games[game.level] = game;
    store.set(KEY.games, games);
  }

  /* ---------- Input ---------- */
  function select(i) {
    if (!game || paused || game.done) return;
    sel = i;
    render();
  }

  function input(d) {
    if (!game || paused || game.done) return;
    if (sel < 0 || game.puzzle[sel]) return;
    if (game.values[sel] === game.solution[sel]) return; // locked once correct
    if (notesMode) {
      if (game.values[sel]) return;
      record(sel);
      game.notes[sel] ^= 1 << d;
      render();
      return save();
    }
    if (game.values[sel] === d) return;
    record(sel);
    game.values[sel] = d;
    game.notes[sel] = 0;
    if (d === game.solution[sel]) {
      // Clear this digit from peer notes, as players expect.
      for (const p of PEERS[sel]) game.notes[p] &= ~(1 << d);
      cells[sel].classList.remove('pop'); void cells[sel].offsetWidth; cells[sel].classList.add('pop');
      celebrateUnits(sel);
      buzz(8);
    } else {
      game.mistakes++;
      buzz([20, 40, 20]);
    }
    render();
    checkWin();
    save();
  }

  function erase() {
    if (!game || paused || game.done || sel < 0 || game.puzzle[sel]) return;
    if (game.values[sel] === game.solution[sel]) return;
    if (!game.values[sel] && !game.notes[sel]) return;
    record(sel);
    game.values[sel] = 0;
    game.notes[sel] = 0;
    render();
    save();
  }

  function record(i) {
    // Snapshot the cell and every peer's notes, since a correct entry can clear peer notes.
    const peers = PEERS[i].map(p => game.notes[p]);
    game.history.push({ i, v: game.values[i], n: game.notes[i], peers });
    if (game.history.length > 300) game.history.shift();
  }

  function undo() {
    if (!game || paused || game.done) return;
    const h = game.history.pop();
    if (!h) return;
    game.values[h.i] = h.v;
    game.notes[h.i] = h.n;
    PEERS[h.i].forEach((p, k) => { game.notes[p] = h.peers[k]; });
    sel = h.i;
    render();
    save();
  }

  function toggleNotes() {
    notesMode = !notesMode;
    render();
  }

  function hint() {
    if (!game || paused || game.done || game.hints <= 0) return;
    let target = -1;
    if (sel >= 0 && !game.puzzle[sel] && game.values[sel] !== game.solution[sel]) target = sel;
    if (target < 0) {
      // Reveal the most constrained open cell: the one a person is most likely stuck on.
      let best = 10;
      for (let i = 0; i < 81; i++) {
        if (game.values[i] === game.solution[i]) continue;
        const used = new Set(PEERS[i].map(p => game.values[p]).filter((v, k) => v && v === game.solution[PEERS[i][k]]));
        const n = 9 - used.size;
        if (n < best) { best = n; target = i; }
      }
    }
    if (target < 0) return;
    record(target);
    const d = game.solution[target];
    game.values[target] = d;
    game.notes[target] = 0;
    for (const p of PEERS[target]) game.notes[p] &= ~(1 << d);
    game.hints--;
    sel = target;
    cells[target].classList.remove('flash'); void cells[target].offsetWidth; cells[target].classList.add('flash');
    render();
    checkWin();
    save();
  }

  function celebrateUnits(i) {
    const groups = [
      [...Array(81).keys()].filter(j => ROW[j] === ROW[i]),
      [...Array(81).keys()].filter(j => COL[j] === COL[i]),
      [...Array(81).keys()].filter(j => BOX[j] === BOX[i]),
    ];
    groups.forEach(g => {
      if (g.every(j => game.values[j] === game.solution[j])) {
        g.forEach((j, k) => setTimeout(() => { cells[j].classList.remove('flash'); void cells[j].offsetWidth; cells[j].classList.add('flash'); }, k * 25));
      }
    });
  }

  function checkWin() {
    if (!game.values.every((v, i) => v === game.solution[i])) return;
    game.done = true;
    sel = -1;
    const s = stats[game.level] || (stats[game.level] = { played: 0, solved: 0, best: null, total: 0 });
    let isBest = false;
    if (!game.counted) {
      game.counted = true;
      s.solved++;
      s.total += game.elapsed;
      if (s.best == null || game.elapsed < s.best) { s.best = game.elapsed; isBest = true; }
      store.set(KEY.stats, stats);
    }
    render();
    save();
    buzz([10, 60, 10, 60, 30]);
    confetti();
    setTimeout(() => showWin(isBest), 650);
  }

  function bump(lvl, field) {
    const s = stats[lvl] || (stats[lvl] = { played: 0, solved: 0, best: null, total: 0 });
    s[field]++;
    store.set(KEY.stats, stats);
  }

  /* ---------- Timer ---------- */
  setInterval(() => {
    if (!game || paused || game.done || document.hidden || !$('#loading').hidden) return;
    game.elapsed++;
    $('#timer').textContent = fmt(game.elapsed);
    if (game.elapsed % 10 === 0) save();
  }, 1000);

  function setPaused(p) {
    if (game && game.done) p = false;
    paused = p;
    $('#paused').hidden = !p;
    $('#btn-pause').setAttribute('aria-label', p ? 'Resume' : 'Pause');
  }

  /* ---------- Render ---------- */
  function paintLevels() {
    levelsEl.dataset.level = level;
    const idx = LEVELS.indexOf(level);
    levelsEl.querySelector('.levels-pill').style.transform = `translateX(${idx * 100}%)`;
    levelsEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.level === level)));
  }

  function render() {
    paintLevels();
    const s = stats[level];
    $('#best').textContent = s && s.best != null ? fmt(s.best) : '—';
    $('#t-notes').setAttribute('aria-pressed', String(notesMode));
    $('#t-notes .badge').textContent = notesMode ? 'On' : 'Off';
    padEl.classList.toggle('notes-mode', notesMode);

    if (!game) {
      cells.forEach(c => { c.className = c.className.replace(/ (given|unit|same|sel|wrong)/g, ''); c.textContent = ''; });
      return;
    }
    $('#timer').textContent = fmt(game.elapsed);
    const m = $('#mistakes');
    m.textContent = game.mistakes;
    m.classList.toggle('bad', game.mistakes > 0);
    $('#hints-left').textContent = game.hints;
    $('#t-hint').disabled = game.hints <= 0 || game.done;
    $('#t-undo').disabled = !game.history.length || game.done;

    const selVal = sel >= 0 ? game.values[sel] : 0;
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 81; i++) if (game.values[i] && game.values[i] === game.solution[i]) counts[game.values[i]]++;

    for (let i = 0; i < 81; i++) {
      const el = cells[i], v = game.values[i];
      const wrong = v && v !== game.solution[i] && prefs.showMistakes;
      el.classList.toggle('given', !!game.puzzle[i]);
      el.classList.toggle('sel', i === sel);
      el.classList.toggle('unit', sel >= 0 && i !== sel && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]));
      el.classList.toggle('same', prefs.sameNumbers && !!selVal && i !== sel && v === selVal);
      el.classList.toggle('wrong', !!wrong);
      if (v) {
        if (el.firstChild && el.firstChild.nodeType === 3 && el.childNodes.length === 1) el.firstChild.data = v;
        else el.textContent = v;
      } else if (game.notes[i]) {
        let html = '<div class="notes">';
        for (let d = 1; d <= 9; d++) {
          const on = game.notes[i] & (1 << d);
          html += `<span class="${on && prefs.sameNumbers && d === selVal ? 'hot' : ''}">${on ? d : ''}</span>`;
        }
        el.innerHTML = html + '</div>';
      } else {
        el.textContent = '';
      }
      el.setAttribute('aria-label', `Row ${ROW[i] + 1}, column ${COL[i] + 1}, ${v || 'empty'}`);
    }
    keys.forEach((k, idx) => {
      const left = 9 - counts[idx + 1];
      k.classList.toggle('done', left === 0);
      k.querySelector('small').textContent = left ? left : '';
    });
  }

  /* ---------- Sheets ---------- */
  function openSheet(title, body, actions) {
    $('#sheet-title').textContent = title;
    $('#sheet-body').innerHTML = body;
    const a = $('#sheet-actions');
    a.innerHTML = '';
    (actions || []).forEach(({ label, cls, onClick }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls || 'btn-secondary';
      b.textContent = label;
      b.addEventListener('click', onClick);
      a.appendChild(b);
    });
    $('#scrim').hidden = false;
    $('#sheet').hidden = false;
  }

  function closeSheet() {
    $('#scrim').hidden = true;
    $('#sheet').hidden = true;
  }

  function statsHTML() {
    return '<div class="stats">' + LEVELS.map(l => {
      const s = stats[l] || {};
      return `<div><span class="lvl">${LABEL[l]}</span><b>${s.solved || 0}</b><span>solved</span><b style="margin-top:6px">${s.best != null ? fmt(s.best) : '—'}</b><span>best</span></div>`;
    }).join('') + '</div>';
  }

  function openMenu() {
    const wasPaused = paused;
    if (game && !game.done) setPaused(true);
    const resume = () => { closeSheet(); if (!wasPaused) setPaused(false); };
    const body = `
      ${statsHTML()}
      <div class="toggle-row"><span>Show mistakes<small>Wrong numbers turn red</small></span><button type="button" class="switch" role="switch" data-pref="showMistakes" aria-checked="${prefs.showMistakes}" aria-label="Show mistakes"></button></div>
      <div class="toggle-row"><span>Highlight matching numbers<small>Tap a 5, see every 5</small></span><button type="button" class="switch" role="switch" data-pref="sameNumbers" aria-checked="${prefs.sameNumbers}" aria-label="Highlight matching numbers"></button></div>
      <div class="how"><b>Play:</b> fill every row, column and 3×3 box with 1–9. Tap a cell, then a number. <b>Notes</b> pencils in candidates. Each puzzle has exactly one solution.<br><br><b>Install on iPhone:</b> open in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>. It works offline after the first load.</div>`;
    openSheet('Clubhouse', body, [
      { label: `New ${LABEL[level]} puzzle`, cls: 'btn-primary', onClick: () => confirmNew() },
      { label: 'Restart this puzzle', onClick: () => { restart(); closeSheet(); } },
      { label: 'Close', onClick: resume },
    ]);
    $('#sheet-body').querySelectorAll('.switch').forEach(sw => sw.addEventListener('click', () => {
      const k = sw.dataset.pref;
      prefs[k] = !prefs[k];
      sw.setAttribute('aria-checked', String(prefs[k]));
      store.set(KEY.prefs, prefs);
      render();
    }));
  }

  function confirmNew() {
    if (!game || game.done || game.values.every((v, i) => v === game.puzzle[i])) { closeSheet(); return switchLevel(level, true); }
    openSheet('Start fresh?', `<p>Your ${LABEL[level]} puzzle in progress will be replaced.</p>`, [
      { label: `New ${LABEL[level]} puzzle`, cls: 'btn-primary accent', onClick: () => { closeSheet(); switchLevel(level, true); } },
      { label: 'Keep playing', onClick: () => { closeSheet(); setPaused(false); } },
    ]);
  }

  function restart() {
    if (!game) return;
    game.values = game.puzzle.slice();
    game.notes = new Array(81).fill(0);
    game.history = [];
    game.mistakes = 0;
    game.hints = HINTS;
    game.elapsed = 0;
    game.done = false;
    sel = -1;
    setPaused(false);
    render();
    save();
  }

  function showWin(isBest) {
    const next = LEVELS[Math.min(LEVELS.indexOf(level) + 1, LEVELS.length - 1)];
    const body = `
      <p>${LABEL[level]} puzzle, cleared${game.mistakes ? ` with ${game.mistakes} mistake${game.mistakes > 1 ? 's' : ''}` : ' clean'}${game.hints < HINTS ? ` and ${HINTS - game.hints} hint${HINTS - game.hints > 1 ? 's' : ''}` : ''}.</p>
      <div class="win-hero">
        <div><b>${fmt(game.elapsed)}</b><span>${isBest ? 'New best' : 'Time'}</span></div>
        <div><b>${fmt(stats[level].best)}</b><span>Best ${LABEL[level]}</span></div>
      </div>`;
    const actions = [{ label: `Next ${LABEL[level]} puzzle`, cls: 'btn-primary accent', onClick: () => { closeSheet(); switchLevel(level, true); } }];
    if (next !== level) actions.push({ label: `Try ${LABEL[next]}`, onClick: () => { closeSheet(); switchLevel(next); } });
    actions.push({ label: 'Admire the board', onClick: closeSheet });
    openSheet(isBest ? 'New record.' : 'Solved.', body, actions);
  }

  /* ---------- Bits ---------- */
  function fmt(s) {
    if (s == null) return '—';
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = s % 60;
    return (h ? `${h}:${String(m).padStart(2, '0')}` : m) + ':' + String(sec).padStart(2, '0');
  }

  function buzz(p) { if (navigator.vibrate) try { navigator.vibrate(p); } catch (e) { /* unsupported */ } }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const c = document.createElement('canvas');
    c.className = 'confetti';
    const dpr = window.devicePixelRatio || 1;
    c.width = innerWidth * dpr; c.height = innerHeight * dpr;
    document.body.appendChild(c);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    const css = getComputedStyle(document.documentElement);
    const colors = [css.getPropertyValue('--accent'), css.getPropertyValue('--ink'), css.getPropertyValue('--entry'), '#F4EFE6'];
    const bits = Array.from({ length: 140 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .45,
      vx: (Math.random() - .5) * 14, vy: -Math.random() * 16 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .4,
      w: 6 + Math.random() * 6, h: 3 + Math.random() * 4, c: colors[Math.floor(Math.random() * colors.length)],
    }));
    let t = 0;
    (function frame() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      bits.forEach(b => {
        b.vy += .45; b.vx *= .99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
      });
      if (++t < 150) requestAnimationFrame(frame); else c.remove();
    })();
  }

  /* ---------- Boot ---------- */
  render();
  switchLevel(level);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
