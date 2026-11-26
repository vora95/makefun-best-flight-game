// rings.js — the delivery course: 12 glowing sky rings across the archipelago.
//
// The next ring is gold and pulsing, with a small chevron above it and a
// beacon column visible from far away; passed rings turn green; the rest
// are cyan. Flying through the next ring's hoop (within its radius,
// crossing its plane) scores it. Every ring is raised to clear the ground
// below it by at least 45 m: the first course draft buried rings 1, 2, 4,
// 8, 10 and 12 inside the mountains, which made the game unwinnable.
import * as THREE from 'three';
import { groundAt } from './world.js';

export const RING_RADIUS = 17;
export const RING_COUNT = 12;
export const RING_CLEARANCE = 45;

// Hand-placed course: takeoff over the runway, out over the reef, around
// the twin peaks, across the jungle island, back home over the town.
// Each ring has a name for the HUD toast when it is cleared.
export const RING_SPOTS = [
  { x: 0, y: 90, z: -420, name: 'Reef Gate' },
  { x: -260, y: 130, z: -900, name: 'Lighthouse Turn' },
  { x: -700, y: 190, z: -1250, name: 'Twin Peaks' },
  { x: -1250, y: 260, z: -950, name: 'West Summit' },
  { x: -900, y: 230, z: -350, name: 'Jungle Cut' },
  { x: -350, y: 170, z: 500, name: 'South Reef' },
  { x: 350, y: 210, z: 1050, name: 'Palm Bend' },
  { x: 1150, y: 250, z: 1250, name: 'Palm Island' },
  { x: 1350, y: 280, z: -200, name: 'East Cliffs' },
  { x: 1350, y: 240, z: -1150, name: 'Jungle Crown' },
  { x: 700, y: 180, z: -1150, name: 'Home Stretch' },
  { x: 180, y: 110, z: -480, name: 'Final Gate' },
];

// Course colours, one place: [torus, inner] per ring state.
const RING_COLORS = {
  done: { torus: 0x54e08a, inner: 0x9fe8b8, torusOpacity: 0.5, innerOpacity: 0.25 },
  next: { torus: 0xffd27a, inner: 0xffe9a8, torusOpacity: 1, innerOpacity: 0.8 },
  todo: { torus: 0x35d0ff, inner: 0x9feaff, torusOpacity: 0.9, innerOpacity: 0.5 },
};

// Scratch vectors: checkRingPass runs every physics step, so it reuses
// these instead of allocating two clones per call.
const _normal = new THREE.Vector3();
const _delta = new THREE.Vector3();

function ringCenter(i) {
  const spot = RING_SPOTS[i];
  return new THREE.Vector3(spot.x, Math.max(spot.y, groundAt(spot.x, spot.z) + RING_CLEARANCE), spot.z);
}

function courseDirection(i) {
  // A ring faces along the course, toward the ring after it.
  return ringCenter((i + 1) % RING_COUNT);
}

export function buildRings(scene) {
  const group = new THREE.Group();
  const rings = [];
  for (let i = 0; i < RING_COUNT; i++) {
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
    const center = ringCenter(i);
    ring.position.copy(center);
    ring.lookAt(courseDirection(i));
    ring.userData = { index: i, torus, inner, center };
    group.add(ring);
    rings.push(ring);
  }
  // Chevron: a small gold cone that bobs above the next ring so the
  // pilot can spot it even when the torus itself is edge-on.
  const chevron = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 7, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd27a })
  );
  chevron.rotation.x = Math.PI; // point down, at the ring
  group.add(chevron);
  // Beacon: a tall golden light column above the next ring.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(2.5, 2.5, 500, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  beacon.position.y = 250;
  group.add(beacon);
  scene.add(group);
  return { group, rings, beacon, chevron };
}

function paintRing(ring, palette) {
  ring.userData.torus.material.color.set(palette.torus);
  ring.userData.inner.material.color.set(palette.inner);
  ring.userData.torus.material.opacity = palette.torusOpacity;
  ring.userData.inner.material.opacity = palette.innerOpacity;
}

export function setRingStates(course, nextIndex, passedCount) {
  for (const ring of course.rings) {
    const u = ring.userData;
    paintRing(ring, u.index < passedCount ? RING_COLORS.done : u.index === nextIndex ? RING_COLORS.next : RING_COLORS.todo);
  }
  const next = course.rings[nextIndex];
  const hasNext = next !== undefined;
  course.beacon.visible = hasNext;
  course.chevron.visible = hasNext;
  if (hasNext) {
    const c = next.userData.center;
    course.beacon.position.set(c.x, c.y + 250, c.z);
    course.chevron.position.set(c.x, c.y + RING_RADIUS + 12, c.z);
  }
}

// Pulse the next ring and bob its chevron; called every frame.
export function animateRings(course, nextIndex, t) {
  const next = course.rings[nextIndex];
  for (const ring of course.rings) {
    const s = ring === next ? 1 + Math.sin(t * 3.2) * 0.06 : 1;
    ring.scale.set(s, s, 1);
  }
  if (next) {
    course.chevron.position.y = next.userData.center.y + RING_RADIUS + 12 + Math.sin(t * 2.2) * 2.5;
    course.chevron.rotation.y = t * 0.8;
  }
}

// True when the plane crossed the next ring's hoop this frame:
// close to the centre and moving through its plane.
export function checkRingPass(course, nextIndex, prevPos, pos) {
  const ring = course.rings[nextIndex];
  if (!ring) return false;
  const c = ring.userData.center;
  ring.getWorldDirection(_normal);
  const dPrev = _delta.copy(prevPos).sub(c).dot(_normal);
  const dNow = _delta.copy(pos).sub(c).dot(_normal);
  if (dPrev * dNow > 0) return false; // did not cross the plane
  return pos.distanceTo(c) < RING_RADIUS * 0.92;
}

export function ringDistance(course, nextIndex, pos) {
  const ring = course.rings[nextIndex];
  if (!ring) return 0;
  return Math.round(pos.distanceTo(ring.userData.center));
}

export function ringName(index) {
  return RING_SPOTS[index] ? RING_SPOTS[index].name : '';
}
