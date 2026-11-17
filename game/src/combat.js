// Port Meridian — combat.js
// Pistol with a limited magazine + reload (R), hitscan shots with
// visible tracer lines and a muzzle flash, enemies that take damage
// and fall. Rapid clicks within one frame each count as a shot: the
// input queue is consumed up to 3 per frame, never collapsed into a
// single boolean. An empty magazine dry-fires with a "press R" toast.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG } from './config.js';

export class Combat {
  constructor(scene, audio) {
    this.scene = scene;
    this.audio = audio;
    this.mag = CONFIG.magSize;
    this.reserve = CONFIG.reserveStart;
    this.tracers = [];
    this.lastDryToast = -10;
    this.time = 0;
    // Muzzle flash: a small additive plane at the gun tip.
    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.flash.visible = false;
    scene.add(this.flash);
    this.flashTimer = 0;
  }

  reset() {
    this.mag = CONFIG.magSize;
    this.reserve = CONFIG.reserveStart;
    for (const t of this.tracers) this.scene.remove(t.line);
    this.tracers = [];
    this.flash.visible = false;
  }

  // Instant refill from reserve. Returns true if anything reloaded.
  reload() {
    if (this.mag >= CONFIG.magSize || this.reserve <= 0) return false;
    const need = CONFIG.magSize - this.mag;
    const take = Math.min(need, this.reserve);
    this.mag += take;
    this.reserve -= take;
    this.audio.reloadSound();
    return true;
  }

  // One shot. origin/direction come from the camera; enemies is the
  // live list {x, z, health, alive, mesh, onHit}. Returns 'shot',
  // 'dry' or 'none' (in car / no target context handled by caller).
  fire(camera, enemies, onEvent) {
    if (this.mag <= 0) {
      this.audio.dryFire();
      return 'dry';
    }
    this.mag -= 1;
    this.audio.shot();
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    // Muzzle flash at the camera, slightly forward and down.
    this.flash.position.copy(origin).addScaledVector(dir, 1.2);
    this.flash.position.y -= 0.35;
    this.flash.lookAt(camera.position);
    this.flash.visible = true;
    this.flash.material.opacity = 1;
    this.flashTimer = 0.05;

    // Nearest enemy whose body is close to the shot ray.
    let best = null;
    let bestT = 65;
    let hitPoint = origin.clone().addScaledVector(dir, 60);
    for (const e of enemies) {
      if (!e.alive) continue;
      const toE = new THREE.Vector3(e.x, 1.2, e.z).sub(origin);
      const t = toE.dot(dir);
      if (t < 1 || t > 60) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      const miss = closest.distanceTo(new THREE.Vector3(e.x, 1.2, e.z));
      if (miss < 1.6 && t < bestT) {
        best = e;
        bestT = t;
        hitPoint = closest.clone();
      }
    }
    if (best) {
      best.health -= 34;
      if (best.health <= 0) {
        best.alive = false;
        if (best.mesh) best.mesh.visible = false;
      }
      if (onEvent) onEvent('hit', best);
    }
    this._addTracer(origin, hitPoint);
    return 'shot';
  }

  _addTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.95 }),
    );
    this.scene.add(line);
    this.tracers.push({ line, life: 0.09 });
  }

  // Consume the click queue (up to 3 shots this frame). Shooting is
  // only possible on foot; in a car the clicks are dropped.
  update(dt, input, camera, enemies, inCar, onEvent) {
    this.time += dt;
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) this.flash.visible = false;
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.09);
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    let clicks = input.consumeClicks();
    if (clicks > 3) clicks = 3;
    for (let i = 0; i < clicks; i++) {
      if (inCar) continue;
      const result = this.fire(camera, enemies, onEvent);
      if (result === 'shot') {
        if (onEvent) onEvent('shot', null);
      } else if (result === 'dry') {
        if (this.time - this.lastDryToast > 1.5) {
          this.lastDryToast = this.time;
          if (onEvent) onEvent('dry', null);
        }
      }
    }
  }
}
