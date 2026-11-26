// rings.js — the delivery course: 12 glowing sky rings across the archipelago.
// The next ring is gold and pulsing; passed rings turn green; the rest are cyan.
// Flying through the next ring's hoop (within its radius, crossing its plane)
// scores it. A beacon column marks the next ring from far away.
// Every ring is raised to clear the ground below it by at least 45 m:
// the first course draft buried rings 1, 2, 4, 8, 10 and 12 inside the
// mountains, which made the game unwinnable.
import * as THREE from 'three';
import { groundAt } from './world.js';

export const RING_RADIUS = 17;
export const RING_COUNT = 12;
export const RING_CLEARANCE = 45;

// Hand-placed course: takeoff over the runway, out over the reef, around the
// twin peaks, across the jungle island, back home over the town.
export const RING_SPOTS = [
  { x: 0, y: 90, z: -420 },
  { x: -260, y: 130, z: -900 },
  { x: -700, y: 190, z: -1250 },
  { x: -1250, y: 260, z: -950 },
  { x: -900, y: 230, z: -350 },
  { x: -350, y: 170, z: 500 },
  { x: 350, y: 210, z: 1050 },
  { x: 1150, y: 250, z: 1250 },
  { x: 1350, y: 280, z: -200 },
  { x: 1350, y: 240, z: -1150 },
  { x: 700, y: 180, z: -1150 },
  { x: 180, y: 110, z: -480 },
];

export function buildRings(scene) {
  const group = new THREE.Group();
  const rings = [];
  for (let i = 0; i < RING_COUNT; i++) {
    const spot = RING_SPOTS[i];
    // Lift the ring above the ground: never closer than RING_CLEARANCE.
    const y = Math.max(spot.y, groundAt(spot.x, spot.z) + RING_CLEARANCE);
    const ring = new THREE.Group();
    const torus = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 1.6, 12, 40),
      new THREE.MeshBasicMaterial({ color: 0x35d0ff, transparent: true, opacity: 0.95 })
    );
    ring.add(torus);
    const inner = new THREE.Mesh(
      new THREE.TorusGeometry(RING_RADIUS, 0.55, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x9feaff, transparent: true, opacity: 0.55 })
    );
    ring.add(inner);
    // Face the ring along the course direction (toward the next ring).
    const next = RING_SPOTS[(i + 1) % RING_COUNT];
    const nextY = Math.max(next.y, groundAt(next.x, next.z) + RING_CLEARANCE);
    ring.position.set(spot.x, y, spot.z);
    ring.lookAt(next.x, nextY, next.z);
    ring.userData = { index: i, torus, inner, state: 'todo', center: new THREE.Vector3(spot.x, y, spot.z) };
    group.add(ring);
    rings.push(ring);
  }
  // Beacon: a tall golden light column above the next ring.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 500, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  beacon.position.y = 250;
  group.add(beacon);
  scene.add(group);
  return { group, rings, beacon };
}

export function setRingStates(course, nextIndex, passedCount) {
  for (const ring of course.rings) {
    const u = ring.userData;
    if (u.index < passedCount) {
      u.torus.material.color.set(0x54e08a);
      u.inner.material.color.set(0x9fe8b8);
      u.torus.material.opacity = 0.5;
      u.inner.material.opacity = 0.25;
    } else if (u.index === nextIndex) {
      u.torus.material.color.set(0xffd27a);
      u.inner.material.color.set(0xffe9a8);
      u.torus.material.opacity = 1;
      u.inner.material.opacity = 0.8;
    } else {
      u.torus.material.color.set(0x35d0ff);
      u.inner.material.color.set(0x9feaff);
      u.torus.material.opacity = 0.9;
      u.inner.material.opacity = 0.5;
    }
  }
  const next = course.rings[nextIndex];
  if (next) {
    course.beacon.position.set(next.userData.center.x, next.userData.center.y + 250, next.userData.center.z);
    course.beacon.visible = true;
  } else {
    course.beacon.visible = false;
  }
}

// Pulse the next ring and drift the clouds a little; called every frame.
export function animateRings(course, nextIndex, t) {
  const next = course.rings[nextIndex];
  if (next) {
    const s = 1 + Math.sin(t * 3.2) * 0.06;
    next.scale.set(s, s, 1);
  }
  for (const ring of course.rings) {
    if (ring !== next) ring.scale.set(1, 1, 1);
  }
}

// True when the plane crossed the next ring's hoop this frame:
// close to the centre and moving through its plane.
export function checkRingPass(course, nextIndex, prevPos, pos) {
  const ring = course.rings[nextIndex];
  if (!ring) return false;
  const c = ring.userData.center;
  const normal = new THREE.Vector3();
  ring.getWorldDirection(normal);
  const dPrev = prevPos.clone().sub(c).dot(normal);
  const dNow = pos.clone().sub(c).dot(normal);
  if (dPrev * dNow > 0) return false; // did not cross the plane
  const dist = pos.distanceTo(c);
  return dist < RING_RADIUS * 0.92;
}

export function ringDistance(course, nextIndex, pos) {
  const ring = course.rings[nextIndex];
  if (!ring) return 0;
  return Math.round(pos.distanceTo(ring.userData.center));
}
