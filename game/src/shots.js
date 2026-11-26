// shots.js — deterministic screenshot staging.
//
// ?shot=menu | cover | runway | ring | end (&seed=N, accepted and ignored:
// the world is fixed-seed, so every run stages the same picture). Each
// shot is one row in SHOT_TABLE: the plane pose, the flight numbers the
// HUD should show, the camera, and the game mode. Once staged, the frame
// freezes after a few settle frames and raises window.__shotReady.
import * as THREE from 'three';
import { RUNWAY } from './world.js';

export function shotFromUrl() {
  const q = new URLSearchParams(window.location.search);
  return q.get('shot') || null;
}

// pose: [x, y, z], yaw, pitch, roll, speed, throttle — plus the HUD state.
const SHOT_TABLE = {
  menu: {
    // Parked on the runway, town behind; the orbit camera slowly circles.
    pose: [RUNWAY.x + 2, RUNWAY.y + 2.5, RUNWAY.z + RUNWAY.length / 2 - 40],
    yaw: 0.5, pitch: 0, roll: 0, speed: 0, throttle: 0,
    extra: { airborne: false, gearDown: true },
    mode: 'menu', camera: 'orbit',
  },
  cover: {
    // Chase view, mid-course: ring 9 dead ahead, sea and islands below,
    // the sun low to the left. The beacon column marks the ring.
    pose: [1330, 275, -80],
    yaw: -0.17, pitch: 0.05, roll: -0.12, speed: 52, throttle: 0.82,
    extra: { airborne: true, gearDown: false, score: 850, ringsPassed: 8, timeLeft: 142, fuel: 0.86 },
    mode: 'flying', camera: 'chase',
  },
  runway: {
    // Final approach: low over the threshold, gear down, town + lighthouse ahead.
    pose: [6, RUNWAY.y + 42, RUNWAY.z + 420],
    yaw: 0.02, pitch: -0.05, roll: 0.04, speed: 33, throttle: 0.45,
    extra: { airborne: true, gearDown: true, score: 1150, ringsPassed: 12, timeLeft: 61, fuel: 0.34 },
    mode: 'flying', camera: 'chase-low',
  },
  ring: {
    // A heartbeat before the hoop: ring 6 fills the frame, +100 about to pop.
    // yaw = atan2(-dx, -dz) so the nose points at the ring: the plane flies
    // ~45 m during the settle frames and stops ~40 m short of the hoop.
    pose: [-380, 171, 420],
    yaw: -2.78, pitch: 0.02, roll: 0.12, speed: 54, throttle: 0.85,
    extra: { airborne: true, gearDown: false, score: 640, ringsPassed: 5, timeLeft: 118, fuel: 0.71 },
    mode: 'flying', camera: 'chase', flash: '+100',
  },
  end: {
    // Sortie complete: parked on the runway at dusk, summary on screen.
    pose: [RUNWAY.x, RUNWAY.y + 2.5, RUNWAY.z + 40],
    yaw: -0.35, pitch: 0, roll: 0, speed: 0, throttle: 0,
    extra: { airborne: false, gearDown: true, score: 1750, ringsPassed: 12, landings: 1, timeLeft: 34, fuel: 0.28 },
    mode: 'end', camera: 'orbit',
  },
};

// Stage one shot. game exposes { state, course } plus the fields main.js
// writes (mode, flashCenter). Returns the camera mode the shot wants.
export function stageShot(name, game) {
  const shot = SHOT_TABLE[name];
  if (!shot) return 'chase';
  const s = game.state;
  s.pos.set(...shot.pose);
  s.prevPos.copy(s.pos);
  s.yaw = shot.yaw; s.pitch = shot.pitch; s.roll = shot.roll;
  s.speed = shot.speed; s.throttle = shot.throttle;
  // Frozen staged shots never run the physics step, so derive the
  // vertical speed from the pose — otherwise the HUD's VSI reads 0
  // while the plane is visibly climbing or descending.
  s.vspeed = Math.sin(shot.pitch) * shot.speed;
  Object.assign(s, shot.extra);
  game.mode = shot.mode;
  if (shot.flash) game.flashCenter = shot.flash;
  return shot.camera;
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
  const dist = mode === 'chase-low' ? 22 : 24;
  const height = mode === 'chase-low' ? 6 : 7;
  out.copy(planePos).addScaledVector(back, dist).add(new THREE.Vector3(0, height, 0));
  return out;
}
