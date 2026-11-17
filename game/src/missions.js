// missions.js — Port Meridian's story: Rex Calloway, a wheelman back in
// town; fixer Mara Voss hands out the jobs, Detective Hale hunts him.
// Six missions in order, each with on-screen objective text, a waypoint
// beacon + distance, and a cash reward. Plus the taxi side activity.

import { CONFIG, dist2D } from './config.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'First Wheels',
    briefing: 'Mara Voss: "Welcome back, Rex. First, wheels. Steal the red Comet by the plaza and bring it to my garage."',
    reward: 500,
  },
  {
    id: 2,
    title: 'Dock Pickup',
    briefing: 'Mara Voss: "A package is waiting at the docks. Grab it — and mind the heat, the PD is watching the piers."',
    reward: 400,
  },
  {
    id: 3,
    title: 'Lose the Tail',
    briefing: 'Detective Hale has your plate. Lose the tail — get your wanted level down to zero.',
    reward: 600,
  },
  {
    id: 4,
    title: 'Payback',
    briefing: 'Mara Voss: "The Vipers torched my last driver. Five of them are holed up at the west warehouse. Settle it."',
    reward: 800,
  },
  {
    id: 5,
    title: 'Cross-Town Drop',
    briefing: 'Mara Voss: "Hot package, cold trail. Get it across town in 90 seconds — the buyer does not wait."',
    reward: 1000,
  },
  {
    id: 6,
    title: 'The Meridian Job',
    briefing: 'Mara Voss: "The big one. Meridian Bank. Get inside, hold the vault, and walk out rich. Hale will bring everything he has."',
    reward: 5000,
  },
];

// Fixed story locations (x, z).
export const SPOTS = {
  comet: { x: 52, z: 36 },
  garage: { x: 200, z: 40 },
  docks: { x: -84, z: 262 },
  warehouse: { x: -200, z: 8 },
  bank: { x: -40, z: -182 },
  dropoff: { x: -200, z: -240 },
  plaza: { x: 40, z: 40 },
};

