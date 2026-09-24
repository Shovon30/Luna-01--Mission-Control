// Mission model: option tables, the central mission state, and the
// simplified gameplay formulas. EVERY number in this file is a SIMPLIFIED
// GAME MODEL value chosen for balance - none of them is a NASA measurement.
// Real lunar values come only from data/moon_environment_dataset.csv.

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
  anomalyLoss: 0.2,    // fraction of data lost to a high-risk anomaly
};

// Mission conditions: one is drawn at random for every run and announced in the
// briefing. Each changes which design is best, so no single build always wins.
// The linked NASA parameter only provides real-world context for the condition.
const SCENARIOS = {
  solar: {
    id: 'solar', name: 'Solar Maximum', icon: '☀',
    brief: 'The Sun is near peak activity. Solar particle storms threaten an unshielded spacecraft.',
    effects: ['Every risk increase is ×1.5', 'Radiation Sensor gains +10 science per scan'],
    nasa: 'Unshielded dose from Aug 1972 solar particle event (estimate)', nasaLabel: 'Aug 1972 solar storm, unshielded dose',
    riskMult: 1.5, bonus: { radiation: 10 },
  },
  night: {
    id: 'night', name: 'Long Polar Night', icon: '☾',
    brief: 'The target crater will sit in darkness for most of the survey. Heaters will run hard.',
    effects: ['Lunar-night drain 24% (battery: 8%)', 'Using reserve power costs 22% (battery: 8%)'],
    nasa: 'Coldest measured temperature (permanently shadowed craters)', nasaLabel: 'Coldest measured temperature',
    drain: 24, batteryDrain: 8, reserve: 22, batteryReserve: 8,
  },
  budget: {
    id: 'budget', name: 'Budget Cut', icon: '$',
    brief: 'Funding was reduced after mission approval. Every dollar has to count.',
    effects: ['Budget cap $80M instead of $100M'],
    budget: 80,
  },
  ice: {
    id: 'ice', name: 'Ice Hunt', icon: '❄',
    brief: 'Mission scientists want proof of polar water ice. The bar for success is higher.',
    effects: ['Science goal raised to 80', 'Spectrometer gains +10 science per scan'],
    nasa: 'Water in LCROSS impact plume (Cabeus crater; south pole)', nasaLabel: 'LCROSS plume water (Cabeus)',
    goal: 80, bonus: { spectrometer: 10 },
  },
};

// Spacecraft bus: structure, avionics, propellant tanks, antenna mount.
const BUS = { cost: 15, mass: 250, comm: 40 };

const ROCKETS = {
  light: {
    id: 'light', name: 'Light Rocket', role: 'Low cost / low capacity',
    cost: 15, capacity: 520, fuel: 60, propellantMass: 120, comm: 10, risk: 5,
    antenna: 'Compact antenna', antennaSize: 8,
    gain: 'Cheapest launch', loss: 'Tight mass limit, little fuel',
  },
  medium: {
    id: 'medium', name: 'Medium Rocket', role: 'Balanced',
    cost: 30, capacity: 580, fuel: 85, propellantMass: 150, comm: 20, risk: 0,
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
    cost: 8, mass: 25, draw: 5, scan: 48, bonus: 0,
    gain: 'Cheap, light, low power', loss: 'Lowest science',
  },
  radiation: {
    id: 'radiation', name: 'Radiation Sensor', role: 'Radiation environment',
    cost: 14, mass: 45, draw: 8, scan: 52, bonus: 4,
    gain: 'Good science + radiation bonus', loss: 'Moderate resource demand',
  },
  spectrometer: {
    id: 'spectrometer', name: 'Spectrometer', role: 'Composition analysis',
    cost: 22, mass: 70, draw: 12, scan: 56, bonus: 8,
    gain: 'Highest science + water-ice bonus', loss: 'Costly, heavy, power-hungry',
  },
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

// ---------------------------------------------------------------- mission condition helpers

const M = {};

const scenario = () => SCENARIOS[M.scenario] || SCENARIOS.solar;
const scienceGoal = () => scenario().goal || RULES.scienceGoal;
const budgetCap = () => scenario().budget || RULES.startBudget;
const instrBonus = i => i.bonus + ((scenario().bonus || {})[i.id] || 0);
// Risk increases are amplified by the Solar Maximum condition.
const rk = v => (v > 0 ? Math.round(v * (scenario().riskMult || 1)) : v);

function pickScenario(avoid) {
  const ids = Object.keys(SCENARIOS).filter(id => id !== avoid);
  return ids[Math.floor(Math.random() * ids.length)];
}

// ---------------------------------------------------------------- formulas

const loiFuel = mass => Math.round(mass / 10); // lunar orbit insertion burn (game model)

function computeDesign(sel) {
  const r = ROCKETS[sel.rocket], p = POWER_SYSTEMS[sel.power], i = INSTRUMENTS[sel.instrument];
  const complete = !!(r && p && i);
  const budgetUsed = BUS.cost + (r ? r.cost : 0) + (p ? p.cost : 0) + (i ? i.cost : 0);
  const mass = BUS.mass + (r ? r.propellantMass : 0) + (p ? p.mass : 0) + (i ? i.mass : 0);
  return {
    complete, budgetUsed, mass,
    capacity: r ? r.capacity : RULES.maxMass,
    power: p ? p.power - (i ? i.draw : 0) : null,
    fuel: r ? r.fuel : null,
    arrivalFuel: r ? r.fuel - loiFuel(mass) : null,
    comm: BUS.comm + (r ? r.comm : 0) + (p ? p.comm : 0),
    sciencePotential: i ? i.scan + instrBonus(i) : null,
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
      fix: `Over budget by $${d.budgetUsed - cap}M. Choose a cheaper rocket, power system or instrument.`,
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
      value: `${d.fuel}% → ${d.arrivalFuel}% after lunar arrival (minimum ${RULES.minArrivalFuel}%)`,
      fix: 'Not enough propellant to brake into lunar orbit. Carry more fuel (bigger rocket) or reduce mass.',
    },
  ];
  return { design: d, checks, ok: checks.every(c => c.ok) };
}

