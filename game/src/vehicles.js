// Port Meridian — cars: low-poly models, arcade driving physics, traffic AI.
// One Car class serves parked cars, traffic, the player's ride and police.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, WORLD, mulberry32 } from './config.js';

const CAR_COLORS = [0xc0392b, 0x2e6fb2, 0xe8c832, 0x7d8a99, 0x222831, 0xd8d8d8, 0x5a8a4a, 0xb06a2e, 0x6a4a8a, 0x2a9d8f];

/** Build a low-poly car mesh. opts: { color, police, taxi }. */
export function makeCarModel(opts = {}) {
  const group = new THREE.Group();
  const color = opts.police ? 0xf2f2f2 : (opts.color ?? 0xc0392b);
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14181f });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 4.4), bodyMat);
  body.position.y = 0.75;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 2.3), darkMat);
  cabin.position.set(0, 1.5, -0.25);
  group.add(cabin);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.18, 0.9), bodyMat);
  hood.position.set(0, 1.15, 2.0);
  group.add(hood);
  // Headlights / taillights
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.12), headMat);
    h.position.set(x, 0.8, 2.22);
    group.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a22 });
  for (const x of [-0.7, 0.7]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.12), tailMat);
    t.position.set(x, 0.8, -2.22);
    group.add(t);
  }
  // Wheels (axle along X, the car's lateral axis)
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.32, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[0.95, 1.45], [-0.95, 1.45], [0.95, -1.45], [-0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.position.set(wx, 0.42, wz);
    group.add(w);
    wheels.push(w);
  }
  // Blob shadow
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(2.6, 5.0),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  let lightBar = null;
  if (opts.police) {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.x = 0.42;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.x = -0.42;
    bar.add(red);
    bar.add(blue);
    bar.position.set(0, 1.98, -0.25);
    group.add(bar);
    lightBar = { red, blue, phase: Math.random() * 10 };
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.28, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xffd23e })
    );
    sign.position.set(0, 2.05, -0.25);
    group.add(sign);
  }
  group.userData.wheels = wheels;
  group.userData.lightBar = lightBar;
  return group;
}

/** Circle vs building AABB: push the circle out, report whether it hit. */
export function collideCircle(pos, radius, colliders) {
  let hit = false;
  for (const b of colliders) {
    const cx = THREE.MathUtils.clamp(pos.x, b.minX, b.maxX);
    const cz = THREE.MathUtils.clamp(pos.z, b.minZ, b.maxZ);
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the smallest penetration axis.
        const pl = pos.x - b.minX, pr = b.maxX - pos.x;
        const pt = pos.z - b.minZ, pb = b.maxZ - pos.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) pos.x = b.minX - radius;
        else if (m === pr) pos.x = b.maxX + radius;
        else if (m === pt) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }
  return hit;
}

export class Car {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.mesh = makeCarModel(opts);
    this.mesh.position.set(opts.x ?? 0, 0, opts.z ?? 0);
    this.heading = opts.heading ?? 0;
    this.speed = 0;
    this.steer = 0;
    this.radius = 2.3;
    this.police = !!opts.police;
    this.taxi = !!opts.taxi;
    this.missionCar = !!opts.missionCar;
    this.driver = opts.driver ?? null; // 'player' | 'ai' | null (parked)
    this.health = 100;
    this.dead = false;
    this.waypoints = opts.waypoints ?? null;
    this.wpIndex = 0;
    this.cruiseSpeed = opts.cruiseSpeed ?? 11;
    this.waitTimer = 0;
    this.smokeTimer = 0;
    this.onCrash = null;
    scene.add(this.mesh);
    this._syncMesh();
  }

  get pos() { return this.mesh.position; }

  forward() { return { x: Math.sin(this.heading), z: Math.cos(this.heading) }; }

  _syncMesh() {
    this.mesh.rotation.y = this.heading;
    // Spin the wheels by distance travelled (axle = local X after geometry rotate).
    const wheels = this.mesh.userData.wheels;
    this.wheelAngle = (this.wheelAngle ?? 0) + (this.speed * 0.016) / 0.42;
    for (const w of wheels) w.rotation.x = this.wheelAngle;
  }

  /** Player driving: throttle -1..1, steer -1..1, handbrake bool. */
  drive(dt, throttle, steerInput, handbrake, colliders, others) {
    if (this.dead) return;
    const targetSteer = steerInput * 0.55 * (this.speed >= 0 ? 1 : -1);
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (throttle > 0) this.speed += WORLD.carAccel * throttle * dt;
    else if (throttle < 0) {
      if (this.speed > 0.5) this.speed -= WORLD.carBrake * dt;
      else this.speed -= WORLD.carAccel * 0.55 * dt; // reverse
    } else {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
    }
    if (handbrake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 22 * dt);
    }
    this.speed = THREE.MathUtils.clamp(this.speed, -WORLD.carReverseSpeed, WORLD.carTopSpeed);
    const grip = handbrake ? 0.55 : 1;
    this.heading += this.steer * (this.speed / 8) * dt * grip * (this.speed >= 0 ? 1 : -1);
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this._collide(dt, colliders, others);
    this._syncMesh();
    this._updateLights(dt);
  }

  /** Traffic AI: follow waypoints, stop for cars ahead. */
  driveAI(dt, colliders, others) {
    if (this.dead || !this.waypoints) return;
    if (this.waitTimer > 0) { this.waitTimer -= dt; this.speed = 0; this._syncMesh(); return; }
    const wp = this.waypoints[this.wpIndex];
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 4) { this.wpIndex = (this.wpIndex + 1) % this.waypoints.length; return; }
    const targetHeading = Math.atan2(dx, dz);
    let dh = targetHeading - this.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const steer = THREE.MathUtils.clamp(dh * 1.6, -1, 1);
    // Stop if another car is close ahead.
    let blocked = false;
    for (const o of others) {
      if (o === this || o.dead) continue;
      const ox = o.pos.x - this.pos.x, oz = o.pos.z - this.pos.z;
      const od = Math.hypot(ox, oz);
      if (od < 10) {
        const f = this.forward();
        const ahead = (ox * f.x + oz * f.z) / Math.max(od, 0.01);
        if (ahead > 0.6) { blocked = true; break; }
      }
    }
    const throttle = blocked ? 0 : 1;
    this.speed += ((blocked ? 0 : this.cruiseSpeed) - this.speed) * Math.min(1, dt * 1.5);
    this.heading += steer * (this.speed / 9) * dt;
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this._collide(dt, colliders, others, true);
    this._syncMesh();
    this._updateLights(dt);
  }

  _collide(dt, colliders, others, gentle = false) {
    const hitWall = collideCircle(this.pos, this.radius, colliders);
    if (hitWall) {
      const impact = Math.abs(this.speed);
      if (impact > 6 && this.onCrash) this.onCrash(impact / WORLD.carTopSpeed);
      this.speed *= 0.45;
    }
    for (const o of others) {
      if (o === this || o.dead) continue;
      const dx = this.pos.x - o.pos.x, dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius - 0.3;
      if (d < min && d > 0.001) {
        const push = (min - d) / 2;
        const nx = dx / d, nz = dz / d;
        this.pos.x += nx * push; this.pos.z += nz * push;
        o.pos.x -= nx * push; o.pos.z -= nz * push;
        const impact = Math.abs(this.speed - o.speed);
        if (impact > 5 && this.onCrash) this.onCrash(Math.min(1, impact / 20));
        this.speed *= 0.7;
        o.speed *= 0.7;
      }
    }
    // Keep inside the drivable area (city + beach road).
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -20, CITY.size + 20);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -20, CITY.size + 55);
    void dt; void gentle;
  }

  _updateLights(dt) {
    const bar = this.mesh.userData.lightBar;
    if (!bar) return;
    bar.phase += dt * 9;
    const on = Math.sin(bar.phase) > 0;
    bar.red.material.color.setHex(on ? 0xff2020 : 0x550000);
    bar.blue.material.color.setHex(on ? 0x220066 : 0x2040ff);
  }

  damage(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.speed = 0;
      this.mesh.rotation.z = 0.12; // wreck tilt
    }
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}

