// HTML overlay: HUD, checkpoint tracker, decision panels, toasts, facts feed.
// Panels are rebuilt only on state/phase/selection changes - never per frame.

const UI = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MINUS = '−';
  const show = (key, ds) => esc(NasaData.show(key, ds || 'moon'));

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
  // fmt(valueText, row) may rewrite the displayed value; conf overrides the tag.
  function dRow(label, key, ds = 'moon', fmt = null, conf = null) {
    const r = NasaData.get(key, ds);
    if (!r) return `<div class="drow"><span class="dl">${label}</span><span class="dv">data unavailable</span></div>`;
    const v = show(key, ds);
    return `<div class="drow"${src(r)}><span class="dl">${label}</span><span class="dv">${fmt ? fmt(v, r) : v}${tag(conf || r.confidence)}</span></div>`;
  }
  const dataRow = (label, key, valueOverride, conf) => dRow(label, key, 'moon', valueOverride ? () => valueOverride : null, conf);

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

  // refs: [key, ds] pairs (or plain keys for the moon dataset)
  function sources(refs) {
    const seen = new Map();
    for (const ref of refs) {
      const [k, ds] = Array.isArray(ref) ? ref : [ref, 'moon'];
      const r = NasaData.get(k, ds);
      if (r && !seen.has(r.source_url)) seen.set(r.source_url, r.source_name);
    }
    if (!seen.size) return '';
    return `<details class="sources"><summary>Sources (${seen.size})</summary><ul>${[...seen].map(([u, n]) =>
      `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(n)}</a></li>`).join('')}</ul></details>`;
  }

  function option(o) {
    return `<button class="opt ${o.selected ? 'selected' : ''} ${o.kit ? 'kitopt' : ''}" data-act="${o.act || 'choose'}" data-id="${o.id}" ${o.group ? `data-group="${o.group}"` : ''} aria-pressed="${!!o.selected}" ${o.disabled ? 'disabled' : ''}>
      <span class="opt-top">${o.key ? `<span class="opt-key">${o.key}</span>` : ''}<span class="opt-name">${o.name}</span>${o.badge ? `<span class="opt-badge">${o.badge}</span>` : ''}${o.selected ? '<span class="opt-sel">SELECTED</span>' : ''}</span>
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
      <div class="cond-h"><span class="cond-i">${sc.icon}</span><span><small>MISSION CONDITION · RANDOM EACH RUN</small><b>${sc.name}</b></span></div>
      ${compact ? '' : `<p>${sc.brief}</p>`}
      <ul>${sc.effects.map(e => `<li>${e}</li>`).join('')}</ul>
      ${r && !compact ? `<div class="drow"${src(r)}><span class="dl">${sc.nasaLabel}</span><span class="dv">${show(sc.nasa)}${tag(r.confidence)}</span></div>` : ''}
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

  // Pre-launch threat forecast (odds depend on target, condition and rocket).
  function threatStrip(rocket) {
    const list = threatForecast(rocket).sort((a, b) => b.p - a.p);
    return `<div class="threats"><span class="th-l">THREAT FORECAST</span>${list.map(t =>
      `<span class="threat ${t.level.toLowerCase()}" title="${esc(t.name)}: ~${Math.round(t.p * 100)}% chance${t.lowOnly ? ' (mostly in low orbit)' : ''}. Countered by: ${t.kit ? esc(t.kit.name) : 'none'}">${HAZARDS[t.id].icon} ${t.name.split(' ')[t.id === 'seu' ? 1 : 0]} <b>${t.level === 'MODERATE' ? 'MOD' : t.level}</b>${t.lowOnly ? '*' : ''}</span>`).join('')}</div>`;
  }

  // ------------------------------------------------------------ NASA data per survey region
  const coordsOf = key => (NasaData.coords(key) || 'coordinates unavailable');
  const REGION_DATA = {
    south_pole: () => [
      dRow('Water / ice', 'Water in LCROSS impact plume (Cabeus crater; south pole)', 'moon', v => `LCROSS plume ${v}`),
      dRow('Hydrogen', 'Hydrogen signature over south polar region (Lunar Prospector)'),
      dRow('Coldest spot', 'Coldest measured temperature (permanently shadowed craters)'),
      dRow('Polar ice total', 'Estimated total polar ice mass (older model estimate)', 'moon', v => `${v} - "could be off considerably"`),
    ],
    tranquillitatis: () => [
      dRow('Apollo 11 site', REGIONS.tranquillitatis.dataKey, 'regions', () => coordsOf(REGIONS.tranquillitatis.dataKey)),
      dRow('Pit depth', 'Mare Tranquillitatis pit|Depth', 'regions'),
      dRow('Pit shade temp', 'Mare Tranquillitatis pit|Temperature in shadowed part (steady)', 'regions', v => `${v} steady (open surface ${show('Equatorial surface (general)|Daytime max / night min', 'regions')})`),
      dRow('Rock chemistry', 'Maria (dark plains)|Rock chemistry', 'regions'),
      dRow('Lava age', 'Maria (dark plains)|Lava flooding era', 'regions'),
    ],
    marius: () => [
      dRow('Pit depth', 'Marius Hills pit|Depth', 'regions'),
      dRow('Pit opening', 'Marius Hills pit|Width', 'regions'),
      dRow('Pits on Moon', 'Whole Moon|Known pits', 'regions', (v, r) => `${v} known · ${esc(r.game_note)}`),
      dRow('Radiation', 'Surface dose rate measured during Apollo'),
    ],
    descartes: () => [
      dRow('Apollo 16 site', REGIONS.descartes.dataKey, 'regions', (v, r) => `${coordsOf(REGIONS.descartes.dataKey)} · ${esc(r.game_note)}`),
      dRow('Rock chemistry', 'Highlands (bright terrain)|Rock chemistry', 'regions'),
      dRow('Regolith depth', 'Highlands (bright terrain)|Regolith depth (older highlands)', 'regions'),
      dRow('Dust grains', 'Average particle size', 'dust', v => `${v} average · ${show('Particle shape', 'dust')}`),
    ],
    farside: () => [
      dRow('Farside crust', 'Farside|Crust thickness', 'regions', v => `${v} (nearside ${show('Nearside|Crust thickness', 'regions')})`),
      dRow('Moon rotation', 'Moon orbit|Sidereal rotation period', 'orbit', v => `${v} = one orbit (${show('Moon orbit|Sidereal revolution period', 'orbit')}) → tidally locked`),
      dRow('Radio link', 'One-way light/radio delay at mean distance', 'orbit', v => `${v} delay - but only with line of sight`),
    ],
  };
  const REGION_SOURCES = {
    south_pole: [['Water in LCROSS impact plume (Cabeus crater; south pole)'], ['Coldest measured temperature (permanently shadowed craters)']],
    tranquillitatis: [[REGIONS.tranquillitatis.dataKey, 'regions'], ['Mare Tranquillitatis pit|Depth', 'regions'], ['Maria (dark plains)|Rock chemistry', 'regions']],
    marius: [['Marius Hills pit|Depth', 'regions'], ['Surface dose rate measured during Apollo']],
    descartes: [[REGIONS.descartes.dataKey, 'regions'], ['Highlands (bright terrain)|Rock chemistry', 'regions'], ['Average particle size', 'dust']],
    farside: [['Farside|Crust thickness', 'regions'], ['Moon orbit|Sidereal rotation period', 'orbit']],
  };

  const bestInstrument = reg => Object.values(INSTRUMENTS).reduce((a, b) => ((reg.bonus[b.id] || 0) > (reg.bonus[a.id] || 0) ? b : a));

  // ------------------------------------------------------------ NASA facts feed (rotates during animations)
  const FACTS = [
    () => { const e = NasaData.num('Earth|Escape velocity', 'orbit'), m = NasaData.num('Escape velocity'); return [`Leaving Earth needs ${show('Earth|Escape velocity', 'orbit')} - about ${(e / m).toFixed(1)}× the Moon's ${show('Escape velocity')}.`, 'derived']; },
    () => [`The Moon's distance swings between ${show('Perigee (closest)', 'orbit')} and ${show('Apogee (farthest)', 'orbit')} every orbit.`, 'nasa'],
    () => [`The Moon drifts ${show('Recession rate from Earth', 'orbit')} farther from Earth every year.`, 'nasa'],
    () => [`The Moon turns once every ${show('Moon orbit|Sidereal rotation period', 'orbit')} - exactly one orbit - so the same face always points at Earth.`, 'nasa'],
    () => [`Earth and Moon circle a shared centre ${show("Barycenter distance from Earth's center", 'orbit')} from Earth's centre - inside Earth (radius ${show('Equatorial radius', 'orbit')}).`, 'derived'],
    () => [`Earth is ${show('Earth/Moon mass ratio', 'orbit').replace(' ratio', '')} times more massive than the Moon.`, 'derived'],
    () => [`The Moon's orbit is tilted ${show('Inclination to ecliptic', 'orbit')} to Earth's orbit - so eclipses don't happen every month.`, 'nasa'],
    () => [`The Moon orbits Earth at ${show('Moon orbit|Mean orbital velocity', 'orbit')} on average; Earth circles the Sun at ${show('Earth orbit|Mean orbital velocity', 'orbit')}.`, 'nasa'],
    () => [`Average lunar dust grain: ${show('Average particle size', 'dust')} - ${show('Particle shape', 'dust').toLowerCase()} and abrasive to seals.`, 'nasa'],
    () => [`A dust layer of ${show('Dust covering that halves solar-cell output', 'dust')} can halve a solar cell's output.`, 'nasa'],
    () => [`Lab tests: fine simulant grains (20-25 µm) carried ${show('Charge-to-mass, 20-25 um SIMULANT (JSC-1A)', 'dust')} of charge - lab simulant, not real Moon dust.`, 'lab'],
    () => [`Over ${show('Whole Moon|Known pits', 'regions').replace(' count', '')} pits are known on the Moon; ${esc((NasaData.get('Whole Moon|Known pits', 'regions') || {}).game_note || '')}.`, 'nasa'],
    () => [`The farside crust is ${show('Farside|Crust thickness', 'regions')} thick versus ${show('Nearside|Crust thickness', 'regions')} on the nearside.`, 'nasa'],
    () => [`The dark maria are lava plains that flooded ${show('Maria (dark plains)|Lava flooding era', 'regions')}.`, 'nasa'],
    () => [`Radio signals take ${show('One-way light/radio delay at mean distance', 'orbit')} to cross the Earth-Moon gap.`, 'derived'],
    () => [`Earth's surface gravity ${show('Surface gravity (mean)', 'orbit')} is about 6× the Moon's ${show('Surface gravity')}.`, 'nasa'],
    () => [`Top-surface regolith has a bulk density of ${show('Bulk density at surface', 'dust')}, rising to ${show('Bulk density at 100 cm', 'dust')} one metre down.`, 'nasa'],
  ];
  let factIdx = Math.floor(Math.random() * FACTS.length), factAt = 0;
  function factHtml() {
    let f;
    try { f = FACTS[factIdx % FACTS.length](); } catch (e) { f = null; }
    if (!f || /unavailable/.test(f[0])) return '';
    return `<span class="f-k">DID YOU KNOW</span><span class="f-t">${f[0]}</span>${tag(f[1])}`;
  }
  const factBox = () => `<div class="fact" id="fact">${factHtml()}</div>`;
  function tickFact(t) {
    if (t - factAt < 7) return;
    factAt = t;
    const el = $('fact');
    if (!el) return;
    factIdx++;
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
    el.innerHTML = factHtml();
  }

  // ------------------------------------------------------------ panels per state
  const P = {};

  P.TITLE = () => {
    const n = NasaData.count();
    return {
      cls: 'title', html: `
      <div class="title-block">
        <div class="kicker">NASA SPACE APPS CHALLENGE 2026 · SPACE MISSION DESIGN GAME</div>
        <h1>LUNA-01</h1>
        <div class="title-sub">MISSION CONTROL</div>
        <p class="tagline">Choose a lunar target, design the spacecraft, survive the flight, and bring the science home.<br>There is no perfect design. Every advantage has a cost.</p>
        ${btn('START MISSION', 'start', { cls: 'big go', primary: true })}
        <p class="fine">${n ? `4 NASA datasets loaded · ${n} values (${NasaData.origin === 'csv' ? 'local CSV' : 'embedded copy of local CSV'})` : '⚠ NASA datasets could not be loaded'} · ~7 min · Sound optional (M)</p>
      </div>` };
  };

  P.BRIEFING = () => ({
    cls: 'right', html: `
    ${header('MISSION BRIEFING', 'You are the Mission Director', 'Pick a survey target, design LUNA-01, handle whatever space throws at it, and bring the data home. You never fly the spacecraft - you make the calls.')}
    ${conditionCard()}
    <div class="lbl">OBJECTIVES · ALL THREE FOR FULL SUCCESS</div>
    ${objectiveList()}
    <div class="kvs">
      <div class="kv"><span>Budget cap</span><b>$${budgetCap()}M</b></div>
      <div class="kv"><span>In-flight hazards</span><b>2 random · odds shown before launch</b></div>
      <div class="kv"><span>Risk</span><b>≥ ${RULES.riskHigh} data loss · ≥ ${RULES.riskCritical} mission lost</b></div>
    </div>
    <p class="note">▲ benefit · ▼ cost. Every option shows both before you commit. Budget, power, fuel and risk figures are a simplified game model.</p>
    ${btn('CHOOSE SURVEY TARGET', 'to-target', { cls: 'go', primary: true })}` });

  P.TARGET = () => {
    const opts = Object.values(REGIONS).map((reg, k) => {
      const on = M.region === reg.id;
      return option({
        id: reg.id, key: k + 1, name: reg.name, desc: on ? reg.kind : '',
        chips: on ? [{ t: `▲ ${reg.gain}`, tone: 'good' }, { t: `▼ ${reg.loss}`, tone: 'bad' }] : null,
        badge: `BEST: ${bestInstrument(reg).name.toUpperCase()}`, selected: on,
      });
    }).join('');
    const reg = REGIONS[M.region];
    const detail = reg ? `
      <div class="lbl">${reg.name.toUpperCase()} · NASA DATA</div>
      <p class="pitch">${reg.pitch}</p>
      <div class="data">${REGION_DATA[reg.id]().slice(0, 3).join('')}</div>` : '<p class="note">Select a target to see its NASA data. The target decides which instrument, kit and orbit make sense.</p>';
    return {
      cls: 'right target', html: `
      ${header('CHECKPOINT 1 / 4 · TARGET', 'Choose the Survey Target', `Condition: <b>${scenario().name}</b>. Each region rewards a different instrument and brings different risks.`)}
      <div class="opts compact">${opts}</div>
      ${detail}
      ${btn(reg ? `TARGET ${reg.short} - DESIGN SPACECRAFT` : 'SELECT A TARGET', 'confirm', { cls: 'go', primary: true, disabled: !reg })}` };
  };

  function designCard(group, o, selected, stat, badge) {
    return `<button class="dcard ${selected ? 'selected' : ''}" data-act="pick" data-group="${group}" data-id="${o.id}" aria-pressed="${selected}">
      <span class="dc-name"><span>${o.name}${selected ? ' <i>✓</i>' : ''}</span>${badge || ''}</span>
      <span class="dc-stat">${stat}</span>
      <span class="dc-gain">▲ ${o.gain}</span>
      ${o.loss && group !== 'kit' ? `<span class="dc-loss">▼ ${o.loss}</span>` : ''}
    </button>`;
  }

  function tile(label, value, sub, ok) {
    const mark = ok === true ? '<i class="ok">✓</i>' : ok === false ? '<i class="bad">✗</i>' : '';
    return `<div class="tile ${ok === false ? 'bad' : ''}"><span class="t-l">${label} ${mark}</span><b>${value}</b><span class="t-s">${sub}</span></div>`;
  }

  P.DESIGN = () => {
    const s = Game.sel, d = computeDesign(s), reg = region();
    const dash = '—';
    const threats = threatForecast(s.rocket || 'medium');
    const rockets = Object.values(ROCKETS).map(o => designCard('rocket', o, s.rocket === o.id, `$${o.cost}M · ≤${o.capacity} kg · fuel ${o.fuel}%`)).join('');
    const powers = Object.values(POWER_SYSTEMS).map(o => designCard('power', o, s.power === o.id, `$${o.cost}M · ${o.mass} kg · power ${o.power}%`)).join('');
    const insts = Object.values(INSTRUMENTS).map(o => {
      const b = instrBonus(o);
      return designCard('instrument', o, s.instrument === o.id, `$${o.cost}M · ${o.mass} kg · power ${MINUS}${o.draw}`,
        `<span class="dc-tgt ${b > 0 ? 'good' : b < 0 ? 'bad' : ''}" title="Science bonus per scan at ${reg.name}">${b > 0 ? '+' : b < 0 ? MINUS : '±'}${Math.abs(b)} here</span>`);
    }).join('');
    const kits = Object.values(KITS).map(o => {
      const th = threats.filter(t => o.protects.includes(t.id)).sort((a, b) => b.p - a.p)[0];
      return designCard('kit', o, s.kit === o.id, o.id === 'none' ? 'free' : `$${o.cost}M · ${o.mass} kg`,
        th ? `<span class="dc-tgt threat-${th.level.toLowerCase()}" title="Forecast threat it counters: ${th.name} ${th.level}">${th.level === 'MODERATE' ? 'MOD' : th.level}</span>` : '');
    }).join('');
    const tiles = [
      tile('BUDGET USED', `$${d.budgetUsed}M`, `cap $${budgetCap()}M`, s.rocket || s.power || s.instrument || s.kit ? d.budgetUsed <= budgetCap() : null),
      tile('MASS', `${d.mass} kg`, `limit ${d.capacity} kg`, s.rocket ? d.mass <= d.capacity : null),
      tile('POWER', d.power == null ? dash : `${d.power}%`, `min ${RULES.minPower}%`, d.power == null ? null : d.power >= RULES.minPower),
      tile('FUEL', d.fuel == null ? dash : `${d.fuel}%`, d.fuel == null ? 'set by rocket' : `≈${d.arrivalFuel}% at Moon (balanced)`, d.fuel == null ? null : d.arrivalFuel >= RULES.minArrivalFuel),
      tile('COMM', `${d.comm}`, `${commLabel(d.comm).toLowerCase()}${reg.side === 'far' ? ' · far side!' : ''}`, null),
      tile('SCIENCE / SCAN', d.sciencePotential == null ? dash : `${d.sciencePotential}`, `standard · goal ${scienceGoal()}`, null),
    ].join('');
    return {
      cls: 'wide', html: `
      ${header(`CHECKPOINT 1 / 4 · DESIGN · TARGET ${reg.short} <button class="link" data-act="to-target">change target</button>`, 'Mission Design')}
      <div class="group"><h3>1 · LAUNCH VEHICLE</h3><div class="cards3">${rockets}</div></div>
      <div class="group"><h3>2 · POWER SYSTEM</h3><div class="cards3">${powers}</div></div>
      <div class="group"><h3>3 · SCIENTIFIC INSTRUMENT</h3><div class="cards3">${insts}</div></div>
      <div class="group"><h3>4 · PROTECTION KIT</h3><div class="cards5">${kits}</div></div>
      ${threatStrip(s.rocket || 'medium')}
      <div class="tiles">${tiles}</div>
      <div class="actions">${btn(d.complete ? 'RUN DESIGN REVIEW' : 'SELECT ALL FOUR COMPONENTS', 'review', { cls: 'go', primary: true, disabled: !d.complete })}</div>` };
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
      ${rv.ok ? threatStrip(Game.sel.rocket) : ''}
      <div class="actions">
        ${rv.ok ? btn('PLAN TRAVEL STRATEGY', 'to-trajectory', { cls: 'go', primary: true }) : ''}
        ${btn('MODIFY DESIGN', 'redesign', { primary: !rv.ok })}
      </div>` };
  };

  // ---- Travel strategy: how quickly do you want to reach the Moon?
  function travelSummary(tp, fuelNow) {
    return `<div class="travel-sum">
      <div><span>Selected strategy</span><b>${tp.short}</b></div>
      <div><span>Estimated lunar arrival</span><b>${fmtDuration(tp.hours, true)}</b></div>
      <div><span>Estimated fuel cost</span><b>${tp.fuelTotal}% <small>TLI ${tp.tli} + LOI ${tp.loi}</small></b></div>
      <div><span>Remaining fuel</span><b>${fuelNow - tp.fuelTotal}%</b></div>
    </div>`;
  }
  P.TRAJECTORY = () => {
    const d = computeDesign(Game.sel);
    const opts = Object.keys(TRAVEL_MODES).map((id, k) => {
      const m = TRAVEL_MODES[id], tp = travelPlan(id, d.mass), left = d.fuel - tp.fuelTotal, ok = left >= RULES.minArrivalFuel;
      const hz = Math.round(tp.hazardChance * 100);
      return option({
        id, key: k + 1, name: m.name, badge: id === 'balanced' ? 'RECOMMENDED' : `FUEL USE ${m.usage}`, desc: `<i>${m.ref}</i>`,
        chips: [{ t: `⏱ ≈${fmtDuration(tp.hours)}`, tone: 'neutral' }, chip('fuel', -tp.fuelTotal)]
          .concat(tp.cruisePower ? [chip('power', -tp.cruisePower)] : []).concat(tp.risk ? [chip('risk', tp.risk)] : [])
          .concat([{ t: `${hz < 50 ? '▲' : hz > 80 ? '▼' : '•'} Transit hazard ${hz}%`, tone: hz < 50 ? 'good' : hz > 80 ? 'bad' : 'neutral' },
            { t: `${tp.nightFactor < 0.97 ? '▲' : tp.nightFactor > 1.03 ? '▼' : '•'} Night load ×${tp.nightFactor.toFixed(2)}`, tone: tp.nightFactor < 0.97 ? 'good' : tp.nightFactor > 1.03 ? 'bad' : 'neutral' }]),
        selected: Game.choice === id, disabled: !ok,
        warn: !ok ? `Not enough fuel: would arrive with ${left}% (need ${RULES.minArrivalFuel}%)` : left < RULES.fuelReserve + 12 ? `Arrives with only ${left}% fuel` : '',
      });
    }).join('');
    const sel = Game.choice ? travelPlan(Game.choice, d.mass) : null;
    return {
      cls: 'right', html: `
      ${header(`CHECKPOINT 2 / 4 · TRAVEL STRATEGY <button class="link" data-act="redesign">modify design</button>`, 'How Fast to the Moon?', `Faster = more fuel &amp; risk. Slower = saves fuel, but days longer in transit. Launch fuel ${d.fuel}%.`)}
      <div class="opts">${opts}</div>
      ${sel ? travelSummary(sel, d.fuel) : ''}
      ${btn(sel ? `LOCK ${sel.short} · FINAL PRE-LAUNCH CHECKS` : 'SELECT A TRAVEL STRATEGY', 'confirm', { cls: 'go', primary: true, disabled: !sel })}` };
  };

  const POLL = () => [`Target · ${REGIONS[M.region] ? REGIONS[M.region].short : '—'}`, `Vehicle · ${ROCKETS[M.selectedRocket].name}`,
    `Trajectory · ${M.travel ? M.travel.short : '—'} (locked)`, 'Propellant loaded', 'Range safety', 'Weather', 'Flight director'];
  const POLL_COUNT = 7;
  const LAUNCH_STEPS = ['Final pre-launch checks', 'Countdown T−5', 'Ignition · Liftoff', 'Max-Q · ascent', 'Stage separation', 'Spacecraft separation', 'Earth orbit reached'];
  P.LAUNCH = () => {
    const i = Game.launchStep, tp = M.travel;
    const list = LAUNCH_STEPS.map((s, k) => `<li class="${k < i ? 'done' : k === i ? 'now' : ''}">${k < i ? '✓' : k === i ? '▶' : '○'} ${s}${k === 1 && i === 1 && Game.countdown ? ` · T−${Game.countdown}` : ''}</li>`).join('');
    const pct = Math.round((Math.max(0, i) / (LAUNCH_STEPS.length - 1)) * 100);
    const poll = POLL().map((s, k) => `<li class="${k < Game.pollStep ? 'go' : ''}"><span>${s}</span><b>${k < Game.pollStep ? 'GO' : '…'}</b></li>`).join('');
    const title = i === 0 ? 'Final Pre-Launch Checks' : i === 1 ? `Countdown · T−${Game.countdown || 5}` : ROCKETS[M.selectedRocket].name;
    return {
      cls: 'right', html: `
      ${header('LAUNCH', title, tp ? `Strategy locked: <b>${tp.short}</b> · est. arrival ${fmtDuration(tp.hours, true)} · transfer fuel ${tp.fuelTotal}%.` : 'Automatic sequence. No piloting required.')}
      <ul class="poll">${poll}</ul>
      <div class="progress"><i style="width:${pct}%"></i><span>${pct}%</span></div>
      <ol class="steps">${list}</ol>
      ${Game.phase === 'done' ? `<div class="verdict ok">✓ EARTH ORBIT REACHED</div>${btn('BEGIN EARTH ORBIT OPERATIONS', 'to-transfer', { cls: 'go', primary: true })}`
        : `<div class="data">${dRow('Earth escape speed', 'Earth|Escape velocity', 'orbit')}</div>${factBox()}`}` };
  };

  // ---- In-flight hazard panel (shared by TRANSFER and SURVEY)
  function gambleChips(o) {
    const pc = Math.round(o.chance * 100);
    return [{ t: `${pc}%: no damage`, tone: 'good' }, { t: `${100 - pc}%:`, tone: 'bad' }].concat(fxChips(o.bad));
  }
  function hazardPanel() {
    const hz = Game.hazard, h = HAZARDS[hz.id], kit = KITS[M.selectedKit];
    const protectedBy = kit && kit.protects.includes(hz.id);
    const counter = Object.values(KITS).find(k => k.protects.includes(hz.id));
    const where = hz.slot === 1 ? 'LUNAR TRANSFER' : 'LUNAR SURVEY';
    if (Game.phase === 'hazard') {
      const opts = hazardOptions(hz.id, hz.slot).map((o, k) => option({
        id: o.id, key: k + 1, name: o.name, desc: o.desc, kit: o.isKit,
        badge: o.isKit ? 'KIT' : o.chance != null ? 'GAMBLE' : '',
        chips: o.chance != null ? gambleChips(o) : (fxChips(o.fx).length ? fxChips(o.fx) : [{ t: 'No cost', tone: 'good' }]),
        selected: Game.choice === o.id, warn: powerWarn(o.chance != null ? o.bad : o.fx),
      })).join('');
      return {
        cls: 'right alert', html: `
        ${header(`⚠ HAZARD · ${where}`, h.name, h.brief)}
        ${insight(`${h.nasa.label}: ${show(h.nasa.key, h.nasa.ds)}${NasaData.get(h.nasa.key, h.nasa.ds) ? tag(NasaData.get(h.nasa.key, h.nasa.ds).confidence) : ''}`,
          h.nasa.note + (h.scenarioNote ? ` <i>${h.scenarioNote}</i>` : ''),
          protectedBy ? `Your <b>${kit.name}</b> unlocks a low-cost response.` : `No matching protection on board${counter ? ` - a ${counter.name} would have helped` : ''}.`)}
        <div class="opts">${opts}</div>
        ${btn(Game.choice ? 'EXECUTE RESPONSE' : 'SELECT A RESPONSE', 'confirm', { cls: 'go', primary: true, disabled: !Game.choice })}` };
    }
    const entry = M.log.filter(l => l.stage === 'Hazard').pop();
    const verdict = hz.outcome === 'lucky' ? 'The gamble paid off.' : hz.outcome === 'unlucky' ? 'The gamble failed.' : hz.opt === 'kit' ? `Your ${kit.name} did its job.` : 'Handled - at a cost.';
    return {
      cls: M.failure ? 'right alert' : 'right', html: `
      ${header('HAZARD RESOLVED', h.name, verdict)}
      ${entry ? `<div class="logline"><b>${esc(entry.title)}</b>${chips(entry.chips)}<span>${esc(entry.detail)}</span></div>` : ''}
      ${M.failure ? `<div class="verdict bad">✗ ${M.failure}</div>${btn('VIEW MISSION RESULT', 'resume-hazard', { cls: 'warn', primary: true })}`
        : btn(hz.slot === 1 ? 'RESUME LUNAR TRANSFER' : 'RESUME SURVEY', 'resume-hazard', { cls: 'go', primary: true })}` };
  }

  P.TRANSFER = () => {
    if (Game.phase === 'hazard' || Game.phase === 'hazardDone') return hazardPanel();
    const tp = M.travel;
    const plan = tp ? `<div class="kvs">
        <div class="kv"><span>Strategy</span><b>${tp.short} · ${fmtDuration(tp.hours, true)}</b></div>
        <div class="kv"><span>TLI burn / LOI burn</span><b>${tp.tli}% / ${tp.loi}% fuel</b></div>
        <div class="kv"><span>Transit hazard chance</span><b>${Math.round(tp.hazardChance * 100)}%</b></div>
      </div>` : '';
    if (Game.phase === 'parking') {
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 2 / 4 · EARTH ORBIT', 'Earth Parking Orbit', 'LUNA-01 has reached Earth orbit. Two orbits of systems checkout before the trans-lunar injection (TLI) burn.')}
        ${plan}
        ${insight(`Earth escape velocity ${show('Earth|Escape velocity', 'orbit')}${tag('nasa')}.`,
          'Orbit is not enough to reach the Moon: the TLI burn must boost LUNA-01 close to Earth\'s escape velocity.',
          `A <b>${tp ? tp.short : ''}</b> transfer spends <b>${tp ? tp.tli : '?'}% fuel</b> on this burn.`)}
        ${factBox()}
        <div class="wait">◌ Orbiting Earth…</div>` };
    }
    if (Game.phase === 'tli') {
      const e = M.log.filter(l => l.title === 'Trans-lunar injection burn').pop();
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 2 / 4 · TRANS-LUNAR INJECTION', 'Engine Burn', `Main engine firing. LUNA-01 is accelerating out of Earth orbit onto a ${tp ? tp.name.toLowerCase() : ''} trajectory.`)}
        ${e ? `<div class="logline"><b>${esc(e.title)}</b>${chips(e.chips)}<span>${esc(e.detail)}</span></div>` : ''}
        ${plan}
        <div class="wait">◌ Burning… fuel now ${M.fuel}%</div>` };
    }
    if (Game.phase === 'loi') {
      return {
        cls: M.failure ? 'right alert' : 'right', html: `
        ${header('CHECKPOINT 2 / 4 · LUNAR ORBIT INSERTION', M.failure ? 'Capture Failed' : 'Entering Lunar Orbit', M.failure ? '' : `Retro-burn to slow below lunar escape speed: fuel −${tp ? tp.loi : '?'}%.`)}
        ${M.failure ? `<div class="verdict bad">✗ ${M.failure}</div>${btn('VIEW MISSION RESULT', 'to-result', { cls: 'warn', primary: true })}` : `${plan}<div class="wait">◌ Braking…</div>`}` };
    }
    const dist = dRow('Mean distance', 'Semi-major axis (mean Earth-Moon distance)', 'orbit');
    const range = dRow('Range', 'Perigee (closest)', 'orbit', v => `${v} (perigee) to ${show('Apogee (farthest)', 'orbit')} (apogee)`);
    const vel = dRow('Moon speed', 'Moon orbit|Mean orbital velocity', 'orbit', v => `${v} around Earth`);
    const delay = dRow('Radio delay', 'One-way light/radio delay at mean distance', 'orbit', v => `${v} one way`);
    if (Game.phase === 'cruise') {
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 2 / 4 · TRANS-LUNAR COAST', 'Lunar Transfer', `Engine off - coasting to the Moon on a ${tp ? tp.name.toLowerCase() : 'transfer'} (${tp ? fmtDuration(tp.hours, true) : ''}). Tracking stations are watching for trouble.`)}
        <div class="data">${dist}${range}${vel}${delay}</div>
        ${factBox()}
        <p class="note">Travel is a stylised animation - not a real orbital-mechanics simulation.</p>
        <div class="wait">◌ In transit…</div>` };
    }
    if (M.failure) {
      return {
        cls: 'right alert', html: `
        ${header('CHECKPOINT 2 / 4 · LUNAR ORBIT INSERTION', 'Mission Lost at the Moon', '')}
        <div class="verdict bad">✗ ${M.failure}</div>
        ${btn('VIEW MISSION RESULT', 'to-result', { cls: 'warn', primary: true })}` };
    }
    const loi = M.log.find(l => l.title === 'Lunar orbit insertion burn');
    const used = M.log.filter(l => l.stage === 'Transfer' && /burn/.test(l.title)).reduce((a, l) => a + l.chips.filter(c => /Fuel/.test(c.t)).reduce((b, c) => b + Number(c.t.replace(/[^0-9]/g, '')), 0), 0);
    return {
      cls: 'right', html: `
      ${header('CHECKPOINT 2 / 4 · LUNAR ORBIT', 'Lunar Orbit Established', 'Braking burn complete. LUNA-01 has been captured by the Moon.')}
      <div class="kvs">
        <div class="kv"><span>Travel time (${tp ? tp.short : ''})</span><b>${tp ? fmtDuration(tp.hours, true) : '—'}</b></div>
        <div class="kv"><span>Propellant used for the transfer</span><b>${used}%</b></div>
        <div class="kv"><span>Fuel remaining</span><b>${M.fuel}%</b></div>
      </div>
      ${insight(`Lunar escape velocity ${show('Escape velocity')}${tag('nasa')} vs Earth's ${show('Earth|Escape velocity', 'orbit')}${tag('nasa')}.`,
        'The Moon\'s weak gravity makes capture cheap compared with leaving Earth - but LUNA-01 must still brake below lunar escape speed.',
        `Orbit insertion burn → ${loi ? chips(loi.chips) : ''}`)}
      ${btn('CHOOSE LUNAR ORBIT', 'to-orbit', { cls: 'go', primary: true })}` };
  };

  P.ORBIT_DECISION = () => {
    if (Game.phase !== 'choose') {
      const done = Game.phase === 'done';
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 2 / 4', ORBITS[M.selectedOrbit].name, done ? 'Orbit established.' : 'Executing orbit adjustment burn…')}
        ${done ? `${chips(M.log.filter(l => l.stage === 'Orbit').flatMap(l => l.chips))}${btn('BEGIN LUNAR SURVEY', 'to-survey', { cls: 'go', primary: true })}` : `${factBox()}<div class="wait">◌ Burning…</div>`}` };
    }
    const reg = region();
    const opts = ['low', 'high'].map((id, k) => {
      const fx = orbitFx(id), allowed = orbitAllowed(id);
      return option({
        id, key: k + 1, name: ORBITS[id].name, desc: ORBITS[id].desc + (id === 'low' && reg.dust > 1.5 ? ' Dusty target: low orbit raises the dust threat.' : ''), chips: fxChips(fx),
        selected: Game.choice === id, disabled: !allowed,
        warn: !allowed ? `Not enough fuel (${M.fuel}% left)` : M.fuel + fx.fuel < RULES.fuelReserve ? `Leaves ${M.fuel + fx.fuel}% fuel - reserve objective missed, +${rk(15)} risk` : powerWarn(fx),
      });
    }).join('');
    return {
      cls: 'right', html: `
      ${header('CHECKPOINT 2 / 4', 'Orbit Decision', `Fuel ${M.fuel}%. Last planned fuel decision - keep ≥ ${RULES.fuelReserve}% in reserve.${reg.fuel ? ` Reaching ${reg.short.toLowerCase()} costs ${reg.fuel}% extra.` : ''}`)}
      ${insight(`Surface pressure ${show('Atmospheric surface pressure')}${tag('nasa')}`,
        'Effectively a vacuum: no air drag, so even a low orbit is possible.',
        'Low orbit = closer, more detailed observations but more correction burns, risk and exposure to lofted dust.')}
      <div class="opts">${opts}</div>
      ${btn(Game.choice ? `CONFIRM ${ORBITS[Game.choice].name.toUpperCase()}` : 'SELECT AN ORBIT', 'confirm', { cls: 'go', primary: true, disabled: !Game.choice })}
      ${sources(['Atmospheric surface pressure', 'Escape velocity'])}` };
  };

  function regionInsight() {
    const reg = region(), I = INSTRUMENTS[M.selectedInstrument], b = instrBonus(I), best = bestInstrument(reg);
    const first = REGION_DATA[reg.id]()[0].replace(/<div class="drow"[^>]*><span class="dl">([^<]*)<\/span><span class="dv">/, '$1: ').replace(/<\/span><\/div>$/, '');
    return insight(first, reg.pitch,
      `${I.name}: <b>${b > 0 ? '+' : b < 0 ? MINUS : '±'}${Math.abs(b)} science</b> per scan here${best.id !== I.id ? ` (best here: ${best.name})` : ' - the best fit for this target'} · science ×${reg.sci} (game modifiers).`);
  }

  P.SURVEY = () => {
    if (Game.phase === 'hazard' || Game.phase === 'hazardDone') return hazardPanel();
    const I = INSTRUMENTS[M.selectedInstrument], reg = region();
    if (Game.phase === 'brief') {
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 3 / 4', `Target: ${reg.name}`, `${reg.site} · ${reg.kind}.`)}
        <div class="data">
          ${REGION_DATA[reg.id]().join('')}
          ${dataRow('Gravity', 'Surface gravity')}
        </div>
        <p class="note">Hover a row for its NASA source. Tags show whether a value is measured, approximate, an estimate, qualitative, derived or a lab simulant.</p>
        ${btn('PLAN OBSERVATION', 'plan', { cls: 'go', primary: true })}
        ${sources(REGION_SOURCES[reg.id].concat([['Surface gravity']]))}` };
    }
    if (Game.phase === 'choose') {
      const opts = Object.values(SCANS).map((s, k) => {
        const fx = scanFx(s.id), b = instrBonus(I);
        return option({
          id: s.id, key: k + 1, name: s.name,
          desc: `Science = ${I.scan} × ${s.mult}${reg.sci !== 1 ? ` × ${reg.sci}` : ''}${b ? ` ${b > 0 ? '+' : MINUS} ${Math.abs(b)} target` : ''}`,
          chips: fxChips(fx), selected: Game.choice === s.id, warn: powerWarn(fx),
        });
      }).join('');
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 3 / 4', 'Observation Plan', `Science ${M.science} so far · goal ${scienceGoal()}. A mid-scan hazard is possible.`)}
        <div class="lbl">YOUR INSTRUMENT: ${I.name.toUpperCase()} <button class="link" data-act="unplan">target data</button></div>
        ${regionInsight()}
        ${powerPlan(`Next: ≈${eventDrain()}% heater load. `)}
        <div class="opts">${opts}</div>
        ${btn(Game.choice ? `START ${SCANS[Game.choice].name.toUpperCase()}` : 'SELECT A SCAN MODE', 'confirm', { cls: 'go', primary: true, disabled: !Game.choice })}` };
    }
    if (Game.phase === 'scanning') {
      return { cls: 'right', html: `${header('CHECKPOINT 3 / 4', SCANS[M.selectedObservation].name, `${I.name} collecting data over ${reg.name}…`)}${factBox()}<div class="wait">◌ Scanning…</div>` };
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
      ${insight(`Night lasts ≈${hd || '?'} Earth days${tag('derived')}; surface drops to ${show('Surface temperature minimum (typical range)')}${tag('nasa')}.`,
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
    const c = M.communication, reg = region();
    if (Game.phase === 'choose') {
      const opts = Object.values(TRANSMISSIONS).map((t, k) => {
        const fx = txFx(t.id);
        const warn = -fx.power > M.power ? 'Not enough power to finish - transmission would be cut off' : powerWarn(fx, true) || (fx.risk ? `Link risk: +${fx.risk}` : '');
        return option({ id: t.id, key: k + 1, name: t.name, desc: t.desc, chips: fxChips(fx), selected: Game.choice === t.id, warn });
      }).join('');
      const far = reg.side === 'far'
        ? dRow('Line of sight', 'Moon orbit|Sidereal rotation period', 'orbit', v => `Rotation ${v} = one orbit (tidal lock), so the far side never sees Earth. Game model: data is stored and relayed from the limb.`)
        : `<div class="drow"><span class="dl">Line of sight</span><span class="dv">Earth in view from ${reg.short.toLowerCase()} (nearside)${tag('game')}</span></div>`;
      return {
        cls: 'right', html: `
        ${header('CHECKPOINT 4 / 4', 'Data Transmission', `${M.science} science onboard. Get it home.`)}
        <div class="data">
          <div class="drow"><span class="dl">Comm capability</span><span class="dv">${c} · ${commLabel(c)}${tag('game')}</span></div>
          ${far}
          ${dRow('Signal delay', 'One-way light/radio delay at mean distance', 'orbit', v => `${v} one way`)}
          <div class="drow"><span class="dl">Risk</span><span class="dv">${M.risk} · ${riskLevel(M.risk)}${M.risk >= RULES.riskHigh ? ' - anomaly expected' : ''}${tag('game')}</span></div>
        </div>
        <p class="note">Comm capability and target location set the power cost. Goal ${scienceGoal()} science with power ≥ ${RULES.healthyPower}% at the end.</p>
        <div class="opts">${opts}</div>
        ${btn(Game.choice ? 'BEGIN DOWNLINK' : 'SELECT A MODE', 'confirm', { cls: 'go', primary: true, disabled: !Game.choice })}` };
    }
    if (Game.phase === 'sending') {
      return { cls: 'right', html: `${header('CHECKPOINT 4 / 4', TRANSMISSIONS[M.selectedTransmission].name, reg.side === 'far' ? 'Far side → store → limb → Earth' : 'Moon → LUNA-01 → Earth')}<div class="wait">◌ Transmitting…</div>` };
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
    <div class="bigsci ${statusCls(M.missionStatus)}"><b>${M.science}</b><span>science returned from ${region().short.toLowerCase()}<br>goal ${scienceGoal()}${M.transmittedFraction < 1 ? ` · only ${Math.round(M.transmittedFraction * 100)}% of the downlink completed` : ''}</span></div>
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
      tile('MISSION STATUS', `<span class="status ${statusCls(st)}">${STATUS_ICON[st]} ${st}</span>`, `${region().name}`, null),
      tile('SCIENCE RETURNED', `${M.science}`, `goal ${scienceGoal()} · collected ${M.collectedScience || M.science}`, M.science >= scienceGoal()),
      tile('POWER REMAINING', `${M.power}%`, `health line ${RULES.healthyPower}%`, !M.failure && M.power >= RULES.healthyPower),
      tile('FUEL REMAINING', `${M.fuel}%`, `reserve target ${RULES.fuelReserve}%`, M.fuel >= RULES.fuelReserve),
      tile('BUDGET USED', `$${M.budgetUsed}M`, `${Math.round(M.budgetUsed / budgetCap() * 100)}% of $${budgetCap()}M cap`, null),
      tile('MISSION RISK', `${riskLevel(M.risk)}`, `risk score ${M.risk} (game model)`, M.risk < RULES.riskHigh),
      tile('HAZARDS', `${M.hazards.length}`, M.hazards.map(h => HAZARDS[h.id].name.split(' ')[h.id === 'seu' ? 1 : 0].toLowerCase()).join(' · ') || 'none', null),
      tile('TRAVEL', M.travel ? M.travel.short : '—', M.travel ? `${fmtDuration(M.travel.hours)} · ${M.travel.fuelTotal}% fuel · ${scenario().name}` : scenario().name, null),
    ].join('');
    const decisions = M.log.map(l => `
      <div class="dec ${l.stage === 'Hazard' ? 'hz' : ''}"><span class="d-stage">${l.stage.toUpperCase()}</span><b>${esc(l.title)}</b>${chips(l.chips)}</div>`).join('');
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
      <p class="note">Every new mission draws a new random condition and new hazards. Tip: ${strat.next} &nbsp;·&nbsp; Budget, power, fuel, science and risk are a <b>simplified game model</b>. Lunar values come from the four NASA datasets (sources shown in-game).</p>` };
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

  const TRACK = ['TARGET', 'DESIGN', 'LAUNCH', 'TRANSFER', 'ORBIT', 'SURVEY', 'DOWNLINK', 'RESULT'];
  const TRANSFER_LABEL = { parking: 'EARTH ORBIT', tli: 'TRANS-LUNAR INJECTION', cruise: 'TRANS-LUNAR COAST', hazard: 'TRANS-LUNAR COAST', hazardDone: 'TRANS-LUNAR COAST', loi: 'LUNAR ORBIT INSERTION', arrived: 'LUNAR ORBIT' };
  const STAGE_INFO = {
    BRIEFING: [-1, 'MISSION BRIEFING'], TARGET: [0, 'CHECKPOINT 1 / 4 · TARGET'],
    DESIGN: [1, 'CHECKPOINT 1 / 4 · MISSION DESIGN'], DESIGN_REVIEW: [1, 'CHECKPOINT 1 / 4 · DESIGN VALIDATION'],
    TRAJECTORY: [2, 'CHECKPOINT 2 / 4 · TRAVEL STRATEGY'], LAUNCH: [2, 'LAUNCH'],
    TRANSFER: () => [3, `CHECKPOINT 2 / 4 · ${TRANSFER_LABEL[Game.phase] || 'LUNAR TRANSFER'}`], ORBIT_DECISION: [4, 'CHECKPOINT 2 / 4 · ORBIT DECISION'],
    SURVEY: [5, 'CHECKPOINT 3 / 4 · LUNAR SURVEY'], MISSION_EVENT: [5, 'CHECKPOINT 3 / 4 · MISSION EVENT'],
    TRANSMISSION: [6, 'CHECKPOINT 4 / 4 · DATA TRANSMISSION'], RESULT: [7, 'MISSION RESULT'], REPORT: [8, 'FINAL REPORT'],
  };
  function tracker() {
    const raw = STAGE_INFO[Game.state];
    const info = typeof raw === 'function' ? raw() : raw;
    const vis = !!info;
    $('hud').classList.toggle('hidden', !vis);
    $('tracker').classList.toggle('hidden', !vis);
    if (!vis) return;
    const [idx, label] = info;
    const tgt = M.region ? `<div class="cond-badge tgt">◎ ${REGIONS[M.region].short}</div>` : '';
    $('tracker').innerHTML = `<ol>${TRACK.map((s, k) => `<li class="${k < idx ? 'done' : k === idx ? 'now' : ''}"><i></i>${s}</li>`).join('')}</ol>${tgt}<div class="cond-badge" title="${scenario().effects.join(' · ')}">${scenario().icon} ${scenario().name.toUpperCase()}</div><div class="stage-label">${label}</div>`;
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
    if (Game.state === 'BRIEFING' || Game.state === 'TARGET') v = { power: null, fuel: null, budget: budgetCap(), science: 0, risk: 0 };
    else if (Game.state === 'DESIGN' || Game.state === 'DESIGN_REVIEW' || Game.state === 'TRAJECTORY') {
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

  return { render, hud, toast, hideToast, setMuteLabel, tickFact, POLL_COUNT };
})();
