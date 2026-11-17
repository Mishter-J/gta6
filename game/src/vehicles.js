// Port Meridian — vehicles.js
// Cars: the red sports car "Comet", parked cars and AI traffic cars.
// Arcade physics — acceleration, drag, steering scaled by speed,
// handbrake, building collision (stop + damage), a damage model where
// wrecked cars smoke and become unusable. Traffic cars follow
// rectangular road loops and brake for the car ahead.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, makeRng, clamp, dist2, headingVec, angDiff } from './config.js';
import { resolveCircle } from './world.js';

export function makeCarMesh(color, sporty) {
  const group = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const glass = new THREE.MeshLambertMaterial({ color: 0x18222e });
  const bodyH = sporty ? 0.75 : 1.0;
  const bodyL = sporty ? 4.6 : 4.2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, bodyH, bodyL), paint);
  body.position.y = 0.75;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, sporty ? 2.0 : 2.2), glass);
  cabin.position.set(0, 1.35, sporty ? -0.2 : 0);
  group.add(cabin);
  // Seated driver figure, always visible inside the cabin.
  const driver = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.7, 0.4),
    new THREE.MeshLambertMaterial({ color: 0x3a2f28 }),
  );
  driver.position.set(-0.4, 1.25, 0.3);
  group.add(driver);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    group.add(w);
  }
  // Headlights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const wx of [-0.6, 0.6]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    hl.position.set(wx, 0.8, bodyL / 2 + 0.02);
    group.add(hl);
  }
  return group;
}

export class Vehicle {
  constructor(scene, opts) {
    this.scene = scene;
    this.x = opts.x;
    this.z = opts.z;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.color = opts.color;
    this.isComet = !!opts.isComet;
    this.isTraffic = !!opts.isTraffic;
    this.name = opts.name || 'Car';
    this.damage = 0;
    this.wrecked = false;
    this.stolen = false;
    this.maxSpeed = this.isComet ? CONFIG.cometMaxSpeed : CONFIG.carMaxSpeed;
    this.mesh = makeCarMesh(opts.color, this.isComet);
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    scene.add(this.mesh);
    // Traffic loop: rectangle of road waypoints.
    this.waypoints = opts.waypoints || null;
    this.wpIndex = 0;
    this.smoke = null;
  }

  speedKmh() {
    return Math.abs(this.speed) * 2.2;
  }

  // Player driving: W/S accelerate and brake/reverse, A/D steer,
  // Space handbrake. Steering scales with speed so the car stays
  // controllable at low speed and stable at high speed.
  drive(dt, input, world) {
    if (this.wrecked) {
      this.speed = 0;
      return;
    }
    const fwd = input.down('KeyW') || input.down('ArrowUp');
    const back = input.down('KeyS') || input.down('ArrowDown');
    const left = input.down('KeyA') || input.down('ArrowLeft');
    const right = input.down('KeyD') || input.down('ArrowRight');
    const brake = input.down('Space');
    if (fwd) this.speed += CONFIG.carAccel * dt;
    if (back) {
      if (this.speed > 0.5) this.speed -= CONFIG.carBrake * dt;
      else this.speed -= CONFIG.carAccel * 0.55 * dt;
    }
    if (brake) this.speed -= Math.sign(this.speed) * CONFIG.carBrake * 1.4 * dt;
    // Drag + rolling resistance.
    this.speed -= this.speed * 0.55 * dt;
    if (!fwd && !back && Math.abs(this.speed) < 0.6) this.speed = 0;
    this.speed = clamp(this.speed, -CONFIG.carReverseSpeed, this.maxSpeed);
    const steerAmount = (left ? 1 : 0) - (right ? 1 : 0);
    if (steerAmount !== 0 && Math.abs(this.speed) > 0.5) {
      const dir = this.speed >= 0 ? 1 : -1;
      const scale = clamp(Math.abs(this.speed) / 14, 0.35, 1);
      this.heading += steerAmount * CONFIG.carSteer * scale * dir * dt;
    }
    this._integrate(dt, world);
  }

