// Port Meridian — world.js
// The city: a seeded 7x7 road grid, ~200 instanced buildings of varied
// height, the tall Meridian Tower landmark, a beach strip with a water
// plane on the south edge, palm trees, street lamps, drifting clouds,
// golden-hour sky, fog and hemisphere/directional lighting. Roads are
// dark strips with dashed markings on a lighter sidewalk ground plane.
// Street lamps stand at intersection corners, offset from the road —
// never in the middle of a cross road. Buildings are simple box
// colliders: the player and cars slide or stop, never pass through.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, makeRng, clamp } from './config.js';

export function buildWorld(scene) {
  const rng = makeRng(CONFIG.seed);
  const colliders = [];

  scene.background = new THREE.Color(CONFIG.colors.sky);
  scene.fog = new THREE.Fog(CONFIG.colors.fog, 120, 420);

  const hemi = new THREE.HemisphereLight(0xffe0b3, 0x5a4a3a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a8, 1.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  const amb = new THREE.AmbientLight(0xffe8cc, 0.35);
  scene.add(amb);

  // Ground: one large sidewalk-colored plane.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.cityHalf * 2, CONFIG.cityHalf * 2),
    new THREE.MeshLambertMaterial({ color: CONFIG.colors.ground }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  scene.add(ground);

  // Roads: dark strips along every grid line, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: CONFIG.colors.road });
  const markMat = new THREE.MeshBasicMaterial({ color: CONFIG.colors.marking });
  const roadLen = CONFIG.cityHalf * 2;
  const dashes = [];
  for (const c of CONFIG.roads) {
    const rx = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.roadWidth, roadLen), roadMat);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(c, 0.02, 0);
    scene.add(rx);
    const rz = new THREE.Mesh(new THREE.PlaneGeometry(roadLen, CONFIG.roadWidth), roadMat);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(0, 0.02, c);
    scene.add(rz);
    // Dashed center markings along each road.
    for (let d = -140; d <= 140; d += 12) {
      const mx = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 3), markMat);
      mx.rotation.x = -Math.PI / 2;
      mx.position.set(c, 0.04, d);
      scene.add(mx);
      const mz = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.5), markMat);
      mz.rotation.x = -Math.PI / 2;
      mz.position.set(d, 0.04, c);
      scene.add(mz);
      dashes.push(mx, mz);
    }
  }

  // Buildings: instanced boxes, 1-4 per block, per-instance color.
  // Blocks sit between roads; block centers are at +-20, +-60, +-100.
  const blockCenters = [-100, -60, -20, 20, 60, 100];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const placements = [];
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      // The tower block gets the landmark instead of flats.
      if (bx === CONFIG.towerPos.x && bz === CONFIG.towerPos.z) continue;
      const n = 1 + Math.floor(rng.next() * 4);
      for (let i = 0; i < n; i++) {
        const w = rng.range(9, 15);
        const d = rng.range(9, 15);
        const h = rng.range(8, 42);
        const ox = rng.range(-8, 8);
        const oz = rng.range(-8, 8);
        const x = bx + ox;
        const z = bz + oz;
        placements.push({ x, z, w, d, h });
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
      }
    }
  }
  const inst = new THREE.InstancedMesh(boxGeo, boxMat, placements.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const col = new THREE.Color();
  const palette = [0x8a7f74, 0x7d7468, 0x9a8a7a, 0x6e7a8a, 0xa08a6a, 0x857a6e, 0x7a6a7e];
  placements.forEach((b, i) => {
    p.set(b.x, b.h / 2, b.z);
    s.set(b.w, b.h, b.d);
    m4.compose(p, q, s);
    inst.setMatrixAt(i, m4);
    col.setHex(palette[Math.floor(rng.next() * palette.length)]);
    col.offsetHSL(0, 0, (rng.next() - 0.5) * 0.08);
    inst.setColorAt(i, col);
  });
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
  scene.add(inst);

  // Meridian Tower: the tall landmark at the tower block.
  const tower = new THREE.Mesh(
    new THREE.BoxGeometry(18, 95, 18),
    new THREE.MeshLambertMaterial({ color: CONFIG.colors.tower }),
  );
  tower.position.set(CONFIG.towerPos.x, 47.5, CONFIG.towerPos.z);
  scene.add(tower);
  const beacon = new THREE.Mesh(
    new THREE.BoxGeometry(6, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd76a }),
  );
  beacon.position.set(CONFIG.towerPos.x, 98, CONFIG.towerPos.z);
  scene.add(beacon);
  colliders.push({
    minX: CONFIG.towerPos.x - 9, maxX: CONFIG.towerPos.x + 9,
    minZ: CONFIG.towerPos.z - 9, maxZ: CONFIG.towerPos.z + 9,
  });

  // Beach strip + water plane on the south edge (z beyond +130).
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.cityHalf * 2, 22),
    new THREE.MeshLambertMaterial({ color: CONFIG.colors.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.03, 141);
  scene.add(sand);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(CONFIG.cityHalf * 2, 60),
    new THREE.MeshLambertMaterial({ color: CONFIG.colors.water }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.01, 182);
  scene.add(water);

  // Palm trees along the beach and a few inland.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3d });
  const palms = [];
  for (let x = -130; x <= 130; x += 13) {
    palms.push({ x: x + rng.range(-3, 3), z: 134 + rng.range(-2, 4) });
  }
  palms.push({ x: -60, z: 20 }, { x: 100, z: -100 }, { x: -20, z: 60 });
  for (const pl of palms) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
    trunk.position.set(pl.x, 3, pl.z);
    trunk.rotation.z = rng.range(-0.12, 0.12);
    scene.add(trunk);
    const top = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), leafMat);
    top.scale.y = 0.55;
    top.position.set(pl.x, 6.4, pl.z);
    scene.add(top);
  }

  // Street lamps: one per intersection, at the (+7, +7) corner —
  // offset from the road surface, never standing in a cross road.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 5.5, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const headGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const lampCount = CONFIG.roads.length * CONFIG.roads.length;
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampCount);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lampCount);
  let li = 0;
  for (const rx of CONFIG.roads) {
    for (const rz of CONFIG.roads) {
      p.set(rx + 7, 2.75, rz + 7);
      s.set(1, 1, 1);
      m4.compose(p, q, s);
      poles.setMatrixAt(li, m4);
      p.set(rx + 7, 5.6, rz + 7);
      m4.compose(p, q, s);
      heads.setMatrixAt(li, m4);
      li++;
    }
  }
  poles.instanceMatrix.needsUpdate = true;
  heads.instanceMatrix.needsUpdate = true;
  scene.add(poles);
  scene.add(heads);

  // Drifting clouds: flattened white spheres.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(rng.range(5, 9), 8, 6), cloudMat);
      puff.position.set(j * 6 - 6, rng.range(-1, 1), rng.range(-2, 2));
      puff.scale.y = 0.4;
      c.add(puff);
    }
    c.position.set(rng.range(-140, 140), rng.range(55, 80), rng.range(-140, 140));
    scene.add(c);
    clouds.push(c);
  }

  // Mission waypoint marker: glowing ring + light pillar, repositioned
  // by setMarker() as missions change.
  const markerGroup = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(9, 11, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  markerGroup.add(ring);
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 10, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 30;
  markerGroup.add(beam);
  markerGroup.position.set(CONFIG.garagePos.x, 0, CONFIG.garagePos.z);
  scene.add(markerGroup);

  const world = {
    colliders,
    bounds: CONFIG.bounds,
    clouds,
    markerGroup,
    markerPos: { x: CONFIG.garagePos.x, z: CONFIG.garagePos.z, r: CONFIG.garageRadius },
    setMarker(x, z, r) {
      this.markerPos = { x, z, r };
      this.markerGroup.position.set(x, 0, z);
      this.markerGroup.visible = true;
    },
    hideMarker() {
      this.markerGroup.visible = false;
    },
    update(dt, t) {
      for (const c of this.clouds) {
        c.position.x += dt * 1.2;
        if (c.position.x > 170) c.position.x = -170;
      }
      const pulse = 1 + Math.sin(t * 3) * 0.08;
      this.markerGroup.scale.set(pulse, 1, pulse);
    },
  };
  return world;
}

// Push a circle (x, z, radius) out of every building AABB it overlaps
// and clamp it inside the city bounds. Returns corrected {x, z}.
export function resolveCircle(x, z, radius, world) {
  const b = world.bounds;
  x = clamp(x, -b + radius, b - radius);
  z = clamp(z, -b + radius, b - radius);
  for (const c of world.colliders) {
    if (x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) {
      const pushL = x + radius - c.minX;
      const pushR = c.maxX - (x - radius);
      const pushB = z + radius - c.minZ;
      const pushF = c.maxZ - (z - radius);
      const m = Math.min(pushL, pushR, pushB, pushF);
      if (m === pushL) x = c.minX - radius;
      else if (m === pushR) x = c.maxX + radius;
      else if (m === pushB) z = c.minZ - radius;
      else z = c.maxZ + radius;
    }
  }
  return { x, z };
}
