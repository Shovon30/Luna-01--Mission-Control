// Mission model: option tables, the central mission state, and the
// simplified gameplay formulas. EVERY number in this file is a SIMPLIFIED
// GAME MODEL value chosen for balance - none of them is a NASA measurement.
// Real lunar values come only from the CSV datasets in data/ (see src/data.js).

const RULES = {
  startBudget: 100,     // $M (a mission condition may cut this)
  maxMass: 800,         // kg (Heavy rocket limit; smaller rockets carry less)
  scienceGoal: 70,      // science needed for the primary objective (a condition may raise it)
  partialMin: 40,       // below this nothing meaningful was returned -> FAILURE
  healthyPower: 15,     // objective: spacecraft must end the mission with at least this power
  fuelReserve: 10,      // objective: fuel kept for an extended mission / safe disposal
  minPower: 60,         // % power margin required at launch
  minArrivalFuel: 10,   // % fuel that must remain after lunar orbit insertion
  lowPower: 20,         // below this: +risk (thin power margin)
  lowFuel: 10,          // below this after orbit: +risk (thin propellant margin)
  riskHigh: 40,         // >= : data-loss anomaly during transmission
  riskCritical: 75,     // >= : spacecraft enters safe mode, mission lost
  anomalyLoss: 0.2,     // fraction of data lost to a high-risk anomaly
};

// Mission conditions: one is drawn at random for every run and announced in the
// briefing. Each changes which design is best, so no single build always wins.
// The linked NASA parameter only provides real-world context for the condition.
const SCENARIOS = {
  solar: {
    id: 'solar', name: 'Solar Maximum', icon: '☀',
    brief: 'The Sun is near peak activity. Solar particle storms and bit-flips are far more likely.',
    effects: ['Every risk increase is ×1.5', 'Radiation Sensor gains +10 science per scan', 'Solar-storm and computer-upset threat HIGH'],
    nasa: 'Unshielded dose from Aug 1972 solar particle event (estimate)', nasaLabel: 'Aug 1972 solar storm, unshielded dose',
    riskMult: 1.5, bonus: { radiation: 10 },
  },
  night: {
    id: 'night', name: 'Long Lunar Night', icon: '☾',
    brief: 'The survey will run deep into a lunar night. Heaters will run hard with no sunlight on the panels.',
    effects: ['Lunar-night drain ×1.5 (battery absorbs most)', 'Using reserve power costs 20% (battery: 8%)'],
    nasa: 'Synodic period (sunrise to sunrise)', nasaLabel: 'Lunar day + night cycle',
    drainMult: 1.5, reserve: 20, batteryReserve: 8,
  },
  budget: {
    id: 'budget', name: 'Budget Cut', icon: '$',
    brief: 'Funding was reduced after mission approval. Every dollar - and every protection kit - has to count.',
    effects: ['Budget cap $80M instead of $100M'],
    budget: 80,
  },
  ice: {
    id: 'ice', name: 'Ice Hunt', icon: '❄',
    brief: 'Mission scientists want proof of polar water ice. The bar for success is higher everywhere.',
    effects: ['Science goal raised to 80', 'Spectrometer +8 per scan at the South Pole'],
    nasa: 'Water in LCROSS impact plume (Cabeus crater; south pole)', nasaLabel: 'LCROSS plume water (Cabeus)',
    goal: 80, bonus: { spectrometer: 8 }, bonusRegion: 'south_pole',
  },
};

// Survey targets. Coordinates of Apollo sites come from the regions CSV (dataKey);
// lat/lon without a dataKey are approximate, for map placement only.
const REGIONS = {
  south_pole: {
    id: 'south_pole', name: 'South Polar Region', short: 'SOUTH POLE', site: 'Cabeus crater area', side: 'near',
    lat: -84.9, lon: -35.5, kind: 'Polar · permanently shadowed craters',
    pitch: 'Water ice may be trapped in craters that never see sunlight.',
    sci: 1.1, bonus: { camera: -8, radiation: 4, spectrometer: 10 }, drain: 1.15, tx: 1.0, txRisk: 0, fuel: 3, dust: 0.8,
    gain: 'Water-ice science: Spectrometer +10, science ×1.1', loss: 'Darkest, coldest target: night drain ×1.15, Camera −8, −3% fuel plane change',
  },
  tranquillitatis: {
    id: 'tranquillitatis', name: 'Mare Tranquillitatis Pit', short: 'TRANQUILLITATIS', site: 'Near the Apollo 11 landing site', side: 'near',
    dataKey: 'Apollo 11 - Mare Tranquillitatis|Lunar Module landing coordinates', lat: 0.67416, lon: 23.47314,
    kind: 'Mare (lava plain) · nearside equatorial',
    pitch: 'A 100 m pit with a shadowed overhang that stays near room temperature.',
    sci: 0.9, bonus: { camera: 12, radiation: 2, spectrometer: 4 }, drain: 0.9, tx: 0.8, txRisk: 0, fuel: 0, dust: 1.0,
    gain: 'Pit imaging: Camera +12 · Earth overhead: downlink −20% power', loss: 'Apollo 11 already sampled this mare: science ×0.9',
  },
  marius: {
    id: 'marius', name: 'Marius Hills Pit', short: 'MARIUS HILLS', site: 'Oceanus Procellarum (location approximate)', side: 'near',
    lat: 14.1, lon: -56.8, kind: 'Possible lava-tube skylight · nearside',
    pitch: 'A skylight into a lava tube - a candidate radiation shelter for future explorers.',
    sci: 1.0, bonus: { camera: 4, radiation: 12, spectrometer: 0 }, drain: 1.0, tx: 0.85, txRisk: 0, fuel: 2, dust: 1.0,
    gain: 'Shelter study: Radiation Sensor +12 · downlink −15% power', loss: 'Little new composition data: Spectrometer +0, −2% fuel',
  },
  descartes: {
    id: 'descartes', name: 'Descartes Highlands', short: 'DESCARTES', site: 'Apollo 16 landing region', side: 'near',
    dataKey: 'Apollo 16 - Descartes Highlands|Lunar Module landing coordinates', lat: -8.9734, lon: 15.5011,
    kind: 'Highlands (bright terrain) · central nearside',
    pitch: 'Ancient calcium- and aluminium-rich crust under the deepest regolith.',
    sci: 1.05, bonus: { camera: 0, radiation: 4, spectrometer: 12 }, drain: 1.0, tx: 0.9, txRisk: 0, fuel: 2, dust: 2.4,
    gain: 'Old crust chemistry: Spectrometer +12, science ×1.05', loss: 'Deep dusty regolith: HIGH dust threat in low orbit',
  },
  farside: {
    id: 'farside', name: 'Far Side Highlands', short: 'FAR SIDE', site: 'Beyond the lunar limb (location illustrative)', side: 'far',
    lat: 15, lon: 175, kind: 'Farside highlands · never visible from Earth',
    pitch: 'The least-explored hemisphere, with a thicker crust than the nearside.',
    sci: 1.25, bonus: { camera: 4, radiation: 6, spectrometer: 6 }, drain: 1.0, tx: 1.4, txRisk: 8, fuel: 5, dust: 1.2,
    gain: 'Least explored: all science ×1.25', loss: 'No line of sight to Earth: downlink +40% power & +8 risk, −5% fuel',
  },
};

