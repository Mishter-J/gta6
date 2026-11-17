// shots.js — scripted camera sequences used ONLY to capture the game's
// screenshots (menu, chase, shootout, end screen). Every shot drives the
// real game code — the same spawn, physics, render and HUD paths a player
// gets — with the camera and game state staged for a readable frame.
// No faked or composited frames: what you see is the game running.
//
// Usage: open game/index.html?shot=menu|chase|mission|end — the page
// stages the shot, runs the simulation for a few seconds, then sets
// window.__shotReady = true for the screenshot tool.

import * as THREE from 'three';

const SHOT_WAIT_MS = 1200; // let the staged scene settle before the shot

export function stageShot(ctx, name) {
  const startedAt = performance.now();
  const finish = () => {
    window.__shotReady = true;
    window.__shotName = name;
  };
  const settle = (fn) => {
    // Settle the camera first, then stage the shot, then run the world
    // forward so cars, peds and tracers are mid-motion in the frame.
    for (let i = 0; i < 60; i++) ctx.step(1 / 60);
    fn();
    for (let i = 0; i < 90; i++) ctx.step(1 / 60);
    ctx.renderer.render(ctx.scene, ctx.camera);
    setTimeout(finish, SHOT_WAIT_MS);
  };

  if (name === 'menu') {
    // Start screen over a slow orbit of the city at golden hour.
    ctx.setState('menu');
    ctx.menuCamera.active = true;
    ctx.menuCamera.angle = 0.6;
    settle(() => {});
    return;
  }

  if (name === 'chase') {
    // Driving the red Comet through downtown with a 3-star pursuit:
    // two interceptor cop cars on the player's tail, HUD + minimap live.
    settle(() => {
      ctx.startNewGame();
      const comet = ctx.vehicles.comet;
      ctx.player.spawn(52, 30, Math.PI / 2);
      ctx.player.enterCar(comet);
      comet.speed = 18;
      ctx.police.wanted = 3;
      ctx.audio.setSiren(3);
      // Two cop cars close behind, mid-pursuit.
      const c1 = ctx.police._spawnCopCar();
      c1.x = comet.x - 14;
      c1.z = comet.z - 18;
      c1.heading = comet.heading;
      c1.speed = 20;
      const c2 = ctx.police._spawnCopCar();
      c2.x = comet.x - 22;
      c2.z = comet.z + 10;
      c2.heading = comet.heading;
      c2.speed = 19;
      ctx.player.camYaw = comet.heading + Math.PI;
      ctx.camChaseYaw = comet.heading + Math.PI;
    });
    return;
  }

  if (name === 'mission') {
    // Mission 4 shootout at the west warehouse: Rex on foot, Vipers
    // in the open, a fresh tracer and muzzle flash in the air.
    settle(() => {
      ctx.startNewGame();
      ctx.missions.index = 3;
      ctx.missions.stage = 'go';
      ctx.missions._applyStage();
      ctx.player.spawn(-178, 30, -Math.PI / 2);
      ctx.player.camYaw = Math.PI / 2;
      ctx.combat.ammo = 10;
      // Snap the camera behind Rex before firing, so the tracers and
      // muzzle flash point at the Vipers, not at the menu orbit.
      ctx.player.updateCamera(1);
      ctx.player.updateCamera(1);
      // Fire a couple of real shots so tracers and a muzzle flash show.
      ctx.combat.fire();
      ctx.combat.fireCooldown = 0;
      ctx.combat.fire();
      ctx.police.wanted = 1;
    });
    return;
  }

  if (name === 'end') {
    // The JOB COMPLETE screen over the city, with the story's payoff.
    settle(() => {
      ctx.startNewGame();
      ctx.cash = 6850;
      ctx.missions.index = 6;
      ctx.player.spawn(40, 20, 0);
      ctx.setState('complete');
    });
    return;
  }

  // Unknown shot name: just signal ready so the tool does not hang.
  finish();
}

// Cinematic menu camera: a slow orbit high above the city centre.
export class MenuCamera {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = false;
    this.angle = 0;
  }

  update(dt) {
    if (!this.active) return;
    this.angle += dt * 0.03;
    const { camera } = this.ctx;
    const r = 190;
    camera.position.set(
      40 + Math.sin(this.angle) * r,
      95,
      -40 + Math.cos(this.angle) * r,
    );
    camera.lookAt(new THREE.Vector3(40, 25, -40));
  }
}