  _integrate(dt, world) {
    const v = headingVec(this.heading);
    const nx = this.x + v.x * this.speed * dt;
    const nz = this.z + v.z * this.speed * dt;
    const before = { x: this.x, z: this.z };
    const fixed = resolveCircle(nx, nz, 2.1, world);
    const hit = Math.abs(fixed.x - nx) > 0.01 || Math.abs(fixed.z - nz) > 0.01;
    if (hit && Math.abs(this.speed) > 6) {
      this.damage += Math.abs(this.speed) * 1.2;
      if (this.damage >= 100) this._wreck();
    }
    if (hit) this.speed *= 0.25;
    this.x = fixed.x;
    this.z = fixed.z;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    if (this.wrecked) this._smokeTick(dt);
    return before;
  }

  _wreck() {
    this.wrecked = true;
    this.speed = 0;
    if (!this.smoke) {
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55 }),
      );
      smoke.position.y = 1.6;
      this.mesh.add(smoke);
      this.smoke = smoke;
    }
  }

  _smokeTick(dt) {
    if (!this.smoke) return;
    const s = 1.2 + Math.sin(performance.now() * 0.006) * 0.3;
    this.smoke.scale.set(s, s, s);
  }

  // AI traffic: follow the rectangular loop, brake if the car ahead
  // (the player's car or another car) is too close.
  updateTraffic(dt, world, playerCar) {
    if (this.wrecked || !this.waypoints) return;
    const target = this.waypoints[this.wpIndex];
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < 4) {
      this.wpIndex = (this.wpIndex + 1) % this.waypoints.length;
      return;
    }
    const want = Math.atan2(dx, dz);
    const turn = angDiff(want, this.heading);
    this.heading += clamp(turn, -1.6 * dt, 1.6 * dt);
    let targetSpeed = 13;
    if (playerCar && !playerCar.wrecked) {
      const pd = dist2(this.x, this.z, playerCar.x, playerCar.z);
      if (pd < 10) targetSpeed = 0;
    }
    this.speed += clamp(targetSpeed - this.speed, -20 * dt, 12 * dt);
    this._integrate(dt, world);
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.damage = 0;
    this.wrecked = false;
    if (this.smoke) {
      this.mesh.remove(this.smoke);
      this.smoke = null;
    }
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }
}

function roadLoop(rng, road) {
  const other = CONFIG.roads[Math.floor(rng.next() * CONFIG.roads.length)];
  const a = road;
  const b = other;
  return [
    { x: a, z: -120 },
    { x: a, z: b },
    { x: 110, z: b },
    { x: 110, z: -120 },
  ];
}

export function createVehicles(scene, world) {
  const rng = makeRng(CONFIG.seed + 7);
  const list = [];
  const comet = new Vehicle(scene, {
    x: CONFIG.cometPos.x,
    z: CONFIG.cometPos.z,
    heading: CONFIG.cometPos.heading,
    color: CONFIG.colors.comet,
    isComet: true,
    name: 'Comet',
  });
  list.push(comet);

  const parkedColors = [0x2e6fb0, 0xe0a030, 0x4a9e5c, 0x8a8f96, 0x6a4a9e, 0xc0c4c8];
  const parkedSpots = [
    { x: 40, z: 24, heading: 0 },
    { x: -40, z: -24, heading: Math.PI },
    { x: 80, z: 60, heading: Math.PI / 2 },
    { x: -80, z: -60, heading: -Math.PI / 2 },
    { x: 0, z: 100, heading: Math.PI },
    { x: 120, z: 20, heading: -Math.PI / 2 },
  ];
  for (let i = 0; i < parkedSpots.length; i++) {
    const s = parkedSpots[i];
    list.push(new Vehicle(scene, {
      x: s.x, z: s.z, heading: s.heading,
      color: parkedColors[i % parkedColors.length],
      name: 'Sedan',
    }));
  }

  const traffic = [];
  for (let i = 0; i < 8; i++) {
    const road = CONFIG.roads[1 + Math.floor(rng.next() * (CONFIG.roads.length - 2))];
    const car = new Vehicle(scene, {
      x: road, z: -110 + rng.range(0, 60), heading: 0,
      color: parkedColors[Math.floor(rng.next() * parkedColors.length)],
      isTraffic: true,
      name: 'Traffic',
      waypoints: roadLoop(rng, road),
    });
    list.push(car);
    traffic.push(car);
  }
  return { list, comet, traffic };
}