// Spacecraft bus: structure, avionics, propellant tanks, antenna mount.
const BUS = { cost: 15, mass: 250, comm: 40 };

const ROCKETS = {
  light: {
    id: 'light', name: 'Light Rocket', role: 'Low cost / low capacity',
    cost: 15, capacity: 520, fuel: 60, propellantMass: 120, comm: 10, risk: 5,
    antenna: 'Compact antenna', antennaSize: 8,
    gain: 'Cheapest launch', loss: 'Tight mass, little fuel, leak-prone',
  },
  medium: {
    id: 'medium', name: 'Medium Rocket', role: 'Balanced',
    cost: 30, capacity: 600, fuel: 85, propellantMass: 150, comm: 20, risk: 0,
    antenna: 'Standard dish', antennaSize: 12,
    gain: 'Good fuel, standard dish', loss: 'Moderate cost',
  },
  heavy: {
    id: 'heavy', name: 'Heavy Rocket', role: 'High capacity',
    cost: 50, capacity: 800, fuel: 100, propellantMass: 180, comm: 30, risk: 0,
    antenna: 'Large high-gain dish', antennaSize: 16,
    gain: 'Full fuel, big dish, 800 kg', loss: 'Half the budget',
  },
};

const POWER_SYSTEMS = {
  basic: {
    id: 'basic', name: 'Basic Solar', role: 'Low cost / low mass',
    cost: 6, mass: 40, power: 70, comm: 0, battery: false, risk: 5,
    gain: 'Cheap and light', loss: 'Low power, no reserve',
  },
  highcap: {
    id: 'highcap', name: 'High-Capacity Solar', role: 'Higher power',
    cost: 14, mass: 85, power: 100, comm: 20, battery: false, risk: 0,
    gain: 'Max power, stronger transmitter', loss: 'Heavier, costlier',
  },
  battery: {
    id: 'battery', name: 'Solar + Battery Backup', role: 'Resilience',
    cost: 20, mass: 120, power: 85, comm: 10, battery: true, risk: 0,
    gain: 'Battery absorbs lunar-night drain', loss: 'Heaviest, most expensive',
  },
};

const INSTRUMENTS = {
  camera: {
    id: 'camera', name: 'Camera', role: 'Surface imaging',
    cost: 8, mass: 25, draw: 5, scan: 48,
    gain: 'Cheap, light, low power', loss: 'Lowest base science',
  },
  radiation: {
    id: 'radiation', name: 'Radiation Sensor', role: 'Radiation environment',
    cost: 14, mass: 45, draw: 8, scan: 52,
    gain: 'Good science; shines in storms & pits', loss: 'Moderate resource demand',
  },
  spectrometer: {
    id: 'spectrometer', name: 'Spectrometer', role: 'Composition analysis',
    cost: 22, mass: 70, draw: 12, scan: 56,
    gain: 'Highest base science', loss: 'Costly, heavy, power-hungry',
  },
};

// Protection kits (4th design slot): each one mitigates a family of hazards.
const KITS = {
  none: { id: 'none', name: 'No Protection', cost: 0, mass: 0, protects: [], gain: 'Saves money & mass', loss: 'No hazard mitigation' },
  shield: { id: 'shield', name: 'Whipple Shield', cost: 5, mass: 35, protects: ['meteoroid'], gain: 'Blocks meteoroids', loss: 'Heavy: +35 kg' },
  hardening: { id: 'hardening', name: 'Rad-Hard Avionics', cost: 6, mass: 15, protects: ['flare', 'seu'], gain: 'Storm-proof avionics', loss: 'Costly electronics' },
  dustcover: { id: 'dustcover', name: 'Dust Covers', cost: 3, mass: 10, protects: ['dust'], gain: 'Clean optics & panels', loss: 'Only helps against dust' },
  tank: { id: 'tank', name: 'Spare Tank', cost: 5, mass: 45, fuel: 10, protects: ['leak'], gain: '+10% fuel, leak-proof', loss: 'Heaviest kit: +45 kg' },
};

const ORBITS = {
  low: {
    id: 'low', name: 'Low Lunar Orbit',
    desc: 'Closer to the surface: sharper observations, more correction burns.',
    fx: { fuel: -18, power: -8, science: +12, risk: +10 },
  },
  high: {
    id: 'high', name: 'Higher Lunar Orbit',
    desc: 'Farther from the surface: stable and cheap, but less detail.',
    fx: { fuel: -6, power: -3, science: 0, risk: 0 },
  },
};

const SCANS = {
  quick:    { id: 'quick',    name: 'Quick Scan',    mult: 0.6,  power: -10, risk: 0,   desc: 'Short pass, minimal power.' },
  standard: { id: 'standard', name: 'Standard Scan', mult: 1.0,  power: -16, risk: +8,  desc: 'Balanced observation campaign.' },
  deep:     { id: 'deep',     name: 'Deep Scan',     mult: 1.35, power: -27, risk: +16, desc: 'Long, intensive campaign.' },
};

