// audio.js — all sound is synthesised with WebAudio: no audio files.
//
// Engine drone (two detuned saws through a low-pass, pitched by throttle
// and speed), wind (filtered noise, louder with speed), ring chime,
// landing thud, crash burst, and a short warning beep for low fuel or a
// stall. Everything is guarded: no user gesture yet means no sound, and
// every public call is a no-op until the graph exists.
export function createAudio() {
  const nodes = { ctx: null, engine: null, engine2: null, engineFilter: null, engineGain: null, wind: null, windFilter: null, windGain: null };
  let muted = false;
  let started = false;

  function makeNoiseBuffer(ctx, seconds) {
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function startEngineGraph(ctx) {
    // Two detuned saws through a low-pass filter.
    const mkOsc = (detune) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 55 * detune;
      return o;
    };
    nodes.engine = mkOsc(1);
    nodes.engine2 = mkOsc(1.007);
    nodes.engineFilter = ctx.createBiquadFilter();
    nodes.engineFilter.type = 'lowpass';
    nodes.engineFilter.frequency.value = 420;
    nodes.engineGain = ctx.createGain();
    nodes.engineGain.gain.value = 0;
    nodes.engine.connect(nodes.engineFilter);
    nodes.engine2.connect(nodes.engineFilter);
    nodes.engineFilter.connect(nodes.engineGain);
    nodes.engineGain.connect(ctx.destination);
    nodes.engine.start();
    nodes.engine2.start();
  }

  function startWindGraph(ctx) {
    // Looping noise buffer through a band-pass.
    const src = ctx.createBufferSource();
    src.buffer = makeNoiseBuffer(ctx, 2);
    src.loop = true;
    nodes.windFilter = ctx.createBiquadFilter();
    nodes.windFilter.type = 'bandpass';
    nodes.windFilter.frequency.value = 700;
    nodes.windGain = ctx.createGain();
    nodes.windGain.gain.value = 0;
    src.connect(nodes.windFilter);
    nodes.windFilter.connect(nodes.windGain);
    nodes.windGain.connect(ctx.destination);
    src.start();
    nodes.wind = src;
  }

  function ensure() {
    if (started) return true;
    try {
      nodes.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    startEngineGraph(nodes.ctx);
    startWindGraph(nodes.ctx);
    started = true;
    return true;
  }

  function resume() {
    if (ensure() && nodes.ctx.state === 'suspended') nodes.ctx.resume().catch(() => {});
  }

  function engine(state) {
    if (!started || muted || !nodes.ctx) return;
    const t = nodes.ctx.currentTime;
    const rpm = 52 + state.throttle * 68 + state.speed * 0.35;
    nodes.engine.frequency.setTargetAtTime(rpm, t, 0.08);
    nodes.engineFilter.frequency.setTargetAtTime(320 + state.throttle * 900, t, 0.1);
    const rolling = state.airborne || state.speed > 2;
    nodes.engineGain.gain.setTargetAtTime(rolling ? 0.05 + state.throttle * 0.05 : 0.02, t, 0.1);
    nodes.windGain.gain.setTargetAtTime(Math.min(0.14, state.speed * 0.0022), t, 0.15);
    nodes.windFilter.frequency.setTargetAtTime(500 + state.speed * 14, t, 0.15);
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!started || muted || !nodes.ctx) return;
    const t = nodes.ctx.currentTime + when;
    const o = nodes.ctx.createOscillator();
    const g = nodes.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(nodes.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function ring() { blip(880, 0.35, 'sine', 0.22); blip(1318, 0.5, 'sine', 0.18, 0.09); }
  function takeoff() { blip(392, 0.3, 'triangle', 0.15); blip(523, 0.4, 'triangle', 0.15, 0.12); }
  function land() { blip(196, 0.25, 'triangle', 0.25); blip(147, 0.4, 'sine', 0.2, 0.1); }
  // Two-tone warning beep (low fuel / stall); main.js throttles the calls.
  function warn() { blip(1046, 0.12, 'square', 0.08); blip(784, 0.12, 'square', 0.08, 0.14); }

  function crash() {
    if (!started || muted || !nodes.ctx) return;
    const t = nodes.ctx.currentTime;
    const src = nodes.ctx.createBufferSource();
    const len = nodes.ctx.sampleRate * 0.7;
    const buf = nodes.ctx.createBuffer(1, len, nodes.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    src.buffer = buf;
    const f = nodes.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = nodes.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(f); f.connect(g); g.connect(nodes.ctx.destination);
    src.start(t);
    blip(82, 0.8, 'sine', 0.3);
  }

  function toggleMute() {
    muted = !muted;
    if (nodes.ctx && nodes.engineGain) nodes.engineGain.gain.value = muted ? 0 : 0.05;
    if (nodes.ctx && nodes.windGain) nodes.windGain.gain.value = muted ? 0 : 0.02;
    return muted;
  }

  return { resume, engine, ring, takeoff, land, crash, warn, toggleMute };
}
