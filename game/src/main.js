// main.js — SKYRING COURIER: boot, game loop, cameras, state machine.
//
// States: menu → flying → (paused) → end (complete / crashed / time-up).
// The loop is fixed-step physics (60 Hz) with a render every frame.
// Boot is one function so the whole wiring can be read top to bottom;
// the frame loop below it only ever calls small, named steps.
import * as THREE from 'three';
import { buildWorld, heightAt, RUNWAY } from './world.js';
import { buildCourierPlane, posePlane } from './plane.js';
import { buildRings, setRingStates, animateRings, checkRingPass, ringName, RING_COUNT } from './rings.js';
import { newFlightState, stepFlight, resetFlight } from './flight.js';
import { buildCompassStrip, updateHud, toast, centerFlash, showOverlay, hideOverlays } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { shotFromUrl, stageShot, armShotReady, shotCameraPos } from './shots.js';

const STEP = 1 / 60;          // fixed physics step
const WARN_BEEP_MS = 1400;    // throttle on the low-fuel / stall beep

// ---- boot ------------------------------------------------------------------
function makeRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('game-root').appendChild(renderer.domElement);
  return renderer;
}

const renderer = makeRenderer();
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc8d8e8, 1400, 5200);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.5, 12000);
camera.position.set(0, 60, 320);

buildWorld(scene);
const plane = buildCourierPlane();
scene.add(plane);
const course = buildRings(scene);

const state = newFlightState();
const input = createInput();
const audio = createAudio();
buildCompassStrip();

const game = {
  mode: 'menu',           // menu | flying | paused | end
  cameraMode: 'chase',    // chase | cockpit | orbit | chase-low
  state,
  course,
  flashCenter: null,
  shot: shotFromUrl(),
  frozen: false,
  lastWarnBeep: 0,
};

// Scratch vectors for the cameras; allocated once, reused every frame.
const camPos = new THREE.Vector3(0, 60, 320);
const camTarget = new THREE.Vector3(0, 40, 0);
const tmpVec = new THREE.Vector3();

function forwardVec(yaw, out) {
  return out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
}

// ---- end screen ------------------------------------------------------------
function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const END_COPY = {
  complete: ['SORTIE COMPLETE', 'ALL RINGS FLOWN',
    (s) => `All twelve deliveries are in. The islands got their mail, and the <b>Kutilang-7</b> is home in one piece. Time bonus banked: <b>+${Math.round(s.timeLeft) * 5} pts</b>.`],
  'crash-sea': ['DITCHED AT SEA', 'INTO THE DRINK',
    () => `The <b>Kutilang-7</b> came down in the turquoise water. The mail is soggy, the pilot is fine, and the harbour master is already laughing.`],
  'crash-terrain': ['CONTROLLED FLIGHT INTO TERRAIN', 'MOUNTAIN 1 — PILOT 0',
    () => `The jungle ridge wins this round. Next time: watch the altimeter, keep the speed up, and give the peaks some respect.`],
  'time-up': ['OUT OF TIME', 'THE MAIL GOES ON',
    () => `The sortie clock ran out with rings still unflown. The mail will wait — but the islands will remember who was late.`],
};

function setEndScreen(kind) {
  const [kicker, title, storyFn] = END_COPY[kind] ?? END_COPY['time-up'];
  document.getElementById('end-kicker').textContent = kicker;
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-story').innerHTML = storyFn(state);
  if (kind === 'complete') {
    state.score += Math.round(state.timeLeft) * 5;
  }
  document.getElementById('end-score').textContent = state.score.toLocaleString('en-US');
  document.getElementById('end-rings').textContent = `${state.ringsPassed}/${RING_COUNT}`;
  document.getElementById('end-land').textContent = String(state.landings);
  document.getElementById('end-time').textContent = fmtClock(180 - state.timeLeft);
  showOverlay('end');
}

// ---- flow ------------------------------------------------------------------
function startFlying() {
  resetFlight(state);
  setRingStates(course, 0, 0);
  game.mode = 'flying';
  game.cameraMode = 'chase';
  hideOverlays();
  audio.resume();
  toast('RING 1 — HEAD NORTH, FOLLOW THE GOLD BEACON', 2600);
}

function endFlight(kind) {
  game.mode = 'end';
  audio.crash();
  setTimeout(() => setEndScreen(kind), kind.startsWith('crash') ? 900 : 100);
}

