# Ashen Keep

An 8-bit dark fantasy castle tycoon with a story underneath it.

Seven winters ago the Sun went out. You are the last Warden of Ashen Keep, come home to a ruin with one ember still breathing in the hearth. Rebuild the castle around that ember, shelter the folk who follow its light, hold the walls against the Hollow each night, and venture beyond the gate to learn who broke the Sun.

It runs in any modern browser, on desktop or phone. No build step, no dependencies.

## Play

- **Walk:** arrows or WASD (or the on-screen d-pad, or tap the map)
- **Act / confirm:** Space, E or Enter (or **A**)
- **Back:** Esc (or **B**)
- **Mute:** M

Progress saves automatically in your browser. While you're away, your folk keep working at half pace for up to two hours.

## How the game works

**The Keep (tycoon layer).** Walk to ruined plots to build. Each building levels to 5, capped by the Keep's own level.

| Building | Does |
| --- | --- |
| Woodcutter's Hut | Timber. The Hearth burns it constantly. |
| Fungus Cellar | Food. Nothing else grows in the Dusk. |
| Stone Quarry | Stone for walls and towers. |
| Tithe Hall | Gold, more with more folk. |
| Cottages | Housing. New folk arrive while there's food, room and low dread. |
| Watchtower | Defense against the nightly raid. |
| Chapel of the Flame | Lowers dread. |
| Forge | Upgrades your blade and armor. |
| Apothecary | Brews healing tonics; faster healing at home. |
| The Crypt | Gold for a price, if you choose to open it. |

Production buildings need workers: one folk per building level. **Dread** rises at night and when the Hearth starves; above 60 your folk work slower, above 85 they flee. Every dawn the Hollow test your **defense** against a rising **threat**. The Keep's ledger shows both.

**Expeditions (adventure layer).** The gate leads to four places, unlocked by the story. Each is a short run of encounters and turn-based fights: Strike, Guard (blunt the next hit, then riposte), spend an Ember charge for holy fire (extra damage to Hollow foes), Hex (if you opened the crypt), or drink a tonic. Cleansed places can be revisited for supplies and experience.

**The story.** A quest chain of ten chapters, told through four residents (Sister Maud, Corvin the sellsword, Isolde the crypt witch, and Pip), random keep events with real trade-offs, and a few choices that follow you to the end. There are three endings.

## Run locally

Any static file server works:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` directly from disk also works.

## Deploy

`.github/workflows/pages.yml` publishes the site to GitHub Pages on every push to the default branch. One-time setup: in the repository, go to **Settings → Pages** and set **Source** to **GitHub Actions**.

## Project layout

```
index.html        page shell, HUD, dock, touch pad
css/style.css     the whole look
js/core.js        namespace, helpers, keyboard and touch input
js/sprites.js     palette, pixel sprites drawn from strings, icons, 3x5 number font
js/audio.js       WebAudio chiptune sequencer and sound effects
js/data.js        buildings, costs, foes, expedition sites
js/state.js       game state, economy, day/night clock, raids, save/load
js/lighting.js    dithered 8-bit darkness and light
js/world.js       the castle map, procedural buildings, folk, the Warden
js/ui.js          HUD, dialogue, panels, menu navigation
js/story.js       quest chain, scenes, folk chatter, keep events, endings
js/keep.js        building panels, ledger, forge, gate, dawn reports
js/expedition.js  side-view expeditions and turn-based battles
js/main.js        boot, title screen, main loop
```

All art is generated in code: sprites are strings of palette letters, buildings are drawn with rectangles at 320x180 and scaled up with nearest-neighbour.
