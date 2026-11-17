// Port Meridian — combat: hitscan pistol fire with tracers and muzzle
// flash, enemy shooters, damage numbers on cars, and a small particle
// pool for impacts, smoke and wrecks.

import * as THREE from '../vendor/three.module.min.js';

function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,220,140,0.7)');
  grad.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.tracers = [];
    this.particles = [];
    this.dotTex = makeDotTexture();
    this.flash = new THREE.PointLight(0xffc860, 0, 18);
    this.scene.add(this.flash);
    // Particle pool (sprites).
    for (let i = 0; i < 60; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.dotTex, transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      s.userData = { life: 0, maxLife: 1, vel: new THREE.Vector3() };
      scene.add(s);
      this.particles.push(s);
    }
    this.pIndex = 0;
  }

  muzzle(fromPos, dir) {
    this.flash.position.copy(fromPos).addScaledVector(dir, 1.2);
    this.flash.position.y += 1.4;
    this.flash.intensity = 60;
    this.spawnBurst(fromPos.clone().addScaledVector(dir, 1.4).setY(fromPos.y + 1.4), 4, 0xffc860, 3, 0.25);
  }

  tracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  spawnBurst(pos, count, color, speed, life) {
    for (let i = 0; i < count; i++) {
      const s = this.particles[this.pIndex];
      this.pIndex = (this.pIndex + 1) % this.particles.length;
      s.visible = true;
      s.position.copy(pos);
      s.material.color.setHex(color);
      s.material.opacity = 0.9;
      s.scale.setScalar(0.6 + Math.random() * 0.8);
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * speed;
      s.userData.vel.set(Math.cos(a) * speed, up, Math.sin(a) * speed);
      s.userData.life = life;
      s.userData.maxLife = life;
    }
  }

  smoke(pos, count = 3) {
    for (let i = 0; i < count; i++) {
      const s = this.particles[this.pIndex];
      this.pIndex = (this.pIndex + 1) % this.particles.length;
      s.visible = true;
      s.position.set(pos.x + (Math.random() - 0.5), pos.y + 0.5 + Math.random(), pos.z + (Math.random() - 0.5));
      s.material.color.setHex(0x555555);
      s.material.opacity = 0.55;
      s.scale.setScalar(1.2 + Math.random());
      s.userData.vel.set(0, 1.5 + Math.random(), 0);
      s.userData.life = 1.2;
      s.userData.maxLife = 1.2;
    }
  }

  update(dt) {
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 500);
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => {
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); return false; }
      return true;
    });
    for (const s of this.particles) {
      if (!s.visible) continue;
      const u = s.userData;
      u.life -= dt;
      if (u.life <= 0) { s.visible = false; s.material.opacity = 0; continue; }
      s.position.addScaledVector(u.vel, dt);
      u.vel.y -= 2 * dt;
      s.material.opacity = 0.9 * (u.life / u.maxLife);
      s.scale.multiplyScalar(1 + dt * 1.5);
    }
  }
}

export class Combat {
  constructor(scene, effects, audio) {
    this.scene = scene;
    this.effects = effects;
    this.audio = audio;
    this.enemies = []; // rival shooters {mesh, pos, health, dead, shootTimer, walkPhase}
  }