// One handler per physics event; the table keeps handleEvent a lookup.
const EVENT_HANDLERS = {
  takeoff: () => { toast('AIRBORNE — GEAR UP, FLY THE RINGS', 2200); audio.takeoff(); },
  landed: () => { toast('TOUCHDOWN +250 — FUEL TOPPED UP', 2400); audio.land(); },
  'fuel-out': () => toast('FUEL EMPTY — GLIDE TO THE RUNWAY', 3000),
  stall: () => { /* the HUD warning + beep cover it */ },
  'crash-sea': () => endFlight('crash-sea'),
  'crash-terrain': () => endFlight('crash-terrain'),
  'time-up': () => endFlight('time-up'),
};

function handleEvent(ev) {
  if (ev && EVENT_HANDLERS[ev]) EVENT_HANDLERS[ev]();
}

function collectRing() {
  state.ringsPassed++;
  state.score += 100;
  centerFlash('+100');
  audio.ring();
  if (state.ringsPassed >= RING_COUNT) {
    toast('ALL RINGS FLOWN — BRING HER HOME', 2600);
  } else {
    toast(`RING ${state.ringsPassed} CLEAR — ${ringName(state.ringsPassed).toUpperCase()} AHEAD`, 1400);
  }
  setRingStates(course, state.ringsPassed, state.ringsPassed);
}

// ---- cameras ---------------------------------------------------------------
function menuCamera(dt, t) {
  if (game.shot === 'menu') {
    // Fixed hero angle for the menu screenshot: front 3/4, low, the nose
    // and fuselage in full view with the wing edge-on behind them.
    const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw);
    const rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
    tmpVec.set(
      state.pos.x + fx * 20 + rx * 10,
      state.pos.y + 3.5,
      state.pos.z + fz * 20 + rz * 10
    );
    camera.position.lerp(tmpVec, Math.min(1, dt * 2));
    // Aim right of the plane so it sits in the right third, clear of
    // the left-aligned menu card.
    camera.lookAt(state.pos.x + rx * 10, state.pos.y + 1, state.pos.z + rz * 10);
    return;
  }
  // Slow orbit around the parked plane: runway, town and sea behind it.
  const a = t * 0.12 + 0.6;
  tmpVec.set(
    state.pos.x + Math.sin(a) * 22,
    state.pos.y + 9 + Math.sin(t * 0.25) * 1.5,
    state.pos.z + Math.cos(a) * 22
  );
  camera.position.lerp(tmpVec, Math.min(1, dt * 2));
  // Aim slightly left of the plane so it sits right-of-centre, clear of
  // the left-aligned menu card.
  camera.lookAt(state.pos.x - Math.cos(a) * 8, state.pos.y + 2, state.pos.z + Math.sin(a) * 8);
}

function cockpitCamera() {
  // Over-the-nose view: panel edge + prop + the world ahead.
  const fwd = forwardVec(state.yaw, new THREE.Vector3());
  tmpVec.copy(state.pos).addScaledVector(fwd, -4.5).add(new THREE.Vector3(0, 1.35, 0));
  camera.position.copy(tmpVec);
  tmpVec.copy(state.pos).addScaledVector(fwd, -60);
  tmpVec.y = state.pos.y + Math.sin(state.pitch) * 60;
  camera.up.set(Math.sin(state.roll), Math.cos(state.roll), 0);
  camera.lookAt(tmpVec);
}

function chaseCamera(dt) {
  // Behind and above, smoothed so the camera never fights the pilot.
  camera.up.set(0, 1, 0);
  const low = game.cameraMode === 'chase-low';
  const want = shotCameraPos(state.pos, state.yaw, low ? 'chase-low' : 'chase', new THREE.Vector3());
  camPos.lerp(want, Math.min(1, dt * 3.2));
  camera.position.copy(camPos);
  const ahead = tmpVec.copy(state.pos).add(new THREE.Vector3(0, 1.5, 0))
    .addScaledVector(forwardVec(state.yaw, new THREE.Vector3()), 26);
  camTarget.lerp(ahead, Math.min(1, dt * 4));
  camera.lookAt(camTarget);
}

function updateCamera(dt, t) {
  if (game.mode === 'menu' || game.shot === 'menu' || game.shot === 'end') {
    menuCamera(dt, t);
    return;
  }
  if (game.cameraMode === 'cockpit') cockpitCamera();
  else chaseCamera(dt);
}

// ---- main loop -------------------------------------------------------------
let last = performance.now();
let acc = 0;
let elapsed = 0;

