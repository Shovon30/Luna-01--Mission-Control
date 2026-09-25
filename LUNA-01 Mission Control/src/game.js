// State machine, main loop, input and boot.
// Flow: TITLE → BRIEFING → TARGET → DESIGN → DESIGN_REVIEW → LAUNCH → TRANSFER (hazard 1)
//       → ORBIT_DECISION → SURVEY (hazard 2) → MISSION_EVENT → TRANSMISSION → RESULT → REPORT

const Game = {
  state: 'TITLE', t: 0, sceneT: 0, phase: '', phaseT: 0,
  preview: null, choice: null,
  sel: { rocket: null, power: null, instrument: null, kit: null },
  review: null, launchStep: -1, lastGain: 0, eventDrain: 0, powerBefore: 100, signalDelay: 0,
  drainApplied: false,
  hazard: null,            // active/recent hazard: { id, slot, t0, resume, done, opt, outcome, hit, tDone, chips }
  hazardFired: {},         // slot -> hazard id already triggered this mission

  go(state) {
    this.state = state; M.missionStage = state;
    this.sceneT = 0; this.phase = ''; this.phaseT = 0;
    this.preview = null; this.choice = null;
    if (state === 'REPORT' || state === 'TITLE' || state === 'DESIGN') UI.hideToast();
    const enter = ENTER[state];
    if (enter) enter();
    UI.render();
  },

  setPhase(p) { this.phase = p; this.phaseT = 0; this.choice = null; this.preview = null; UI.render(); },
};

const newSel = () => ({ rocket: null, power: null, instrument: null, kit: null });

const ENTER = {
  TITLE() { resetMission(); Game.sel = newSel(); Game.hazard = null; Game.hazardFired = {}; Draw.clearParticles(); },
  TARGET() { Game.phase = 'choose'; Game.choice = M.region; },
  DESIGN_REVIEW() {
    Game.review = validateDesign(Game.sel);
    if (Game.review.ok) Sfx.confirm(); else Sfx.deny();
  },
  LAUNCH() {
    commitDesign(Game.sel);
    Game.launchStep = 0; Game.phase = 'running'; Game.launchBlast = false;
    Draw.clearParticles();
  },
  TRANSFER() { Game.phase = 'cruise'; Draw.clearParticles(); },
  ORBIT_DECISION() { Game.phase = 'choose'; Game.hazard = null; },
  SURVEY() { Game.phase = 'brief'; Draw.clearParticles(); },
  MISSION_EVENT() {
    Game.hazard = null;
    Game.phase = 'alert'; Game.powerBefore = M.power; Game.drainApplied = false;
    Sfx.warning(); Sfx.setMood('tense');
  },
  TRANSMISSION() { Game.phase = 'choose'; Sfx.setMood('calm'); Draw.packets.length = 0; },
  RESULT() {
    Game.hazard = null;
    Sfx.setMood('calm');
    Draw.clearParticles();
    const { status } = evaluate();
    if (status === 'SUCCESS') Sfx.success(); else if (status === 'FAILURE') Sfx.failure(); else Sfx.partial();
  },
};

// ---------------------------------------------------------------- hazards
function startHazard(slot) {
  const id = drawHazard(slot, Game.hazardFired[1]);
  Game.hazardFired[slot] = id;
  Game.hazard = { id, slot, t0: Game.t, resume: { phase: Game.phase, phaseT: Game.phaseT }, done: false };
  Game.phase = 'hazard'; Game.phaseT = 0; Game.choice = null; Game.preview = null;
  Sfx.warning(); Sfx.hazard(id); Sfx.setMood('tense');
  UI.render();
}

function resolveActiveHazard(optId) {
  const hz = Game.hazard;
  const res = resolveHazard(hz.id, optId, hz.slot);
  Object.assign(hz, { done: true, opt: optId, outcome: res.outcome, tDone: Game.t, chips: res.chips });
  hz.hit = hz.id === 'meteoroid' && (optId === 'brace' || res.outcome === 'unlucky');
  if (hz.hit) { Draw.impact(); Sfx.impact(); }
  else if (res.outcome === 'unlucky' || (hz.id === 'leak' && optId !== 'kit')) Sfx.impact(0.4);
  else Sfx.confirm();
  if (M.failure) Sfx.failure();
  UI.toast(HAZARDS[hz.id].name.toUpperCase(), res.chips);
  Game.phase = 'hazardDone'; Game.phaseT = 0; Game.choice = null;
  UI.render();
}

