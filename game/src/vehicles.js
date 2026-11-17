// vehicles.js — Port Meridian cars: the red sports car "Comet", parked
// cars to steal, AI traffic driving the road grid, arcade physics with
// building collision, damage and wreck smoke.

import * as THREE from 'three';
import { CONFIG, clamp, mulberry32, pick, roadLines, dist2D } from './config.js';

const CAR_COLORS = [0xc0c0c8, 0x2a4a7a, 0x7a2a2a, 0x2a7a4a, 0xd8b13a, 0x8a8a92, 0x3a3a42, 0xe8e0d0];
const CAR_NAMES = ['Vento', 'Kestrel', 'Bison', 'Marlin', 'Pinto', 'Falcon', 'Dune', 'Sable'];

export class Vehicle {
  constructor(ctx, opts) {
    this.ctx = ctx;
    this.name = opts.name || 'car';
    this.color = opts.color;
    this.isComet = !!opts.isComet;
    this.isPolice = !!opts.isPolice;
    this.x = opts.x;
    this.z = opts.z;
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.topSpeed = opts.topSpeed || CONFIG.carTopSpeed;
    this.health = CONFIG.carHealth;
    this.wrecked = false;
    this.traffic = !!opts.traffic; // AI-driven
    this.parked = !!opts.parked;
    this.steer = 0;
    this.smoking = false;
    this.smokeTimer = 0;
    this.routeAxis = 'x';
    this.routeDir = 1;
    this.routeLine = opts.z;
    this.group = this._buildMesh();
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    ctx.scene.add(this.group);
  }

  _buildMesh() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: this.color });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x181a1e });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x9ac8e8 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.75, 4.4), bodyMat);
    body.position.y = 0.65;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.65, 2.2), glassMat);
    cabin.position.set(0, 1.3, -0.2);
    g.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(wx, 0.42, wz);
      g.add(w);
    }
    // Headlights + taillights.
    const lightGeo = new THREE.BoxGeometry(0.4, 0.2, 0.1);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const sx of [-0.6, 0.6]) {
      const h = new THREE.Mesh(lightGeo, headMat);
      h.position.set(sx, 0.7, 2.21);
      g.add(h);
      const t = new THREE.Mesh(lightGeo, tailMat);
      t.position.set(sx, 0.7, -2.21);
      g.add(t);
    }
    if (this.isPolice) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.25, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x2244ff }),
      );
      bar.position.set(0, 1.75, -0.2);
      g.add(bar);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(2.02, 0.3, 4.42),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      stripe.position.y = 0.66;
      g.add(stripe);
    }
    if (this.isComet) {
      const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 0.4), darkMat);
      spoiler.position.set(0, 1.15, -2.1);
      g.add(spoiler);
    }
    // Wreck smoke: a dark sphere that grows when the car is wrecked.
    this.smoke = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x333333, transparent: true, opacity: 0.0 }),
    );
    this.smoke.position.y = 1.6;
    g.add(this.smoke);
    return g;
  }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  // Arcade driving step. throttle -1..1, steer -1..1 (positive = right).
  drive(dt, throttle, steer) {
    if (this.wrecked) return;
    const fwd = this.forward();
    const targetAccel = throttle * CONFIG.carAccel;
    this.speed += targetAccel * dt;
    // Drag + rolling resistance.
    this.speed -= this.speed * CONFIG.carDrag * dt;
    if (Math.abs(throttle) < 0.05 && Math.abs(this.speed) < 0.4) this.speed = 0;
    this.speed = clamp(this.speed, -CONFIG.carTopSpeed * 0.45, this.topSpeed);
    // Steering scales with speed and fades at a standstill.
    const steerAuthority = clamp(Math.abs(this.speed) / 8, 0, 1);
    this.heading += steer * CONFIG.carTurnRate * steerAuthority * dt * Math.sign(this.speed || 1);
    const ox = this.x;
    const oz = this.z;
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.z + Math.cos(this.heading) * this.speed * dt;
    const hit = this._collide(nx, nz);
    if (hit) {
      // A clean slide along the wall keeps its speed; only a dead stop
      // against a wall counts as a crash, and a glancing one costs
      // little — the car must survive the trip to Mara's garage.
      const moved = Math.hypot(this.x - ox, this.z - oz);
      const intended = Math.abs(this.speed) * dt || 0.001;
      if (moved < intended * 0.5) {
        const impact = Math.abs(this.speed);
        if (impact > 12) {
          this.damage((impact - 12) * 0.5);
          this.ctx.audio.crash();
          this.ctx.hud.toast('Crash!');
        }
        this.speed *= 0.5;
      }
    }
    this._syncMesh();
    if (this.smoking) {
      this.smokeTimer += dt;
      this.smoke.material.opacity = 0.25 + 0.2 * Math.sin(this.smokeTimer * 9);
      this.smoke.scale.setScalar(1 + 0.4 * Math.sin(this.smokeTimer * 5));
    }
  }

  // Returns true when a building was hit; position is corrected.
  // Wall slide: when the full step is blocked, try each axis alone so
  // the car glides along the wall instead of wedging on its corner.
  _collide(nx, nz) {
    const world = this.ctx.world;
    const full = world.resolveCircle(nx, nz, 2.1);
    const hit = full.x !== nx || full.z !== nz;
    if (!hit) {
      this.x = nx;
      this.z = nz;
    } else {
      const xTry = world.resolveCircle(nx, this.z, 2.1);
      const zTry = world.resolveCircle(this.x, nz, 2.1);
      const xProg = Math.abs(xTry.x - this.x) + Math.abs(xTry.z - this.z);
      const zProg = Math.abs(zTry.x - this.x) + Math.abs(zTry.z - this.z);
      if (xProg >= zProg) { this.x = xTry.x; this.z = xTry.z; }
      else { this.x = zTry.x; this.z = zTry.z; }
    }
    // Keep cars inside the world bounds (beach is drivable, water is not).
    const b = CONFIG.worldBound;
    this.x = clamp(this.x, -b, CONFIG.waterStart - 4);
    this.z = clamp(this.z, -b, b);
    return hit;
  }

  damage(amount) {
    if (this.wrecked) return;
    this.health -= amount;
    if (this.health <= 30 && !this.smoking) this.smoking = true;
    if (this.health <= 0) {
      this.wrecked = true;
      this.speed = 0;
      this.smoking = true;
      this.smoke.material.opacity = 0.6;
    }
  }

  repair() {
    this.health = CONFIG.carHealth;
    this.wrecked = false;
    this.smoking = false;
    this.smoke.material.opacity = 0;
  }

  _syncMesh() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
  }

  remove() {
    this.ctx.scene.remove(this.group);
  }
}