function pollEdgeKeys() {
  if (input.consume('KeyC') && game.mode === 'flying') {
    game.cameraMode = game.cameraMode === 'chase' ? 'cockpit' : 'chase';
    toast(game.cameraMode === 'cockpit' ? 'COCKPIT VIEW' : 'CHASE VIEW', 900);
  }
  if (input.consume('KeyM')) {
    const muted = audio.toggleMute();
    toast(muted ? 'SOUND OFF' : 'SOUND ON', 800);
  }
  if (input.consume('KeyP')) {
    if (game.mode === 'flying') { game.mode = 'paused'; showOverlay('pause'); }
    else if (game.mode === 'paused') { game.mode = 'flying'; hideOverlays(); }
  }
  if (input.consume('KeyR') && game.mode !== 'menu') startFlying();
  if (input.consume('Enter') && game.mode === 'menu') startFlying();
}

function maybeWarnBeep(now) {
  // Edge-throttled beep while a HUD warning is active (low fuel / stall).
  const warning = (state.fuel > 0 && state.fuel < 0.2 && state.airborne)
    || (state.airborne && state.speed < 26);
  if (warning && now - game.lastWarnBeep > WARN_BEEP_MS) {
    game.lastWarnBeep = now;
    audio.warn();
  }
}

function stepPhysics(dt) {
  acc += dt;
  while (acc >= STEP) {
    acc -= STEP;
    const ev = stepFlight(state, input.read(), STEP);
    handleEvent(ev);
    if (game.mode !== 'flying') break; // crash / time-up ended the flight
    // Ring check: did we cross the next hoop?
    if (state.ringsPassed < RING_COUNT && checkRingPass(course, state.ringsPassed, state.prevPos, state.pos)) {
      collectRing();
    }
    audio.engine(state);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  elapsed += dt;

  pollEdgeKeys();

  if (game.mode === 'flying' && !game.frozen) {
    stepPhysics(dt);
    updateHud(state, course);
    maybeWarnBeep(now);
  }

  // Rings pulse; clouds drift; lighthouse lamp breathes.
  animateRings(course, state.ringsPassed, elapsed);
  if (scene.userData.clouds) {
    scene.userData.clouds.position.x = Math.sin(elapsed * 0.004) * 60;
  }
  if (scene.userData.lighthouseLamp) {
    scene.userData.lighthouseLamp.material.color.setHex(Math.sin(elapsed * 2.4) > 0 ? 0xffe9a8 : 0xcc9955);
  }

  posePlane(plane, state);
  updateCamera(dt, elapsed);
  renderer.render(scene, camera);
}

// ---- buttons + auto-pause --------------------------------------------------
document.getElementById('btn-fly').addEventListener('click', startFlying);
document.getElementById('btn-resume').addEventListener('click', () => { game.mode = 'flying'; hideOverlays(); });
document.getElementById('btn-again').addEventListener('click', startFlying);
renderer.domElement.addEventListener('click', () => { if (game.mode === 'menu') audio.resume(); });

// Losing the window mid-flight pauses the sortie instead of letting the
// plane fly on, unflown, while the pilot is away.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'flying') { game.mode = 'paused'; showOverlay('pause'); }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- boot ------------------------------------------------------------------
setRingStates(course, 0, 0);
updateHud(state, course);
if (game.shot) {
  const cam = stageShot(game.shot, game);
  if (cam === 'orbit') game.cameraMode = 'orbit';
  else if (cam === 'chase-low') game.cameraMode = 'chase-low';
  else game.cameraMode = 'chase';
  if (game.shot === 'menu') showOverlay('menu');
  else if (game.shot === 'end') setEndScreen('complete');
  else hideOverlays();
  // Re-colour the rings for the staged progress: the next ring is gold,
  // passed rings green, the rest cyan — and the beacon sits over the next.
  setRingStates(course, state.ringsPassed, state.ringsPassed);
  updateHud(state, course);
  if (game.flashCenter) centerFlash(game.flashCenter, 30000);
  // Freeze the physics at the staged pose: in headless SwiftShader each
  // rendered frame can take ~0.1 s, so 50 settle frames would otherwise
  // fly the plane hundreds of metres past the staged ring.
  game.frozen = true;
  // Snap the chase camera to its staged spot so the settle frames do not
  // swing in from the boot position.
  if (game.shot !== 'menu' && game.shot !== 'end') {
    shotCameraPos(state.pos, state.yaw, game.cameraMode === 'chase-low' ? 'chase-low' : 'chase', camPos);
    camera.position.copy(camPos);
    camTarget.copy(state.pos).add(new THREE.Vector3(0, 1.5, 0))
      .addScaledVector(forwardVec(state.yaw, new THREE.Vector3()), 26);
  }
  armShotReady(50, () => { game.frozen = true; });
} else {
  showOverlay('menu');
}
// Debug handle for play-testing (harmless in production): window.__sky.
window.__sky = game;
requestAnimationFrame(frame);
