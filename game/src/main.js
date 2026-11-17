// Port Meridian — boot, game loop and glue: menus, driving, combat,
// wanted heat, missions, saving and the screenshot hooks.

import * as THREE from '../vendor/three.module.min.js';
import { CITY, WORLD, ECONOMY, MISSIONS, PLACES, RADIO } from './config.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildWorld } from './world.js';
import { TrafficManager } from './vehicles.js';
import { PedestrianManager } from './pedestrians.js';
import { Player } from './player.js';
import { PoliceManager } from './police.js';
import { Combat, Effects } from './combat.js';
import { MissionManager } from './missions.js';
import { HUD } from './hud.js';
import { saveGame, loadGame, hasSave } from './save.js';
import { installShotHooks } from './shots.js';

const $ = (id) => document.getElementById(id);

export class Game {
  constructor() {
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 2000);
    this.camera.position.set(-120, 120, -120);
    this.clock = new THREE.Clock();
    this.state = 'loading'; // loading | menu | playing | paused | over
    this.cash = 0;
    this.muted = false;
    this.heatCooldown = 0;
    this.autosaveTimer = 0;
    this.menuAngle = 0;
    this.ready = false;

    this.input = new Input(this.canvas);
    this.input.onFirstGesture = () => this.audio.init();
    this.audio = new AudioEngine();
    this.world = buildWorld(this.scene);
    this.traffic = new TrafficManager(this.scene, this.world);
    this.traffic.spawnAll();
    this.peds = new PedestrianManager(this.scene, this.world);
    this.peds.spawnAll();
    this.player = new Player(this.scene, this.camera);
    this.effects = new Effects(this.scene);
    this.combat = new Combat(this.scene, this.effects, this.audio);
    this.police = new PoliceManager(this.scene, this.world, this.traffic);
    this.police.onBusted = () => this.showEndScreen('busted');
    this.hud = new HUD();
    this.missions = new MissionManager(this.scene, {
      player: this.player,
      police: this.police,
      traffic: this.traffic,
      combat: this.combat,
      peds: this.peds,
      hud: this.hud,
      audio: this.audio,
      addCash: (n) => { this.cash += n; },
      onGameComplete: () => this.showEndScreen('complete'),
    });

