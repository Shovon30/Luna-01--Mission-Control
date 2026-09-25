// NASA datasets: loading, parsing and display helpers.
// The CSVs in data/ are the authoritative sources. Values are never altered here;
// only their presentation (thousands separators, superscripts) is formatted.
//
// Datasets (id -> file):
//   moon    - lunar environment (gravity, temperature, water, radiation...)
//   dust    - lunar dust / regolith properties and hazards
//   orbit   - Earth-Moon orbital and Earth reference values
//   regions - non-polar lunar regions (Apollo sites, pits, crust, composition)

const NasaData = (() => {
  const DATASETS = {
    moon: 'moon_environment_dataset.csv',
    dust: 'moon_dust_dataset.csv',
    orbit: 'earth_moon_orbital_dataset.csv',
    regions: 'moon_regions_non_polar_dataset.csv',
  };
  const rows = {};           // id -> row[]
  const index = {};          // id -> Map(key -> row)
  const origin = {};         // id -> 'csv' | 'embedded' | 'none'

  // Minimal RFC-4180 style parser (handles quoted fields, "" escapes, CRLF).
  function parseCSV(text) {
    const records = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
        } else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(f => f.trim() !== '')) records.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(f => f.trim() !== '')) records.push(row);

    const header = records.shift().map(h => h.trim());
    return records.map(r => {
      const obj = {};
      header.forEach((h, i) => { obj[h] = (r[i] || '').trim(); });
      return obj;
    });
  }

  // Confidence label derived from each dataset's own wording.
  function classify(r) {
    const text = `${r.parameter || r.key_feature || ''} ${r.game_note || ''}`.toLowerCase();
    if (/simulant/.test(text)) return 'lab';
    if (/estimate|could be off|low-confidence/.test(text)) return 'estimate';
    if (/^derived/i.test(r.source_name || '') || /^derived/i.test(r.game_note || '')) return 'derived';
    if (/qualitative/.test(text)) return 'qual';
    if (/approx|~/.test(`${r.unit || ''} ${r.value || ''}`.toLowerCase())) return 'approx';
    return 'nasa';
  }

  // Regions rows are keyed "region|key_feature"; the others by parameter.
  const keyOf = (id, r) => (id === 'regions' ? `${r.region}|${r.key_feature}` : r.parameter);

  async function loadOne(id) {
    const file = DATASETS[id];
    let text = null;
    try {
      const res = await fetch('data/' + file, { cache: 'no-store' });
      if (res.ok) { text = await res.text(); origin[id] = 'csv'; }
    } catch (e) { /* file:// or offline: use embedded copy below */ }
    const emb = window.LUNA_EMBEDDED;
    if (!text && emb && typeof emb[file] === 'string') { text = emb[file]; origin[id] = 'embedded'; }
    if (!text) { origin[id] = 'none'; rows[id] = []; index[id] = new Map(); return; }
    rows[id] = parseCSV(text).map(r => Object.assign(r, { confidence: classify(r), dataset: id }));
    // Parameter names repeat across categories in some files (e.g. "Mean orbital velocity" for the
    // Moon and for Earth), so every row is also reachable as "category|parameter". A bare key
    // resolves to its FIRST occurrence.
    const m = new Map();
    for (const r of rows[id]) {
      if (!m.has(keyOf(id, r))) m.set(keyOf(id, r), r);
      if (r.category) m.set(`${r.category}|${r.parameter}`, r);
    }
    index[id] = m;
  }

  async function load() {
    await Promise.all(Object.keys(DATASETS).map(loadOne));
    return count() > 0;
  }

  const get = (key, ds = 'moon') => (index[ds] && index[ds].get(key)) || null;

  // Numeric value (for derived calculations); NaN when not numeric.
  function num(key, ds = 'moon') {
    const r = get(key, ds);
    return r ? Number(r.value) : NaN;
  }

  const SUP = { '-': '⁻', '+': '', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  function fmtValue(v) {
    const sci = /^(-?\d+(?:\.\d+)?)e([+-]?\d+)$/i.exec(v);
    if (sci) {
      const exp = String(Number(sci[2])).split('').map(ch => (ch in SUP ? SUP[ch] : ch)).join('');
      return `${sci[1]} × 10${exp}`;
    }
    if (/^\d{5,}(\.0+)?$/.test(v)) return Number(v).toLocaleString('en-US');
    return v.replace(/(^|[\s(])-(\d)/g, '$1−$2');
  }

  function fmtUnit(u) {
    if (!u || u === '-') return '';
    return u.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/(\d) C\b/g, '$1 °C').replace(/(^|[\s(])-(\d)/g, '$1−$2')
      .replace(/^deg$/, '°').replace(/^C$/, '°C');
  }

  // "1.62 m/s²" etc. Returns fallback text if the row is missing.
  function show(key, ds = 'moon', fallback = 'data unavailable') {
    if (!(ds in DATASETS)) { fallback = ds; ds = 'moon'; }   // show(key, fallback) shorthand
    const r = get(key, ds);
    if (!r) return fallback;
    const u = fmtUnit(r.unit);
    if (!u) return fmtValue(r.value);
    return u === '°' ? `${fmtValue(r.value)}°` : `${fmtValue(r.value)} ${u}`;
  }

  // "0.674°N, 23.473°E" for region rows with coordinates.
  function coords(key) {
    const r = get(key, 'regions');
    if (!r || r.latitude_deg === '' || r.longitude_deg === '') return null;
    const lat = Number(r.latitude_deg), lon = Number(r.longitude_deg);
    return `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? 'E' : 'W'}`;
  }

  const TAGS = {
    nasa: 'NASA DATA',
    approx: 'NASA · APPROX.',
    qual: 'NASA · QUALITATIVE',
    estimate: 'ESTIMATE · UNCERTAIN',
    derived: 'DERIVED FROM NASA',
    lab: 'LAB SIMULANT',
    game: 'GAME MODEL',
  };

  function count() { return Object.values(rows).reduce((n, r) => n + (r ? r.length : 0), 0); }

  return {
    load, get, num, show, coords, fmtValue, fmtUnit, TAGS, DATASETS, count,
    rows: id => rows[id] || [],
    get origin() { const o = Object.values(origin); return o.every(v => v === 'csv') ? 'csv' : o.some(v => v === 'none') ? 'partial' : 'embedded'; },
  };
})();