const EVENT = {
  drain: 14, batteryDrain: 5, reserve: 16, batteryReserve: 6, // default heater load / reserve cost
  options: {
    reduce:  { id: 'reduce',  key: 'A', name: 'Reduce Survey Intensity', desc: 'Cut instrument time to save energy.' },
    reserve: { id: 'reserve', key: 'B', name: 'Use Reserve Power',       desc: 'Draw down reserves to keep observing.' },
    full:    { id: 'full',    key: 'C', name: 'Continue Full Operation', desc: 'Push hardware beyond its comfort zone.' },
  },
};

const TRANSMISSIONS = {
  compressed: { id: 'compressed', name: 'Compressed Transmission', mult: 0.75, desc: 'Smaller files. 25% of detail is lost.' },
  full:       { id: 'full',       name: 'Full-Resolution Transmission', mult: 1.0, desc: 'Every measurement sent at full detail.' },
};

// In-flight hazards. Slot 1 strikes during the lunar transfer, slot 2 mid-survey.
// Which hazard appears is random, weighted by target, condition, rocket and orbit
// (see hazardWeights); the threat forecast shows these odds before launch.
// Options with `chance` are gambles: `fx` on success, `bad` on failure.
const HAZARDS = {
  meteoroid: {
    id: 'meteoroid', name: 'Meteoroid Swarm', icon: '☄', slots: [1, 2],
    brief: 'Tracking reports a swarm of small meteoroids on a crossing path. Impact in 90 seconds.',
    nasa: { key: 'Atmospheric surface pressure', ds: 'moon', label: 'Lunar surface pressure', note: 'Effectively no atmosphere: meteoroids reach the Moon at full speed, which is why it is covered in craters.' },
    options: () => [
      { id: 'evade', name: 'Evasive burn', desc: 'Fire thrusters and dodge the swarm.', fx: { fuel: -10 } },
      { id: 'brace', name: 'Turn the bus into the swarm', desc: 'Protect the solar panels; take hits on the body.', fx: { power: -12, risk: +10 } },
      { id: 'hold', name: 'Hold course', desc: 'Most swarms miss. Most.', chance: 0.5, fx: {}, bad: { power: -22, risk: +15 } },
    ],
    kit: { id: 'kit', name: 'Face the Whipple shield forward', desc: 'The shield vaporises the particles on impact.', fx: { risk: +2 } },
  },
  leak: {
    id: 'leak', name: 'Propellant Leak', icon: '⛽', slots: [1],
    brief: 'Pressure is dropping in tank B - a stuck valve is venting propellant into space.',
    nasa: { key: 'Escape velocity', ds: 'moon', label: 'Lunar escape velocity', note: 'To be captured, LUNA-01 must still brake below this speed on arrival - that needs propellant.' },
    options: () => [
      { id: 'isolate', name: 'Close the isolation valve', desc: 'Stop the leak but lose what is left in tank B.', fx: { fuel: -15 } },
      { id: 'patch', name: 'Cycle the valve and patch software', desc: 'Save most propellant; costs power and adds risk.', fx: { power: -10, fuel: -5, risk: +6 } },
      { id: 'ignore', name: 'Treat it as a sensor glitch', desc: 'Maybe the pressure gauge is lying.', chance: 0.4, fx: {}, bad: { fuel: -22, risk: +8 } },
    ],
    kit: { id: 'kit', name: 'Switch to the spare tank', desc: 'Seal tank B and feed the engine from the spare.', fx: { fuel: -3 } },
  },
  seu: {
    id: 'seu', name: 'Flight Computer Upset', icon: '⚠', slots: [1, 2],
    brief: 'A high-energy particle flipped bits in the flight computer. LUNA-01 dropped into safe mode.',
    nasa: { key: 'Surface dose rate measured during Apollo', ds: 'moon', label: 'Radiation dose (Apollo)', note: 'No magnetic field or thick atmosphere shields the Moon - or a spacecraft near it.' },
    options: slot => [
      { id: 'reboot', name: 'Full reboot from backup', desc: 'Safe but slow: systems idle while restarting.', fx: slot === 2 ? { power: -10, science: -8 } : { power: -10 } },
      { id: 'hotpatch', name: 'Hot-patch and resume', desc: 'Fast, but corrupted memory may linger.', fx: { risk: +14 } },
    ],
    kit: { id: 'kit', name: 'Let rad-hard avionics self-correct', desc: 'Error-correcting memory repairs the flipped bits.', fx: { power: -2 } },
  },
  flare: {
    id: 'flare', name: 'Solar Particle Event', icon: '☀', slots: [1, 2],
    brief: 'A solar flare launched a storm of energetic protons toward the Moon. Arrival in minutes.',
    nasa: { key: 'Unshielded dose from Aug 1972 solar particle event (estimate)', ds: 'moon', label: 'Aug 1972 storm, unshielded', note: 'A potentially lethal dose for astronauts - and a serious threat to electronics.' },
    options: slot => [
      { id: 'safe', name: 'Instruments off until it passes', desc: slot === 2 ? 'Lose observing time.' : 'Power down everything non-essential.', fx: slot === 2 ? { science: -14 } : { power: -10 } },
      { id: 'push', name: 'Keep operating through the storm', desc: 'Nothing lost now - electronics take the dose.', fx: { risk: +18 } },
    ],
    kit: { id: 'kit', name: 'Rely on rad-hard avionics', desc: 'Shielded electronics ride out the storm.', fx: { risk: +4 } },
  },
  dust: {
    id: 'dust', name: 'Charged Dust Contamination', icon: '◌', slots: [2],
    brief: 'Electrostatically charged dust lofted near the day-night line is clinging to optics and solar panels.',
    nasa: { key: 'Dust covering that halves solar-cell output', ds: 'dust', label: 'Dust that halves solar output', note: 'Lunar dust is charged by solar radiation and clings to surfaces; Apollo 17 reported false instrument readings.' },
    scenarioNote: 'Simplified game scenario inspired by NASA dust-hazard data.',
    options: () => [
      { id: 'recal', name: 'Recalibrate and heat-cycle panels', desc: 'Restore data quality at a power cost.', fx: { power: -12 } },
      { id: 'accept', name: 'Accept degraded data', desc: 'Contaminated readings are thrown away.', fx: { science: -14 } },
      { id: 'spin', name: 'Spin up to shed the dust', desc: 'Uses propellant and stresses the structure.', fx: { fuel: -8, risk: +5 } },
    ],
    kit: { id: 'kit', name: 'Close covers and vibrate panels', desc: 'Your dust covers keep optics clean.', fx: { power: -2 } },
  },
};

