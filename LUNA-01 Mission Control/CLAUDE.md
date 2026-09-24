# LUNA-01 - notes for AI assistants

Spec: `docs/LUNA-01_GDD.pdf`. Data: `data/moon_environment_dataset.csv` (authoritative; never edit values).

## Hard constraints
- Vanilla HTML/CSS/JS + Canvas 2D + Web Audio only. No frameworks, engines, libraries, backend, image or audio files.
- Every visual is procedural (src/render.js); every sound is synthesized (src/audio.js).
- Classic `<script>` tags (not ES modules) so the game runs from `file://`. Globals: `NasaData`, `M`, option tables, `Sfx`, `Draw`, `UI`, `Game`.
- Scope is fixed by the GDD: one mission, four checkpoints, 5-7 minutes. Don't add missions, planets, 3D, physics sims, or menus.

## Scientific honesty
- Lunar values are shown only via `NasaData.show()/get()` with a confidence tag (`nasa`, `approx`, `estimate`, `derived`).
- Gameplay numbers live in `src/state.js` and are labelled "game model" in the UI. Never present them as NASA measurements.
- If the CSV changes: `node tools/embed-csv.js` to regenerate `data/moon_data_embedded.js`.

## Architecture
- `Game.go(state)` switches state; `ENTER[state]` runs setup; `Game.setPhase()` handles sub-steps (choose → animating → done).
- Timed transitions live in `update(dt)` in src/game.js. UI panels are rebuilt only on state/phase/selection change.
- Canvas is a fixed 1280x720 logical stage; `fit()` scales the whole `#stage` to the window.
- Right-hand decision panels start at x=808; keep canvas scene content left of that.

## Testing
- Serve with `python -m http.server 8123` (launch config in .claude/launch.json).
- Balance check: every path's outcome can be enumerated headlessly by loading src/state.js in Node and calling
  resetMission(scenarioId) → commitDesign → arrive → chooseOrbit → runScan → applyEventDrain → chooseEvent → transmit → evaluate.
  Target: roughly 2-5% of all paths succeed, several designs win per condition, no plan wins in all four conditions.
- Earth/Moon textures are generated per-pixel in Draw.init() (~0.7 s); keep per-frame drawing to drawImage + light overlays.
