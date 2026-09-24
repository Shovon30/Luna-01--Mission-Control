# LUNA-01: Mission Control

A short (about 5–7 minute) browser game for the **NASA Space Apps Challenge 2026: Space Mission Design Game**.
You are the Mission Director of one robotic lunar science mission. You design the spacecraft, launch it, choose an orbit,
survey the Moon's south polar region using real NASA data, handle one mission event, and transmit the data home.

> There is no perfect mission design. Every advantage has a cost.

## How to run

It has no build step and no dependencies. Use either option:

1. **Double-click `index.html`.** This works in Chrome, Edge and Firefox. Browsers block `fetch()` on `file://`, so the game
   falls back to `data/moon_data_embedded.js`, which is a verbatim copy of the CSV.
2. **Serve the folder** (recommended for demos). The game then reads the real CSV directly:
   ```
   python -m http.server 8123
   ```
   Then open http://localhost:8123.

Controls: mouse. Keys `1`/`2`/`3` (or `A`/`B`/`C`) pick decision options. `M` toggles sound.

## Tech

HTML5, CSS3, vanilla JavaScript, Canvas 2D and the Web Audio API. It uses no libraries, no image files and no audio files.
Every visual is drawn by code. Earth and Moon are generated pixel by pixel at startup (3D noise terrain, crater height maps,
directional lighting, atmospheric limb). Spacecraft, rocket, exhaust, smoke, beams and data pulses are drawn each frame, and
the launch has camera shake. All sound is synthesized through a compressor: a mission-control ambience (drone, telemetry pulses,
computer chatter), NASA-style Quindar tones, a master-alarm warning, an ignition explosion with sustained rumble, sonar-style
scan pings and modem-style data bursts.

```
index.html               page shell + script tags (classic scripts, so file:// works)
style.css                retro mission-control UI (fixed 1280x720 stage, scaled to fit)
data/moon_environment_dataset.csv   NASA dataset (authoritative, unmodified)
data/moon_data_embedded.js          generated copy of the CSV for file:// (node tools/embed-csv.js)
src/data.js              CSV loader/parser, confidence labels, value formatting
src/state.js             option tables, central mission state M, all game formulas, outcome
src/audio.js             procedural Web Audio music + sound effects
src/render.js            procedural Canvas drawing and one scene function per state
src/ui.js                HUD, checkpoint tracker, decision panels, report
src/game.js              state machine, timed phases, input, main loop, boot
docs/LUNA-01_GDD.pdf     game design document
```

State machine: `TITLE → BRIEFING → DESIGN → DESIGN_REVIEW → LAUNCH → TRANSFER → ORBIT_DECISION → SURVEY →
MISSION_EVENT → TRANSMISSION → RESULT → REPORT → (Play again → DESIGN)`.

## NASA data vs. game model

All lunar values shown in the game come from `data/moon_environment_dataset.csv`, with their units and sources (hover a data
row in the survey, or open "Sources"). Each value is tagged:

| Tag | Meaning |
|---|---|
| `NASA DATA` | value as given by the NASA source |
| `NASA · APPROX.` | the source marks it approximate (e.g. LCROSS "~6% water") |
| `ESTIMATE · UNCERTAIN` | the dataset marks it low-confidence (e.g. total polar ice mass, "could be off considerably") |
| `DERIVED FROM NASA` | computed from a NASA value: day/night ≈ synodic period ÷ 2; signal delay = distance ÷ speed of light |
| `GAME MODEL` | a simplified gameplay number, **not** a NASA measurement |

Budget, power, fuel, science, mass, communication and risk numbers are a **simplified game model** chosen for balance
(all in `src/state.js`). The game does not simulate real orbital mechanics.

## Game rules (simplified model)

- **Mission condition (random each run)** is shown in the briefing and changes which design wins:
  - *Solar Maximum*: every risk increase ×1.5; Radiation Sensor +10 science per scan.
  - *Long Polar Night*: lunar-night drain 24% (8% with battery); reserve power costs 22% (8% with battery).
  - *Budget Cut*: budget cap $80M.
  - *Ice Hunt*: science goal 80; Spectrometer +10 science per scan.
- **Objectives.** Full **Success** needs all three: science ≥ goal (70, or 80 in Ice Hunt), end power ≥ 15%, and end fuel ≥ 10%.
  **Failure** means power reached 0%, risk ≥ 75, or science < 40. Anything else is **Partial success**, and the report lists the missed objectives.
- **Design validation:** budget ≤ cap, mass ≤ rocket limit, power ≥ 60%, and fuel after lunar arrival ≥ 10%.
- **Communication** = bus 40 + rocket dish (+10/+20/+30) + power system (+0/+20/+10).
- **Arrival burn** uses fuel = spacecraft mass ÷ 10. **Orbit:** Low gives +12 science for 18% fuel, 8% power and +10 risk. Higher costs 6% fuel and 3% power.
- **Survey:** science = instrument base (48/52/56) × scan multiplier (0.6/1.0/1.35) + bonus. Power 10/16/27; risk 0/+8/+16.
- **Event:** heaters drain 14% power (5% with battery). Then you choose: A −10 science and −5 risk; B spend reserve power; C +8 science, −8% power, +20 risk.
- **Transmission:** Compressed returns 75% of the data and full returns 100%. Power cost falls as comm capability rises. A weak link on full resolution adds risk.
- **Risk:** power < 20% gives +10 and fuel < 10% gives +15. Risk ≥ 40 causes a transmission anomaly (−20% data).
- Outcomes are deterministic. Across every possible path, about 3% succeed; the winning plans differ by condition, and no plan wins all four.

## Assumptions made during implementation

- The GDD asks for exactly three design choices, so communication capability is *derived* (rocket fairing → dish size,
  power system → transmitter power) rather than being a fourth choice.
- The survey target is the south polar region (Cabeus area), because the dataset's water data (LCROSS) refers to it.
- Mission conditions and the three objectives were added to make decisions challenging and replayable (user request). They stay
  within the GDD's single mission.
- The mission event is the GDD's "Power Demand Increase", framed as the target entering lunar night, which uses the dataset's
  synodic period and minimum temperature.
- The CSV is loaded with `fetch()`; the embedded JS copy exists only because browsers block `fetch()` on `file://`.
  After editing the CSV, regenerate the copy with `node tools/embed-csv.js`.
