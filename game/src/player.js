// Port Meridian — the player on foot: third-person controller, camera rig,
// entering/exiting cars, and the low-poly character model.

import * as THREE from '../vendor/three.module.min.js';
import { WORLD } from './config.js';
import { collideCircle } from './vehicles.js';

function makePlayerModel() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a066 });
  const jacket = new THREE.MeshLambertMaterial({ color: 0x8a2f2f }); // Rex's red jacket
  const pants = new THREE.MeshLambertMaterial({ color: 0x1f2a3a });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.64;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), new THREE.MeshLambertMaterial({ color: 0x1a1210 }));
  hair.position.y = 1.9;
  g.add(hair);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.76, 0.36), jacket);
  torso.position.y = 1.06;
  g.add(torso);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), pants);
  legL.position.set(0.17, 0.36, 0);
  const legR = legL.clone();
  legR.position.x = -0.17;
  g.add(legL);
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.64, 0.22), jacket);
  armL.position.set(-0.44, 1.06, 0);
  const armR = armL.clone();
  armR.position.x = 0.44;
  g.add(armL);
  g.add(armR);
  // Pistol in the right hand (hidden until armed)
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  gun.position.set(0.44, 0.78, 0.18);
  gun.visible = false;
  g.add(gun);
  // Blob shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.5, 12),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  g.add(shadow);
  g.userData = { legL, legR, armL, armR, gun };
  return g;
}

export class Player {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.mesh = makePlayerModel();
    this.mesh.position.set(2 * 62, 0, 2 * 62);
    this.heading = 0;
    this.camYaw = 0;
    this.camPitch = 0.32;
    this.camDist = 7;
    this.velY = 0;
    this.onGround = true;
    this.health = 100;
    this.armor = 0;
    this.inCar = null;      // Car instance when driving
    this.armed = false;     // pistol out
    this.ammo = 12;
    this.magSize = 12;
    this.reloadTimer = 0;
    this.walkPhase = 0;
    this.moving = false;
    this.punchTimer = 0;
    scene.add(this.mesh);
  }

  get pos() { return this.mesh.position; }

  get speed2D() { return this._lastSpeed ?? 0; }

  setWeapon(armed) {
    this.armed = armed;
    this.mesh.userData.gun.visible = armed;
  }

  /** On-foot movement. Returns the horizontal speed for the HUD. */
  updateOnFoot(dt, input, mouse, world) {
    const fwd = input.forwardAxis();
    const str = input.strafeAxis();
    const running = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = running ? WORLD.playerRunSpeed : WORLD.playerWalkSpeed;
    this.camYaw -= mouse.dx * 0.0032;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + mouse.dy * 0.0026, -0.15, 0.9);
    let mx = 0, mz = 0;
    if (fwd !== 0 || str !== 0) {
      const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
      // Camera-relative movement (camera looks along -Z of its yaw).
      mx = -sin * fwd + cos * str;
      mz = -cos * fwd - sin * str;
      const len = Math.hypot(mx, mz);
      mx /= len; mz /= len;
      this.heading = Math.atan2(mx, mz);
      this.moving = true;
    } else {
      this.moving = false;
    }
    const vx = mx * speed, vz = mz * speed;
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    this._lastSpeed = Math.hypot(vx, vz);
    // Jump
    if (input.wasPressed('Space') && this.onGround) {
      this.velY = WORLD.playerJumpSpeed;
      this.onGround = false;
    }
    this.velY += WORLD.gravity * dt;
    this.pos.y += this.velY * dt;
    if (this.pos.y <= 0) { this.pos.y = 0; this.velY = 0; this.onGround = true; }
    collideCircle(this.pos, 0.55, world.colliders);
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -12, 434 + 12);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -12, 434 + 52);
    // Walk animation
    this.walkPhase += dt * this._lastSpeed * 1.6;
    const swing = this.moving ? Math.sin(this.walkPhase) * 0.55 : 0;
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = this.armed ? -1.2 : -swing * 0.7;
    u.armR.rotation.x = this.armed ? -1.2 : swing * 0.7;
    this.mesh.rotation.y = this.heading;
    this._updateCamera(dt, null, world.colliders);
  }

  /** Chase camera: behind the player, or behind the car. */
  _updateCamera(dt, car, colliders) {
    const cam = this.camera;
    let target, yaw, dist, height;
    if (car) {
      target = car.pos;
      yaw = car.heading + Math.PI; // behind the car
      dist = 10.5;
      height = 4.2;
    } else {
      target = this.pos;
      yaw = this.camYaw;
      dist = this.camDist;
      height = 2.2 + this.camPitch * 4;
    }
    let cx = target.x + Math.sin(yaw) * dist;
    let cz = target.z + Math.cos(yaw) * dist;
    let cy = target.y + height;
    if (colliders) {
      // Pull the camera in before it clips through a building.
      const from = new THREE.Vector3(target.x, target.y + 1.6, target.z);
      const to = new THREE.Vector3(cx, cy, cz);
      const dir = to.clone().sub(from);
      for (let i = 1; i <= 12; i++) {
        const p = from.clone().addScaledVector(dir, i / 12);
        let inside = false;
        for (const b of colliders) {
          if (p.x > b.minX - 0.6 && p.x < b.maxX + 0.6 && p.z > b.minZ - 0.6 && p.z < b.maxZ + 0.6 && p.y < 70) {
            inside = true;
            break;
          }
        }
        if (inside) {
          const t = Math.max(0.18, (i - 1) / 12);
          const pulled = from.clone().addScaledVector(dir, t);
          cx = pulled.x; cy = pulled.y; cz = pulled.z;
          break;
        }
      }
    }
    const k = 1 - Math.exp(-dt * 10);
    cam.position.x += (cx - cam.position.x) * k;
    cam.position.y += (cy - cam.position.y) * k;
    cam.position.z += (cz - cam.position.z) * k;
    cam.lookAt(target.x, target.y + 1.6, target.z);
  }

  updateInCar(dt, input, mouse, car, colliders, others) {
    this.camYaw -= mouse.dx * 0.0032;
    const throttle = input.forwardAxis();
    const steer = -input.strafeAxis();
    const handbrake = input.down('Space');
    car.drive(dt, throttle, steer, handbrake, colliders, others);
    this.pos.copy(car.pos);
    this.mesh.visible = false;
    this._updateCamera(dt, car, colliders);
  }

  enterCar(car) {
    this.inCar = car;
    car.driver = 'player';
    this.mesh.visible = false;
    this.setWeapon(false);
  }

  exitCar() {
    if (!this.inCar) return;
    const car = this.inCar;
    car.driver = null;
    car.speed = 0;
    this.inCar = null;
    // Step out to the left of the car.
    const f = car.forward();
    this.pos.set(car.pos.x - f.z * 2.4, 0, car.pos.z + f.x * 2.4);
    this.mesh.visible = true;
    this.heading = car.heading;
  }

  damage(amount) {
    let remaining = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, remaining * 0.6);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    if (this.health < 0) this.health = 0;
  }

  heal(amount) { this.health = Math.min(100, this.health + amount); }

  respawn(x, z) {
    this.pos.set(x, 0, z);
    this.health = 100;
    this.armor = 0;
    this.ammo = this.magSize;
    if (this.inCar) this.exitCar();
    this.mesh.visible = true;
  }
}
