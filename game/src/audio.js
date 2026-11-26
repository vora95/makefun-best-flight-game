// audio.js — all sound is synthesised with WebAudio: no audio files.
// Engine drone (sawtooth through a low-pass, pitched by throttle),
// wind (filtered noise, louder with speed), ring chime, landing thud,
// crash burst. Everything is guarded: no gesture yet means no sound.
export function createAudio() {
  let ctx = null;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let windSrc = null, windGain = null, windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    // Engine: two detuned saws through a low-pass filter.
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    const engineOsc2 = ctx.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55 * 1.007;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(ctx.destination);
    engineOsc.start();
    engineOsc2.start();
    // Wind: looping noise buffer through a band-pass.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    windSrc = ctx.createBufferSource();
    windSrc.buffer = buf;
    windSrc.loop = true;
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();
    started = true;
    return true;
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function engine(state) {
    if (!started || muted || !ctx) return;
    const t = ctx.currentTime;
    const rpm = 52 + state.throttle * 68 + state.speed * 0.35;
    engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    engineFilter.frequency.setTargetAtTime(320 + state.throttle * 900, t, 0.1);
    engineGain.gain.setTargetAtTime(state.airborne || state.speed > 2 ? 0.05 + state.throttle * 0.05 : 0.02, t, 0.1);
    windGain.gain.setTargetAtTime(Math.min(0.14, state.speed * 0.0022), t, 0.15);
    windFilter.frequency.setTargetAtTime(500 + state.speed * 14, t, 0.15);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!started || muted || !ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function ring() { blip(880, 0.35, 'sine', 0.22); blip(1318, 0.5, 'sine', 0.18, 0.09); }
  function takeoff() { blip(392, 0.3, 'triangle', 0.15); blip(523, 0.4, 'triangle', 0.15, 0.12); }
  function land() { blip(196, 0.25, 'triangle', 0.25); blip(147, 0.4, 'sine', 0.2, 0.1); }

  function crash() {
    if (!started || muted || !ctx) return;
    const t = ctx.currentTime;
    const len = ctx.sampleRate * 0.7;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t);
    blip(82, 0.8, 'sine', 0.3);
  }

  function toggleMute() {
    muted = !muted;
    if (ctx && engineGain) engineGain.gain.value = muted ? 0 : 0.05;
    if (ctx && windGain) windGain.gain.value = muted ? 0 : 0.02;
    return muted;
  }

  return { resume, engine, ring, takeoff, land, crash, toggleMute };
}
