// Procedural retro-digital audio (Web Audio API). No audio files.
// Every sound is informational only: the game is fully playable muted.

const Sfx = (() => {
  let ac = null, master, musicBus, sfxBus, noiseBuf;
  let muted = false, musicOn = false, timer = null, step = 0, nextT = 0, mood = 'calm';

  try { muted = localStorage.getItem('luna01-muted') === '1'; } catch (e) { /* storage unavailable */ }

  const hz = n => 440 * Math.pow(2, (n - 69) / 12);

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.7;
    master.connect(ac.destination);
    musicBus = ac.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(f, when, dur, type = 'square', vol = 0.12, f2 = null, out = sfxBus) {
    if (!ac) return;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, when);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, when + dur);
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(out);
    o.start(when); o.stop(when + dur + 0.02);
  }

  function noise(when, dur, vol, type = 'lowpass', f = 1200, f2 = null, out = sfxBus) {
    if (!ac) return;
    const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = noiseBuf; s.loop = true;
    fl.type = type; fl.frequency.setValueAtTime(f, when);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, when + dur);
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(fl).connect(g).connect(out);
    s.start(when); s.stop(when + dur + 0.02);
  }

  // ------------------------------------------------------------ music loop
  // 4-bar chiptune loop (Am - F - C - G) with a lookahead scheduler.
  const STEP = 60 / 96 / 4;
  const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const LEAD = [76, null, 72, null, 74, null, null, 72, 69, null, 72, null, 67, null, null, null];

  function playStep(s, t) {
    const bar = Math.floor(s / 16) % 4, i = s % 16, ch = CHORDS[bar];
    const tense = mood === 'tense';
    if (i === 0 || i === 6 || i === 8 || i === 14) tone(hz(ch[0] - 12 - (tense ? 1 : 0)), t, STEP * 1.8, 'triangle', 0.2, null, musicBus);
    if (i % 2 === 0) tone(hz(ch[(i / 2) % 3] + 12), t, STEP * 0.8, 'square', tense ? 0.02 : 0.03, null, musicBus);
    if (i % 4 === 2) noise(t, 0.03, 0.05, 'highpass', 7000, null, musicBus);
    if (tense && i % 8 === 0) tone(hz(81), t, STEP * 1.5, 'sawtooth', 0.025, hz(76), musicBus);
    if (!tense && s % 32 >= 16 && LEAD[i]) tone(hz(LEAD[i] + (bar === 3 ? 2 : 0)), t, STEP * 1.6, 'triangle', 0.05, null, musicBus);
  }

  function scheduler() {
    while (nextT < ac.currentTime + 0.2) {
      playStep(step, nextT);
      nextT += STEP;
      step = (step + 1) % 64;
    }
  }

  function startMusic() {
    init();
    if (!ac || musicOn) return;
    musicOn = true;
    nextT = ac.currentTime + 0.1;
    timer = setInterval(scheduler, 50);
  }

  function setMood(m) { mood = m; }

  // ------------------------------------------------------------ effects
  const now = () => (ac ? ac.currentTime + 0.01 : 0);

  function click() { if (!ac) return; tone(1400, now(), 0.04, 'square', 0.06); }
  function select() { if (!ac) return; const t = now(); tone(660, t, 0.06, 'square', 0.07); tone(990, t + 0.06, 0.08, 'square', 0.07); }
  function confirm() { if (!ac) return; const t = now(); [523, 659, 784, 1046].forEach((f, k) => tone(f, t + k * 0.06, 0.1, 'square', 0.08)); }
  function deny() { if (!ac) return; const t = now(); tone(180, t, 0.18, 'square', 0.1); tone(140, t + 0.2, 0.25, 'square', 0.1); }

  function warning() {
    if (!ac) return;
    const t = now();
    for (let k = 0; k < 4; k++) {
      tone(880, t + k * 0.36, 0.16, 'square', 0.1);
      tone(620, t + k * 0.36 + 0.18, 0.16, 'square', 0.1);
    }
  }

  function launch() {
    if (!ac) return;
    const t = now();
    noise(t, 6.5, 0.45, 'lowpass', 180, 1500);
    noise(t + 0.2, 5.5, 0.12, 'bandpass', 400, 2500);
    tone(55, t, 6, 'sawtooth', 0.08, 160);
  }

  function separation() { if (!ac) return; const t = now(); noise(t, 0.3, 0.3, 'highpass', 2000, 400); tone(300, t, 0.2, 'square', 0.06, 900); }

  function burn(dur = 1.2) { if (!ac) return; noise(now(), dur, 0.18, 'lowpass', 600, 250); }

  function scan(duration = 4) {
    if (!ac) return;
    const t = now();
    for (let k = 0; k * 0.32 < duration; k++) {
      tone(1500, t + k * 0.32, 0.14, 'sine', 0.07, 700);
      if (k % 4 === 0) tone(220, t + k * 0.32, 0.1, 'triangle', 0.08);
    }
  }

  function transmit(duration = 4.5, dense = true) {
    if (!ac) return;
    const t = now(), notes = [1046, 1318, 1568, 2093];
    const gap = dense ? 0.07 : 0.13;
    for (let k = 0; k * gap < duration; k++) tone(notes[(k * 7) % 4], t + k * gap, 0.04, 'square', 0.035);
  }

  function success() {
    if (!ac) return;
    const t = now();
    [523, 659, 784, 1046, 1318].forEach((f, k) => tone(f, t + k * 0.11, 0.25, 'square', 0.08));
    [523, 659, 784].forEach(f => tone(f, t + 0.6, 1.0, 'triangle', 0.08));
  }

  function partial() {
    if (!ac) return;
    const t = now();
    [523, 659, 587, 523].forEach((f, k) => tone(f, t + k * 0.16, 0.25, 'square', 0.07));
  }

  function failure() {
    if (!ac) return;
    const t = now();
    tone(440, t, 1.4, 'sawtooth', 0.08, 70);
    tone(330, t + 0.3, 1.2, 'square', 0.05, 60);
    noise(t + 0.2, 1.2, 0.12, 'lowpass', 800, 100);
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('luna01-muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.7, ac.currentTime, 0.05);
    return muted;
  }

  return {
    init, startMusic, setMood, click, select, confirm, deny, warning, launch, separation, burn,
    scan, transmit, success, partial, failure, toggleMute,
    get muted() { return muted; },
  };
})();
