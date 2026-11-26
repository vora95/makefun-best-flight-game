// shots.js — deterministic screenshot staging.
// ?shot=menu | cover | runway | ring | end (&seed=N, accepted and ignored:
// the world is fixed-seed, so every run stages the same picture).
// Each shot places the plane, sets the HUD numbers and freezes the frame
// once the scene has settled, then raises window.__shotReady.
import * as THREE from 'three';
import { RUNWAY } from './world.js';
import { RING_SPOTS } from './rings.js';

export function shotFromUrl() {
  const q = new URLSearchParams(window.location.search);
  return q.get('shot') || null;
}

// Stage one shot. game exposes { state, course, setState } through the
// object passed in. Returns the camera mode the shot wants.
export function stageShot(name, game) {
  const s = game.state;
  const set = (pos, yaw, pitch, roll, speed, throttle, extra = {}) => {
    s.pos.set(pos[0], pos[1], pos[2]);
    s.prevPos.copy(s.pos);
    s.yaw = yaw; s.pitch = pitch; s.roll = roll;
    s.speed = speed; s.throttle = throttle;
    Object.assign(s, extra);
  };

  if (name === 'menu') {
    set([RUNWAY.x + 2, RUNWAY.y + 2.5, RUNWAY.z + RUNWAY.length / 2 - 40], 0.5, 0, 0, 0, 0, { airborne: false, gearDown: true });
    game.mode = 'menu';
    return 'orbit';
  }
  if (name === 'cover') {
    // Chase view, mid-course: ring 9 dead ahead, sea and islands below,
    // the sun low to the left. The beacon column marks the ring.
    set([1330, 275, -80], -0.17, 0.05, -0.12, 52, 0.82,
      { airborne: true, gearDown: false, score: 850, ringsPassed: 8, timeLeft: 142, fuel: 0.86 });
    game.mode = 'flying';
    return 'chase';
  }
  if (name === 'runway') {
    // Final approach: low over the threshold, gear down, town + lighthouse ahead.
    set([6, RUNWAY.y + 42, RUNWAY.z + 420], 0.02, -0.05, 0.04, 33, 0.45,
      { airborne: true, gearDown: true, score: 1150, ringsPassed: 12, timeLeft: 61, fuel: 0.34 });
    game.mode = 'flying';
    return 'chase-low';
  }
  if (name === 'ring') {
    // A heartbeat before the hoop: ring 6 fills the frame, +100 about to pop.
    // yaw = atan2(-dx, -dz) so the nose points at the ring: the plane flies
    // ~45 m during the settle frames and stops ~40 m short of the hoop.
    set([-380, 171, 420], -2.78, 0.02, 0.12, 54, 0.85,
      { airborne: true, gearDown: false, score: 640, ringsPassed: 5, timeLeft: 118, fuel: 0.71 });
    game.mode = 'flying';
    game.flashCenter = '+100';
    return 'chase';
  }
  if (name === 'end') {
    // Sortie complete: parked on the runway at dusk, summary on screen.
    set([RUNWAY.x, RUNWAY.y + 2.5, RUNWAY.z + 40], -0.35, 0, 0, 0, 0,
      { airborne: false, gearDown: true, score: 1750, ringsPassed: 12, landings: 1, timeLeft: 34, fuel: 0.28 });
    game.mode = 'end';
    return 'orbit';
  }
  return 'chase';
}

// After staging, let the renderer settle (a few frames for the clouds,
// the ring pulse and the HUD), then freeze and signal readiness.
export function armShotReady(frameCount, onReady) {
  let n = 0;
  const tick = () => {
    n++;
    if (n >= frameCount) {
      window.__shotReady = true;
      onReady();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function shotCameraPos(planePos, yaw, mode, out) {
  // Chase: behind and above the plane, looking forward along its heading.
  const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  if (mode === 'chase-low') {
    out.copy(planePos).addScaledVector(back, 22).add(new THREE.Vector3(0, 6, 0));
  } else {
    out.copy(planePos).addScaledVector(back, 24).add(new THREE.Vector3(0, 7, 0));
  }
  return out;
}
