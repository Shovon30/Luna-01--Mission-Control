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

  // ================================================================ MOON
  // Textures are generated on a real latitude/longitude grid: the major maria and named
  // craters sit at their (approximate) real positions, so the Apollo landing sites from the
  // regions CSV land on the right terrain. Two views: the nearside (lon 0, what Earth sees)
  // and the farside (lon 180). Both are tilted so the south polar region is visible.
  const MT = 640, D2R = Math.PI / 180, TILT = 15 * D2R;
  const VIEWS = { near: 0, far: 180 };
  const moonTex = { near: null, far: null };

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
  // Screen offset in moon radii (y down) for a latitude/longitude in a given view.
  function project(lat, lon, view = 'near') {
    const v = viewVec(lat, lon, VIEWS[view]);
    return { x: v.x, y: -v.y, z: v.z, visible: v.z > 0 };
  }

  function buildMoon(view) {
    const lon0 = VIEWS[view];
    const R = MT / 2, N = MT * MT, rnd = mulberry32(view === 'near' ? 42 : 77), fbm = makeNoise(5);
    const hgt = new Float32Array(N), alb = new Float32Array(N), inside = new Uint8Array(N);
    const mariaV = MARIA.map(([la, lo, r, s]) => { const c = Math.cos(la * D2R); return [c * Math.sin(lo * D2R), Math.sin(la * D2R), c * Math.cos(lo * D2R), r, s || 1]; });
    const ct = Math.cos(TILT), st = Math.sin(TILT), cl = Math.cos(lon0 * D2R), sl = Math.sin(lon0 * D2R);
    // 1. albedo (maria vs highlands) and small-scale relief, sampled on the body sphere
    for (let py = 0; py < MT; py++) for (let px = 0; px < MT; px++) {
      const nx = (px + 0.5 - R) / R, ny = (py + 0.5 - R) / R, d2 = nx * nx + ny * ny;
      if (d2 > 1.0) continue;
      const i = py * MT + px, nz = Math.sqrt(1 - d2);
      inside[i] = 1;
      const yv = -ny, yb = yv * ct - nz * st, zb0 = nz * ct + yv * st;
      const bx = nx * cl + zb0 * sl, bz = -nx * sl + zb0 * cl;
      const pert = fbm(bx * 3 + 7, yb * 3, bz * 3, 3);
      let m = 0;
      for (const [mx, my, mz, r, s] of mariaV) {
        const cosd = bx * mx + yb * my + bz * mz;
        if (cosd < 0.85) continue;
        const dd = Math.acos(Math.min(1, cosd)) / D2R, rr = r * (0.75 + 0.5 * pert);
        m = Math.max(m, s * smooth(rr + 2.5, rr - 2.5, dd));
      }
      const fine = fbm(bx * 14, yb * 14, bz * 14, 3), mid = fbm(bx * 4 + 2, yb * 4, bz * 4, 3);
      alb[i] = lerp(0.64, 0.3, m) + (fine - 0.5) * 0.1 + (mid - 0.5) * 0.08;
      hgt[i] = (fbm(bx * 7 + 9, yb * 7, bz * 7, 4) - 0.5) * 6 * (1 - 0.6 * m);
    }
    // 2. craters stamped into the height map, foreshortened towards the limb
    function crater(cx, cy, rad, depth, fresh, rays) {
      const nx = (cx - R) / R, ny = (cy - R) / R, d = Math.hypot(nx, ny);
      const nz = Math.sqrt(Math.max(0.02, 1 - d * d));
      const ux = d > 1e-4 ? nx / d : 1, uy = d > 1e-4 ? ny / d : 0;
      const ext = rad * (rays ? 7 : fresh ? 3 : 1.6);
      const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(MT - 1, Math.ceil(cx + ext));
      const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(MT - 1, Math.ceil(cy + ext));
      const ph = rnd() * TAU;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const i = y * MT + x;
        if (!inside[i]) continue;
        const dx = x - cx, dy = y - cy;
        const dr = (dx * ux + dy * uy) / Math.max(nz, 0.2), dt = -dx * uy + dy * ux;
        const q = Math.hypot(dr, dt) / rad;
        if (q < 1) hgt[i] += depth * (q * q * 1.25 - 1);
        else if (q < 1.6) hgt[i] += depth * 0.25 * Math.exp(-Math.pow((q - 1) / 0.22, 2));
        if (fresh && q < 3) alb[i] += 0.1 * Math.exp(-q * 1.2) * (q > 0.9 ? 1 : 0.4);
        if (rays && q > 1 && q < 7) {
          const a = Math.atan2(dt, dr);
          alb[i] += 0.13 * Math.pow(Math.max(0, Math.cos(a * 7 + ph) * Math.cos(a * 3 - ph)), 6) * Math.exp(-(q - 1) / 2.5);
        }
      }
    }
    const nCraters = view === 'near' ? 600 : 950;
    for (let k = 0; k < nCraters; k++) {
      const rad = 1.3 + Math.pow(rnd(), 8) * 62;
      const a = rnd() * TAU, rr = Math.sqrt(rnd()) * (R - rad * 0.3);
      const cx = R + Math.cos(a) * rr, cy = R + Math.sin(a) * rr;
      const i = Math.floor(cy) * MT + Math.floor(cx);
      if (rad > 5 && alb[i] < 0.45 && rnd() < 0.75) continue;       // maria are younger: fewer big craters
      crater(cx, cy, rad, rad * 0.2, rnd() < 0.1, false);
    }
    const shadows = [];
    for (const [la, lo, rd, rays] of NAMED_CRATERS) {
      const p = project(la, lo, view);
      if (p.z < 0.08) continue;
      const rad = rd * D2R * R;
      crater(R + p.x * R, R + p.y * R, rad, rad * 0.22, rays, rays);
      if (la < -80) shadows.push([R + p.x * R, R + p.y * R, rad * 0.75]);   // permanently shadowed polar floor
    }
    // 3. shading from height-map normals + sphere normal
    const img = new ImageData(MT, MT), px4 = img.data;
    const [lx, ly, lz] = LIGHT;
    for (let py = 1; py < MT - 1; py++) for (let px = 1; px < MT - 1; px++) {
      const i = py * MT + px;
      if (!inside[i]) continue;
      const nx = (px + 0.5 - R) / R, ny = (py + 0.5 - R) / R, dist = Math.hypot(nx, ny), nz = Math.sqrt(Math.max(0, 1 - dist * dist));
      const gx = (hgt[i + 1] - hgt[i - 1]) * 0.5, gy = (hgt[i + MT] - hgt[i - MT]) * 0.5;
      let sx = nx - gx * 0.42, sy = ny - gy * 0.42, sz = nz;
      const l = Math.hypot(sx, sy, sz); sx /= l; sy /= l; sz /= l;
      const lam = Math.max(0, sx * lx + sy * ly + sz * lz);
      let b = clamp(alb[i]) * (0.05 + 1.1 * Math.pow(lam, 0.85));
      for (const [sx0, sy0, sr] of shadows) if (Math.hypot(px - sx0, py - sy0) < sr) b *= 0.3;
      const edge = clamp((1 - dist) * R * 1.2);
      const o = i * 4;
      px4[o] = Math.min(255, b * 238); px4[o + 1] = Math.min(255, b * 232); px4[o + 2] = Math.min(255, b * 224); px4[o + 3] = edge * 255;
    }
    const c = makeCanvas(MT, MT);
    c.getContext('2d').putImageData(img, 0, 0);
    moonTex[view] = c;
  }

  // night: 0 (lit as rendered) .. 1 (mostly dark). view: 'near' | 'far'
  function moon(ctx, x, y, r, o = {}) {
    glow(ctx, x, y, r * 1.18, 'rgba(200,210,230,ALPHA)', 0.06);
    ctx.drawImage(moonTex[o.view || 'near'] || moonTex.near, x - r, y - r, r * 2, r * 2);
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

  // ================================================================ EARTH
  const ET = 512;
  let earthTex = null;
  function buildEarth() {
    const R = ET / 2, land = makeNoise(11), wet = makeNoise(23), cloud = makeNoise(37);
    const img = new ImageData(ET, ET), px4 = img.data;
    const [lx, ly, lz] = LIGHT;
    const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz);
    for (let py = 0; py < ET; py++) for (let px = 0; px < ET; px++) {
      const nx = (px + 0.5 - R) / R, ny = (py + 0.5 - R) / R, d2 = nx * nx + ny * ny;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2), dist = Math.sqrt(d2);
      // rotate the globe a little so interesting continents face the viewer
      const X = nx * 0.8 + nz * 0.6, Z = -nx * 0.6 + nz * 0.8, Y = ny;
      const h = land(X * 1.6 + 2, Y * 1.6, Z * 1.6, 6);
      const lat = Math.abs(Y);
      let r, g, b;
      const isLand = h > 0.53;
      if (isLand) {
        const m = wet(X * 3, Y * 3, Z * 3, 4);
        const desert = smooth(0.2, 0.42, lat) * (1 - smooth(0.45, 0.6, lat)) * smooth(0.45, 0.6, 1 - m);
        const elev = smooth(0.53, 0.75, h);
        r = lerp(46, 150, desert) + elev * 30; g = lerp(84, 124, desert) + elev * 20; b = lerp(42, 78, desert) + elev * 12;
      } else {
        const depth = smooth(0.35, 0.53, h);
        r = lerp(6, 22, depth); g = lerp(26, 78, depth); b = lerp(66, 130, depth);
      }
      if (lat > 0.82) { const ice = smooth(0.82, 0.9, lat); r = lerp(r, 232, ice); g = lerp(g, 238, ice); b = lerp(b, 245, ice); }
      const lam = Math.max(0, nx * lx + ny * ly + nz * lz);
      let spec = 0;
      if (!isLand) spec = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 70) * 170;
      r = r * (0.04 + 1.05 * lam) + spec; g = g * (0.04 + 1.05 * lam) + spec; b = b * (0.04 + 1.05 * lam) + spec;
      // clouds
      const cv = cloud(X * 2.6 + 7, Y * 3.4, Z * 2.6, 6);
      const ca = smooth(0.5, 0.72, cv) * 0.92;
      const cl = 245 * (0.05 + 1.0 * lam);
      r = lerp(r, cl, ca); g = lerp(g, cl, ca); b = lerp(b, cl * 1.02, ca);
      // atmospheric scattering at the limb
      const rim = Math.pow(1 - nz, 2.5) * (0.25 + lam);
      r += rim * 60; g += rim * 120; b += rim * 230;
      const o = (py * ET + px) * 4;
      px4[o] = Math.min(255, r); px4[o + 1] = Math.min(255, g); px4[o + 2] = Math.min(255, b);
      px4[o + 3] = clamp((1 - dist) * R * 1.2) * 255;
    }
    const c = makeCanvas(ET, ET);
    c.getContext('2d').putImageData(img, 0, 0);
    earthTex = c;
  }

  function earth(ctx, x, y, r) {
    const halo = ctx.createRadialGradient(x, y, r * 0.96, x, y, r * 1.12);
    halo.addColorStop(0, 'rgba(90,150,255,0.35)'); halo.addColorStop(1, 'rgba(90,150,255,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, TAU); ctx.fill();
    ctx.drawImage(earthTex, x - r, y - r, r * 2, r * 2);
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
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fl = 12 + Math.random() * 5;
      const fg = ctx.createLinearGradient(-22, 0, -22 - fl, 0);
      fg.addColorStop(0, 'rgba(200,225,255,0.85)'); fg.addColorStop(1, 'rgba(120,160,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(-22 - fl, 0); ctx.lineTo(-22, 4); ctx.fill();
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
    earth(ctx, 150, 130, 40);
    const mx = 930, my = 420, mr = 230, rot = -0.28;
    const p = onEllipse(mx, my, 320, 70, rot, t * 0.3);
    orbitHalf(ctx, mx, my, 320, 70, rot, false, COL.cyan, 0.8, 0.3);
    if (!p.front) spacecraft(ctx, p.x, p.y, 0.6, Math.sin(t) * 0.1, craftCfg(), t);
    moon(ctx, mx, my, mr);
    orbitHalf(ctx, mx, my, 320, 70, rot, true, COL.cyan, 1, 0.5);
    if (p.front) spacecraft(ctx, p.x, p.y, 1, Math.sin(t) * 0.1, craftCfg(), t);
  };

  const BRIEF = { e: { x: 170, y: 480 }, c: { x: 380, y: 170 }, m: { x: 680, y: 220 } };
  S.BRIEFING = (ctx, t) => {
    background(ctx, t, 2); grid(ctx);
    earth(ctx, BRIEF.e.x, BRIEF.e.y, 85);
    moon(ctx, BRIEF.m.x, BRIEF.m.y, 52);
    const p0 = { x: 240, y: 430 }, p2 = { x: 630, y: 235 };
    route(ctx, p0, BRIEF.c, p2, t, 0);
    const pr = (t * 0.1) % 1, q = qb(p0, BRIEF.c, p2, pr), q2 = qb(p0, BRIEF.c, p2, Math.min(1, pr + 0.01));
    spacecraft(ctx, q.x, q.y, 0.5, Math.atan2(q2.y - q.y, q2.x - q.x), craftCfg(), t);
    tag(ctx, 'EARTH', BRIEF.e.x, BRIEF.e.y + 108, COL.label, 'center');
    tag(ctx, 'MOON', BRIEF.m.x, BRIEF.m.y + 72, COL.label, 'center');
    tag(ctx, `MEAN DISTANCE ${NasaData.show('Mean distance from Earth (semi-major axis)', '')}`, BRIEF.m.x, BRIEF.m.y + 90, COL.faint, 'center');
    tag(ctx, 'SURVEY TARGET · YOUR CHOICE', BRIEF.m.x, BRIEF.m.y - 70, COL.amber, 'center');
    for (const reg of Object.values(REGIONS)) {
      if (reg.side === 'far') continue;
      const p = project(reg.lat, reg.lon, 'near');
      ctx.fillStyle = `rgba(232,165,75,${0.5 + 0.4 * Math.sin(t * 3 + reg.lat)})`;
      ctx.fillRect(BRIEF.m.x + p.x * 52 - 1.5, BRIEF.m.y + p.y * 52 - 1.5, 3, 3);
    }
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
  const LT = { ignite: 3, lift: 3.6, space: 7.2, sep: 8.2, end: 10.5 };

  // Camera shake: strong kick at ignition, sustained rumble during ascent, pyro jolt at separation.
  function launchShake(lt) {
    let a = 0;
    if (lt >= LT.ignite && lt < LT.space) {
      const since = lt - LT.ignite;
      a = 11 * Math.exp(-since * 1.6) + 3.2 * clamp(since / 0.4) * (1 - clamp((lt - LT.lift - 2) / 1.6));
    }
    if (lt >= LT.sep && lt < LT.sep + 0.6) a += 4 * (1 - (lt - LT.sep) / 0.6);
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
      } else if (Math.random() < 0.35) {
        emit({ x: rx + (Math.random() - 0.5) * 20, y: 596, vx: (Math.random() - 0.5) * 16, vy: -12, life: 2, max: 2, size: 5, grow: 8, add: false, soft: true, alpha: 0.35, color: '215,220,228' });
      }
      drawParticles(ctx, cam);
      rocket(ctx, rx, ry, 1.35, type, t, thrust);
      if (lt < LT.ignite) stamp(ctx, `T − ${Math.ceil(LT.ignite - lt)}`, 640, 150, COL.white, 44);
      else if (lt < LT.lift + 1.4) stamp(ctx, 'LIFTOFF', 640, 150, COL.white, 38);
      const flash = clamp((lt - (LT.space - 0.35)) / 0.35);
      if (flash > 0) { ctx.fillStyle = `rgba(0,0,0,${flash})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    } else {
      background(ctx, t, 18);
      earth(ctx, 420, 1560, 1000);
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
      if (lt > LT.end - 0.8) stamp(ctx, 'NOMINAL ORBIT', 420, 160, COL.green, 24);
      if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(-20, -20, W + 40, H + 40); }
    }
  };

  const TR = { e: { x: 150, y: 480, r: 70 }, m: { x: 640, y: 230, r: 48 }, p0: { x: 205, y: 438 }, p1: { x: 360, y: 110 }, p2: { x: 595, y: 245 } };
  const TRANSFER_TIME = 6.5;
  S.TRANSFER = (ctx, t) => {
    hazardShake(ctx, t);
    background(ctx, t, 8); grid(ctx, 0.02);
    earth(ctx, TR.e.x, TR.e.y, TR.e.r);
    moon(ctx, TR.m.x, TR.m.y, TR.m.r);
    const pr = Game.phase === 'arrived' ? 1 : ease(clamp(progressT('cruise') / TRANSFER_TIME));
    route(ctx, TR.p0, TR.p1, TR.p2, t, pr);
    let q, ang;
    if (pr < 1) {
      q = qb(TR.p0, TR.p1, TR.p2, pr);
      const q2 = qb(TR.p0, TR.p1, TR.p2, Math.min(1, pr + 0.01));
      ang = Math.atan2(q2.y - q.y, q2.x - q.x);
    } else {
      const th = Game.phaseT * 1.2;
      q = { x: TR.m.x + Math.cos(th) * 80, y: TR.m.y + Math.sin(th) * 28 };
      ang = th + Math.PI / 2;
    }
    drawParticles(ctx);
    spacecraft(ctx, q.x, q.y, 0.7, ang, craftCfg(), t, { thrust: (pr >= 1 && Game.phaseT < 1.6) || evading() });
    hazardFx(ctx, t, q.x, q.y);
    const dist = NasaData.num('Mean distance from Earth (semi-major axis)');
    if (!isNaN(dist)) {
      tag(ctx, 'RANGE TO MOON', 40, 112);
      text(ctx, `${Math.round(dist * (1 - pr)).toLocaleString('en-US')} km`, 40, 134, { size: 22, color: COL.white, weight: 400 });
      text(ctx, 'animation · mean distance from NASA dataset', 40, 156, { size: 9.5, color: COL.faint });
    }
    tag(ctx, 'EARTH', TR.e.x, TR.e.y + 92, COL.label, 'center');
    tag(ctx, 'MOON', TR.m.x, TR.m.y + 66, COL.label, 'center');
    if (pr >= 1) tag(ctx, 'LUNAR ORBIT INSERTION BURN', TR.m.x, TR.m.y - 72, COL.green, 'center');
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
    moon(ctx, OR.x, OR.y, OR.r);
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
    earth(ctx, TX.e.x, TX.e.y, TX.e.r);
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
    earth(ctx, 180, 470, 78);
    moon(ctx, 690, 215, 52);
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
    moon(ctx, 1180, 700, 260);
    earth(ctx, 90, 90, 30);
  };

  function frame(ctx, t, dt) {
    const fn = S[Game.state];
    ctx.save();
    if (fn) fn(ctx, t, dt);
    ctx.restore();
  }

  function init() { buildStars(); buildMoon('near'); buildEarth(); setTimeout(() => buildMoon('far'), 60); }

  const surveyTarget = () => targetPos(SV.x, SV.y, SV.r);

  return { init, frame, updateParticles, clearParticles, burst, emit, impact, packets, surveyTarget, SCAN_TIME, TX_TIME, TRANSFER_TIME, LT, W, H };
})();
