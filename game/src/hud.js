// hud.js — the instrument panel: altitude, speed, heading, vertical
// speed, fuel, score, the compass strip, the artificial horizon, and the
// toast messages. All numbers are pilot units: feet, knots, degrees,
// feet per minute. DOM lookups happen once, up front, into `el`.
import { RING_COUNT, ringDistance, ringName } from './rings.js';

// One lookup per element, at module load; every updater reads from here.
const el = {};
for (const id of [
  'hud-alt', 'hud-spd', 'hud-hdg', 'hud-vsi', 'hud-score', 'hud-ring', 'hud-time',
  'hud-fuelfill', 'hud-thrfill', 'hud-thr', 'hud-gear', 'hud-dist', 'hud-next',
  'compass-strip', 'attitude', 'hud-warn', 'hud-toast', 'hud-center',
  'menu', 'pause', 'end', 'hud',
]) el[id] = document.getElementById(id);

const FT_PER_M = 3.28084;
const KT_PER_MS = 1.94384;
const FPM_PER_MS = 196.85;
const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const PX_PER_DEG = 12; // compass strip: 60 px per 5 degrees

function fmtClock(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function headingDeg(yaw) {
  // yaw 0 = north (-z); heading grows clockwise as seen from above.
  let h = ((-yaw * 180) / Math.PI) % 360;
  if (h < 0) h += 360;
  return Math.round(h);
}

export function buildCompassStrip() {
  // One span per 5 degrees, doubled so the strip can wrap around.
  const strip = el['compass-strip'];
  const frag = document.createDocumentFragment();
  const makeSpan = (label) => {
    const s = document.createElement('span');
    s.style.cssText = 'display:inline-block;width:60px;text-align:center';
    s.textContent = label;
    return s;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let deg = 0; deg < 360; deg += 5) {
      frag.appendChild(makeSpan(deg % 45 === 0 ? COMPASS_POINTS[deg / 45] : String(deg).padStart(3, '0')));
    }
  }
  strip.appendChild(frag);
}

function setReadout(id, value) {
  const node = el[id];
  if (node.textContent !== value) node.textContent = value;
}

export function updateHud(state, course) {
  setReadout('hud-alt', Math.round(state.pos.y * FT_PER_M).toLocaleString('en-US'));
  setReadout('hud-spd', String(Math.round(state.speed * KT_PER_MS)));
  el['hud-hdg'].innerHTML = String(headingDeg(state.yaw)).padStart(3, '0') + '&deg;';
  const vsi = Math.round(state.vspeed * FPM_PER_MS);
  setReadout('hud-vsi', (vsi > 0 ? '+' : '') + vsi.toLocaleString('en-US'));
  setReadout('hud-score', state.score.toLocaleString('en-US'));
  setReadout('hud-ring', `${state.ringsPassed}/${RING_COUNT}`);
  setReadout('hud-time', fmtClock(state.timeLeft));
  const fuelEl = el['hud-fuelfill'];
  fuelEl.style.width = `${Math.round(state.fuel * 100)}%`;
  fuelEl.classList.toggle('low', state.fuel < 0.25);
  el['hud-thrfill'].style.width = `${Math.round(state.throttle * 100)}%`;
  setReadout('hud-thr', `${Math.round(state.throttle * 100)}%`);
  setReadout('hud-gear', state.gearDown ? 'GEAR DOWN' : 'GEAR UP');
  el['hud-gear'].classList.toggle('up', !state.gearDown);
  const done = state.ringsPassed >= RING_COUNT;
  setReadout('hud-dist', done ? 'COURSE DONE' : `${ringDistance(course, state.ringsPassed, state.pos)} m`);
  el['hud-next'].firstChild.textContent = done
    ? 'ALL RINGS FLOWN — LAND AT TANJUNG '
    : `NEXT RING ${ringName(state.ringsPassed).toUpperCase()} `;

  // Compass strip: needle fixed at the centre, strip slides under it.
  const strip = el['compass-strip'];
  const offset = 170 - headingDeg(state.yaw) * PX_PER_DEG;
  const span = 360 * PX_PER_DEG;
  const wrapped = ((offset % span) + span) % span - span;
  strip.style.transform = `translateX(${wrapped}px)`;

  drawAttitude(state);
  updateWarning(state);
}

// Priority order: low fuel beats stall, because the fix is different
// (land now vs push the nose down). Returns the active warning, if any.
function updateWarning(state) {
  const warn = el['hud-warn'];
  let text = '';
  if (state.fuel > 0 && state.fuel < 0.2 && state.airborne) {
    text = 'LOW FUEL — LAND ON THE RUNWAY';
  } else if (state.airborne && state.speed < 26) {
    text = 'STALL — PUSH THE NOSE DOWN, ADD POWER';
  }
  if (text) {
    if (warn.textContent !== text) warn.textContent = text;
    warn.classList.add('show');
  } else {
    warn.classList.remove('show');
  }
  return text;
}

// Artificial horizon: a canvas with a sky/ground split that rolls and
// pitches with the plane, plus a fixed centre marker.
function drawAttitude(state) {
  const cv = el.attitude;
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2, R = 72;
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
  g.translate(cx, cy);
  g.rotate(-state.roll);
  const pitchPx = Math.max(-R, Math.min(R, state.pitch * R * 1.4));
  g.translate(0, pitchPx);
  g.fillStyle = '#3f8fd2';
  g.fillRect(-R - 10, -R * 2, (R + 10) * 2, R * 2);
  g.fillStyle = '#7a5a34';
  g.fillRect(-R - 10, 0, (R + 10) * 2, R * 2);
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(-R - 10, 0); g.lineTo(R + 10, 0); g.stroke();
  g.lineWidth = 1;
  for (const dy of [-30, 30]) {
    g.beginPath(); g.moveTo(-22, dy); g.lineTo(22, dy); g.stroke();
  }
  g.restore();
  // Fixed aircraft marker + rim.
  g.strokeStyle = '#ffd27a';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(cx - 26, cy); g.lineTo(cx - 8, cy);
  g.moveTo(cx + 8, cy); g.lineTo(cx + 26, cy);
  g.stroke();
  g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fillStyle = '#ffd27a'; g.fill();
  g.strokeStyle = 'rgba(244,234,210,0.6)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
}

let toastTimer = null;
let centerTimer = null;

export function toast(text, ms = 1600) {
  const node = el['hud-toast'];
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), ms);
}

export function centerFlash(text, ms = 700) {
  const node = el['hud-center'];
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(centerTimer);
  centerTimer = setTimeout(() => node.classList.remove('show'), ms);
}

export function showOverlay(id) {
  for (const o of ['menu', 'pause', 'end']) el[o].classList.toggle('hidden', o !== id);
  el.hud.classList.toggle('hidden', id === 'menu');
}

export function hideOverlays() {
  for (const o of ['menu', 'pause', 'end']) el[o].classList.add('hidden');
  el.hud.classList.remove('hidden');
}
