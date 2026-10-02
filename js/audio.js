// Chiptune music sequencer and sound effects on WebAudio.
G.Audio = (function () {
  let ctx = null, master, musicBus, sfxBus, noiseBuf;
  let muted = false;
  try { muted = localStorage.getItem('ashenkeep.muted') === '1'; } catch (e) {}
  let track = null, want = null, step = 0, nextTime = 0, timer = null;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ctx.destination);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      timer = setInterval(schedule, 25);
      if (want) play(want, true);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function tone(type, freq, t, dur, vol, dest, slideTo) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, vol, dest, hp) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t); s.stop(t + dur + 0.05);
  }

  // Chord progressions as MIDI triads; one chord per bar of 8 steps.
  const TRACKS = {
    title: {
      bpm: 72, prog: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],
      arp: [0, 1, 2, 1, 0, 1, 2, 1], bass: [0, 4], lead: 0.035, bell: true,
      mel: [76, 0, 0, 74, 72, 0, 71, 0, 72, 0, 0, 0, 69, 0, 0, 0, 71, 0, 0, 72, 74, 0, 71, 0, 68, 0, 0, 0, 0, 0, 0, 0],
    },
    keep: {
      bpm: 88, prog: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]],
      arp: [0, 1, 2, 3, 2, 1, 0, 1], bass: [0, 3, 4, 6], lead: 0.03,
      mel: [69, 0, 72, 0, 71, 0, 69, 0, 65, 0, 69, 0, 67, 0, 65, 64, 62, 0, 65, 0, 69, 0, 67, 0, 68, 0, 71, 0, 69, 0, 68, 0],
    },
    night: {
      bpm: 64, prog: [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]],
      arp: [0, -1, 2, -1, 1, -1, 3, -1], bass: [0], lead: 0.03, bell: true,
    },
    battle: {
      bpm: 148, prog: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]],
      arp: [0, 1, 2, 3, 0, 1, 2, 3], bass: [0, 1, 2, 3, 4, 5, 6, 7], lead: 0.03, hats: true,
    },
    boss: {
      bpm: 160, prog: [[45, 48, 52], [46, 49, 53], [45, 48, 52], [44, 47, 50]],
      arp: [0, 2, 1, 3, 0, 2, 1, 3], bass: [0, 1, 2, 3, 4, 5, 6, 7], lead: 0.032, hats: true,
    },
    ending: {
      bpm: 66, prog: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      arp: [0, 1, 2, 3, 2, 1, 0, -1], bass: [0, 4], lead: 0.03, bell: true,
    },
  };

  function schedule() {
    if (!ctx || !track) return;
    const T = TRACKS[track];
    const spb = 60 / T.bpm / 2;
    while (nextTime < ctx.currentTime + 0.15) {
      const t = nextTime;
      const bar = Math.floor(step / 8) % T.prog.length;
      const s = step % 8;
      const ch = T.prog[bar];
      const a = T.arp[s];
      if (a >= 0) {
        const n = a === 3 ? ch[0] + 12 : ch[a];
        tone('square', mtof(n + 12), t, spb * 0.9, T.lead, musicBus);
      }
      if (T.bass.indexOf(s) >= 0) {
        const n = ch[0] - 12 + (T.hats && s % 2 ? 12 : 0);
        tone('triangle', mtof(n), t, spb * (T.hats ? 0.8 : 3.5), 0.16, musicBus);
      }
      if (T.hats && s % 2 === 1) noise(t, 0.04, 0.05, musicBus, 7000);
      if (T.bell && s === 0 && bar % 2 === 0) {
        tone('sine', mtof(ch[0] + 24), t, 2.4, 0.06, musicBus);
        tone('sine', mtof(ch[0] + 31), t, 1.8, 0.025, musicBus);
      }
      if (T.mel && Math.floor(step / 32) % 2 === 1) {
        const m = T.mel[step % 32];
        if (m) tone('square', mtof(m + 12), t, spb * 1.8, T.lead * 1.2, musicBus);
      }
      step++;
      nextTime += spb;
    }
  }

  function play(name, force) {
    want = name;
    if (!ctx) return;
    if (track === name && !force) return;
    track = name; step = 0; nextTime = ctx.currentTime + 0.08;
  }

  const SFX = {
    blip() { const t = ctx.currentTime; tone('square', 880, t, 0.05, 0.05); },
    talk(p) { const t = ctx.currentTime; tone('square', 300 * (p || 1) + Math.random() * 60, t, 0.04, 0.03); },
    confirm() { const t = ctx.currentTime; tone('square', 660, t, 0.07, 0.06); tone('square', 990, t + 0.07, 0.1, 0.06); },
    deny() { const t = ctx.currentTime; tone('square', 180, t, 0.15, 0.06, null, 120); },
    build() {
      const t = ctx.currentTime;
      noise(t, 0.12, 0.2, null, 400); noise(t + 0.14, 0.1, 0.15, null, 600);
      [523, 659, 784, 1047].forEach((f, i) => tone('square', f, t + 0.25 + i * 0.07, 0.12, 0.05));
    },
    coin() { const t = ctx.currentTime; tone('square', 988, t, 0.06, 0.05); tone('square', 1319, t + 0.06, 0.16, 0.05); },
    hit() { const t = ctx.currentTime; noise(t, 0.12, 0.3, null, 800); tone('square', 220, t, 0.1, 0.06, null, 90); },
    hurt() { const t = ctx.currentTime; noise(t, 0.2, 0.25, null, 300); tone('sawtooth', 160, t, 0.25, 0.06, null, 60); },
    ember() {
      const t = ctx.currentTime;
      tone('sawtooth', 110, t, 0.5, 0.08, null, 880); noise(t + 0.1, 0.4, 0.2, null, 1500);
    },
    hex() { const t = ctx.currentTime; tone('sine', 440, t, 0.6, 0.08, null, 110); tone('square', 233, t, 0.5, 0.03); },
    guard() { const t = ctx.currentTime; tone('triangle', 330, t, 0.15, 0.1); tone('triangle', 494, t + 0.05, 0.2, 0.08); },
    heal() { const t = ctx.currentTime; [523, 659, 784].forEach((f, i) => tone('triangle', f, t + i * 0.08, 0.2, 0.08)); },
    level() { const t = ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, t + i * 0.09, 0.18, 0.06)); },
    bell() { const t = ctx.currentTime; tone('sine', 196, t, 3, 0.18); tone('sine', 294, t, 2.4, 0.06); tone('sine', 523, t, 1.2, 0.03); },
    door() { const t = ctx.currentTime; noise(t, 0.4, 0.15, null, 200); tone('square', 90, t, 0.4, 0.04, null, 60); },
    step() { const t = ctx.currentTime; noise(t, 0.03, 0.03, null, 2000); },
  };

  return {
    unlock, play,
    sfx(name, arg) { if (ctx && !muted && SFX[name]) SFX[name](arg); },
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('ashenkeep.muted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    },
    get muted() { return muted; },
  };
})();