/** Traffic: cars looping the blocks, plus parked cars to steal. */
export class TrafficManager {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.cars = [];
    this.rng = mulberry32(CITY.seed + 7);
  }

  spawnAll() {
    // Traffic loops: rectangles around random blocks.
    for (let i = 0; i < WORLD.trafficCount; i++) {
      const bi = 1 + Math.floor(this.rng() * (CITY.blocks - 1));
      const bj = 1 + Math.floor(this.rng() * (CITY.blocks - 1));
      const x0 = bi * CITY.pitch, z0 = bj * CITY.pitch;
      const x1 = (bi + 1) * CITY.pitch, z1 = (bj + 1) * CITY.pitch;
      const cw = this.rng() < 0.5;
      const wps = cw
        ? [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]
        : [{ x: x0, z: z0 }, { x: x0, z: z1 }, { x: x1, z: z1 }, { x: x1, z: z0 }];
      const start = wps[Math.floor(this.rng() * 4)];
      const car = new Car(this.scene, {
        x: start.x + (this.rng() - 0.5) * 6,
        z: start.z + (this.rng() - 0.5) * 6,
        heading: this.rng() * Math.PI * 2,
        color: CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)],
        driver: 'ai',
        waypoints: wps,
        cruiseSpeed: 9 + this.rng() * 5,
      });
      this.cars.push(car);
    }
    // Parked cars along road edges (stealable).
    for (let i = 0; i < 12; i++) {
      const inter = this.world.intersections[Math.floor(this.rng() * this.world.intersections.length)];
      const alongRoad = this.rng() < 0.5;
      const off = (this.rng() - 0.5) * 30;
      const car = new Car(this.scene, {
        x: inter.x + (alongRoad ? off : (this.rng() < 0.5 ? 5.5 : -5.5)),
        z: inter.z + (alongRoad ? (this.rng() < 0.5 ? 5.5 : -5.5) : off),
        heading: alongRoad ? (this.rng() < 0.5 ? 0 : Math.PI) : (this.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        color: CAR_COLORS[Math.floor(this.rng() * CAR_COLORS.length)],
        driver: null,
      });
      this.cars.push(car);
    }
    return this.cars;
  }

  /** Spawn any car (used by screenshot staging and missions). */
  spawnCar(x, z, heading, color) {
    const car = new Car(this.scene, { x, z, heading, color: color ?? 0xc0392b, driver: null });
    this.cars.push(car);
    return car;
  }

  /** The red Comet for mission 1, parked outside Mara's garage. */
  spawnMissionCar(x, z, heading) {
    const car = new Car(this.scene, {
      x, z, heading, color: 0xc0392b, driver: null, missionCar: true,
    });
    this.cars.push(car);
    return car;
  }

  update(dt, colliders) {
    for (const car of this.cars) {
      if (car.driver === 'ai') car.driveAI(dt, colliders, this.cars);
    }
  }

  nearestCar(x, z, maxDist, predicate = null) {
    let best = null, bestD = maxDist;
    for (const car of this.cars) {
      if (car.dead) continue;
      if (predicate && !predicate(car)) continue;
      const d = Math.hypot(car.pos.x - x, car.pos.z - z);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }
}
