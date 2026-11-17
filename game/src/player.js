// Port Meridian — player.js
// Rex Calloway on foot and behind the wheel. Third-person character
// (simple capsule figure), walk/run with camera-relative WASD, mouse
// orbit camera, chase camera while driving. E near a car steals /
// enters it (proximity ~6.5u, driver seated); E again exits beside
// the car. Entering a car that was never stolen before is a crime:
// the steal callback raises the wanted level by one star.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, clamp, lerp, dist2, headingVec, angDiff } from './config.js';
import { resolveCircle } from './world.js';

function makeFigureMesh() {
  const g = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0x2e4a6b });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x23262b });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 10), jacket);
  body.position.y = 1.15;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), skin);
  head.position.y = 2.05;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.55), pants);
  cap.position.y = 2.28;
  g.add(cap);
  for (const sx of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.26), pants);
    leg.position.set(sx, 0.38, 0);
    g.add(leg);
  }
  return g;
}

export class Player {
  constructor(scene, world, vehicles, input) {
    this.scene = scene;
    this.world = world;
    this.vehicles = vehicles;
    this.input = input;
    this.mesh = makeFigureMesh();
    scene.add(this.mesh);
    this.x = CONFIG.playerSpawn.x;
    this.z = CONFIG.playerSpawn.z;
    this.heading = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.inCar = false;
    this.car = null;
    this.walkPhase = 0;
    this.reset();
  }

  reset() {
    this.x = CONFIG.playerSpawn.x;
    this.z = CONFIG.playerSpawn.z;
    this.heading = Math.PI;
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.inCar = false;
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
  }

  // Nearest usable car within enter radius, or null.
  nearestCar() {
    let best = null;
    let bestD = Infinity;
    for (const car of this.vehicles.list) {
      if (car.wrecked) continue;
      const d = dist2(this.x, this.z, car.x, car.z);
      if (d < CONFIG.enterRadius && d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  // E near a car: enter it. Returns { entered, car, stole }.
  // `stole` is true only the first time this car is taken.
  tryEnterCar() {
    if (this.inCar) return { entered: false, car: null, stole: false };
    const car = this.nearestCar();
    if (!car) return { entered: false, car: null, stole: false };
    this.inCar = true;
    this.car = car;
    this.mesh.visible = false;
    const stole = !car.stolen;
    car.stolen = true;
    return { entered: true, car, stole };
  }

  exitCar() {
    if (!this.inCar || !this.car) return false;
    const v = headingVec(this.car.heading);
    // Step out on the car's left side.
    const px = this.car.x - v.z * 2.6;
    const pz = this.car.z + v.x * 2.6;
    const fixed = resolveCircle(px, pz, 0.6, this.world);
    this.x = fixed.x;
    this.z = fixed.z;
    this.heading = this.car.heading;
    this.camYaw = this.car.heading;
    this.inCar = false;
    this.car = null;
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    return true;
  }

  update(dt, camera) {
    const mouse = this.input.consumeMouse();
    this.camYaw -= mouse.dx * 0.0032;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.0022, -0.15, 0.9);

    if (this.inCar && this.car) {
      this.car.drive(dt, this.input, this.world);
      this.x = this.car.x;
      this.z = this.car.z;
      this.heading = this.car.heading;
      this._updateCamera(camera, dt, true);
      return this.car.speed;
    }

    // On foot: camera-relative WASD, Shift to run.
    let mx = 0;
    let mz = 0;
    if (this.input.down('KeyW') || this.input.down('ArrowUp')) mz += 1;
    if (this.input.down('KeyS') || this.input.down('ArrowDown')) mz -= 1;
    if (this.input.down('KeyA') || this.input.down('ArrowLeft')) mx -= 1;
    if (this.input.down('KeyD') || this.input.down('ArrowRight')) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const run = this.input.down('ShiftLeft') || this.input.down('ShiftRight');
    const speed = run ? CONFIG.runSpeed : CONFIG.walkSpeed;
    if (moving) {
      const len = Math.sqrt(mx * mx + mz * mz);
      mx /= len;
      mz /= len;
      // Camera-relative: forward is where the camera looks.
      const fx = Math.sin(this.camYaw);
      const fz = Math.cos(this.camYaw);
      const rx = Math.cos(this.camYaw);
      const rz = -Math.sin(this.camYaw);
      const dx = fx * mz + rx * mx;
      const dz = fz * mz + rz * mx;
      const nx = this.x + dx * speed * dt;
      const nz = this.z + dz * speed * dt;
      const fixed = resolveCircle(nx, nz, 0.6, this.world);
      this.x = fixed.x;
      this.z = fixed.z;
      const targetHeading = Math.atan2(dx, dz);
      const diff = angDiff(targetHeading, this.heading);
      this.heading += clamp(diff, -8 * dt, 8 * dt);
      this.walkPhase += dt * speed * 1.6;
      this.mesh.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.06;
    } else {
      this.mesh.position.y = 0;
    }
    this.mesh.position.set(this.x, this.mesh.position.y, this.z);
    this.mesh.rotation.y = this.heading;
    this._updateCamera(camera, dt, false);
    return moving ? speed : 0;
  }

  _updateCamera(camera, dt, driving) {
    const dist = driving ? 13 : 9;
    const height = driving ? 5.2 : 4.2;
    // While driving the camera eases behind the car's heading.
    const wantYaw = driving ? this.heading : this.camYaw;
    if (driving) {
      const diff = angDiff(wantYaw, this.camYaw);
      this.camYaw += diff * Math.min(1, dt * 2.2);
    }
    const cx = this.x - Math.sin(this.camYaw) * dist * Math.cos(this.camPitch);
    const cz = this.z - Math.cos(this.camYaw) * dist * Math.cos(this.camPitch);
    const cy = height + Math.sin(this.camPitch) * dist;
    camera.position.x = lerp(camera.position.x, cx, Math.min(1, dt * 10));
    camera.position.y = lerp(camera.position.y, cy, Math.min(1, dt * 10));
    camera.position.z = lerp(camera.position.z, cz, Math.min(1, dt * 10));
    camera.lookAt(this.x, driving ? 1.6 : 1.5, this.z);
  }
}
