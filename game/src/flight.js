// flight.js — the arcade flight model for the Kutilang-7.
//
// Bank to turn, pitch to climb and dive, throttle to fly. Slow flight
// sinks; the sea and the mountains do not forgive. Landing needs the
// runway, low speed and a gentle descent. The model is stepped at a fixed
// 60 Hz by main.js; every helper below is pure arithmetic on the state,
// so the same inputs always produce the same flight.
import * as THREE from 'three';
import { heightAt, RUNWAY } from './world.js';

export const MAX_SPEED = 62;      // m/s, full throttle (~120 kt)
export const STALL_SPEED = 26;    // m/s: below this the wing gives up
export const CRUISE_SPEED = 46;
export const FUEL_BURN = 0.011;   // per second at full throttle
export const SORTIE_SECONDS = 180;

// One shared tuning table, so a balance change is a one-line edit and
// every helper below reads the same numbers.
const TUNING = {
  throttleRate: 0.55,   // throttle units per second
  accelAir: 6,          // m/s^2 closing on the throttle target, airborne
  accelGround: 11,      // m/s^2 on the runway roll
  brakeDecel: 22,        // m/s^2 with the airbrake held
  maxRoll: 0.85,         // rad of bank at full stick
  maxPitch: 0.42,        // rad of pitch at full stick
  rollRate: 4,           // how fast the bank chases the stick
  pitchRate: 3.2,
  turnFactor: 0.85,      // heading change per banked second
  autoLevel: 0.35,       // roll decay per second with hands off the stick
  stallSink: 0.55,       // extra sink per m/s below stall speed
  takeoffSpeed: 30,      // rolling speed that lifts the wheels
  landingVspeed: 7,      // max |vertical speed| for a scored landing
  landingSpeed: 46,      // max speed for a scored landing
  minClimbForLanding: 25, // metres climbed since takeoff, anti-bounce guard
  touchdownDrag: 26,     // m/s^2 scrubbed on a scored landing
  taxiDrag: 18,          // m/s^2 scrubbed while rolling on the strip
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function newFlightState() {
  const parked = new THREE.Vector3(RUNWAY.x, RUNWAY.y + 2.5, RUNWAY.z + RUNWAY.length / 2 - 30);
  return {
    pos: parked.clone(),
    prevPos: parked.clone(),
    yaw: 0,               // facing north (-z): runway heading
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0,
    fuel: 1,
    gearDown: true,
    airborne: false,
    crashed: false,
    landed: false,
    timeLeft: SORTIE_SECONDS,
    score: 0,
    ringsPassed: 0,
    landings: 0,
    vspeed: 0,              // vertical speed, for the landing check
    highestY: RUNWAY.y + 2.5, // highest altitude since takeoff (bounce guard)
  };
}

function onRunway(x, z) {
  return Math.abs(x - RUNWAY.x) < RUNWAY.width / 2 + 6 &&
    Math.abs(z - RUNWAY.z) < RUNWAY.length / 2 + 10;
}

function applyThrottle(state, input, dt) {
  state.throttle = clamp(state.throttle + input.throttleDelta * dt * TUNING.throttleRate, 0, 1);
  const target = state.throttle * MAX_SPEED * (state.fuel > 0 ? 1 : 0.25);
  const accel = state.airborne ? TUNING.accelAir : TUNING.accelGround;
  state.speed += clamp(target - state.speed, -accel * dt, accel * dt);
  if (input.brake) state.speed = Math.max(0, state.speed - TUNING.brakeDecel * dt);
}

function applyControls(state, input, dt) {
  // Authority fades near stall: the stick goes mushy when the wing quits.
  const authority = clamp(state.speed / CRUISE_SPEED, 0.25, 1);
  const targetRoll = input.roll * TUNING.maxRoll * authority;
  state.roll += (targetRoll - state.roll) * Math.min(1, dt * TUNING.rollRate);
  const targetPitch = input.pitch * TUNING.maxPitch * authority;
  state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * TUNING.pitchRate);
  // Hands off the stick, the wings level themselves gently (arcade assist).
  if (input.roll === 0 && state.airborne) {
    state.roll -= state.roll * Math.min(1, dt * TUNING.autoLevel);
  }
  // A banked turn changes heading; steeper bank turns faster.
  state.yaw -= Math.sin(state.roll) * (state.speed / 46) * dt * TUNING.turnFactor;
}

function integrate(state, dt) {
  // Vertical motion: climb from pitch, sink when slow.
  let vy = Math.sin(state.pitch) * state.speed;
  let stalling = false;
  if (state.speed < STALL_SPEED) {
    vy -= (STALL_SPEED - state.speed) * TUNING.stallSink;
    if (state.airborne && state.speed < STALL_SPEED * 0.8 && state.pos.y < 60) stalling = true;
  }
  state.vspeed = vy;
  const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  state.pos.addScaledVector(forward, state.speed * Math.cos(state.pitch) * dt);
  state.pos.y += vy * dt;
  return stalling;
}

