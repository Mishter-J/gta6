// Port Meridian — pedestrians: low-poly walkers on the sidewalks who
// wander, and flee when they hear gunfire or a car bears down on them.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, WORLD, mulberry32 } from './config.js';
import { collideCircle } from './vehicles.js';

const SHIRT_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1, 0xfd79a8, 0x00cec9];

function makePedModel(shirtColor) {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e50 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.62;
  g.add(head);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.05;
  g.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.26), pants);
  legL.position.set(0.16, 0.35, 0);
  const legR = legL.clone();
  legR.position.x = -0.16;
  g.add(legL);
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armL.position.set(-0.42, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.42;
  g.add(armL);
  g.add(armR);
  // Blob shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.45, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class Pedestrian {
  constructor(scene, x, z, rng) {
    this.mesh = makePedModel(SHIRT_COLORS[Math.floor(rng() * SHIRT_COLORS.length)]);
    this.mesh.position.set(x, 0, z);
    this.heading = rng() * Math.PI * 2;
    this.speed = 1.2 + rng() * 0.8;
    this.target = null;
    this.fleeing = false;
    this.fleeTimer = 0;
    this.walkPhase = rng() * 10;
    this.health = 50;
    this.dead = false;
    this.rng = rng;
    scene.add(this.mesh);
  }

  get pos() { return this.mesh.position; }

  fleeFrom(x, z) {
    this.fleeing = true;
    this.fleeTimer = 4;
    const dx = this.pos.x - x, dz = this.pos.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.target = { x: this.pos.x + (dx / d) * 40, z: this.pos.z + (dz / d) * 40 };
  }

  update(dt, world, playerPos, playerCar) {
    if (this.dead) return;
    if (this.fleeTimer > 0) this.fleeTimer -= dt;
    else this.fleeing = false;
    // A fast car nearby also scares pedestrians.
    if (playerCar && playerCar.speed > 8) {
      const d = Math.hypot(playerCar.pos.x - this.pos.x, playerCar.pos.z - this.pos.z);
      if (d < 12 && !this.fleeing) this.fleeFrom(playerCar.pos.x, playerCar.pos.z);
    }
    if (!this.target || Math.hypot(this.target.x - this.pos.x, this.target.z - this.pos.z) < 2) {
      // Pick a new sidewalk waypoint near an intersection.
      const inter = world.intersections[Math.floor(this.rng() * world.intersections.length)];
      const side = this.rng() < 0.5 ? 9 : -9;
      this.target = this.rng() < 0.5
        ? { x: inter.x + side, z: inter.z + (this.rng() - 0.5) * 50 }
        : { x: inter.x + (this.rng() - 0.5) * 50, z: inter.z + side };
    }
    const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const speed = this.fleeing ? this.speed * 2.6 : this.speed;
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += THREE.MathUtils.clamp(dh, -3 * dt, 3 * dt);
    this.pos.x += Math.sin(this.heading) * speed * dt;
    this.pos.z += Math.cos(this.heading) * speed * dt;
    collideCircle(this.pos, 0.5, world.colliders);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -10, CITY.size + 10);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -10, CITY.size + 50);
    this.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(this.walkPhase) * 0.5;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    this.mesh.rotation.y = this.heading;
    void playerPos; void dist;
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
    }
  }

  destroy(scene) { scene.remove(this.mesh); }
}

export class PedestrianManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.peds = [];
    this.rng = mulberry32(CITY.seed + 21);
  }

  spawnAll() {
    for (let i = 0; i < WORLD.pedestrianCount; i++) {
      const inter = this.world.intersections[Math.floor(this.rng() * this.world.intersections.length)];
      const ped = new Pedestrian(this.scene, inter.x + (this.rng() - 0.5) * 16, inter.z + (this.rng() - 0.5) * 16, this.rng);
      this.peds.push(ped);
    }
  }

  update(dt, playerPos, playerCar) {
    for (const p of this.peds) p.update(dt, this.world, playerPos, playerCar);
  }

  /** All living peds within radius of a point (for gunfire panic). */
  scareAll(x, z, radius) {
    for (const p of this.peds) {
      if (p.dead) continue;
      if (Math.hypot(p.pos.x - x, p.pos.z - z) < radius) p.fleeFrom(x, z);
    }
  }

  nearest(x, z, maxDist) {
    let best = null, bestD = maxDist;
    for (const p of this.peds) {
      if (p.dead) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }
}
