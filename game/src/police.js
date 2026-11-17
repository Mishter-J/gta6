// police.js — the wanted system and the Meridian PD: wanted stars rise
// on crimes and decay while hidden; police cars spawn, pursue and ram
// with rubber-banding; foot cops chase at higher stars, shoot at 3+,
// and bust the player on foot ("BUSTED").

import * as THREE from 'three';
import { CONFIG, clamp, angleDiff, dist2D, mulberry32 } from './config.js';

export class PoliceManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.wanted = 0; // float 0..5; stars shown = floor
    this.lastCrimeAt = -99;
    this.copCars = [];
    this.footCops = [];
    this.bustTimer = 0;
    this.rng = mulberry32(CONFIG.seed + 33);
  }

  get stars() {
    return Math.floor(this.wanted + 0.0001);
  }

  addWanted(amount, reason) {
    if (this.ctx.state !== 'playing') return;
    this.wanted = clamp(this.wanted + amount, 0, CONFIG.wantedMax);
    this.lastCrimeAt = this.ctx.time;
    if (reason) this.ctx.hud.toast(`Wanted: ${reason}`);
    this.ctx.audio.setSiren(this.stars);
  }

  clearWanted() {
    this.wanted = 0;
    this.ctx.audio.setSiren(0);
  }

  update(dt) {
    if (this.ctx.state !== 'playing') return;
    // Decay: only when no crime recently AND no police close by.
    const p = this.ctx.player.pos;
    let policeNear = false;
    for (const c of this.copCars) {
      if (dist2D(c.x, c.z, p.x, p.z) < 45) { policeNear = true; break; }
    }
    if (!policeNear) {
      for (const c of this.footCops) {
        if (dist2D(c.x, c.z, p.x, p.z) < 30) { policeNear = true; break; }
      }
    }
    if (this.ctx.time - this.lastCrimeAt > CONFIG.wantedDecayDelay && !policeNear && this.wanted > 0) {
      this.wanted = Math.max(0, this.wanted - CONFIG.wantedDecayPerSec * dt);
      this.ctx.audio.setSiren(this.stars);
    }

    // Cop cars: one per star, up to 5.
    const wantCars = this.stars;
    while (this.copCars.length < wantCars) this._spawnCopCar();
    while (this.copCars.length > wantCars) {
      const car = this.copCars.pop();
      this.ctx.vehicles.removeCar(car);
    }
    for (const car of this.copCars) this._driveCopCar(car, dt);

    // Foot cops at 2+ stars, only a threat while the player is on foot.
    const wantCops = this.stars >= 2 && !this.ctx.player.driving ? this.stars - 1 : 0;
    while (this.footCops.length < wantCops) this._spawnFootCop();
    while (this.footCops.length > wantCops) {
      const cop = this.footCops.pop();
      this.ctx.scene.remove(cop.group);
    }
    for (const cop of [...this.footCops]) this._updateFootCop(cop, dt);

    // Busted: a foot cop holding contact with the on-foot player.
    if (this.footCops.length > 0 && !this.ctx.player.driving) {
      const near = this.footCops.some((c) => dist2D(c.x, c.z, p.x, p.z) < CONFIG.bustDistance);
      if (near) {
        this.bustTimer += dt;
        if (this.bustTimer > CONFIG.bustHoldSeconds) {
          this.bustTimer = 0;
          this.ctx.setState('busted');
        }
      } else {
        this.bustTimer = 0;
      }
    } else {
      this.bustTimer = 0;
    }
  }

  _spawnCopCar() {
    const p = this.ctx.player.pos;
    // Spawn on a road 55-80m away, roughly behind the player's view.
    const angle = this.rng() * Math.PI * 2;
    let x = p.x + Math.sin(angle) * 70;
    let z = p.z + Math.cos(angle) * 70;
    x = clamp(x, -CONFIG.cityHalf, CONFIG.cityHalf);
    z = clamp(z, -CONFIG.cityHalf, CONFIG.cityHalf);
    const car = this.ctx.vehicles.addCar({
      name: 'Interceptor',
      color: 0x1a1a22,
      isPolice: true,
      x,
      z,
      heading: Math.atan2(p.x - x, p.z - z),
      topSpeed: CONFIG.copCarTopSpeed,
    });
    car.health = 9999; // cop cars don't wreck from bumps; the player can still outrun them
    car.ramCooldown = 0; // seconds until this cop may ram again
    this.copCars.push(car);
    return car;
  }

  _driveCopCar(car, dt) {
    const p = this.ctx.player.pos;
    const d = dist2D(car.x, car.z, p.x, p.z);
    // Rubber-band: faster when far, eases off when close. A cop car
    // holds off a few metres from a player on foot (foot cops bust).
    const wantSpeed = this.ctx.player.driving
      ? clamp(10 + d * 0.35, 12, car.topSpeed)
      : (d < 7 ? 0 : clamp(10 + d * 0.35, 12, car.topSpeed));
    const wantHeading = Math.atan2(p.x - car.x, p.z - car.z);
    const dh = angleDiff(car.heading, wantHeading);
    car.heading += clamp(dh, -2.2 * dt, 2.2 * dt);
    car.speed += (wantSpeed - car.speed) * Math.min(1, dt * 1.2);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const before = { x: car.x, z: car.z };
    car._collide(nx, nz);
    const hitWall = car.x === before.x && car.z === before.z && car.speed > 3;
    if (hitWall) {
      // Stuck on a building: back up and swing around it.
      car.speed = -6;
      car.heading += Math.PI / 3;
    }
    // Ram: one 4-damage hit, then the cop falls back for 3 s instead
    // of grinding the player's car to a wreck in a single contact.
    // A cop car never runs the player down on foot: it holds off at
    // a few metres and lets the foot cops do the busting.
    car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
    const player = this.ctx.player;
    if (player.driving && player.car && dist2D(car.x, car.z, player.car.x, player.car.z) < 4.5) {
      if (car.speed > 6 && car.ramCooldown <= 0) {
        car.ramCooldown = 3;
        player.car.damage(4);
        car.speed = -8; // fall back after the hit
        if (player.car.wrecked) {
          player.exitCar();
          this.ctx.hud.toast('Your car is wrecked!');
        }
      }
    }
    car._syncMesh();
  }

  _spawnFootCop() {
    const p = this.ctx.player.pos;
    const angle = this.rng() * Math.PI * 2;
    const x = clamp(p.x + Math.sin(angle) * 26, -CONFIG.cityHalf, CONFIG.cityHalf);
    const z = clamp(p.z + Math.cos(angle) * 26, -CONFIG.cityHalf, CONFIG.cityHalf);
    const g = new THREE.Group();
    const navy = new THREE.MeshLambertMaterial({ color: 0x1a2a4a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89868 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), navy);
    legs.position.y = 0.35;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.75, 0.36), navy);
    torso.position.y = 1.08;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin);
    head.position.y = 1.68;
    g.add(head);
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0x0a1428 }));
    hat.position.y = 1.88;
    g.add(hat);
    g.position.set(x, 0, z);
    this.ctx.scene.add(g);
    const cop = { x, z, heading: 0, group: g, shootCooldown: 1 + this.rng() };
    this.footCops.push(cop);
    return cop;
  }

  _updateFootCop(cop, dt) {
    const p = this.ctx.player.pos;
    const d = dist2D(cop.x, cop.z, p.x, p.z);
    cop.heading = Math.atan2(p.x - cop.x, p.z - cop.z);
    const speed = d > 6 ? 6.5 : 4.2;
    const nx = cop.x + Math.sin(cop.heading) * speed * dt;
    const nz = cop.z + Math.cos(cop.heading) * speed * dt;
    const fixed = this.ctx.world.resolveCircle(nx, nz, 0.7);
    cop.x = fixed.x;
    cop.z = fixed.z;
    cop.group.position.set(cop.x, Math.abs(Math.sin(this.ctx.time * 9)) * 0.05, cop.z);
    cop.group.rotation.y = cop.heading;
    // At 3+ stars, foot cops shoot at the player — but only at
    // closer range and with a slower cadence, so a running player
    // can actually break away instead of being gunned down.
    cop.shootCooldown -= dt;
    if (this.stars >= 3 && d < 24 && cop.shootCooldown <= 0 && this.ctx.state === 'playing') {
      cop.shootCooldown = 2.2 + this.rng() * 1.5;
      this.ctx.combat.enemyShot(cop);
    }
  }
}