function updateGear(state) {
  if (!state.airborne) return;
  state.highestY = Math.max(state.highestY, state.pos.y);
  // Gear comes up only once the plane is clearly climbing away — never
  // while it is setting up to land (slow, descending, near the field).
  const nearField = Math.abs(state.pos.x - RUNWAY.x) < 300 && Math.abs(state.pos.z - RUNWAY.z) < 500;
  const landingSetup = state.vspeed < -0.5 && state.speed < 40 && nearField;
  if (state.gearDown && state.pos.y > RUNWAY.y + 15 && !landingSetup) state.gearDown = false;
  else if (!state.gearDown && landingSetup && state.pos.y < RUNWAY.y + 120) state.gearDown = true;
}

// Ground contact. Returns 'landed' | 'crash-sea' | 'crash-terrain' | null.
function handleGround(state, dt) {
  const ground = heightAt(state.pos.x, state.pos.z);
  const groundY = Math.max(ground, 0);
  if (state.pos.y > groundY + 1.6) return null;
  if (onRunway(state.pos.x, state.pos.z)) {
    if (state.airborne) {
      const climbed = state.highestY > RUNWAY.y + TUNING.minClimbForLanding;
      const gentle = Math.abs(state.vspeed) < TUNING.landingVspeed && state.speed < TUNING.landingSpeed;
      if (gentle && state.gearDown && climbed) {
        // Scored landing: gentle descent, modest speed, gear down, and a
        // real flight behind it — a bounce straight after liftoff is a
        // bounce, not a +250 landing.
        state.pos.y = RUNWAY.y + 2.2;
        state.airborne = false;
        state.speed = Math.max(0, state.speed - TUNING.touchdownDrag * dt);
        state.pitch = 0; state.roll = 0;
        state.landings++;
        state.fuel = 1;
        state.score += 250;
        return 'landed';
      }
      if (state.gearDown && !climbed) {
        // Bounce: back on the wheels, keep rolling, no score.
        state.pos.y = RUNWAY.y + 2.2;
        state.airborne = false;
        state.pitch = 0; state.roll = 0;
        return null;
      }
      return 'crash-terrain';
    }
    // Taxiing on the strip after a landing: roll to a stop, no crash.
    state.pos.y = RUNWAY.y + 2.2;
    state.speed = Math.max(0, state.speed - TUNING.taxiDrag * dt);
    state.pitch = 0; state.roll = 0;
    return null;
  }
  if (state.airborne || state.speed > 8) {
    state.crashed = true;
    return ground <= 0.5 ? 'crash-sea' : 'crash-terrain';
  }
  state.pos.y = groundY + 1.6; // parked on the ground
  return null;
}

// One simulation step. input: { pitch, roll, throttleDelta, brake } in [-1, 1].
// Returns an event string: 'takeoff' | 'stall' | 'crash-terrain' | 'crash-sea'
// | 'landed' | 'fuel-out' | 'time-up' | null.
export function stepFlight(state, input, dt) {
  state.prevPos.copy(state.pos);

  applyThrottle(state, input, dt);
  applyControls(state, input, dt);
  const stalling = integrate(state, dt);

  // Fuel burns with throttle; empty tanks mean a glide, not a fall.
  if (state.fuel > 0) {
    state.fuel = Math.max(0, state.fuel - FUEL_BURN * (0.35 + state.throttle) * dt);
    if (state.fuel === 0) return 'fuel-out';
  }

  // Takeoff: rolling fast enough on the strip lifts the wheels. The
  // threshold sits above stall speed, so the wing is flying the moment
  // it leaves the ground and cannot sink straight back into the strip.
  if (!state.airborne && state.speed > TUNING.takeoffSpeed && onRunway(state.pos.x, state.pos.z)) {
    state.airborne = true;
    state.highestY = state.pos.y;
    return 'takeoff';
  }
  updateGear(state);

  const groundEvent = handleGround(state, dt);
  if (groundEvent) return groundEvent;
  // The stall warning is raised only after the plane has actually moved
  // this step — the old code returned before integrating, freezing the
  // plane in mid-air for a frame on every stall step.
  if (stalling) return 'stall';

  // Sortie clock runs only once airborne.
  if (state.airborne) {
    state.timeLeft -= dt;
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      return 'time-up';
    }
  }
  return null;
}

export function resetFlight(state) {
  const fresh = newFlightState();
  Object.assign(state, fresh);
  state.pos.copy(fresh.pos);
  state.prevPos.copy(fresh.prevPos);
}
