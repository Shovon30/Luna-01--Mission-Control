// Procedural Canvas 2D rendering. Every visual in the game is drawn here by code:
// stars, Earth, Moon, craters, spacecraft, rocket, flames, particles, beams, pulses.

const Draw = (() => {
  const W = 1280, H = 720, TAU = Math.PI * 2;
  const COL = {
    cyan: '#5ce1ff', amber: '#ffb347', green: '#58f29b', red: '#ff5d5d', white: '#e8f4ff',
    dim: 'rgba(92,225,255,0.22)', font: '"Consolas","Lucida Console","Courier New",monospace',
  };

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const easeIn = t => t * t * t;

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // ================================================================ STARS
  let starLayer = null;
  const twinkles = [];
  function buildStars() {
    const c = makeCanvas(W, H), g = c.getContext('2d'), r = mulberry32(7);
    for (let i = 0; i < 6; i++) {
      const x = r() * W, y = r() * H, rad = 220 + r() * 320;
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, i % 2 ? 'rgba(70,90,200,0.07)' : 'rgba(130,60,170,0.05)');
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 480; i++) {
      const x = r() * W, y = r() * H, s = r(), a = 0.2 + r() * 0.65, tint = r();
      const size = s > 0.97 ? 2 : s > 0.85 ? 1.3 : 0.8;
      g.fillStyle = tint > 0.92 ? `rgba(255,215,170,${a})` : tint > 0.82 ? `rgba(170,205,255,${a})` : `rgba(255,255,255,${a})`;
      g.fillRect(x, y, size, size);
    }
    starLayer = c;
    for (let i = 0; i < 60; i++) twinkles.push({ x: r() * W, y: r() * H, p: r() * TAU, s: 0.8 + r() * 1.6, sp: 1 + r() * 2.5 });
  }

  function background(ctx, t, drift = 4) {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#040a18'); bg.addColorStop(1, '#010308');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    const off = ((t * drift) % W + W) % W;
    ctx.drawImage(starLayer, -off, 0); ctx.drawImage(starLayer, W - off, 0);
    for (const s of twinkles) {
      const a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.sp + s.p));
      const x = ((s.x - off) % W + W) % W;
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(x - s.s / 2, s.y - s.s / 2, s.s, s.s);
      if (s.s > 2) { ctx.fillRect(x - s.s * 1.5, s.y - 0.4, s.s * 3, 0.8); ctx.fillRect(x - 0.4, s.y - s.s * 1.5, 0.8, s.s * 3); }
    }
  }

  function grid(ctx, alpha = 0.035) {
    ctx.strokeStyle = `rgba(92,225,255,${alpha})`; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 40) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += 40) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
  }

  function text(ctx, str, x, y, o = {}) {
    ctx.save();
    ctx.font = `${o.weight || 600} ${o.size || 12}px ${COL.font}`;
    ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'middle';
    ctx.fillStyle = o.color || COL.cyan;
    if (o.glow) { ctx.shadowColor = o.color || COL.cyan; ctx.shadowBlur = o.glow; }
    if (o.spacing) { try { ctx.letterSpacing = o.spacing + 'px'; } catch (e) { /* older browsers */ } }
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  function glow(ctx, x, y, r, color, alpha = 0.5) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('ALPHA', alpha));
    g.addColorStop(1, color.replace('ALPHA', 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // ================================================================ MOON
  const MT = 768;
  let moonTex = null;
  const TARGET = { u: 0.14, v: 0.74 }; // south polar survey target, in moon-radius units from centre

  function crater(g, x, y, rad) {
    const f = g.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.05, x, y, rad);
    f.addColorStop(0, 'rgba(30,30,34,0.36)');
    f.addColorStop(0.75, 'rgba(80,80,84,0.14)');
    f.addColorStop(1, 'rgba(120,120,120,0)');
    g.fillStyle = f; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    g.lineWidth = Math.max(1, rad * 0.14);
    g.strokeStyle = 'rgba(240,240,230,0.2)';           // lit inner wall (light from upper-left)
    g.beginPath(); g.arc(x, y, rad * 0.9, -0.5, Math.PI * 0.95); g.stroke();
    g.strokeStyle = 'rgba(20,20,26,0.22)';             // shadowed inner wall
    g.beginPath(); g.arc(x, y, rad * 0.9, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
  }

  function buildMoon() {
    const c = makeCanvas(MT, MT), g = c.getContext('2d'), r = mulberry32(42), R = MT / 2;
    g.save(); g.beginPath(); g.arc(R, R, R, 0, TAU); g.clip();
    const base = g.createRadialGradient(R * 0.8, R * 0.75, R * 0.1, R, R, R);
    base.addColorStop(0, '#d2d2cb'); base.addColorStop(1, '#8e8e89');
    g.fillStyle = base; g.fillRect(0, 0, MT, MT);
    for (let i = 0; i < 70; i++) {
      const x = r() * MT, y = r() * MT, rad = 20 + r() * 100, a = 0.03 + r() * 0.06, light = r() < 0.5;
      const m = g.createRadialGradient(x, y, 0, x, y, rad);
      m.addColorStop(0, light ? `rgba(255,255,248,${a})` : `rgba(50,50,55,${a})`);
      m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const maria = [[0.36, 0.32, 0.17], [0.56, 0.26, 0.12], [0.63, 0.44, 0.11], [0.3, 0.52, 0.12], [0.46, 0.5, 0.08], [0.7, 0.3, 0.07], [0.22, 0.36, 0.08]];
    for (const [mx, my, ms] of maria) {
      for (let k = 0; k < 7; k++) {
        const x = (mx + (r() - 0.5) * ms) * MT, y = (my + (r() - 0.5) * ms * 0.8) * MT, rad = ms * MT * (0.35 + r() * 0.35);
        const m = g.createRadialGradient(x, y, 0, x, y, rad);
        m.addColorStop(0, 'rgba(62,64,72,0.30)'); m.addColorStop(0.7, 'rgba(62,64,72,0.18)'); m.addColorStop(1, 'rgba(62,64,72,0)');
        g.fillStyle = m; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 300; i++) {
      const rad = 1.8 + Math.pow(r(), 4.5) * 46, x = r() * MT, y = r() * MT;
      if (Math.hypot(x - R, y - R) > R - rad * 0.2) continue;
      crater(g, x, y, rad);
    }
    // bright ray crater (Tycho-like), southern hemisphere
    const tx = R * 0.86, ty = R * 1.45;
    g.strokeStyle = 'rgba(255,255,250,0.07)';
    for (let k = 0; k < 18; k++) {
      const a = r() * TAU, len = 60 + r() * 160;
      g.lineWidth = 2 + r() * 4;
      g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + Math.cos(a) * len, ty + Math.sin(a) * len); g.stroke();
    }
    crater(g, tx, ty, 14);
    // survey target: large polar crater with permanently shadowed floor
    const cx = R + TARGET.u * R, cy = R + TARGET.v * R;
    crater(g, cx, cy, R * 0.1);
    g.fillStyle = 'rgba(8,10,18,0.55)';
    g.beginPath(); g.ellipse(cx - 3, cy - 2, R * 0.07, R * 0.06, 0, 0, TAU); g.fill();
    g.restore();
    moonTex = c;
  }

  // night: 0 (fully lit) .. 1 (mostly dark)
  function moon(ctx, x, y, r, o = {}) {
    glow(ctx, x, y, r * 1.35, 'rgba(190,205,255,ALPHA)', 0.12);
    ctx.drawImage(moonTex, x - r, y - r, r * 2, r * 2);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    const sh = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.15, x, y, r * 1.05);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.65, 'rgba(0,0,12,0.12)'); sh.addColorStop(1, 'rgba(0,0,18,0.7)');
    ctx.fillStyle = sh; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (o.night > 0) {
      const p = lerp(1.1, 0.15, o.night);
      const ng = ctx.createLinearGradient(x - r, y, x + r, y);
      ng.addColorStop(clamp(p - 0.25), 'rgba(3,6,20,0)');
      ng.addColorStop(clamp(p), 'rgba(3,6,20,0.88)');
      ng.addColorStop(1, 'rgba(3,6,20,0.92)');
      ctx.fillStyle = ng; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(220,230,255,0.12)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  }
  const targetPos = (x, y, r) => ({ x: x + TARGET.u * r, y: y + TARGET.v * r });

  function targetMarker(ctx, x, y, t, color = COL.amber, size = 1) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 1.6;
    for (let k = 0; k < 3; k++) {
      const p = ((t * 0.6 + k / 3) % 1);
      ctx.globalAlpha = 1 - p;
      ctx.beginPath(); ctx.arc(x, y, (8 + p * 34) * size, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const s = 14 * size, gap = 5 * size;
    ctx.beginPath();
    ctx.moveTo(x - s, y); ctx.lineTo(x - gap, y); ctx.moveTo(x + gap, y); ctx.lineTo(x + s, y);
    ctx.moveTo(x, y - s); ctx.lineTo(x, y - gap); ctx.moveTo(x, y + gap); ctx.lineTo(x, y + s);
    ctx.stroke();
    ctx.rotate(0);
    ctx.strokeRect(x - 20 * size, y - 20 * size, 40 * size, 40 * size);
    ctx.restore();
  }

  // ================================================================ EARTH
  const LAND = (() => {
    const r = mulberry32(11), blobs = [];
    const continents = [[0.2, 0.5], [1.1, 0.2], [2.0, 0.7], [2.9, -0.3], [4.1, 0.35], [5.0, -0.5], [5.7, 0.9]];
    for (const [lon, lat] of continents) {
      for (let k = 0; k < 6; k++) blobs.push({ lon: lon + (r() - 0.5) * 0.9, lat: lat + (r() - 0.5) * 0.6, s: 0.08 + r() * 0.14, dry: r() < 0.3 });
    }
    return blobs;
  })();
  const CLOUDS = (() => {
    const r = mulberry32(99), c = [];
    for (let k = 0; k < 22; k++) c.push({ lon: r() * TAU, lat: (r() - 0.5) * 2.4, s: 0.05 + r() * 0.12, w: 1.5 + r() * 2 });
    return c;
  })();

  function sphereBlob(ctx, x, y, r, lon, lat, s, w = 1) {
    const c = Math.cos(lon);
    if (c < -0.1) return;
    const px = x + r * Math.cos(lat) * Math.sin(lon), py = y - r * Math.sin(lat);
    ctx.beginPath();
    ctx.ellipse(px, py, Math.max(0.5, s * r * w * Math.max(0.12, c)), s * r * 0.8, 0, 0, TAU);
    ctx.fill();
  }

  function earth(ctx, x, y, r, t) {
    glow(ctx, x, y, r * 1.45, 'rgba(90,170,255,ALPHA)', 0.35);
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    const oc = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    oc.addColorStop(0, '#3d86e8'); oc.addColorStop(1, '#0b2560');
    ctx.fillStyle = oc; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const rot = t * 0.12;
    for (const b of LAND) {
      ctx.fillStyle = b.dry ? '#9a9b58' : '#3c9a5c';
      sphereBlob(ctx, x, y, r, b.lon + rot, b.lat, b.s);
    }
    ctx.fillStyle = 'rgba(245,250,255,0.85)';
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.97, r * 0.55, r * 0.12, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.98, r * 0.6, r * 0.12, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (const c of CLOUDS) sphereBlob(ctx, x, y, r, c.lon + t * 0.17, c.lat, c.s, c.w);
    const sh = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.55, 'rgba(0,4,20,0.1)'); sh.addColorStop(1, 'rgba(0,4,20,0.8)');
    ctx.fillStyle = sh; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = 'rgba(140,210,255,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r + 1, Math.PI * 0.75, Math.PI * 1.75); ctx.stroke();
  }

  // ================================================================ SPACECRAFT
  // cfg: { power: 'basic'|'highcap'|'battery', instrument: 'camera'|'radiation'|'spectrometer', antenna: px }
  function panel(ctx, x, y, w, h, t) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#1d3780'); g.addColorStop(1, '#0e1c46');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(110,160,255,0.55)'; ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (let gx = x + w / 4; gx < x + w - 0.5; gx += w / 4) { ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); }
    ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
    ctx.stroke();
    const gl = (t * 0.4) % 1.6 - 0.3;                         // travelling glint
    if (gl > 0 && gl < 1) {
      ctx.fillStyle = 'rgba(200,230,255,0.25)';
      ctx.fillRect(x + gl * w - 2, y, 4, h);
    }
    ctx.strokeStyle = '#8fa3c7'; ctx.lineWidth = 1.2; ctx.strokeRect(x, y, w, h);
  }

  function spacecraft(ctx, x, y, s, ang, cfg = {}, t = 0, o = {}) {
    const deploy = o.deploy == null ? 1 : o.deploy;
    const pw = cfg.power || 'basic', inst = cfg.instrument || 'camera', dish = cfg.antenna || 10;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang); ctx.scale(s, s);
    if (o.glow) glow(ctx, 0, 0, 60, 'rgba(92,225,255,ALPHA)', 0.25);

    // solar arrays
    const P = pw === 'highcap' ? { n: 2, w: 30, h: 22 } : pw === 'battery' ? { n: 1, w: 38, h: 20 } : { n: 1, w: 32, h: 16 };
    for (const side of [-1, 1]) {
      const total = P.n * (P.w + 3) * deploy;
      ctx.strokeStyle = '#b8c3d6'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(side * 16, 0); ctx.lineTo(side * (20 + total), 0); ctx.stroke();
      for (let k = 0; k < P.n; k++) {
        const w = P.w * deploy;
        if (w < 1) continue;
        const px = side > 0 ? 22 + k * (w + 3) : -22 - k * (w + 3) - w;
        panel(ctx, px, -P.h / 2, w, P.h, t + k * 0.3);
      }
      if (o.tint && o.tint.power) {
        ctx.strokeStyle = o.tint.power; ctx.lineWidth = 2;
        const px = side > 0 ? 20 : -20 - total - 4;
        ctx.strokeRect(px, -P.h / 2 - 4, total + 4, P.h + 8);
      }
    }

    // high-gain antenna (top)
    ctx.strokeStyle = '#c9d2e0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, -22); ctx.stroke();
    ctx.fillStyle = '#e6ebf3';
    ctx.beginPath(); ctx.ellipse(0, -24, dish, dish * 0.38, 0, Math.PI, TAU); ctx.fill();
    ctx.strokeStyle = '#9aa6ba'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(0, -24, dish, dish * 0.38, 0, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, -24 - dish * 0.7); ctx.stroke();
    ctx.fillStyle = COL.cyan; ctx.fillRect(-1.2, -26 - dish * 0.7, 2.4, 2.4);

    // bus (gold multilayer insulation)
    const g = ctx.createLinearGradient(-16, -15, 16, 15);
    g.addColorStop(0, '#f2c25a'); g.addColorStop(0.5, '#c08a2e'); g.addColorStop(1, '#7c521a');
    ctx.fillStyle = g; ctx.fillRect(-16, -15, 32, 30);
    ctx.strokeStyle = 'rgba(255,235,170,0.5)'; ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(-14, -8); ctx.lineTo(-4, -11); ctx.lineTo(6, -6); ctx.lineTo(14, -9);
    ctx.moveTo(-13, 5); ctx.lineTo(-2, 2); ctx.lineTo(9, 8); ctx.lineTo(14, 4);
    ctx.stroke();
    ctx.strokeStyle = '#5b3b10'; ctx.lineWidth = 1.2; ctx.strokeRect(-16, -15, 32, 30);
    if (o.tint && o.tint.mass) { ctx.strokeStyle = o.tint.mass; ctx.lineWidth = 2; ctx.strokeRect(-20, -19, 40, 38); }

    // battery pack
    if (pw === 'battery') {
      ctx.fillStyle = '#2b3240'; ctx.fillRect(-12, 15, 12, 7);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = Math.sin(t * 3 + k) > -0.3 ? COL.green : '#1e4a30';
        ctx.fillRect(-10 + k * 3.5, 17.5, 2, 2);
      }
    }

    // instrument (bottom)
    if (inst === 'camera') {
      ctx.fillStyle = '#3a3f4a'; ctx.fillRect(2, 15, 10, 9);
      ctx.fillStyle = '#6fb6ff'; ctx.beginPath(); ctx.arc(7, 26, 3.4, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(5.5, 24.5, 1.4, 1.4);
    } else if (inst === 'spectrometer') {
      ctx.fillStyle = '#d7dbe4'; ctx.fillRect(0, 15, 14, 10);
      ctx.fillStyle = '#111'; ctx.fillRect(2, 22, 10, 1.5);
      const sp = ctx.createLinearGradient(2, 0, 12, 0);
      ['#ff4d4d', '#ffb347', '#fff45c', '#58f29b', '#5ce1ff', '#9a6bff'].forEach((c, k) => sp.addColorStop(k / 5, c));
      ctx.fillStyle = sp; ctx.fillRect(2, 18, 10, 2);
    } else {
      ctx.strokeStyle = '#c9d2e0'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(8, 15); ctx.lineTo(16, 30); ctx.stroke();
      ctx.fillStyle = '#e0e4ec'; ctx.beginPath(); ctx.arc(16, 31, 3.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = COL.amber; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(16, 31, 5.5 + Math.sin(t * 4) * 0.8, 0, TAU); ctx.stroke();
    }

    // thruster nozzle + nav lights
    ctx.fillStyle = '#6b7385';
    ctx.beginPath(); ctx.moveTo(-16, -4); ctx.lineTo(-22, -6); ctx.lineTo(-22, 6); ctx.lineTo(-16, 4); ctx.closePath(); ctx.fill();
    if (o.thrust) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const fl = 10 + Math.random() * 6;
      const fg = ctx.createLinearGradient(-22, 0, -22 - fl, 0);
      fg.addColorStop(0, 'rgba(180,230,255,0.9)'); fg.addColorStop(1, 'rgba(90,160,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.moveTo(-22, -4); ctx.lineTo(-22 - fl, 0); ctx.lineTo(-22, 4); ctx.fill();
      ctx.restore();
    }
    const blink = (t * 1.5) % 1 < 0.15;
    ctx.fillStyle = blink ? '#ff4040' : '#5a1a1a'; ctx.fillRect(-17, -16, 2.5, 2.5);
    ctx.fillStyle = blink ? '#40ff80' : '#1a4a2a'; ctx.fillRect(14.5, -16, 2.5, 2.5);
    ctx.restore();
  }

  const craftCfg = () => {
    const sel = Game.sel;
    const r = ROCKETS[M.selectedRocket || sel.rocket];
    return {
      power: M.selectedPowerSystem || sel.power || 'basic',
      instrument: M.selectedInstrument || sel.instrument || 'camera',
      antenna: r ? r.antennaSize : 10,
    };
  };

  // ================================================================ ROCKET
  function flame(ctx, len, w, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const j = () => 0.85 + Math.random() * 0.3;
    const layers = [[1, w, 'rgba(255,120,40,0.75)'], [0.7, w * 0.65, 'rgba(255,210,80,0.85)'], [0.4, w * 0.35, 'rgba(255,255,230,0.95)']];
    for (const [lf, lw, c] of layers) {
      const L = len * lf * j();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(-lw / 2, 0);
      ctx.quadraticCurveTo(-lw * 0.6, L * 0.4, 0, L);
      ctx.quadraticCurveTo(lw * 0.6, L * 0.4, lw / 2, 0);
      ctx.closePath(); ctx.fill();
    }
    glow(ctx, 0, len * 0.2, len * 0.7, 'rgba(255,150,60,ALPHA)', 0.35);
    ctx.restore();
  }

  // (x, y) = base of the engine bell
  function rocket(ctx, x, y, s, type, t, thrust = 0) {
    const h = type === 'heavy' ? 150 : type === 'medium' ? 132 : 112, w = type === 'light' ? 16 : 20;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (thrust > 0) {
      ctx.save(); ctx.translate(0, 4); flame(ctx, 50 * thrust + 20, w * 1.1, t); ctx.restore();
      if (type === 'heavy') for (const sx of [-17, 17]) { ctx.save(); ctx.translate(sx, -2); flame(ctx, 36 * thrust + 12, 10, t); ctx.restore(); }
    }
    const body = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    body.addColorStop(0, '#9aa3b2'); body.addColorStop(0.35, '#f5f7fb'); body.addColorStop(1, '#8a92a3');
    if (type === 'heavy') {
      for (const sx of [-17, 17]) {
        ctx.fillStyle = body; ctx.fillRect(sx - 5, -86, 10, 84);
        ctx.beginPath(); ctx.moveTo(sx - 5, -86); ctx.quadraticCurveTo(sx, -100, sx + 5, -86); ctx.fill();
        ctx.fillStyle = '#2c3140'; ctx.fillRect(sx - 4, -2, 8, 4);
      }
    }
    ctx.fillStyle = '#3a404d';
    ctx.beginPath(); ctx.moveTo(-w * 0.35, 0); ctx.lineTo(-w * 0.5, 7); ctx.lineTo(w * 0.5, 7); ctx.lineTo(w * 0.35, 0); ctx.fill();
    ctx.fillStyle = body; ctx.fillRect(-w / 2, -h, w, h);
    ctx.fillStyle = '#1c2230';
    ctx.fillRect(-w / 2, -h * 0.3, w, 5);
    ctx.fillRect(-w / 2, -h * 0.72, w, 3);
    ctx.fillStyle = '#c33'; ctx.fillRect(-w / 2, -h * 0.5, w, 2);
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-w / 2, -h); ctx.quadraticCurveTo(-w / 2, -h - w * 1.3, 0, -h - w * 1.9); ctx.quadraticCurveTo(w / 2, -h - w * 1.3, w / 2, -h); ctx.fill();
    ctx.fillStyle = '#2a3140';
    for (const side of [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(side * w / 2, -24); ctx.lineTo(side * (w / 2 + 8), -2); ctx.lineTo(side * w / 2, -4); ctx.fill();
    }
    ctx.restore();
  }

  // ================================================================ PARTICLES
  const parts = [];
  function emit(p) { if (parts.length < 450) parts.push(Object.assign({ life: 1, max: 1, size: 2, grow: 0, drag: 1, add: true, color: '255,200,120' }, p)); }
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
      ctx.fillStyle = `rgba(${p.color},${a * (p.alpha || 1)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y + offY, Math.max(0.3, p.size), 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function clearParticles() { parts.length = 0; }

  function burst(x, y, n, color, speed = 120, life = 1.2) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, v = speed * (0.3 + Math.random() * 0.7);
      emit({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 1.5 + Math.random() * 2, drag: 0.97, color });
    }
  }

  // ================================================================ PATHS
  const qb = (p0, p1, p2, t) => ({
    x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x,
    y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y,
  });

  function route(ctx, p0, p1, p2, t, progress = 1, color = COL.cyan, dashed = true) {
    ctx.save();
    ctx.strokeStyle = 'rgba(92,225,255,0.3)'; ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.quadraticCurveTo(p1.x, p1.y, p2.x, p2.y); ctx.stroke();
    if (progress > 0) {
      ctx.setLineDash(dashed ? [] : [10, 6]);
      ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.shadowColor = color; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y);
      const n = 40;
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
    ctx.setLineDash(front ? [] : [4, 6]);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, rot, front ? 0 : Math.PI, front ? Math.PI : TAU);
    ctx.stroke();
    ctx.restore();
  }
  const onEllipse = (cx, cy, rx, ry, rot, th) => {
    const ex = rx * Math.cos(th), ey = ry * Math.sin(th);
    return { x: cx + ex * Math.cos(rot) - ey * Math.sin(rot), y: cy + ex * Math.sin(rot) + ey * Math.cos(rot), front: Math.sin(th) > 0 };
  };

  // ================================================================ SCENES
  const S = {};

  S.TITLE = (ctx, t) => {
    background(ctx, t, 3);
    earth(ctx, 150, 130, 34, t);
    const mx = 930, my = 420, mr = 220, rot = -0.28;
    const p = onEllipse(mx, my, 310, 70, rot, t * 0.35);
    orbitHalf(ctx, mx, my, 310, 70, rot, false, COL.cyan, 1, 0.35);
    if (!p.front) spacecraft(ctx, p.x, p.y, 0.7, Math.sin(t) * 0.1, craftCfg(), t);
    moon(ctx, mx, my, mr);
    orbitHalf(ctx, mx, my, 310, 70, rot, true, COL.cyan, 1.3, 0.55);
    if (p.front) spacecraft(ctx, p.x, p.y, 1.1, Math.sin(t) * 0.1, craftCfg(), t, { glow: true });
  };

  const BRIEF = { e: { x: 170, y: 480 }, c: { x: 380, y: 170 }, m: { x: 680, y: 220 } };
  S.BRIEFING = (ctx, t) => {
    background(ctx, t, 3); grid(ctx, 0.025);
    earth(ctx, BRIEF.e.x, BRIEF.e.y, 85, t);
    moon(ctx, BRIEF.m.x, BRIEF.m.y, 52);
    const p0 = { x: 240, y: 430 }, p2 = { x: 630, y: 235 };
    route(ctx, p0, BRIEF.c, p2, t, 0);
    const pr = (t * 0.12) % 1, q = qb(p0, BRIEF.c, p2, pr), q2 = qb(p0, BRIEF.c, p2, Math.min(1, pr + 0.01));
    spacecraft(ctx, q.x, q.y, 0.55, Math.atan2(q2.y - q.y, q2.x - q.x), craftCfg(), t);
    text(ctx, 'EARTH', BRIEF.e.x, BRIEF.e.y + 112, { align: 'center', size: 13, spacing: 3 });
    text(ctx, 'MOON', BRIEF.m.x, BRIEF.m.y + 76, { align: 'center', size: 13, spacing: 3 });
    text(ctx, `MEAN DISTANCE ${NasaData.show('Mean distance from Earth (semi-major axis)', '')}`, BRIEF.m.x, BRIEF.m.y + 96, { align: 'center', size: 11, color: COL.amber });
    text(ctx, 'TARGET: SOUTH POLAR REGION', BRIEF.m.x, BRIEF.m.y - 74, { align: 'center', size: 11, color: COL.amber });
    const tp = targetPos(BRIEF.m.x, BRIEF.m.y, 52);
    targetMarker(ctx, tp.x, tp.y, t, COL.amber, 0.45);
  };

  function designCraft(ctx, t, x, y, tint) {
    ctx.save();
    ctx.strokeStyle = 'rgba(92,225,255,0.18)'; ctx.lineWidth = 1;
    for (const rr of [90, 150, 210]) { ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - 240, y); ctx.lineTo(x + 240, y); ctx.moveTo(x, y - 230); ctx.lineTo(x, y + 230); ctx.stroke();
    ctx.strokeStyle = 'rgba(92,225,255,0.45)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 210, t * 0.4, t * 0.4 + 0.5); ctx.stroke();
    ctx.restore();
    spacecraft(ctx, x, y + Math.sin(t * 1.2) * 4, 3, Math.sin(t * 0.5) * 0.06, craftCfg(), t, { glow: true, tint });
  }

  function callout(ctx, x1, y1, x2, y2, label, value, color = COL.cyan) {
    ctx.save();
    ctx.strokeStyle = color; ctx.globalAlpha = 0.7; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x2 + (x2 > x1 ? 18 : -18), y2); ctx.stroke();
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x1, y1, 2.5, 0, TAU); ctx.fill();
    ctx.restore();
    const ax = x2 + (x2 > x1 ? 22 : -22), al = x2 > x1 ? 'left' : 'right';
    text(ctx, label, ax, y2 - 8, { align: al, size: 10, color: 'rgba(160,200,230,0.9)', spacing: 2 });
    text(ctx, value, ax, y2 + 7, { align: al, size: 13, color });
  }

  S.DESIGN = (ctx, t) => {
    background(ctx, t, 1); grid(ctx, 0.04);
    const x = 280, y = 390, sel = Game.sel;
    designCraft(ctx, t, x, y);
    text(ctx, 'SPACECRAFT SCHEMATIC · LUNA-01', 40, 96, { size: 12, spacing: 3 });
    const P = POWER_SYSTEMS[sel.power], I = INSTRUMENTS[sel.instrument], R = ROCKETS[sel.rocket];
    callout(ctx, x - 100, y, 150, 190, 'POWER', P ? P.name.toUpperCase() : '— SELECT —', P ? COL.cyan : COL.amber);
    callout(ctx, x, y - 90, 320, 170, 'ANTENNA', R ? R.antenna.toUpperCase() : '— SET BY ROCKET —', R ? COL.cyan : COL.amber);
    callout(ctx, x + 30, y + 80, 330, 590, 'INSTRUMENT', I ? I.name.toUpperCase() : '— SELECT —', I ? COL.cyan : COL.amber);
    if (R) {
      rocket(ctx, 70, 660, 1, R.id, t, 0);
      text(ctx, 'LAUNCH VEHICLE', 110, 610, { size: 10, color: 'rgba(160,200,230,0.9)', spacing: 2 });
      text(ctx, R.name.toUpperCase(), 110, 626, { size: 13 });
    } else text(ctx, 'LAUNCH VEHICLE: — SELECT —', 40, 640, { size: 12, color: COL.amber });
  };

  S.DESIGN_REVIEW = (ctx, t) => {
    background(ctx, t, 1); grid(ctx, 0.04);
    const rv = Game.review;
    const x = 360, y = 380;
    const col = id => (rv.checks.find(c => c.id === id).ok ? COL.green : COL.red);
    designCraft(ctx, t, x, y, { power: col('power'), mass: col('mass') });
    // sweeping review scan line
    const sy = y - 200 + ((t * 160) % 400);
    const sg = ctx.createLinearGradient(0, sy - 30, 0, sy);
    sg.addColorStop(0, 'rgba(92,225,255,0)'); sg.addColorStop(1, 'rgba(92,225,255,0.18)');
    ctx.fillStyle = sg; ctx.fillRect(x - 230, sy - 30, 460, 30);
    ctx.fillStyle = 'rgba(92,225,255,0.6)'; ctx.fillRect(x - 230, sy, 460, 1);
    rv.checks.forEach((c, k) => {
      const shown = Game.sceneT > 0.3 + k * 0.35;
      if (!shown) return;
      const cy = 150 + k * 34;
      text(ctx, `${c.ok ? '✓ OK  ' : '✗ FAIL'}  ${c.label.toUpperCase()}`, 40, cy, { size: 13, color: c.ok ? COL.green : COL.red, glow: 6 });
    });
    if (Game.sceneT > 1.8) {
      const ok = rv.ok;
      text(ctx, ok ? 'READY FOR LAUNCH' : 'DESIGN REJECTED', x, 640, { align: 'center', size: 22, color: ok ? COL.green : COL.red, glow: 12, spacing: 4, alpha: 0.6 + 0.4 * Math.abs(Math.sin(t * 3)) });
    }
  };

  // Launch timeline (seconds)
  const LT = { ignite: 3, lift: 3.6, space: 7.2, sep: 8.2, end: 10.5 };
  S.LAUNCH = (ctx, t, dt) => {
    const lt = Game.sceneT, type = M.selectedRocket || 'medium';
    if (lt < LT.space) {
      const climb = lt < LT.lift ? 0 : easeIn(clamp((lt - LT.lift) / (LT.space - LT.lift))) * 1400;
      const cam = Math.max(0, climb - 260);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      const k = clamp(cam / 900);
      sky.addColorStop(0, `rgb(${lerp(14, 2, k)},${lerp(34, 4, k)},${lerp(78, 12, k)})`);
      sky.addColorStop(1, `rgb(${lerp(58, 3, k)},${lerp(92, 8, k)},${lerp(140, 20, k)})`);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 0.25 + k * 0.75; ctx.drawImage(starLayer, 0, 0); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(0, cam);
      // ground & horizon
      ctx.fillStyle = '#0a0f18'; ctx.fillRect(0, 610, W, 500);
      ctx.fillStyle = '#121a28';
      ctx.beginPath(); ctx.moveTo(0, 612);
      for (let x = 0; x <= W; x += 80) ctx.lineTo(x, 600 - Math.abs(Math.sin(x * 0.013)) * 22);
      ctx.lineTo(W, 612); ctx.fill();
      // launch tower
      ctx.strokeStyle = '#3b4658'; ctx.lineWidth = 2;
      ctx.strokeRect(470, 430, 26, 180);
      ctx.beginPath();
      for (let yy = 430; yy < 610; yy += 18) { ctx.moveTo(470, yy); ctx.lineTo(496, yy + 18); ctx.moveTo(496, yy); ctx.lineTo(470, yy + 18); }
      ctx.moveTo(470, 470); ctx.lineTo(440, 470);
      ctx.stroke();
      ctx.fillStyle = (t * 2) % 1 < 0.5 ? '#ff4040' : '#401010'; ctx.fillRect(480, 424, 6, 6);
      ctx.fillStyle = '#1a2230'; ctx.fillRect(360, 606, 170, 10);
      ctx.restore();
      const thrust = lt < LT.ignite ? 0 : clamp((lt - LT.ignite) / 0.5) * (1 + (lt > LT.lift ? 0.4 : 0));
      const rx = 420, ry = 604 - climb + cam;
      if (thrust > 0) {
        const n = lt < LT.lift ? 6 : 4;
        for (let i = 0; i < n; i++) {
          emit({ x: rx + (Math.random() - 0.5) * 14, y: ry + 10 - cam, vx: (Math.random() - 0.5) * 60, vy: 160 + Math.random() * 120, life: 0.6, max: 0.6, size: 3 + Math.random() * 3, color: '255,170,80' });
          if (climb < 400) emit({ x: rx + (Math.random() - 0.5) * 40, y: 606, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 40, life: 2.2, max: 2.2, size: 8 + Math.random() * 8, grow: 14, drag: 0.97, add: false, alpha: 0.35, color: '190,195,205' });
        }
      } else if (Math.random() < 0.3) {
        emit({ x: rx + (Math.random() - 0.5) * 20, y: 590, vx: (Math.random() - 0.5) * 20, vy: -10, life: 1.5, max: 1.5, size: 3, grow: 6, add: false, alpha: 0.3, color: '220,225,235' });
      }
      drawParticles(ctx, cam);
      rocket(ctx, rx, ry, 1.35, type, t, thrust);
      if (lt < LT.ignite) text(ctx, `T-${Math.ceil(LT.ignite - lt)}`, 640, 120, { align: 'center', size: 64, color: COL.amber, glow: 16 });
      else if (lt < LT.lift + 1.2) text(ctx, 'LIFTOFF', 640, 120, { align: 'center', size: 48, color: COL.green, glow: 16, spacing: 8 });
      const flash = clamp((lt - (LT.space - 0.35)) / 0.35);
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }
    } else {
      background(ctx, t, 20);
      earth(ctx, 420, 1540, 1000, t * 0.2);
      const st = lt - LT.space;
      const flash = 1 - clamp(st / 0.4);
      const ux = 200 + st * 60, uy = 320 - st * 12;
      const sep = clamp((lt - LT.sep) / 1.2);
      const cx = ux + 40 + sep * 120, cy = uy - sep * 30;
      ctx.save(); ctx.translate(ux, uy); ctx.rotate(Math.PI / 2 - 0.12); ctx.scale(0.9, 0.9);
      ctx.fillStyle = '#c8ced9'; ctx.fillRect(-10, 0, 20, 60);
      ctx.fillStyle = '#3a404d'; ctx.fillRect(-7, 60, 14, 6);
      ctx.restore();
      if (lt < LT.sep) {
        spacecraft(ctx, cx, cy, 1.1, -0.12, craftCfg(), t, { deploy: 0 });
      } else {
        spacecraft(ctx, cx, cy, 1.1, -0.12 + sep * 0.12, craftCfg(), t, { deploy: ease(clamp((lt - LT.sep - 0.3) / 1.3)), glow: true });
      }
      drawParticles(ctx);
      if (lt > LT.sep) text(ctx, 'SPACECRAFT SEPARATION', 420, 110, { align: 'center', size: 20, color: COL.cyan, glow: 10, spacing: 4 });
      if (lt > LT.end - 0.8) text(ctx, 'LAUNCH SUCCESSFUL', 420, 150, { align: 'center', size: 26, color: COL.green, glow: 14, spacing: 5 });
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash})`; ctx.fillRect(0, 0, W, H); }
    }
  };

  const TR = { e: { x: 150, y: 480, r: 70 }, m: { x: 640, y: 230, r: 48 }, p0: { x: 205, y: 438 }, p1: { x: 360, y: 110 }, p2: { x: 595, y: 245 } };
  const TRANSFER_TIME = 6.5;
  S.TRANSFER = (ctx, t) => {
    background(ctx, t, 10); grid(ctx, 0.02);
    earth(ctx, TR.e.x, TR.e.y, TR.e.r, t);
    moon(ctx, TR.m.x, TR.m.y, TR.m.r);
    const pr = Game.phase === 'cruise' ? ease(clamp(Game.sceneT / TRANSFER_TIME)) : 1;
    route(ctx, TR.p0, TR.p1, TR.p2, t, pr);
    let q, ang;
    if (pr < 1) {
      q = qb(TR.p0, TR.p1, TR.p2, pr);
      const q2 = qb(TR.p0, TR.p1, TR.p2, Math.min(1, pr + 0.01));
      ang = Math.atan2(q2.y - q.y, q2.x - q.x);
      if (Math.random() < 0.6) emit({ x: q.x, y: q.y, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: 1.4, max: 1.4, size: 1.6, color: '92,225,255' });
    } else {
      const th = Game.phaseT * 1.4;
      q = { x: TR.m.x + Math.cos(th) * 78, y: TR.m.y + Math.sin(th) * 30 };
      ang = th + Math.PI / 2;
      if (Game.phaseT < 1.6 && Math.random() < 0.8) emit({ x: q.x, y: q.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.6, max: 0.6, size: 2, color: '180,230,255' });
    }
    drawParticles(ctx);
    spacecraft(ctx, q.x, q.y, 0.75, ang, craftCfg(), t, { thrust: pr >= 1 && Game.phaseT < 1.6, glow: true });
    const dist = NasaData.num('Mean distance from Earth (semi-major axis)');
    if (!isNaN(dist)) {
      text(ctx, 'DISTANCE TO MOON', 40, 110, { size: 11, color: 'rgba(160,200,230,0.9)', spacing: 2 });
      text(ctx, `${Math.round(dist * (1 - pr)).toLocaleString('en-US')} km`, 40, 132, { size: 22, color: COL.cyan, glow: 8 });
      text(ctx, 'animation · mean distance from NASA dataset', 40, 152, { size: 10, color: 'rgba(160,200,230,0.6)' });
    }
    text(ctx, 'EARTH', TR.e.x, TR.e.y + 96, { align: 'center', size: 12, spacing: 3 });
    text(ctx, 'MOON', TR.m.x, TR.m.y + 72, { align: 'center', size: 12, spacing: 3 });
    if (pr >= 1) text(ctx, 'LUNAR ORBIT INSERTION', TR.m.x, TR.m.y - 80, { align: 'center', size: 16, color: COL.green, glow: 10, spacing: 3 });
  };

  const OR = { x: 390, y: 390, r: 175, rot: -0.2, low: [225, 58], high: [330, 96] };
  S.ORBIT_DECISION = (ctx, t) => {
    background(ctx, t, 2); grid(ctx, 0.02);
    const active = Game.phase === 'choose' ? (Game.preview || Game.choice) : M.selectedOrbit;
    const orbitStyle = id => (id === active ? [COL.cyan, 2.5, 1] : ['rgba(160,200,230,1)', 1, 0.35]);
    for (const id of ['high', 'low']) { const [c, w, a] = orbitStyle(id); orbitHalf(ctx, OR.x, OR.y, OR[id][0], OR[id][1], OR.rot, false, c, w, a); }
    const act = active || 'high';
    const speed = act === 'low' ? 0.9 : 0.55;
    const p = onEllipse(OR.x, OR.y, OR[act][0], OR[act][1], OR.rot, t * speed);
    const cfg = craftCfg();
    if (!p.front) spacecraft(ctx, p.x, p.y, 0.55, Math.sin(t) * 0.2, cfg, t);
    moon(ctx, OR.x, OR.y, OR.r);
    for (const id of ['high', 'low']) { const [c, w, a] = orbitStyle(id); orbitHalf(ctx, OR.x, OR.y, OR[id][0], OR[id][1], OR.rot, true, c, w, a); }
    if (p.front) spacecraft(ctx, p.x, p.y, 0.8, Math.sin(t) * 0.2, cfg, t, { glow: true, thrust: Game.phase === 'inserting' });
    const lp = onEllipse(OR.x, OR.y, OR.low[0], OR.low[1], OR.rot, 1.25), hp = onEllipse(OR.x, OR.y, OR.high[0], OR.high[1], OR.rot, 1.1);
    text(ctx, 'LOW ORBIT', lp.x + 10, lp.y + 14, { size: 12, color: act === 'low' ? COL.cyan : 'rgba(160,200,230,0.6)', spacing: 2 });
    text(ctx, 'HIGHER ORBIT', hp.x + 10, hp.y + 14, { size: 12, color: act === 'high' ? COL.cyan : 'rgba(160,200,230,0.6)', spacing: 2 });
    text(ctx, `MOON · MEAN RADIUS ${NasaData.show('Mean radius', '')}`, OR.x, 680, { align: 'center', size: 11, color: 'rgba(160,200,230,0.75)', spacing: 1 });
    text(ctx, 'Orbits are stylised - not to scale (simplified game model)', OR.x, 698, { align: 'center', size: 10, color: 'rgba(160,200,230,0.5)' });
  };

  // Survey: polar orbit seen side-on; the craft passes the south pole target.
  const SV = { x: 400, y: 335, r: 235, rx: 92, ry: 282, rot: 0.08 };
  function surveyScene(ctx, t, o = {}) {
    background(ctx, t, 1.5);
    const tp = targetPos(SV.x, SV.y, SV.r);
    let th;
    if (Game.state === 'SURVEY' && Game.phase === 'scanning') th = Math.PI * (0.62 - 0.24 * clamp(Game.phaseT / SCAN_TIME));
    else if (o.parked || Game.phase === 'done') th = Math.PI * 0.4;
    else th = t * 0.45;
    const p = onEllipse(SV.x, SV.y, SV.rx, SV.ry, SV.rot, th);
    const cfg = craftCfg();
    orbitHalf(ctx, SV.x, SV.y, SV.rx, SV.ry, SV.rot, false, COL.cyan, 1, 0.35);
    if (!p.front) spacecraft(ctx, p.x, p.y, 0.6, 0, cfg, t);
    moon(ctx, SV.x, SV.y, SV.r, { night: o.night || 0 });
    targetMarker(ctx, tp.x, tp.y, t, COL.amber, 1);
    orbitHalf(ctx, SV.x, SV.y, SV.rx, SV.ry, SV.rot, true, COL.cyan, 1.4, 0.6);
    return { p, tp, cfg };
  }

  const SCAN_TIME = 4.5;
  S.SURVEY = (ctx, t) => {
    const { p, tp, cfg } = surveyScene(ctx, t);
    const scanning = Game.phase === 'scanning';
    if (scanning) {
      const mode = M.selectedObservation || 'standard';
      const width = mode === 'deep' ? 46 : mode === 'standard' ? 32 : 20;
      const sweep = Math.sin(Game.phaseT * 3) * width * 0.6;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const bg = ctx.createLinearGradient(p.x, p.y, tp.x, tp.y);
      bg.addColorStop(0, 'rgba(92,225,255,0.55)'); bg.addColorStop(1, 'rgba(92,225,255,0.08)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x - width + sweep, tp.y); ctx.lineTo(tp.x + width + sweep, tp.y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(180,240,255,0.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tp.x + sweep, tp.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(92,225,255,0.6)';
      const ringR = (Game.phaseT * 40) % 40;
      ctx.beginPath(); ctx.ellipse(tp.x + sweep, tp.y, width * 0.4 + ringR, (width * 0.4 + ringR) * 0.4, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      if (Math.random() < (mode === 'deep' ? 0.9 : 0.5)) {
        const sx = tp.x + (Math.random() - 0.5) * width * 2;
        emit({ x: sx, y: tp.y, vx: (p.x - sx) * 0.9, vy: (p.y - tp.y) * 0.9, life: 1, max: 1, size: 1.8, color: '255,210,120' });
      }
    }
    drawParticles(ctx);
    spacecraft(ctx, p.x, p.y, p.front ? 0.85 : 0.6, 0, cfg, t, { glow: scanning });
    text(ctx, 'TARGET: SOUTH POLAR REGION', tp.x + 40, tp.y + 36, { size: 12, color: COL.amber, spacing: 2 });
    text(ctx, 'Cabeus crater area', tp.x + 40, tp.y + 52, { size: 10, color: 'rgba(255,200,140,0.8)' });
    if (Game.phase === 'done' && Game.lastGain) {
      const k = clamp(Game.phaseT / 1.5);
      text(ctx, `+${Game.lastGain} SCIENCE`, tp.x, tp.y - 60 - k * 30, { align: 'center', size: 24, color: COL.green, glow: 12, alpha: 1 - k * 0.4 });
    }
    if (scanning) text(ctx, `SCANNING ${Math.round(clamp(Game.phaseT / SCAN_TIME) * 100)}%`, 40, 110, { size: 18, color: COL.cyan, glow: 8, spacing: 3 });
  };

  function batteryGauge(ctx, x, y, level, t, alert) {
    ctx.save();
    ctx.strokeStyle = alert ? COL.red : COL.cyan; ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 120, 46); ctx.fillStyle = alert ? COL.red : COL.cyan; ctx.fillRect(x + 120, y + 14, 7, 18);
    const lv = clamp(level / 100);
    ctx.fillStyle = lv < 0.2 ? COL.red : lv < 0.45 ? COL.amber : COL.green;
    const segs = 10;
    for (let k = 0; k < segs; k++) if ((k + 0.5) / segs <= lv) ctx.fillRect(x + 5 + k * 11.2, y + 5, 9, 36);
    ctx.restore();
    text(ctx, `POWER ${Math.round(level)}%`, x, y + 64, { size: 14, color: alert ? COL.red : COL.cyan, spacing: 2, alpha: alert ? 0.6 + 0.4 * Math.abs(Math.sin(t * 5)) : 1 });
  }

  S.MISSION_EVENT = (ctx, t) => {
    const night = Game.phase === 'alert' ? clamp(Game.phaseT / 2.2) * 0.75 : 0.75;
    const { p, cfg } = surveyScene(ctx, t, { night, parked: true });
    drawParticles(ctx);
    spacecraft(ctx, p.x, p.y, 0.85, 0, cfg, t);
    const pulse = Math.abs(Math.sin(t * 3));
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.95);
    vg.addColorStop(0, 'rgba(255,40,40,0)'); vg.addColorStop(1, `rgba(255,40,40,${0.18 + pulse * 0.2})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 90, 840, 14); ctx.clip();
    for (let x = -40 + ((t * 40) % 40); x < 860; x += 40) {
      ctx.fillStyle = 'rgba(255,190,60,0.55)';
      ctx.beginPath(); ctx.moveTo(x, 104); ctx.lineTo(x + 20, 90); ctx.lineTo(x + 34, 90); ctx.lineTo(x + 14, 104); ctx.fill();
    }
    ctx.restore();
    text(ctx, '⚠ POWER DEMAND INCREASE', 40, 130, { size: 20, color: COL.red, glow: 10, spacing: 2, alpha: 0.6 + 0.4 * pulse });
    // affected-resource indicator: power gauge draining toward current value
    const shown = Game.phase === 'alert' ? lerp(Game.powerBefore, M.power, clamp((Game.phaseT - 1) / 1.2)) : M.power;
    batteryGauge(ctx, 40, 160, shown, t, true);
    text(ctx, 'HEATERS ON', 40, 252, { size: 12, color: COL.amber, spacing: 3 });
    text(ctx, `NIGHT LOW ${NasaData.show('Surface temperature minimum (typical range)', '')}`, 40, 270, { size: 11, color: 'rgba(255,200,140,0.85)' });
    if (Game.phase !== 'alert' && Game.eventDrain) {
      const k = clamp(Game.sceneT / 6);
      text(ctx, `−${Game.eventDrain}% POWER`, 200, 184, { size: 16, color: COL.red, alpha: 1 - k * 0.5 });
    }
  };

  const TX = { m: { x: 140, y: 520, r: 105 }, c: { x: 390, y: 370 }, e: { x: 640, y: 205, r: 60 } };
  const packets = [];
  S.TRANSMISSION = (ctx, t, dt) => {
    background(ctx, t, 2); grid(ctx, 0.02);
    moon(ctx, TX.m.x, TX.m.y, TX.m.r);
    earth(ctx, TX.e.x, TX.e.y, TX.e.r, t);
    const tp = targetPos(TX.m.x, TX.m.y, TX.m.r);
    const sending = Game.phase === 'sending';
    const full = (Game.phase === 'choose' ? (Game.preview || Game.choice) : M.selectedTransmission) === 'full';
    ctx.save(); ctx.setLineDash([3, 7]); ctx.lineDashOffset = -t * 25;
    ctx.strokeStyle = 'rgba(92,225,255,0.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(tp.x, tp.y); ctx.lineTo(TX.c.x, TX.c.y); ctx.lineTo(TX.e.x, TX.e.y); ctx.stroke();
    ctx.restore();
    const rate = sending ? (full ? 14 : 6) : 1.2;
    if (Math.random() < rate * dt) packets.push({ seg: 0, p: 0 });
    if (sending && Math.random() < rate * dt) packets.push({ seg: 1, p: 0 });
    for (let i = packets.length - 1; i >= 0; i--) {
      const k = packets[i];
      k.p += dt * (k.seg === 0 ? 0.9 : 0.7);
      if (k.p >= 1) { packets.splice(i, 1); if (k.seg === 1) glow(ctx, TX.e.x, TX.e.y, 90, 'rgba(92,225,255,ALPHA)', 0.25); continue; }
      const a = k.seg === 0 ? tp : TX.c, b = k.seg === 0 ? TX.c : TX.e;
      const x = lerp(a.x, b.x, k.p), y = lerp(a.y, b.y, k.p);
      const sz = full ? 4 : 2.6;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glow(ctx, x, y, sz * 4, k.seg === 0 ? 'rgba(255,200,110,ALPHA)' : 'rgba(92,225,255,ALPHA)', 0.5);
      ctx.fillStyle = k.seg === 0 ? '#ffd28a' : '#bff3ff';
      ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
      ctx.restore();
    }
    const ang = Math.atan2(TX.e.y - TX.c.y, TX.e.x - TX.c.x);
    spacecraft(ctx, TX.c.x, TX.c.y + Math.sin(t) * 3, 1.2, ang + Math.PI / 2 - 0.2, craftCfg(), t, { glow: sending });
    text(ctx, 'MOON', TX.m.x, TX.m.y + TX.m.r + 22, { align: 'center', size: 12, spacing: 3 });
    text(ctx, 'EARTH · DEEP SPACE NETWORK', TX.e.x, TX.e.y + TX.e.r + 22, { align: 'center', size: 12, spacing: 2 });
    text(ctx, 'LUNA-01', TX.c.x, TX.c.y + 56, { align: 'center', size: 11, color: 'rgba(160,200,230,0.8)', spacing: 2 });
    if (sending) {
      const pct = Math.round(clamp(Game.phaseT / TX_TIME) * 100);
      text(ctx, `DATA DOWNLINK ${pct}%`, 40, 110, { size: 18, color: COL.cyan, glow: 8, spacing: 3 });
      ctx.strokeStyle = COL.cyan; ctx.strokeRect(40, 128, 260, 10);
      ctx.fillStyle = COL.cyan; ctx.fillRect(42, 130, 256 * pct / 100, 6);
    }
    const delay = Game.signalDelay;
    if (delay) {
      const mx = (TX.c.x + TX.e.x) / 2, my = (TX.c.y + TX.e.y) / 2;
      text(ctx, `≈${delay.toFixed(2)} s light-time`, mx + 18, my + 14, { size: 11, color: 'rgba(160,200,230,0.85)' });
    }
  };
  const TX_TIME = 5;

  S.RESULT = (ctx, t) => {
    background(ctx, t, 2); grid(ctx, 0.02);
    const st = M.missionStatus, color = st === 'SUCCESS' ? COL.green : st === 'FAILURE' ? COL.red : COL.amber;
    earth(ctx, 180, 470, 78, t);
    moon(ctx, 690, 215, 52);
    const p0 = { x: 240, y: 425 }, p1 = { x: 400, y: 120 }, p2 = { x: 640, y: 230 };
    const prog = clamp(Game.sceneT / 1.5);
    route(ctx, p0, p1, p2, t, st === 'FAILURE' ? Math.min(prog, 0.85) : prog, color, st !== 'FAILURE');
    if (st === 'SUCCESS' && Math.random() < 0.08) burst(180 + (Math.random() - 0.5) * 200, 470 + (Math.random() - 0.5) * 160, 26, Math.random() < 0.5 ? '88,242,155' : '255,210,120', 110, 1.3);
    if (st === 'PARTIAL SUCCESS' && Math.random() < 0.03) burst(180, 470, 14, '255,179,71', 70, 1);
    drawParticles(ctx);
    const q = qb(p0, p1, p2, st === 'FAILURE' ? 0.85 : 1);
    if (st === 'FAILURE') {
      ctx.save(); ctx.translate(q.x, q.y);
      ctx.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t * 7));
      spacecraft(ctx, 0, 0, 0.8, t * 0.6, craftCfg(), t);
      ctx.strokeStyle = COL.red; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-22, -22); ctx.lineTo(22, 22); ctx.moveTo(22, -22); ctx.lineTo(-22, 22); ctx.stroke();
      ctx.restore();
      for (let k = 0; k < 6; k++) { ctx.fillStyle = `rgba(255,93,93,${Math.random() * 0.15})`; ctx.fillRect(0, Math.random() * H, 840, 2 + Math.random() * 6); }
    } else {
      spacecraft(ctx, q.x + 50, q.y - 10, 0.7, 0, craftCfg(), t, { glow: true });
    }
    text(ctx, st === 'SUCCESS' ? 'MISSION SUCCESS' : st === 'FAILURE' ? 'MISSION FAILURE' : 'PARTIAL SUCCESS', 420, 620, { align: 'center', size: 34, color, glow: 18, spacing: 6 });
  };

  S.REPORT = (ctx, t) => {
    background(ctx, t, 1.2); grid(ctx, 0.03);
    moon(ctx, 1180, 700, 260);
    earth(ctx, 90, 90, 30, t);
  };

  function frame(ctx, t, dt) {
    const fn = S[Game.state];
    ctx.save();
    if (fn) fn(ctx, t, dt);
    ctx.restore();
  }

  function init() { buildStars(); buildMoon(); }

  const surveyTarget = () => targetPos(SV.x, SV.y, SV.r);

  return { init, frame, updateParticles, clearParticles, burst, emit, packets, surveyTarget, SCAN_TIME, TX_TIME, TRANSFER_TIME, LT, W, H };
})();
