// NASA lunar dataset: loading, parsing and display helpers.
// The CSV in data/ is the authoritative source. Values are never altered here;
// only their presentation (thousands separators, superscripts) is formatted.

const NasaData = (() => {
  const CSV_PATH = 'data/moon_environment_dataset.csv';
  const rows = [];
  const byParam = new Map();
  let origin = 'none';

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

  // Confidence label derived from the dataset's own wording.
  function classify(r) {
    const text = (r.parameter + ' ' + r.game_note).toLowerCase();
    if (/estimate|could be off|low-confidence/.test(text)) return 'estimate';
    if (/^derived/i.test(r.source_name) || /^derived/i.test(r.game_note)) return 'derived';
    if (/approx|~/.test((r.unit + ' ' + r.value).toLowerCase())) return 'approx';
    return 'nasa';
  }

  async function load() {
    let text = null;
    try {
      const res = await fetch(CSV_PATH, { cache: 'no-store' });
      if (res.ok) { text = await res.text(); origin = 'csv'; }
    } catch (e) { /* file:// or offline: use embedded copy below */ }
    if (!text && typeof window.LUNA_EMBEDDED_CSV === 'string') {
      text = window.LUNA_EMBEDDED_CSV; origin = 'embedded';
    }
    if (!text) { origin = 'none'; return false; }
    for (const r of parseCSV(text)) {
      r.confidence = classify(r);
      rows.push(r);
      byParam.set(r.parameter, r);
    }
    return true;
  }

  const get = param => byParam.get(param) || null;

  // Numeric value (for derived calculations); NaN when not numeric.
  function num(param) {
    const r = get(param);
    return r ? Number(r.value) : NaN;
  }

  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

  function fmtValue(v) {
    const sci = /^(-?\d+(?:\.\d+)?)e([+-]?\d+)$/i.exec(v);
    if (sci) {
      const exp = String(Number(sci[2])).split('').map(ch => SUP[ch] || ch).join('');
      return `${sci[1]} × 10${exp}`;
    }
    if (/^\d{5,}$/.test(v)) return Number(v).toLocaleString('en-US');
    return v;
  }

  function fmtUnit(u) {
    if (!u || u === '-') return '';
    return u.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/(\d) C\b/g, '$1 °C').replace(/(^|[\s(])-(\d)/g, '$1−$2');
  }

  // "1.62 m/s²" etc. Returns fallback text if the row is missing.
  function show(param, fallback = 'data unavailable') {
    const r = get(param);
    if (!r) return fallback;
    const u = fmtUnit(r.unit);
    return u ? `${fmtValue(r.value)} ${u}` : fmtValue(r.value);
  }

  const TAGS = {
    nasa: 'NASA DATA',
    approx: 'NASA · APPROX.',
    estimate: 'ESTIMATE · UNCERTAIN',
    derived: 'DERIVED FROM NASA',
    game: 'GAME MODEL',
  };

  return {
    load, get, num, show, fmtValue, fmtUnit, TAGS,
    get rows() { return rows; },
    get origin() { return origin; },
  };
})();
