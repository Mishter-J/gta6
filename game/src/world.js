// Port Meridian — the city: sky, roads, buildings, palms, beach and water.
// Layout is seeded (config CITY.seed) so the city is identical every load.
// Returns colliders (building AABBs), intersections and road helpers.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE, mulberry32 } from './config.js';

/** Canvas texture for building windows: a lit-window grid. */
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5a6274';
  g.fillRect(0, 0, 128, 256);
  const rng = mulberry32(99);
  for (let y = 8; y < 248; y += 16) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng() < 0.55;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffe1a0' : '#cfe8ff') : '#2c3444';
      g.fillRect(x, y, 10, 10);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Ground texture: sidewalks, roads, lane dashes, crosswalks, block fill. */
function makeGroundTexture() {
  const S = CITY.size;
  const scale = 2048 / (S + 90); // cover city + beach in one 2048 canvas
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 2048;
  const g = c.getContext('2d');
  const px = (v) => (v + 45) * scale; // world x/z -> canvas (z flipped below)
  g.fillStyle = '#8f887c'; // sidewalk base
  g.fillRect(0, 0, 2048, 2048);
  // Beach sand at the south (world z > S)
  g.fillStyle = '#e8cf9e';
  g.fillRect(0, px(S), 2048, 2048 - px(S));
  // Grass inside blocks
  g.fillStyle = '#6d9a52';
  for (let i = 0; i < CITY.blocks; i++) {
    for (let j = 0; j < CITY.blocks; j++) {
      const x0 = px(i * CITY.pitch + CITY.roadWidth / 2);
      const z0 = px(j * CITY.pitch + CITY.roadWidth / 2);
      const w = (CITY.pitch - CITY.roadWidth) * scale;
      g.fillRect(x0, z0, w, w);
    }
  }
  // Roads
  g.fillStyle = '#2e3138';
  for (let i = 0; i <= CITY.blocks; i++) {
    const v = px(i * CITY.pitch);
    const w = CITY.roadWidth * scale;
    g.fillRect(v - w / 2, 0, w, px(S));
    g.fillRect(0, v - w / 2, px(S), w);
  }
  // Centre dashes (yellow) along every road
  g.fillStyle = '#d8c84a';
  for (let i = 0; i <= CITY.blocks; i++) {
    const v = px(i * CITY.pitch);
    for (let d = 0; d < S; d += 12) {
      g.fillRect(v - 1, px(d), 2, 6 * scale);
      g.fillRect(px(d), v - 1, 6 * scale, 2);
    }
  }
  // Crosswalks at intersections
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i <= CITY.blocks; i++) {
    for (let j = 0; j <= CITY.blocks; j++) {
      const x = px(i * CITY.pitch), z = px(j * CITY.pitch);
      for (let k = -2; k <= 2; k++) {
        g.fillRect(x + k * 4 * scale - 1.5, z - 9 * scale, 3, 5 * scale);
        g.fillRect(x + k * 4 * scale - 1.5, z + 4 * scale, 3, 5 * scale);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A sign plane with painted text (canvas texture), e.g. MERIDIAN BANK. */
function makeSign(text, w, h, fg, bg) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = 'bold 56px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex })
  );
  return mesh;
}

function skyDome() {
  const geo = new THREE.SphereGeometry(900, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      horizon: { value: new THREE.Color(PALETTE.skyHorizon) },
    },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 horizon;
      void main(){ float h = normalize(vP).y; float t = smoothstep(-0.05, 0.45, h);
      gl_FragColor = vec4(mix(horizon, top, t), 1.0); }`,
  });
  return new THREE.Mesh(geo, mat);
}

export function buildWorld(scene) {
  const rng = mulberry32(CITY.seed);
  const S = CITY.size;
  const colliders = [];
  const intersections = [];
  for (let i = 0; i <= CITY.blocks; i++) {
    for (let j = 0; j <= CITY.blocks; j++) {
      intersections.push({ x: i * CITY.pitch, z: j * CITY.pitch });
    }
  }

  scene.fog = new THREE.Fog(PALETTE.fog, 140, 750);

  // Sky, sun, lights
  scene.add(skyDome());
  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.6);
  sun.position.set(-180, 260, 120);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x9ec8ff, 0x8a6a4a, 1.45));
  const sunSprite = new THREE.Mesh(
    new THREE.CircleGeometry(34, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, fog: false })
  );
  sunSprite.position.set(-420, 300, 260);
  sunSprite.lookAt(0, 0, 0);
  scene.add(sunSprite);

  // Ground (city + beach in one textured plane)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(S + 90, S + 90),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(S / 2, 0, S / 2);
  scene.add(ground);

  // Water beyond the beach
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 260),
    new THREE.MeshPhongMaterial({ color: PALETTE.water, shininess: 120, transparent: true, opacity: 0.92 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(S / 2, -0.4, S + 45 + 130);
  scene.add(water);

  // Buildings: one InstancedMesh, 2x2 per block, taller near downtown.
  const windowTex = makeWindowTexture();
  const bGeo = new THREE.BoxGeometry(1, 1, 1);
  bGeo.translate(0, 0.5, 0);
  const bMat = new THREE.MeshLambertMaterial({ map: windowTex });
  const spots = [];
  for (let i = 0; i < CITY.blocks; i++) {
    for (let j = 0; j < CITY.blocks; j++) {
      const cx = i * CITY.pitch + CITY.pitch / 2;
      const cz = j * CITY.pitch + CITY.pitch / 2;
      const downtown = 1 - (Math.abs(i - 3) + Math.abs(j - 3)) / 6;
      for (const [ox, oz] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
        if (rng() < 0.12) continue; // some empty lots / parking
        const h = 10 + rng() * 16 + downtown * 34 * rng();
        spots.push({ x: cx + ox, z: cz + oz, w: 18 + rng() * 6, d: 18 + rng() * 6, h });
      }
    }
  }
  const buildings = new THREE.InstancedMesh(bGeo, bMat, spots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  spots.forEach((s, idx) => {
    m4.compose(new THREE.Vector3(s.x, 0, s.z), q, new THREE.Vector3(s.w, s.h, s.d));
    buildings.setMatrixAt(idx, m4);
    const tint = 0.95 + rng() * 0.45;
    col.setRGB(tint, tint * (0.9 + rng() * 0.2), tint * (0.85 + rng() * 0.3));
    buildings.setColorAt(idx, col);
    colliders.push({ minX: s.x - s.w / 2, maxX: s.x + s.w / 2, minZ: s.z - s.d / 2, maxZ: s.z + s.d / 2 });
  });
  buildings.instanceMatrix.needsUpdate = true;
  if (buildings.instanceColor) buildings.instanceColor.needsUpdate = true;
  scene.add(buildings);

  // Meridian Tower: the downtown landmark (tall, gold-lit crown)
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(26, 120, 26),
    new THREE.MeshLambertMaterial({ map: windowTex, color: 0xd8c8a8 })
  );
  tower.position.set(3 * CITY.pitch + CITY.pitch / 2, 0, 3 * CITY.pitch + CITY.pitch / 2);
  scene.add(tower);
  colliders.push({ minX: tower.position.x - 13, maxX: tower.position.x + 13, minZ: tower.position.z - 13, maxZ: tower.position.z + 13 });
  const crown = new THREE.Mesh(
    new THREE.BoxGeometry(28, 3, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23e })
  );
  crown.position.set(tower.position.x, 121.5, tower.position.z);
  scene.add(crown);

  // Place signs: bank, garage, docks
  const bankSign = makeSign('MERIDIAN BANK', 22, 5.5, '#1a1a2e', '#ffd23e');
  bankSign.position.set(4 * CITY.pitch + 8, 9, 3 * CITY.pitch - 7);
  bankSign.rotation.y = Math.PI;
  scene.add(bankSign);
  const garageSign = makeSign("MARA'S GARAGE", 20, 5, '#ffd23e', '#20243a');
  garageSign.position.set(2 * CITY.pitch - 8, 8, 2 * CITY.pitch + 7);
  scene.add(garageSign);
  const docksSign = makeSign('MERIDIAN DOCKS', 22, 5.5, '#ffffff', '#1e6f8e');
  docksSign.position.set(6 * CITY.pitch + 8, 8, 6 * CITY.pitch - 7);
  docksSign.rotation.y = -Math.PI / 2;
  scene.add(docksSign);

  // Palm trees along sidewalks (instanced trunks + crowns)
  const palmSpots = [];
  for (let i = 0; i <= CITY.blocks; i++) {
    for (let j = 0; j <= CITY.blocks; j++) {
      if (rng() < 0.5) continue;
      palmSpots.push({ x: i * CITY.pitch + 9, z: j * CITY.pitch + 9 });
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 7, 6);
  trunkGeo.translate(0, 3.5, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x7a5a3a }), palmSpots.length);
  const crownGeo = new THREE.ConeGeometry(3.2, 4.5, 7);
  crownGeo.translate(0, 8.5, 0);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ color: 0x3f8f3a }), palmSpots.length);
  palmSpots.forEach((p, idx) => {
    m4.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(1, 1, 1));
    trunks.setMatrixAt(idx, m4);
    crowns.setMatrixAt(idx, m4);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks);
  scene.add(crowns);

  // Street lamps at intersections (instanced poles + glowing heads)
  const lampGeo = new THREE.CylinderGeometry(0.12, 0.12, 6, 5);
  lampGeo.translate(0, 3, 0);
  const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshLambertMaterial({ color: 0x30343c }), intersections.length);
  const headGeo = new THREE.SphereGeometry(0.5, 8, 6);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8 }), intersections.length);
  intersections.forEach((p, idx) => {
    m4.compose(new THREE.Vector3(p.x + 8, 0, p.z + 8), q, new THREE.Vector3(1, 1, 1));
    lamps.setMatrixAt(idx, m4);
    m4.compose(new THREE.Vector3(p.x + 8, 6.2, p.z + 8), q, new THREE.Vector3(1, 1, 1));
    heads.setMatrixAt(idx, m4);
  });
  lamps.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(lamps);
  scene.add(heads);

  // Clouds: soft white billboards drifting slowly
  const cloudTex = (() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 64, 8, 128, 64, 110);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  })();
  const clouds = [];
  for (let i = 0; i < 12; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.75, depthWrite: false }));
    sprite.position.set(rng() * 700 - 100, 130 + rng() * 60, rng() * 700 - 100);
    sprite.scale.set(90 + rng() * 70, 34 + rng() * 20, 1);
    sprite.userData.speed = 1 + rng() * 2;
    scene.add(sprite);
    clouds.push(sprite);
  }

  // ---- helpers ----
  function nearestRoadPoint(x, z) {
    // Snap to the nearest road centreline (roads run along x or z at multiples of pitch).
    const i = Math.round(x / CITY.pitch) * CITY.pitch;
    const j = Math.round(z / CITY.pitch) * CITY.pitch;
    const dx = Math.abs(x - i), dz = Math.abs(z - j);
    if (dx <= dz) return { x: i, z: THREE.MathUtils.clamp(z, 0, S) };
    return { x: THREE.MathUtils.clamp(x, 0, S), z: j };
  }

  function onRoad(x, z) {
    const rx = x / CITY.pitch, rz = z / CITY.pitch;
    const nearX = Math.abs(rx - Math.round(rx)) * CITY.pitch < CITY.roadWidth / 2;
    const nearZ = Math.abs(rz - Math.round(rz)) * CITY.pitch < CITY.roadWidth / 2;
    return nearX || nearZ;
  }

  function update(dt, t) {
    water.position.x = S / 2 + Math.sin(t * 0.25) * 6;
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 700) c.position.x = -150;
    }
  }

  return { colliders, intersections, nearestRoadPoint, onRoad, update, size: S, beachZ: S + 10 };
}
