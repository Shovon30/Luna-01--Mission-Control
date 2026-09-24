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
Every visual is drawn by code: stars, Earth, Moon and craters, spacecraft, rocket, flames, particles, beams, data pulses. All sound
is synthesized: the chiptune music loop, UI blips, warning, launch rumble, scan, transmission, success and failure.

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

- **Start:** $100M budget, 60 science goal. The rocket sets the payload limit (520 / 580 / 800 kg) and the fuel.
- **Design validation:** the design must pass budget ≤ $100M, mass ≤ rocket limit, power ≥ 60%, and fuel after lunar arrival ≥ 10%.
  Each check can fail (e.g. Heavy + High-Capacity + Spectrometer costs $101M).
- **Communication** = bus 40 + rocket dish (+10/+20/+30) + power system (+0/+20/+10). Weaker links make transmission cost more power.
- **Arrival burn** uses fuel = spacecraft mass ÷ 10.
- **Orbit:** Low gives +10 science and costs more fuel, power and risk. Higher is cheap and safe.
- **Survey:** science = instrument base × scan multiplier (0.6 / 1.0 / 1.35) + target bonus. The bonus is Spectrometer +8 (water ice) or Radiation +4.
- **Event (lunar night):** heaters drain 12% power (4% with battery). Then you choose: A reduces science, B spends power, C adds science but +20 risk.
- **Transmission:** Compressed returns 80% of the data for little power. Full returns 100% for more power.
- **Risk:** power < 20% gives +10 and fuel < 10% gives +15. Risk ≥ 40 means a transmission anomaly (−15% data). Risk ≥ 75 loses the mission.
- **Outcome** (deterministic, no randomness): **Failure** if power hits 0%, risk ≥ 75, or science < 30.
  **Success** if science ≥ 60. Otherwise **Partial success**.

## Assumptions made during implementation

- The GDD asks for exactly three design choices, so communication capability is *derived* (rocket fairing → dish size,
  power system → transmitter power) rather than being a fourth choice.
- The survey target is the south polar region (Cabeus area), because the dataset's water data (LCROSS) refers to it.
- The mission event is the GDD's "Power Demand Increase", framed as the target entering lunar night, which uses the dataset's
  synodic period and minimum temperature.
- The CSV is loaded with `fetch()`; the embedded JS copy exists only because browsers block `fetch()` on `file://`.
  After editing the CSV, regenerate the copy with `node tools/embed-csv.js`.
