// HTML overlay: HUD, checkpoint tracker, decision panels, toasts.
// Panels are rebuilt only on state/phase/selection changes - never per frame.

const UI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MINUS = '−';

  // ------------------------------------------------------------ small builders
  const chips = list => `<span class="chips">${list.map(c => `<span class="chip ${c.tone}">${esc(c.t)}</span>`).join('')}</span>`;

  function btn(label, act, o = {}) {
    return `<button class="btn ${o.cls || ''}" data-act="${act}" ${o.id ? `data-id="${o.id}"` : ''} ${o.primary ? 'data-primary' : ''} ${o.disabled ? 'disabled' : ''}>${label}</button>`;
  }

  function header(kicker, title, sub) {
    return `<div class="ph"><div class="kicker">${kicker}</div><h2>${title}</h2>${sub ? `<p class="sub">${sub}</p>` : ''}</div>`;
  }

  function tag(conf) { return `<em class="tag ${conf}">${NasaData.TAGS[conf]}</em>`; }

  function src(r) { return r ? ` title="Source: ${esc(r.source_name)} - ${esc(r.source_url)}"` : ''; }

  // One NASA data row: label, value with unit, confidence tag, source tooltip.
  function dataRow(label, param, valueOverride, confOverride) {
    const r = NasaData.get(param);
    if (!r) return `<div class="drow"><span class="dl">${label}</span><span class="dv">data unavailable</span></div>`;
    return `<div class="drow"${src(r)}><span class="dl">${label}</span><span class="dv">${valueOverride || esc(NasaData.show(param))}${tag(confOverride || r.confidence)}</span></div>`;
  }

  function halfDay() {
    const syn = NasaData.num('Synodic period (sunrise to sunrise)');
    return isNaN(syn) ? null : (syn / 2).toFixed(1);
  }

  // NASA DATA -> interpretation -> gameplay consequence
  function insight(dataHtml, meaning, game) {
    return `<div class="insight">
      <div class="i-row"><span class="i-k">NASA DATA</span><span>${dataHtml}</span></div>
      <div class="i-row"><span class="i-k">MEANING</span><span>${meaning}</span></div>
      <div class="i-row"><span class="i-k game">GAME EFFECT</span><span>${game}</span></div>
    </div>`;
  }

  function sources(params) {
    const seen = new Map();
    for (const p of params) { const r = NasaData.get(p); if (r && !seen.has(r.source_url)) seen.set(r.source_url, r.source_name); }
    if (!seen.size) return '';
    return `<details class="sources"><summary>Sources (${seen.size})</summary><ul>${[...seen].map(([u, n]) =>
      `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a></li>`).join('')}</ul></details>`;
  }

  function option(o) {
    return `<button class="opt ${o.selected ? 'selected' : ''}" data-act="${o.act || 'choose'}" data-id="${o.id}" ${o.group ? `data-group="${o.group}"` : ''} aria-pressed="${!!o.selected}" ${o.disabled ? 'disabled' : ''}>
      <span class="opt-top">${o.key ? `<span class="opt-key">${o.key}</span>` : ''}<span class="opt-name">${o.name}</span>${o.selected ? '<span class="opt-sel">SELECTED</span>' : ''}</span>
      ${o.desc ? `<span class="opt-desc">${o.desc}</span>` : ''}
      ${o.chips ? chips(o.chips) : ''}
      ${o.warn ? `<span class="opt-warn">⚠ ${o.warn}</span>` : ''}
    </button>`;
  }

  const powerWarn = (fx, final) => {
    const after = M.power + (fx.power || 0);
    if (fx.power && after <= 0) return 'Would drain ALL power - spacecraft lost';
    if (final && after < RULES.healthyPower) return `Ends at ${after}% power - health objective (≥ ${RULES.healthyPower}%) missed`;
    if (fx.power && after < RULES.lowPower) return `Power would fall below ${RULES.lowPower}% (+${rk(10)} risk)`;
    return '';
  };

  // Planning aid: how much power the rest of the mission still needs.
  function powerPlan(extra) {
    const need = RULES.healthyPower + txCost('compressed'), needFull = RULES.healthyPower + txCost('full');
    return `<p class="plan"><b>Power plan</b>Now ${M.power}%. ${extra || ''}Keep ≈${need}% for a compressed or ≈${needFull}% for a full downlink to end healthy.</p>`;
  }

  function conditionCard(compact) {
    const sc = scenario();
    const r = sc.nasa ? NasaData.get(sc.nasa) : null;
    return `<div class="cond">
      <div class="cond-h"><span class="cond-i">${sc.icon}</span><span><small>MISSION CONDITION</small><b>${sc.name}</b></span></div>
      ${compact ? '' : `<p>${sc.brief}</p>`}
      <ul>${sc.effects.map(e => `<li>${e}</li>`).join('')}</ul>
      ${r && !compact ? `<div class="drow"${src(r)}><span class="dl">${sc.nasaLabel}</span><span class="dv">${esc(NasaData.show(sc.nasa))}${tag(r.confidence)}</span></div>` : ''}
    </div>`;
  }

  function objectiveList(obj) {
    const items = obj && obj.length ? obj : [
      { label: `Return ≥ ${scienceGoal()} science to Earth` },
      { label: `Spacecraft healthy at the end (power ≥ ${RULES.healthyPower}%)` },
      { label: `Keep a fuel reserve ≥ ${RULES.fuelReserve}%` },
    ];
    return `<ol class="objs">${items.map(o => `<li class="${o.ok === true ? 'ok' : o.ok === false ? 'bad' : ''}"><span>${o.ok === true ? '✓' : o.ok === false ? '✗' : '○'}</span>${o.label}${o.value != null ? ` <em>${o.value}</em>` : ''}</li>`).join('')}</ol>`;
  }

  // ------------------------------------------------------------ panels per state
  const P = {};

  P.TITLE = () => {
    const n = NasaData.rows.length;
    return {
      cls: 'title', html: `
      <div class="title-block">
        <div class="kicker">NASA SPACE APPS CHALLENGE 2026 · SPACE MISSION DESIGN GAME</div>
        <h1>LUNA-01</h1>
        <div class="title-sub">MISSION CONTROL</div>
        <p class="tagline">Design, launch and operate one robotic lunar science mission.<br>There is no perfect design. Every advantage has a cost.</p>
        ${btn('START MISSION', 'start', { cls: 'big go', primary: true })}
        <p class="fine">${n ? `NASA lunar dataset loaded: ${n} values (${NasaData.origin === 'csv' ? 'local CSV' : 'embedded copy of local CSV'})` : '⚠ NASA dataset could not be loaded'} · ~6 min · Sound optional (M)</p>
      </div>` };
  };

  P.BRIEFING = () => ({
    cls: 'right', html: `
    ${header('MISSION BRIEFING', 'You are the Mission Director', 'Survey the Moon&#39;s south polar region and bring the data home. You never fly the spacecraft - you make the calls.')}
    ${conditionCard()}
    <div class="lbl">OBJECTIVES · ALL THREE FOR FULL SUCCESS</div>
    ${objectiveList()}
    <div class="kvs">
      <div class="kv"><span>Budget cap</span><b>$${budgetCap()}M</b></div>
      <div class="kv"><span>Max mass</span><b>${RULES.maxMass} kg <small>(set by rocket)</small></b></div>
      <div class="kv"><span>Risk</span><b>≥ ${RULES.riskHigh} data loss · ≥ ${RULES.riskCritical} mission lost</b></div>
    </div>
    <p class="note">▲ benefit · ▼ cost. Every option shows both before you commit. Budget, power, fuel and risk figures are a simplified game model.</p>
    ${btn('BEGIN MISSION DESIGN', 'to-design', { cls: 'go', primary: true })}` });

  function designCard(group, o, selected, stat) {
    return `<button class="dcard ${selected ? 'selected' : ''}" data-act="pick" data-group="${group}" data-id="${o.id}" aria-pressed="${selected}">
      <span class="dc-name">${o.name}${selected ? ' <i>✓</i>' : ''}</span>
      <span class="dc-stat">${stat}</span>
      <span class="dc-gain">▲ ${o.gain}</span>
      <span class="dc-loss">▼ ${o.loss}</span>
    </button>`;
  }

  function tile(label, value, sub, ok) {
    const mark = ok === true ? '<i class="ok">✓</i>' : ok === false ? '<i class="bad">✗</i>' : '';
    return `<div class="tile ${ok === false ? 'bad' : ''}"><span class="t-l">${label} ${mark}</span><b>${value}</b><span class="t-s">${sub}</span></div>`;
  }

  P.DESIGN = () => {
    const s = Game.sel, d = computeDesign(s);
    const dash = '—';
    const rockets = Object.values(ROCKETS).map(o => designCard('rocket', o, s.rocket === o.id, `$${o.cost}M · ≤${o.capacity} kg · fuel ${o.fuel}%`)).join('');
    const powers = Object.values(POWER_SYSTEMS).map(o => designCard('power', o, s.power === o.id, `$${o.cost}M · ${o.mass} kg · power ${o.power}%`)).join('');
    const insts = Object.values(INSTRUMENTS).map(o => designCard('instrument', o, s.instrument === o.id, `$${o.cost}M · ${o.mass} kg · power ${MINUS}${o.draw}`)).join('');
    const tiles = [
      tile('BUDGET USED', `$${d.budgetUsed}M`, `cap $${budgetCap()}M`, s.rocket || s.power || s.instrument ? d.budgetUsed <= budgetCap() : null),
      tile('MASS', `${d.mass} kg`, `limit ${d.capacity} kg`, s.rocket ? d.mass <= d.capacity : null),
      tile('POWER', d.power == null ? dash : `${d.power}%`, `min ${RULES.minPower}%`, d.power == null ? null : d.power >= RULES.minPower),
      tile('FUEL', d.fuel == null ? dash : `${d.fuel}%`, d.fuel == null ? 'set by rocket' : `≈${d.arrivalFuel}% at Moon`, d.fuel == null ? null : d.arrivalFuel >= RULES.minArrivalFuel),
      tile('COMM', `${d.comm}`, `${commLabel(d.comm).toLowerCase()} · rocket+power`, null),
      tile('SCIENCE POTENTIAL', d.sciencePotential == null ? dash : `${d.sciencePotential}`, `per scan · goal ${scienceGoal()}`, null),
    ].join('');
    return {
      cls: 'wide', html: `
      ${header('CHECKPOINT 1 / 4', 'Mission Design', `Condition <b>${scenario().name}</b>: ${scenario().effects.join(' · ')}.`)}
      <div class="group"><h3>1 · LAUNCH VEHICLE</h3><div class="cards3">${rockets}</div></div>
      <div class="group"><h3>2 · POWER SYSTEM</h3><div class="cards3">${powers}</div></div>
      <div class="group"><h3>3 · SCIENTIFIC INSTRUMENT</h3><div class="cards3">${insts}</div></div>
      <div class="tiles">${tiles}</div>
      <div class="actions">${btn(d.complete ? 'RUN DESIGN REVIEW' : 'SELECT ALL THREE COMPONENTS', 'review', { cls: 'go', primary: true, disabled: !d.complete })}</div>` };
  };

  P.DESIGN_REVIEW = () => {
    const rv = Game.review;
    const rows = rv.checks.map(c => `
      <div class="check ${c.ok ? 'ok' : 'bad'}">
        <span class="c-mark">${c.ok ? '✓ OK' : '✗ FAIL'}</span>
        <span class="c-body"><b>${c.label}</b><span>${c.value}</span>${c.ok ? '' : `<span class="c-fix">${c.fix}</span>`}</span>
      </div>`).join('');
    return {
      cls: 'right', html: `
      ${header('CHECKPOINT 1 / 4 · VALIDATION', 'Design Review', rv.ok ? 'All constraints satisfied.' : 'Launch blocked: one or more critical constraints violated.')}
      <div class="checks">${rows}</div>
      <div class="verdict ${rv.ok ? 'ok' : 'bad'}">${rv.ok ? 'GO FOR LAUNCH' : 'NO-GO · RETURN TO DESIGN'}</div>
      <div class="actions">
        ${rv.ok ? btn('LAUNCH', 'launch', { cls: 'go', primary: true }) : ''}
        ${btn('MODIFY DESIGN', 'redesign', { primary: !rv.ok })}
      </div>` };
  };

  const LAUNCH_STEPS = ['Countdown', 'Ignition', 'Liftoff', 'Max-Q · ascent', 'Stage separation', 'Spacecraft separation', 'Launch successful'];
  P.LAUNCH = () => {
    const i = Game.launchStep;
    const list = LAUNCH_STEPS.map((s, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : ''}">${k < i ? '✓' : k === i ? '▶' : '○'} ${s}</li>`).join('');
    const pct = Math.round((Math.max(0, i) / (LAUNCH_STEPS.length - 1)) * 100);
    return {
      cls: 'right', html: `
      ${header('LAUNCH', `${ROCKETS[M.selectedRocket].name}`, 'Automatic sequence. No piloting required.')}
      <div class="progress"><i style="width:${pct}%"></i><span>${pct}%</span></div>
      <ol class="steps">${list}</ol>
      ${Game.phase === 'done' ? `<div class="verdict ok">✓ LAUNCH SUCCESSFUL</div>${btn('PROCEED TO LUNAR TRANSFER', 'to-transfer', { cls: 'go', primary: true })}` : ''}` };
  };

  P.TRANSFER = () => {
    const dist = dataRow('Earth-Moon distance', 'Mean distance from Earth (semi-major axis)');
    const delay = Game.signalDelay ? `<div class="drow" title="Derived: NASA mean distance ÷ speed of light (299,792 km/s)"><span class="dl">Signal light-time</span><span class="dv">≈${Game.signalDelay.toFixed(2)} s${tag('derived')}</span></div>` : '';
    if (Game.phase === 'cruise') {
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 2 / 4', 'Lunar Transfer', 'LUNA-01 is coasting toward the Moon on a transfer trajectory.')}
        <div class="data">${dist}${delay}</div>
        <p class="note">Travel is shown as a stylised animation - not a real orbital-mechanics simulation.</p>
        <div class="wait">◌ In transit…</div>` };
    }
    const loi = M.log.find(l => l.title === 'Lunar orbit insertion burn');
    return {
      cls: 'right', html: `
      ${header('CHECKPOINT 2 / 4', 'Lunar Arrival', 'Braking burn complete. LUNA-01 has been captured by the Moon.')}
      ${insight(`Lunar escape velocity ${esc(NasaData.show('Escape velocity'))}; surface gravity ${esc(NasaData.show('Surface gravity'))}${tag('nasa')} ≈ ${NasaData.get('Surface gravity relative to Earth') ? esc(NasaData.get('Surface gravity relative to Earth').value) : '?'} × Earth's${tag('derived')}.`,
        'To be captured, the spacecraft must brake below lunar escape speed. Heavier spacecraft need more propellant to brake.',
        `Orbit insertion used fuel = mass ÷ 10 → ${loi ? chips(loi.chips) : ''}`)}
      <div class="data">${dist}${delay}</div>
      ${btn('CHOOSE LUNAR ORBIT', 'to-orbit', { cls: 'go', primary: true })}` };
  };

  P.ORBIT_DECISION = () => {
    if (Game.phase !== 'choose') {
      const done = Game.phase === 'done';
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 2 / 4', ORBITS[M.selectedOrbit].name, done ? 'Orbit established.' : 'Executing orbit adjustment burn…')}
        ${done ? `${chips(M.log.filter(l => l.stage === 'Orbit').flatMap(l => l.chips))}${btn('BEGIN LUNAR SURVEY', 'to-survey', { cls: 'go', primary: true })}` : '<div class="wait">◌ Burning…</div>'}` };
    }
    const opts = ['low', 'high'].map((id, k) => {
      const fx = orbitFx(id), allowed = orbitAllowed(id);
      return option({
        id, key: k + 1, name: ORBITS[id].name, desc: ORBITS[id].desc, chips: fxChips(fx),
        selected: Game.choice === id, disabled: !allowed,
        warn: !allowed ? `Not enough fuel (${M.fuel}% left)` : M.fuel + fx.fuel < RULES.fuelReserve ? `Leaves ${M.fuel + fx.fuel}% fuel - reserve objective missed, +${rk(15)} risk` : powerWarn(fx),
      });
    }).join('');
    return {
      cls: 'right', html: `
      ${header('CHECKPOINT 2 / 4', 'Orbit Decision', `Fuel ${M.fuel}%. Last fuel decision: what remains is your reserve (objective ≥ ${RULES.fuelReserve}%).`)}
      ${insight(`Surface pressure ${esc(NasaData.show('Atmospheric surface pressure'))}${tag(NasaData.get('Atmospheric surface pressure') ? NasaData.get('Atmospheric surface pressure').confidence : 'nasa')}`,
        'Effectively a vacuum: no air drag, so even a low orbit is possible.',
        'Low orbit = closer, more detailed observations but more correction burns and risk.')}
      <div class="opts">${opts}</div>
      ${btn(Game.choice ? `CONFIRM ${ORBITS[Game.choice].name.toUpperCase()}` : 'SELECT AN ORBIT', 'confirm', { cls: 'go', primary: true, disabled: !Game.choice })}
      ${sources(['Atmospheric surface pressure', 'Escape velocity'])}` };
  };

  function instrumentInsight() {
    const id = M.selectedInstrument;
    if (id === 'spectrometer') {
      return insight(`LCROSS impact plume at Cabeus crater: ${esc(NasaData.show('Water in LCROSS impact plume (Cabeus crater; south pole)'))} water${tag('approx')}. South-pole hydrogen signature: ${esc(NasaData.show('Hydrogen signature over south polar region (Lunar Prospector)'))}.`,
        'Shadowed polar craters likely trap water ice - what a spectrometer detects.',
        `Water-ice bonus: <b>+${instrBonus(INSTRUMENTS.spectrometer)} science</b> per scan (game modifier).`);
    }
    if (id === 'radiation') {
      const r = NasaData.get('Surface dose rate measured during Apollo');
      return insight(`Surface dose measured during Apollo: ${esc(NasaData.show('Surface dose rate measured during Apollo'))}. ${r ? esc(r.game_note) + '.' : ''}`,
        'The unshielded surface is a natural radiation laboratory.',
        `Radiation bonus: <b>+${instrBonus(INSTRUMENTS.radiation)} science</b> per scan (game modifier).`);
    }
    return insight(`Coldest measured temperature (permanently shadowed craters): ${esc(NasaData.show('Coldest measured temperature (permanently shadowed craters)'))}.`,
      'Those crater floors never see sunlight; a camera mostly images sunlit rims.',
      'No target bonus for the Camera (game modifier).');
  }

  P.SURVEY = () => {
    const I = INSTRUMENTS[M.selectedInstrument];
    if (Game.phase === 'brief') {
      const hd = halfDay();
      const syn = NasaData.get('Synodic period (sunrise to sunrise)');
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 3 / 4', 'Target: South Polar Region', 'Real lunar conditions at your survey site (NASA dataset).')}
        <div class="data">
          ${dataRow('Gravity', 'Surface gravity')}
          ${dataRow('Temperature', 'Surface temperature minimum (typical range)', `${esc(NasaData.show('Surface temperature minimum (typical range)'))} to ${esc(NasaData.show('Surface temperature maximum (typical range)'))}`)}
          ${dataRow('Water / ice', 'Water in LCROSS impact plume (Cabeus crater; south pole)', `Potentially present - LCROSS plume ${esc(NasaData.show('Water in LCROSS impact plume (Cabeus crater; south pole)'))}`)}
          ${dataRow('Polar ice total', 'Estimated total polar ice mass (older model estimate)', `${esc(NasaData.show('Estimated total polar ice mass (older model estimate)'))} - "could be off considerably"`)}
          ${syn && hd ? `<div class="drow"${src(syn)}><span class="dl">Day / night</span><span class="dv">≈${hd} Earth days each (${esc(NasaData.show('Synodic period (sunrise to sunrise)'))} cycle ÷ 2)${tag('derived')}</span></div>` : ''}
          ${dataRow('Radiation', 'Surface dose rate measured during Apollo')}
        </div>
        <p class="note">Hover a row for its NASA source. Tags show whether a value is measured, approximate, an estimate, or derived.</p>
        ${btn('PLAN OBSERVATION', 'plan', { cls: 'go', primary: true })}
        ${sources(['Surface gravity', 'Coldest measured temperature (permanently shadowed craters)', 'Water in LCROSS impact plume (Cabeus crater; south pole)', 'Water in sunlit soil (SOFIA 2020)', 'Surface dose rate measured during Apollo'])}` };
    }
    if (Game.phase === 'choose') {
      const opts = Object.values(SCANS).map((s, k) => {
        const fx = scanFx(s.id);
        return option({
          id: s.id, key: k + 1, name: s.name,
          desc: `Science = ${I.scan} × ${s.mult}${instrBonus(I) ? ` + ${instrBonus(I)} bonus` : ''}`,
          chips: fxChips(fx), selected: Game.choice === s.id, warn: powerWarn(fx),
        });
      }).join('');
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 3 / 4', 'Observation Plan', `Science ${M.science} so far · goal ${scienceGoal()}.`)}
        <div class="lbl">YOUR INSTRUMENT: ${I.name.toUpperCase()} <button class="link" data-act="unplan">target data</button></div>
        ${instrumentInsight()}
        ${powerPlan(`Next: ≈${eventDrain()}% heater load. `)}
        <div class="opts">${opts}</div>
        ${btn(Game.choice ? `START ${SCANS[Game.choice].name.toUpperCase()}` : 'SELECT A SCAN MODE', 'confirm', { cls: 'go', primary: true, disabled: !Game.choice })}` };
    }
    if (Game.phase === 'scanning') {
      return { cls: 'right', html: `${header('CHECKPOINT 3 / 4', SCANS[M.selectedObservation].name, `${I.name} collecting data over the south polar region…`)}<div class="wait">◌ Scanning…</div>` };
    }
    const entry = M.log.filter(l => l.stage === 'Survey').pop();
    return {
      cls: 'right', html: `
      ${header('CHECKPOINT 3 / 4', 'Survey Complete', entry ? entry.detail : '')}
      ${entry ? chips(entry.chips) : ''}
      ${M.failure ? `<div class="verdict bad">✗ ${M.failure}</div>${btn('VIEW MISSION RESULT', 'to-result', { cls: 'warn', primary: true })}`
        : btn('CONTINUE MISSION', 'to-event', { cls: 'go', primary: true })}` };
  };

  P.MISSION_EVENT = () => {
    const battery = POWER_SYSTEMS[M.selectedPowerSystem].battery;
    if (Game.phase === 'alert') {
      return { cls: 'right alert', html: `${header('⚠ MISSION EVENT', 'Power Demand Increase', 'The survey target is entering lunar night…')}<div class="wait bad">◌ Analysing power bus…</div>` };
    }
    const hd = halfDay();
    const intro = `
      ${header('⚠ MISSION EVENT', 'Power Demand Increase', `Heaters on: <b>Power ${MINUS}${Game.eventDrain}%</b>${battery ? ' (battery backup absorbed most of it)' : ' (no battery backup)'}. Now at ${M.power}%.`)}
      ${insight(`Night lasts ≈${hd || '?'} Earth days${tag('derived')}; surface drops to ${esc(NasaData.show('Surface temperature minimum (typical range)'))}${tag('nasa')}.`,
        'No sunlight for the panels, and electronics must be heated to survive.',
        `Choose what to sacrifice: power, science, or safety.`)}`;
    if (Game.phase === 'choose') {
      const opts = Object.values(EVENT.options).map(o => {
        const fx = eventFx(o.id);
        return option({ id: o.id, key: o.key, name: o.name, desc: o.desc, chips: fxChips(fx), selected: Game.choice === o.id, warn: powerWarn(fx) || (fx.risk > 0 && M.risk + fx.risk >= RULES.riskHigh ? `Risk would reach ${M.risk + fx.risk} - data-loss anomaly` : '') });
      }).join('');
      return {
        cls: 'right alert', html: `${intro}${powerPlan()}<div class="opts">${opts}</div>
        ${btn(Game.choice ? `EXECUTE OPTION ${EVENT.options[Game.choice].key}` : 'SELECT A RESPONSE', 'confirm', { cls: 'go', primary: true, disabled: !Game.choice })}` };
    }
    const entry = M.log.filter(l => l.stage === 'Event').pop();
    return {
      cls: 'right', html: `
      ${header('MISSION EVENT RESOLVED', entry ? entry.title : '', entry ? entry.detail : '')}
      ${entry ? chips(entry.chips) : ''}
      ${M.failure ? `<div class="verdict bad">✗ ${M.failure}</div>${btn('VIEW MISSION RESULT', 'to-result', { cls: 'warn', primary: true })}`
        : btn('PREPARE DATA TRANSMISSION', 'to-transmission', { cls: 'go', primary: true })}` };
  };

  P.TRANSMISSION = () => {
    const c = M.communication;
    if (Game.phase === 'choose') {
      const opts = Object.values(TRANSMISSIONS).map((t, k) => {
        const fx = txFx(t.id);
        const warn = -fx.power > M.power ? 'Not enough power to finish - transmission would be cut off' : powerWarn(fx, true) || (fx.risk ? `Weak link: retransmissions add +${fx.risk} risk` : '');
        return option({ id: t.id, key: k + 1, name: t.name, desc: t.desc, chips: fxChips(fx), selected: Game.choice === t.id, warn });
      }).join('');
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 4 / 4', 'Data Transmission', `${M.science} science onboard. Get it home.`)}
        <div class="data">
          <div class="drow"><span class="dl">Comm capability</span><span class="dv">${c} · ${commLabel(c)}${tag('game')}</span></div>
          ${Game.signalDelay ? `<div class="drow" title="Derived: NASA mean Earth-Moon distance ÷ speed of light"><span class="dl">Signal delay</span><span class="dv">≈${Game.signalDelay.toFixed(2)} s one way${tag('derived')}</span></div>` : ''}
          <div class="drow"><span class="dl">Risk</span><span class="dv">${M.risk} · ${riskLevel(M.risk)}${M.risk >= RULES.riskHigh ? ' - anomaly expected' : ''}${tag('game')}</span></div>
        </div>
        <p class="note">Comm capability sets the power cost: a stronger link needs less power. Goal ${scienceGoal()} science with power ≥ ${RULES.healthyPower}% at the end.</p>
        <div class="opts">${opts}</div>
        ${btn(Game.choice ? 'BEGIN DOWNLINK' : 'SELECT A MODE', 'confirm', { cls: 'go', primary: true, disabled: !Game.choice })}` };
    }
    if (Game.phase === 'sending') {
      return { cls: 'right', html: `${header('CHECKPOINT 4 / 4', TRANSMISSIONS[M.selectedTransmission].name, 'Moon → LUNA-01 → Earth')}<div class="wait">◌ Transmitting…</div>` };
    }
    const entries = M.log.filter(l => l.stage === 'Transmission');
    return {
      cls: 'right', html: `
      ${header('CHECKPOINT 4 / 4', M.failure ? 'Transmission Interrupted' : 'Transmission Complete', `${M.science} science received at Earth.`)}
      ${entries.map(e => `<div class="logline"><b>${e.title}</b>${chips(e.chips)}<span>${e.detail}</span></div>`).join('')}
      ${btn('VIEW MISSION RESULT', 'to-result', { cls: M.failure ? 'warn' : 'go', primary: true })}` };
  };

  const STATUS_ICON = { SUCCESS: '✓', 'PARTIAL SUCCESS': '◐', FAILURE: '✗' };
  const statusCls = s => (s === 'SUCCESS' ? 'ok' : s === 'FAILURE' ? 'bad' : 'mid');

  P.RESULT = () => ({
    cls: 'right', html: `
    ${header('MISSION RESULT', `<span class="status ${statusCls(M.missionStatus)}">${STATUS_ICON[M.missionStatus]} ${M.missionStatus}</span>`)}
    <div class="bigsci ${statusCls(M.missionStatus)}"><b>${M.science}</b><span>science returned<br>goal ${scienceGoal()}${M.transmittedFraction < 1 ? ` · only ${Math.round(M.transmittedFraction * 100)}% of the downlink completed` : ''}</span></div>
    <div class="lbl">OBJECTIVES · ${scenario().name.toUpperCase()}</div>
    ${objectiveList(M.objectives)}
    <ul class="reasons">${M.reasons.map(r => `<li>${r}</li>`).join('')}</ul>
    ${btn('OPEN FINAL MISSION REPORT', 'to-report', { cls: 'go', primary: true })}` });

  P.REPORT = () => {
    const st = M.missionStatus, strat = strategyLabel();
    const txLine = M.selectedTransmission
      ? `${commLabel(M.communication)} link · ${M.selectedTransmission === 'full' ? 'full resolution' : 'compressed'} · ${Math.round(M.transmittedFraction * 100)}% delivered`
      : 'No transmission';
    const tiles = [
      tile('MISSION STATUS', `<span class="status ${statusCls(st)}">${STATUS_ICON[st]} ${st}</span>`, M.failure ? 'critical failure' : '', null),
      tile('SCIENCE RETURNED', `${M.science}`, `goal ${scienceGoal()} · collected ${M.collectedScience || M.science}`, M.science >= scienceGoal()),
      tile('POWER REMAINING', `${M.power}%`, `health line ${RULES.healthyPower}%`, !M.failure && M.power >= RULES.healthyPower),
      tile('FUEL REMAINING', `${M.fuel}%`, `reserve target ${RULES.fuelReserve}%`, M.fuel >= RULES.fuelReserve),
      tile('BUDGET USED', `$${M.budgetUsed}M`, `${Math.round(M.budgetUsed / budgetCap() * 100)}% of $${budgetCap()}M cap`, null),
      tile('MISSION RISK', `${riskLevel(M.risk)}`, `risk score ${M.risk} (game model)`, M.risk < RULES.riskHigh),
      tile('COMMUNICATION', `${M.communication}`, txLine, null),
      tile('CONDITION', scenario().name, `strategy: ${strat.name.toLowerCase()}`, null),
    ].join('');
    const decisions = M.log.map(l => `
      <div class="dec"><span class="d-stage">${l.stage.toUpperCase()}</span><b>${esc(l.title)}</b>${chips(l.chips)}</div>`).join('');
    return {
      cls: 'report', html: `
      <div class="rep-head">
        <div>${header('FINAL MISSION REPORT', 'LUNA-01 Mission Report')}</div>
        <div class="actions">${btn('NEW MISSION', 'replay', { cls: 'go', primary: true })}${btn('TITLE', 'title', { cls: 'ghost' })}</div>
      </div>
      <div class="tiles four">${tiles}</div>
      <div class="lbl">OBJECTIVES</div>
      ${objectiveList(M.objectives)}
      <div class="lbl">YOUR KEY DECISIONS → CONSEQUENCES</div>
      <div class="decs">${decisions}</div>
      <p class="note">Every new mission draws a new random condition. Tip: ${strat.next} &nbsp;·&nbsp; Budget, power, fuel, science and risk are a <b>simplified game model</b>. Lunar environment values come from the supplied NASA dataset (sources shown in the survey).</p>` };
  };

  // ------------------------------------------------------------ render / HUD
  let lastKey = '';
  function render() {
    const panel = $('panel');
    const build = P[Game.state];
    const res = build ? build() : null;
    const focusSel = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset : null;
    const focusKey = focusSel && focusSel.act ? `[data-act="${focusSel.act}"]${focusSel.id ? `[data-id="${focusSel.id}"]` : ''}` : null;
    if (!res) { panel.className = 'panel hidden'; panel.innerHTML = ''; return; }
    panel.className = `panel ${res.cls}`;
    panel.innerHTML = res.html;
    const key = Game.state + '|' + Game.phase;
    if (key !== lastKey) { panel.scrollTop = 0; lastKey = key; }
    const again = focusKey && panel.querySelector(focusKey);
    if (again) again.focus({ preventScroll: true });
    tracker();
    hud();
  }

  const TRACK = ['DESIGN', 'LAUNCH', 'ORBIT', 'SURVEY', 'TRANSMISSION', 'RESULT'];
  const STAGE_INFO = {
    BRIEFING: [-1, 'MISSION BRIEFING'], DESIGN: [0, 'CHECKPOINT 1 / 4 · MISSION DESIGN'], DESIGN_REVIEW: [0, 'CHECKPOINT 1 / 4 · DESIGN VALIDATION'],
    LAUNCH: [1, 'LAUNCH'], TRANSFER: [2, 'CHECKPOINT 2 / 4 · LUNAR TRANSFER'], ORBIT_DECISION: [2, 'CHECKPOINT 2 / 4 · ORBIT DECISION'],
    SURVEY: [3, 'CHECKPOINT 3 / 4 · LUNAR SURVEY'], MISSION_EVENT: [3, 'CHECKPOINT 3 / 4 · MISSION EVENT'],
    TRANSMISSION: [4, 'CHECKPOINT 4 / 4 · DATA TRANSMISSION'], RESULT: [5, 'MISSION RESULT'], REPORT: [6, 'FINAL REPORT'],
  };
  function tracker() {
    const info = STAGE_INFO[Game.state];
    const show = !!info;
    $('hud').classList.toggle('hidden', !show);
    $('tracker').classList.toggle('hidden', !show);
    if (!show) return;
    const [idx, label] = info;
    $('tracker').innerHTML = `<ol>${TRACK.map((s, k) => `<li class="${k < idx ? 'done' : k === idx ? 'now' : ''}"><i></i>${s}</li>`).join('')}</ol><div class="cond-badge" title="${scenario().effects.join(' · ')}">${scenario().icon} ${scenario().name.toUpperCase()}</div><div class="stage-label">${label}</div>`;
  }

  const prev = {};
  function meter(id, value, max, text) {
    const el = $(id);
    const bar = el.querySelector('i'), out = el.querySelector('b');
    const v = value == null ? 0 : value;
    bar.style.width = `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
    out.textContent = text;
    el.classList.toggle('low', value != null && (id === 'm-power' || id === 'm-fuel') && v / max < 0.2);
    if (prev[id] != null && value != null && value !== prev[id]) {
      el.classList.remove('up', 'down'); void el.offsetWidth;
      el.classList.add(value > prev[id] ? 'up' : 'down');
    }
    prev[id] = value;
  }

  function hud() {
    let v;
    if (Game.state === 'BRIEFING') v = { power: null, fuel: null, budget: budgetCap(), science: 0, risk: 0 };
    else if (Game.state === 'DESIGN' || Game.state === 'DESIGN_REVIEW') {
      const d = computeDesign(Game.sel);
      v = { power: d.power, fuel: d.fuel, budget: budgetCap() - d.budgetUsed, science: 0, risk: d.risk };
    } else v = { power: M.power, fuel: M.fuel, budget: M.budget, science: M.science, risk: M.risk };
    meter('m-power', v.power, 100, v.power == null ? '—' : `${v.power}%`);
    meter('m-fuel', v.fuel, 100, v.fuel == null ? '—' : `${v.fuel}%`);
    meter('m-budget', Math.max(0, v.budget), budgetCap(), `$${v.budget}M`);
    meter('m-science', v.science, 100, `${v.science} / ${scienceGoal()}`);
    $('m-science').querySelector('.bar').style.setProperty('--goal', `${scienceGoal()}%`);
    const lvl = riskLevel(v.risk);
    const r = $('risk');
    r.innerHTML = `RISK <b>${lvl}</b> <small>${v.risk}</small>`;
    r.className = `risk ${lvl.toLowerCase()}`;
    r.title = `Mission risk (game model). ≥${RULES.riskHigh}: data-loss anomaly · ≥${RULES.riskCritical}: mission lost`;
  }

  let toastTimer = null;
  function toast(title, list) {
    const el = $('toast');
    el.innerHTML = `<b>${esc(title)}</b>${chips(list)}`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
  }

  function setMuteLabel() {
    const b = $('mute');
    b.textContent = Sfx.muted ? 'AUDIO OFF' : 'AUDIO ON';
    b.setAttribute('aria-pressed', String(!Sfx.muted));
  }

  function hideToast() { $('toast').classList.remove('show'); }

  return { render, hud, toast, hideToast, setMuteLabel };
})();