// Earth-Moon travel strategies (player decision before launch).
// Each strategy is an average cruise speed (and path-length factor for the wider route).
//   travel time  = parking orbit + distance x path / speed
//   transfer fuel = existing mass/10 budget x (speed / balanced speed)^1.2, split 60% TLI / 40% LOI
// Speeds are calibrated so that, at the NASA mean Earth-Moon distance, BALANCED matches the Apollo 11
// reference (~75 h 50 m) and FUEL-SAVING the Artemis I reference (~5 days). FAST is a direct
// high-energy transfer, quicker than Apollo 8 (~69 h). Historical times are reference points only.
const PARKING_HOURS = 2.7;        // time in Earth parking orbit before trans-lunar injection (game model)
const TRAVEL_MODES = {
  fast: {
    id: 'fast', name: 'Fast Transfer', short: 'FAST', speed: 1.80, path: 1.0, usage: 'HIGH',
    desc: 'Direct, high-energy trajectory. Arrive first - burn the most propellant.',
    ref: 'Quicker than Apollo 8 (≈69 h 08 m to lunar orbit)',
  },
  balanced: {
    id: 'balanced', name: 'Balanced Transfer', short: 'BALANCED', speed: 1.461, path: 1.0, usage: 'MEDIUM',
    desc: 'Classic Apollo-style coast: moderate time, moderate propellant.',
    ref: 'Apollo 11 reference (≈75 h 50 m to reach the Moon)',
  },
  efficient: {
    id: 'efficient', name: 'Fuel-Saving Transfer', short: 'FUEL-SAVING', speed: 1.183, path: 1.3, usage: 'LOW',
    desc: 'Wider, low-energy trajectory. Saves propellant for lunar operations - arrives days later.',
    ref: 'Artemis I reference (≈5 days, wider fuel-saving path)',
  },
};
// Earth-Moon distances (km). Overwritten from earth_moon_orbital_dataset.csv at boot (setEarthMoon);
// the defaults only exist so the model also runs headless in balance tests.
const EARTH_MOON = { mean: 384400, perigee: 363300, apogee: 405500 };
function setEarthMoon(d) { for (const k of ['mean', 'perigee', 'apogee']) if (isFinite(d[k])) EARTH_MOON[k] = d[k]; }

// ---------------------------------------------------------------- mission condition helpers

const M = {};

const scenario = () => SCENARIOS[M.scenario] || SCENARIOS.solar;
const region = () => REGIONS[M.region] || REGIONS.south_pole;
const scienceGoal = () => scenario().goal || RULES.scienceGoal;
const budgetCap = () => scenario().budget || RULES.startBudget;
// Per-scan bonus: target region + mission condition (some conditions only apply to one region).
function instrBonus(i) {
  const sc = scenario();
  const condBonus = !sc.bonusRegion || sc.bonusRegion === M.region ? ((sc.bonus || {})[i.id] || 0) : 0;
  return (region().bonus[i.id] || 0) + condBonus;
}
// Risk increases are amplified by the Solar Maximum condition.
const rk = v => (v > 0 ? Math.round(v * (scenario().riskMult || 1)) : v);
const rkFx = fx => { const o = Object.assign({}, fx); if (o.risk) o.risk = rk(o.risk); return o; };

function pickScenario(avoid) {
  const ids = Object.keys(SCENARIOS).filter(id => id !== avoid);
  return ids[Math.floor(Math.random() * ids.length)];
}

// ---------------------------------------------------------------- formulas

const clamp01 = x => Math.max(0.1, Math.min(1, x));
const loiFuel = mass => Math.round(mass / 10); // total Earth-to-lunar-orbit propellant for a balanced transfer (game model)

// Hours as "2 d 14 h" (or "2 Days 14 Hours" when long).
function fmtDuration(h, long) {
  const d = Math.floor(h / 24), hr = Math.round(h - d * 24);
  const dd = hr === 24 ? d + 1 : d, hh = hr === 24 ? 0 : hr;
  return long ? `${dd} Day${dd === 1 ? '' : 's'} ${hh} Hour${hh === 1 ? '' : 's'}` : `${dd} d ${hh} h`;
}

// Full consequences of a travel strategy for a spacecraft of the given mass.
function travelPlan(id, mass = M.mass) {
  const m = TRAVEL_MODES[id], b = TRAVEL_MODES.balanced;
  const dist = M.moonDistance || EARTH_MOON.mean, dr = dist / EARTH_MOON.mean;
  const cruiseHours = dist * m.path / m.speed / 3600;
  const hours = PARKING_HOURS + cruiseHours;
  const refCruise = EARTH_MOON.mean / b.speed / 3600;                 // balanced coast at mean distance
  const energy = Math.pow(m.speed / b.speed, 1.2);                     // faster = more energetic burns
  const fuelTotal = Math.round(mass / 10 * energy * Math.sqrt(dr));
  const tli = Math.round(fuelTotal * 0.6), loi = fuelTotal - tli;
  return {
    id, name: m.name, short: m.short, usage: m.usage, dist, hours, cruiseHours, fuelTotal, tli, loi,
    cruisePower: Math.max(0, Math.round((cruiseHours / 24 - 2) * 3)),  // heaters, attitude control, comms: 3% per day beyond 2 days
    risk: rk(Math.max(0, Math.round((energy - 1) * 14))),              // high arrival speed makes capture less forgiving
    nightFactor: 1 + 0.6 * ((PARKING_HOURS + cruiseHours) / (PARKING_HOURS + refCruise) - 1), // later arrival = deeper into lunar night
    hazardChance: clamp01((cruiseHours - 45) / 40),                    // longer coast = more time for something to go wrong
    exposure: cruiseHours / refCruise,                                 // longer coast = more radiation exposure
  };
}

