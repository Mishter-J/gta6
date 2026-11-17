// Port Meridian — missions.js
// Six story missions for Rex Calloway, in order, each with on-screen
// objective text, a waypoint marker and a cash reward. Fixer Mara Voss
// hands out the jobs; Detective Hale hunts you. Mission progress and
// cash persist through the save system. A small taxi side activity
// runs alongside: pick up a marked pedestrian, drive them across town.

import * as THREE from '../vendor/three.module.min.js';
import { CONFIG, dist2 } from './config.js';

const DEFS = [
  {
    name: 'First Wheels',
    objective: 'Steal the red Comet and bring it to the marked garage',
    reward: CONFIG.rewards.m1,
    waypoint: () => ({ x: CONFIG.garagePos.x, z: CONFIG.garagePos.z, r: CONFIG.garageRadius }),
  },
  {
    name: 'Dock Pickup',
    objective: 'Drive to the docks and collect the package while heat is on',
    reward: CONFIG.rewards.m2,
    waypoint: () => ({ x: CONFIG.docksPos.x, z: CONFIG.docksPos.z, r: 12 }),
  },
  {
    name: 'Lose the Tail',
    objective: 'Escape the pursuit — get your wanted level down to 0 stars',
    reward: CONFIG.rewards.m3,
    waypoint: () => null,
  },
  {
    name: 'Payback',
    objective: 'Warehouse shootout: defeat all 5 Vipers gang members',
    reward: CONFIG.rewards.m4,
    waypoint: () => ({ x: CONFIG.warehousePos.x, z: CONFIG.warehousePos.z, r: 16 }),
  },
  {
    name: 'Cross-Town Drop',
    objective: 'Deliver the package across town within 90 seconds',
    reward: CONFIG.rewards.m5,
    waypoint: () => ({ x: CONFIG.dropPos.x, z: CONFIG.dropPos.z, r: 12 }),
  },
  {
    name: 'The Meridian Job',
    objective: 'Finale at Meridian Bank: clear the guards, then reach the bank',
    reward: CONFIG.rewards.m6,
    waypoint: () => ({ x: CONFIG.bankPos.x, z: CONFIG.bankPos.z, r: 14 }),
  },
];

function makeEnemyMesh(color) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xb98a68 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 8), shirt);
  body.position.y = 1.15;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), skin);
  head.position.y = 2.05;
  g.add(head);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), pants);
  gun.position.set(0.3, 1.3, 0.4);
  g.add(gun);
  for (const sx of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.26), pants);
    leg.position.set(sx, 0.38, 0);
    g.add(leg);
  }
  return g;
}