  /** Hitscan shot from `from` along `dir`. Targets: peds, foot cops, enemies, cars. */
  shoot(from, dir, range, damage, targets) {
    const origin = from.clone();
    origin.y += 1.45;
    const ray = new THREE.Raycaster(origin, dir.clone().normalize(), 0, range);
    let best = null, bestDist = range, bestPoint = null;
    const checkMesh = (mesh, radius, ref) => {
      const to = new THREE.Vector3().subVectors(mesh.position, origin);
      const along = to.dot(dir);
      if (along < 0 || along > bestDist) return;
      const perp = to.clone().addScaledVector(dir, -along);
      if (perp.length() < radius) {
        bestDist = along;
        best = ref;
        bestPoint = origin.clone().addScaledVector(dir, along);
      }
    };
    for (const p of targets.peds ?? []) {
      if (p.dead) continue;
      checkMesh(p.mesh, 0.9, { kind: 'ped', ref: p });
    }
    for (const c of targets.cops ?? []) {
      if (c.dead) continue;
      checkMesh(c.mesh, 0.9, { kind: 'cop', ref: c });
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      checkMesh(e.mesh, 0.9, { kind: 'enemy', ref: e });
    }
    for (const car of targets.cars ?? []) {
      if (car.dead) continue;
      checkMesh(car.mesh, 2.4, { kind: 'car', ref: car });
    }
    const end = bestPoint ?? origin.clone().addScaledVector(dir, range);
    this.effects.tracer(origin, end);
    this.effects.muzzle(origin.clone().setY(origin.y - 1.45), dir);
    this.audio.gunshot();
    if (best) {
      this.effects.spawnBurst(bestPoint, 6, 0xff5544, 4, 0.4);
      if (best.kind === 'car') best.ref.damage(damage * 0.5);
      else best.ref.damage(damage);
    } else {
      this.effects.spawnBurst(end, 3, 0xcccccc, 2, 0.3);
    }
    return best;
  }

  /** Spawn rival shooters for a shootout step. */
  spawnEnemies(positions) {
    this.clearEnemies();
    for (const p of positions) {
      const mesh = this._makeEnemyModel();
      mesh.position.set(p.x, 0, p.z);
      this.scene.add(mesh);
      this.enemies.push({ mesh, health: 60, dead: false, shootTimer: 1 + Math.random(), walkPhase: Math.random() * 10 });
    }
  }

  _makeEnemyModel() {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5f });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x5a2e8a }); // Viper purple
    const pants = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
    head.position.y = 1.62;
    g.add(head);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.74, 0.36), shirt);
    torso.position.y = 1.05;
    g.add(torso);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.28), pants);
    legL.position.set(0.17, 0.36, 0);
    const legR = legL.clone();
    legR.position.x = -0.17;
    g.add(legL);
    g.add(legR);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.64, 0.22), shirt);
    armL.position.set(-0.44, 1.05, 0);
    const armR = armL.clone();
    armR.position.x = 0.44;
    g.add(armL);
    g.add(armR);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.34), new THREE.MeshLambertMaterial({ color: 0x111111 }));
    gun.position.set(0.44, 0.78, 0.18);
    g.add(gun);
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

  updateEnemies(dt, playerPos, onEnemyShoot) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = playerPos.x - e.mesh.position.x, dz = playerPos.z - e.mesh.position.z;
      const dist = Math.hypot(dx, dz);
      const heading = Math.atan2(dx, dz);
      e.mesh.rotation.y = heading;
      // Strafe at mid range, hold ground up close.
      if (dist > 18) {
        e.mesh.position.x += Math.sin(heading) * 3.2 * dt;
        e.mesh.position.z += Math.cos(heading) * 3.2 * dt;
      } else if (dist < 8) {
        e.mesh.position.x -= Math.sin(heading) * 2 * dt;
        e.mesh.position.z -= Math.cos(heading) * 2 * dt;
      }
      e.walkPhase += dt * 6;
      const swing = Math.sin(e.walkPhase) * 0.4;
      e.mesh.userData.legL.rotation.x = swing;
      e.mesh.userData.legR.rotation.x = -swing;
      e.mesh.userData.armR.rotation.x = -1.2;
      e.shootTimer -= dt;
      if (e.shootTimer <= 0 && dist < 55) {
        e.shootTimer = 1.4 + Math.random() * 1.2;
        onEnemyShoot(e.mesh.position, dist);
      }
    }
  }

  aliveEnemies() { return this.enemies.filter((e) => !e.dead).length; }

  clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }
}
