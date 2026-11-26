// plane.js — the Kutilang-7 mail plane, built from three.js primitives.
// Teal-and-cream courier livery, high wing, fixed gear, spinning prop.
// The mesh faces -z (its nose), matching the flight model's heading math.
import * as THREE from 'three';

export function buildCourierPlane() {
  const plane = new THREE.Group();
  const teal = new THREE.MeshLambertMaterial({ color: 0x1f7a6d });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf2e8d0 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x2b3438 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x9fd4e8, shininess: 120, specular: 0xffffff });
  const amber = new THREE.MeshBasicMaterial({ color: 0xffc46b });
  const red = new THREE.MeshBasicMaterial({ color: 0xff5a4e });
  const green = new THREE.MeshBasicMaterial({ color: 0x54e08a });

  // Fuselage: tapered cylinder + nose cone + tail cone.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.85, 6.4, 12), teal);
  body.rotation.x = Math.PI / 2;
  body.position.set(0, 0, 0.4);
  plane.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.12, 1.7, 12), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, -3.9);
  plane.add(nose);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.82, 2.2, 12), teal);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0.15, 4.6);
  plane.add(tail);

  // Cockpit glasshouse.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.02, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  canopy.scale.set(1, 0.62, 1.5);
  canopy.position.set(0, 0.55, -1.4);
  plane.add(canopy);

  // High wing + struts.
  const wing = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.28, 2.5), cream);
  wing.position.set(0, 1.05, -0.6);
  plane.add(wing);
  const wingTipL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 2.5), teal);
  wingTipL.position.set(-6.75, 1.05, -0.6);
  plane.add(wingTipL);
  const wingTipR = wingTipL.clone();
  wingTipR.position.x = 6.75;
  plane.add(wingTipR);
  for (const side of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 6), dark);
    strut.position.set(side * 2.6, 0.35, -0.6);
    strut.rotation.z = side * 0.5;
    plane.add(strut);
  }

  // Tail: horizontal stabiliser + fin, with the courier's amber stripe.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 1.5), cream);
  stab.position.set(0, 0.35, 5.2);
  plane.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.1, 1.7), teal);
  fin.position.set(0, 1.1, 5.3);
  plane.add(fin);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 1.72), amber);
  stripe.position.set(0, 1.35, 5.3);
  plane.add(stripe);

  // Propeller: hub + two blades, spins in animate.
  const prop = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), dark);
  prop.add(hub);
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.4, 0.1), dark);
    blade.rotation.z = a;
    blade.position.y = 0;
    prop.add(blade);
  }
  prop.position.set(0, 0, -4.85);
  plane.add(prop);
  plane.userData.prop = prop;

  // Fixed landing gear: two wheels + tail wheel.
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.4, 6), dark);
    leg.position.set(side * 1.1, -1.0, -0.9);
    plane.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 12), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.15, -1.7, -0.9);
    plane.add(wheel);
  }
  const tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10), dark);
  tailWheel.rotation.z = Math.PI / 2;
  tailWheel.position.set(0, -0.85, 4.6);
  plane.add(tailWheel);

  // Navigation lights: red left, green right, white tail.
  const navL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), red);
  navL.position.set(-6.8, 1.05, -0.6);
  plane.add(navL);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), green);
  navR.position.set(6.8, 1.05, -0.6);
  plane.add(navR);
  const navT = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  navT.position.set(0, 0.4, 5.9);
  plane.add(navT);

  // Registration on the fin, drawn on a tiny canvas texture.
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#1f7a6d'; g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#ffd27a'; g.font = 'bold 34px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('K-7', 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6, 0.8),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  plate.position.set(0.14, 1.05, 5.3);
  plate.rotation.y = Math.PI / 2;
  plane.add(plate);

  plane.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return plane;
}

// Apply the flight state to the mesh: position + heading/pitch/roll.
export function posePlane(plane, state) {
  plane.position.set(state.pos.x, state.pos.y, state.pos.z);
  plane.rotation.order = 'YXZ';
  plane.rotation.y = state.yaw;
  plane.rotation.x = state.pitch;
  plane.rotation.z = state.roll;
  if (plane.userData.prop) {
    plane.userData.prop.rotation.z += 0.35 + state.throttle * 0.9;
  }
}