export class Missions {
  // callbacks: { toast(msg), setWanted(n), onMissionComplete(def),
  //              onAllComplete(), onDamage(amount, kind) }
  constructor(scene, callbacks) {
    this.scene = scene;
    this.cb = callbacks;
    this.index = 0;
    this.timer = 0;
    this.enemies = [];
    this.time = 0;
    this.shootTimer = 0;
    // Taxi side activity: one waiting fare at a time.
    this.taxi = {
      state: 'waiting',
      pickup: { x: 40, z: 120 },
      dest: { x: -40, z: -120 },
      mesh: null,
    };
    const fare = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe14a }),
    );
    fare.position.set(this.taxi.pickup.x, 1.2, this.taxi.pickup.z);
    scene.add(fare);
    this.taxi.mesh = fare;
  }

  reset() {
    this.index = 0;
    this.timer = 0;
    this._clearEnemies();
    this.taxi.state = 'waiting';
    this.taxi.mesh.visible = true;
    this.taxi.mesh.position.set(this.taxi.pickup.x, 1.2, this.taxi.pickup.z);
  }

  _clearEnemies() {
    for (const e of this.enemies) this.scene.remove(e.mesh);
    this.enemies = [];
  }

  currentDef() {
    return DEFS[this.index] || null;
  }

  objectiveText() {
    const def = this.currentDef();
    if (!def) return 'All jobs done — Port Meridian is yours.';
    let text = `Mission ${this.index + 1}/6 — ${def.name}: ${def.objective}`;
    if (this.index === 4 && this.timer > 0) text += ` (${Math.ceil(this.timer)}s left)`;
    return text;
  }

  waypoint() {
    const def = this.currentDef();
    return def ? def.waypoint() : null;
  }

  startMission(i) {
    this.index = i;
    this.timer = 0;
    this._clearEnemies();
    if (i === 1) {
      // Heat from the Comet steal is still on — no reset needed.
      this.cb.toast('Mara Voss: heat is on — grab the package at the docks.');
    } else if (i === 2) {
      this.cb.setWanted(3);
      this.cb.toast('Detective Hale is on your tail — lose them!');
    } else if (i === 3) {
      this._spawnEnemies(CONFIG.warehousePos, 5, 0x8a2a2a, 'Viper');
      this.cb.toast('Payback: clear out the Vipers at the warehouse.');
    } else if (i === 4) {
      this.timer = 90;
      this.cb.toast('Cross-Town Drop: 90 seconds. Drive!');
    } else if (i === 5) {
      this._spawnEnemies(CONFIG.bankPos, 3, 0x2a3a8a, 'Guard');
      this.cb.toast('The Meridian Job: clear the guards, hit the bank.');
    }
  }

  _spawnEnemies(center, count, color, label) {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = center.x + Math.cos(angle) * 10;
      const z = center.z + Math.sin(angle) * 10;
      const mesh = makeEnemyMesh(color);
      mesh.position.set(x, 0, z);
      this.scene.add(mesh);
      this.enemies.push({ x, z, health: 100, alive: true, mesh, label, shootIn: 1 + i * 0.4 });
    }
  }

  _completeCurrent() {
    const def = this.currentDef();
    if (!def) return;
    // Advance first, so the completion callback (cash + auto-save)
    // records the NEW mission index, not the finished one.
    this.index += 1;
    this.cb.onMissionComplete(def);
    if (this.index >= DEFS.length) {
      this.cb.onAllComplete();
      return;
    }
    this.startMission(this.index);
  }

  update(dt, ctx) {
    // ctx: { playerX, playerZ, inCar, carIsComet, wanted, onDamage }
    this.time += dt;
    const def = this.currentDef();
    if (!def) return;

    // Enemies advance on the player and shoot when close.
    this.shootTimer -= dt;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist2(e.x, e.z, ctx.playerX, ctx.playerZ);
      if (d > 3 && d < 60) {
        const dx = (ctx.playerX - e.x) / d;
        const dz = (ctx.playerZ - e.z) / d;
        e.x += dx * 3.2 * dt;
        e.z += dz * 3.2 * dt;
        e.mesh.position.set(e.x, 0, e.z);
        e.mesh.rotation.y = Math.atan2(dx, dz);
      }
      e.shootIn -= dt;
      if (e.shootIn <= 0 && d < 35 && !ctx.inCar) {
        e.shootIn = 1.6;
        if (ctx.onDamage) ctx.onDamage(4, 'enemy');
      }
    }

    // Taxi side activity.
    if (this.taxi.state === 'waiting' && ctx.inCar) {
      if (dist2(ctx.playerX, ctx.playerZ, this.taxi.pickup.x, this.taxi.pickup.z) < 6) {
        this.taxi.state = 'riding';
        this.taxi.mesh.visible = false;
        this.cb.toast('Fare picked up — drive them across town.');
      }
    } else if (this.taxi.state === 'riding' && ctx.inCar) {
      if (dist2(ctx.playerX, ctx.playerZ, this.taxi.dest.x, this.taxi.dest.z) < 10) {
        this.taxi.state = 'waiting';
        this.taxi.mesh.visible = true;
        this.cb.toast(`Taxi fare paid: +$${CONFIG.taxiFare}`);
        if (this.cb.onTaxiFare) this.cb.onTaxiFare(CONFIG.taxiFare);
      }
    }

    // Mission completion checks.
    if (this.index === 0) {
      if (ctx.inCar && ctx.carIsComet &&
          dist2(ctx.playerX, ctx.playerZ, CONFIG.garagePos.x, CONFIG.garagePos.z) < CONFIG.garageRadius) {
        this._completeCurrent();
      }
    } else if (this.index === 1) {
      if (dist2(ctx.playerX, ctx.playerZ, CONFIG.docksPos.x, CONFIG.docksPos.z) < 12) {
        this._completeCurrent();
      }
    } else if (this.index === 2) {
      if (ctx.wanted <= 0) this._completeCurrent();
    } else if (this.index === 3) {
      if (this.enemies.length > 0 && this.enemies.every((e) => !e.alive)) {
        this._completeCurrent();
      }
    } else if (this.index === 4) {
      this.timer -= dt;
      if (dist2(ctx.playerX, ctx.playerZ, CONFIG.dropPos.x, CONFIG.dropPos.z) < 12) {
        this._completeCurrent();
      } else if (this.timer <= 0) {
        this.timer = 90;
        this.cb.toast('Too slow — the drop window reset. Try again.');
      }
    } else if (this.index === 5) {
      const cleared = this.enemies.length > 0 && this.enemies.every((e) => !e.alive);
      if (cleared && dist2(ctx.playerX, ctx.playerZ, CONFIG.bankPos.x, CONFIG.bankPos.z) < 14) {
        this._completeCurrent();
      }
    }
  }
}
