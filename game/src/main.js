// main.js — Port Meridian bootstrap: renderer, game loop with a fixed
// timestep, the menu / playing / paused / busted / wasted / complete
// state machine, module wiring, and the debug hooks the smoke test uses
// (window.__pm). Screenshots are staged through shots.js (?shot=...).

import * as THREE from 'three';
import { CONFIG, mulberry32, dist2D } from './config.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { World } from './world.js';
import { VehicleManager } from './vehicles.js';
import { Player } from './player.js';
import { PedestrianManager } from './pedestrians.js';
import { PoliceManager } from './police.js';
import { Combat } from './combat.js';
import { MissionManager, SPOTS } from './missions.js';
import { HUD } from './hud.js';
import { SaveSys } from './save.js';
import { stageShot, MenuCamera } from './shots.js';

const FIXED_DT = 1 / 60;

class Game {
  constructor() {
    this.state = 'menu'; // menu | playing | paused | busted | wasted | complete
    this.time = 0;
    this.cash = 0;
    this.bestCash = 0;
    this.rng = mulberry32(CONFIG.seed + 99);
    this.camChaseYaw = null;

    this.input = new Input();
    this.audio = new AudioSys();
    this.saveSys = new SaveSys(this);

    // Renderer (WebGL2, no shadows — SwiftShader-friendly).
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('game-canvas').appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(0, 90, 190);

    // Modules, in build order.
    this.world = new World(this);
    this.world.build();
    this.vehicles = new VehicleManager(this);
    this.vehicles.build();
    this.player = new Player(this);
    this.player.spawn(40, 60, 0);
    this.pedestrians = new PedestrianManager(this);
    this.pedestrians.build();
    this.police = new PoliceManager(this);
    this.combat = new Combat(this);
    this.missions = new MissionManager(this);
    this.hud = new HUD(this);
    this.menuCamera = new MenuCamera(this);

    this.input.onFirstGesture = () => this.audio.ensure();

    // Buttons.
    this.hud.el['btn-new'].addEventListener('click', () => this.startNewGame());
    this.hud.el['btn-continue'].addEventListener('click', () => this.continueGame());
    this.hud.el['btn-resume'].addEventListener('click', () => this.resumeGame());
    this.hud.el['btn-restart'].addEventListener('click', () => this.startNewGame());
    this.hud.el['btn-quit'].addEventListener('click', () => this.quitToMenu());
    this.hud.el['btn-retry'].addEventListener('click', () => this.retryFromSave());

    window.addEventListener('resize', () => this._onResize());

    // Debug / smoke-test hooks (real game state, no faked values).
    window.__pm = {
      state: () => this.state,
      cash: () => this.cash,
      missionIndex: () => this.missions.index,
      missionStage: () => this.missions.stage,
      wanted: () => this.police.wanted,
      stars: () => this.police.stars,
      ammo: () => this.combat.ammo,
      health: () => this.player.health,
      driving: () => this.player.driving,
      playerPos: () => ({ ...this.player.pos }),
      heading: () => (this.player.driving ? this.player.car.heading : this.player.heading),
      carSpeed: () => (this.player.driving ? this.player.car.speed : 0),
      copCars: () => this.police.copCars.length,
      vipersAlive: () => this.pedestrians.vipersAlive(),
      waypoint: () => this.missions.waypoint(),
      teleport: (x, z) => {
        if (this.player.driving) { this.player.car.x = x; this.player.car.z = z; }
        else { this.player.x = x; this.player.z = z; this.player._syncMesh(); }
      },
      teleportCar: (x, z) => {
        const car = this.player.car || this.vehicles.comet;
        car.x = x; car.z = z; car._syncMesh();
      },
      enterNearestCar: () => {
        const p = this.player.pos;
        const car = this.vehicles.nearestCar(p.x, p.z, 30);
        return car ? this.player.enterCar(car) : false;
      },
      setWanted: (n) => { this.police.wanted = n; this.audio.setSiren(Math.floor(n)); },
      startNewGame: () => this.startNewGame(),
      save: () => this.saveGame(),
      loadSave: () => this.saveSys.load(),
      errors: () => window.__errors || [],
    };
    window.__errors = [];
    window.addEventListener('error', (e) => window.__errors.push(String(e.message || e.error)));

    // Smoke-test bridge: window.__PM.state() returns one flat snapshot
    // object (state, mag, reserve, wanted stars, distances, save data,
    // last toast). __PM_READY flips true once the game is constructed.
    window.__PM = {
      state: () => {
        const save = this.saveSys.load();
        const wp = this.missions.waypoint();
        const p = this.player.pos;
        const comet = this.vehicles.comet;
        const controlsEl = document.querySelector('#menu .controls');
        return {
          state: this.state,
          menuVisible: this.hud.el['menu'].style.display !== 'none',
          controlsText: controlsEl ? (controlsEl.innerText || '') : '',
          mag: this.combat.ammo,
          reserve: this.combat.reserve,
          missionIndex: this.missions.index,
          missionName: this.missions.current ? this.missions.current.title : '',
          cometDist: dist2D(p.x, p.z, comet.x, comet.z),
          garageDist: dist2D(p.x, p.z, SPOTS.garage.x, SPOTS.garage.z),
          waypoint: wp ? { x: wp.x, z: wp.z } : null,
          playerX: p.x,
          playerZ: p.z,
          heading: this.player.driving ? this.player.car.heading : this.player.heading,
          carSpeed: this.player.driving ? Math.abs(this.player.car.speed) : 0,
          inCar: this.player.driving,
          carIsComet: !!(this.player.car && this.player.car.isComet),
          carName: this.player.car ? this.player.car.name : '',
          wanted: this.police.stars,
          cash: this.cash,
          savedCash: save ? save.cash : null,
          savedMission: save ? save.missionIndex : null,
          copCars: this.police.copCars.length,
          toast: this.hud.lastToast || '',
        };
      },
    };
    window.__PM_READY = true;

    // Start on the menu (or a staged screenshot).
    const params = new URLSearchParams(window.location.search);
    const shot = params.get('shot');
    this.hud.showMenu(this.saveSys.hasSave());
    this.menuCamera.active = true;
    if (shot) {
      // Stage the screenshot, then hand control to shots.js.
      setTimeout(() => stageShot(this, shot), 300);
    }
    this._loop(0);
  }

