# Culture Clubhouse Sudoku

A Culture Clubhouse branded Sudoku web app built for iPhone. Add it to your Home Screen and it runs full screen, offline, like a native app.

**Play:** https://dwigy.github.io/culture-clubhouse-sudoku/

## Difficulties

Every puzzle is generated fresh on the device and checked to have exactly one solution. Each level is also graded by a human-style solver, so the label matches how the puzzle plays and not just how many numbers are on the board.

| Level | Clues | What it takes |
| --- | --- | --- |
| Easy | ~40 | Singles only |
| Normal | ~32 | Singles only, with fewer givens |
| Hard | ~27 | Locked candidates and naked pairs |
| Extreme | 22–26 | Minimal puzzles that basic techniques can't finish |

## Features

- Notes (pencil marks) that clear themselves when you place a number
- Undo, Erase, and 3 hints per puzzle
- Mistake counter, with a toggle to hide red mistakes
- Matching-number highlight, plus row, column and box highlight
- Timer that pauses when you leave the app
- A separate saved game for each level, so switching levels never loses progress
- Best times and solve counts per level
- Light and dark mode follow the phone's setting
- Works offline after the first visit

## Install on iPhone

Open the link in Safari, tap **Share**, then **Add to Home Screen**.

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

```
index.html            page shell
style.css             brand and layout
sudoku.js             generator, uniqueness solver, difficulty grader
app.js                game state, input, saves, stats
sw.js                 offline cache
manifest.webmanifest  home screen install
icons/                app icons
```

Pushes to `main` deploy to GitHub Pages via `.github/workflows/pages.yml`.

*The future creates.*
