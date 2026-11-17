// Port Meridian — pedestrians.js
// Walkers on the sidewalks, wandering between waypoints along the
// roads. They flee from gunfire and from the player's car, and they
// keep to the sidewalks so they read as city life, not obstacles.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, makeRng } from './config.js';
import { resolveCircle } from './world.js';

const SHIRTS = [0xc25a4a, 0x4a7ac2, 0x53a05a, 0xd0b040, 0x8a5ac2, 0xc27a9a, 0x5ac2b0];

function makeWalkerMesh(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a2d33 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.8, 4, 8), shirt);
  body.position.y = 1.05;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), skin);
  head.position.y = 1.9;
  g.add(head);
  for (const sx of [-0.15, 0.15]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), pants);
    leg.position.set(sx, 0.35, 0);
    g.add(leg);
  }
  return g;
}

export class Pedestrians {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.walkers = [];
    const rng = makeRng(CONFIG.seed + 21);
    for (let i = 0; i < 24; i++) {
      const road = CONFIG.roads[Math.floor(rng.next() * CONFIG.roads.length)];
      const along = rng.range(-120, 120);
      const side = rng.next() > 0.5 ? 1 : -1;
      const horizontal = rng.next() > 0.5;
      const x = horizontal ? along : road + side * 6.5;
      const z = horizontal ? road + side * 6.5 : along;
      const mesh = makeWalkerMesh(SHIRTS[i % SHIRTS.length]);
      mesh.position.set(x, 0, z);
      scene.add(mesh);
      this.walkers.push({
        x, z, mesh,
        heading: rng.range(0, Math.PI * 2),
        speed: rng.range(1.2, 2.4),
        target: null,
        fleeUntil: 0,
        fleeX: 0,
        fleeZ: 0,
        phase: rng.range(0, 6),
      });
    }
    this.time = 0;
  }

  // A gunshot (or a near-miss car) makes nearby walkers flee.
  scare(x, z, radius) {
    for (const w of this.walkers) {
      const dx = w.x - x;
      const dz = w.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        w.fleeUntil = this.time + 2.5;
        w.fleeX = x;
        w.fleeZ = z;
      }
    }
  }

  update(dt, playerX, playerZ, playerSpeed) {
    this.time += dt;
    for (const w of this.walkers) {
      let tx;
      let tz;
      let speed = w.speed;
      if (this.time < w.fleeUntil) {
        // Run directly away from the threat.
        const dx = w.x - w.fleeX;
        const dz = w.z - w.fleeZ;
        const len = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));
        tx = w.x + (dx / len) * 10;
        tz = w.z + (dz / len) * 10;
        speed = 6;
      } else {
        if (!w.target) {
          // Pick a new sidewalk waypoint along a random road.
          const road = CONFIG.roads[Math.floor(Math.random() * CONFIG.roads.length)];
          const along = (Math.random() * 240) - 120;
          const side = Math.random() > 0.5 ? 6.5 : -6.5;
          if (Math.random() > 0.5) w.target = { x: along, z: road + side };
          else w.target = { x: road + side, z: along };
        }
        tx = w.target.x;
        tz = w.target.z;
      }
      const dx = tx - w.x;
      const dz = tz - w.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 1.5) {
        w.target = null;
        continue;
      }
      w.heading = Math.atan2(dx, dz);
      const nx = w.x + (dx / d) * speed * dt;
      const nz = w.z + (dz / d) * speed * dt;
      const fixed = resolveCircle(nx, nz, 0.5, this.world);
      w.x = fixed.x;
      w.z = fixed.z;
      w.phase += dt * speed * 2;
      w.mesh.position.set(w.x, Math.abs(Math.sin(w.phase)) * 0.04, w.z);
      w.mesh.rotation.y = w.heading;
    }
  }
}
