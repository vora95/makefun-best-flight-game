// hud.js — the instrument panel: altitude, speed, heading, fuel, score,
// the compass strip, the artificial horizon, and the toast messages.
// All numbers are pilot units: feet, knots, degrees.
import { RING_COUNT, ringDistance } from './rings.js';

const $ = (id) => document.getElementById(id);

const FT_PER_M = 3.28084;
const KT_PER_MS = 1.94384;

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function headingDeg(yaw) {
  // yaw 0 = north (-z); heading grows clockwise as seen from above.
  let h = ((-yaw * 180) / Math.PI) % 360;
  if (h < 0) h += 360;
  return Math.round(h);
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function buildCompassStrip() {
  const el = $('compass-strip');
  let html = '';
  for (let deg = 0; deg < 360; deg += 5) {
    const label = deg % 45 === 0 ? COMPASS_POINTS[deg / 45] : String(deg).padStart(3, '0');
    html += `<span style="display:inline-block;width:60px;text-align:center">${label}</span>`;
  }
  el.innerHTML = html + html; // doubled so the strip can wrap
}

export function updateHud(state, course) {
  $('hud-alt').textContent = Math.round(state.pos.y * FT_PER_M).toLocaleString('en-US');
  $('hud-spd').textContent = Math.round(state.speed * KT_PER_MS);
  $('hud-hdg').innerHTML = String(headingDeg(state.yaw)).padStart(3, '0') + '&deg;';
  $('hud-score').textContent = state.score.toLocaleString('en-US');
  $('hud-ring').textContent = `${state.ringsPassed}/${RING_COUNT}`;
  $('hud-time').textContent = fmtTime(state.timeLeft);
  const fuelEl = $('hud-fuelfill');
  fuelEl.style.width = `${Math.round(state.fuel * 100)}%`;
  fuelEl.classList.toggle('low', state.fuel < 0.25);
  $('hud-thrfill').style.width = `${Math.round(state.throttle * 100)}%`;
  $('hud-thr').textContent = `${Math.round(state.throttle * 100)}%`;
  $('hud-gear').textContent = state.gearDown ? 'GEAR DOWN' : 'GEAR UP';
  $('hud-gear').classList.toggle('up', !state.gearDown);
  const dist = ringDistance(course, state.ringsPassed, state.pos);
  $('hud-dist').textContent = state.ringsPassed >= RING_COUNT ? 'COURSE DONE' : `${dist} m`;

  // Compass strip: 60 px per 5 degrees, needle fixed at the centre.
  const strip = $('compass-strip');
  const hdg = headingDeg(state.yaw);
  const pxPerDeg = 12;
  const offset = 170 - hdg * pxPerDeg;
  const wrapped = ((offset % (360 * pxPerDeg)) + 360 * pxPerDeg) % (360 * pxPerDeg) - 360 * pxPerDeg;
  strip.style.transform = `translateX(${wrapped}px)`;

  drawAttitude(state);
  const warn = $('hud-warn');
  if (state.fuel > 0 && state.fuel < 0.2 && state.airborne) {
    warn.textContent = 'LOW FUEL — LAND ON THE RUNWAY';
    warn.classList.add('show');
  } else if (state.airborne && state.speed < 26) {
    warn.textContent = 'STALL — PUSH THE NOSE DOWN, ADD POWER';
    warn.classList.add('show');
  } else {
    warn.classList.remove('show');
  }
}

// Artificial horizon: a canvas with a sky/ground split that rolls and
// pitches with the plane, plus a fixed centre marker.
function drawAttitude(state) {
  const cv = $('attitude');
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
  g.beginPath(); g.moveTo(cx - 26, cy); g.lineTo(cx - 8, cy); g.moveTo(cx + 8, cy); g.lineTo(cx + 26, cy); g.stroke();
  g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fillStyle = '#ffd27a'; g.fill();
  g.strokeStyle = 'rgba(244,234,210,0.6)';
  g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
}

let toastTimer = null;
let centerTimer = null;

export function toast(text, ms = 1600) {
  const el = $('hud-toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function centerFlash(text, ms = 700) {
  const el = $('hud-center');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(centerTimer);
  centerTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function showOverlay(id) {
  for (const o of ['menu', 'pause', 'end']) $(o).classList.toggle('hidden', o !== id);
  $('hud').classList.toggle('hidden', id === 'menu');
}

export function hideOverlays() {
  for (const o of ['menu', 'pause', 'end']) $(o).classList.add('hidden');
  $('hud').classList.remove('hidden');
}