    window.addEventListener('resize', () => this._onResize());
    // Esc exits pointer lock first; losing the lock while playing pauses.
    document.addEventListener('pointerlockchange', () => {
      if (!document.pointerLockElement && this.state === 'playing' && this._hadLock) this.pause();
      this._hadLock = !!document.pointerLockElement;
    });
    this._wireMenus();
    installShotHooks(this);
    $('loading').classList.add('hidden');
    if (hasSave()) {
      $('btn-continue').classList.remove('hidden');
      const s = loadGame();
      if (s) $('continue-day').textContent = String(Math.min(6, (s.missionIndex ?? 0) + 1));
    }
    this.state = 'menu';
    this.renderer.setAnimationLoop((t) => this.loop(t));
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _wireMenus() {
    $('btn-new').addEventListener('click', () => { this.audio.init(); this.startGame(true); });
    $('btn-continue').addEventListener('click', () => { this.audio.init(); this.startGame(false); });
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-save').addEventListener('click', () => {
      this._doSave();
      this.hud.showToast('Game saved');
    });
    $('btn-quit').addEventListener('click', () => this.quitToMenu());
    $('btn-respawn').addEventListener('click', () => this.respawn());
    $('btn-end-menu').addEventListener('click', () => this.quitToMenu());
  }

  /** Pointer lock, safe in headless browsers where it rejects. */
  _lockPointer() {
    try {
      const r = this.canvas.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch { /* pointer lock unavailable */ }
  }

  startGame(isNew) {
    if (isNew) {
      this.cash = 0;
      this.player.respawn(PLACES.hideout.x, PLACES.hideout.z);
      this.player.health = 100;
      this.missions.missionIndex = 0;
    } else {
      const s = loadGame();
      if (s) {
        this.cash = s.cash;
        this.player.respawn(s.x ?? PLACES.hideout.x, s.z ?? PLACES.hideout.z);
        this.player.health = s.health ?? 100;
        this.player.armor = s.armor ?? 0;
        this.missions.missionIndex = Math.min(s.missionIndex ?? 0, MISSIONS.length - 1);
      }
    }
    this.police.clearWanted();
    this.combat.clearEnemies();
    $('menu').classList.add('hidden');
    $('pause-menu').classList.add('hidden');
    $('end-screen').classList.add('hidden');
    this.hud.show();
    this.state = 'playing';
    // The red Comet waits outside Mara's garage for mission 1.
    this.traffic.spawnMissionCar(PLACES.marasGarage.x - 10, PLACES.marasGarage.z + 8, Math.PI / 2);
    this.missions.startMission(this.missions.missionIndex);
    this._lockPointer();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    $('pause-menu').classList.remove('hidden');
    document.exitPointerLock?.();
  }

  resume() {
    if (this.state !== 'paused') return;
    $('pause-menu').classList.add('hidden');
    this.state = 'playing';
    this._lockPointer();
  }

  quitToMenu() {
    this._doSave();
    this.state = 'menu';
    $('pause-menu').classList.add('hidden');
    $('end-screen').classList.add('hidden');
    $('menu').classList.remove('hidden');
    this.hud.hide();
    this.player.setWeapon(false);
    if (this.player.inCar) this.player.exitCar();
    document.exitPointerLock?.();
  }

  showEndScreen(kind) {
    if (this.state === 'over') return;
    this.state = 'over';
    document.exitPointerLock?.();
    const title = $('end-title');
    const text = $('end-text');
    if (kind === 'busted') {
      const fine = Math.min(this.cash, ECONOMY.bustedFine);
      this.cash -= fine;
      title.textContent = 'BUSTED';
      text.textContent = `The MPD hauled you in. Detective Hale is smiling. You paid $${fine} in fines and the heat is off — for now.`;
      this.audio.busted();
    } else if (kind === 'wasted') {
      const fine = Math.min(this.cash, ECONOMY.wastedFine);
      this.cash -= fine;
      title.textContent = 'WASTED';
      text.textContent = `You woke up at St. Anselm Hospital with a $${fine} bill and a headache. The city is still out there.`;
      this.audio.busted();
    } else {
      title.textContent = 'THE MERIDIAN JOB';
      text.textContent = 'It\'s done. The vault, the chase, the whole damn city — yours. Mara is waiting at the hideout with the cut. Keep playing in free roam, or come back tomorrow for more jobs.';
      this.audio.missionComplete();
    }
    $('btn-respawn').textContent = kind === 'complete' ? 'KEEP PLAYING — FREE ROAM' : 'BACK ON THE STREETS';
    $('end-screen').classList.remove('hidden');
    this.hud.hide();
  }

  respawn() {
    $('end-screen').classList.add('hidden');
    this.police.clearWanted();
    this.combat.clearEnemies();
    this.player.respawn(PLACES.hospital.x, PLACES.hospital.z);
    this.hud.show();
    this.state = 'playing';
    this.missions.startMission(this.missions.missionIndex);
    this._lockPointer();
  }

  _doSave() {
    saveGame({
      cash: this.cash,
      missionIndex: this.missions.missionIndex,
      health: this.player.health,
      armor: this.player.armor,
      x: this.player.pos.x,
      z: this.player.pos.z,
    });
  }

  addCash(n) { this.cash += n; }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    if (this.state === 'menu') {
      // Cinematic orbit behind the menu.
      this.menuAngle += dt * 0.03;
      const cx = CITY.size / 2, cz = CITY.size / 2;
      this.camera.position.set(cx + Math.cos(this.menuAngle) * 260, 130, cz + Math.sin(this.menuAngle) * 260);
      this.camera.lookAt(cx, 0, cz + 40);
      this.traffic.update(dt, this.world.colliders);
      this.peds.update(dt, this.player.pos, null);
      this.world.update(dt, t);
      this.effects.update(dt);
    } else if (this.state === 'playing') {
      this._updatePlaying(dt, t);
    }
    this.renderer.render(this.scene, this.camera);
    this.ready = true;
    this.input.clearPressed();
  }

  _updatePlaying(dt, t) {
    const input = this.input;
    const mouse = input.poll();
    const p = this.player;
    p.punchTimer = Math.max(0, (p.punchTimer ?? 0) - dt);

    // Global keys
    if (input.wasPressed('Escape')) { this.pause(); return; }
    if (input.wasPressed('KeyM')) {
      this.muted = !this.muted;
      this.audio.setMuted(this.muted);
      this.hud.showToast(this.muted ? 'Sound muted' : 'Sound on');
    }
    if (input.wasPressed('KeyQ')) {
      const name = this.audio.cycleRadio();
      this.hud.showToast(name);
    }
    if (input.wasPressed('KeyG')) {
      this._doSave();
      this.hud.showToast('Game saved');
    }
    if (input.wasPressed('Digit1')) { p.setWeapon(false); this.hud.showToast('Fists'); }
    if (input.wasPressed('Digit2')) { p.setWeapon(true); this.hud.showToast('Pistol — 12 rounds'); }

    // Enter / exit car, pickups
    const interact = input.wasPressed('KeyE');
    if (interact) {
      if (p.inCar) p.exitCar();
      else {
        const car = this.traffic.nearestCar(p.pos.x, p.pos.z, 4.5);
        if (car) {
          p.enterCar(car);
          if (!car.missionCar && car.driver === 'player') {
            // Stealing a parked car draws heat (not the mission Comet twice).
            if (this.heatCooldown <= 0) {
              this.police.addHeat(ECONOMY.carStealHeat);
              this.heatCooldown = 5;
              this.hud.showToast('Car stolen — the MPD noticed');
            }
          }
          this.audio.blip();
        }
      }
    }

    // Context hint
    if (!p.inCar) {
      const car = this.traffic.nearestCar(p.pos.x, p.pos.z, 4.5);
      if (car) this.hud.showHint('<b>E</b> — steal the car');
      else {
        const step = this.missions.currentStep();
        if (step && step.type === 'pickup' && Math.hypot(p.pos.x - step.at.x, p.pos.z - step.at.z) < 8) {
          this.hud.showHint('<b>E</b> — pick up');
        } else this.hud.hideHint();
      }
    } else if (p.inCar.speed < 1) {
      this.hud.showHint('<b>E</b> — exit car');
    } else {
      this.hud.hideHint();
    }

    // Movement
    if (p.inCar) {
      p.updateInCar(dt, input, mouse, p.inCar, this.world.colliders, this.traffic.cars);
    } else {
      p.updateOnFoot(dt, input, mouse, this.world);
    }

    // Shooting / punching (one shot per click, even if several land in one frame)
    const clicks = Math.min(mouse.clicks ?? (mouse.clicked ? 1 : 0), 3);
    for (let i = 0; i < clicks && !p.inCar && this.state === 'playing'; i++) {
      if (p.armed) this._shoot();
      else this._punch();
    }
    if (input.wasPressed('KeyR') && p.armed && p.ammo < p.magSize) {
      p.reloadTimer = 1.2;
      this.hud.showToast('Reloading…');
    }
    if (p.reloadTimer > 0) {
      p.reloadTimer -= dt;
      if (p.reloadTimer <= 0) { p.ammo = p.magSize; this.hud.showToast('Pistol reloaded'); }
    }

    // Car-vs-pedestrian collisions (player's car only)
    if (p.inCar && Math.abs(p.inCar.speed) > 6) {
      const car = p.inCar;
      for (const ped of this.peds.peds) {
        if (ped.dead) continue;
        if (Math.hypot(ped.pos.x - car.pos.x, ped.pos.z - car.pos.z) < 2.6) {
          ped.damage(100);
          if (this.heatCooldown <= 0) {
            this.police.addHeat(ECONOMY.pedHitHeat);
            this.heatCooldown = 5;
          }
          this.audio.crash(0.7);
          this.effects.spawnBurst(ped.pos, 5, 0xff5544, 3, 0.4);
        }
      }
    }
    // Player car wrecked?
    if (p.inCar && p.inCar.dead) {
      this.effects.spawnBurst(p.inCar.pos, 24, 0xff7722, 8, 1.2);
      this.effects.smoke(p.inCar.pos, 8);
      this.audio.crash(1);
      p.damage(25);
      p.exitCar();
    }

    // World systems
    this.traffic.update(dt, this.world.colliders);
    this.peds.update(dt, p.pos, p.inCar);
    this.police.update(dt, p, p.inCar, this.world.colliders, (fromPos, dist) => this._enemyShot(fromPos, dist, 10));
    this.combat.updateEnemies(dt, p.inCar ? p.inCar.pos : p.pos, (fromPos, dist) => this._enemyShot(fromPos, dist, 12));
    this.missions.update(dt, interact);
    this.world.update(dt, t);
    this.effects.update(dt);
    this.heatCooldown = Math.max(0, this.heatCooldown - dt);

    // Audio: engine + sirens
    if (p.inCar) this.audio.setEngine(Math.abs(p.inCar.speed) / WORLD.carTopSpeed, input.forwardAxis() !== 0 ? 1 : 0);
    else this.audio.setEngine(0, 0);
    this.audio.setSiren(this.police.nearestCopDist);

    // Smoking wrecks
    for (const car of this.traffic.cars) {
      if (car.dead && Math.random() < dt * 2) this.effects.smoke(car.pos, 1);
    }

    // Death / busted checks
    if (p.health <= 0) { this.showEndScreen('wasted'); return; }

    // Autosave
    this.autosaveTimer += dt;
    if (this.autosaveTimer > 60) { this.autosaveTimer = 0; this._doSave(); }

    // HUD
    this.hud.update(dt, {
      cash: this.cash,
      health: p.health,
      armor: p.armor,
      wanted: this.police.wanted,
      speedMph: p.inCar ? Math.abs(p.inCar.speed) * 2.237 : 0,
      inCar: !!p.inCar,
      armed: p.armed,
      radio: this.audio.radioName(),
    });
    const marker = this.missions.markerPos();
    this.hud.drawMinimap(
      this.world,
      p.inCar ? p.inCar.pos : p.pos,
      p.inCar ? p.inCar.heading : p.heading,
      marker,
      this.missions.taxiMarker(),
      this.police.copCars,
      this.police.footCops,
      this.traffic.cars,
      p.inCar
    );
    this.audio.setSiren(this.police.nearestCopDist);
  }

  _shoot() {
    const p = this.player;
    if (p.reloadTimer > 0) return;
    if (p.ammo <= 0) {
      this.hud.showToast('Out of ammo — press R to reload');
      p.reloadTimer = 1.2;
      return;
    }
    p.ammo--;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const hit = this.combat.shoot(p.pos, dir, 90, 34, {
      peds: this.peds.peds,
      cops: this.police.footCops,
      cars: this.traffic.cars,
    });
    this.peds.scareAll(p.pos.x, p.pos.z, 30);
    if (hit) {
      if (hit.kind === 'ped' && this.heatCooldown <= 0) {
        this.police.addHeat(ECONOMY.shotHeat);
        this.heatCooldown = 5;
      }
      if (hit.kind === 'cop') {
        this.police.addHeat(ECONOMY.copKillHeat);
        this.heatCooldown = 5;
      }
    }
  }

  _punch() {
    const p = this.player;
    if (p.punchTimer > 0) return;
    p.punchTimer = 0.45;
    this.audio.punch();
    const f = { x: Math.sin(p.heading), z: Math.cos(p.heading) };
    const targets = [...this.peds.peds, ...this.police.footCops, ...this.combat.enemies];
    for (const t of targets) {
      if (t.dead) continue;
      const tp = t.pos ?? t.mesh.position;
      const dx = tp.x - p.pos.x, dz = tp.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.4 && (dx * f.x + dz * f.z) / Math.max(d, 0.01) > 0.3) {
        t.damage(25);
        this.effects.spawnBurst(tp, 3, 0xffcc66, 2, 0.3);
        break;
      }
    }
  }

  /** An enemy or cop shoots at the player: distance-based hit chance. */
  _enemyShot(fromPos, dist, baseDamage) {
    const p = this.player;
    const hitChance = THREE.MathUtils.clamp(0.55 - dist / 120, 0.08, 0.5);
    const from = fromPos.clone();
    from.y += 1.4;
    const to = (p.inCar ? p.inCar.pos : p.pos).clone();
    to.y += 1.2;
    const dir = to.clone().sub(from).normalize();
    this.effects.tracer(from, to);
    this.audio.gunshot();
    if (Math.random() < hitChance) {
      const dmg = baseDamage * (0.7 + Math.random() * 0.6);
      if (p.inCar) p.inCar.damage(dmg);
      else {
        p.damage(dmg);
        this.hud.flashDamage();
      }
    }
  }
}

new Game();