  // --- State machine ---------------------------------------------------

  setState(next) {
    if (next === 'busted' || next === 'wasted' || next === 'complete') {
      this.state = next;
      this.input.unlockPointer();
      this.saveGame();
      this.audio.setEngine(0, false);
      this.audio.setSiren(0);
      this.hud.showGame();
      this.hud.showEnd(next);
      return;
    }
    this.state = next;
  }

  startNewGame() {
    this.saveSys.clear();
    this.input.clearClicks();
    this.cash = 0;
    this.bestCash = 0;
    // Clear the previous run's police and gang members.
    for (const car of [...this.police.copCars]) this.vehicles.removeCar(car);
    this.police.copCars = [];
    for (const cop of [...this.police.footCops]) this.scene.remove(cop.group);
    this.police.footCops = [];
    for (const p of [...this.pedestrians.list]) {
      if (p.isViper) this.scene.remove(p.group);
    }
    this.pedestrians.list = this.pedestrians.list.filter((p) => !p.isViper);
    // The Comet is back at the plaza, repaired, for mission 1.
    const comet = this.vehicles.comet;
    comet.repair();
    comet.x = 52;
    comet.z = 36;
    comet.heading = Math.PI / 2;
    comet.speed = 0;
    comet.parked = true;
    comet.traffic = false;
    comet._syncMesh();
    this.police.clearWanted();
    this.combat.ammo = CONFIG.pistolMag;
    this.combat.reserve = 48;
    this.combat.reloading = false;
    // Spawn right beside the Comet so mission 1 starts at arm's reach.
    this.player.spawn(52, 40, 0);
    this.player.health = CONFIG.playerHealth;
    this.missions.start();
    this.menuCamera.active = false;
    this.audio.ensure();
    this.hud.showGame();
    this.hud.setBriefing(this.missions.current.briefing);
    this.input.lockPointer();
    this.state = 'playing';
  }

