// Port Meridian — police.js
// Wanted level 0-5 stars. Police cars spawn at 1+ stars and pursue
// the player, ramming on contact and rubber-banding (faster when far,
// easing when near). Foot cops spawn at higher stars; at 3+ stars
// they shoot, and touching the player on foot busts them ("BUSTED").
// Wanted decays slowly when no cop is near — hiding works, which is
// how mission 3 ("Lose the Tail") is won.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, clamp, dist2, angDiff, headingVec } from './config.js';
import { makeCarMesh } from './vehicles.js';
import { resolveCircle } from './world.js';

function makeCopMesh() {
  const g = new THREE.Group();
  const body = new THREE.MeshLambertMaterial({ color: 0x1a1d24 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc89878 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.85, 4, 8), body);
  torso.position.y = 1.1;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), skin);
  head.position.y = 2.0;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), new THREE.MeshLambertMaterial({ color: 0x101318 }));
  cap.position.y = 2.22;
  g.add(cap);
  for (const sx of [-0.17, 0.17]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.72, 0.24), body);
    leg.position.set(sx, 0.36, 0);
    g.add(leg);
  }
  return g;
}

export class Police {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.wanted = 0;
    this.copCars = [];
    this.footCops = [];
    this.decayTimer = 0;
    this.shootTimer = 0;
    this.crimeCooldown = 0;
  }

  addWanted(n) {
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.decayTimer = 0;
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.decayTimer = 0;
  }

  copCarCount() {
    return this.copCars.length;
  }

  nearestCopDist(x, z) {
    let best = Infinity;
    for (const c of this.copCars) best = Math.min(best, dist2(x, z, c.x, c.z));
    for (const c of this.footCops) best = Math.min(best, dist2(x, z, c.x, c.z));
    return best;
  }

  _spawnCopCar(px, pz) {
    const mesh = makeCarMesh(0x1a1d24, false);
    // White doors read as a police car at a glance.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(2.02, 0.5, 1.6),
      new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }),
    );
    door.position.y = 0.75;
    mesh.add(door);
    const light = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    light.position.y = 1.85;
    mesh.add(light);
    this.scene.add(mesh);
    // Spawn on a nearby road, ~60u away from the player.
    const angle = Math.random() * Math.PI * 2;
    const x = clamp(px + Math.cos(angle) * 60, -130, 130);
    const z = clamp(pz + Math.sin(angle) * 60, -130, 130);
    const car = { x, z, heading: 0, speed: 0, mesh, light, flash: 0 };
    this.copCars.push(car);
    return car;
  }

  _spawnFootCop(px, pz) {
    const mesh = makeCopMesh();
    const angle = Math.random() * Math.PI * 2;
    const x = clamp(px + Math.cos(angle) * 25, -140, 140);
    const z = clamp(pz + Math.sin(angle) * 25, -140, 140);
    mesh.position.set(x, 0, z);
    this.scene.add(mesh);
    const cop = { x, z, heading: 0, mesh, phase: 0 };
    this.footCops.push(cop);
    return cop;
  }

  _removeCopCar(car) {
    this.scene.remove(car.mesh);
    this.copCars.splice(this.copCars.indexOf(car), 1);
  }

  _removeFootCop(cop) {
    this.scene.remove(cop.mesh);
    this.footCops.splice(this.footCops.indexOf(cop), 1);
  }

  clearAll() {
    for (const c of [...this.copCars]) this._removeCopCar(c);
    for (const c of [...this.footCops]) this._removeFootCop(c);
  }

  update(dt, ctx) {
    // ctx: { playerX, playerZ, inCar, playerSpeed, playerHeading,
    //        onBusted, onDamage, onShotFired }
    this.crimeCooldown = Math.max(0, this.crimeCooldown - dt);

    // Spawn / despawn to match the wanted level.
    const wantCars = this.wanted >= 1 ? Math.min(this.wanted, 4) : 0;
    while (this.copCars.length < wantCars) this._spawnCopCar(ctx.playerX, ctx.playerZ);
    while (this.copCars.length > wantCars) this._removeCopCar(this.copCars[this.copCars.length - 1]);
    const wantFoot = this.wanted >= 2 ? Math.min(this.wanted - 1, 3) : 0;
    while (this.footCops.length < wantFoot) this._spawnFootCop(ctx.playerX, ctx.playerZ);
    while (this.footCops.length > wantFoot) this._removeFootCop(this.footCops[this.footCops.length - 1]);

    // Wanted decay: when every cop is far away, one star fades.
    const nearest = this.nearestCopDist(ctx.playerX, ctx.playerZ);
    if (this.wanted > 0 && nearest > 55) {
      this.decayTimer += dt;
      if (this.decayTimer >= 6) {
        this.wanted -= 1;
        this.decayTimer = 0;
      }
    } else {
      this.decayTimer = 0;
    }

    // Cop cars pursue with rubber-banding: faster when far.
    for (const car of this.copCars) {
      const d = dist2(car.x, car.z, ctx.playerX, ctx.playerZ);
      const wantHeading = Math.atan2(ctx.playerX - car.x, ctx.playerZ - car.z);
      const turn = angDiff(wantHeading, car.heading);
      car.heading += clamp(turn, -2.4 * dt, 2.4 * dt);
      const targetSpeed = clamp(d * 0.55, 16, 38);
      car.speed += clamp(targetSpeed - car.speed, -30 * dt, 22 * dt);
      const v = headingVec(car.heading);
      const fixed = resolveCircle(car.x + v.x * car.speed * dt, car.z + v.z * car.speed * dt, 2.1, this.world);
      car.x = fixed.x;
      car.z = fixed.z;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      car.flash += dt;
      car.light.material.color.setHex(Math.floor(car.flash * 2) % 2 === 0 ? 0xff2222 : 0x2244ff);
      // Ram: shove the player's car and hurt the player on foot.
      if (d < 4.5) {
        if (ctx.inCar && ctx.onRam) ctx.onRam(car);
        else if (!ctx.inCar && ctx.onDamage) ctx.onDamage(8 * dt, 'ram');
      }
    }

    // Foot cops chase on foot; at 3+ stars they shoot; touching the
    // player on foot busts them.
    this.shootTimer -= dt;
    for (const cop of this.footCops) {
      const d = dist2(cop.x, cop.z, ctx.playerX, ctx.playerZ);
      if (!ctx.inCar && d < 2.2) {
        if (ctx.onBusted) ctx.onBusted();
        return;
      }
      const wantHeading = Math.atan2(ctx.playerX - cop.x, ctx.playerZ - cop.z);
      cop.heading += clamp(angDiff(wantHeading, cop.heading), -4 * dt, 4 * dt);
      const speed = ctx.inCar ? 0 : 7;
      const v = headingVec(cop.heading);
      const fixed = resolveCircle(cop.x + v.x * speed * dt, cop.z + v.z * speed * dt, 0.5, this.world);
      cop.x = fixed.x;
      cop.z = fixed.z;
      cop.phase += dt * speed * 2;
      cop.mesh.position.set(cop.x, Math.abs(Math.sin(cop.phase)) * 0.04, cop.z);
      cop.mesh.rotation.y = cop.heading;
      if (this.wanted >= 3 && !ctx.inCar && d < 32 && this.shootTimer <= 0) {
        this.shootTimer = 0.9;
        if (ctx.onDamage) ctx.onDamage(5, 'shot');
        if (ctx.onShotFired) ctx.onShotFired(cop.x, cop.z, ctx.playerX, ctx.playerZ);
      }
    }
  }
}
