// Port Meridian — wanted level, police cars and foot cops.
// Heat rises with crime and decays when the player stays clean; the
// police spawn, chase, ram, shoot and can bust the player.

import * as THREE from '../vendor/three.module.min.js';
import { WANTED, CITY, mulberry32 } from './config.js';
import { Car } from './vehicles.js';

function makeCopModel() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const uniform = new THREE.MeshLambertMaterial({ color: 0x1c2f57 }); // MPD navy
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.62;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), uniform);
  cap.position.y = 1.86;
  g.add(cap);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.74, 0.36), uniform);
  torso.position.y = 1.05;
  g.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), uniform);
  legL.position.set(0.17, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = -0.17;
  g.add(legL);
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.64, 0.22), uniform);
  armL.position.set(-0.44, 1.05, 0);
  const armR = armL.clone();
  armR.position.x = 0.44;
  g.add(armL);
  g.add(armR);
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export class FootCop {
  constructor(scene, x, z) {
    this.mesh = makeCopModel();
    this.mesh.position.set(x, 0, z);
    this.heading = 0;
    this.speed = 7.2;
    this.health = 60;
    this.dead = false;
    this.walkPhase = Math.random() * 10;
    this.shootTimer = 1;
    this.bustTimer = 0;
    scene.add(this.mesh);
  }

  get pos() { return this.mesh.position; }

  update(dt, targetPos, wanted, onShoot, onBust) {
    if (this.dead) return;
    const dx = targetPos.x - this.pos.x, dz = targetPos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    this.heading += THREE.MathUtils.clamp(dh, -4 * dt, 4 * dt);
    if (dist > 2.2) {
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += Math.cos(this.heading) * this.speed * dt;
    }
    this.walkPhase += dt * this.speed * 1.8;
    const swing = Math.sin(this.walkPhase) * 0.5;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    this.mesh.rotation.y = this.heading;
    // At 3+ stars cops shoot; otherwise they close in to bust.
    if (wanted >= 3 && dist < 45 && dist > 4) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = 1.1 + Math.random() * 0.8;
        onShoot(this.pos, dist);
      }
    }
    if (dist < 2.2) {
      this.bustTimer += dt;
      if (this.bustTimer > 2) onBust();
    } else {
      this.bustTimer = 0;
    }
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

export class PoliceManager {
  constructor(scene, world, traffic) {
    this.scene = scene;
    this.world = world;
    this.traffic = traffic;
    this.wanted = 0;
    this.heatTimer = 0;      // seconds since last crime
    this.copCars = [];
    this.footCops = [];
    this.rng = mulberry32(CITY.seed + 55);
    this.onBusted = null;
    this.onCopKilled = null;
    this.nearestCopDist = -1;
  }

  addHeat(stars) {
    this.wanted = Math.min(5, this.wanted + stars);
    this.heatTimer = 0;
  }

  setWanted(stars) {
    this.wanted = THREE.MathUtils.clamp(stars, 0, 5);
    this.heatTimer = 0;
  }

  clearWanted() {
    this.wanted = 0;
    this._despawnAll();
  }

  _despawnAll() {
    for (const c of this.copCars) { c.destroy(); }
    for (const c of this.footCops) { c.destroy(this.scene); }
    this.copCars = [];
    this.footCops = [];
  }

  _spawnCopCarNear(x, z) {
    const road = this.world.nearestRoadPoint(x + (this.rng() - 0.5) * 120, z + (this.rng() - 0.5) * 120);
    const car = new Car(this.scene, {
      x: road.x, z: road.z, heading: this.rng() * Math.PI * 2,
      police: true, driver: 'ai', cruiseSpeed: 26,
    });
    car.onCrash = null;
    this.traffic.cars.push(car);
    this.copCars.push(car);
    return car;
  }

  _spawnFootCopNear(x, z) {
    const cop = new FootCop(this.scene, x + (this.rng() - 0.5) * 30, z + (this.rng() - 0.5) * 30);
    this.footCops.push(cop);
    return cop;
  }

  _syncSpawns(playerPos) {
    const cfg = WANTED[this.wanted];
    while (this.copCars.length < cfg.copCars) this._spawnCopCarNear(playerPos.x, playerPos.z);
    while (this.footCops.length < cfg.footCops) this._spawnFootCopNear(playerPos.x, playerPos.z);
    while (this.copCars.length > cfg.copCars) {
      const c = this.copCars.pop();
      const idx = this.traffic.cars.indexOf(c);
      if (idx >= 0) this.traffic.cars.splice(idx, 1);
      c.destroy();
    }
    while (this.footCops.length > cfg.footCops) {
      const c = this.footCops.pop();
      c.destroy(this.scene);
    }
  }

  update(dt, player, playerCar, colliders, onCopShoot) {
    const playerPos = playerCar ? playerCar.pos : player.pos;
    // Wanted decay: stay clean and out of sight and the heat fades.
    if (this.wanted > 0) {
      this.heatTimer += dt;
      const decay = WANTED[this.wanted].decay;
      if (this.heatTimer > decay) {
        this.wanted--;
        this.heatTimer = 0;
      }
    }
    this._syncSpawns(playerPos);
    // Police cars chase the player and ram.
    let nearest = Infinity;
    for (const car of this.copCars) {
      const dx = playerPos.x - car.pos.x, dz = playerPos.z - car.pos.z;
      const dist = Math.hypot(dx, dz);
      nearest = Math.min(nearest, dist);
      if (dist > 220) {
        // Teleport far cops back near the action (classic GTA rubber-banding).
        const road = this.world.nearestRoadPoint(playerPos.x + (this.rng() - 0.5) * 90, playerPos.z + (this.rng() - 0.5) * 90);
        car.pos.x = road.x; car.pos.z = road.z;
        car.speed = 10;
        continue;
      }
      const targetHeading = Math.atan2(dx, dz);
      let dh = targetHeading - car.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      const steer = THREE.MathUtils.clamp(dh * 1.8, -1, 1);
      const throttle = dist > 6 ? 1 : 0.4;
      car.drive(dt, throttle, steer, false, colliders, this.traffic.cars);
      // Ramming damage to the player's car / player.
      if (dist < 4.5 && Math.abs(car.speed) > 4) {
        if (playerCar) playerCar.damage(Math.abs(car.speed) * 0.9);
        else player.damage(12 * dt);
        car.speed *= 0.5;
      }
    }
    // Foot cops chase and shoot/bust.
    for (const cop of this.footCops) {
      cop.update(dt, playerPos, this.wanted, (fromPos, dist) => {
        onCopShoot(fromPos, dist);
      }, () => {
        if (this.onBusted) this.onBusted();
      });
    }
    this.nearestCopDist = this.wanted > 0 ? nearest : -1;
    // Clean up dead cops.
    this.footCops = this.footCops.filter((c) => {
      if (c.dead) { c.destroy(this.scene); return false; }
      return true;
    });
  }
}
