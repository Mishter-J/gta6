// player.js — Rex Calloway on foot and behind the wheel: third-person
// movement, mouse-orbit camera, entering / exiting cars (E), and the
// chase camera while driving.

import * as THREE from 'three';
import { CONFIG, clamp, angleDiff, dist2D } from './config.js';

export class Player {
  constructor(ctx) {
    this.ctx = ctx;
    this.x = 0;
    this.z = 0;
    this.heading = 0; // facing direction, radians
    this.camYaw = 0; // camera orbit yaw
    this.camPitch = 0.32;
    this.health = CONFIG.playerHealth;
    this.car = null; // Vehicle when driving, else null
    this.lastDamageAt = -99;
    this.group = this._buildMesh();
    ctx.scene.add(this.group);
    this.muzzle = new THREE.Object3D(); // gun tip anchor for tracers
    this.muzzle.position.set(0.45, 1.35, 0.6);
    this.group.add(this.muzzle);
  }

  _buildMesh() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x8a2a2a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a34 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a077 });
    const hair = new THREE.MeshLambertMaterial({ color: 0x1e1410 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.36), pants);
    legs.position.y = 0.4;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.85, 0.42), jacket);
    torso.position.y = 1.22;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), skin);
    head.position.y = 1.9;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 8, 0, Math.PI * 2, 0, 1.1), hair);
    cap.position.y = 1.94;
    g.add(cap);
    const armGeo = new THREE.BoxGeometry(0.2, 0.75, 0.2);
    for (const sx of [-0.5, 0.5]) {
      const arm = new THREE.Mesh(armGeo, jacket);
      arm.position.set(sx, 1.22, 0);
      g.add(arm);
    }
    return g;
  }

  spawn(x, z, heading = 0) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.camYaw = heading + Math.PI;
    this.health = CONFIG.playerHealth;
    this.car = null;
    this.group.visible = true;
    this._syncMesh();
  }

  get pos() {
    return this.car ? { x: this.car.x, z: this.car.z } : { x: this.x, z: this.z };
  }

  get speed() {
    return this.car ? Math.abs(this.car.speed) : 0;
  }

  get driving() {
    return !!this.car;
  }

  damage(amount) {
    if (this.ctx.state !== 'playing') return;
    this.health -= amount;
    this.lastDamageAt = this.ctx.time;
    if (this.health <= 0) {
      this.health = 0;
      this.ctx.setState('wasted');
    }
  }

  heal(dt) {
    // Slow regen after 6 quiet seconds.
    if (this.ctx.time - this.lastDamageAt > 6 && this.health > 0 && this.health < CONFIG.playerHealth) {
      this.health = Math.min(CONFIG.playerHealth, this.health + dt * 4);
    }
  }

  enterCar(car) {
    if (!car || car.wrecked) return false;
    const wasParked = car.parked;
    const wasTraffic = car.traffic;
    car.traffic = false;
    car.parked = false;
    this.car = car;
    this.group.visible = false;
    this.ctx.audio.setEngine(0, true);
    this.ctx.hud.toast(`Driving the ${car.name}`);
    if (car.isPolice) this.ctx.police.addWanted(1, 'stole a police car');
    else if (wasParked || wasTraffic || car.isComet) this.ctx.police.addWanted(1, 'stole a car');
    return true;
  }

  exitCar() {
    if (!this.car) return;
    const car = this.car;
    this.car = null;
    // Step out to the driver's side.
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.x = car.x + side.x * 2.4;
    this.z = car.z + side.z * 2.4;
    const fixed = this.ctx.world.resolveCircle(this.x, this.z, 0.8);
    this.x = fixed.x;
    this.z = fixed.z;
    this.heading = car.heading;
    this.group.visible = true;
    this._syncMesh();
    this.ctx.audio.setEngine(0, false);
  }

  update(dt) {
    const { input, world } = this.ctx;
    if (this.ctx.state !== 'playing') return;
    const mouse = input.takeMouseDelta();
    this.camYaw -= mouse.dx * 0.0032;
    this.camPitch = clamp(this.camPitch + mouse.dy * 0.0022, 0.08, 1.1);

    if (this.car) {
      this._updateDriving(dt);
      return;
    }
    const axes = input.moveAxes();
    const run = input.running();
    const speed = run ? CONFIG.runSpeed : CONFIG.walkSpeed;
    if (axes.x !== 0 || axes.y !== 0) {
      // Movement is camera-relative: forward is away from the camera.
      const fwdX = -Math.sin(this.camYaw);
      const fwdZ = -Math.cos(this.camYaw);
      const rightX = Math.cos(this.camYaw);
      const rightZ = -Math.sin(this.camYaw);
      let mx = fwdX * axes.y + rightX * axes.x;
      let mz = fwdZ * axes.y + rightZ * axes.x;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      const nx = this.x + mx * speed * dt;
      const nz = this.z + mz * speed * dt;
      const fixed = world.resolveCircle(nx, nz, 0.8);
      this.x = clamp(fixed.x, -CONFIG.worldBound, CONFIG.waterStart - 4);
      this.z = clamp(fixed.z, -CONFIG.worldBound, CONFIG.worldBound);
      this.heading = Math.atan2(mx, mz);
      // Simple walk bob.
      this.group.position.y = Math.abs(Math.sin(this.ctx.time * (run ? 11 : 7))) * 0.06;
    } else {
      this.group.position.y = 0;
    }
    this._syncMesh();
    this.heal(dt);
  }

  _updateDriving(dt) {
    const { input } = this.ctx;
    const axes = input.moveAxes();
    let throttle = axes.y;
    let steer = -axes.x;
    if (input.down('Space')) {
      // Handbrake: strong decel, sharper turn.
      this.car.speed *= Math.max(0, 1 - dt * 3.5);
      steer *= 1.6;
      throttle = 0;
    }
    this.car.drive(dt, throttle, steer);
    this.ctx.audio.setEngine(Math.abs(this.car.speed) / this.car.topSpeed, true);
    // Hitting a pedestrian while driving is a crime.
    for (const ped of this.ctx.pedestrians.list) {
      if (ped.fleeing) continue;
      if (dist2D(this.car.x, this.car.z, ped.x, ped.z) < 2.4 && Math.abs(this.car.speed) > 4) {
        ped.hitByCar(this.car);
        this.ctx.police.addWanted(1, 'hit a pedestrian');
        this.ctx.hud.toast('You hit a pedestrian!');
      }
    }
  }

  _syncMesh() {
    this.group.position.x = this.x;
    this.group.position.z = this.z;
    this.group.rotation.y = this.heading;
  }

  // Camera: third-person follow on foot, chase cam while driving.
  updateCamera(dt) {
    const { camera } = this.ctx;
    const target = this.car
      ? new THREE.Vector3(this.car.x, 1.4, this.car.z)
      : new THREE.Vector3(this.x, 1.6, this.z);
    let yaw;
    let dist;
    let height;
    if (this.car) {
      // Chase cam: behind the car, lerps to follow its heading.
      const wantYaw = this.car.heading + Math.PI;
      const d = angleDiff(this.ctx.camChaseYaw ?? wantYaw, wantYaw);
      this.ctx.camChaseYaw = (this.ctx.camChaseYaw ?? wantYaw) + d * Math.min(1, dt * 3);
      yaw = this.ctx.camChaseYaw;
      dist = 10.5;
      height = 4.2;
    } else {
      yaw = this.camYaw;
      dist = 7.5;
      height = 3.2;
    }
    const pitch = this.car ? 0.24 : this.camPitch;
    const cx = target.x + Math.sin(yaw) * Math.cos(pitch) * dist;
    const cz = target.z + Math.cos(yaw) * Math.cos(pitch) * dist;
    const cy = target.y + Math.sin(pitch) * dist + height * 0.35;
    const desired = new THREE.Vector3(cx, Math.max(cy, 1.2), cz);
    camera.position.lerp(desired, Math.min(1, dt * 8));
    camera.lookAt(target);
  }
}
