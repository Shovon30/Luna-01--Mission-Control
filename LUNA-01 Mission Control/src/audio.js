// Procedural mission-control audio (Web Audio API). No audio files.
// Every sound is informational only: the game is fully playable muted.
// Signal chain: music/sfx buses -> master gain -> compressor -> makeup gain -> speakers.

const Sfx = (() => {
  let ac = null, master, musicBus, sfxBus, noiseBuf;
  let muted = false, musicOn = false, timer = null, step = 0, nextT = 0, mood = 'calm';
  let droneFilter = null, chatterAt = 0;
  const VOLUME = 1.0;

  try { muted = localStorage.getItem('luna01-muted') === '1'; } catch (e) { /* storage unavailable */ }

  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.25;
    const makeup = ac.createGain(); makeup.gain.value = 1.6;
    master = ac.createGain();
    master.gain.value = muted ? 0 : VOLUME;
    master.connect(comp).connect(makeup).connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 1.0; sfxBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(f, when, dur, type = 'sine', vol = 0.2, f2 = null, out = sfxBus, attack = 0.004) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, when);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(out);
    o.start(when); o.stop(when + dur + 0.03);
  }

  // Flat-topped beep (no pitch envelope) - used for Quindar / alarm tones.
  function beep(f, when, dur, vol = 0.2, type = 'sine', out = sfxBus) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.008);
    g.gain.setValueAtTime(vol, when + dur - 0.012);
    g.gain.linearRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(out);
    o.start(when); o.stop(when + dur + 0.02);
  }

  function noise(when, dur, vol, type = 'lowpass', f = 1200, f2 = null, out = sfxBus, q = 0.7, attack = 0.005) {
    if (!ac) return;
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f, when);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(fl).connect(g).connect(out);
    s.start(when, Math.random()); s.stop(when + dur + 0.03);
  }

  // ------------------------------------------------------------ music: mission-control ambience
  // A low filtered drone + soft telemetry pulses + random computer chatter.
  const STEP = 60 / 100 / 4;
  const ROOTS = [45, 45, 41, 43];           // A1, A1, F1, G1 (MIDI)
  const PULSE = [81, 0, 76, 0, 79, 0, 76, 0, 81, 0, 84, 0, 79, 0, 76, 0];

  function startDrone() {
    const t = ac.currentTime;
    droneFilter = ac.createBiquadFilter();
    droneFilter.type = 'lowpass'; droneFilter.frequency.value = 260; droneFilter.Q.value = 2;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 3);
    droneFilter.connect(g).connect(musicBus);
    for (const [n, det] of [[33, -7], [33, 6], [40, 0], [45, -3]]) {
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = hz(n); o.detune.value = det;
      o.connect(droneFilter); o.start(t);
    }
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.07; lg.gain.value = 120;
    lfo.connect(lg).connect(droneFilter.frequency); lfo.start(t);
  }

  function playStep(s, t) {
    const bar = Math.floor(s / 16) % 4, i = s % 16, tense = mood === 'tense';
    // sub pulse on the beat (engine-room heartbeat)
    if (i % (tense ? 4 : 8) === 0) tone(hz(ROOTS[bar] - 12 + 24), t, 0.35, 'sine', tense ? 0.22 : 0.16, hz(ROOTS[bar]), musicBus, 0.01);
    // telemetry blips
    if (PULSE[i] && (i + bar) % 3 !== 2) tone(hz(PULSE[i] + (tense ? 1 : 0)), t, 0.07, 'sine', tense ? 0.035 : 0.028, null, musicBus);
    // hi-hat style data tick
    if (i % 2 === 1) noise(t, 0.025, tense ? 0.05 : 0.03, 'highpass', 8000, null, musicBus);
    // tense: slow two-tone caution undertone
    if (tense && i === 0 && bar % 2 === 0) { beep(660, t, 0.18, 0.03, 'triangle', musicBus); beep(520, t + 0.2, 0.18, 0.03, 'triangle', musicBus); }
    // random computer chatter
    if (t > chatterAt) {
      const n = 3 + Math.floor(Math.random() * 6), base = 1600 + Math.random() * 1800;
      for (let k = 0; k < n; k++) beep(base * (1 + ((k * 7) % 5) * 0.12), t + k * 0.045, 0.03, 0.016, 'square', musicBus);
      chatterAt = t + 1.5 + Math.random() * 3.5;
    }
  }

  function scheduler() {
    while (nextT < ac.currentTime + 0.2) {
      playStep(step, nextT);
      nextT += STEP;
      step = (step + 1) % 64;
    }
    if (droneFilter) droneFilter.frequency.setTargetAtTime(mood === 'tense' ? 520 : 260, ac.currentTime, 0.8);
  }

  function startMusic() {
    init();
    if (!ac || musicOn) return;
    musicOn = true;
    startDrone();
    nextT = ac.currentTime + 0.1;
    chatterAt = ac.currentTime + 2;
    timer = setInterval(scheduler, 50);
  }

  function setMood(m) { mood = m; }

  // ------------------------------------------------------------ effects
  const now = () => (ac ? ac.currentTime + 0.01 : 0);

  // Quindar tones: NASA's Apollo-era 2525 Hz (intro) / 2475 Hz (outro) radio keying beeps.
  function quindar(outro = false, when = now(), vol = 0.13) { beep(outro ? 2475 : 2525, when, 0.25, vol); }

  function click() { if (!ac) return; const t = now(); noise(t, 0.02, 0.18, 'highpass', 3000); beep(2200, t, 0.028, 0.08); }
  function select() { if (!ac) return; const t = now(); beep(1320, t, 0.05, 0.12); beep(1760, t + 0.06, 0.07, 0.12); }
  function confirm() { if (!ac) return; const t = now(); noise(t, 0.02, 0.15, 'highpass', 3000); quindar(false, t + 0.01); }
  function deny() { if (!ac) return; const t = now(); for (let k = 0; k < 3; k++) beep(185, t + k * 0.16, 0.12, 0.2, 'square'); }

  // Master-alarm style warning: harsh alternating tone, repeated.
  function warning() {
    if (!ac) return;
    const t = now();
    for (let k = 0; k < 5; k++) {
      beep(1050, t + k * 0.42, 0.18, 0.16, 'sawtooth');
      beep(780, t + k * 0.42 + 0.2, 0.18, 0.16, 'sawtooth');
    }
  }

  // Ignition: explosive blast + sub-bass thump + crackle + long rumble.
  function launch() {
    if (!ac) return;
    const t = now();
    noise(t, 2.8, 1.0, 'lowpass', 6000, 160, sfxBus, 0.5, 0.004);        // blast
    tone(90, t, 1.8, 'sine', 0.9, 24, sfxBus, 0.003);                     // sub thump
    tone(55, t + 0.05, 2.5, 'triangle', 0.5, 30, sfxBus, 0.01);
    noise(t + 0.1, 8.5, 0.75, 'lowpass', 420, 110, sfxBus, 0.8, 0.3);     // sustained rumble
    noise(t + 0.2, 7.0, 0.3, 'bandpass', 900, 300, sfxBus, 0.6, 0.4);     // roar
    for (let k = 0; k < 70; k++) {                                        // crackle
      const at = t + 0.2 + Math.random() * 6.5;
      noise(at, 0.03 + Math.random() * 0.05, 0.25 + Math.random() * 0.35, 'bandpass', 1200 + Math.random() * 2500, null, sfxBus, 1.5, 0.002);
    }
  }

  function separation() {
    if (!ac) return;
    const t = now();
    noise(t, 0.35, 0.8, 'lowpass', 5000, 300, sfxBus, 0.6, 0.002);   // pyro bolt bang
    tone(120, t, 0.4, 'sine', 0.5, 40);
    tone(1850, t + 0.05, 0.9, 'sine', 0.06);                         // metallic ring
    tone(2610, t + 0.05, 0.6, 'sine', 0.04);
  }

  function burn(dur = 1.4) { if (!ac) return; const t = now(); noise(t, dur, 0.45, 'lowpass', 700, 220, sfxBus, 0.8, 0.08); tone(70, t, dur, 'sine', 0.25, 55, sfxBus, 0.1); }

  // Active sensor sweep: sonar-like pings with echoes.
  function scan(duration = 4) {
    if (!ac) return;
    const t = now();
    for (let k = 0; k * 0.6 < duration; k++) {
      const at = t + k * 0.6;
      tone(1400, at, 0.35, 'sine', 0.16, 1250);
      tone(1400, at + 0.15, 0.3, 'sine', 0.05, 1250);
      noise(at, 0.5, 0.05, 'bandpass', 2400, 900, sfxBus, 4);
    }
  }

  // Modem-like FSK data burst.
  function transmit(duration = 4.5, dense = true) {
    if (!ac) return;
    const t = now(), gap = dense ? 0.045 : 0.09;
    quindar(false, t);
    for (let k = 0; k * gap < duration - 0.6; k++) {
      beep(Math.random() < 0.5 ? 1200 : 2200, t + 0.35 + k * gap, gap * 0.9, 0.05, 'square');
    }
    quindar(true, t + duration - 0.25);
  }

  function success() {
    if (!ac) return;
    const t = now();
    quindar(false, t);
    [523, 659, 784, 1046].forEach((f, k) => tone(f, t + 0.35 + k * 0.12, 1.4 - k * 0.15, 'triangle', 0.12));
    tone(1046, t + 0.9, 1.5, 'sine', 0.08);
    quindar(true, t + 2.2);
  }

  function partial() {
    if (!ac) return;
    const t = now();
    quindar(false, t);
    [659, 587, 523].forEach((f, k) => tone(f, t + 0.35 + k * 0.2, 0.5, 'triangle', 0.12));
  }

  function failure() {
    if (!ac) return;
    const t = now();
    tone(440, t, 1.6, 'sawtooth', 0.12, 60);
    noise(t + 0.3, 2.4, 0.35, 'bandpass', 3000, 1500, sfxBus, 0.5, 0.05);   // loss-of-signal static
    tone(1000, t + 0.3, 1.2, 'sine', 0.05);                                  // carrier tone cut
  }

  // Launch countdown: one crisp beep per second; T-1 adds a rising tone to build anticipation.
  function countdown(n) {
    if (!ac) return;
    const t = now();
    if (n > 1) { beep(1000, t, 0.14, 0.16); beep(2000, t, 0.05, 0.04); return; }
    beep(1320, t, 0.22, 0.18);
    tone(220, t + 0.05, 0.95, 'sawtooth', 0.06, 880, sfxBus, 0.3);
    noise(t + 0.1, 0.9, 0.12, 'lowpass', 300, 1200, sfxBus, 0.7, 0.5);
  }

  // Trans-lunar injection: long, rising engine burn.
  function tli(dur = 2.4) {
    if (!ac) return;
    const t = now();
    quindar(false, t, 0.1);
    noise(t + 0.2, dur + 0.4, 0.55, 'lowpass', 500, 900, sfxBus, 0.8, 0.25);
    tone(60, t + 0.2, dur + 0.4, 'sawtooth', 0.12, 110, sfxBus, 0.3);
    tone(180, t + 0.2, dur, 'triangle', 0.05, 420, sfxBus, 0.4);
  }

  // Hazard signature sounds (played after the master alarm).
  function hazard(id) {
    if (!ac) return;
    const t = now() + 0.3;
    if (id === 'meteoroid') {            // proximity radar: accelerating pings
      for (let k = 0; k < 12; k++) beep(1760, t + 2.4 * (1 - Math.pow(1 - k / 12, 1.8)), 0.05, 0.12, 'square');
    } else if (id === 'leak') {          // venting hiss
      noise(t, 2.6, 0.35, 'highpass', 3500, 1800, sfxBus, 0.7, 0.05);
      tone(420, t, 1.2, 'sine', 0.05, 380);
    } else if (id === 'seu') {           // corrupted data glitch
      for (let k = 0; k < 18; k++) beep(200 + Math.random() * 2400, t + k * 0.05, 0.035, 0.06, 'square');
      tone(90, t + 1, 0.6, 'sawtooth', 0.08, 60);
    } else if (id === 'flare') {         // radiation static
      noise(t, 2.2, 0.28, 'bandpass', 5000, 2500, sfxBus, 0.5, 0.2);
      for (let k = 0; k < 25; k++) noise(t + Math.random() * 2, 0.02, 0.3, 'highpass', 6000, null, sfxBus, 1, 0.001);
    } else if (id === 'dust') {          // soft grainy rustle
      noise(t, 2, 0.2, 'bandpass', 1400, 900, sfxBus, 2, 0.3);
    }
  }

  // Impact / damage hit. scale < 1 for a lighter thud.
  function impact(scale = 1) {
    if (!ac) return;
    const t = now();
    noise(t, 0.6 * scale + 0.2, 0.8 * scale, 'lowpass', 4000, 200, sfxBus, 0.6, 0.002);
    tone(110, t, 0.5, 'sine', 0.6 * scale, 35, sfxBus, 0.002);
    for (let k = 0; k < 6 * scale; k++) noise(t + 0.05 + Math.random() * 0.4, 0.03, 0.3, 'bandpass', 2500 + Math.random() * 2000, null, sfxBus, 2, 0.001);
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('luna01-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ac.currentTime, 0.05);
    return muted;
  }

  return {
    init, startMusic, setMood, click, select, confirm, deny, warning, launch, separation, burn,
    scan, transmit, success, partial, failure, toggleMute, hazard, impact, countdown, tli,
    get muted() { return muted; },
  };
})();