export class MissionManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.index = 0; // 0-based mission; 6 = story complete
    this.stage = 'go'; // per-mission sub-stage
    this.stageTimer = 0;
    this.vipersDown = 0;
    this.vipersTotal = 5;
    this.taxi = null; // { customer, dest, fare, pickupX, pickupZ }
    this.packageTimer = 0;
    this.holdTimer = 0;
  }

  get current() {
    return MISSIONS[this.index] || null;
  }

  get complete() {
    return this.index >= MISSIONS.length;
  }

  start() {
    this.index = 0;
    this.stage = 'go';
    this.vipersDown = 0;
    this.taxi = null;
    this._applyStage();
  }

  // Objective line shown in the HUD.
  objectiveText() {
    if (this.complete) return 'Story complete — Port Meridian is yours.';
    const m = this.current;
    switch (this.index) {
      case 0:
        return this.stage === 'steal'
          ? `Mission 1 — ${m.title}: Steal the red Comet`
          : `Mission 1 — ${m.title}: Drive the Comet to Mara's garage`;
      case 1:
        return this.stage === 'collect'
          ? `Mission 2 — ${m.title}: Collect the package at the docks`
          : `Mission 2 — ${m.title}: Drive to the docks`;
      case 2:
        return `Mission 3 — ${m.title}: Lose the cops (wanted ${this.ctx.police.stars}★ — get to 0)`;
      case 3:
        return `Mission 4 — ${m.title}: Defeat the Vipers (${this.vipersDown}/${this.vipersTotal})`;
      case 4:
        return this.stage === 'drive'
          ? `Mission 5 — ${m.title}: Deliver across town — ${Math.ceil(this.packageTimer)}s left!`
          : `Mission 5 — ${m.title}: Pick up the package at the plaza`;
      case 5:
        return this.stage === 'hold'
          ? `Mission 6 — ${m.title}: Hold the vault! ${Math.ceil(this.holdTimer)}s`
          : `Mission 6 — ${m.title}: Get to Meridian Bank`;
      default:
        return m.title;
    }
  }

  // Current waypoint position for the HUD arrow / minimap / beacon.
  waypoint() {
    if (this.complete) return null;
    switch (this.index) {
      case 0: return this.stage === 'steal' ? SPOTS.comet : SPOTS.garage;
      case 1: return SPOTS.docks;
      case 2: return null; // no fixed point: the goal is to lose the tail
      case 3: return SPOTS.warehouse;
      case 4: return this.stage === 'pickup' ? SPOTS.plaza : SPOTS.dropoff;
      case 5: return SPOTS.bank;
      default: return null;
    }
  }

  _applyStage() {
    const ctx = this.ctx;
    // Normalise the opening stage for missions whose first step has its
    // own name (steal the Comet / pick up the package).
    if (this.index === 0 && this.stage === 'go') this.stage = 'steal';
    if (this.index === 4 && this.stage === 'go') this.stage = 'pickup';
    ctx.world.removeBeacon('mission');
    const wp = this.waypoint();
    if (wp) ctx.world.addBeacon('mission', wp.x, wp.z, 0xffd21f);
    const m = this.current;
    if (m) {
      ctx.hud.toast(`${m.title} — $${m.reward}`);
      ctx.hud.setBriefing(m.briefing);
      ctx.audio.missionSting();
    }
    if (this.index === 2) {
      // Mission 3 starts hot: a 3-star pursuit.
      ctx.police.wanted = 3;
      ctx.audio.setSiren(3);
    }
    if (this.index === 3) {
      this._spawnVipers();
    }
    if (this.index === 4) {
      this.packageTimer = CONFIG.dropTimeLimit;
    }
    if (this.index === 5) {
      this.holdTimer = 10;
    }
  }

  _spawnVipers() {
    const spots = [
      { x: -196, z: 4 }, { x: -206, z: 12 }, { x: -190, z: 20 },
      { x: -212, z: -2 }, { x: -198, z: 26 },
    ];
    for (const s of spots) this.ctx.pedestrians.spawnViper(s.x, s.z);
    this.vipersDown = 0;
    this.vipersTotal = spots.length;
  }

  onViperDown() {
    this.vipersDown += 1;
    this.ctx.hud.toast(`Viper down (${this.vipersDown}/${this.vipersTotal})`);
    if (this.vipersDown >= this.vipersTotal && this.index === 3) {
      this._finishMission();
    }
  }

  _finishMission() {
    const m = this.current;
    if (!m) return;
    const reward = CONFIG.missionRewards[this.index] ?? m.reward;
    this.ctx.cash += reward;
    this.ctx.hud.toast(`Mission complete! +$${reward}`);
    this.ctx.audio.cash();
    this.index += 1;
    this.stage = 'go';
    // Save AFTER advancing: the save must record the NEXT mission,
    // or Continue resumes the mission that just finished.
    this.ctx.saveGame();
    if (this.complete) {
      this.ctx.world.removeBeacon('mission');
      this.ctx.setState('complete');
      return;
    }
    this._applyStage();
  }

  _failMission(reason) {
    this.ctx.hud.toast(`${reason} — mission failed, try again`);
    this.ctx.audio.dryClick();
    this.stage = 'go';
    if (this.index === 4) this.packageTimer = CONFIG.dropTimeLimit;
    if (this.index === 5) this.holdTimer = 10;
    this._applyStage();
  }

  update(dt) {
    if (this.ctx.state !== 'playing' || this.complete) return;
    const p = this.ctx.player.pos;
    const player = this.ctx.player;

    switch (this.index) {
      case 0: {
        if (this.stage === 'steal' && player.driving && player.car && player.car.isComet) {
          this.stage = 'drive';
          this._applyStage();
        } else if (this.stage === 'drive' && player.driving && player.car && player.car.isComet) {
          // Generous trigger: the garage shed is walled on three sides,
          // so parking on its threshold counts as arriving.
          if (dist2D(p.x, p.z, SPOTS.garage.x, SPOTS.garage.z) < 20) this._finishMission();
        }
        break;
      }
      case 1: {
        if (dist2D(p.x, p.z, SPOTS.docks.x, SPOTS.docks.z) < 10) {
          if (this.stage === 'go') {
            this.stage = 'collect';
            this.stageTimer = 2;
            this.ctx.hud.toast('Grabbing the package...');
          } else if (this.stage === 'collect') {
            this.stageTimer -= dt;
            if (this.stageTimer <= 0) {
              this.ctx.police.addWanted(1, 'spotted at the docks');
              this._finishMission();
            }
          }
        } else if (this.stage === 'collect') {
          this.stage = 'go'; // walked away mid-grab
        }
        break;
      }
      case 2: {
        if (this.ctx.police.wanted <= 0.01) this._finishMission();
        break;
      }
      case 3: {
        // Completion is driven by onViperDown().
        break;
      }
      case 4: {
        if (this.stage === 'pickup') {
          if (dist2D(p.x, p.z, SPOTS.plaza.x, SPOTS.plaza.z) < 8) {
            this.stage = 'drive';
            this.packageTimer = CONFIG.dropTimeLimit;
            this._applyStage();
            this.ctx.hud.toast('Package secured — GO!');
          }
        } else {
          this.packageTimer -= dt;
          if (this.packageTimer <= 0) {
            this._failMission('Out of time');
          } else if (dist2D(p.x, p.z, SPOTS.dropoff.x, SPOTS.dropoff.z) < 10) {
            this._finishMission();
          }
        }
        break;
      }
      case 5: {
        if (this.stage === 'go') {
          if (dist2D(p.x, p.z, SPOTS.bank.x, SPOTS.bank.z) < 12) {
            this.stage = 'hold';
            this.holdTimer = 10;
            this.ctx.police.wanted = Math.max(this.ctx.police.wanted, 3);
            this.ctx.audio.setSiren(3);
            this.ctx.hud.toast('Cracking the vault — hold on!');
            this._applyStage();
          }
        } else {
          this.holdTimer -= dt;
          if (dist2D(p.x, p.z, SPOTS.bank.x, SPOTS.bank.z) > 18) {
            this.stage = 'go';
            this.holdTimer = 10;
            this._applyStage();
          } else if (this.holdTimer <= 0) {
            this._finishMission();
          }
        }
        break;
      }
      default:
        break;
    }
    this._updateTaxi(dt, p);
  }

  // Taxi side activity: a yellow-marked customer waits; E picks them up
  // (on foot, nearby); drive them to the beacon for a distance-based fare.
  _updateTaxi(dt, p) {
    const ctx = this.ctx;
    if (!this.taxi) {
      // A customer appears when the player is on foot in the city.
      // Seeded RNG (deterministic per session) instead of Math.random().
      const rng = ctx.rng;
      if (!ctx.player.driving && ctx.time % 1 < dt && rng() < 0.02) {
        const angle = rng() * Math.PI * 2;
        const cx = Math.max(-260, Math.min(260, p.x + Math.sin(angle) * 60));
        const cz = Math.max(-260, Math.min(260, p.z + Math.cos(angle) * 60));
        const customer = ctx.pedestrians.spawnTaxiCustomer(cx, cz);
        const dest = { x: -240 + rng() * 480, z: -240 + rng() * 480 };
        this.taxi = { customer, dest, state: 'waiting' };
        ctx.world.addBeacon('taxi', cx, cz, 0xffd21f);
        ctx.hud.toast('A taxi customer is waving — press E near them');
      }
      return;
    }
    const t = this.taxi;
    if (t.state === 'waiting') {
      if (!t.customer.alive) { this._clearTaxi(); return; }
      const d = dist2D(p.x, p.z, t.customer.x, t.customer.z);
      if (d < 4 && ctx.input.wasPressed('KeyE')) {
        t.state = 'riding';
        t.fare = Math.max(
          CONFIG.taxiMinFare,
          Math.round(dist2D(t.customer.x, t.customer.z, t.dest.x, t.dest.z) * CONFIG.taxiFarePerMetre),
        );
        ctx.world.removeBeacon('taxi');
        ctx.world.addBeacon('taxi', t.dest.x, t.dest.z, 0x2aff7a);
        ctx.hud.toast(`Passenger aboard — fare $${t.fare}`);
        ctx.audio.pickup();
      }
    } else if (t.state === 'riding') {
      if (!ctx.player.driving) {
        // Passenger bails if the player gets out mid-ride.
        this._clearTaxi();
        ctx.hud.toast('Passenger left — fare lost');
        return;
      }
      if (dist2D(p.x, p.z, t.dest.x, t.dest.z) < 10) {
        ctx.cash += t.fare;
        ctx.hud.toast(`Fare paid! +$${t.fare}`);
        ctx.audio.cash();
        this._clearTaxi();
        ctx.saveGame();
      }
    }
  }

  _clearTaxi() {
    if (this.taxi) {
      if (this.taxi.customer.alive) this.taxi.customer._despawn();
      this.taxi = null;
    }
    this.ctx.world.removeBeacon('taxi');
  }
}
