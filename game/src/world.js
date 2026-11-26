// world.js — the Cendrawasih archipelago: sea, islands, town, runway, sky.
//
// Everything is deterministic: the same seed always builds the same
// islands, so the flight model, the screenshots and the game all agree on
// where the ground is. The only public terrain query is heightAt(x, z);
// every visual builder below is a pure function of the same seed.
import * as THREE from 'three';

// ------------------------------------------------------------ seeded noise
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer-lattice hash in [-1, 1]; the single source of terrain randomness.
function latticeHash(ix, iz, seed) {
  let h = (ix * 374761393 + iz * 668265263 + seed * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1;
}

const smootherstep = (t) => t * t * (3 - 2 * t);

function bilinearNoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smootherstep(x - ix), fz = smootherstep(z - iz);
  const a = latticeHash(ix, iz, seed), b = latticeHash(ix + 1, iz, seed);
  const c = latticeHash(ix, iz + 1, seed), d = latticeHash(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

function octaveNoise(x, z, seed) {
  let v = 0, amp = 1, freq = 1, norm = 0;
  for (let o = 0; o < 4; o++) {
    v += bilinearNoise(x * freq, z * freq, seed + o * 101) * amp;
    norm += amp; amp *= 0.5; freq *= 2.1;
  }
  return v / norm;
}

// ------------------------------------------------------------ islands
// Island bumps: [x, z, radius, peak height]. The runway sits on the flat
// apron of the main island, at the origin, heading north (-z).
const ISLANDS = [
  [0, -350, 950, 235],      // main island (town + runway)
  [-1250, -950, 620, 300],  // twin peaks west
  [1350, -1150, 700, 260],  // jungle island east
  [-1450, 950, 560, 180],   // reef island south-west
  [1150, 1250, 640, 210],   // palm island south-east
  [-350, 1500, 420, 120],   // small islet south
  [620, 350, 300, 90],      // sandbar islet
];

export const WORLD_SEED = 20261126;
export const RUNWAY = {
  x: 0, z: 60, length: 460, width: 42, heading: 0, // runway runs along z
  y: 9, // apron height
};

function islandLift(x, z) {
  let h = 0;
  for (const [cx, cz, r, peak] of ISLANDS) {
    const dx = (x - cx) / r, dz = (z - cz) / r;
    const d2 = dx * dx + dz * dz;
    if (d2 < 1) h += peak * Math.pow(1 - d2, 1.6);
  }
  return h;
}

// Flatten the ground around the runway + town so the strip sits level:
// fully flat inside the runway rectangle (with margin), then a smooth
// falloff over 400 m. A radial falloff used to leave the strip's south end
// buried under the main island's slope (terrain 13.8 m vs strip 9 m),
// which trapped the plane in the taxi branch at speed 0.
function levelStrip(x, z, h) {
  const dx = Math.max(0, Math.abs(x - RUNWAY.x) - 320);
  const dz = Math.max(0, Math.abs(z - RUNWAY.z) - 420);
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d >= 400) return h;
  const t = 1 - smootherstep(d / 400);
  return h * (1 - t) + RUNWAY.y * t;
}

export function heightAt(x, z) {
  const base = octaveNoise(x * 0.0016, z * 0.0016, WORLD_SEED) * 26;
  const hills = Math.max(0, octaveNoise(x * 0.004 + 40, z * 0.004 + 9, WORLD_SEED + 7)) * 42;
  let h = islandLift(x, z) + base + hills;
  h = levelStrip(x, z, h);
  return Math.max(h, -6); // seabed just below the water
}

export function groundAt(x, z) { return Math.max(heightAt(x, z), 0); }

// ------------------------------------------------------------ small helpers
const lambert = (color) => new THREE.MeshLambertMaterial({ color });
const basic = (color, opts = {}) => new THREE.MeshBasicMaterial({ color, ...opts });

function softDiscTexture(size, inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cloudTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const rnd = mulberry32(77);
  for (let i = 0; i < 26; i++) {
    const x = 30 + rnd() * 196, y = 40 + rnd() * 48, r = 16 + rnd() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,250,240,0.85)');
    grad.addColorStop(1, 'rgba(255,250,240,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------ world build
export function buildWorld(scene) {
  makeSky(scene);
  makeSun(scene);
  const sunLight = new THREE.DirectionalLight(0xffdf9e, 2.4);
  sunLight.position.copy(new THREE.Vector3(-0.62, 0.30, -0.42).normalize().multiplyScalar(4600));
  scene.add(sunLight);
  scene.add(new THREE.HemisphereLight(0x9fc8e8, 0x2e4a3a, 1.1));
  scene.add(new THREE.AmbientLight(0xffe8c0, 0.35));
  makeSea(scene);
  makeTerrain(scene);
  makeRunway(scene);
  makeTown(scene);
  makePalms(scene);
  makeClouds(scene);
  makeLighthouse(scene);
}

function makeSky(scene) {
  // Big gradient dome (BackSide sphere): deep blue overhead, warm haze low.
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2e6da8) },
      mid: { value: new THREE.Color(0x9fc8e8) },
      low: { value: new THREE.Color(0xffd9a0) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec3 vP;
      uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main(){
        float h = normalize(vP).y;
        vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(low, mid, smoothstep(-0.08, 0.12, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(5200, 24, 16), skyMat));
}

function makeSun(scene) {
  // Warm disc + halo, low in the west (golden hour).
  const sunDir = new THREE.Vector3(-0.62, 0.30, -0.42).normalize();
  const sunPos = sunDir.clone().multiplyScalar(4600);
  for (const [size, inner, outer, opacity] of [
    [520, 'rgba(255,244,214,1)', 'rgba(255,190,90,0)', 1],
    [1500, 'rgba(255,205,120,0.55)', 'rgba(255,190,90,0)', 1],
  ]) {
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: softDiscTexture(256, inner, outer), transparent: true, depthWrite: false, fog: false, opacity })
    );
    disc.position.copy(sunPos);
    disc.lookAt(0, 0, 0);
    scene.add(disc);
  }
}

