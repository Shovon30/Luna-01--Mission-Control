# LUNA-01 - notes for AI assistants

Spec: `docs/LUNA-01_GDD.pdf`. Data: the four CSVs in `data/` (authoritative; never edit values).

## Hard constraints
- Vanilla HTML/CSS/JS + Canvas 2D + Web Audio only. No frameworks, engines, libraries, backend, image or audio files.
- Every visual is procedural (src/render.js); every sound is synthesized (src/audio.js).
- Classic `<script>` tags (not ES modules) so the game runs from `file://`. Globals: `NasaData`, `M`, option tables, `Sfx`, `Draw`, `UI`, `Game`.
- Scope is fixed by the GDD: one mission, four checkpoints, 5-7 minutes. Don't add missions, planets, 3D, physics sims, or menus.

## Scientific honesty
- Lunar values are shown only via `NasaData.show(key, ds)/get(key, ds)` with a confidence tag (`nasa`, `approx`, `qual`, `estimate`, `derived`, `lab`).
  Datasets: `moon`, `dust`, `orbit`, `regions`. Regions rows are keyed `"region|key_feature"`; repeated parameter names are reachable as `"category|parameter"`.
- Gameplay numbers live in `src/state.js` and are labelled "game model" in the UI. Never present them as NASA measurements.
- If any CSV changes: `node tools/embed-csv.js` to regenerate `data/moon_data_embedded.js`.

## Architecture
- `Game.go(state)` switches state; `ENTER[state]` runs setup; `Game.setPhase()` handles sub-steps (choose → animating → done).
- Travel: `TRAVEL_MODES` + `travelPlan(id, mass)` in state.js (time, fuel split TLI/LOI, cruise power, risk, night factor,
  transit-hazard chance). Chosen on TRAJECTORY, locked by `setTravel()` on LAUNCH; `departEarth()` (TLI) and `arrive()` (LOI)
  spend the fuel. TRANSFER phases: parking → tli → cruise → loi → arrived, mirrored in `M.flightPhase`. Earth-Moon distances
  are injected from the orbital CSV with `setEarthMoon()` at boot.
- Launch timeline `Draw.LT`: pre-launch poll until `count`, T-5 countdown until `ignite`; nothing lifts off before T-0.
- Hazards: `startHazard(slot)` pauses the current phase (`Game.hazard.resume`), phases `hazard` → `hazardDone` → resume.
  Progress clocks in render.js use `progressT(phase)` so they freeze while a hazard is open.
- Timed transitions live in `update(dt)` in src/game.js. UI panels are rebuilt only on state/phase/selection change.
- Canvas is a fixed 1280x720 logical stage; `fit()` scales the whole `#stage` to the window.
- Right-hand decision panels start at x=808; keep canvas scene content left of that.

## Testing
- Serve with `python -m http.server 8123` (launch config in .claude/launch.json).
- Balance check: every path's outcome can be enumerated headlessly by loading src/state.js in Node and calling
  resetMission(scenarioId); M.region = id → commitDesign → setTravel → departEarth → resolveHazard(slot 1, prob. hazardChance) → arrive → chooseOrbit → resolveHazard(slot 2)
  → runScan → applyEventDrain → chooseEvent → transmit → evaluate (expectimax over hazardWeights and gamble odds).
  Targets: optimal play wins most region x condition combos; random design + good play ~15-30%; kits matter where threat is HIGH.
- Earth/Moon are equirectangular maps built in Draw.init() (~1.2 s), wrapped onto spinning globes per frame via size-bucketed
  lookups (128/256/512 px); a globe re-renders only when its longitude moves a texel. Keep frames at a few ms.
- Spin: `earth(ctx,x,y,r,hours)`, `moon(ctx,x,y,r,{lon})` with `earthLon/moonLon(hours)` (periods from the orbit CSV).
  Journey scenes use `journeyMET()`, others `lapseHours(t)`. Target/survey/downlink Moon stays static (markers).
