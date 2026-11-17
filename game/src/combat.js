// combat.js — Port Meridian combat: a pistol with a 12-round magazine
// and reload (R), fists when empty, hitscan shots with tracer lines and
// muzzle flash, and enemy fire (Vipers, foot cops) that can hurt the
// player. Clicks are counted, not collapsed: up to 3 shots per frame.

import * as THREE from 'three';
import { CONFIG, clamp } from './config.js';

export class Combat {
  constructor(ctx) {
    this.ctx = ctx;
    this.ammo = CONFIG.pistolMag;
    this.reserve = 48; // finite spare rounds; reloads draw from here
    this.reloading = false;
    this.reloadTimer = 0;
    this.fireCooldown = 0;
    this.tracers = [];
    this.muzzleLight = new THREE.PointLight(0xffc860, 0, 14);
    this.muzzleLight.position.set(0, 0, 0);
    ctx.scene.add(this.muzzleLight);
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = CONFIG.pistolRange;
  }

  get canFire() {
    return !this.reloading && this.fireCooldown <= 0 && this.ammo > 0;
  }

  update(dt) {
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    if (this.reloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        // Refill from the finite reserve, not from thin air.
        const need = CONFIG.pistolMag - this.ammo;
        const take = Math.min(need, this.reserve);
        this.ammo += take;
        this.reserve -= take;
        this.ctx.hud.toast('Reloaded');
      }
    }
    // Fade tracers out.
    for (const t of [...this.tracers]) {
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / t.maxLife);
      if (t.life <= 0) {
        this.ctx.scene.remove(t.line);
        this.tracers = this.tracers.filter((x) => x !== t);
      }
    }
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 40);

    if (this.ctx.state !== 'playing') return;
    const { input } = this.ctx;

    if (input.wasPressed('KeyR')) this.startReload();

    // Fire: consume ONE queued click per step, and only once the
    // cooldown has cleared — so rapid clicks are never swallowed by
    // the cooldown (the old take-all-then-break loop ate them).
    if (!this.reloading && this.fireCooldown <= 0) {
      if (input.takeClicks(1) > 0) this.fire();
      else if (input.mouseDown) this.fire(); // hold to keep firing
    }
    // Fist: F with an empty magazine swings at close range.
    if (input.wasPressed('KeyF') && this.ammo === 0 && !this.reloading) {
      this.fist();
    }
  }

  startReload() {
    if (this.reloading || this.ammo === CONFIG.pistolMag) return;
    if (this.reserve <= 0) {
      this.ctx.hud.toast('No reserve ammo left');
      return;
    }
    this.reloading = true;
    this.reloadTimer = CONFIG.reloadSeconds;
    this.ctx.hud.toast('Reloading...');
  }

  fire() {
    if (this.reloading) return false;
    if (this.ammo <= 0) {
      this.ctx.audio.dryClick();
      this.ctx.hud.toast('Out of ammo — press R to reload');
      this.fireCooldown = 0.25;
      return false;
    }
    if (this.fireCooldown > 0) return false;
    this.fireCooldown = 0.16;
    this.ammo -= 1;
    const { player, camera } = this.ctx;
    // Origin: the gun tip on foot, the car window while driving.
    const origin = new THREE.Vector3();
    if (player.driving) {
      origin.set(player.car.x, 1.4, player.car.z);
    } else {
      player.muzzle.getWorldPosition(origin);
    }
    // Aim: from the camera through the screen centre (crosshair).
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    this.raycaster.set(origin, dir);
    const targets = this._shootables();
    const hits = this.raycaster.intersectObjects(targets, true);
    let end = origin.clone().addScaledVector(dir, CONFIG.pistolRange);
    if (hits.length > 0) {
      const hit = hits[0];
      end = hit.point.clone();
      const victim = this._ownerOf(hit.object);
      if (victim) {
        const killed = victim.damage(CONFIG.pistolDamage, origin.x, origin.z);
        if (victim.isViper && killed) {
          this.ctx.missions.onViperDown();
        }
        // No extra wanted here: the shot itself already costs +1 below,
        // so three shots raise the level by exactly three stars.
      }
    }
    this._tracer(origin, end);
    this.muzzleLight.position.copy(origin);
    this.muzzleLight.intensity = 6;
    this.ctx.audio.gunshot();
    const p = player.pos;
    this.ctx.pedestrians.scareAll(p.x, p.z, 45);
    // Every shot is a crime: exactly +1 wanted star per shot.
    this.ctx.police.addWanted(1, null);
    return true;
  }

  fist() {
    const { player } = this.ctx;
    const p = player.pos;
    const fwdX = Math.sin(player.heading);
    const fwdZ = Math.cos(player.heading);
    for (const ped of this.ctx.pedestrians.list) {
      if (!ped.alive) continue;
      const dx = ped.x - p.x;
      const dz = ped.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < CONFIG.fistRange && dx * fwdX + dz * fwdZ > 0) {
        const killed = ped.damage(CONFIG.fistDamage, p.x, p.z);
        if (ped.isViper && killed) this.ctx.missions.onViperDown();
        this.ctx.hud.toast('Punch!');
        return;
      }
    }
  }

  // Enemy fire: a Viper or a foot cop shoots at the player. Tracer + damage.
  enemyShot(shooter) {
    const { player } = this.ctx;
    const p = player.pos;
    const from = new THREE.Vector3(shooter.x, 1.4, shooter.z);
    const to = new THREE.Vector3(p.x, 1.3, p.z);
    this._tracer(from, to, 0xff5544);
    this.ctx.audio.gunshot();
    // Hit chance falls with distance; a miss still rattles the player.
    // Seeded RNG (deterministic per session) instead of Math.random().
    const rng = this.ctx.rng;
    const d = from.distanceTo(to);
    const hitChance = clamp(0.62 - d * 0.012, 0.12, 0.62);
    if (rng() < hitChance) {
      player.damage(4 + rng() * 4);
      // Throttle the hurt toast (one per 4 sim-seconds) so it does not
      // spam over more urgent messages like the empty-magazine hint.
      if (this.ctx.time - (this._lastHurtToastAt || -99) > 4) {
        this._lastHurtToastAt = this.ctx.time;
        this.ctx.hud.toast('You got shot!');
      }
    }
  }

  _shootables() {
    const meshes = [];
    for (const ped of this.ctx.pedestrians.list) {
      if (ped.alive) meshes.push(ped.group);
    }
    for (const cop of this.ctx.police.footCops) meshes.push(cop.group);
    return meshes;
  }

  _ownerOf(object3D) {
    let o = object3D;
    while (o) {
      for (const ped of this.ctx.pedestrians.list) {
        if (ped.group === o) return ped;
      }
      for (const cop of this.ctx.police.footCops) {
        if (cop.group === o) {
          return {
            isViper: false,
            damage: (amount) => {
              // Foot cops are tough: three hits take one down.
              cop.hp = (cop.hp ?? 3) - 1;
              if (cop.hp <= 0) {
                this.ctx.scene.remove(cop.group);
                this.ctx.police.footCops = this.ctx.police.footCops.filter((c) => c !== cop);
                return true;
              }
              return false;
            },
          };
        }
      }
      o = o.parent;
    }
    return null;
  }

  _tracer(from, to, colorHex = 0xffe08a) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.9 }),
    );
    this.ctx.scene.add(line);
    this.tracers.push({ line, life: 0.12, maxLife: 0.12 });
  }
}
