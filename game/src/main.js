// Port Meridian — main.js
// Game loop, state machine (menu / playing / paused / busted /
// wasted / complete), wiring of all modules, fixed-timestep update,
// resize handling, WebGL2 renderer setup. Exposes window.__PM for
// the screenshot and smoke-test drivers: live state plus debug
// helpers that all drive the real game code paths.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, dist2, angDiff } from './config.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { buildWorld } from './world.js';
import { createVehicles } from './vehicles.js';
import { Player } from './player.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Combat } from './combat.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { SaveSys } from './save.js';
import { setupShot } from './shots.js';

export class Game {
  constructor() {
    // Use the page's largest canvas (the game canvas — the page may
    // also hold a small minimap canvas). Then pin it fullscreen with
    // inline styles so no page stylesheet can clip or offset it.
    const allCanvases = [...document.querySelectorAll('canvas')]
      .filter((c) => !c.closest('#pm-ui'));
    let canvas = null;
    if (allCanvases.length) {
      canvas = allCanvases.reduce((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return (ra.width * ra.height) >= (rb.width * rb.height) ? a : b;
      });
    }
    if (!canvas) {
      canvas = document.createElement('canvas');
      document.body.appendChild(canvas);
    }
    canvas.style.position = 'fixed';
    canvas.style.left = '0';
    canvas.style.top = '0';
    canvas.style.margin = '0';
    canvas.style.borderRadius = '0';
    canvas.style.display = 'block';
    if (canvas.parentElement !== document.body) document.body.appendChild(canvas);
    this.canvas = canvas;

    this.hud = new HUD();
    for (const el of [...document.body.children]) {
      if (el !== canvas && el !== this.hud.root) el.remove();
    }

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth || 1280, window.innerHeight || 720);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, (window.innerWidth || 1280) / (window.innerHeight || 720), 0.1, 900);
    this.camera.position.set(0, 45, 130);
    this.camera.lookAt(0, 10, 0);

    this.input = new Input();
    this.input.attach();
    this.audio = new AudioSys();
    this.world = buildWorld(this.scene);
    this.vehicles = createVehicles(this.scene, this.world);
    this.vehicleHomes = this.vehicles.list.map((v) => ({ v, x: v.x, z: v.z, heading: v.heading }));
    this.player = new Player(this.scene, this.world, this.vehicles, this.input);
    this.pedestrians = new Pedestrians(this.scene, this.world);
    this.police = new Police(this.scene, this.world);
    this.combat = new Combat(this.scene, this.audio);
    this.save = new SaveSys();
    this.missions = new Missions(this.scene, {
      toast: (m) => this.hud.toast(m),
      setWanted: (n) => this.police.setWanted(n),
      onMissionComplete: (def) => this._onMissionComplete(def),
      onAllComplete: () => this._onAllComplete(),
      onTaxiFare: (amount) => { this.cash += amount; this.saveGame(); },
    });

    this.state = 'menu';
    this.cash = 0;
    this.bestCash = 0;
    this.health = CONFIG.playerHealth;
    this.menuOrbit = true;
    this.menuTime = 0;
    this.elapsed = 0;
    this._acc = 0;
    this._clock = new THREE.Clock();
    this._lastToast = '';

    this._wireButtons();
    this.hud.showMenu(this.save.has());
    this.world.setMarker(CONFIG.garagePos.x, CONFIG.garagePos.z, CONFIG.garageRadius);

    window.addEventListener('resize', () => this._onResize());
    window.__PM = {
      game: this,
      state: () => this.getState(),
      shot: (kind) => setupShot(kind, this),
    };
    window.__PM_READY = true;
    this._loop();
  }

  _onResize() {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _wireButtons() {
    this.hud.btnNew.addEventListener('click', () => this.startNewGame());
    this.hud.btnContinue.addEventListener('click', () => this.continueGame());
    this.hud.btnResume.addEventListener('click', () => this.resume());
    this.hud.btnRestart.addEventListener('click', () => this.restartMission());
    this.hud.btnSaveQuit.addEventListener('click', () => this.saveAndQuit());
    this.hud.btnRetry.addEventListener('click', () => this.retryAfterEnd());
    this.hud.btnQuitMenu.addEventListener('click', () => this.quitToMenu());
    this.hud.btnPlayAgain.addEventListener('click', () => this.quitToMenu());
  }

  _resetVehicles() {
    for (const h of this.vehicleHomes) {
      h.v.reset(h.x, h.z, h.heading);
      h.v.stolen = false;
    }
  }

  _beginPlay() {
    this.health = CONFIG.playerHealth;
    this.combat.reset();
    this.police.clearAll();
    this.police.setWanted(0);
    this._resetVehicles();
    this.player.reset();
    this.state = 'playing';
    this.menuOrbit = false;
    this.hud.showPlaying();
    this.input.clearClicks();
    this.audio.ensure();
    this.audio.startRadio(0);
    this.hud.toast(this.missions.objectiveText(), 5000);
  }

  startNewGame() {
    this.save.clear();
    this.cash = 0;
    this.bestCash = 0;
    this.missions.reset();
    this.missions.startMission(0);
    this.world.setMarker(CONFIG.garagePos.x, CONFIG.garagePos.z, CONFIG.garageRadius);
    this._beginPlay();
  }

  continueGame() {
    const data = this.save.load();
    if (!data) {
      this.startNewGame();
      return;
    }
    this.cash = data.cash || 0;
    this.bestCash = data.bestCash || 0;
    this.missions.reset();
    const idx = Math.max(0, Math.min(5, data.missionIndex || 0));
    this.missions.startMission(idx);
    this._syncMarker();
    this._beginPlay();
    this.hud.toast(`Welcome back, Rex. ${this.missions.objectiveText()}`, 5000);
  }

  _syncMarker() {
    const wp = this.missions.waypoint();
    if (wp) this.world.setMarker(wp.x, wp.z, wp.r);
    else this.world.hideMarker();
  }

  quitToMenu() {
    this.state = 'menu';
    this.menuOrbit = true;
    this.audio.engine(0);
    this.audio.siren(false);
    this.hud.showMenu(this.save.has());
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.audio.engine(0);
    this.audio.siren(false);
    this.hud.showPause();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.showPlaying();
    this.input.clearClicks();
  }

  togglePause() {
    if (this.state === 'playing') this.pause();
    else if (this.state === 'paused') this.resume();
  }

  restartMission() {
    const idx = this.missions.index;
    this.health = CONFIG.playerHealth;
    this.police.clearAll();
    this.police.setWanted(0);
    this.player.reset();
    this.combat.reset();
    this.missions.startMission(idx);
    this._syncMarker();
    this.state = 'playing';
    this.hud.showPlaying();
    this.input.clearClicks();
    this.hud.toast(this.missions.objectiveText(), 4000);
  }

  retryAfterEnd() {
    this.restartMission();
  }

  saveAndQuit() {
    this.saveGame();
    this.quitToMenu();
  }

  saveGame() {
    this.bestCash = Math.max(this.bestCash, this.cash);
    this.save.save({ cash: this.cash, missionIndex: this.missions.index, bestCash: this.bestCash });
  }

  _onMissionComplete(def) {
    this.cash += def.reward;
    this.bestCash = Math.max(this.bestCash, this.cash);
    this.hud.toast(`Mission complete: ${def.name} — +$${def.reward}`, 4500);
    this.audio.blip();
    this.saveGame();
    this._syncMarker();
  }

  _onAllComplete() {
    this.state = 'complete';
    this.audio.siren(false);
    this.audio.engine(0);
    this.saveGame();
    this._updateHud();
    this.hud.showComplete(`All six jobs done. Final take: $${this.cash}. Port Meridian is yours, Rex.`);
  }

  _onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.audio.siren(false);
    this.audio.engine(0);
    this._updateHud();
    this.hud.showEnd('busted', 'Detective Hale finally caught up with Rex. The job goes on — retry the mission.');
  }

  _onWasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.audio.siren(false);
    this.audio.engine(0);
    this._updateHud();
    this.hud.showEnd('wasted', 'Rex went down in the streets of Port Meridian. Retry the mission.');
  }

  _damage(amount, kind) {
    if (this.state !== 'playing') return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this._onWasted();
    }
  }

  _step(dt) {
    const speed = this.player.update(dt, this.camera);
    for (const car of this.vehicles.traffic) {
      car.updateTraffic(dt, this.world, this.player.inCar ? this.player.car : null);
    }
    this.pedestrians.update(dt, this.player.x, this.player.z, speed);
    this.police.update(dt, {
      playerX: this.player.x,
      playerZ: this.player.z,
      inCar: this.player.inCar,
      playerSpeed: speed,
      onBusted: () => this._onBusted(),
      onDamage: (amount, kind) => this._damage(amount, kind),
      onRam: (car) => {
        if (this.player.car) this.player.car.speed *= 0.85;
      },
      onShotFired: () => {},
    });
    this.missions.update(dt, {
      playerX: this.player.x,
      playerZ: this.player.z,
      inCar: this.player.inCar,
      carIsComet: this.player.car === this.vehicles.comet,
      wanted: this.police.wanted,
      onDamage: (amount, kind) => this._damage(amount, kind),
    });
    this.world.update(dt, this.elapsed);
    const wp = this.missions.waypoint();
    if (wp) this.world.setMarker(wp.x, wp.z, wp.r);
    else this.world.hideMarker();
  }

  _frame() {
    const dt = Math.min(this._clock.getDelta(), 0.1);
    this.elapsed += dt;

    // One-shot keys, handled once per frame in every state.
    if (this.input.pressed('KeyP') || this.input.pressed('Escape')) this.togglePause();
    if (this.input.pressed('KeyM')) {
      const muted = this.audio.toggleMute();
      if (this.state === 'playing') this.hud.toast(muted ? 'Muted' : 'Sound on');
    }

    if (this.state === 'playing') {
      if (this.input.pressed('KeyE')) {
        if (this.player.inCar) {
          this.player.exitCar();
        } else {
          const res = this.player.tryEnterCar();
          if (res.entered) {
            this.audio.blip();
            if (res.stole) {
              this.police.addWanted(1);
              this.hud.toast(`${res.car.name} stolen — wanted +1 star`, 3500);
            }
          }
        }
      }
      if (this.input.pressed('KeyR')) {
        if (this.combat.reload()) this.hud.toast('Reloaded');
      }
      // Fixed-timestep simulation (1/30s steps, capped per frame).
      this._acc += dt;
      let steps = 0;
      while (this._acc >= 1 / 30 && steps < 8) {
        this._step(1 / 30);
        this._acc -= 1 / 30;
        steps++;
      }
      if (steps >= 8) this._acc = 0;
      // Combat consumes the click queue once per frame (up to 3).
      this.combat.update(dt, this.input, this.camera, this.missions.enemies, this.player.inCar, (ev, enemy) => {
        if (ev === 'shot') {
          this.police.addWanted(1);
          this.pedestrians.scare(this.player.x, this.player.z, 25);
        } else if (ev === 'dry') {
          this.hud.toast('Magazine empty — press R to reload');
        } else if (ev === 'hit' && enemy && !enemy.alive) {
          this.hud.toast(`${enemy.label} down!`);
        }
      });
      this.audio.engine(this.player.inCar && this.player.car ? Math.abs(this.player.car.speed) / this.player.car.maxSpeed : 0);
      this.audio.siren(this.police.wanted > 0);
      this._updateHud();
    } else if (this.state === 'menu' && this.menuOrbit) {
      this.menuTime += dt;
      const a = this.menuTime * 0.045;
      this.camera.position.set(Math.sin(a) * 135, 55, Math.cos(a) * 135);
      this.camera.lookAt(0, 8, 0);
      this.world.update(dt, this.elapsed);
    }
    this.input.endFrame();
    this.renderer.render(this.scene, this.camera);
  }

  _updateHud() {
    const wp = this.missions.waypoint();
    let wpDist = null;
    let wpAngle = null;
    if (wp) {
      wpDist = dist2(this.player.x, this.player.z, wp.x, wp.z);
      const bearing = Math.atan2(wp.x - this.player.x, wp.z - this.player.z);
      wpAngle = angDiff(bearing, this.player.heading);
    }
    this.hud.update({
      cash: this.cash,
      wanted: this.police.wanted,
      health: this.health,
      mag: this.combat.mag,
      reserve: this.combat.reserve,
      speedKmh: this.player.inCar && this.player.car ? this.player.car.speedKmh() : 0,
      inCar: this.player.inCar,
      objective: this.missions.objectiveText(),
      waypoint: wp,
      waypointDist: wpDist,
      waypointAngle: wpAngle,
      playerX: this.player.x,
      playerZ: this.player.z,
      heading: this.player.heading,
      cops: [...this.police.copCars, ...this.police.footCops].map((c) => ({ x: c.x, z: c.z })),
      taxi: this.missions.taxi.state === 'waiting'
        ? { visible: true, x: this.missions.taxi.pickup.x, z: this.missions.taxi.pickup.z }
        : { visible: false, x: 0, z: 0 },
    });
  }

  _loop() {
    const tick = () => {
      try {
        this._frame();
      } catch (err) {
        // Never let one frame kill the loop; the error still surfaces
        // in the console for the smoke test to catch.
        console.error(err);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  getState() {
    const saved = this.save.load();
    const wp = this.missions.waypoint();
    return {
      state: this.state,
      missionIndex: this.missions.index,
      missionName: this.missions.currentDef() ? this.missions.currentDef().name : 'Done',
      objective: this.missions.objectiveText(),
      cash: this.cash,
      health: Math.round(this.health),
      mag: this.combat.mag,
      reserve: this.combat.reserve,
      wanted: this.police.wanted,
      inCar: this.player.inCar,
      carName: this.player.car ? this.player.car.name : null,
      carIsComet: this.player.car === this.vehicles.comet,
      playerX: Math.round(this.player.x * 10) / 10,
      playerZ: Math.round(this.player.z * 10) / 10,
      heading: Math.round(this.player.heading * 100) / 100,
      speedKmh: this.player.inCar && this.player.car ? Math.round(this.player.car.speedKmh()) : 0,
      copCars: this.police.copCars.length,
      footCops: this.police.footCops.length,
      garageDist: Math.round(dist2(this.player.x, this.player.z, CONFIG.garagePos.x, CONFIG.garagePos.z) * 10) / 10,
      cometDist: Math.round(dist2(this.player.x, this.player.z, this.vehicles.comet.x, this.vehicles.comet.z) * 10) / 10,
      waypoint: wp,
      waypointDist: wp ? Math.round(dist2(this.player.x, this.player.z, wp.x, wp.z) * 10) / 10 : null,
      enemiesAlive: this.missions.enemies.filter((e) => e.alive).length,
      savedCash: saved ? saved.cash : null,
      savedMission: saved ? saved.missionIndex : null,
      toast: this.hud.toastEl.textContent,
      menuVisible: !this.hud.menuEl.classList.contains('hidden'),
      pauseVisible: !this.hud.pauseEl.classList.contains('hidden'),
      completeVisible: !this.hud.completeEl.classList.contains('hidden'),
      endVisible: !this.hud.endEl.classList.contains('hidden'),
      controlsText: (document.getElementById('pm-controls') || { textContent: '' }).textContent,
    };
  }

  // ---- Debug helpers: all drive the real game code paths. ----
  debugEnterComet() {
    this.player.x = CONFIG.cometPos.x + 3;
    this.player.z = CONFIG.cometPos.z + 2;
    const res = this.player.tryEnterCar();
    if (res.entered && res.stole) this.police.addWanted(1);
    return res.entered;
  }

  debugSetWanted(n) {
    this.police.setWanted(n);
  }

  debugSetMission(i) {
    this.missions.startMission(i);
    this._syncMarker();
  }

  debugTeleport(x, z) {
    if (this.player.inCar) this.player.exitCar();
    this.player.x = x;
    this.player.z = z;
    this.player.mesh.position.set(x, 0, z);
  }

  debugFace(yaw) {
    this.player.camYaw = yaw;
    this.player.heading = yaw;
  }

  debugFireShot() {
    this.combat.fire(this.camera, this.missions.enemies, null);
  }

  debugDriveForward() {
    if (this.player.inCar && this.player.car) {
      this.player.car.speed = Math.min(20, this.player.car.maxSpeed);
    }
  }

  // Hold real input keys down for ms (drives the real input path).
  debugHoldKeys(codes, ms) {
    for (const c of codes) this.input.keys.add(c);
    setTimeout(() => {
      for (const c of codes) this.input.keys.delete(c);
    }, ms);
  }

  debugCompleteAll() {
    while (this.missions.index < 6 && this.state === 'playing') {
      this.missions._completeCurrent();
    }
  }
}

// Boot: module scripts run after the DOM is parsed, so the body exists.
new Game();