// ---------------------------------------------------------------- mission state

function resetMission(scenarioId) {
  const prev = M.scenario;
  Object.assign(M, {
    missionStage: 'TITLE', checkpoint: 0,
    scenario: scenarioId || pickScenario(prev),
    budget: RULES.startBudget, budgetUsed: 0, mass: 0,
    power: 100, fuel: 100, science: 0, communication: 0, risk: 0,
    selectedRocket: null, selectedPowerSystem: null, selectedInstrument: null,
    selectedOrbit: null, selectedObservation: null, selectedEventResponse: null, selectedTransmission: null,
    missionStatus: null, reasons: [], objectives: [],
    collectedScience: 0, transmittedFraction: 1,
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

// ---- Checkpoint 1: commit the validated design
function commitDesign(sel) {
  const d = computeDesign(sel);
  const r = ROCKETS[sel.rocket], p = POWER_SYSTEMS[sel.power], i = INSTRUMENTS[sel.instrument];
  Object.assign(M, {
    selectedRocket: r.id, selectedPowerSystem: p.id, selectedInstrument: i.id,
    budgetUsed: d.budgetUsed, budget: budgetCap() - d.budgetUsed, mass: d.mass,
    power: d.power, fuel: d.fuel, communication: d.comm, risk: d.risk, science: 0,
  });
  const b = instrBonus(i);
  addLog('Design', r.name, [chip('budgetCost', r.cost), note(`Fuel ${r.fuel}%`), note(`Payload ≤ ${r.capacity} kg`), note(`Comm +${r.comm}`)]
    .concat(r.risk ? [chip('risk', rk(r.risk))] : []), `${r.antenna}. ${r.gain}; ${r.loss.toLowerCase()}.`);
  addLog('Design', p.name, [chip('budgetCost', p.cost), chip('mass', p.mass), note(`Power ${p.power}%`)]
    .concat(p.comm ? [note(`Comm +${p.comm}`)] : []).concat(p.risk ? [chip('risk', rk(p.risk))] : []),
    p.battery ? 'Battery absorbs most of the lunar-night power drain.' : p.gain + '.');
  addLog('Design', i.name, [chip('budgetCost', i.cost), chip('mass', i.mass), chip('power', -i.draw), note(`Scan science ${i.scan}${b ? ' + ' + b + ' target bonus' : ''}`)],
    i.role + '.');
}

// ---- Checkpoint 2: arrival + orbit
function arrive() {
  const cost = loiFuel(M.mass);
  return applyFx('Transfer', 'Lunar orbit insertion burn', { fuel: -cost },
    `Braking burn scales with spacecraft mass (${M.mass} kg ÷ 10) - game model.`);
}

function orbitFx(id) { const f = Object.assign({}, ORBITS[id].fx); f.risk = rk(f.risk); return f; }
function orbitAllowed(id) { return M.fuel + ORBITS[id].fx.fuel >= 0; }

function chooseOrbit(id) {
  M.selectedOrbit = id;
  const chips = applyFx('Orbit', ORBITS[id].name, orbitFx(id), ORBITS[id].desc);
  if (M.fuel < RULES.lowFuel && !M.flags.lowFuel) {
    M.flags.lowFuel = true;
    const r = rk(15);
    M.risk += r;
    addLog('Orbit', 'Thin propellant margin', [chip('risk', r)], `Fuel below ${RULES.lowFuel}%: little left for orbit corrections.`);
    chips.push(chip('risk', r));
  }
  return chips;
}

// ---- Checkpoint 3: survey
function scanFx(id) {
  const s = SCANS[id], i = INSTRUMENTS[M.selectedInstrument];
  const base = Math.round(i.scan * s.mult), bonus = instrBonus(i);
  return { science: base + bonus, power: s.power, risk: rk(s.risk), _base: base, _bonus: bonus };
}

function runScan(id) {
  M.selectedObservation = id;
  const fx = scanFx(id);
  const i = INSTRUMENTS[M.selectedInstrument];
  return applyFx('Survey', SCANS[id].name, { science: fx.science, power: fx.power, risk: fx.risk },
    `${i.name} ${fx._base}${fx._bonus ? ` + ${fx._bonus} target bonus` : ''} science.`);
}

// ---- Mission event
const hasBattery = () => POWER_SYSTEMS[M.selectedPowerSystem].battery;
function eventDrain() {
  const sc = scenario();
  return hasBattery() ? (sc.batteryDrain || EVENT.batteryDrain) : (sc.drain || EVENT.drain);
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
  return id === 'full' ? 10 + Math.round((100 - comm) / 3) : 4 + Math.round((100 - comm) / 6);
}
function txFx(id) {
  const lost = Math.round(M.science * TRANSMISSIONS[id].mult) - M.science;
  return { science: lost, power: -txCost(id), risk: id === 'full' && M.communication < 65 ? rk(12) : 0 };
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
  chips.push(...applyFx('Transmission', TRANSMISSIONS[id].name, fx,
    `Comm capability ${M.communication} (${commLabel(M.communication)}): link cost ${cost}% power.`));

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

// ---- Evaluation (deterministic: depends only on mission state)
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
  if (M.budgetUsed <= 65) return { name: 'EFFICIENCY-FOCUSED', next: 'Try a science-focused run: Spectrometer, low orbit and Deep Scan.' };
  return { name: 'BALANCED', next: 'Try pushing one direction harder: maximum science, or minimum cost.' };
}
