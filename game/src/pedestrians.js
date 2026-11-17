// pedestrians.js — Port Meridian walkers: they stroll the sidewalks
// between waypoints, flee from gunfire and from the player's car, and
// can be hit (a crime). One marked walker offers the taxi side activity.

import * as THREE from 'three';
import { CONFIG, mulberry32, pick, roadLines, dist2D } from './config.js';

const SHIRT_COLORS = [0x4a7a9a, 0x9a4a4a, 0x4a9a5a, 0xd8a03a, 0x7a4a9a, 0x3a3a3a, 0xe8e8e8];

export class Pedestrian {
  constructor(ctx, opts) {
    this.ctx = ctx;
    this.x = opts.x;
    this.z = opts.z;
    this.heading = opts.heading || 0;
    this.speed = 1.2 + ctx.rng() * 0.9;
    this.isViper = !!opts.isViper; // gang shooter (mission 4)
    this.health = this.isViper ? 100 : 50;
    this.alive = true;
    this.fleeing = false;
    this.fleeTimer = 0;
    this.target = this._pickWaypoint();
    this.shootCooldown = 0;
    this.isTaxi = !!opts.isTaxi;
    this.group = this._buildMesh();
    this.group.position.set(this.x, 0, this.z);
    ctx.scene.add(this.group);
  }

  _buildMesh() {
    const g = new THREE.Group();
    const shirt = new THREE.MeshLambertMaterial({
      color: this.isViper ? 0x1a1a1a : pick(this.ctx.rng, SHIRT_COLORS),
    });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2a2a34 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xc89868 });
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), pants);
    legs.position.y = 0.35;
    g.add(legs);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.75, 0.36), shirt);
    torso.position.y = 1.08;
    g.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), skin);
    head.position.y = 1.68;
    g.add(head);
    if (this.isViper) {
      // Vipers carry a visible gun and a red bandana.
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.7), new THREE.MeshLambertMaterial({ color: 0x111111 }));
      gun.position.set(0.4, 1.1, 0.3);
      g.add(gun);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.48), new THREE.MeshLambertMaterial({ color: 0xcc2222 }));
      band.position.y = 1.78;
      g.add(band);
    }
    if (this.isTaxi) {
      // Taxi customer waves: a floating yellow marker.
      const marker = new THREE.Mesh(
        new THREE.ConeGeometry(0.4, 0.9, 6),
        new THREE.MeshBasicMaterial({ color: 0xffd21f }),
      );
      marker.position.y = 2.6;
      marker.rotation.x = Math.PI;
      g.add(marker);
      this.taxiMarker = marker;
    }
    return g;
  }

  _pickWaypoint() {
    const lines = roadLines();
    const line = pick(this.ctx.rng, lines);
    const along = -260 + this.ctx.rng() * 520;
    const side = this.ctx.rng() > 0.5 ? 1 : -1;
    if (this.ctx.rng() > 0.5) return { x: along, z: line + side * (CONFIG.roadWidth / 2 + 2.5) };
    return { x: line + side * (CONFIG.roadWidth / 2 + 2.5), z: along };
  }

  fleeFrom(x, z) {
    if (!this.alive || this.isViper) return;
    this.fleeing = true;
    this.fleeTimer = 3 + this.ctx.rng() * 2;
    // Run directly away from the threat.
    const dx = this.x - x;
    const dz = this.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.target = { x: this.x + (dx / d) * 40, z: this.z + (dz / d) * 40 };
  }

  hitByCar(car) {
    if (!this.alive) return;
    this.alive = false;
    // Knocked down: fall over and fade out.
    this.group.rotation.x = -Math.PI / 2;
    this.group.position.y = 0.4;
    setTimeout(() => this._despawn(), 4000);
  }

  damage(amount, fromX, fromZ) {
    if (!this.alive) return false;
    this.health -= amount;
    if (this.health <= 0) {
      this.alive = false;
      this.group.rotation.x = -Math.PI / 2;
      this.group.position.y = 0.4;
      setTimeout(() => this._despawn(), 4000);
      return true; // killed
    }
    this.fleeFrom(fromX, fromZ);
    return false;
  }

  _despawn() {
    this.ctx.scene.remove(this.group);
    this.ctx.pedestrians.list = this.ctx.pedestrians.list.filter((p) => p !== this);
  }

  update(dt) {
    if (!this.alive) return;
    if (this.fleeing) {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) {
        this.fleeing = false;
        this.target = this._pickWaypoint();
      }
    }
    // Vipers hold their ground and shoot at the player instead of walking.
    if (this.isViper) {
      const p = this.ctx.player.pos;
      const d = dist2D(this.x, this.z, p.x, p.z);
      this.heading = Math.atan2(p.x - this.x, p.z - this.z);
      this.shootCooldown -= dt;
      if (d < 42 && this.shootCooldown <= 0 && this.ctx.state === 'playing') {
        this.shootCooldown = 1.1 + this.ctx.rng() * 0.9;
        this.ctx.combat.enemyShot(this);
      }
      this.group.rotation.y = this.heading;
      return;
    }
    const speed = this.fleeing ? 5.5 : this.speed;
    const dx = this.target.x - this.x;
    const dz = this.target.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 2) {
      this.target = this._pickWaypoint();
      return;
    }
    this.heading = Math.atan2(dx, dz);
    const nx = this.x + (dx / d) * speed * dt;
    const nz = this.z + (dz / d) * speed * dt;
    const fixed = this.ctx.world.resolveCircle(nx, nz, 0.7);
    this.x = fixed.x;
    this.z = fixed.z;
    this.group.position.set(this.x, Math.abs(Math.sin(this.ctx.time * 8)) * 0.05, this.z);
    this.group.rotation.y = this.heading;
    if (this.taxiMarker) {
      this.taxiMarker.position.y = 2.6 + Math.sin(this.ctx.time * 5) * 0.25;
    }
  }
}

export class PedestrianManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
    this.rng = mulberry32(CONFIG.seed + 21);
  }

  build() {
    for (let i = 0; i < 24; i++) this.spawnWalker();
  }

  spawnWalker() {
    const lines = roadLines();
    const line = pick(this.rng, lines);
    const along = -260 + this.rng() * 520;
    const side = this.rng() > 0.5 ? 1 : -1;
    const ped = new Pedestrian(this.ctx, {
      x: this.rng() > 0.5 ? along : line + side * (CONFIG.roadWidth / 2 + 2.5),
      z: this.rng() > 0.5 ? line + side * (CONFIG.roadWidth / 2 + 2.5) : along,
    });
    this.list.push(ped);
    return ped;
  }

  spawnViper(x, z) {
    const ped = new Pedestrian(this.ctx, { x, z, isViper: true });
    this.list.push(ped);
    return ped;
  }

  spawnTaxiCustomer(x, z) {
    const ped = new Pedestrian(this.ctx, { x, z, isTaxi: true });
    this.list.push(ped);
    return ped;
  }

  // Everyone in earshot runs from a gunshot.
  scareAll(x, z, radius = 45) {
    for (const p of this.list) {
      if (dist2D(x, z, p.x, p.z) < radius) p.fleeFrom(x, z);
    }
  }

  vipersAlive() {
    return this.list.filter((p) => p.isViper && p.alive).length;
  }

  update(dt) {
    for (const p of [...this.list]) p.update(dt);
    // Top the crowd back up.
    const walkers = this.list.filter((p) => !p.isViper && p.alive).length;
    if (walkers < 20 && this.ctx.state === 'playing') this.spawnWalker();
  }
}