function computeDesign(sel) {
  const r = ROCKETS[sel.rocket], p = POWER_SYSTEMS[sel.power], i = INSTRUMENTS[sel.instrument], k = KITS[sel.kit];
  const complete = !!(r && p && i && k);
  const budgetUsed = BUS.cost + (r ? r.cost : 0) + (p ? p.cost : 0) + (i ? i.cost : 0) + (k ? k.cost : 0);
  const mass = BUS.mass + (r ? r.propellantMass : 0) + (p ? p.mass : 0) + (i ? i.mass : 0) + (k ? k.mass : 0);
  const fuel = r ? Math.min(100, r.fuel + ((k && k.fuel) || 0)) : null;
  const reg = region();
  return {
    complete, budgetUsed, mass, fuel,
    capacity: r ? r.capacity : RULES.maxMass,
    power: p ? p.power - (i ? i.draw : 0) : null,
    arrivalFuel: r ? fuel - Math.round(loiFuel(mass) * Math.sqrt((M.moonDistance || EARTH_MOON.mean) / EARTH_MOON.mean)) : null,
    comm: BUS.comm + (r ? r.comm : 0) + (p ? p.comm : 0),
    sciencePotential: i ? Math.round(i.scan * reg.sci) + instrBonus(i) : null,
    risk: rk((r ? r.risk : 0) + (p ? p.risk : 0)),
  };
}

function validateDesign(sel) {
  const d = computeDesign(sel);
  const r = ROCKETS[sel.rocket];
  const cap = budgetCap();
  const checks = [
    {
      id: 'budget', label: 'Budget', ok: d.budgetUsed <= cap,
      value: `$${d.budgetUsed}M of $${cap}M`,
      fix: `Over budget by $${d.budgetUsed - cap}M. Choose a cheaper rocket, power system, instrument or kit.`,
    },
    {
      id: 'mass', label: 'Mass', ok: d.mass <= d.capacity,
      value: `${d.mass} kg of ${d.capacity} kg (${r.name})`,
      fix: `${d.mass - d.capacity} kg too heavy for the ${r.name}. Use a bigger rocket or lighter equipment.`,
    },
    {
      id: 'power', label: 'Power', ok: d.power >= RULES.minPower,
      value: `${d.power}% (minimum ${RULES.minPower}%)`,
      fix: 'Instrument draws too much for this power system. Pick a stronger power system or a lighter-load instrument.',
    },
    {
      id: 'mission', label: 'Mission (fuel to reach orbit)', ok: d.arrivalFuel >= RULES.minArrivalFuel,
      value: `${d.fuel}% → ${d.arrivalFuel}% after lunar arrival on a balanced transfer (minimum ${RULES.minArrivalFuel}%)`,
      fix: 'Not enough propellant to brake into lunar orbit. Carry more fuel (bigger rocket, spare tank) or reduce mass.',
    },
  ];
  return { design: d, checks, ok: checks.every(c => c.ok) };
}

// ---------------------------------------------------------------- hazard odds

// Relative weight of each hazard for a slot. ctx: { rocket, orbit } (defaults from mission state).
function hazardWeights(slot, ctx = {}) {
  const solar = M.scenario === 'solar';
  const rocket = ctx.rocket || M.selectedRocket || 'medium';
  const low = (ctx.orbit || M.selectedOrbit) === 'low';
  if (slot === 1) {
    const ex = ctx.exposure || (M.travel ? M.travel.exposure : 1);
    return {
      meteoroid: 1.0,
      leak: { light: 1.4, medium: 0.9, heavy: 0.6 }[rocket],
      seu: (solar ? 1.1 : 0.6) * ex,
      flare: (solar ? 1.6 : 0.3) * ex,
    };
  }
  return {
    meteoroid: low ? 0.8 : 0.5,
    dust: region().dust * (low ? 1.0 : 0.3),
    seu: solar ? 0.9 : 0.5,
    flare: solar ? 1.8 : 0.3,
  };
}

function drawHazard(slot, exclude, roll = Math.random()) {
  const w = hazardWeights(slot);
  if (exclude) delete w[exclude];
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const [id, v] of Object.entries(w)) { acc += v / total; if (roll < acc) return id; }
  return Object.keys(w).pop();
}

// Chance that each hazard strikes at least once, for the pre-launch threat forecast.
// Dust is evaluated for a LOW orbit (worst case) and flagged as such.
function threatForecast(rocket, exposure) {
  const p = (slot, orbit) => { const w = hazardWeights(slot, { rocket, orbit, exposure }); const t = Object.values(w).reduce((a, b) => a + b, 0); return id => (w[id] || 0) / t; };
  const p1 = p(1, 'high'), p2low = p(2, 'low'), p2high = p(2, 'high');
  const lvl = x => (x >= 0.4 ? 'HIGH' : x >= 0.2 ? 'MODERATE' : 'LOW');
  return Object.values(HAZARDS).map(h => {
    const both = orbit => 1 - (1 - p1(h.id)) * (1 - (orbit === 'low' ? p2low : p2high)(h.id));
    const worst = Math.max(both('low'), both('high'));
    return { id: h.id, name: h.name, p: worst, level: lvl(worst), lowOnly: h.id === 'dust' || h.id === 'meteoroid' ? both('low') - both('high') > 0.08 : false, kit: Object.values(KITS).find(k => k.protects.includes(h.id)) };
  });
}

// ---------------------------------------------------------------- mission state

function resetMission(scenarioId) {
  const prev = M.scenario;
  Object.assign(M, {
    missionStage: 'TITLE', checkpoint: 0,
    scenario: scenarioId || pickScenario(prev),
    region: null,
    budget: RULES.startBudget, budgetUsed: 0, mass: 0,
    power: 100, fuel: 100, science: 0, communication: 0, risk: 0,
    selectedRocket: null, selectedPowerSystem: null, selectedInstrument: null, selectedKit: null,
    selectedOrbit: null, selectedObservation: null, selectedEventResponse: null, selectedTransmission: null,
    missionStatus: null, reasons: [], objectives: [],
    collectedScience: 0, transmittedFraction: 1, scanAdjust: 0,
    hazards: [],
    travelMode: null, travel: null, flightPhase: null,
    moonDistance: Math.round(EARTH_MOON.perigee + Math.random() * (EARTH_MOON.apogee - EARTH_MOON.perigee)),
    failure: null, flags: {}, log: [],
  });
  M.budget = budgetCap();
}
resetMission();

const RES_LABEL = { power: 'Power', fuel: 'Fuel', science: 'Science', risk: 'Risk', budget: 'Budget', mass: 'Mass' };

