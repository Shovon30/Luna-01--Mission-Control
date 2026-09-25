# LUNA-01: Mission Control

A short (about 6–8 minute) browser game for the **NASA Space Apps Challenge 2026: Space Mission Design Game**.
You are the Mission Director of one robotic lunar science mission. You choose where on the Moon to survey, design the
spacecraft, launch it, survive in-flight hazards, choose an orbit, survey your target using real NASA data, handle a lunar-night
power crisis, and transmit the data home.

> There is no perfect mission design. Every advantage has a cost.

## How to run

It has no build step and no dependencies. Use either option:

1. **Double-click `index.html`.** This works in Chrome, Edge and Firefox. Browsers block `fetch()` on `file://`, so the game
   falls back to `data/moon_data_embedded.js`, which holds verbatim copies of the CSV files.
2. **Serve the folder** (recommended for demos). The game then reads the real CSV files directly:
   ```
   python -m http.server 8123
   ```
   Then open http://localhost:8123.

Controls: mouse. Keys `1`–`5` (or `A`–`D`) pick decision options. `M` toggles sound.

## Tech

HTML5, CSS3, vanilla JavaScript, Canvas 2D and the Web Audio API. It uses no libraries, no image files and no audio files.
Every visual is drawn by code. The Moon (nearside and farside) and the Earth are generated pixel by pixel at startup on a real
latitude/longitude grid. The major maria and named craters (Tycho, Copernicus and others) sit in their approximate real places,
so the Apollo landing sites from the dataset land on the right terrain. The spacecraft shows the protection kit you fitted.
Hazards have their own visuals: meteoroid swarms, venting propellant, computer glitches, solar-storm glare and clinging dust.
All sound is synthesized through a compressor. That includes the mission-control ambience, NASA-style Quindar tones, the
master alarm, a launch explosion with camera shake, and hazard sounds: proximity pings, hissing leaks, glitches, static and impacts.

```
index.html               page shell + script tags (classic scripts, so file:// works)
style.css                mission-operations UI (fixed 1280x720 stage, scaled to fit)
data/*.csv               the four NASA datasets (authoritative, unmodified)
data/moon_data_embedded.js          generated copies of the CSVs for file:// (node tools/embed-csv.js)
src/data.js              CSV loader/parser for all datasets, confidence labels, value formatting
src/state.js             targets, kits, hazards, option tables, mission state M, all game formulas, outcome
src/audio.js             procedural Web Audio music + sound effects
src/render.js            procedural Canvas drawing and one scene function per state
src/ui.js                HUD, tracker, decision/hazard panels, NASA facts feed, report
src/game.js              state machine, hazard triggers, timed phases, input, main loop, boot
docs/LUNA-01_GDD.pdf     game design document
```

State machine: `TITLE → BRIEFING → TARGET → DESIGN → DESIGN_REVIEW → LAUNCH → TRANSFER (hazard 1) → ORBIT_DECISION →
SURVEY (hazard 2) → MISSION_EVENT → TRANSMISSION → RESULT → REPORT → (New mission → BRIEFING)`.

## NASA datasets

| File | Used for |
|---|---|
| `moon_environment_dataset.csv` | gravity, temperatures, water/ice, radiation, atmosphere, lunar day/night |
| `moon_regions_non_polar_dataset.csv` | Apollo landing coordinates (plotted on the target map), Tranquillitatis and Marius Hills pits, maria and highland chemistry, crust thickness |
| `moon_dust_dataset.csv` | Descartes regolith data, the dust-contamination hazard, dust facts (including lab-simulant values, which are labelled as such) |
| `earth_moon_orbital_dataset.csv` | transfer panel (perigee/apogee, Moon speed, radio delay), Earth escape velocity at launch, tidal lock for the far-side target, facts feed |

Every displayed value keeps its unit and source (hover a data row, or open "Sources"), and is tagged:

| Tag | Meaning |
|---|---|
| `NASA DATA` | value as given by the NASA source |
| `NASA · APPROX.` | the source marks it approximate (e.g. LCROSS "~6% water") |
| `NASA · QUALITATIVE` | the source only gives a qualitative value (e.g. young-maria regolith "a few feet") |
| `ESTIMATE · UNCERTAIN` | the dataset marks it an estimate / low confidence |
| `DERIVED FROM NASA` | computed from NASA values (e.g. radio delay, barycentre, escape-velocity ratio) |
| `LAB SIMULANT` | measured on lunar dust simulant, not real Moon dust |
| `GAME MODEL` | a simplified gameplay number, **not** a NASA measurement |

Budget, power, fuel, science, mass, communication, risk, hazard odds and target modifiers are a **simplified game model**
(all in `src/state.js`). The game does not simulate real orbital mechanics.

## Game rules (simplified model)

- **Mission condition (random each run):** *Solar Maximum* (risk increases ×1.5, Radiation Sensor +10, storms likely),
  *Long Lunar Night* (night drain ×1.5), *Budget Cut* (cap $80M), or *Ice Hunt* (goal 80, Spectrometer +8 at the South Pole).
- **Survey target (you choose):**

  | Target | Best instrument | Trade-off |
  |---|---|---|
  | South Polar Region (Cabeus) | Spectrometer +10, science ×1.1 | darkest and coldest: night drain ×1.15, Camera −8, −3% fuel |
  | Mare Tranquillitatis Pit | Camera +12, downlink −20% power | Apollo 11 already sampled it: science ×0.9 |
  | Marius Hills Pit | Radiation Sensor +12, downlink −15% power | Spectrometer +0, −2% fuel |
  | Descartes Highlands | Spectrometer +12, science ×1.05 | deep dusty regolith: HIGH dust threat in low orbit |
  | Far Side Highlands | science ×1.25 | no line of sight (tidal lock): downlink +40% power, +8 risk, −5% fuel |

- **Design:** rocket, power system, instrument and **protection kit** (Whipple shield, rad-hard avionics, dust covers or a
  spare tank). Each kit counters one family of hazards; a **threat forecast** shows the odds before launch.
- **Hazards:** one strikes during the transfer and one mid-survey. The pool is a meteoroid swarm, a propellant leak, a
  flight-computer upset, a solar particle event and charged-dust contamination. The odds depend on the target, condition,
  rocket and orbit. Each hazard offers 2–3 responses, some of them gambles with visible odds. The matching kit unlocks a cheap response.
- **Objectives:** full success needs science ≥ goal, end power ≥ 15% and end fuel ≥ 10%. Failure means power reached 0%,
  risk ≥ 75, or science < 40. Anything else is partial success.
- **Balance:** checked exhaustively in Node for all 20 target × condition combinations. With optimal play every combination is
  winnable (81–100%) except the deliberate trap Tranquillitatis + Ice Hunt (~50%). A random valid design played perfectly
  afterwards wins only ~13–29%, and without the right kit some combinations drop to 27–40%.

## Assumptions made during implementation

- Communication capability is *derived* (rocket fairing → dish size, power system → transmitter power).
- Polar and far-side coordinates are not in the datasets; those markers are placed approximately and labelled that way.
  The Apollo site coordinates are shown exactly as in the regions CSV.
- The Moon views are tilted 15° so the south polar region is visible, and the maria and named craters are a visual
  approximation from general knowledge. They are not dataset values and are never displayed as data.
- The dust hazard is a simplified game scenario *inspired by* NASA dust data, and the panel says so.
- After editing any CSV, regenerate the embedded copies with `node tools/embed-csv.js`.