function makeSea(scene) {
  // Huge turquoise plane, gently transparent so reefs read through.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(11000, 11000, 1, 1),
    new THREE.MeshPhongMaterial({ color: 0x1d7f8e, transparent: true, opacity: 0.94, shininess: 90, specular: 0x99ddff })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = 0;
  scene.add(sea);
}

function makeTerrain(scene) {
  // Displaced plane, vertex colours by height (sand / grass / rock / snow),
  // darkened on steep ground so the ridges read from the air.
  const TER_SIZE = 4400, TER_SEG = 190;
  const terrainGeo = new THREE.PlaneGeometry(TER_SIZE, TER_SIZE, TER_SEG, TER_SEG);
  terrainGeo.rotateX(-Math.PI / 2);
  const pos = terrainGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cSand = new THREE.Color(0xe8d29a), cGrass = new THREE.Color(0x4d8a3f),
    cForest = new THREE.Color(0x2f6b2e), cRock = new THREE.Color(0x8a7f74),
    cSnow = new THREE.Color(0xf2f4f6), cReef = new THREE.Color(0x3f9d8a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    if (h < 1.5) tmp.copy(cReef).lerp(cSand, Math.max(0, (h + 6) / 7.5));
    else if (h < 4) tmp.copy(cSand);
    else if (h < 70) tmp.copy(cGrass).lerp(cForest, Math.min(1, (h - 20) / 90));
    else if (h < 150) tmp.copy(cForest).lerp(cRock, (h - 70) / 80);
    else if (h < 210) tmp.copy(cRock);
    else tmp.copy(cRock).lerp(cSnow, Math.min(1, (h - 210) / 40));
    const slope = Math.abs(heightAt(x + 8, z) - h) + Math.abs(heightAt(x, z + 8) - h);
    const shade = Math.max(0.72, 1 - slope * 0.05);
    colors[i * 3] = tmp.r * shade; colors[i * 3 + 1] = tmp.g * shade; colors[i * 3 + 2] = tmp.b * shade;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();
  scene.add(new THREE.Mesh(terrainGeo, new THREE.MeshLambertMaterial({ vertexColors: true })));
}

function makeRunway(scene) {
  const g = new THREE.Group();
  const { x, z, length, width, y } = RUNWAY;
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, length), lambert(0x4a5058));
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(x, y + 0.15, z);
  g.add(strip);
  // Centre dashes + threshold bars at both ends.
  const paint = basic(0xf5f0dc);
  for (let dz = -length / 2 + 25; dz < length / 2 - 10; dz += 40) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 18), paint);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(x, y + 0.3, z + dz);
    g.add(dash);
  }
  for (const end of [-1, 1]) {
    for (let k = -2; k <= 2; k++) {
      const bar = new THREE.Mesh(new THREE.PlaneGeometry(4, 22), paint);
      bar.rotation.x = -Math.PI / 2;
      bar.position.set(x + k * 7, y + 0.3, z + end * (length / 2 - 14));
      g.add(bar);
    }
  }
  // Edge lights: small amber posts down both sides.
  const lightGeo = new THREE.SphereGeometry(1.1, 8, 6);
  const lightMat = basic(0xffc46b);
  for (let dz = -length / 2 + 10; dz <= length / 2 - 10; dz += 46) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeo, lightMat);
      lamp.position.set(x + side * (width / 2 + 3), y + 1.2, z + dz);
      g.add(lamp);
    }
  }
  // Windsock near the threshold.
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 8), lambert(0xd8d8d8));
  pole.position.set(x + width / 2 + 14, y + 7, z - length / 2 + 30);
  g.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(2.2, 9, 10), lambert(0xff7a3c));
  sock.rotation.z = -Math.PI / 2;
  sock.position.set(x + width / 2 + 19, y + 13, z - length / 2 + 30);
  g.add(sock);
  scene.add(g);
}