// Chip = small labelled consequence. Tone never relies on colour alone (arrow + sign).
function chip(key, v) {
  const minus = '−';
  const good = key === 'risk' || key === 'mass' || key === 'budgetCost' ? v < 0 : v > 0;
  const arrow = v === 0 ? '•' : good ? '▲' : '▼';
  const sign = v > 0 ? '+' : v < 0 ? minus : '±';
  let txt;
  if (key === 'budgetCost') txt = `Budget ${minus}$${Math.abs(v)}M`;
  else if (key === 'mass') txt = `Mass +${v} kg`;
  else txt = `${RES_LABEL[key]} ${sign}${Math.abs(v)}${key === 'power' || key === 'fuel' ? '%' : ''}`;
  return { t: `${arrow} ${txt}`, tone: v === 0 ? 'neutral' : good ? 'good' : 'bad' };
}
const note = t => ({ t, tone: 'neutral' });

function fxChips(fx) {
  return ['science', 'power', 'fuel', 'risk'].filter(k => fx[k]).map(k => chip(k, fx[k]));
}

function addLog(stage, title, chips, detail) {
  M.log.push({ stage, title, chips, detail: detail || '' });
}

// Applies resource deltas, then checks threshold consequences. Returns chips for the toast.
function applyFx(stage, title, fx, detail) {
  const chips = fxChips(fx);
  if (fx.power) M.power = Math.max(0, Math.min(100, M.power + fx.power));
  if (fx.fuel) M.fuel = Math.max(0, Math.min(100, M.fuel + fx.fuel));
  if (fx.science) M.science = Math.max(0, M.science + fx.science);
  if (fx.risk) M.risk = Math.max(0, M.risk + fx.risk);
  addLog(stage, title, chips, detail);
  return chips.concat(checkThresholds(stage));
}

function checkThresholds(stage) {
  if (M.power <= 0 && !M.failure) {
    M.failure = `Power depleted during ${stage.toLowerCase()} - the spacecraft browned out and lost contact.`;
    addLog(stage, 'POWER DEPLETED', [{ t: '✖ Spacecraft lost', tone: 'bad' }], 'Power reached 0%.');
    return [{ t: '✖ Spacecraft lost', tone: 'bad' }];
  }
  if (M.power < RULES.lowPower && !M.flags.lowPower) {
    M.flags.lowPower = true;
    const r = rk(10);
    M.risk += r;
    addLog(stage, 'Low power margin', [chip('risk', r)], `Power fell below ${RULES.lowPower}%: less margin for anomalies.`);
    return [chip('risk', r)];
  }
  return [];
}

// ---- Checkpoint 1: target + validated design
function commitDesign(sel) {
  const d = computeDesign(sel);
  const r = ROCKETS[sel.rocket], p = POWER_SYSTEMS[sel.power], i = INSTRUMENTS[sel.instrument], k = KITS[sel.kit];
  Object.assign(M, {
    selectedRocket: r.id, selectedPowerSystem: p.id, selectedInstrument: i.id, selectedKit: k.id,
    budgetUsed: d.budgetUsed, budget: budgetCap() - d.budgetUsed, mass: d.mass,
    power: d.power, fuel: d.fuel, communication: d.comm, risk: d.risk, science: 0,
  });
  const reg = region(), b = instrBonus(i);
  addLog('Target', reg.name, [note(reg.short), note(`Science ×${reg.sci}`)], reg.pitch);
  addLog('Design', r.name, [chip('budgetCost', r.cost), note(`Fuel ${r.fuel}%`), note(`Payload ≤ ${r.capacity} kg`), note(`Comm +${r.comm}`)]
    .concat(r.risk ? [chip('risk', rk(r.risk))] : []), `${r.antenna}. ${r.gain}; ${r.loss.toLowerCase()}.`);
  addLog('Design', p.name, [chip('budgetCost', p.cost), chip('mass', p.mass), note(`Power ${p.power}%`)]
    .concat(p.comm ? [note(`Comm +${p.comm}`)] : []).concat(p.risk ? [chip('risk', rk(p.risk))] : []),
    p.battery ? 'Battery absorbs most of the lunar-night power drain.' : p.gain + '.');
  addLog('Design', i.name, [chip('budgetCost', i.cost), chip('mass', i.mass), chip('power', -i.draw), note(`Scan science ${i.scan}${b ? (b > 0 ? ' + ' : ' − ') + Math.abs(b) + ' target bonus' : ''}`)],
    i.role + '.');
  if (k.id !== 'none') addLog('Design', k.name, [chip('budgetCost', k.cost), chip('mass', k.mass)].concat(k.fuel ? [note(`Fuel +${k.fuel}%`)] : []), k.gain + '.');
}

// ---- Checkpoint 2: travel strategy, trans-lunar injection, lunar orbit insertion
// Travel strategies whose transfer would leave less than the minimum arrival fuel cannot be flown.
const travelAllowed = (id, fuel = M.fuel, mass = M.mass) => fuel - travelPlan(id, mass).fuelTotal >= RULES.minArrivalFuel;

function setTravel(id) {
  const tp = travelPlan(id);
  M.travelMode = id;
  M.travel = tp;
  addLog('Travel', tp.name, [note(`≈${fmtDuration(tp.hours)}`), chip('fuel', -tp.fuelTotal)].concat(tp.risk ? [chip('risk', tp.risk)] : []),
    `Estimated lunar arrival ${fmtDuration(tp.hours, true)}; transfer propellant ${tp.fuelTotal}% (TLI ${tp.tli}% + LOI ${tp.loi}%).`);
  return tp;
}

// Trans-lunar injection: the departure burn that leaves Earth orbit.
function departEarth() {
  const tp = M.travel || setTravel('balanced');
  M.flightPhase = 'TRANS_LUNAR_TRANSFER';
  return applyFx('Transfer', 'Trans-lunar injection burn', { fuel: -tp.tli, risk: tp.risk },
    `${tp.name}: ${tp.usage.toLowerCase()}-energy departure from Earth orbit - game model.`);
}