export class VehicleManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.vehicles = [];
    this.comet = null;
    this.rng = mulberry32(CONFIG.seed + 7);
  }

  build() {
    const rng = this.rng;
    const lines = roadLines();
    // The red sports car "Comet" — mission 1's target, parked by the plaza.
    this.comet = this.addCar({
      name: 'Comet',
      color: 0xd21f2b,
      isComet: true,
      parked: true,
      x: 52,
      z: 36,
      heading: Math.PI / 2,
      topSpeed: 36,
    });
    // Parked cars scattered on roadsides.
    for (let i = 0; i < 10; i++) {
      const horizontal = rng() > 0.5;
      const line = pick(rng, lines);
      const along = -260 + rng() * 520;
      const lane = (rng() > 0.5 ? 1 : -1) * (CONFIG.roadWidth / 2 + 2.5);
      this.addCar({
        name: pick(rng, CAR_NAMES),
        color: pick(rng, CAR_COLORS),
        parked: true,
        x: horizontal ? along : line + lane,
        z: horizontal ? line + lane : along,
        heading: horizontal ? (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2) : rng() > 0.5 ? 0 : Math.PI,
      });
    }
    // Traffic: AI cars already rolling on the roads.
    for (let i = 0; i < 12; i++) {
      const horizontal = rng() > 0.5;
      const line = pick(rng, lines);
      const along = -260 + rng() * 520;
      const car = this.addCar({
        name: pick(rng, CAR_NAMES),
        color: pick(rng, CAR_COLORS),
        traffic: true,
        x: horizontal ? along : line,
        z: horizontal ? line : along,
        heading: horizontal ? (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2) : rng() > 0.5 ? 0 : Math.PI,
        topSpeed: 12 + rng() * 6,
      });
      car.routeAxis = horizontal ? 'x' : 'z';
      car.routeDir = rng() > 0.5 ? 1 : -1;
      car.routeLine = line;
    }
  }

  addCar(opts) {
    const car = new Vehicle(this.ctx, opts);
    this.vehicles.push(car);
    return car;
  }

  removeCar(car) {
    car.remove();
    this.vehicles = this.vehicles.filter((v) => v !== car);
  }

  // Nearest drivable (not wrecked) car within `maxDist` of (x, z).
  nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const v of this.vehicles) {
      if (v.wrecked) continue;
      const d = dist2D(x, z, v.x, v.z);
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  update(dt) {
    for (const v of this.vehicles) {
      if (v.traffic && !v.wrecked) this._driveTraffic(v, dt);
    }
    // Soft car-vs-car separation (cheap circle push).
    for (let i = 0; i < this.vehicles.length; i++) {
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const a = this.vehicles[i];
        const b = this.vehicles[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 16 && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const push = (4 - d) / 2;
          const px = (dx / d) * push;
          const pz = (dz / d) * push;
          if (!a.traffic || a === this.ctx.player.car) { a.x -= px; a.z -= pz; }
          if (!b.traffic || b === this.ctx.player.car) { b.x += px; b.z += pz; }
          a._syncMesh();
          b._syncMesh();
        }
      }
    }
  }

  _driveTraffic(car, dt) {
    // Follow the current road line; at intersections, sometimes turn.
    const lines = roadLines();
    const speedTarget = car.topSpeed * 0.8;
    const fwd = car.forward();
    // Lane offset: keep right.
    let tx = car.x;
    let tz = car.z;
    if (car.routeAxis === 'x') {
      tz = car.routeLine + 3.5 * car.routeDir;
      tx = car.x + car.routeDir * speedTarget * dt * 2;
    } else {
      tx = car.routeLine + 3.5 * car.routeDir;
      tz = car.z + car.routeDir * speedTarget * dt * 2;
    }
    // Steer toward the lane: blend heading toward the route direction.
    const wantHeading = car.routeAxis === 'x'
      ? (car.routeDir > 0 ? Math.PI / 2 : -Math.PI / 2)
      : (car.routeDir > 0 ? 0 : Math.PI);
    let dh = wantHeading - car.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    car.heading += THREE.MathUtils.clamp(dh, -1.2 * dt, 1.2 * dt);
    // Slow for the player / other cars ahead.
    const aheadX = car.x + fwd.x * 10;
    const aheadZ = car.z + fwd.z * 10;
    let blocked = false;
    const player = this.ctx.player;
    if (player && dist2D(aheadX, aheadZ, player.x, player.z) < 5) blocked = true;
    for (const v of this.vehicles) {
      if (v !== car && dist2D(aheadX, aheadZ, v.x, v.z) < 5) { blocked = true; break; }
    }
    const target = blocked ? 0 : speedTarget;
    car.speed += (target - car.speed) * Math.min(1, dt * 1.5);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    // Stay on the road: if the next step leaves the road grid, turn around.
    const onRoad = (x, z) => {
      for (const l of lines) {
        if (Math.abs(x - l) < CONFIG.roadWidth / 2 + 1 || Math.abs(z - l) < CONFIG.roadWidth / 2 + 1) return true;
      }
      return false;
    };
    if (!onRoad(nx, nz) && Math.abs(nx) < CONFIG.cityHalf && Math.abs(nz) < CONFIG.cityHalf) {
      // Reached a block corner: maybe turn onto the crossing road.
      if (this.rng() < 0.5) {
        car.routeAxis = car.routeAxis === 'x' ? 'z' : 'x';
        car.routeDir = this.rng() > 0.5 ? 1 : -1;
        car.routeLine = car.routeAxis === 'x' ? car.z : car.x;
      } else {
        car.routeDir *= -1;
      }
    }
    car.x = THREE.MathUtils.clamp(nx, -CONFIG.cityHalf, CONFIG.cityHalf);
    car.z = THREE.MathUtils.clamp(nz, -CONFIG.cityHalf, CONFIG.cityHalf);
    const hit = car._collide(car.x, car.z);
    if (hit) car.speed *= 0.4;
    car._syncMesh();
  }
}