function makeTown(scene) {
  // Tanjung Cendrawasih: whitewashed houses with terracotta roofs along
  // the shore east of the runway, plus a small harbour with boats.
  const rnd = mulberry32(4242);
  const town = new THREE.Group();
  const walls = [lambert(0xf2e8d5), lambert(0xe8d9b8)];
  const roofs = [lambert(0xc65a35), lambert(0x8a4a3a)];
  for (let i = 0; i < 64; i++) {
    const bx = 90 + rnd() * 380;
    const bz = -260 + rnd() * 520;
    if (Math.abs(bx) < 60 && Math.abs(bz - RUNWAY.z) < 300) continue; // keep off the strip
    const w = 12 + rnd() * 16, d = 10 + rnd() * 14, h = 7 + rnd() * 14;
    const gy = groundAt(bx, bz);
    const rotY = (rnd() - 0.5) * 0.6;
    const house = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), walls[rnd() > 0.5 ? 1 : 0]);
    house.position.set(bx, gy + h / 2, bz);
    house.rotation.y = rotY;
    town.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 4 + rnd() * 3, 4), roofs[rnd() > 0.5 ? 1 : 0]);
    roof.position.set(bx, gy + h + 2.5, bz);
    roof.rotation.y = Math.PI / 4 + rotY;
    town.add(roof);
  }
  // Harbour boats: simple hulls bobbing at the pier.
  const hulls = [lambert(0x2e6f8e), lambert(0xe8e0c8)];
  for (let i = 0; i < 7; i++) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 5), hulls[i % 2]);
    hull.position.y = 1.5;
    boat.add(hull);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 9, 6), lambert(0x6b4a2f));
    mast.position.y = 7;
    boat.add(mast);
    boat.position.set(330 + rnd() * 160, 0.4, 120 + rnd() * 260);
    boat.rotation.y = rnd() * Math.PI;
    town.add(boat);
  }
  scene.add(town);
}

function makePalms(scene) {
  // Coconut palms on the low southern islands: a leaning trunk and a
  // flattened crown of fronds. Cheap geometry, placed only where the
  // ground is low beach or grass, so none of them float or sink.
  const rnd = mulberry32(2026);
  const trunkMat = lambert(0x6b4a2f);
  const frondMat = lambert(0x2f7a3a);
  const grove = new THREE.Group();
  for (let i = 0; i < 46; i++) {
    const px = -1600 + rnd() * 3200;
    const pz = 700 + rnd() * 1100;
    const gy = groundAt(px, pz);
    if (gy < 2 || gy > 34) continue;
    const palm = new THREE.Group();
    const lean = (rnd() - 0.5) * 0.35;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 11, 6), trunkMat);
    trunk.position.y = 5.5;
    trunk.rotation.z = lean;
    palm.add(trunk);
    for (let f = 0; f < 6; f++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(1.6, 7, 4), frondMat);
      const a = (f / 6) * Math.PI * 2;
      frond.position.set(Math.cos(a) * 2.6, 10.6, Math.sin(a) * 2.6);
      frond.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1);
      palm.add(frond);
    }
    palm.position.set(px, gy, pz);
    palm.rotation.y = rnd() * Math.PI * 2;
    grove.add(palm);
  }
  scene.add(grove);
}

function makeLighthouse(scene) {
  // Red-and-white lighthouse on the headland north of town — the landmark
  // pilots use to find the field.
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(7, 9, 46, 12), lambert(0xf2ede2));
  tower.position.y = 23;
  g.add(tower);
  for (const [bandY, bandH] of [[16, 7], [30, 8]]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, bandH, 12), lambert(0xd64545));
    band.position.y = bandY;
    g.add(band);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(4.4, 12, 8), basic(0xffe9a8));
  lamp.position.y = 48;
  g.add(lamp);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(6, 6, 12), lambert(0x333333));
  cap.position.y = 53;
  g.add(cap);
  g.position.set(-260, groundAt(-260, -620), -620);
  scene.add(g);
  scene.userData.lighthouseLamp = lamp;
}

function makeClouds(scene) {
  const tex = cloudTexture();
  const rnd = mulberry32(99);
  const clouds = new THREE.Group();
  for (let i = 0; i < 42; i++) {
    const w = 180 + rnd() * 320;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55 + rnd() * 0.3, depthWrite: false }));
    s.scale.set(w, w * 0.45, 1);
    const ang = rnd() * Math.PI * 2, r = 500 + rnd() * 2600;
    s.position.set(Math.cos(ang) * r, 320 + rnd() * 260, Math.sin(ang) * r);
    clouds.add(s);
  }
  scene.add(clouds);
  scene.userData.clouds = clouds;
}