// Lunar arrival: cruise-system power for the coast, then the braking burn into lunar orbit.
function arrive() {
  const tp = M.travel || setTravel('balanced');
  const chips = [];
  if (tp.cruisePower) chips.push(...applyFx('Transfer', `Cruise systems (${fmtDuration(tp.cruiseHours)} coast)`, { power: -tp.cruisePower },
    'Heaters, attitude control and communications while coasting - game model.'));
  if (M.failure) return chips;
  M.flightPhase = 'LUNAR_ORBIT_INSERTION';
  if (M.fuel < tp.loi) {
    M.failure = `Not enough propellant for lunar orbit insertion (${M.fuel}% left, ${tp.loi}% needed) - LUNA-01 flew past the Moon.`;
    M.flags.missedCapture = true;
    addLog('Transfer', 'LUNAR ORBIT INSERTION FAILED', [{ t: '✖ Missed lunar capture', tone: 'bad' }], M.failure);
    M.fuel = 0;
    return chips.concat([{ t: '✖ Missed lunar capture', tone: 'bad' }]);
  }
  chips.push(...applyFx('Transfer', 'Lunar orbit insertion burn', { fuel: -tp.loi },
    `Braking burn for a ${tp.name.toLowerCase()} arrival (spacecraft mass ${M.mass} kg) - game model.`));
  if (!orbitAllowed('high') && !orbitAllowed('low')) {
    M.failure = `Captured by the Moon, but only ${M.fuel}% propellant is left - not enough to reach a stable science orbit.`;
    addLog('Transfer', 'NO SCIENCE ORBIT', [{ t: '✖ Orbit unreachable', tone: 'bad' }], M.failure);
  }
  return chips;
}

function orbitFx(id) {
  const f = rkFx(ORBITS[id].fx);
  f.fuel -= region().fuel;           // plane change to pass over the chosen target
  return f;
}
function orbitAllowed(id) { return M.fuel + orbitFx(id).fuel >= 0; }

function chooseOrbit(id) {
  M.selectedOrbit = id;
  const pc = region().fuel;
  const chips = applyFx('Orbit', ORBITS[id].name, orbitFx(id), ORBITS[id].desc + (pc ? ` Includes ${pc}% fuel to align the orbit over ${region().short.toLowerCase()}.` : ''));
  if (M.fuel < RULES.lowFuel && !M.flags.lowFuel) {
    M.flags.lowFuel = true;
    const r = rk(15);
    M.risk += r;
    addLog('Orbit', 'Thin propellant margin', [chip('risk', r)], `Fuel below ${RULES.lowFuel}%: little left for orbit corrections.`);
    chips.push(chip('risk', r));
  }
  return chips;
}

// ---- Hazards
function hazardOptions(id, slot) {
  const h = HAZARDS[id];
  const opts = h.options(slot).map(o => Object.assign({}, o, { fx: rkFx(o.fx), bad: o.bad ? rkFx(o.bad) : null }));
  const kit = KITS[M.selectedKit];
  if (kit && kit.protects.includes(id)) opts.unshift(Object.assign({}, h.kit, { fx: rkFx(h.kit.fx), isKit: true }));
  return opts;
}

// Resolve a hazard response. Science losses during the survey reduce the scan result.
function resolveHazard(id, optId, slot, roll = Math.random()) {
  const h = HAZARDS[id], o = hazardOptions(id, slot).find(x => x.id === optId);
  let fx = o.fx, outcome = null;
  if (o.chance != null) {
    const lucky = roll < o.chance;
    fx = lucky ? o.fx : o.bad;
    outcome = lucky ? 'lucky' : 'unlucky';
  }
  fx = Object.assign({}, fx);
  let sciNote = [];
  if (fx.science && slot === 2) { M.scanAdjust += fx.science; sciNote = [chip('science', fx.science)]; delete fx.science; }
  M.hazards.push({ slot, id, opt: optId, outcome });
  const title = `${h.name}: ${o.name}${outcome ? (outcome === 'lucky' ? ' - lucky miss' : ' - it hit') : ''}`;
  const idx = M.log.length;
  const chips = sciNote.concat(applyFx('Hazard', title, fx, outcome === 'lucky' ? 'The gamble paid off - no damage.' : o.desc));
  const logged = sciNote.concat(M.log[idx].chips);
  M.log[idx].chips = logged.length ? logged : [note('No damage')];
  if (!chips.length) chips.push(note('No damage'));
  return { chips, outcome };
}

// ---- Checkpoint 3: survey
function scanFx(id) {
  const s = SCANS[id], i = INSTRUMENTS[M.selectedInstrument], reg = region();
  const base = Math.round(i.scan * s.mult * reg.sci), bonus = instrBonus(i);
  return { science: Math.max(0, base + bonus), power: s.power, risk: rk(s.risk), _base: base, _bonus: bonus };
}

function runScan(id) {
  M.selectedObservation = id;
  const fx = scanFx(id);
  const i = INSTRUMENTS[M.selectedInstrument];
  const adj = M.scanAdjust;
  const sci = Math.max(0, fx.science + adj);
  return applyFx('Survey', SCANS[id].name, { science: sci, power: fx.power, risk: fx.risk },
    `${i.name} ${fx._base}${fx._bonus ? ` ${fx._bonus > 0 ? '+' : '−'} ${Math.abs(fx._bonus)} target bonus` : ''}${adj ? ` − ${-adj} lost to hazard` : ''} science.`);
}

// ---- Mission event
const hasBattery = () => POWER_SYSTEMS[M.selectedPowerSystem].battery;
function eventDrain() {
  const base = hasBattery() ? EVENT.batteryDrain : EVENT.drain;
  return Math.round(base * region().drain * (scenario().drainMult || 1) * (M.travel ? M.travel.nightFactor : 1));
}
function applyEventDrain() {
  return applyFx('Event', 'Lunar night heater load', { power: -eventDrain() },
    hasBattery() ? 'Battery backup covered most of the heater load.' : 'No battery: heaters drew directly from the power budget.');
}

function eventFx(id) {
  const sc = scenario();
  if (id === 'reduce') return { science: -10, power: 0, risk: -5 };
  if (id === 'reserve') return { science: 0, power: -(hasBattery() ? (sc.batteryReserve || EVENT.batteryReserve) : (sc.reserve || EVENT.reserve)), risk: 0 };
  return { science: +8, power: -8, risk: rk(20) };
}

