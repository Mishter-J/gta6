// Port Meridian — story missions and taxi fares.
// A mission is a list of steps; each step type has one small update rule.
// The manager owns the 3D beacon marker, briefings and rewards.

import * as THREE from '../vendor/three.module.min.js';
import { MISSIONS, ECONOMY, TAXI_SPOTS, PLACES } from './config.js';

function makeBeacon() {
  const group = new THREE.Group();
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
  );
  pillar.position.y = 30;
  group.add(pillar);
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xffd23e })
  );
  diamond.position.y = 7;
  group.add(diamond);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.2, 3.0, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  group.add(ring);
  group.userData = { diamond, pillar };
  group.visible = false;
  return group;
}

export class MissionManager {
  constructor(scene, ctx) {
    this.scene = scene;
    this.ctx = ctx; // {player, police, traffic, combat, peds, hud, audio, addCash, onGameComplete, onBusted}
    this.beacon = makeBeacon();
    scene.add(this.beacon);
    this.missionIndex = 0;
    this.stepIndex = 0;
    this.active = false;
    this.stepState = {};
    this.killsAtStart = 0;
    this.taxi = { state: 'idle', pickup: null, drop: null, timer: 0, cooldown: 5 };
    this.taxiBeacon = makeBeacon();
    this.taxiBeacon.userData.diamond.material = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
    this.taxiBeacon.userData.pillar.material = new THREE.MeshBasicMaterial({ color: 0x2ecc71, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
    this.taxiBeacon.visible = false;
    scene.add(this.taxiBeacon);
  }

  currentMission() { return MISSIONS[this.missionIndex] ?? null; }
  currentStep() {
    const m = this.currentMission();
    return m ? m.steps[this.stepIndex] : null;
  }

  startMission(index) {
    this.missionIndex = index;
    this.stepIndex = 0;
    this.stepState = {};
    const m = this.currentMission();
    if (!m) { this.active = false; this.beacon.visible = false; return; }
    this.active = true;
    this.ctx.hud.showDialogue(m.giver, m.briefing, 8);
    this.ctx.hud.setObjective(m.title, m.steps[0].text);
    this.ctx.audio.phoneRing();
    this._enterStep();
  }

  _enterStep() {
    const step = this.currentStep();
    this.stepState = { timer: step?.seconds ?? 0, progress: 0 };
    if (!step) return;
    if (step.heat !== undefined) this.ctx.police.setWanted(step.heat);
    if (step.type === 'shootout') {
      const spots = [];
      for (let i = 0; i < step.count; i++) {
        const a = (i / step.count) * Math.PI * 2;
        spots.push({ x: step.at.x + Math.cos(a) * 14, z: step.at.z + Math.sin(a) * 14 });
      }
      this.ctx.combat.spawnEnemies(spots);
      this.killsAtStart = step.count;
    }
    if (step.type === 'enterCar' && step.missionCar) {
      // The red Comet is already parked outside Mara's garage.
    }
    this._updateMarker();
    this.ctx.hud.setObjective(this.currentMission().title, this._stepText(step));
  }

  _stepText(step) {
    if (step.type === 'shootout') {
      const left = this.ctx.combat.aliveEnemies();
      return `Eliminate the Vipers (${this.killsAtStart - left}/${this.killsAtStart})`;
    }
    if (step.type === 'timed') return `${step.text} — ${Math.ceil(this.stepState.timer)}s`;
    if (step.type === 'grabCash') return `${step.text} (${Math.ceil(this.stepState.progress)}/${step.seconds}s)`;
    return step.text;
  }

  _updateMarker() {
    const step = this.currentStep();
    if (step && step.at) {
      this.beacon.position.set(step.at.x, 0, step.at.z);
      this.beacon.visible = true;
    } else {
      this.beacon.visible = false;
    }
  }

  markerPos() {
    const step = this.currentStep();
    return step && step.at ? step.at : null;
  }

  _advance() {
    this.stepIndex++;
    const m = this.currentMission();
    if (this.stepIndex >= m.steps.length) {
      this._completeMission();
      return;
    }
    this._enterStep();
  }

  _completeMission() {
    const m = this.currentMission();
    const reward = ECONOMY.missionReward[this.missionIndex] ?? 500;
    this.ctx.addCash(reward);
    this.ctx.audio.missionComplete();
    this.ctx.hud.showBanner('MISSION COMPLETE', `${m.title}  ·  +$${reward}`);
    this.ctx.hud.showDialogue(m.giver, m.complete, 7);
    this.ctx.combat.clearEnemies();
    this.beacon.visible = false;
    this.missionIndex++;
    this.active = false;
    if (this.missionIndex >= MISSIONS.length) {
      this.ctx.onGameComplete();
      return;
    }
    // Next job after a breath.
    setTimeout(() => this.startMission(this.missionIndex), 9000);
  }

  _failMission(reason) {
    this.ctx.hud.showBanner('MISSION FAILED', reason);
    this.ctx.hud.showToast('Restarting the mission…');
    this.ctx.combat.clearEnemies();
    setTimeout(() => this.startMission(this.missionIndex), 2500);
  }

  update(dt, interactPressed) {
    // Beacon animation
    if (this.beacon.visible) {
      this.beacon.userData.diamond.rotation.y += dt * 2;
      this.beacon.userData.diamond.position.y = 7 + Math.sin(performance.now() / 300) * 0.8;
    }
    if (this.taxiBeacon.visible) {
      this.taxiBeacon.userData.diamond.rotation.y += dt * 2;
    }
    if (!this.active) { this._updateTaxi(dt); return; }
    const step = this.currentStep();
    if (!step) return;
    const p = this.ctx.player;
    const pos = p.inCar ? p.inCar.pos : p.pos;
    const dist = (at) => Math.hypot(pos.x - at.x, pos.z - at.z);
    switch (step.type) {
      case 'goto':
        if (dist(step.at) < 9) this._advance();
        break;
      case 'enterCar': {
        if (p.inCar && (!step.missionCar || p.inCar.missionCar)) {
          if (step.missionCar) this.ctx.police.addHeat(1);
          this._advance();
        }
        break;
      }
      case 'driveTo':
        if (p.inCar && dist(step.at) < 10) this._advance();
        break;
      case 'pickup':
        if (dist(step.at) < 8 && interactPressed) {
          this.ctx.audio.pickup();
          this._advance();
        }
        break;
      case 'loseCops':
        if (this.ctx.police.wanted === 0) this._advance();
        break;
      case 'shootout': {
        const left = this.ctx.combat.aliveEnemies();
        this.ctx.hud.setObjective(this.currentMission().title, this._stepText(step));
        if (left === 0) this._advance();
        break;
      }
      case 'timed': {
        this.stepState.timer -= dt;
        this.ctx.hud.setObjective(this.currentMission().title, this._stepText(step));
        if (dist(step.at) < 10) { this._advance(); break; }
        if (this.stepState.timer <= 0) this._failMission('Out of time.');
        break;
      }
      case 'grabCash': {
        if (dist(step.at) < 9 && !p.inCar) {
          this.stepState.progress += dt;
          this.ctx.hud.setObjective(this.currentMission().title, this._stepText(step));
          if (this.stepState.progress >= step.seconds) {
            this.ctx.police.addHeat(2);
            this._advance();
          }
        } else {
          this.stepState.progress = 0;
        }
        break;
      }
      default:
        break;
    }
    this._updateTaxi(dt);
  }

  // ---- Taxi side activity ----
  _updateTaxi(dt) {
    const t = this.taxi;
    const p = this.ctx.player;
    if (t.state === 'idle') {
      t.cooldown -= dt;
      if (t.cooldown <= 0 && p.inCar && !p.inCar.police && this.active) {
        const spot = TAXI_SPOTS[Math.floor(Math.random() * TAXI_SPOTS.length)];
        t.pickup = spot.from;
        t.drop = spot.to;
        t.state = 'offer';
        t.timer = 45;
        this.taxiBeacon.position.set(spot.from.x, 0, spot.from.z);
        this.taxiBeacon.visible = true;
        this.ctx.hud.showToast('Taxi fare nearby — drive into the green marker');
      }
      return;
    }
    t.timer -= dt;
    const pos = p.inCar ? p.inCar.pos : p.pos;
    const target = t.state === 'offer' ? t.pickup : t.drop;
    if (target && Math.hypot(pos.x - target.x, pos.z - target.z) < 8) {
      if (t.state === 'offer') {
        t.state = 'ride';
        t.timer = 75;
        this.taxiBeacon.position.set(t.drop.x, 0, t.drop.z);
        this.ctx.hud.showToast('Passenger aboard — take them to the destination');
        this.ctx.audio.pickup();
      } else {
        this.ctx.addCash(ECONOMY.taxiFare);
        this.ctx.hud.showToast(`Fare complete  ·  +$${ECONOMY.taxiFare}`);
        this.ctx.audio.missionComplete();
        t.state = 'idle';
        t.cooldown = 25;
        this.taxiBeacon.visible = false;
      }
      return;
    }
    if (t.timer <= 0 || !p.inCar) {
      t.state = 'idle';
      t.cooldown = 20;
      this.taxiBeacon.visible = false;
    }
  }

  taxiMarker() {
    if (this.taxi.state === 'idle') return null;
    return this.taxi.state === 'offer' ? this.taxi.pickup : this.taxi.drop;
  }
}

export { PLACES };
