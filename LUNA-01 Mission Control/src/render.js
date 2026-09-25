// Procedural Canvas 2D rendering. Every visual in the game is drawn here by code:
// stars, Earth, Moon, craters, spacecraft, rocket, flames, smoke, beams, pulses.
// Earth and Moon are generated pixel-by-pixel at boot (noise terrain, crater height
// maps, directional lighting, atmospheric limb) for a realistic, non-cartoon look.

const Draw = (() => {
  const W = 1280, H = 720, TAU = Math.PI * 2;
  const COL = {
    cyan: '#7cc7e8', amber: '#e8a54b', green: '#4fc38a', red: '#e5534b', white: '#e6edf3',
    label: 'rgba(150,170,190,0.85)', faint: 'rgba(150,170,190,0.5)',
    font: '"Cascadia Mono","Consolas","Menlo","Courier New",monospace',
  };

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeIn = t => t * t * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // 3D value noise + fBm (sampled on the sphere surface, so no seams or pole pinching).
  function makeNoise(seed) {
    const r = mulberry32(seed), perm = new Uint8Array(512), vals = new Float32Array(256);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    for (let i = 0; i < 256; i++) vals[i] = r();
    const hsh = (x, y, z) => vals[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
    const sm = t => t * t * (3 - 2 * t);
    function n3(x, y, z) {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
      const a = hsh(xi, yi, zi), b = hsh(xi + 1, yi, zi), c = hsh(xi, yi + 1, zi), d = hsh(xi + 1, yi + 1, zi);
      const e = hsh(xi, yi, zi + 1), f = hsh(xi + 1, yi, zi + 1), g = hsh(xi, yi + 1, zi + 1), k = hsh(xi + 1, yi + 1, zi + 1);
      const x1 = a + (b - a) * u, x2 = c + (d - c) * u, x3 = e + (f - e) * u, x4 = g + (k - g) * u;
      const y1 = x1 + (x2 - x1) * v, y2 = x3 + (x4 - x3) * v;
      return y1 + (y2 - y1) * w;
    }
    return (x, y, z, oct = 5) => {
      let s = 0, a = 0.5, f = 1, norm = 0;
      for (let o = 0; o < oct; o++) { s += a * n3(x * f, y * f, z * f); norm += a; a *= 0.5; f *= 2.03; }
      return s / norm;
    };
  }

  // ================================================================ STARS
  let starLayer = null;
  const twinkles = [];
  function buildStars() {
    const c = makeCanvas(W, H), g = c.getContext('2d'), r = mulberry32(7);
    // faint galactic band
    g.save(); g.translate(W / 2, H / 2); g.rotate(-0.35);
    const band = g.createLinearGradient(0, -160, 0, 160);
    band.addColorStop(0, 'rgba(120,130,160,0)'); band.addColorStop(0.5, 'rgba(120,130,160,0.05)'); band.addColorStop(1, 'rgba(120,130,160,0)');
    g.fillStyle = band; g.fillRect(-W, -160, W * 2, 320);
    g.restore();
    for (let i = 0; i < 900; i++) {
      const x = r() * W, y = r() * H, s = r(), tint = r();
      const a = s > 0.985 ? 0.9 : 0.12 + Math.pow(r(), 2) * 0.55;
      const size = s > 0.985 ? 1.6 : s > 0.9 ? 1.1 : 0.7;
      g.fillStyle = tint > 0.93 ? `rgba(255,222,190,${a})` : tint > 0.85 ? `rgba(190,210,255,${a})` : `rgba(235,240,250,${a})`;
      g.fillRect(x, y, size, size);
    }
    starLayer = c;
    for (let i = 0; i < 40; i++) twinkles.push({ x: r() * W, y: r() * H, p: r() * TAU, s: 1 + r() * 0.8, sp: 0.6 + r() * 1.5 });
  }

  function background(ctx, t, drift = 4) {
    const bg = ctx.createRadialGradient(W * 0.4, H * 0.45, 100, W * 0.5, H * 0.5, W * 0.8);
    bg.addColorStop(0, '#060a12'); bg.addColorStop(1, '#020306');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const off = ((t * drift) % W + W) % W;
    ctx.drawImage(starLayer, -off, 0); ctx.drawImage(starLayer, W - off, 0);
    for (const s of twinkles) {
      const a = 0.35 + 0.45 * Math.abs(Math.sin(t * s.sp + s.p));
      const x = ((s.x - off) % W + W) % W;
      ctx.fillStyle = `rgba(240,244,250,${a})`;
      ctx.fillRect(x, s.y, s.s, s.s);
    }
  }

  function grid(ctx, alpha = 0.025) {
    ctx.strokeStyle = `rgba(140,170,200,${alpha})`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 80) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += 80) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
  }

  function text(ctx, str, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || 500} ${o.size || 12}px ${COL.font}`;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
    ctx.fillStyle = o.color || COL.label;
    if (o.glow) { ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 6; }
    if (o.spacing) { try { ctx.letterSpacing = o.spacing + 'px'; } catch (e) { /* older browsers */ } }
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  // Large, thin, letter-spaced status stamp (e.g. LIFTOFF) with a hairline rule.
  function stamp(ctx, str, x, y, color, size = 30, alpha = 1) {
    text(ctx, str, x, y, { align: 'center', size, color, spacing: size * 0.35, weight: 300, alpha, glow: 1 });
    ctx.save(); ctx.globalAlpha = alpha * 0.5; ctx.strokeStyle = color; ctx.lineWidth = 1;
    const w = str.length * size * 0.95;
    ctx.beginPath(); ctx.moveTo(x - w / 2, y + size * 0.85); ctx.lineTo(x + w / 2, y + size * 0.85); ctx.stroke();
    ctx.restore();
  }

  function glow(ctx, x, y, r, color, alpha = 0.5) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('ALPHA', alpha));
    g.addColorStop(1, color.replace('ALPHA', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Light direction for Earth and Moon (upper-left, towards the viewer).
  const LIGHT = (() => { const v = [-0.55, -0.42, 0.72], l = Math.hypot(...v); return v.map(c => c / l); })();

  // ================================================================ ROTATING GLOBES (Moon + Earth)
  // Surfaces are generated once as equirectangular longitude/latitude maps. Every frame they are
  // wrapped onto a sphere through a precomputed per-pixel lookup (latitude row, relative longitude,
  // sunlight), so the surface can spin while the Sun direction stays fixed. The major maria and named
  // craters sit at their (approximate) real positions, so the Apollo sites from the regions CSV land
  // on the right terrain. Views are tilted so the south polar region is visible.
  const D2R = Math.PI / 180, TILT = 15 * D2R;
  const VIEWS = { near: 0, far: 180 };
  const MW = 1024, MH = 512;                 // map size (power-of-two width for fast wrapping)
  const GS = 512;                            // on-screen globe texture size
  let moonMap = null, earthMap = null;

  // Maria [lat, lon, radius deg, strength] - a visual approximation of the real map.
  const MARIA = [
    [32.8, -15.6, 17], [28, 17.5, 10], [8.5, 31.4, 11], [17, 59.1, 8], [-7.8, 51.3, 9], [-15.2, 35.5, 5.5],
    [18, -57, 17], [5, -48, 14], [-5, -30, 10], [-21.3, -16.6, 10], [-24.4, -38.6, 6], [-10, -22, 6],
    [56, -20, 5], [56, 5, 5], [56, 28, 4], [13.3, 3.6, 4], [2, -2, 4], [-1, 12, 4], [21, -30, 6], [40, -45, 7],
    [27.3, 147.9, 3.5], [-19.4, -92.8, 3.5], [-53, -169, 16, 0.3],
  ];
  // Named craters [lat, lon, radius deg (exaggerated for visibility), rays]
  const NAMED_CRATERS = [
    [-43.3, -11.4, 2.4, true], [9.6, -20.1, 2.6, true], [8.1, -38, 1.3, true], [-58.4, -14.4, 3.6, false],
    [51.6, -9.3, 2.0, false], [-11.4, -1.4, 2.0, false], [-13.2, 3.0, 1.7, false], [-84.9, -35.5, 3.2, false],
    [30, 160, 3, false], [-10, 150, 4, false], [15, 175, 3.4, false], [-35, 140, 3, true], [45, -160, 3.5, false],
  ];

  function viewVec(lat, lon, lon0) {       // body lat/lon -> view space (x right, y up, z towards viewer)
    const la = lat * D2R, lo = (lon - lon0) * D2R;
    const xb = Math.cos(la) * Math.sin(lo), yb = Math.sin(la), zb = Math.cos(la) * Math.cos(lo);
    return { x: xb, y: yb * Math.cos(TILT) + zb * Math.sin(TILT), z: zb * Math.cos(TILT) - yb * Math.sin(TILT) };
  }
  // Screen offset in moon radii (y down) for a latitude/longitude in a given (non-spinning) view.
  function project(lat, lon, view = 'near', centreLon) {
    const v = viewVec(lat, lon, centreLon == null ? VIEWS[view] : centreLon);
    return { x: v.x, y: -v.y, z: v.z, visible: v.z > 0 };
  }

  // Texel (px, py) -> unit body vector, cached per row/column.
  const colSin = new Float32Array(MW), colCos = new Float32Array(MW), rowSin = new Float32Array(MH), rowCos = new Float32Array(MH);
  for (let x = 0; x < MW; x++) { const lo = (x + 0.5) / MW * TAU - Math.PI; colSin[x] = Math.sin(lo); colCos[x] = Math.cos(lo); }
  for (let y = 0; y < MH; y++) { const la = Math.PI / 2 - (y + 0.5) / MH * Math.PI; rowSin[y] = Math.sin(la); rowCos[y] = Math.cos(la); }

  function buildMoonMap() {
    const N = MW * MH, rnd = mulberry32(42), fbm = makeNoise(5);
    const hgt = new Float32Array(N), alb = new Float32Array(N);
    const mariaV = MARIA.map(([la, lo, r, s]) => { const c = Math.cos(la * D2R); return [c * Math.sin(lo * D2R), Math.sin(la * D2R), c * Math.cos(lo * D2R), r, s || 1]; });
    // 1. albedo (maria vs highlands) and small-scale relief
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x, bx = rowCos[y] * colSin[x], by = rowSin[y], bz = rowCos[y] * colCos[x];
      let m = 0, pert = -1;
      for (const [mx, my, mz, r, s] of mariaV) {
        const cosd = bx * mx + by * my + bz * mz;
        if (cosd < 0.85) continue;
        if (pert < 0) pert = fbm(bx * 3 + 7, by * 3, bz * 3, 3);
        const dd = Math.acos(Math.min(1, cosd)) / D2R, rr = r * (0.75 + 0.5 * pert);
        m = Math.max(m, s * smooth(rr + 2.5, rr - 2.5, dd));
      }
      const fine = fbm(bx * 14, by * 14, bz * 14, 3), mid = fbm(bx * 4 + 2, by * 4, bz * 4, 3);
      alb[i] = lerp(0.64, 0.3, m) + (fine - 0.5) * 0.1 + (mid - 0.5) * 0.08;
      hgt[i] = (fbm(bx * 7 + 9, by * 7, bz * 7, 4) - 0.5) * 6 * (1 - 0.6 * m);
    }
    // 2. craters (radius in radians); heights in "screen pixel" units of a 320 px-radius globe
    const PX = 320;
    function crater(la, lo, rr, fresh, rays) {
      const cx = Math.cos(la) * Math.sin(lo), cy = Math.sin(la), cz = Math.cos(la) * Math.cos(lo);
      const ext = rr * (rays ? 7 : fresh ? 3 : 1.6), depth = rr * PX * 0.2;
      const y0 = Math.max(0, Math.floor((Math.PI / 2 - la - ext) / Math.PI * MH)), y1 = Math.min(MH - 1, Math.ceil((Math.PI / 2 - la + ext) / Math.PI * MH));
      const cxp = (lo + Math.PI) / TAU * MW, dxp = Math.min(MW / 2, Math.ceil(ext / TAU * MW / Math.max(0.05, Math.cos(la))));
      const ph = rnd() * TAU;
      for (let y = y0; y <= y1; y++) for (let k = -dxp; k <= dxp; k++) {
        const x = ((Math.floor(cxp) + k) % MW + MW) % MW, i = y * MW + x;
        const bx = rowCos[y] * colSin[x], by = rowSin[y], bz = rowCos[y] * colCos[x];
        const q = Math.acos(Math.min(1, bx * cx + by * cy + bz * cz)) / rr;
        if (q > 7) continue;
        if (q < 1) hgt[i] += depth * (q * q * 1.25 - 1);
        else if (q < 1.6) hgt[i] += depth * 0.25 * Math.exp(-Math.pow((q - 1) / 0.22, 2));
        if (fresh && q < 3) alb[i] += 0.1 * Math.exp(-q * 1.2) * (q > 0.9 ? 1 : 0.4);
        if (rays && q > 1 && q < 7) {
          const a = Math.atan2(by - cy, (x - cxp) / MW * TAU * rowCos[y]);
          alb[i] += 0.13 * Math.pow(Math.max(0, Math.cos(a * 7 + ph) * Math.cos(a * 3 - ph)), 6) * Math.exp(-(q - 1) / 2.5);
        }
      }
    }
    for (let k = 0; k < 1500; k++) {
      const rr = (1.3 + Math.pow(rnd(), 8) * 62) / PX;
      const la = Math.asin(2 * rnd() - 1), lo = rnd() * TAU - Math.PI;
      const i = Math.floor((Math.PI / 2 - la) / Math.PI * MH) * MW + Math.floor((lo + Math.PI) / TAU * MW);
      if (Math.cos(lo) > 0 && rnd() < 0.35) continue;                    // the farside is more heavily cratered
      if (rr * PX > 5 && alb[i] < 0.45 && rnd() < 0.75) continue;        // maria are younger: fewer big craters
      crater(la, lo, rr, rnd() < 0.1, false);
    }
    const shadows = [];
    for (const [la, lo, rd, rays] of NAMED_CRATERS) {
      crater(la * D2R, lo * D2R, rd * D2R, rays, rays);
      if (la < -80) shadows.push([la * D2R, lo * D2R, rd * D2R * 0.75]);   // permanently shadowed polar floor
    }
    // 3. bake relief shading (Sun from the upper-left of the disc) into the albedo
    // slope per map texel -> slope per pixel of a 320 px-radius disc, x0.42 relief strength (as before)
    const le = LIGHT[0], ln = -LIGHT[1], lu = LIGHT[2], kS = 0.42 * (MW / TAU) / PX;
    const out = new Float32Array(N);
    for (let y = 1; y < MH - 1; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x, xl = y * MW + ((x + MW - 1) & (MW - 1)), xr = y * MW + ((x + 1) & (MW - 1));
      const gE = (hgt[xr] - hgt[xl]) * 0.5 * kS / Math.max(0.15, rowCos[y]), gN = (hgt[i - MW] - hgt[i + MW]) * 0.5 * kS;
      let shade = (lu - gE * le - gN * ln) / (lu * Math.sqrt(1 + gE * gE + gN * gN));
      let b = clamp(alb[i]) * Math.max(0.15, shade);
      if (rowSin[y] < -0.97) for (const [sla, slo, sr] of shadows) {
        const cosd = rowCos[y] * colSin[x] * Math.cos(sla) * Math.sin(slo) + rowSin[y] * Math.sin(sla) + rowCos[y] * colCos[x] * Math.cos(sla) * Math.cos(slo);
        if (Math.acos(Math.min(1, cosd)) < sr) b *= 0.3;
      }
      out[i] = b;
    }
    for (let x = 0; x < MW; x++) { out[x] = out[MW + x]; out[(MH - 1) * MW + x] = out[(MH - 2) * MW + x]; }
    moonMap = out;
  }

  function buildEarthMap() {
    const land = makeNoise(11), wet = makeNoise(23), cloud = makeNoise(37);
    const N = MW * MH;
    const rgb = new Uint8ClampedArray(N * 3), ocean = new Uint8Array(N), clouds = new Uint8Array(N);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const i = y * MW + x, X = rowCos[y] * colSin[x], Y = -rowSin[y], Z = rowCos[y] * colCos[x];
      const h = land(X * 1.6 + 2, Y * 1.6, Z * 1.6, 6);
      const lat = Math.abs(Y);
      let r, g, b;
      if (h > 0.53) {
        const m = wet(X * 3, Y * 3, Z * 3, 4);
        const desert = smooth(0.2, 0.42, lat) * (1 - smooth(0.45, 0.6, lat)) * smooth(0.45, 0.6, 1 - m);
        const elev = smooth(0.53, 0.75, h);
        r = lerp(46, 150, desert) + elev * 30; g = lerp(84, 124, desert) + elev * 20; b = lerp(42, 78, desert) + elev * 12;
      } else {
        const depth = smooth(0.35, 0.53, h);
        r = lerp(6, 22, depth); g = lerp(26, 78, depth); b = lerp(66, 130, depth);
        ocean[i] = 1;
      }
      if (lat > 0.82) { const ice = smooth(0.82, 0.9, lat); r = lerp(r, 232, ice); g = lerp(g, 238, ice); b = lerp(b, 245, ice); ocean[i] = 0; }
      rgb[i * 3] = r; rgb[i * 3 + 1] = g; rgb[i * 3 + 2] = b;
      clouds[i] = smooth(0.5, 0.72, cloud(X * 2.6 + 7, Y * 3.4, Z * 2.6, 6)) * 0.92 * 255;
    }
    earthMap = { rgb, ocean, clouds };
  }

  // Per-pixel lookup for a sphere seen with the view tilt: map row, relative longitude, sunlight.
  // Built once; every globe canvas shares it.
  function makeLUT(GS) {
    const R = GS / 2, pix = [], [lx, ly, lz] = LIGHT, ct = Math.cos(TILT), st = Math.sin(TILT);
    const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz);
    const rows = [], lonf = [], lamP = [], lam = [], edge = [], spec = [], rim = [];
    for (let py = 0; py < GS; py++) for (let px = 0; px < GS; px++) {
      const nx = (px + 0.5 - R) / R, ny = (py + 0.5 - R) / R, d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2), yv = -ny;
      const yb = yv * ct - nz * st, zb = nz * ct + yv * st;
      const la = Math.asin(Math.max(-1, Math.min(1, yb))), lo = Math.atan2(nx, zb);
      const l = Math.max(0, nx * lx + ny * ly + nz * lz);
      pix.push(py * GS + px);
      rows.push(Math.min(MH - 1, Math.max(0, Math.floor((Math.PI / 2 - la) / Math.PI * MH))) * MW);
      lonf.push(lo / TAU);
      lam.push(l); lamP.push(0.05 + 1.1 * Math.pow(l, 0.85));
      edge.push(clamp((1 - Math.sqrt(d2)) * R * 1.2) * 255);
      spec.push(Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 70) * 170);
      rim.push(Math.pow(1 - nz, 2.5) * (0.25 + l));
    }
    return { pix: Int32Array.from(pix), rows: Int32Array.from(rows), lonf: Float32Array.from(lonf), lam: Float32Array.from(lam), lamP: Float32Array.from(lamP),
      edge: Uint8Array.from(edge), spec: Float32Array.from(spec), rim: Float32Array.from(rim) };
  }
  // Lookups and canvases come in three sizes; each globe uses the smallest that is sharp at its on-screen radius.
  const LUTS = {}, globes = {};
  const globeSize = r => (r <= 50 ? 128 : r <= 110 ? 256 : GS);
  function globe(slot, size) {
    const id = slot + '@' + size;
    if (!LUTS[size]) LUTS[size] = makeLUT(size);
    if (!globes[id]) { const c = makeCanvas(size, size), g = c.getContext('2d'); globes[id] = { canvas: c, g, img: g.createImageData(size, size), key: null, L: LUTS[size] }; }
    return globes[id];
  }

  // Map column offset for a centre longitude (degrees): the texel column under the disc centre.
  const colShift = lonDeg => ((lonDeg + 180) / 360 + 64);

  function renderMoon(slot, lonDeg, size = GS) {
    const G = globe(slot, size), key = Math.round(colShift(lonDeg) * MW);
    if (G.key === key) return G.canvas;                // same orientation as last frame: reuse
    const d = G.img.data, sh = colShift(lonDeg), L = G.L;
    for (let k = 0; k < L.pix.length; k++) {
      const b = moonMap[L.rows[k] + ((((L.lonf[k] + sh) * MW) | 0) & (MW - 1))] * L.lamP[k], o = L.pix[k] * 4;
      d[o] = b * 238; d[o + 1] = b * 232; d[o + 2] = b * 224; d[o + 3] = L.edge[k];
    }
    G.g.putImageData(G.img, 0, 0); G.key = key;
    return G.canvas;
  }

  function renderEarth(slot, lonDeg, cloudLonDeg, size = GS) {
    const G = globe(slot, size), key = Math.round(colShift(lonDeg) * MW) * 1e6 + Math.round(colShift(cloudLonDeg) * MW);
    if (G.key === key) return G.canvas;
    const d = G.img.data, sh = colShift(lonDeg), shc = colShift(cloudLonDeg), { rgb, ocean, clouds } = earthMap, L = G.L;
    for (let k = 0; k < L.pix.length; k++) {
      const ti = L.rows[k] + ((((L.lonf[k] + sh) * MW) | 0) & (MW - 1)), ci = L.rows[k] + ((((L.lonf[k] + shc) * MW) | 0) & (MW - 1));
      const l = L.lam[k], lit = 0.04 + 1.05 * l, sp = ocean[ti] ? L.spec[k] : 0;
      let r = rgb[ti * 3] * lit + sp, g = rgb[ti * 3 + 1] * lit + sp, b = rgb[ti * 3 + 2] * lit + sp;
      const ca = clouds[ci] / 255, cl = 245 * (0.05 + l);
      r += (cl - r) * ca; g += (cl - g) * ca; b += (cl * 1.02 - b) * ca;
      const rim = L.rim[k];
      const o = L.pix[k] * 4;
      d[o] = r + rim * 60; d[o + 1] = g + rim * 120; d[o + 2] = b + rim * 230; d[o + 3] = L.edge[k];
    }
    G.g.putImageData(G.img, 0, 0); G.key = key;
    return G.canvas;
  }

  // ---- spin: Earth turns once per sidereal day, the Moon once per sidereal month (orbital dataset).
  // During the journey the spin follows the mission clock; elsewhere it is a visible time-lapse.
  const EARTH_DAY_H = () => NasaData.num('Earth|Sidereal rotation period', 'orbit') || 23.9345;
  const MOON_DAY_H = () => NasaData.num('Moon orbit|Sidereal rotation period', 'orbit') || 655.72;
  const LAPSE_H = 4;                          // time-lapse: 1 s of play = 4 h (Earth turns in ~6 s, Moon in ~2.7 min)
  const lapseHours = t => t * LAPSE_H;
  const spinCaption = (ctx, x, y, align = 'left') => text(ctx,
    `TIME-LAPSE ×${(LAPSE_H * 3600).toLocaleString('en-US')} · Earth turns once per ${NasaData.show('Earth|Sidereal rotation period', 'orbit')}, Moon once per ${NasaData.show('Moon orbit|Sidereal rotation period', 'orbit')}`,
    x, y, { align, size: 9.5, color: COL.faint });
  // Surface drifts west-to-east (prograde), so the longitude facing us decreases with time.
  const earthLon = h => -360 * h / EARTH_DAY_H();
  const moonLon = h => -360 * h / MOON_DAY_H();

  // night: 0 (lit as rendered) .. 1 (mostly dark). view: 'near' | 'far'.
  // lon: explicit centre longitude (deg) for a spinning Moon; otherwise the fixed view is used.
  function moon(ctx, x, y, r, o = {}) {
    glow(ctx, x, y, r * 1.18, 'rgba(200,210,230,ALPHA)', 0.06);
    const lon = o.lon != null ? o.lon : VIEWS[o.view || 'near'];
    ctx.drawImage(renderMoon(o.slot || (o.view === 'far' ? 'moon:far' : 'moon:a'), lon, globeSize(r * ctx.getTransform().a)), x - r, y - r, r * 2, r * 2);
    if (o.night > 0) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
      const p = lerp(1.1, 0.15, o.night);
      const ng = ctx.createLinearGradient(x - r, y, x + r, y);
      ng.addColorStop(clamp(p - 0.22), 'rgba(2,3,8,0)');
      ng.addColorStop(clamp(p), 'rgba(2,3,8,0.9)');
      ng.addColorStop(1, 'rgba(2,3,8,0.95)');
      ctx.fillStyle = ng; ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  // Current survey target (region lat/lon) in a given view; falls back to the limb for hidden sites.
  const regionView = reg => (reg.side === 'far' ? 'far' : 'near');
  function regionOffset(reg, view) {
    const p = project(reg.lat, reg.lon, view || regionView(reg));
    if (p.visible) return p;
    const d = Math.hypot(p.x, p.y) || 1;                 // behind the limb: pin to the edge
    return { x: p.x / d * 0.97, y: p.y / d * 0.97, z: 0, visible: false };
  }
  const targetPos = (x, y, r, view) => { const p = regionOffset(region(), view); return { x: x + p.x * r, y: y + p.y * r, visible: p.visible }; };

  // Earth with atmosphere halo. h = hours of rotation to show (clouds drift a little faster).
  function earth(ctx, x, y, r, h = 0) {
    const halo = ctx.createRadialGradient(x, y, r * 0.96, x, y, r * 1.12);
    halo.addColorStop(0, 'rgba(90,150,255,0.35)'); halo.addColorStop(1, 'rgba(90,150,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, TAU); ctx.fill();
    ctx.drawImage(renderEarth('earth:a', 60 + earthLon(h), 60 + earthLon(h * 1.08), globeSize(r * ctx.getTransform().a)), x - r, y - r, r * 2, r * 2);
  }

  function targetMarker(ctx, x, y, t, color = COL.amber, size = 1) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    const p = (t * 0.5) % 1;
    ctx.globalAlpha = 0.8 * (1 - p);
    ctx.beginPath(); ctx.arc(x, y, (10 + p * 30) * size, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.95;
    const s = 22 * size, c = 7 * size;
    ctx.beginPath();   // corner brackets
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      ctx.moveTo(x + sx * s, y + sy * (s - c)); ctx.lineTo(x + sx * s, y + sy * s); ctx.lineTo(x + sx * (s - c), y + sy * s);
    }
    ctx.moveTo(x - 5 * size, y); ctx.lineTo(x + 5 * size, y); ctx.moveTo(x, y - 5 * size); ctx.lineTo(x, y + 5 * size);
    ctx.stroke();
    ctx.restore();
  }

  // ================================================================ SPACECRAFT
  // cfg: { power: 'basic'|'highcap'|'battery', instrument: 'camera'|'radiation'|'spectrometer', antenna: px }
  function panel(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#1a2a4a'); g.addColorStop(0.5, '#0f1b33'); g.addColorStop(1, '#162640');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(120,150,200,0.28)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let gx = x + w / 6; gx < x + w - 0.5; gx += w / 6) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); }
    for (let gy = y + h / 3; gy < y + h - 0.5; gy += h / 3) { ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); }
    ctx.stroke();
    ctx.strokeStyle = '#6d7a8c'; ctx.lineWidth = 0.9; ctx.strokeRect(x, y, w, h);
  }

  function spacecraft(ctx, x, y, s, ang, cfg = {}, t = 0, o = {}) {
    const deploy = o.deploy == null ? 1 : o.deploy;
    const pw = cfg.power || 'basic', inst = cfg.instrument || 'camera', dish = cfg.antenna || 10;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);

    // solar arrays
    const P = pw === 'highcap' ? { n: 2, w: 30, h: 22 } : pw === 'battery' ? { n: 1, w: 38, h: 20 } : { n: 1, w: 32, h: 16 };
    for (const side of [-1, 1]) {
      const total = P.n * (P.w + 3) * deploy;
      ctx.strokeStyle = '#8f99a8'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(side * 16, 0); ctx.lineTo(side * (20 + total), 0); ctx.stroke();
      for (let k = 0; k < P.n; k++) {
        const w = P.w * deploy;
        if (w < 1) continue;
        const px = side > 0 ? 22 + k * (w + 3) : -22 - k * (w + 3) - w;
        panel(ctx, px, -P.h / 2, w, P.h);
      }
      if (o.tint && o.tint.power) {
        ctx.strokeStyle = o.tint.power; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2]);
        const px = side > 0 ? 20 : -20 - total - 4;
        ctx.strokeRect(px, -P.h / 2 - 4, total + 4, P.h + 8); ctx.setLineDash([]);
      }
    }

    // high-gain antenna (top)
    ctx.strokeStyle = '#a8b0bc'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, -22); ctx.stroke();
    const dg = ctx.createLinearGradient(-dish, -24, dish, -24);
    dg.addColorStop(0, '#f0f2f5'); dg.addColorStop(1, '#9aa3ae');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.ellipse(0, -24, dish, dish * 0.38, 0, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = '#7d8793'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(0, -24, dish, dish * 0.38, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -24 - dish * 0.7); ctx.stroke();

    // bus (gold multilayer insulation, crinkled)
    const g = ctx.createLinearGradient(-16, -15, 16, 15);
    g.addColorStop(0, '#d8b25e'); g.addColorStop(0.45, '#a67c33'); g.addColorStop(0.55, '#b98c3c'); g.addColorStop(1, '#5e4318');
    ctx.fillStyle = g; ctx.fillRect(-16, -15, 32, 30);
    ctx.strokeStyle = 'rgba(255,236,190,0.28)'; ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(-14, -9); ctx.lineTo(-6, -12); ctx.lineTo(2, -7); ctx.lineTo(9, -11); ctx.lineTo(15, -6);
    ctx.moveTo(-15, 2); ctx.lineTo(-7, -1); ctx.lineTo(0, 4); ctx.lineTo(8, 1); ctx.lineTo(15, 6);
    ctx.moveTo(-12, 10); ctx.lineTo(-3, 8); ctx.lineTo(6, 12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(4, -15, 12, 30);   // shadowed face
    ctx.strokeStyle = '#3d2c10'; ctx.lineWidth = 0.8; ctx.strokeRect(-16, -15, 32, 30);
    if (o.tint && o.tint.mass) { ctx.strokeStyle = o.tint.mass; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2]); ctx.strokeRect(-20, -19, 40, 38); ctx.setLineDash([]); }

    if (pw === 'battery') {
      ctx.fillStyle = '#2a2f38'; ctx.fillRect(-13, 15, 13, 7);
      ctx.fillStyle = '#4fc38a'; ctx.fillRect(-11, 17.5, 1.5, 1.5);
    }

    if (inst === 'camera') {
      ctx.fillStyle = '#2d3139'; ctx.fillRect(2, 15, 10, 9);
      ctx.fillStyle = '#10151c'; ctx.beginPath(); ctx.arc(7, 26, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(140,180,220,0.5)'; ctx.beginPath(); ctx.arc(6, 25, 1.2, 0, TAU); ctx.fill();
    } else if (inst === 'spectrometer') {
      ctx.fillStyle = '#c9ced6'; ctx.fillRect(0, 15, 14, 10);
      ctx.fillStyle = '#23272e'; ctx.fillRect(2, 21, 10, 1.4);
      ctx.fillStyle = '#8f98a5'; ctx.fillRect(0, 15, 14, 1.5);
    } else {
      ctx.strokeStyle = '#a8b0bc'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(8, 15); ctx.lineTo(16, 30); ctx.stroke();
      ctx.fillStyle = '#d4d8de'; ctx.beginPath(); ctx.arc(16, 31, 3.2, 0, TAU); ctx.fill();
      ctx.fillStyle = '#20252c'; ctx.beginPath(); ctx.arc(16, 31, 1.3, 0, TAU); ctx.fill();
    }

    // protection kit hardware
    const kit = cfg.kit;
    if (kit === 'shield') {                  // Whipple bumper plate ahead of the bus
      ctx.fillStyle = '#8d949e'; ctx.fillRect(-24, -17, 3, 34);
      ctx.strokeStyle = '#5b626c'; ctx.lineWidth = 0.6; ctx.strokeRect(-24, -17, 3, 34);
      ctx.strokeStyle = '#a8b0bc'; ctx.beginPath(); ctx.moveTo(-21, -12); ctx.lineTo(-16, -12); ctx.moveTo(-21, 12); ctx.lineTo(-16, 12); ctx.stroke();
    } else if (kit === 'tank') {             // spare spherical propellant tank
      const tg = ctx.createRadialGradient(11, 20, 1, 13, 22, 7);
      tg.addColorStop(0, '#e7eaee'); tg.addColorStop(1, '#6f7680');
      ctx.fillStyle = tg; ctx.beginPath(); ctx.arc(-6, 21, 6, 0, TAU); ctx.fill();
    } else if (kit === 'hardening') {        // shielded avionics vault
      ctx.fillStyle = '#3b4250'; ctx.fillRect(-10, -15, 12, 6);
      ctx.strokeStyle = '#9aa3b0'; ctx.lineWidth = 0.6; ctx.strokeRect(-10, -15, 12, 6);
    } else if (kit === 'dustcover') {        // hinged covers over the optics
      ctx.strokeStyle = '#c9ced6'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-1, 15); ctx.lineTo(-4, 26); ctx.moveTo(15, 15); ctx.lineTo(18, 26); ctx.stroke();
    }

    // thruster nozzle + nav lights
    ctx.fillStyle = '#4f5663';
    ctx.beginPath(); ctx.moveTo(-16, -4); ctx.lineTo(-22, -6); ctx.lineTo(-22, 6); ctx.lineTo(-16, 4); ctx.closePath(); ctx.fill();
    if (o.thrust) {
      const k = o.thrust === true ? 1 : o.thrust;          // 1 = trim thruster, 2-3 = main engine burn
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fl = (12 + Math.random() * 5) * k, fw = 4 + (k - 1) * 2;
      const fg = ctx.createLinearGradient(-22, 0, -22 - fl, 0);
      fg.addColorStop(0, 'rgba(235,245,255,0.95)'); fg.addColorStop(0.3, 'rgba(170,205,255,0.8)'); fg.addColorStop(1, 'rgba(120,160,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(-22, -fw); ctx.lineTo(-22 - fl, 0); ctx.lineTo(-22, fw); ctx.fill();
      if (k > 1) glow(ctx, -24, 0, 10 * k, 'rgba(160,200,255,ALPHA)', 0.35);
      ctx.restore();
    }
    const blink = (t * 1.2) % 1 < 0.08;
    ctx.fillStyle = blink ? '#ff5a4a' : '#40201c'; ctx.fillRect(-17, -16, 1.8, 1.8);
    ctx.fillStyle = blink ? '#6dffa6' : '#1c3a28'; ctx.fillRect(15, -16, 1.8, 1.8);
    ctx.restore();
  }

  const craftCfg = () => {
    const sel = Game.sel;
    const r = ROCKETS[M.selectedRocket || sel.rocket];
    return {
      power: M.selectedPowerSystem || sel.power || 'basic',
      instrument: M.selectedInstrument || sel.instrument || 'camera',
      antenna: r ? r.antennaSize : 10,
      kit: M.selectedKit || sel.kit,
    };
  };

  // ================================================================ ROCKET
  // Exhaust plume: bright core, shock diamonds, soft outer flame.
  function flame(ctx, len, w, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const L = len * (0.92 + Math.random() * 0.16);
    const outer = ctx.createLinearGradient(0, 0, 0, L);
    outer.addColorStop(0, 'rgba(255,190,110,0.9)'); outer.addColorStop(0.35, 'rgba(255,120,40,0.55)'); outer.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = outer;
    ctx.beginPath(); ctx.moveTo(-w * 0.5, 0);
    ctx.bezierCurveTo(-w * 0.9, L * 0.3, -w * 0.4, L * 0.8, 0, L);
    ctx.bezierCurveTo(w * 0.4, L * 0.8, w * 0.9, L * 0.3, w * 0.5, 0);
    ctx.fill();
    const core = ctx.createLinearGradient(0, 0, 0, L * 0.45);
    core.addColorStop(0, 'rgba(255,255,245,1)'); core.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.moveTo(-w * 0.3, 0); ctx.quadraticCurveTo(0, L * 0.6, w * 0.3, 0); ctx.fill();
    for (let k = 1; k <= 3; k++) {  // shock diamonds
      const dy = L * 0.13 * k, dw = w * (0.22 - k * 0.04);
      ctx.fillStyle = `rgba(255,245,220,${0.5 - k * 0.12})`;
      ctx.beginPath(); ctx.moveTo(0, dy - 4); ctx.lineTo(dw, dy); ctx.lineTo(0, dy + 4); ctx.lineTo(-dw, dy); ctx.fill();
    }
    glow(ctx, 0, L * 0.15, L * 0.8, 'rgba(255,150,70,ALPHA)', 0.3);
    ctx.restore();
  }

  // (x, y) = base of the engine bell
  function rocket(ctx, x, y, s, type, t, thrust = 0) {
    const h = type === 'heavy' ? 150 : type === 'medium' ? 132 : 112, w = type === 'light' ? 15 : 19;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (thrust > 0) {
      ctx.save(); ctx.translate(0, 5); flame(ctx, 60 * thrust + 25, w * 1.2, t); ctx.restore();
      if (type === 'heavy') for (const sx of [-16, 16]) { ctx.save(); ctx.translate(sx, 3); flame(ctx, 46 * thrust + 18, 10, t); ctx.restore(); }
    }
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, '#7b828c'); body.addColorStop(0.3, '#eef0f2'); body.addColorStop(0.55, '#d7dade'); body.addColorStop(1, '#6d737c');
    if (type === 'heavy') {
      for (const sx of [-16, 16]) {
        ctx.fillStyle = body; ctx.fillRect(sx - 5, -88, 10, 88);
        ctx.beginPath(); ctx.moveTo(sx - 5, -88); ctx.quadraticCurveTo(sx - 4, -100, sx, -103); ctx.quadraticCurveTo(sx + 4, -100, sx + 5, -88); ctx.fill();
        ctx.fillStyle = '#2a2e35'; ctx.fillRect(sx - 4, 0, 8, 4);
      }
    }
    ctx.fillStyle = '#2a2e35';
    ctx.beginPath(); ctx.moveTo(-w * 0.32, 0); ctx.lineTo(-w * 0.46, 7); ctx.lineTo(w * 0.46, 7); ctx.lineTo(w * 0.32, 0); ctx.fill();
    ctx.fillStyle = body; ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = '#23272d';                          // interstage + roll pattern
    ctx.fillRect(-w / 2, -h * 0.62, w, 6);
    ctx.fillRect(-w / 2, -h * 0.18, w / 2, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(-w / 2, -h * 0.9, w, 1);
    ctx.fillStyle = body;                               // payload fairing
    ctx.beginPath(); ctx.moveTo(-w / 2, -h); ctx.bezierCurveTo(-w / 2, -h - w * 1.1, -w * 0.15, -h - w * 1.8, 0, -h - w * 1.9);
    ctx.bezierCurveTo(w * 0.15, -h - w * 1.8, w / 2, -h - w * 1.1, w / 2, -h); ctx.fill();
    ctx.fillStyle = '#23272d';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * w / 2, -20); ctx.lineTo(side * (w / 2 + 6), -2); ctx.lineTo(side * w / 2, -3); ctx.fill();
    }
    ctx.restore();
  }

  // ================================================================ PARTICLES
  const parts = [];
  function emit(p) { if (parts.length < 600) parts.push(Object.assign({ life: 1, max: 1, size: 2, grow: 0, drag: 1, add: true, color: '255,200,120' }, p)); }
  function updateParticles(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt;
      if (p.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt; p.y += p.vy * dt; p.size += p.grow * dt;
    }
  }
  function drawParticles(ctx, offY = 0) {
    for (const p of parts) {
      const a = clamp(p.life / p.max);
      ctx.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      if (p.soft) {
        const gr = ctx.createRadialGradient(p.x, p.y + offY, 0, p.x, p.y + offY, p.size);
        gr.addColorStop(0, `rgba(${p.color},${a * (p.alpha || 1)})`); gr.addColorStop(1, `rgba(${p.color},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(p.x - p.size, p.y + offY - p.size, p.size * 2, p.size * 2);
      } else {
        ctx.fillStyle = `rgba(${p.color},${a * (p.alpha || 1)})`;
        ctx.beginPath(); ctx.arc(p.x, p.y + offY, Math.max(0.3, p.size), 0, TAU); ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function clearParticles() { parts.length = 0; }

  function burst(x, y, n, color, speed = 120, life = 1.2) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 1 + Math.random() * 1.2, drag: 0.96, color });
    }
  }

  // ================================================================ PATHS
  const qb = (p0, p1, p2, t) => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });

  function route(ctx, p0, p1, p2, t, progress = 1, color = COL.cyan, dashed = true) {
    ctx.save();
    ctx.strokeStyle = 'rgba(150,175,200,0.28)'; ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]); ctx.lineDashOffset = -t * 12;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y); ctx.stroke();
    if (progress > 0) {
      ctx.setLineDash(dashed ? [] : [8, 6]);
      ctx.strokeStyle = color; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      const n = 48;
      for (let k = 1; k <= n * progress; k++) { const q = qb(p0, p1, p2, k / n); ctx.lineTo(q.x, q.y); }
      const e = qb(p0, p1, p2, progress); ctx.lineTo(e.x, e.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Ellipse orbit split into back/front halves so the Moon can occlude the back.
  function orbitHalf(ctx, cx, cy, rx, ry, rot, front, color, width, alpha) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha;
    ctx.setLineDash(front ? [] : [3, 5]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.stroke();
    ctx.restore();
  }
  const onEllipse = (cx, cy, rx, ry, rot, th) => {
    const ex = rx * Math.cos(th), ey = ry * Math.sin(th);
    return { x: cx + ex * Math.cos(rot) - ey * Math.sin(rot), y: cy + ex * Math.sin(rot) + ey * Math.cos(rot), front: Math.sin(th) > 0 };
  };

  // Small label with a leader tick, used for scene annotations.
  function tag(ctx, str, x, y, color = COL.label, align = 'left') {
    text(ctx, str, x, y, { size: 10.5, color, spacing: 1.5, align });
  }

  // ================================================================ HAZARD VISUALS
  // Progress clocks pause while a hazard is being handled.
  function progressT(phase) {
    if (Game.phase === phase) return Game.phaseT;
    if (Game.hazard && Game.hazard.resume && Game.hazard.resume.phase === phase) return Game.hazard.resume.phaseT;
    return 0;
  }
  const evading = () => !!(Game.hazard && Game.hazard.opt === 'evade' && Game.t - Game.hazard.tDone < 1.6);
  const ROCKS = (() => { const r = mulberry32(3), out = []; for (let k = 0; k < 7; k++) out.push({ off: r(), spread: (r() - 0.5) * 0.5, size: 3 + r() * 5, spin: (r() - 0.5) * 4, pts: Array.from({ length: 7 }, () => 0.7 + r() * 0.5) }); return out; })();
  let lastCraft = { x: 400, y: 360 };

  function rock(ctx, x, y, s, rot, pts) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    const g = ctx.createLinearGradient(-s, -s, s, s);
    g.addColorStop(0, '#9a9086'); g.addColorStop(1, '#3f3a35');
    ctx.fillStyle = g; ctx.beginPath();
    pts.forEach((k, i) => { const a = i / pts.length * TAU; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * s * k, Math.sin(a) * s * k); });
    ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function hazardFx(ctx, t, cx, cy, bannerY = 186) {
    lastCraft = { x: cx, y: cy };
    const hz = Game.hazard;
    if (!hz) return;
    const since = t - hz.t0, active = !hz.done, after = hz.done ? t - hz.tDone : 0;
    const fade = active ? 1 : clamp(1 - after / 2.2);
    if (fade <= 0) return;
    ctx.save();
    if (hz.id === 'meteoroid') {
      const miss = hz.done && (hz.opt === 'evade' || hz.opt === 'kit' || hz.outcome === 'lucky');
      for (const r of ROCKS) {
        const dir = -0.55 + r.spread;
        const travel = active ? ((since * 0.18 + r.off) % 1) : 1 + after * 0.6;
        const dist = active ? lerp(520, 70, travel) : miss ? -after * 400 - r.off * 60 : 60 - after * 300;
        const x = cx + Math.cos(dir) * dist + (miss ? 60 + r.off * 40 : 0), y = cy + Math.sin(dir) * dist;
        ctx.globalAlpha = fade;
        const tg = ctx.createLinearGradient(x, y, x + Math.cos(dir) * 60, y + Math.sin(dir) * 60);
        tg.addColorStop(0, 'rgba(255,200,150,0.5)'); tg.addColorStop(1, 'rgba(255,200,150,0)');
        ctx.strokeStyle = tg; ctx.lineWidth = r.size * 0.8;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(dir) * 60, y + Math.sin(dir) * 60); ctx.stroke();
        rock(ctx, x, y, r.size, t * r.spin, r.pts);
      }
      if (active) {
        ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(t * 6));
        ctx.strokeStyle = COL.red; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(-0.55) * 420, cy + Math.sin(-0.55) * 420); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeRect(cx - 34, cy - 34, 68, 68);
        text(ctx, `IMPACT T−${Math.max(0, 90 - Math.floor(since * 4))} s`, cx - 34, cy - 44, { size: 10, color: COL.red, spacing: 1.5, weight: 700 });
      }
    } else if (hz.id === 'leak') {
      const n = active ? 3 : hz.outcome === 'unlucky' ? 4 : 0;
      for (let k = 0; k < n * fade; k++) emit({ x: cx + 18, y: cy + 6, vx: 120 + Math.random() * 90, vy: 30 + (Math.random() - 0.5) * 70, life: 1.1, max: 1.1, size: 2, grow: 7, drag: 0.97, add: false, soft: true, alpha: 0.6, color: '220,235,245' });
      if (active) text(ctx, 'TANK B PRESSURE ↓', cx + 30, cy - 30, { size: 10, color: COL.amber, spacing: 1.5, weight: 700, alpha: 0.6 + 0.4 * Math.abs(Math.sin(t * 5)) });
    } else if (hz.id === 'seu') {
      ctx.globalAlpha = fade;
      for (let k = 0; k < 5; k++) { ctx.fillStyle = `rgba(229,83,75,${Math.random() * 0.12})`; ctx.fillRect(0, Math.random() * H, 800, 1 + Math.random() * 4); }
      if (active) {
        ctx.fillStyle = `rgba(229,83,75,${0.25 + 0.25 * Math.abs(Math.sin(t * 8))})`;
        ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU); ctx.fill();
        text(ctx, 'SAFE MODE', cx, cy - 40, { size: 11, color: COL.red, spacing: 3, weight: 700, align: 'center' });
      }
    } else if (hz.id === 'flare') {
      const flick = 0.85 + 0.15 * Math.sin(t * 13);
      const g = ctx.createRadialGradient(-40, 60, 10, -40, 60, 820);
      g.addColorStop(0, `rgba(255,236,200,${0.75 * fade * flick})`); g.addColorStop(0.18, `rgba(255,190,110,${0.3 * fade})`); g.addColorStop(0.6, `rgba(255,150,80,${0.08 * fade})`); g.addColorStop(1, 'rgba(255,150,80,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 800, H);
      ctx.strokeStyle = `rgba(255,220,170,${0.25 * fade})`; ctx.lineWidth = 1;   // proton streaks
      for (let k = 0; k < 40 * fade; k++) {
        const x = Math.random() * 800, y = 90 + Math.random() * (H - 90);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 7); ctx.stroke();
      }
      ctx.fillStyle = `rgba(255,245,230,${0.9 * fade})`;
      for (let k = 0; k < 50 * fade; k++) ctx.fillRect(Math.random() * 800, 90 + Math.random() * (H - 90), 1.6, 1.6);
    } else if (hz.id === 'dust') {
      for (let k = 0; k < 2 * fade; k++) {
        const a = Math.random() * TAU, d = 20 + Math.random() * 60;
        emit({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, vx: -Math.sin(a) * 30, vy: Math.cos(a) * 30 - 5, life: 1.6, max: 1.6, size: 1.2 + Math.random() * 1.5, add: false, alpha: 0.7, color: '170,150,125' });
      }
      ctx.globalAlpha = 0.25 * fade; ctx.fillStyle = '#6b5d4a';
      ctx.beginPath(); ctx.arc(cx, cy, 55, 0, TAU); ctx.fill();
    }
    ctx.restore();
    if (active) {
      const pulse = Math.abs(Math.sin(t * 4));
      ctx.fillStyle = `rgba(229,83,75,${0.5 + 0.5 * pulse})`; ctx.fillRect(40, bannerY - 4, 8, 8);
      text(ctx, `HAZARD · ${HAZARDS[hz.id].name.toUpperCase()}`, 58, bannerY, { size: 12, color: COL.red, spacing: 2, weight: 700 });
    }
  }

  // Impact sparks at the spacecraft (called when a hazard hits).
  function impact(color = '255,200,140') { burst(lastCraft.x, lastCraft.y, 40, color, 160, 0.9); }
  // Camera shake applied to hazard scenes.
  function hazardShake(ctx, t) {
    const hz = Game.hazard;
    if (!hz) return;
    let a = hz.done ? 0 : clamp(1 - (t - hz.t0) / 0.8) * 5;
    if (hz.done && hz.hit) a = Math.max(a, clamp(1 - (t - hz.tDone) / 0.7) * 9);
    if (a > 0) ctx.translate((Math.random() - 0.5) * 2 * a, (Math.random() - 0.5) * 2 * a);
  }

  // ================================================================ SCENES
  const S = {};

  S.TITLE = (ctx, t) => {
    background(ctx, t, 2);
    const lh = lapseHours(t);
    earth(ctx, 150, 130, 40, lh);
    const mx = 930, my = 420, mr = 230, rot = -0.28;
    const p = onEllipse(mx, my, 320, 70, rot, t * 0.3);
    orbitHalf(ctx, mx, my, 320, 70, rot, false, COL.cyan, 0.8, 0.3);
    if (!p.front) spacecraft(ctx, p.x, p.y, 0.6, Math.sin(t) * 0.1, craftCfg(), t);
    moon(ctx, mx, my, mr, { lon: moonLon(lh) });
    orbitHalf(ctx, mx, my, 320, 70, rot, true, COL.cyan, 1, 0.5);
    if (p.front) spacecraft(ctx, p.x, p.y, 1, Math.sin(t) * 0.1, craftCfg(), t);
  };

  // Briefing: the Moon circles Earth on a (tilted, not-to-scale) orbit. Both spin on the same time-lapse
  // clock; because the Moon's rotation period equals its orbital period, the same face keeps pointing at Earth.
  const BRIEF = { e: { x: 390, y: 400, r: 82 }, rx: 318, ry: 112, mr: 46 };
  S.BRIEFING = (ctx, t) => {
    background(ctx, t, 2); grid(ctx);
    const E = BRIEF.e;
    const th = 0.55 - TAU * lapseHours(Game.sceneT) / MOON_DAY_H();   // orbital angle; starts front-right, moves prograde
    const d = Math.sin(th), k = 1 + 0.12 * d;                  // d > 0: in front of Earth (closer to us)
    const mx = E.x + Math.cos(th) * BRIEF.rx, my = E.y + d * BRIEF.ry, mr = BRIEF.mr * k;
    const faceLon = th / D2R + 90;                             // longitude facing the viewer: near side toward Earth
    const orbit = front => {
      ctx.save(); ctx.strokeStyle = COL.cyan; ctx.globalAlpha = front ? 0.45 : 0.2; ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.ellipse(E.x, E.y, BRIEF.rx, BRIEF.ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); ctx.stroke(); ctx.restore();
    };
    const drawMoon = () => {
      moon(ctx, mx, my, mr, { lon: faceLon });
      for (const reg of Object.values(REGIONS)) {
        const p = project(reg.lat, reg.lon, 'near', faceLon);
        if (!p.visible) continue;
        ctx.fillStyle = `rgba(232,165,75,${0.5 + 0.4 * Math.sin(t * 3 + reg.lat)})`;
        ctx.fillRect(mx + p.x * mr - 1.5, my + p.y * mr - 1.5, 3, 3);
      }
    };
    orbit(false);
    if (d < 0) drawMoon();
    earth(ctx, E.x, E.y, E.r, lapseHours(t));
    // LUNA-01 waiting in its parking orbit
    const pa = t * 0.9, pf = Math.sin(pa) > 0;
    const craft = () => spacecraft(ctx, E.x + Math.cos(pa) * 118, E.y + Math.sin(pa) * 30, 0.4, 0, craftCfg(), t);
    if (!pf) craft();
    ctx.save(); ctx.beginPath(); ctx.ellipse(E.x, E.y, 118, 30, 0, 0, TAU); ctx.strokeStyle = 'rgba(80,200,230,0.18)'; ctx.stroke(); ctx.restore();
    if (pf) craft();
    orbit(true);
    if (d >= 0) drawMoon();
    tag(ctx, 'EARTH', E.x, E.y + E.r + 50, COL.label, 'center');
    tag(ctx, 'MOON', mx, my + mr + 18, COL.label, 'center');
    tag(ctx, 'SURVEY TARGET · YOUR CHOICE', mx, my - mr - 12, COL.amber, 'center');
    tag(ctx, `MEAN DISTANCE ${NasaData.show('Mean distance from Earth (semi-major axis)', '')} · ORBIT ${NasaData.show('Moon orbit|Sidereal revolution period', 'orbit')}`, E.x, 640, COL.faint, 'center');
    text(ctx, 'Tidally locked: the Moon spins once per orbit, so the same face always points at Earth', E.x, 660, { align: 'center', size: 10, color: COL.label });
    spinCaption(ctx, E.x, 678, 'center');
    text(ctx, 'Orbit drawn tilted and not to scale', E.x, 694, { align: 'center', size: 9.5, color: COL.faint });
  };

  // Target selection: nearside globe with the candidate regions and the Apollo landing sites
  // (coordinates from the regions CSV), plus a farside inset.
  const TG = { x: 330, y: 400, r: 245, fx: 700, fy: 590, fr: 70 };
  S.TARGET = (ctx, t) => {
    background(ctx, t, 1); grid(ctx, 0.022);
    moon(ctx, TG.x, TG.y, TG.r);
    moon(ctx, TG.fx, TG.fy, TG.fr, { view: 'far' });
    tag(ctx, 'NEARSIDE · ALWAYS FACES EARTH', TG.x, TG.y - TG.r - 14, COL.label, 'center');
    tag(ctx, 'FARSIDE', TG.fx, TG.fy - TG.fr - 12, COL.label, 'center');
    text(ctx, 'never visible from Earth', TG.fx, TG.fy + TG.fr + 12, { align: 'center', size: 9, color: COL.faint });
    const taken = new Set(Object.values(REGIONS).map(r => r.dataKey).filter(Boolean));
    for (const row of NasaData.rows('regions')) {
      if (row.latitude_deg === '' || taken.has(`${row.region}|${row.key_feature}`)) continue;
      const p = project(Number(row.latitude_deg), Number(row.longitude_deg), 'near');
      const x = TG.x + p.x * TG.r, y = TG.y + p.y * TG.r;
      ctx.strokeStyle = 'rgba(200,215,230,0.6)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.stroke();
      const n = Number((row.region.match(/Apollo (\d+)/) || [])[1] || 0);
      const westOf = n === 12;               // Apollo 12 and 14 are close together: label them on opposite sides
      text(ctx, row.region.split(' - ')[0].toUpperCase(), westOf ? x - 6 : x + 6, n % 2 ? y - 7 : y + 9, { size: 8.5, color: 'rgba(200,215,230,0.55)', spacing: 1, align: westOf ? 'right' : 'left' });
    }
    const active = Game.preview || M.region;
    for (const reg of Object.values(REGIONS)) {
      const far = reg.side === 'far';
      const c = far ? { x: TG.fx, y: TG.fy, r: TG.fr } : { x: TG.x, y: TG.y, r: TG.r };
      const p = project(reg.lat, reg.lon, far ? 'far' : 'near');
      const x = c.x + p.x * c.r, y = c.y + p.y * c.r, on = reg.id === active;
      if (on) targetMarker(ctx, x, y, t, COL.amber, far ? 0.55 : 0.8);
      else { ctx.strokeStyle = 'rgba(232,165,75,0.75)'; ctx.lineWidth = 1; ctx.strokeRect(x - 5, y - 5, 10, 10); }
      const left = !far && p.x < -0.2, below = !far && p.y > 0.75;
      const lx = far ? c.x - c.r - 10 : left ? x - 16 : x + 16, ly = far ? c.y - 4 : below ? y + 22 : y - 12;
      text(ctx, reg.short, lx, ly, { size: 10.5, color: on ? COL.amber : 'rgba(232,165,75,0.8)', spacing: 1.5, align: far || left ? 'right' : 'left', weight: on ? 700 : 500, glow: 1 });
    }
    text(ctx, 'Apollo landing sites: NASA NSSDCA coordinates (regions dataset)', 40, 700, { size: 9.5, color: COL.faint });
  };

  function designCraft(ctx, t, x, y, tint) {
    ctx.save();
    ctx.strokeStyle = 'rgba(140,170,200,0.12)'; ctx.lineWidth = 1;
    for (const rr of [90, 150, 210]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(x - 240, y); ctx.lineTo(x + 240, y); ctx.moveTo(x, y - 230); ctx.lineTo(x, y + 230); ctx.stroke();
    ctx.setLineDash([]);
    for (let a = 0; a < 360; a += 10) {   // compass ticks
      const r0 = a % 30 ? 206 : 200, ra = a * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(ra) * r0, y + Math.sin(ra) * r0); ctx.lineTo(x + Math.cos(ra) * 210, y + Math.sin(ra) * 210); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(124,199,232,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, 210, t * 0.3, t * 0.3 + 0.4); ctx.stroke();
    ctx.restore();
    spacecraft(ctx, x, y + Math.sin(t * 1.1) * 3, 3, Math.sin(t * 0.4) * 0.05, craftCfg(), t, { tint });
  }

  function callout(ctx, x1, y1, x2, y2, label, value, color = COL.white) {
    ctx.save();
    ctx.strokeStyle = 'rgba(150,175,200,0.55)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2 + (x2 > x1 ? 18 : -18), y2); ctx.stroke();
    ctx.fillStyle = COL.cyan; ctx.fillRect(x1 - 2, y1 - 2, 4, 4);
    ctx.restore();
    const ax = x2 + (x2 > x1 ? 22 : -22), al = x2 > x1 ? 'left' : 'right';
    text(ctx, label, ax, y2 - 8, { align: al, size: 9.5, color: COL.faint, spacing: 2 });
    text(ctx, value, ax, y2 + 7, { align: al, size: 12.5, color });
  }

  S.DESIGN = (ctx, t) => {
    background(ctx, t, 1); grid(ctx, 0.03);
    const x = 280, y = 390, sel = Game.sel;
    designCraft(ctx, t, x, y);
    tag(ctx, 'SPACECRAFT CONFIGURATION · LUNA-01', 40, 104, COL.label);
    const P = POWER_SYSTEMS[sel.power], I = INSTRUMENTS[sel.instrument], R = ROCKETS[sel.rocket];
    callout(ctx, x - 100, y, 205, 190, 'POWER', P ? P.name.toUpperCase() : 'NOT SELECTED', P ? COL.white : COL.amber);
    callout(ctx, x, y - 90, 320, 170, 'ANTENNA', R ? R.antenna.toUpperCase() : 'SET BY ROCKET', R ? COL.white : COL.amber);
    callout(ctx, x + 30, y + 80, 330, 590, 'INSTRUMENT', I ? I.name.toUpperCase() : 'NOT SELECTED', I ? COL.white : COL.amber);
    if (R) {
      rocket(ctx, 70, 660, 1, R.id, t, 0);
      text(ctx, 'LAUNCH VEHICLE', 110, 610, { size: 9.5, color: COL.faint, spacing: 2 });
      text(ctx, R.name.toUpperCase(), 110, 626, { size: 12.5, color: COL.white });
    } else text(ctx, 'LAUNCH VEHICLE · NOT SELECTED', 40, 640, { size: 11, color: COL.amber, spacing: 1 });
  };

  S.DESIGN_REVIEW = (ctx, t) => {
    background(ctx, t, 1); grid(ctx, 0.03);
    const rv = Game.review;
    const x = 360, y = 380;
    const col = id => (rv.checks.find(c => c.id === id).ok ? COL.green : COL.red);
    designCraft(ctx, t, x, y, { power: col('power'), mass: col('mass') });
    const sy = y - 200 + ((t * 140) % 400);
    const sg = ctx.createLinearGradient(0, sy - 40, 0, sy);
    sg.addColorStop(0, 'rgba(124,199,232,0)'); sg.addColorStop(1, 'rgba(124,199,232,0.1)');
    ctx.fillStyle = sg; ctx.fillRect(x - 230, sy - 40, 460, 40);
    ctx.fillStyle = 'rgba(124,199,232,0.45)'; ctx.fillRect(x - 230, sy, 460, 1);
    rv.checks.forEach((c, k) => {
      if (Game.sceneT < 0.3 + k * 0.35) return;
      const cy = 150 + k * 30;
      text(ctx, c.ok ? 'PASS' : 'FAIL', 40, cy, { size: 11, color: c.ok ? COL.green : COL.red, spacing: 2, weight: 700 });
      text(ctx, c.label.toUpperCase(), 92, cy, { size: 11, color: COL.label, spacing: 1.5 });
    });
    if (Game.sceneT > 1.8) stamp(ctx, rv.ok ? 'GO FOR LAUNCH' : 'NO-GO', x, 640, rv.ok ? COL.green : COL.red, 22, 0.75 + 0.25 * Math.abs(Math.sin(t * 2.5)));
  };

  // Launch timeline (seconds)
  // Launch timeline (s): final pre-launch poll, T-5 countdown, then ignition at T-0.
  const LT = { count: 3.4, ignite: 8.4, lift: 9.0, space: 12.6, sep: 13.6, end: 15.9 };
  const COUNT_CAPTIONS = { 5: 'GUIDANCE INTERNAL', 4: 'TANKS AT FLIGHT PRESSURE', 3: 'ENGINE CHILLDOWN COMPLETE', 2: 'ALL SYSTEMS ARMED', 1: 'COMMIT' };

  // Camera shake: strong kick at ignition, sustained rumble during ascent, pyro jolt at separation.
  function launchShake(lt) {
    let a = 0;
    if (lt >= LT.ignite && lt < LT.space) {
      const since = lt - LT.ignite;
      a = 11 * Math.exp(-since * 1.6) + 3.2 * clamp(since / 0.4) * (1 - clamp((lt - LT.lift - 2) / 1.6));
    }
    if (lt >= LT.sep && lt < LT.sep + 0.6) a += 4 * (1 - (lt - LT.sep) / 0.6);
    if (lt >= LT.ignite - 1 && lt < LT.ignite) a += 0.9 * (lt - (LT.ignite - 1));   // T-1: the pad starts to tremble
    return a;
  }

  S.LAUNCH = (ctx, t) => {
    const lt = Game.sceneT, type = M.selectedRocket || 'medium';
    const sh = launchShake(lt);
    if (sh > 0) ctx.translate((Math.random() - 0.5) * 2 * sh, (Math.random() - 0.5) * 2 * sh);
    if (lt < LT.space) {
      const climb = lt < LT.lift ? 0 : easeIn(clamp((lt - LT.lift) / (LT.space - LT.lift))) * 1400;
      const cam = Math.max(0, climb - 260);
      const k = clamp(cam / 900);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, `rgb(${lerp(10, 2, k)},${lerp(18, 3, k)},${lerp(38, 8, k)})`);
      sky.addColorStop(0.75, `rgb(${lerp(34, 3, k)},${lerp(48, 5, k)},${lerp(78, 12, k)})`);
      sky.addColorStop(1, `rgb(${lerp(70, 4, k)},${lerp(66, 6, k)},${lerp(80, 14, k)})`);
      ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.globalAlpha = 0.3 + k * 0.7; ctx.drawImage(starLayer, 0, 0); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(0, cam);
      // horizon, hills, pad and tower
      ctx.fillStyle = '#07090d'; ctx.fillRect(-20, 610, W + 40, 500);
      ctx.fillStyle = '#0c1016';
      ctx.beginPath(); ctx.moveTo(-20, 612);
      for (let x = -20; x <= W + 20; x += 60) ctx.lineTo(x, 604 - Math.abs(Math.sin(x * 0.011)) * 16 - Math.abs(Math.sin(x * 0.037)) * 5);
      ctx.lineTo(W + 20, 612); ctx.fill();
      ctx.strokeStyle = '#262d38'; ctx.lineWidth = 1.5;
      ctx.strokeRect(466, 420, 24, 190);
      ctx.beginPath();
      for (let yy = 420; yy < 610; yy += 16) { ctx.moveTo(466, yy); ctx.lineTo(490, yy + 16); ctx.moveTo(490, yy); ctx.lineTo(466, yy + 16); }
      ctx.moveTo(466, 470); ctx.lineTo(438, 470); ctx.moveTo(466, 540); ctx.lineTo(440, 540);
      ctx.stroke();
      ctx.fillStyle = (t * 1.5) % 1 < 0.12 ? '#ff5040' : '#3a1410'; ctx.fillRect(476, 414, 4, 4);
      ctx.fillStyle = '#151a22'; ctx.fillRect(350, 606, 180, 8);
      // ignition flash lighting the pad
      if (lt > LT.ignite) {
        const f = clamp(1 - (lt - LT.ignite) / 2.5);
        glow(ctx, 420, 606, 380, 'rgba(255,170,90,ALPHA)', 0.45 * f + 0.08);
      }
      ctx.restore();
      const thrust = lt < LT.ignite ? 0 : clamp((lt - LT.ignite) / 0.35) * (1 + (lt > LT.lift ? 0.4 : 0));
      const rx = 420, ry = 604 - climb + cam;
      if (lt >= LT.ignite && !Game.launchBlast) {
        Game.launchBlast = true;   // one-time explosive ground blast
        for (let i = 0; i < 70; i++) {
          const a = Math.PI + Math.random() * Math.PI, v = 150 + Math.random() * 380;
          emit({ x: rx, y: 606 - cam, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.35, life: 2.8, max: 2.8, size: 16 + Math.random() * 20, grow: 36, drag: 0.955, add: false, soft: true, alpha: 0.55, color: '170,165,160' });
        }
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * TAU, v = 80 + Math.random() * 240;
          emit({ x: rx, y: 600 - cam, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 40, life: 0.9, max: 0.9, size: 3 + Math.random() * 4, drag: 0.94, color: '255,190,110' });
        }
      }
      if (thrust > 0) {
        const n = lt < LT.lift + 0.8 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          emit({ x: rx + (Math.random() - 0.5) * 10, y: ry + 12 - cam, vx: (Math.random() - 0.5) * 50, vy: 220 + Math.random() * 120, life: 0.45, max: 0.45, size: 3 + Math.random() * 3, color: '255,170,90' });
          if (climb < 500) emit({ x: rx + (Math.random() - 0.5) * 50, y: 604, vx: (Math.random() - 0.5) * 340, vy: -Math.random() * 50, life: 3, max: 3, size: 12 + Math.random() * 14, grow: 26, drag: 0.965, add: false, soft: true, alpha: 0.5, color: '165,162,158' });
          else emit({ x: rx + (Math.random() - 0.5) * 8, y: ry + 30 - cam, vx: (Math.random() - 0.5) * 20, vy: 40, life: 2.2, max: 2.2, size: 6, grow: 10, drag: 0.98, add: false, soft: true, alpha: 0.35, color: '160,160,165' });
        }
      } else if (Math.random() < (lt > LT.ignite - 1 ? 0.9 : 0.35)) {      // cryogenic venting, heavier at T-1
        emit({ x: rx + (Math.random() - 0.5) * 20, y: 596, vx: (Math.random() - 0.5) * 16, vy: -12, life: 2, max: 2, size: 5, grow: 8, add: false, soft: true, alpha: 0.35, color: '215,220,228' });
      }
      drawParticles(ctx, cam);
      rocket(ctx, rx, ry, 1.35, type, t, thrust);
      if (lt < LT.count) {
        stamp(ctx, 'FINAL PRE-LAUNCH CHECKS', 420, 150, COL.cyan, 20);
        text(ctx, `LAUNCH DIRECTOR POLL · ${Math.min(Game.pollStep, 7)} OF 7 STATIONS GO`, 420, 196, { align: 'center', size: 11, color: COL.label, spacing: 2 });
        if (M.travel) text(ctx, `TRAVEL STRATEGY LOCKED · ${M.travel.short} · ≈${fmtDuration(M.travel.hours)}`, 420, 216, { align: 'center', size: 11, color: COL.amber, spacing: 2 });
      } else if (lt < LT.ignite) {
        const n = Math.ceil(LT.ignite - lt), frac = (LT.ignite - lt) - (n - 1);   // 1 → 0 within each second
        const enter = clamp((frac - 0.8) / 0.2), col = n === 1 ? COL.amber : COL.white;
        ctx.save();
        ctx.translate(420, 190); ctx.scale(1 + enter * 0.35, 1 + enter * 0.35);
        text(ctx, `T−${n}`, 0, 0, { align: 'center', size: 84, weight: 300, color: col, alpha: 1 - enter, spacing: 6, glow: 1 });
        ctx.restore();
        ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;      // sub-second progress ring
        ctx.beginPath(); ctx.arc(420, 190, 74, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - frac)); ctx.stroke();
        ctx.globalAlpha = 0.2; ctx.beginPath(); ctx.arc(420, 190, 74, 0, TAU); ctx.stroke(); ctx.restore();
        text(ctx, COUNT_CAPTIONS[n], 420, 286, { align: 'center', size: 11, color: n === 1 ? COL.amber : COL.label, spacing: 3 });
        if (n === 1) { ctx.fillStyle = `rgba(232,165,75,${0.05 + 0.05 * Math.sin(t * 20)})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
      } else if (lt < LT.lift + 1.4) stamp(ctx, 'LIFTOFF!', 420, 170, COL.white, 44);
      const flash = clamp((lt - (LT.space - 0.35)) / 0.35);
      if (flash > 0) { ctx.fillStyle = `rgba(0,0,0,${flash})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    } else {
      background(ctx, t, 18);
      earth(ctx, 420, 1560, 1000, t);                        // slower time-lapse (1 s = 1 h) for the close-up horizon
      const st = lt - LT.space;
      const fade = 1 - clamp(st / 0.5);
      const ux = 200 + st * 60, uy = 320 - st * 12;
      const sep = clamp((lt - LT.sep) / 1.2);
      const cx = ux + 40 + sep * 120, cy = uy - sep * 30;
      ctx.save(); ctx.translate(ux, uy); ctx.rotate(Math.PI / 2 - 0.12); ctx.scale(0.9, 0.9);
      const sb = ctx.createLinearGradient(-10, 0, 10, 0);
      sb.addColorStop(0, '#7b828c'); sb.addColorStop(0.35, '#e8eaed'); sb.addColorStop(1, '#6d737c');
      ctx.fillStyle = sb; ctx.fillRect(-10, 0, 20, 60);
      ctx.fillStyle = '#23272d'; ctx.fillRect(-10, 0, 20, 4); ctx.fillRect(-7, 60, 14, 6);
      ctx.restore();
      if (lt < LT.sep) spacecraft(ctx, cx, cy, 1.1, -0.12, craftCfg(), t, { deploy: 0 });
      else spacecraft(ctx, cx, cy, 1.1, -0.12 + sep * 0.12, craftCfg(), t, { deploy: ease(clamp((lt - LT.sep - 0.3) / 1.3)) });
      drawParticles(ctx);
      if (lt > LT.sep) tag(ctx, 'SPACECRAFT SEPARATION CONFIRMED', 420, 118, COL.cyan, 'center');
      if (lt > LT.end - 0.8) stamp(ctx, 'EARTH ORBIT REACHED', 420, 160, COL.green, 24);
      if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    }
  };

  // ---- Earth-to-Moon journey geometry (world coordinates; the camera zooms over it).
  // Parking orbit is flown clockwise; trans-lunar injection happens at DEPART and the spacecraft
  // follows a cubic Bezier to the top of its lunar orbit. Wider strategies bulge further out.
  const TJ = { e: { x: 190, y: 500, r: 58 }, rp: 82, m: { x: 650, y: 200, r: 40 }, rl: 62, depart: 200 * D2R };
  const PATH_SHAPE = { fast: { l1: 120, l2: 110, lift: 0 }, balanced: { l1: 175, l2: 160, lift: -25 }, efficient: { l1: 250, l2: 240, lift: -60 } };
  function transferCurve(mode) {
    const sh = PATH_SHAPE[mode] || PATH_SHAPE.balanced;
    const p0 = { x: TJ.e.x + TJ.rp * Math.cos(TJ.depart), y: TJ.e.y + TJ.rp * Math.sin(TJ.depart) };
    const v = { x: -Math.sin(TJ.depart), y: Math.cos(TJ.depart) };        // clockwise orbital direction at departure
    const p3 = { x: TJ.m.x, y: TJ.m.y - TJ.rl };
    return [p0, { x: p0.x + v.x * sh.l1, y: p0.y + v.y * sh.l1 }, { x: p3.x - sh.l2, y: p3.y + sh.lift }, p3];
  }
  const cb = (c, u) => {
    const a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, d = 3 * (1 - u) * u * u, e = u ** 3;
    return { x: a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x, y: a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y };
  };
  const cbAng = (c, u) => { const p = cb(c, Math.max(0, u - 0.004)), q = cb(c, Math.min(1, u + 0.004)); return Math.atan2(q.y - p.y, q.x - p.x); };
  function curvePath(ctx, c, from = 0, to = 1) {
    ctx.beginPath();
    for (let i = 0; i <= 60; i++) { const q = cb(c, from + (to - from) * i / 60); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }
  }

  // Visual timing (s). The coast length scales with the chosen strategy's real travel time.
  const TRANSFER = { park: 5.2, tli: 2.6, loi: 3.2, tliArc: 0.07 };
  const cruiseTime = () => (M.travel ? M.travel.cruiseHours : 73) / 13.5;
  const SC = { x: 400, y: 395 };
  const lerpPt = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });

  // Camera: zoomed on Earth for the parking orbit, wide for the coast, zoomed on the Moon for capture.
  function journeyCam() {
    const earthCam = { c: TJ.e, z: 2.1 }, wide = { c: { x: SC.x, y: SC.y - 52 }, z: 0.95 }, moonCam = { c: TJ.m, z: 2.3 };
    const blend = (a, b, k) => { k = ease(clamp(k)); return { c: lerpPt(a.c, b.c, k), z: lerp(a.z, b.z, k) }; };
    const ph = Game.phase;
    if (ph === 'parking') return earthCam;
    if (ph === 'tli') return blend(earthCam, wide, (Game.phaseT - TRANSFER.tli * 0.45) / (TRANSFER.tli * 0.9));
    if (ph === 'loi' || ph === 'arrived') return blend(wide, moonCam, Game.phaseT / 1.3 + (ph === 'arrived' ? 1 : 0));
    return blend(earthCam, wide, (progressT('cruise') + TRANSFER.tli * 0.55) / (TRANSFER.tli * 0.9));
  }

  // Mission elapsed time (hours) for the current point of the journey.
  function journeyMET() {
    const tp = M.travel; if (!tp) return 0;
    const ph = Game.phase;
    if (ph === 'parking') return 0.2 + (PARKING_HOURS - 0.2) * clamp(Game.phaseT / TRANSFER.park);
    if (ph === 'tli') return PARKING_HOURS + 0.1 * clamp(Game.phaseT / TRANSFER.tli);
    if (ph === 'loi' || ph === 'arrived') return tp.hours;
    return PARKING_HOURS + 0.1 + (tp.cruiseHours - 0.1) * clamp(progressT('cruise') / cruiseTime());
  }
  const fmtMET = h => { const d = Math.floor(h / 24), hh = Math.floor(h - d * 24), mm = Math.floor((h * 60) % 60); return `${d} d ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; };

  S.TRANSFER = (ctx, t) => {
    hazardShake(ctx, t);
    background(ctx, t, 3); grid(ctx, 0.02);
    const tp = M.travel, mode = M.travelMode || 'balanced', c = transferCurve(mode), ph = Game.phase;
    const cam = journeyCam();
    ctx.save();
    ctx.translate(SC.x, SC.y); ctx.scale(cam.z, cam.z); ctx.translate(-cam.c.x, -cam.c.y);
    const lw = 1 / cam.z;
    // Earth + parking orbit
    const met = journeyMET();                                   // spin follows mission elapsed time
    earth(ctx, TJ.e.x, TJ.e.y, TJ.e.r, met);
    ctx.save(); ctx.strokeStyle = COL.cyan; ctx.lineWidth = 1.2 * lw;
    ctx.globalAlpha = ph === 'parking' ? 0.7 : 0.25; ctx.setLineDash(ph === 'parking' ? [] : [3 * lw, 5 * lw]);
    ctx.beginPath(); ctx.arc(TJ.e.x, TJ.e.y, TJ.rp, 0, TAU); ctx.stroke(); ctx.restore();
    // Moon + lunar orbit
    moon(ctx, TJ.m.x, TJ.m.y, TJ.m.r, { lon: moonLon(met) });
    if (ph === 'loi' || ph === 'arrived') {
      ctx.save(); ctx.strokeStyle = COL.green; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2 * lw;
      ctx.beginPath(); ctx.arc(TJ.m.x, TJ.m.y, TJ.rl, 0, TAU); ctx.stroke(); ctx.restore();
    }
    // transfer trajectory: planned (dashed) and flown (solid)
    let s = 0;
    if (ph === 'tli') s = TRANSFER.tliArc * Math.pow(clamp(Game.phaseT / TRANSFER.tli), 2);
    else if (ph === 'cruise' || ph === 'hazard' || ph === 'hazardDone') {
      const u = clamp(progressT('cruise') / cruiseTime());
      s = TRANSFER.tliArc + (1 - TRANSFER.tliArc) * clamp(u + 0.16 * Math.sin(Math.PI * u));  // fast after TLI, slower far from Earth
    } else if (ph === 'loi' || ph === 'arrived') s = 1;
    ctx.save(); ctx.strokeStyle = 'rgba(150,175,200,0.35)'; ctx.lineWidth = 1 * lw; ctx.setLineDash([2 * lw, 6 * lw]);
    curvePath(ctx, c); ctx.stroke(); ctx.restore();
    if (s > 0) { ctx.save(); ctx.strokeStyle = COL.cyan; ctx.lineWidth = 1.6 * lw; curvePath(ctx, c, 0, s); ctx.stroke(); ctx.restore(); }

    // spacecraft position and heading for each phase
    let q, ang, thrust = false, scale = 0.55;
    if (ph === 'parking') {
      const w = 2 * TAU / TRANSFER.park, th = TJ.depart - w * (TRANSFER.park - Game.phaseT);
      q = { x: TJ.e.x + TJ.rp * Math.cos(th), y: TJ.e.y + TJ.rp * Math.sin(th) };
      ang = th + Math.PI / 2;
    } else if (ph === 'loi' || ph === 'arrived') {
      if (M.flags.missedCapture) {
        const k = Game.phaseT * 60, a = cbAng(c, 1);            // missed capture: sails past the Moon
        q = { x: c[3].x + Math.cos(a) * k, y: c[3].y + Math.sin(a) * k }; ang = a;
      } else {
        const th = -Math.PI / 2 + (ph === 'loi' ? Game.phaseT : TRANSFER.loi + Game.phaseT) * 1.1;
        q = { x: TJ.m.x + TJ.rl * Math.cos(th), y: TJ.m.y + TJ.rl * Math.sin(th) };
        ang = th + Math.PI / 2;
        if (ph === 'loi' && Game.phaseT < 1.5) { thrust = 2; ang += Math.PI; }   // retro-burn: engine faces forward
      }
    } else {
      q = cb(c, s); ang = cbAng(c, Math.max(0.002, s));
      if (ph === 'tli') { thrust = 2 + clamp(Game.phaseT / 0.6); }
      if (evading()) thrust = true;
    }
    if (thrust && thrust !== true && Math.random() < 0.8) {
      const back = ang + Math.PI;
      emit({ x: q.x + Math.cos(back) * 14, y: q.y + Math.sin(back) * 14, vx: Math.cos(back) * 60 + (Math.random() - 0.5) * 20, vy: Math.sin(back) * 60 + (Math.random() - 0.5) * 20, life: 0.7, max: 0.7, size: 1.2, color: '180,215,255' });
    }
    drawParticles(ctx);
    spacecraft(ctx, q.x, q.y, scale, ang, craftCfg(), t, { thrust });
    ctx.restore();

    // ---- screen-space overlays
    const qs = { x: SC.x + (q.x - cam.c.x) * cam.z, y: SC.y + (q.y - cam.c.y) * cam.z };
    hazardFx(ctx, t, qs.x, qs.y);
    const es = { x: SC.x + (TJ.e.x - cam.c.x) * cam.z, y: SC.y + (TJ.e.y - cam.c.y) * cam.z };
    const ms = { x: SC.x + (TJ.m.x - cam.c.x) * cam.z, y: SC.y + (TJ.m.y - cam.c.y) * cam.z };
    if (es.x > -100 && es.y < 760) tag(ctx, 'EARTH', es.x, es.y + TJ.e.r * cam.z + 18, COL.label, 'center');
    if (ms.x < 900) tag(ctx, 'MOON', ms.x, ms.y + TJ.m.r * cam.z + 16, COL.label, 'center');
    const titles = {
      parking: Game.phaseT < TRANSFER.park / 2 ? ['EARTH ORBIT', 'ORBIT 1 OF 2 · SYSTEMS CHECKOUT'] : ['PREPARING FOR TRANS-LUNAR INJECTION', 'ORBIT 2 OF 2 · ENGINE ARMED'],
      tli: ['TRANS-LUNAR INJECTION BURN', 'ENGINE FIRING · ACCELERATING OUT OF EARTH ORBIT'],
      cruise: ['TRANS-LUNAR COAST', `${tp ? tp.short : ''} TRAJECTORY`],
      hazard: ['TRANS-LUNAR COAST', 'ANOMALY IN PROGRESS'], hazardDone: ['TRANS-LUNAR COAST', 'ANOMALY RESOLVED'],
      loi: M.flags.missedCapture ? ['LUNAR CAPTURE FAILED', 'NOT ENOUGH PROPELLANT TO BRAKE'] : ['ENTERING LUNAR ORBIT', 'RETRO-BURN · LUNAR ORBIT INSERTION'],
      arrived: M.flags.missedCapture ? ['LUNAR CAPTURE FAILED', 'LUNA-01 FLEW PAST THE MOON'] : M.failure ? ['CAPTURED · NO FUEL LEFT', 'TOO LITTLE PROPELLANT FOR A SCIENCE ORBIT'] : ['LUNAR ORBIT ESTABLISHED', 'CAPTURE CONFIRMED'],
    }[ph] || ['', ''];
    const tcol = ph === 'tli' || ph === 'loi' ? COL.amber : (M.failure && (ph === 'loi' || ph === 'arrived')) ? COL.red : ph === 'arrived' ? COL.green : COL.cyan;
    stamp(ctx, titles[0], 420, 118, tcol, 17);
    text(ctx, titles[1], 420, 150, { align: 'center', size: 10.5, color: COL.label, spacing: 2 });
    // mission clock + distance
    if (tp) {
      const met = journeyMET();
      tag(ctx, 'MISSION ELAPSED TIME', 40, 196);
      text(ctx, `MET ${fmtMET(met)}`, 40, 216, { size: 18, color: COL.white, weight: 400 });
      tag(ctx, ph === 'arrived' || ph === 'loi' ? 'ARRIVED AFTER' : 'LUNAR ARRIVAL IN', 40, 244);
      text(ctx, ph === 'arrived' || ph === 'loi' ? fmtDuration(tp.hours) : fmtDuration(Math.max(0, tp.hours - met)), 40, 262, { size: 14, color: COL.amber });
      const remain = ph === 'parking' || ph === 'tli' ? tp.dist : ph === 'loi' || ph === 'arrived' ? 0 : tp.dist * (1 - s);
      tag(ctx, 'RANGE TO MOON', 40, 290);
      text(ctx, `${Math.round(remain).toLocaleString('en-US')} km`, 40, 308, { size: 14, color: COL.white });
      text(ctx, 'launch-window distance', 40, 324, { size: 8.5, color: COL.faint });
    }
    // propellant readout during burns: counts down from before to after
    const bn = Game.burn;
    if (bn && Game.t - bn.t0 < bn.dur + 1.5) {
      const k = clamp((Game.t - bn.t0) / bn.dur), v = Math.round(lerp(bn.from, bn.to, k));
      const x = 40, y = 360;
      tag(ctx, `${bn.label} · PROPELLANT`, x, y, COL.amber);
      text(ctx, `${v}%`, x, y + 24, { size: 26, weight: 300, color: COL.white });
      ctx.fillStyle = 'rgba(150,175,200,0.15)'; ctx.fillRect(x, y + 44, 200, 5);
      ctx.fillStyle = COL.amber; ctx.fillRect(x, y + 44, 2 * v, 5);
      text(ctx, `−${bn.from - bn.to}%`, x + 80, y + 26, { size: 12, color: COL.red });
    }
  };

  // Travel-strategy preview: the three candidate trajectories from Earth orbit to the Moon.
  S.TRAJECTORY = (ctx, t) => {
    background(ctx, t, 1.5); grid(ctx, 0.022);
    const k = 1.0, off = { x: 0, y: 44 };                    // journey view, shifted clear of the headline text
    ctx.save(); ctx.translate(off.x, off.y); ctx.translate(SC.x, SC.y); ctx.scale(k, k); ctx.translate(-SC.x, -SC.y);
    const lh = lapseHours(t);
    earth(ctx, TJ.e.x, TJ.e.y, TJ.e.r, lh);
    ctx.save(); ctx.strokeStyle = COL.cyan; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(TJ.e.x, TJ.e.y, TJ.rp, 0, TAU); ctx.stroke(); ctx.restore();
    moon(ctx, TJ.m.x, TJ.m.y, TJ.m.r, { lon: moonLon(lh) });
    ctx.save(); ctx.strokeStyle = COL.green; ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.arc(TJ.m.x, TJ.m.y, TJ.rl, 0, TAU); ctx.stroke(); ctx.restore();
    const active = Game.preview || Game.choice;
    const d = computeDesign(Game.sel);
    const labels = [];
    for (const id of ['efficient', 'balanced', 'fast']) {
      const c = transferCurve(id), on = id === active;
      ctx.save();
      ctx.strokeStyle = on ? COL.amber : 'rgba(150,175,200,0.5)'; ctx.lineWidth = on ? 2 : 1;
      ctx.setLineDash(on ? [] : [4, 5]);
      curvePath(ctx, c); ctx.stroke(); ctx.restore();
      if (on) {                                                 // animated craft along the highlighted path
        const u = (t * (id === 'fast' ? 0.3 : id === 'balanced' ? 0.24 : 0.16)) % 1;
        const q = cb(c, u);
        spacecraft(ctx, q.x, q.y, 0.4, cbAng(c, u), craftCfg(), t);
      }
      const m = cb(c, 0.42), tpn = travelPlan(id, d.mass);
      labels.push({ x: SC.x + (m.x + off.x - SC.x) * k, y: SC.y + (m.y + off.y - SC.y) * k, id, on, text: `${TRAVEL_MODES[id].short} · ≈${fmtDuration(tpn.hours)}` });
    }
    const dp = transferCurve('balanced')[0];
    ctx.fillStyle = COL.amber; ctx.fillRect(dp.x - 2.5, dp.y - 2.5, 5, 5);
    ctx.restore();
    for (const l of labels) text(ctx, l.text, l.x - 14, l.y, { align: 'right', size: 10.5, color: l.on ? COL.amber : COL.label, spacing: 1.5, weight: l.on ? 700 : 500, glow: 1 });
    const dps = { x: SC.x + (dp.x + off.x - SC.x) * k, y: SC.y + (dp.y + off.y - SC.y) * k };
    text(ctx, 'TLI BURN POINT', dps.x - 8, dps.y - 10, { size: 9.5, color: COL.amber, spacing: 1.5, align: 'right', glow: 1 });
    tag(ctx, 'EARTH · PARKING ORBIT', SC.x + (TJ.e.x + off.x - SC.x) * k, SC.y + (TJ.e.y + off.y - SC.y) * k + 100, COL.label, 'center');
    tag(ctx, 'MOON · LUNAR ORBIT', SC.x + (TJ.m.x + off.x - SC.x) * k, SC.y + (TJ.m.y + off.y - SC.y) * k + 84, COL.label, 'center');
    tag(ctx, 'TRAVEL STRATEGY · HOW QUICKLY DO YOU WANT TO REACH THE MOON?', 40, 106, COL.cyan);
    const pg = NasaData.get('Perigee (closest)', 'orbit');
    if (pg) {
      tag(ctx, 'EARTH-MOON DISTANCE · THIS LAUNCH WINDOW', 40, 136);
      text(ctx, `${Math.round(M.moonDistance).toLocaleString('en-US')} km`, 40, 156, { size: 16, color: COL.white });
      text(ctx, `NASA range ${NasaData.show('Perigee (closest)', 'orbit')} (perigee) - ${NasaData.show('Apogee (farthest)', 'orbit')} (apogee)`, 40, 175, { size: 9.5, color: COL.faint });
    }
    text(ctx, 'Trajectories stylised, not to scale (simplified game model)', 40, 700, { size: 9.5, color: COL.faint });
  };

  const OR = { x: 390, y: 390, r: 175, rot: -0.2, low: [225, 58], high: [330, 96] };
  S.ORBIT_DECISION = (ctx, t) => {
    background(ctx, t, 2); grid(ctx, 0.02);
    const active = Game.phase === 'choose' ? (Game.preview || Game.choice) : M.selectedOrbit;
    const orbitStyle = id => (id === active ? [COL.cyan, 1.6, 1] : ['rgba(150,175,200,1)', 0.8, 0.3]);
    for (const id of ['high', 'low']) { const [c, w, a] = orbitStyle(id); orbitHalf(ctx, OR.x, OR.y, OR[id][0], OR[id][1], OR.rot, false, c, w, a); }
    const act = active || 'high';
    const p = onEllipse(OR.x, OR.y, OR[act][0], OR[act][1], OR.rot, t * (act === 'low' ? 0.8 : 0.5));
    const cfg = craftCfg();
    if (!p.front) spacecraft(ctx, p.x, p.y, 0.5, Math.sin(t) * 0.2, cfg, t);
    moon(ctx, OR.x, OR.y, OR.r, { lon: moonLon(lapseHours(t)) });
    for (const id of ['high', 'low']) { const [c, w, a] = orbitStyle(id); orbitHalf(ctx, OR.x, OR.y, OR[id][0], OR[id][1], OR.rot, true, c, w, a); }
    if (p.front) spacecraft(ctx, p.x, p.y, 0.75, Math.sin(t) * 0.2, cfg, t, { thrust: Game.phase === 'inserting' });
    const lp = onEllipse(OR.x, OR.y, OR.low[0], OR.low[1], OR.rot, 1.25), hp = onEllipse(OR.x, OR.y, OR.high[0], OR.high[1], OR.rot, 1.1);
    tag(ctx, 'LOW ORBIT', lp.x + 10, lp.y + 14, act === 'low' ? COL.cyan : COL.faint);
    tag(ctx, 'HIGHER ORBIT', hp.x + 10, hp.y + 14, act === 'high' ? COL.cyan : COL.faint);
    tag(ctx, `MOON · MEAN RADIUS ${NasaData.show('Mean radius', '')}`, OR.x, 680, COL.label, 'center');
    text(ctx, 'Orbits stylised, not to scale (simplified game model)', OR.x, 698, { align: 'center', size: 9.5, color: COL.faint });
  };

  // Survey: LUNA-01 flies a polar orbit whose plane passes over the chosen target.
  const SV = { x: 400, y: 365, r: 215, k: 1.5 };
  const SCAN_TIME = 4.5;
  function orbitPoint(theta, reg, view) {
    const d = (reg.lon - VIEWS[view]) * D2R;
    const xb = Math.cos(theta) * Math.sin(d), yb = Math.sin(theta), zb = Math.cos(theta) * Math.cos(d);
    const y = yb * Math.cos(TILT) + zb * Math.sin(TILT), z = zb * Math.cos(TILT) - yb * Math.sin(TILT);
    return { x: SV.x + xb * SV.k * SV.r, y: SV.y - y * SV.k * SV.r, front: z > 0 };
  }
  function orbitPath(ctx, reg, view, front) {
    ctx.save();
    ctx.strokeStyle = COL.cyan; ctx.globalAlpha = front ? 0.55 : 0.28; ctx.lineWidth = front ? 1 : 0.8;
    ctx.setLineDash(front ? [] : [3, 5]);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i <= 160; i++) {
      const p = orbitPoint(i / 160 * TAU, reg, view);
      if (p.front === front) { if (pen) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); pen = true; } else pen = false;
    }
    ctx.stroke();
    ctx.restore();
  }
  function surveyScene(ctx, t, o = {}) {
    background(ctx, t, 1.5);
    const reg = region(), view = regionView(reg);
    const tp = targetPos(SV.x, SV.y, SV.r, view);
    const latT = reg.lat * D2R;
    let th;
    const scanP = clamp(progressT('scanning') / SCAN_TIME);
    const inScan = Game.state === 'SURVEY' && ['scanning', 'hazard', 'hazardDone'].includes(Game.phase);
    if (inScan) th = latT + 0.3 - 0.6 * scanP;
    else if (o.parked || Game.phase === 'done') th = latT + 0.1;
    else th = latT + 1.2 + t * 0.35;
    const p = orbitPoint(th, reg, view);
    const cfg = craftCfg();
    orbitPath(ctx, reg, view, false);
    if (!p.front) spacecraft(ctx, p.x, p.y, 0.55, 0, cfg, t);
    moon(ctx, SV.x, SV.y, SV.r, { night: o.night || 0, view });
    targetMarker(ctx, tp.x, tp.y, t, COL.amber, 0.9);
    orbitPath(ctx, reg, view, true);
    if (view === 'far') tag(ctx, 'FARSIDE VIEW · EARTH IS BEHIND THE MOON', 40, 690, COL.faint);
    return { p, tp, cfg, reg };
  }

  S.SURVEY = (ctx, t) => {
    hazardShake(ctx, t);
    const { p, tp, cfg, reg } = surveyScene(ctx, t);
    const scanning = Game.phase === 'scanning';
    if (scanning) {
      const mode = M.selectedObservation || 'standard';
      const width = mode === 'deep' ? 44 : mode === 'standard' ? 30 : 18;
      const sweep = Math.sin(Game.phaseT * 2.6) * width * 0.6;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createLinearGradient(p.x, p.y, tp.x, tp.y);
      bg.addColorStop(0, 'rgba(124,199,232,0.32)'); bg.addColorStop(1, 'rgba(124,199,232,0.04)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x - width + sweep, tp.y); ctx.lineTo(tp.x + width + sweep, tp.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(190,230,250,0.6)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x + sweep, tp.y); ctx.stroke();
      ctx.restore();
      // scan footprint grid
      ctx.save(); ctx.strokeStyle = 'rgba(124,199,232,0.35)'; ctx.lineWidth = 0.6;
      const fx = tp.x + sweep;
      for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(fx - width, tp.y + k * 5); ctx.lineTo(fx + width, tp.y + k * 5); ctx.stroke(); }
      ctx.restore();
      if (Math.random() < (mode === 'deep' ? 0.7 : 0.4)) {
        const sx = tp.x + (Math.random() - 0.5) * width * 2;
        emit({ x: sx, y: tp.y, vx: (p.x - sx) * 0.9, vy: (p.y - tp.y) * 0.9, life: 1, max: 1, size: 1, color: '200,230,250' });
      }
    }
    drawParticles(ctx);
    spacecraft(ctx, p.x, p.y, p.front ? 0.8 : 0.55, 0, cfg, t, { thrust: evading() });
    hazardFx(ctx, t, p.x, p.y, 106);
    const lx = Math.min(tp.x + 36, 600), ly = tp.y > 560 ? tp.y - 44 : tp.y + 36;
    tag(ctx, `TARGET · ${reg.name.toUpperCase()}`, lx, ly, COL.amber);
    text(ctx, reg.site, lx, ly + 16, { size: 9.5, color: COL.faint });
    if (Game.phase === 'done' && Game.lastGain) {
      const k = clamp(Game.phaseT / 1.5);
      text(ctx, `+${Game.lastGain} SCIENCE`, tp.x, tp.y - 60 - k * 24, { align: 'center', size: 18, color: COL.green, spacing: 3, alpha: 1 - k * 0.4, glow: 1 });
    }
    const paused = Game.phase === 'hazard' || Game.phase === 'hazardDone';
    if (scanning || paused) {
      tag(ctx, `ACQUIRING · ${SCANS[M.selectedObservation].name.toUpperCase()}${paused ? ' · PAUSED' : ''}`, 40, 130, paused ? COL.amber : COL.cyan);
      const pct = clamp(progressT('scanning') / SCAN_TIME);
      ctx.fillStyle = 'rgba(150,175,200,0.2)'; ctx.fillRect(40, 142, 220, 3);
      ctx.fillStyle = COL.cyan; ctx.fillRect(40, 142, 220 * pct, 3);
      text(ctx, `${Math.round(pct * 100)}%`, 270, 144, { size: 10.5, color: COL.white });
    }
  };

  function powerGauge(ctx, x, y, level, t) {
    const lv = clamp(level / 100);
    tag(ctx, 'BUS POWER', x, y);
    text(ctx, `${Math.round(level)}%`, x, y + 26, { size: 30, weight: 300, color: lv < 0.2 ? COL.red : COL.white });
    ctx.fillStyle = 'rgba(150,175,200,0.15)'; ctx.fillRect(x, y + 50, 200, 6);
    ctx.fillStyle = lv < 0.2 ? COL.red : lv < 0.4 ? COL.amber : COL.green; ctx.fillRect(x, y + 50, 200 * lv, 6);
    ctx.fillStyle = 'rgba(229,83,75,0.9)'; ctx.fillRect(x + 200 * RULES.healthyPower / 100, y + 46, 1, 14);
    text(ctx, `${RULES.healthyPower}% health line`, x + 200 * RULES.healthyPower / 100 + 4, y + 68, { size: 9, color: COL.faint });
  }

  S.MISSION_EVENT = (ctx, t) => {
    const night = Game.phase === 'alert' ? clamp(Game.phaseT / 2.2) * 0.75 : 0.75;
    const { p, cfg } = surveyScene(ctx, t, { night, parked: true });
    drawParticles(ctx);
    spacecraft(ctx, p.x, p.y, 0.8, 0, cfg, t);
    const pulse = Math.abs(Math.sin(t * 2.5));
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(229,83,75,0)'); vg.addColorStop(1, `rgba(229,83,75,${0.08 + pulse * 0.1})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = `rgba(229,83,75,${0.55 + 0.45 * pulse})`; ctx.fillRect(40, 102, 8, 8);
    text(ctx, 'MASTER CAUTION · POWER DEMAND', 58, 106, { size: 12, color: COL.red, spacing: 2, weight: 700 });
    const shown = Game.phase === 'alert' ? lerp(Game.powerBefore, M.power, clamp((Game.phaseT - 1) / 1.2)) : M.power;
    powerGauge(ctx, 40, 140, shown, t);
    tag(ctx, 'HEATERS · ON', 40, 240, COL.amber);
    text(ctx, `Night low ${NasaData.show('Surface temperature minimum (typical range)', '')}`, 40, 258, { size: 10, color: COL.faint });
    if (Game.phase !== 'alert' && Game.eventDrain) text(ctx, `−${Game.eventDrain}%`, 120, 166, { size: 14, color: COL.red, alpha: 1 - clamp(Game.sceneT / 6) * 0.5 });
  };

  const TX = { m: { x: 140, y: 520, r: 105 }, c: { x: 390, y: 370 }, e: { x: 640, y: 205, r: 60 } };
  const packets = [];
  const TX_TIME = 5;
  S.TRANSMISSION = (ctx, t, dt) => {
    background(ctx, t, 2); grid(ctx, 0.02);
    moon(ctx, TX.m.x, TX.m.y, TX.m.r);
    earth(ctx, TX.e.x, TX.e.y, TX.e.r, lapseHours(t));
    const tp = targetPos(TX.m.x, TX.m.y, TX.m.r, 'near');
    if (!tp.visible) tag(ctx, 'FAR SIDE TARGET · BEHIND THE LIMB', tp.x + 10, tp.y - 14, COL.amber);
    const sending = Game.phase === 'sending';
    const full = (Game.phase === 'choose' ? (Game.preview || Game.choice) : M.selectedTransmission) === 'full';
    ctx.save(); ctx.setLineDash([2, 6]); ctx.lineDashOffset = -t * 20;
    ctx.strokeStyle = 'rgba(150,175,200,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(TX.c.x, TX.c.y); ctx.lineTo(TX.e.x, TX.e.y); ctx.stroke();
    ctx.restore();
    const rate = sending ? (full ? 16 : 7) : 1.2;
    if (Math.random() < rate * dt) packets.push({ seg: 0, p: 0 });
    if (sending && Math.random() < rate * dt) packets.push({ seg: 1, p: 0 });
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = packets.length - 1; i >= 0; i--) {
      const k = packets[i];
      k.p += dt * (k.seg === 0 ? 0.9 : 0.7);
      if (k.p >= 1) { packets.splice(i, 1); continue; }
      const a = k.seg === 0 ? tp : TX.c, b = k.seg === 0 ? TX.c : TX.e;
      const x = lerp(a.x, b.x, k.p), y = lerp(a.y, b.y, k.p), ang = Math.atan2(b.y - a.y, b.x - a.x);
      const len = full ? 10 : 6;
      ctx.strokeStyle = k.seg === 0 ? 'rgba(232,180,110,0.9)' : 'rgba(150,215,245,0.95)';
      ctx.lineWidth = full ? 1.6 : 1.1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); ctx.stroke();
    }
    ctx.restore();
    if (sending) {   // ground-station receive rings
      ctx.save(); ctx.strokeStyle = COL.cyan;
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.8 + k / 3) % 1;
        ctx.globalAlpha = 0.5 * (1 - ph); ctx.beginPath(); ctx.arc(TX.e.x, TX.e.y, TX.e.r + 6 + ph * 30, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    const ang = Math.atan2(TX.e.y - TX.c.y, TX.e.x - TX.c.x);
    spacecraft(ctx, TX.c.x, TX.c.y + Math.sin(t) * 2, 1.15, ang + Math.PI / 2 - 0.2, craftCfg(), t);
    tag(ctx, 'MOON', TX.m.x, TX.m.y + TX.m.r + 22, COL.label, 'center');
    tag(ctx, 'EARTH · DEEP SPACE NETWORK', TX.e.x, TX.e.y + TX.e.r + 22, COL.label, 'center');
    tag(ctx, 'LUNA-01', TX.c.x, TX.c.y + 56, COL.faint, 'center');
    if (sending) {
      const pct = clamp(Game.phaseT / TX_TIME);
      tag(ctx, 'DOWNLINK IN PROGRESS', 40, 112, COL.cyan);
      ctx.fillStyle = 'rgba(150,175,200,0.2)'; ctx.fillRect(40, 124, 220, 3);
      ctx.fillStyle = COL.cyan; ctx.fillRect(40, 124, 220 * pct, 3);
      text(ctx, `${Math.round(pct * 100)}%`, 270, 126, { size: 10.5, color: COL.white });
    }
    if (Game.signalDelay) {
      const mx = (TX.c.x + TX.e.x) / 2, my = (TX.c.y + TX.e.y) / 2;
      text(ctx, `≈${Game.signalDelay.toFixed(2)} s light-time`, mx + 18, my + 14, { size: 10, color: COL.faint });
    }
  };

  S.RESULT = (ctx, t) => {
    background(ctx, t, 2); grid(ctx, 0.02);
    const st = M.missionStatus, color = st === 'SUCCESS' ? COL.green : st === 'FAILURE' ? COL.red : COL.amber;
    earth(ctx, 180, 470, 78, lapseHours(t));
    moon(ctx, 690, 215, 52, { lon: moonLon(lapseHours(t)) });
    const p0 = { x: 240, y: 425 }, p1 = { x: 400, y: 120 }, p2 = { x: 640, y: 230 };
    const prog = clamp(Game.sceneT / 1.5);
    route(ctx, p0, p1, p2, t, st === 'FAILURE' ? Math.min(prog, 0.85) : prog, color, st !== 'FAILURE');
    const q = qb(p0, p1, p2, st === 'FAILURE' ? 0.85 : 1);
    if (st === 'FAILURE') {
      ctx.save(); ctx.translate(q.x, q.y);
      ctx.globalAlpha = 0.45 + 0.35 * Math.abs(Math.sin(t * 5));
      spacecraft(ctx, 0, 0, 0.75, t * 0.5, craftCfg(), t);
      ctx.restore();
      tag(ctx, 'LOSS OF SIGNAL', q.x, q.y - 40, COL.red, 'center');
      for (let k = 0; k < 4; k++) { ctx.fillStyle = `rgba(229,83,75,${Math.random() * 0.06})`; ctx.fillRect(0, Math.random() * H, 800, 1 + Math.random() * 3); }
    } else {
      spacecraft(ctx, q.x + 50, q.y - 10, 0.65, 0, craftCfg(), t);
      ctx.save(); ctx.strokeStyle = color;   // signal-received rings at Earth
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.5 + k / 3) % 1;
        ctx.globalAlpha = 0.6 * (1 - ph); ctx.beginPath(); ctx.arc(180, 470, 84 + ph * 60, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    }
    stamp(ctx, st === 'SUCCESS' ? 'MISSION SUCCESS' : st === 'FAILURE' ? 'MISSION FAILURE' : 'PARTIAL SUCCESS', 420, 620, color, 26);
  };

  S.REPORT = (ctx, t) => {
    background(ctx, t, 1); grid(ctx, 0.025);
    moon(ctx, 1180, 700, 260, { lon: moonLon(lapseHours(t)) });
    earth(ctx, 90, 90, 30, lapseHours(t));
  };

  function frame(ctx, t, dt) {
    const fn = S[Game.state];
    ctx.save();
    if (fn) fn(ctx, t, dt);
    ctx.restore();
  }

  function init() { buildStars(); buildMoonMap(); buildEarthMap(); }

  const surveyTarget = () => targetPos(SV.x, SV.y, SV.r);

  return { init, frame, updateParticles, clearParticles, burst, emit, impact, packets, surveyTarget, cruiseTime, TRANSFER, SCAN_TIME, TX_TIME, LT, W, H };
})();
