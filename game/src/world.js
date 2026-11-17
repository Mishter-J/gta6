// world.js — Port Meridian's city: a seeded 7x7 road grid, ~200 instanced
// buildings, the Meridian Tower landmark, beach + water on the east edge,
// palms, street lamps, drifting clouds and golden-hour lighting.
// Building colliders are simple AABBs the player and cars resolve against.

import * as THREE from 'three';
import { CONFIG, mulberry32, pick, roadLines } from './config.js';

const BUILDING_COLORS = [
  0x9a8f7a, 0x7d8aa0, 0xa08a7a, 0x6f7f8c, 0xb0a58e,
  0x8a7f95, 0x94a08a, 0xa89a80, 0x7a8694, 0xb59a7a,
];

export class World {
  constructor(ctx) {
    this.ctx = ctx;
    this.rng = mulberry32(CONFIG.seed);
    this.colliders = []; // {x, z, hx, hz}
    this.clouds = [];
    this.buildings = null;
    this.beacons = new Map(); // named marker meshes by id
    this.landmarks = {};
  }

  build() {
    const { scene } = this.ctx;
    scene.fog = new THREE.Fog(CONFIG.fogColor, 180, 720);
    scene.background = new THREE.Color(CONFIG.skyBottom);

    // Golden-hour sky dome (gradient via a big backside sphere).
    const skyGeo = new THREE.SphereGeometry(900, 24, 12);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        top: { value: new THREE.Color(CONFIG.skyTop) },
        bottom: { value: new THREE.Color(CONFIG.skyBottom) },
      },
      vertexShader:
        'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 vP;' +
        'void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, pow(h, 0.8)), 1.0); }',
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Lights: warm sun + soft sky fill.
    const sun = new THREE.DirectionalLight(CONFIG.sunColor, 2.4);
    sun.position.set(180, 260, 120);
    scene.add(sun);
    scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x8a6a4a, 1.1));
    this.ctx.sun = sun;

    // Ground plane: grass-green city base, big enough to reach the water.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100),
      new THREE.MeshLambertMaterial({ color: CONFIG.groundColor }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(40, 0, 0);
    scene.add(ground);

    this._buildRoads();
    this._buildBuildings();
    this._buildBeach();
    this._buildPalmsAndLamps();
    this._buildClouds();
    this._buildLandmarks();
  }

  _buildRoads() {
    const { scene } = this.ctx;
    const lines = roadLines();
    const roadMat = new THREE.MeshLambertMaterial({ color: CONFIG.roadColor });
    const sideMat = new THREE.MeshLambertMaterial({ color: CONFIG.sidewalkColor });
    const markMat = new THREE.MeshBasicMaterial({ color: 0xd8d2a8 });
    const size = CONFIG.cityHalf * 2 + CONFIG.roadWidth;
    for (const l of lines) {
      for (const horizontal of [true, false]) {
        const road = new THREE.Mesh(new THREE.PlaneGeometry(size, CONFIG.roadWidth), roadMat);
        road.rotation.x = -Math.PI / 2;
        road.position.set(0, 0.02, 0);
        if (horizontal) {
          road.position.z = l;
        } else {
          road.rotation.z = Math.PI / 2;
          road.position.x = l;
        }
        scene.add(road);
        // Sidewalks on both edges of the road.
        for (const off of [-CONFIG.roadWidth / 2 - 2.5, CONFIG.roadWidth / 2 + 2.5]) {
          const walk = new THREE.Mesh(new THREE.PlaneGeometry(size, 5), sideMat);
          walk.rotation.x = -Math.PI / 2;
          walk.position.set(0, 0.015, 0);
          if (horizontal) {
            walk.position.z = l + off;
          } else {
            walk.rotation.z = Math.PI / 2;
            walk.position.x = l + off;
          }
          scene.add(walk);
        }
        // Centre dashes.
        const dashes = Math.floor(size / 12);
        const dashGeo = new THREE.PlaneGeometry(4, 0.5);
        const dashesMesh = new THREE.InstancedMesh(dashGeo, markMat, dashes);
        const m = new THREE.Matrix4();
        for (let i = 0; i < dashes; i++) {
          const along = -size / 2 + 6 + i * 12;
          if (horizontal) m.makeTranslation(along, 0.03, l);
          else m.makeRotationZ(Math.PI / 2).setPosition(l, 0.03, along);
          dashesMesh.setMatrixAt(i, m);
        }
        scene.add(dashesMesh);
      }
    }
  }

  _buildBuildings() {
    const { scene } = this.ctx;
    const rng = this.rng;
    const lines = roadLines();
    const transforms = [];
    const colors = [];
    const color = new THREE.Color();
    const halfRoad = CONFIG.roadWidth / 2 + 3;
    for (let bx = 0; bx < CONFIG.blockCount; bx++) {
      for (let bz = 0; bz < CONFIG.blockCount; bz++) {
        const x0 = lines[bx] + halfRoad;
        const x1 = lines[bx + 1] - halfRoad;
        const z0 = lines[bz] + halfRoad;
        const z1 = lines[bz + 1] - halfRoad;
        const n = 3 + Math.floor(rng() * 2); // 3-4 buildings per block
        for (let i = 0; i < n; i++) {
          const w = 12 + rng() * 16;
          const d = 12 + rng() * 16;
          const cx = x0 + w / 2 + rng() * Math.max(1, x1 - x0 - w);
          const cz = z0 + d / 2 + rng() * Math.max(1, z1 - z0 - d);
          // Meridian Tower block stays clear for the landmark.
          if (Math.abs(cx - 40) < 40 && Math.abs(cz + 40) < 40) continue;
          const h = 10 + Math.pow(rng(), 1.6) * 55;
          transforms.push({ x: cx, z: cz, w, d, h });
          color.setHex(pick(rng, BUILDING_COLORS));
          // Slight per-instance tint variation.
          const tint = 0.85 + rng() * 0.3;
          colors.push(color.clone().multiplyScalar(tint));
          this.colliders.push({ x: cx, z: cz, hx: w / 2, hz: d / 2 });
        }
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const inst = new THREE.InstancedMesh(geo, mat, transforms.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    transforms.forEach((t, i) => {
      p.set(t.x, 0, t.z);
      s.set(t.w, t.h, t.d);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, colors[i]);
    });
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    scene.add(inst);
    this.buildings = inst;
    this.buildingCount = transforms.length;

    // Rooftop beacons on a few tall buildings (tiny emissive boxes).
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const beaconGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    let placed = 0;
    for (const t of transforms) {
      if (t.h > 48 && placed < 12) {
        const b = new THREE.Mesh(beaconGeo, beaconMat);
        b.position.set(t.x, t.h + 0.8, t.z);
        scene.add(b);
        placed += 1;
      }
    }
  }

  _buildLandmarks() {
    const { scene } = this.ctx;
    // Meridian Tower: the tall glass landmark at the city centre-north.
    const tower = new THREE.Group();
    const glass = new THREE.MeshLambertMaterial({ color: 0x4a6a8a, emissive: 0x1a2a3a });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(26, 120, 26), glass);
    shaft.position.y = 60;
    tower.add(shaft);
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(30, 6, 30),
      new THREE.MeshLambertMaterial({ color: 0xc8a24a, emissive: 0x664411 }),
    );
    crown.position.y = 123;
    tower.add(crown);
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(20, 4, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd27a }),
    );
    sign.position.set(0, 112, 13.5);
    tower.add(sign);
    tower.position.set(40, 0, -40);
    scene.add(tower);
    this.colliders.push({ x: 40, z: -40, hx: 14, hz: 14 });
    this.landmarks.tower = tower;

    // Meridian Bank (mission 6) — a stone block with columns, centre-north.
    const bank = new THREE.Group();
    const stone = new THREE.MeshLambertMaterial({ color: 0xcbbfa0 });
    const hall = new THREE.Mesh(new THREE.BoxGeometry(34, 16, 22), stone);
    hall.position.y = 8;
    bank.add(hall);
    const colGeo = new THREE.CylinderGeometry(1.4, 1.4, 14, 8);
    for (let i = -2; i <= 2; i++) {
      const col = new THREE.Mesh(colGeo, new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }));
      col.position.set(i * 6.5, 7, 12);
      bank.add(col);
    }
    bank.position.set(-40, 0, -200);
    scene.add(bank);
    this.colliders.push({ x: -40, z: -200, hx: 18, hz: 12 });
    this.landmarks.bank = bank;

    // Docks (mission 2) — crates and a pier at the south edge.
    const docks = new THREE.Group();
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a5a30 });
    const crateMat2 = new THREE.MeshLambertMaterial({ color: 0x5a7a8a });
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(5, 3 + (i % 3), 5),
        i % 2 ? crateMat : crateMat2,
      );
      c.position.set(-120 + (i % 5) * 9, 1.5 + (i % 3) * 0.5, 252 + Math.floor(i / 5) * 10);
      c.rotation.y = (i * 0.4) % 1;
      docks.add(c);
      this.colliders.push({ x: c.position.x, z: c.position.z, hx: 3, hz: 3 });
    }
    scene.add(docks);
    this.landmarks.docks = docks;

    // The garage (mission 1 destination) — an open-front shed, east side.
    const garage = new THREE.Group();
    const gMat = new THREE.MeshLambertMaterial({ color: 0x7a4a3a });
    const walls = new THREE.Mesh(new THREE.BoxGeometry(24, 8, 16), gMat);
    walls.position.y = 4;
    garage.add(walls);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(26, 1, 18),
      new THREE.MeshLambertMaterial({ color: 0x3a3a3a }),
    );
    roof.position.y = 8.5;
    garage.add(roof);
    garage.position.set(200, 0, 40);
    scene.add(garage);
    this.colliders.push({ x: 200, z: 32, hx: 13, hz: 1.5 });
    this.colliders.push({ x: 188, z: 40, hx: 1.5, hz: 9 });
    this.colliders.push({ x: 212, z: 40, hx: 1.5, hz: 9 });
    this.landmarks.garage = garage;

    // Warehouse (mission 4) — big shed on the west edge.
    const wh = new THREE.Group();
    const whMesh = new THREE.Mesh(
      new THREE.BoxGeometry(40, 12, 26),
      new THREE.MeshLambertMaterial({ color: 0x5a5a6a }),
    );
    whMesh.position.y = 6;
    wh.add(whMesh);
    wh.position.set(-200, 0, 40);
    scene.add(wh);
    this.colliders.push({ x: -200, z: 40, hx: 21, hz: 14 });
    this.landmarks.warehouse = wh;
  }

  _buildBeach() {
    const { scene } = this.ctx;
    // Sand strip east of the city, then open water.
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 620),
      new THREE.MeshLambertMaterial({ color: CONFIG.sandColor }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(CONFIG.beachStart + 17, 0.01, 0);
    scene.add(sand);
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 900),
      new THREE.MeshLambertMaterial({ color: CONFIG.waterColor }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(CONFIG.waterStart + 200, 0.0, 0);
    scene.add(water);
    this.landmarks.water = water;
  }

  _buildPalmsAndLamps() {
    const { scene } = this.ctx;
    const rng = this.rng;
    // Palms along the beach.
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a34 });
    const leafMat = new THREE.MeshLambertMaterial({ color: 0x2e7d4a });
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 7, 6);
    const leafGeo = new THREE.ConeGeometry(3.2, 3.5, 6);
    const palms = new THREE.Group();
    for (let i = 0; i < 42; i++) {
      const x = CONFIG.beachStart + 4 + rng() * 26;
      const z = -280 + rng() * 560;
      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.set(x, 3.5, z);
      trunk.rotation.z = (rng() - 0.5) * 0.25;
      palms.add(trunk);
      const leaves = new THREE.Mesh(leafGeo, leafMat);
      leaves.position.set(x, 8, z);
      palms.add(leaves);
    }
    scene.add(palms);

    // Street lamps at road intersections.
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6a8 });
    const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 7, 6);
    const bulbGeo = new THREE.SphereGeometry(0.6, 8, 6);
    const lines = roadLines();
    for (const lx of lines) {
      for (const lz of lines) {
        if ((lx + lz) % 160 !== 0) continue;
        const pole = new THREE.Mesh(poleGeo, poleMat);
        pole.position.set(lx + 8, 3.5, lz + 8);
        scene.add(pole);
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.set(lx + 8, 7.2, lz + 8);
        scene.add(bulb);
      }
    }
  }

  _buildClouds() {
    const { scene } = this.ctx;
    const rng = this.rng;
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 14; i++) {
      const cloud = new THREE.Group();
      const puffs = 3 + Math.floor(rng() * 3);
      for (let j = 0; j < puffs; j++) {
        const r = 8 + rng() * 14;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
        puff.position.set(j * 12 - puffs * 6, (rng() - 0.5) * 4, (rng() - 0.5) * 10);
        puff.scale.y = 0.45;
        cloud.add(puff);
      }
      cloud.position.set(-500 + rng() * 1000, 120 + rng() * 60, -500 + rng() * 1000);
      scene.add(cloud);
      this.clouds.push(cloud);
    }
  }

  // A tall glowing cylinder + floating diamond marking a mission target.
  addBeacon(id, x, z, colorHex) {
    this.removeBeacon(id);
    const group = new THREE.Group();
    const cyl = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 60, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    cyl.position.y = 30;
    group.add(cyl);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.4),
      new THREE.MeshBasicMaterial({ color: colorHex }),
    );
    gem.position.y = 14;
    group.add(gem);
    group.position.set(x, 0, z);
    this.ctx.scene.add(group);
    this.beacons.set(id, { group, gem, baseY: 14 });
    return group;
  }

  removeBeacon(id) {
    const b = this.beacons.get(id);
    if (!b) return;
    this.ctx.scene.remove(b.group);
    this.beacons.delete(id);
  }

  // Circle (radius r) vs building AABBs. Returns a corrected position.
  resolveCircle(x, z, r) {
    let nx = x;
    let nz = z;
    for (const c of this.colliders) {
      const cx = Math.max(c.x - c.hx, Math.min(nx, c.x + c.hx));
      const cz = Math.max(c.z - c.hz, Math.min(nz, c.z + c.hz));
      const dx = nx - cx;
      const dz = nz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        nx = cx + (dx / d) * r;
        nz = cz + (dz / d) * r;
      } else if (d2 <= 0.0001) {
        // Centre inside the box: push out along the smallest axis.
        const px = c.hx + r - Math.abs(nx - c.x);
        const pz = c.hz + r - Math.abs(nz - c.z);
        if (px < pz) nx = c.x + (nx >= c.x ? c.hx + r : -(c.hx + r));
        else nz = c.z + (nz >= c.z ? c.hz + r : -(c.hz + r));
      }
    }
    return { x: nx, z: nz };
  }

  // True when the circle overlaps any building collider.
  hitsBuilding(x, z, r) {
    for (const c of this.colliders) {
      const cx = Math.max(c.x - c.hx, Math.min(x, c.x + c.hx));
      const cz = Math.max(c.z - c.hz, Math.min(z, c.z + c.hz));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  update(dt, t) {
    // Clouds drift slowly; beacon gems bob and spin.
    for (const c of this.clouds) {
      c.position.x += dt * 1.5;
      if (c.position.x > 560) c.position.x = -560;
    }
    for (const b of this.beacons.values()) {
      b.gem.position.y = b.baseY + Math.sin(t * 2.2) * 1.2;
      b.gem.rotation.y = t * 1.5;
    }
  }
}