function chooseEvent(id) {
  M.selectedEventResponse = id;
  const o = EVENT.options[id];
  return applyFx('Event', `${o.key} - ${o.name}`, eventFx(id), o.desc);
}

// ---- Checkpoint 4: transmission
function txCost(id, comm = M.communication) {
  const base = id === 'full' ? 10 + (100 - comm) / 3 : 4 + (100 - comm) / 6;
  return Math.round(base * region().tx);
}
function txFx(id) {
  const lost = Math.round(M.science * TRANSMISSIONS[id].mult) - M.science;
  const weak = id === 'full' && M.communication < 65 ? 12 : 0;
  const risk = weak + region().txRisk;
  return { science: lost, power: -txCost(id), risk: risk ? rk(risk) : 0 };
}
const commLabel = c => (c >= 75 ? 'STRONG' : c >= 60 ? 'MODERATE' : 'WEAK');

function transmit(id) {
  M.selectedTransmission = id;
  M.collectedScience = M.science;
  const fx = txFx(id);
  const cost = -fx.power;
  const chips = [];
  if (cost > M.power) {
    // Brownout mid-transmission: only part of the data arrives.
    M.transmittedFraction = M.power / cost;
    const received = Math.round(M.science * TRANSMISSIONS[id].mult * M.transmittedFraction);
    fx.science = received - M.science;
    fx.power = -M.power;
  }
  const far = region().side === 'far' ? ' Far side: data stored and relayed when LUNA-01 rounds the limb.' : '';
  chips.push(...applyFx('Transmission', TRANSMISSIONS[id].name, fx,
    `Comm capability ${M.communication} (${commLabel(M.communication)}): link cost ${cost}% power.${far}`));

  if (!M.failure && M.risk >= RULES.riskHigh && M.risk < RULES.riskCritical) {
    const loss = Math.round(M.science * RULES.anomalyLoss);
    M.science -= loss;
    M.flags.anomaly = loss;
    addLog('Transmission', 'High-risk anomaly', [chip('science', -loss)],
      `Risk ${M.risk} ≥ ${RULES.riskHigh}: a safe-mode interruption corrupted part of the data.`);
    chips.push(chip('science', -loss));
  }
  return chips;
}

// ---- Evaluation (deterministic given the mission state)
// SUCCESS needs all three objectives; PARTIAL means data returned but an objective was missed.
function objectives() {
  const goal = scienceGoal();
  return [
    { id: 'science', label: `Return ≥ ${goal} science to Earth`, ok: M.science >= goal, value: `${M.science}` },
    { id: 'power', label: `Spacecraft healthy (power ≥ ${RULES.healthyPower}%)`, ok: !M.failure && M.power >= RULES.healthyPower, value: `${M.power}%` },
    { id: 'fuel', label: `Fuel reserve ≥ ${RULES.fuelReserve}% for extended mission`, ok: M.fuel >= RULES.fuelReserve, value: `${M.fuel}%` },
  ];
}

function evaluate() {
  const reasons = [];
  const obj = objectives();
  let status;
  if (M.failure) {
    status = 'FAILURE'; reasons.push(M.failure);
  } else if (M.risk >= RULES.riskCritical) {
    status = 'FAILURE';
    reasons.push(`Mission risk reached ${M.risk} (critical ≥ ${RULES.riskCritical}). Stressed hardware entered permanent safe mode.`);
  } else if (M.science < RULES.partialMin) {
    status = 'FAILURE';
    reasons.push(`Only ${M.science} science returned - below the ${RULES.partialMin} needed for a meaningful result.`);
  } else if (obj.every(o => o.ok)) {
    status = 'SUCCESS';
    reasons.push(`All objectives met: ${M.science} science delivered and the spacecraft is healthy with fuel in reserve.`);
  } else {
    status = 'PARTIAL SUCCESS';
    reasons.push(`Data returned, but ${obj.filter(o => !o.ok).length} of 3 objectives missed.`);
  }
  if (status !== 'FAILURE') for (const o of obj) if (!o.ok) reasons.push(`Missed: ${o.label} - you ended with ${o.value}.`);
  for (const hz of M.hazards) {
    const h = HAZARDS[hz.id];
    reasons.push(`${h.name}: ${hz.opt === 'kit' ? `your ${KITS[M.selectedKit].name} handled it` : hz.outcome === 'unlucky' ? 'the gamble failed' : hz.outcome === 'lucky' ? 'the gamble paid off' : 'handled at a cost'}.`);
  }
  if (M.flags.anomaly) reasons.push(`High risk cost ${M.flags.anomaly} science in a transmission anomaly.`);
  if (M.selectedTransmission === 'compressed' && status !== 'FAILURE') reasons.push('Compression saved power but discarded 25% of the data detail.');
  if (M.flags.lowFuel) reasons.push('A thin propellant margin raised mission risk.');
  if (M.flags.lowPower && !M.failure) reasons.push('Power dropped dangerously low, raising risk.');
  M.missionStatus = status;
  M.reasons = reasons;
  M.objectives = obj;
  return { status, reasons };
}

const riskLevel = r => (r >= RULES.riskCritical ? 'CRITICAL' : r >= RULES.riskHigh ? 'HIGH' : r >= 20 ? 'MODERATE' : 'LOW');

function strategyLabel() {
  let bold = 0, careful = 0;
  if (M.selectedOrbit === 'low') bold++; else careful++;
  if (M.selectedObservation === 'deep') bold++; if (M.selectedObservation === 'quick') careful++;
  if (M.selectedEventResponse === 'full') bold++; if (M.selectedEventResponse === 'reduce') careful++;
  if (M.selectedTransmission === 'full') bold++; else if (M.selectedTransmission) careful++;
  if (bold >= 3) return { name: 'SCIENCE-FOCUSED', next: 'Try a safety-focused run: higher orbit, Standard Scan and protect your margins.' };
  if (careful >= 3) return { name: 'SAFETY-FOCUSED', next: 'Try an efficiency-focused run: a Light rocket and a design under $65M.' };
  if (M.budgetUsed <= 65) return { name: 'EFFICIENCY-FOCUSED', next: 'Try a science-focused run: the target\'s best instrument, low orbit and Deep Scan.' };
  return { name: 'BALANCED', next: 'Try another target: each region rewards a different instrument.' };
}