function resumeFromHazard() {
  const r = Game.hazard.resume;
  Game.phase = r.phase; Game.phaseT = r.phaseT;
  Sfx.setMood('calm');
  if (r.phase === 'scanning') Sfx.scan(Math.max(0.5, Draw.SCAN_TIME - r.phaseT));
  UI.render();
}

// ---------------------------------------------------------------- timed updates
function update(dt) {
  Game.t += dt; Game.sceneT += dt; Game.phaseT += dt;
  Draw.updateParticles(dt);
  UI.tickFact(Game.t);
  const s = Game.state;
  const hz = Game.hazard;
  if (hz && hz.done && Game.phase !== 'hazardDone' && Game.t - hz.tDone > 2.5) Game.hazard = null;

  if (s === 'LAUNCH' && Game.phase === 'running') {
    const LT = Draw.LT, lt = Game.sceneT;
    const marks = [0, LT.ignite, LT.lift, LT.lift + 1.4, LT.space, LT.sep, LT.end];
    let step = 0;
    marks.forEach((m, k) => { if (lt >= m) step = k; });
    if (step !== Game.launchStep) {
      Game.launchStep = step;
      if (step === 1) Sfx.launch();
      if (step === 4) Draw.clearParticles();
      if (step === 5) Sfx.separation();
      if (step === 6) { Game.phase = 'done'; Sfx.confirm(); }
      UI.render();
    }
  }

  if (s === 'TRANSFER' && Game.phase === 'cruise') {
    if (!Game.hazardFired[1] && Game.phaseT >= 2.6) startHazard(1);
    else if (Game.phaseT >= Draw.TRANSFER_TIME) {
      const chips = arrive();
      Sfx.burn(1.6);
      UI.toast('LUNAR ORBIT INSERTION', chips);
      Game.setPhase('arrived');
    }
  }

  if (s === 'ORBIT_DECISION' && Game.phase === 'inserting' && Game.phaseT >= 2) {
    Sfx.confirm();
    Game.setPhase('done');
  }

  if (s === 'SURVEY' && Game.phase === 'scanning') {
    if (!Game.hazardFired[2] && Game.phaseT >= 2.0) startHazard(2);
    else if (Game.phaseT >= Draw.SCAN_TIME) {
      const before = M.science;
      const chips = runScan(M.selectedObservation);
      Game.lastGain = M.science - before;
      const tp = Draw.surveyTarget();
      Draw.burst(tp.x, tp.y, 60, '88,242,155', 90, 1.2);
      if (M.failure) Sfx.failure(); else Sfx.confirm();
      UI.toast(SCANS[M.selectedObservation].name.toUpperCase(), chips);
      Game.setPhase('done');
    }
  }

  if (s === 'MISSION_EVENT' && Game.phase === 'alert') {
    if (!Game.drainApplied && Game.phaseT >= 1) {
      Game.drainApplied = true;
      Game.eventDrain = eventDrain();
      UI.toast('LUNAR NIGHT HEATER LOAD', applyEventDrain());
      UI.hud();
    }
    if (Game.phaseT >= 2.6) Game.setPhase(M.failure ? 'done' : 'choose');
  }

  if (s === 'TRANSMISSION' && Game.phase === 'sending' && Game.phaseT >= Draw.TX_TIME) {
    const chips = transmit(M.selectedTransmission);
    if (M.failure) Sfx.failure(); else Sfx.confirm();
    UI.toast('DOWNLINK RESULT', chips);
    Game.setPhase('done');
  }
}

