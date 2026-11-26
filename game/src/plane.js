// plane.js — the Kutilang-7 mail plane, built from three.js primitives.
//
// Teal-and-cream courier livery, high wing, fixed gear, spinning prop.
// The mesh faces -z (its nose), matching the flight model's heading math.
// Builders are split per assembly so one part can be restyled without
// touching the rest; posePlane applies the flight state every frame.
import * as THREE from 'three';

// One palette for the whole livery; a repaint is a one-line change here.
const LIVERY = {
  teal: new THREE.MeshLambertMaterial({ color: 0x1f7a6d }),
  cream: new THREE.MeshLambertMaterial({ color: 0xf2e8d0 }),
  dark: new THREE.MeshLambertMaterial({ color: 0x2b3438 }),
  glass: new THREE.MeshPhongMaterial({ color: 0x9fd4e8, shininess: 120, specular: 0xffffff }),
  amber: new THREE.MeshBasicMaterial({ color: 0xffc46b }),
  red: new THREE.MeshBasicMaterial({ color: 0xff5a4e }),
  green: new THREE.MeshBasicMaterial({ color: 0x54e08a }),
  white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

function buildFuselage(plane) {
  // Tapered body + nose cone + tail cone.
  const body = mesh(new THREE.CylinderGeometry(1.15, 0.85, 6.4, 12), LIVERY.teal, 0, 0, 0.4);
  body.rotation.x = Math.PI / 2;
  plane.add(body);
  const nose = mesh(new THREE.ConeGeometry(1.12, 1.7, 12), LIVERY.cream, 0, 0, -3.9);
  nose.rotation.x = -Math.PI / 2;
  plane.add(nose);
  const tail = mesh(new THREE.ConeGeometry(0.82, 2.2, 12), LIVERY.teal, 0, 0.15, 4.6);
  tail.rotation.x = Math.PI / 2;
  plane.add(tail);
  // Cockpit glasshouse.
  const canopy = mesh(new THREE.SphereGeometry(1.02, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), LIVERY.glass, 0, 0.55, -1.4);
  canopy.scale.set(1, 0.62, 1.5);
  plane.add(canopy);
}

function buildWing(plane) {
  // High wing with teal tips, braced by two struts.
  plane.add(mesh(new THREE.BoxGeometry(13.5, 0.28, 2.5), LIVERY.cream, 0, 1.05, -0.6));
  plane.add(mesh(new THREE.BoxGeometry(0.3, 0.5, 2.5), LIVERY.teal, -6.75, 1.05, -0.6));
  plane.add(mesh(new THREE.BoxGeometry(0.3, 0.5, 2.5), LIVERY.teal, 6.75, 1.05, -0.6));
  for (const side of [-1, 1]) {
    const strut = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 6), LIVERY.dark, side * 2.6, 0.35, -0.6);
    strut.rotation.z = side * 0.5;
    plane.add(strut);
  }
}

function buildTail(plane) {
  // Horizontal stabiliser + fin, with the courier's amber stripe.
  const stab = mesh(new THREE.BoxGeometry(4.6, 0.2, 1.5), LIVERY.cream, 0, 0.35, 5.2);
  plane.add(stab);
  plane.add(mesh(new THREE.BoxGeometry(0.22, 2.1, 1.7), LIVERY.teal, 0, 1.1, 5.3));
  plane.add(mesh(new THREE.BoxGeometry(0.24, 0.5, 1.72), LIVERY.amber, 0, 1.35, 5.3));
  plane.userData.stab = stab;
}

function buildProp(plane) {
  // Hub + two blades, plus a translucent blur disc that fades in with
  // throttle so the prop reads as spinning instead of frozen at speed.
  const prop = new THREE.Group();
  prop.add(mesh(new THREE.SphereGeometry(0.34, 10, 8), LIVERY.dark));
  for (const a of [0, Math.PI]) {
    const blade = mesh(new THREE.BoxGeometry(0.32, 3.4, 0.1), LIVERY.dark);
    blade.rotation.z = a;
    prop.add(blade);
  }
  const blur = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  );
  prop.add(blur);
  prop.position.set(0, 0, -4.85);
  plane.add(prop);
  plane.userData.prop = prop;
  plane.userData.propBlur = blur;
}

function buildGear(plane) {
  // Fixed gear: two main wheels + a tail wheel.
  for (const side of [-1, 1]) {
    plane.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6), LIVERY.dark, side * 1.1, -1.0, -0.9));
    const wheel = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12), LIVERY.dark, side * 1.15, -1.7, -0.9);
    wheel.rotation.z = Math.PI / 2;
    plane.add(wheel);
  }
  const tailWheel = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10), LIVERY.dark, 0, -0.85, 4.6);
  tailWheel.rotation.z = Math.PI / 2;
  plane.add(tailWheel);
}

function buildLights(plane) {
  // Navigation lights: red left, green right, white tail.
  plane.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), LIVERY.red, -6.8, 1.05, -0.6));
  plane.add(mesh(new THREE.SphereGeometry(0.18, 8, 6), LIVERY.green, 6.8, 1.05, -0.6));
  plane.add(mesh(new THREE.SphereGeometry(0.15, 8, 6), LIVERY.white, 0, 0.4, 5.9));
}

function buildDecal(plane) {
  // Registration on the fin, drawn on a tiny canvas texture.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1f7a6d'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#ffd27a'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('K-7', 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: tex }));
  plate.position.set(0.14, 1.05, 5.3);
  plate.rotation.y = Math.PI / 2;
  plane.add(plate);
}

export function buildCourierPlane() {
  const plane = new THREE.Group();
  buildFuselage(plane);
  buildWing(plane);
  buildTail(plane);
  buildProp(plane);
  buildGear(plane);
  buildLights(plane);
  buildDecal(plane);
  plane.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return plane;
}

// Apply the flight state to the mesh: position + heading/pitch/roll, plus
// the moving parts — prop spin and blur, and a hint of elevator deflection.
export function posePlane(plane, state) {
  plane.position.set(state.pos.x, state.pos.y, state.pos.z);
  plane.rotation.order = 'YXZ';
  plane.rotation.y = state.yaw;
  plane.rotation.x = state.pitch;
  plane.rotation.z = state.roll;
  if (plane.userData.prop) {
    plane.userData.prop.rotation.z += 0.35 + state.throttle * 0.9;
  }
  if (plane.userData.propBlur) {
    plane.userData.propBlur.material.opacity = state.throttle * 0.16;
  }
  if (plane.userData.stab) {
    plane.userData.stab.rotation.x = -state.pitch * 0.35;
  }
}
