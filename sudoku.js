/* Sudoku engine: generation, uniqueness check, and a human-style grader.
   Grids are flat arrays of 81 numbers, 0 = empty. */
(function (root) {
  'use strict';

  const ROW = [], COL = [], BOX = [], PEERS = [], UNITS = [];
  for (let i = 0; i < 81; i++) {
    ROW[i] = Math.floor(i / 9);
    COL[i] = i % 9;
    BOX[i] = Math.floor(ROW[i] / 3) * 3 + Math.floor(COL[i] / 3);
  }
  for (let u = 0; u < 9; u++) {
    UNITS.push([...Array(81).keys()].filter(i => ROW[i] === u));
    UNITS.push([...Array(81).keys()].filter(i => COL[i] === u));
    UNITS.push([...Array(81).keys()].filter(i => BOX[i] === u));
  }
  for (let i = 0; i < 81; i++) {
    const s = new Set();
    for (let j = 0; j < 81; j++) {
      if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) s.add(j);
    }
    PEERS[i] = [...s];
  }

  const ALL = 0x3fe; // bits 1..9
  const popcount = m => { let c = 0; while (m) { m &= m - 1; c++; } return c; };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Backtracking with bitmasks and fewest-candidates-first.
  // Returns number of solutions found (stops at limit). If `out` given, writes the first solution.
  function solve(grid, limit, out, randomize) {
    const g = grid.slice();
    const r = new Uint16Array(9), c = new Uint16Array(9), b = new Uint16Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (v) {
        const bit = 1 << v;
        if ((r[ROW[i]] | c[COL[i]] | b[BOX[i]]) & bit) return 0;
        r[ROW[i]] |= bit; c[COL[i]] |= bit; b[BOX[i]] |= bit;
      }
    }
    let count = 0;
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ALL & ~(r[ROW[i]] | c[COL[i]] | b[BOX[i]]);
        const n = popcount(m);
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n <= 1) break; }
      }
      if (best === -1) {
        count++;
        if (out && count === 1) for (let i = 0; i < 81; i++) out[i] = g[i];
        return count >= limit;
      }
      if (bestN === 0) return false;
      const order = randomize ? shuffle(digits.slice()) : digits;
      for (const d of order) {
        const bit = 1 << d;
        if (!(bestMask & bit)) continue;
        g[best] = d; r[ROW[best]] |= bit; c[COL[best]] |= bit; b[BOX[best]] |= bit;
        if (rec()) return true;
        g[best] = 0; r[ROW[best]] &= ~bit; c[COL[best]] &= ~bit; b[BOX[best]] &= ~bit;
      }
      return false;
    }
    rec();
    return count;
  }

  function fullGrid() {
    const out = new Array(81).fill(0);
    solve(new Array(81).fill(0), 1, out, true);
    return out;
  }

  // Human-style grader. Returns the hardest technique tier needed, or 99 if logic alone stalls.
  // 1 = naked + hidden singles, 2 = + locked candidates and naked pairs.
  function grade(puzzle) {
    const g = puzzle.slice();
    const cand = new Uint16Array(81);
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      let m = ALL;
      for (const p of PEERS[i]) if (g[p]) m &= ~(1 << g[p]);
      cand[i] = m;
    }
    const place = (i, d) => {
      g[i] = d; cand[i] = 0;
      for (const p of PEERS[i]) cand[p] &= ~(1 << d);
    };
    let tier = 1;

    function singles() {
      let progress = false;
      for (let i = 0; i < 81; i++) {
        if (!g[i] && popcount(cand[i]) === 1) { place(i, 31 - Math.clz32(cand[i])); progress = true; }
      }
      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d;
          let spot = -1, n = 0;
          for (const i of unit) {
            if (g[i] === d) { n = -1; break; }
            if (!g[i] && (cand[i] & bit)) { spot = i; n++; }
          }
          if (n === 1) { place(spot, d); progress = true; }
        }
      }
      return progress;
    }

    function advanced() {
      let progress = false;
      // Locked candidates (pointing + claiming)
      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d++) {
          const bit = 1 << d;
          const spots = unit.filter(i => !g[i] && (cand[i] & bit));
          if (spots.length < 2) continue;
          const sameRow = spots.every(i => ROW[i] === ROW[spots[0]]);
          const sameCol = spots.every(i => COL[i] === COL[spots[0]]);
          const sameBox = spots.every(i => BOX[i] === BOX[spots[0]]);
          const others = [];
          if (sameRow) others.push(UNITS[ROW[spots[0]] * 3]);
          if (sameCol) others.push(UNITS[COL[spots[0]] * 3 + 1]);
          if (sameBox) others.push(UNITS[BOX[spots[0]] * 3 + 2]);
          for (const o of others) {
            if (o === unit) continue;
            for (const i of o) {
              if (!g[i] && !spots.includes(i) && (cand[i] & bit)) { cand[i] &= ~bit; progress = true; }
            }
          }
        }
      }
      // Naked pairs
      for (const unit of UNITS) {
        const pairs = unit.filter(i => !g[i] && popcount(cand[i]) === 2);
        for (let a = 0; a < pairs.length; a++) {
          for (let b2 = a + 1; b2 < pairs.length; b2++) {
            if (cand[pairs[a]] !== cand[pairs[b2]]) continue;
            const m = cand[pairs[a]];
            for (const i of unit) {
              if (!g[i] && i !== pairs[a] && i !== pairs[b2] && (cand[i] & m)) { cand[i] &= ~m; progress = true; }
            }
          }
        }
      }
      return progress;
    }

    for (;;) {
      if (g.every(v => v)) return tier;
      if (singles()) continue;
      if (advanced()) { tier = Math.max(tier, 2); continue; }
      return 99;
    }
  }

  const LEVELS = {
    //        target clues, accepted grades, whether to strip to minimal
    easy:    { clues: 40, grades: [1] },
    normal:  { clues: 32, grades: [1] },
    hard:    { clues: 27, grades: [2] },
    extreme: { clues: 22, grades: [99], minimal: true },
  };

  function carve(solution, cfg) {
    const p = solution.slice();
    // Symmetric removal (180° rotation) for the classic look, except Extreme strips everything it can.
    const order = shuffle([...Array(41).keys()]);
    let clues = 81;
    for (const i of order) {
      if (clues <= cfg.clues) break;
      const j = 80 - i;
      const keepI = p[i], keepJ = p[j];
      p[i] = 0; p[j] = 0;
      if (solve(p, 2) !== 1) { p[i] = keepI; p[j] = keepJ; continue; }
      clues -= i === j ? 1 : 2;
    }
    if (cfg.minimal) {
      for (const i of shuffle([...Array(81).keys()])) {
        if (!p[i] || clues <= cfg.clues) continue;
        const keep = p[i];
        p[i] = 0;
        if (solve(p, 2) !== 1) p[i] = keep; else clues--;
      }
    }
    return p;
  }

  function generate(level) {
    const cfg = LEVELS[level] || LEVELS.normal;
    let fallback = null;
    for (let attempt = 0; attempt < 60; attempt++) {
      const solution = fullGrid();
      const puzzle = carve(solution, cfg);
      const g = grade(puzzle);
      const result = { puzzle, solution, level, grade: g, clues: puzzle.filter(Boolean).length };
      if (cfg.grades.includes(g)) return result;
      if (!fallback || Math.abs(g - cfg.grades[0]) < Math.abs(fallback.grade - cfg.grades[0])) fallback = result;
    }
    return fallback;
  }

  root.Sudoku = { generate, solve, grade, ROW, COL, BOX, PEERS, LEVELS };
  if (typeof module !== 'undefined') module.exports = root.Sudoku;
})(typeof self !== 'undefined' ? self : globalThis);