// ---------------------------------------------------------------- actions
const ACTIONS = {
  start() { Sfx.startMusic(); Sfx.confirm(); Game.go('BRIEFING'); },
  'to-target'() { Sfx.click(); Game.go('TARGET'); },
  'to-design'() { Sfx.click(); Game.go('DESIGN'); },
  pick(el) {
    Game.sel[el.dataset.group] = el.dataset.id;
    Sfx.select();
    UI.render();
  },
  review() { if (computeDesign(Game.sel).complete) Game.go('DESIGN_REVIEW'); },
  redesign() { Sfx.click(); Game.go('DESIGN'); },
  launch() { if (Game.review && Game.review.ok) { Sfx.click(); Game.go('LAUNCH'); } },
  'to-transfer'() { Sfx.click(); Game.go('TRANSFER'); },
  'to-orbit'() { Sfx.click(); Game.go('ORBIT_DECISION'); },
  'to-survey'() { Sfx.click(); Game.go('SURVEY'); },
  plan() { Sfx.click(); Game.setPhase('choose'); },
  unplan() { Sfx.click(); Game.setPhase('brief'); },
  choose(el) {
    if (el.disabled) return;
    Game.choice = el.dataset.id;
    Game.preview = el.dataset.id;
    if (Game.state === 'TARGET') M.region = el.dataset.id;
    Sfx.select();
    UI.render();
  },
  confirm() {
    const id = Game.choice, s = Game.state;
    if (!id) return;
    if (Game.phase === 'hazard') { resolveActiveHazard(id); return; }
    if (Game.phase !== 'choose') return;
    Sfx.confirm();
    if (s === 'TARGET') {
      M.region = id;
      Game.go('DESIGN');
    } else if (s === 'ORBIT_DECISION') {
      if (!orbitAllowed(id)) return;
      const chips = chooseOrbit(id);
      Sfx.burn(1.8);
      UI.toast(ORBITS[id].name.toUpperCase(), chips);
      Game.setPhase('inserting');
    } else if (s === 'SURVEY') {
      M.selectedObservation = id;
      Sfx.scan(Draw.SCAN_TIME);
      Game.setPhase('scanning');
    } else if (s === 'MISSION_EVENT') {
      const chips = chooseEvent(id);
      UI.toast(`OPTION ${EVENT.options[id].key}`, chips);
      Game.setPhase('done');
    } else if (s === 'TRANSMISSION') {
      M.selectedTransmission = id;
      Sfx.transmit(Draw.TX_TIME, id === 'full');
      Game.setPhase('sending');
    }
  },
  'resume-hazard'() { Sfx.click(); if (M.failure) Game.go('RESULT'); else resumeFromHazard(); },
  'to-event'() { Sfx.click(); Game.go(M.failure ? 'RESULT' : 'MISSION_EVENT'); },
  'to-transmission'() { Sfx.click(); Game.go('TRANSMISSION'); },
  'to-result'() { Sfx.click(); Game.go('RESULT'); },
  'to-report'() { Sfx.click(); Game.go('REPORT'); },
  replay() {
    Sfx.confirm();
    resetMission();
    Game.sel = newSel();
    Game.review = null; Game.lastGain = 0; Game.eventDrain = 0; Game.hazard = null; Game.hazardFired = {};
    Draw.clearParticles();
    Game.go('BRIEFING');
  },
  title() { Sfx.click(); Game.go('TITLE'); },
  mute() { Sfx.init(); Sfx.startMusic(); Sfx.toggleMute(); UI.setMuteLabel(); },
};

function onClick(e) {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACTIONS[el.dataset.act];
  if (fn) fn(el);
}

function onHover(e) {
  const el = e.target.closest('.opt');
  const id = el && !el.disabled ? el.dataset.id : null;
  if (Game.phase === 'choose' || Game.phase === 'hazard') Game.preview = id || Game.choice;
}

function onKey(e) {
  if (e.key === 'm' || e.key === 'M') { ACTIONS.mute(); return; }
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const panel = document.getElementById('panel');
  // 1-5 / A-D pick decision options (the design screen uses its own cards)
  const opts = [...panel.querySelectorAll('.opt')];
  const idx = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, a: 0, b: 1, c: 2, d: 3 }[e.key.toLowerCase()];
  if (idx != null && opts[idx] && !opts[idx].disabled) opts[idx].click();
}

// ---------------------------------------------------------------- canvas sizing & loop
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const stage = document.getElementById('stage');

function fit() {
  const s = Math.min(window.innerWidth / Draw.W, window.innerHeight / Draw.H);
  stage.style.transform = `translate(-50%, -50%) scale(${s})`;
  const q = Math.max(1, Math.min(2, s * (window.devicePixelRatio || 1)));
  canvas.width = Math.round(Draw.W * q);
  canvas.height = Math.round(Draw.H * q);
  ctx.setTransform(q, 0, 0, q, 0, 0);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  Draw.frame(ctx, Game.t, dt);
  requestAnimationFrame(loop);
}

async function boot() {
  Draw.init();
  fit();
  window.addEventListener('resize', fit);
  stage.addEventListener('click', onClick);
  stage.addEventListener('mouseover', onHover);
  window.addEventListener('keydown', onKey);
  // Audio must start from a user gesture.
  window.addEventListener('pointerdown', () => Sfx.init(), { once: true });
  await NasaData.load();
  // One-way radio delay: taken from the orbital dataset (a NASA-derived value) when available.
  const delay = NasaData.num('One-way light/radio delay at mean distance', 'orbit');
  const dist = NasaData.num('Mean distance from Earth (semi-major axis)');
  Game.signalDelay = !isNaN(delay) ? delay : isNaN(dist) ? 0 : dist / 299792.458;
  UI.setMuteLabel();
  document.getElementById('loading').remove();
  Game.go('TITLE');
  requestAnimationFrame(loop);
}

boot();