  continueGame() {
    const data = this.saveSys.load();
    if (!data) { this.startNewGame(); return; }
    this.input.clearClicks();
    this.saveSys.apply(data);
    this.police.clearWanted();
    this.combat.ammo = CONFIG.pistolMag;
    this.combat.reserve = 48;
    this.combat.reloading = false;
    this.player.spawn(40, 60, 0);
    this.player.health = CONFIG.playerHealth;
    this.missions._applyStage();
    this.menuCamera.active = false;
    this.audio.ensure();
    this.hud.showGame();
    this.hud.setBriefing(this.missions.current ? this.missions.current.briefing : 'Welcome back to Port Meridian.');
    this.input.lockPointer();
    this.state = 'playing';
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlockPointer();
    this.audio.setEngine(0, false);
    this.hud.showPause();
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hidePause();
    this.input.lockPointer();
  }

  quitToMenu() {
    this.saveGame();
    this.state = 'menu';
    this.menuCamera.active = true;
    this.input.unlockPointer();
    this.audio.setEngine(0, false);
    this.audio.setSiren(0);
    this.hud.showMenu(this.saveSys.hasSave());
  }

  retryFromSave() {
    const data = this.saveSys.load();
    this.hud.hideEnd();
    if (data) this.continueGame();
    else this.startNewGame();
  }

  saveGame() {
    this.saveSys.save();
  }

  // --- Fixed-timestep update -------------------------------------------

  step(dt) {
    this.time += dt;
    this.world.update(dt, this.time);
    if (this.state === 'menu' || this.state === 'complete') {
      this.menuCamera.update(dt);
      this.vehicles.update(dt);
      this.pedestrians.update(dt);
      if (this.state === 'complete') this.player.updateCamera(dt);
      this.hud.update(dt);
      return;
    }
    // Pause toggle works both ways (playing <-> paused).
    if (this.input.wasPressed('KeyP') || this.input.wasPressed('Escape')) {
      if (this.state === 'playing') this.pauseGame();
      else if (this.state === 'paused') this.resumeGame();
      this.hud.update(dt);
      return;
    }
    if (this.state !== 'playing') {
      this.hud.update(dt);
      return;
    }
    // Global keys.
    if (this.input.wasPressed('KeyM')) {
      const muted = this.audio.toggleMute();
      this.hud.toast(muted ? 'Muted' : 'Sound on');
    }
    // R while driving switches the radio; on foot it reloads (combat
    // consumes the press, so only peek here and consume when driving).
    if (this.input.peekPressed('KeyR') && this.player.driving) {
      this.input.wasPressed('KeyR');
      const station = this.audio.toggleRadio();
      this.hud.setRadio(station);
    }
    // E enters/exits a nearby car. When on foot with no car near, the
    // press is left for the taxi pickup check in missions.update.
    if (this.input.peekPressed('KeyE')) {
      if (this.player.driving) {
        this.input.wasPressed('KeyE');
        this.player.exitCar();
      } else {
        const p = this.player.pos;
        const car = this.vehicles.nearestCar(p.x, p.z, 6);
        if (car) {
          this.input.wasPressed('KeyE');
          this.player.enterCar(car);
        }
      }
    }
    this.player.update(dt);
    this.vehicles.update(dt);
    this.pedestrians.update(dt);
    this.police.update(dt);
    this.combat.update(dt);
    this.missions.update(dt);
    this.player.updateCamera(dt);
    this.hud.update(dt);
    // Siren follows the wanted level even while driving.
    this.audio.setSiren(this.police.stars);
  }

  _loop = (t) => {
    requestAnimationFrame(this._loop);
    // Fixed timestep with a spiral-of-death guard.
    if (!this._lastT) this._lastT = t;
    let frameDt = (t - this._lastT) / 1000;
    this._lastT = t;
    frameDt = Math.min(frameDt, 0.1);
    this._acc = (this._acc || 0) + frameDt;
    let steps = 0;
    while (this._acc >= FIXED_DT && steps < 5) {
      this.step(FIXED_DT);
      this._acc -= FIXED_DT;
      steps += 1;
    }
    if (steps === 5) this._acc = 0;
    this.renderer.render(this.scene, this.camera);
  };

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

new Game();
