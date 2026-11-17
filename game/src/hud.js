// hud.js — Port Meridian's DOM overlay: cash, wanted stars, health,
// ammo, speed, the current mission objective with a waypoint arrow and
// distance, briefing text, message toasts, and a circular minimap canvas
// (roads, player arrow, mission waypoint, police dots, car icon).

import { CONFIG, dist2D } from './config.js';

export class HUD {
  constructor(ctx) {
    this.ctx = ctx;
    this.el = {};
    for (const id of [
      'hud', 'cash', 'stars', 'health-fill', 'health-num', 'ammo', 'speed',
      'objective', 'briefing', 'toasts', 'minimap', 'crosshair', 'hint',
      'menu', 'pause-menu', 'end-screen', 'end-title', 'end-sub',
      'btn-new', 'btn-continue', 'btn-resume', 'btn-restart', 'btn-quit',
      'btn-retry', 'radio-name',
    ]) {
      this.el[id] = document.getElementById(id);
    }
    this.map = this.el['minimap'].getContext('2d');
    this.toasts = [];
    this.lastToast = ''; // latest toast text, exposed to the __PM bridge
    this.briefingTimer = 0;
  }

  // --- Screens ---------------------------------------------------------

  showMenu(canContinue) {
    this.el['menu'].style.display = 'flex';
    this.el['pause-menu'].style.display = 'none';
    this.el['end-screen'].style.display = 'none';
    this.el['hud'].style.display = 'none';
    this.el['btn-continue'].style.display = canContinue ? 'block' : 'none';
  }

  showGame() {
    this.el['menu'].style.display = 'none';
    this.el['pause-menu'].style.display = 'none';
    this.el['end-screen'].style.display = 'none';
    this.el['hud'].style.display = 'block';
  }

  showPause() {
    this.el['pause-menu'].style.display = 'flex';
  }

  hidePause() {
    this.el['pause-menu'].style.display = 'none';
  }

  showEnd(kind) {
    const end = this.el['end-screen'];
    end.style.display = 'flex';
    if (kind === 'busted') {
      this.el['end-title'].textContent = 'BUSTED';
      this.el['end-title'].style.color = '#4a90ff';
      this.el['end-sub'].textContent = 'Detective Hale has you. The Meridian PD books Rex Calloway — again.';
    } else if (kind === 'wasted') {
      this.el['end-title'].textContent = 'WASTED';
      this.el['end-title'].style.color = '#ff4444';
      this.el['end-sub'].textContent = 'Rex Calloway is down. Port Meridian keeps spinning without him.';
    } else {
      this.el['end-title'].textContent = 'JOB COMPLETE';
      this.el['end-title'].style.color = '#ffd21f';
      this.el['end-sub'].textContent = `The Meridian Job is done. Rex walks away with $${this.ctx.cash.toLocaleString()} — Mara Voss sends her regards.`;
    }
  }

  hideEnd() {
    this.el['end-screen'].style.display = 'none';
  }

  // --- Toasts & briefing ----------------------------------------------

  toast(text) {
    this.lastToast = text;
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    this.el['toasts'].appendChild(div);
    this.toasts.push({ div, t: 0 });
    while (this.toasts.length > 4) {
      const old = this.toasts.shift();
      old.div.remove();
    }
  }

  setBriefing(text) {
    this.el['briefing'].textContent = text;
    this.el['briefing'].style.opacity = '1';
    this.briefingTimer = 7;
  }

  setRadio(name) {
    this.el['radio-name'].textContent = name ? `♪ ${name}` : '';
  }

  // --- Per-frame update ------------------------------------------------

  update(dt) {
    const ctx = this.ctx;
    // Toast lifetimes.
    for (const t of [...this.toasts]) {
      t.t += dt;
      if (t.t > 4.5) {
        t.div.remove();
        this.toasts = this.toasts.filter((x) => x !== t);
      }
    }
    if (this.briefingTimer > 0) {
      this.briefingTimer -= dt;
      if (this.briefingTimer <= 0) this.el['briefing'].style.opacity = '0.25';
    }
    if (ctx.state !== 'playing' && ctx.state !== 'paused') return;

    this.el['cash'].textContent = `$${ctx.cash.toLocaleString()}`;
    const stars = '★'.repeat(ctx.police.stars) + '☆'.repeat(5 - ctx.police.stars);
    this.el['stars'].textContent = stars;
    this.el['stars'].style.color = ctx.police.stars > 0 ? '#ff4444' : '#888888';
    const hp = Math.max(0, Math.round(ctx.player.health));
    this.el['health-fill'].style.width = `${hp}%`;
    this.el['health-num'].textContent = `${hp}`;
    this.el['ammo'].textContent = ctx.combat.reloading
      ? 'RELOADING…'
      : `AMMO ${ctx.combat.ammo} / ${CONFIG.pistolMag}`;
    const mph = ctx.player.driving ? Math.round(Math.abs(ctx.player.car.speed) * 2.237) : 0;
    this.el['speed'].textContent = ctx.player.driving ? `${mph} MPH` : '';
    this.el['objective'].textContent = ctx.missions.objectiveText();
    const wp = ctx.missions.waypoint();
    const p = ctx.player.pos;
    this.el['hint'].textContent = ctx.player.driving
      ? 'E exit car · Space handbrake · F fire · R reload · P pause · M mute'
      : 'WASD move · E enter car / taxi · F fire · R reload · P pause · M mute';

    // Crosshair only on foot while playing.
    this.el['crosshair'].style.display = ctx.player.driving ? 'none' : 'block';

    this._drawMinimap(wp, p);
  }

  _drawMinimap(wp, p) {
    const c = this.map;
    const S = 180;
    const scale = S / (CONFIG.cityHalf * 2 + 90);
    const toMap = (x, z) => [S / 2 + x * scale, S / 2 + z * scale];
    c.clearRect(0, 0, S, S);
    // Circular clip.
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#20242a';
    c.fillRect(0, 0, S, S);
    // Roads.
    c.strokeStyle = '#5a5f68';
    c.lineWidth = 4;
    for (let i = 0; i <= CONFIG.blockCount; i++) {
      const line = -CONFIG.cityHalf + i * CONFIG.roadSpacing;
      const [ax] = toMap(line, 0);
      const [, bz] = toMap(0, line);
      c.beginPath(); c.moveTo(ax, 0); c.lineTo(ax, S); c.stroke();
      c.beginPath(); c.moveTo(0, bz); c.lineTo(S, bz); c.stroke();
    }
    // Water on the east edge.
    c.fillStyle = '#1e6f8e';
    const [wx] = toMap(CONFIG.waterStart, 0);
    c.fillRect(wx, 0, S - wx, S);
    // Mission waypoint.
    if (wp) {
      const [mx, my] = toMap(wp.x, wp.z);
      c.fillStyle = '#ffd21f';
      c.beginPath(); c.arc(mx, my, 5, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffd21f';
      c.lineWidth = 2;
      c.beginPath(); c.arc(mx, my, 9, 0, Math.PI * 2); c.stroke();
    }
    // Taxi destination / customer.
    const taxi = this.ctx.missions.taxi;
    if (taxi) {
      const dest = taxi.state === 'riding' ? taxi.dest : { x: taxi.customer.x, z: taxi.customer.z };
      const [mx, my] = toMap(dest.x, dest.z);
      c.fillStyle = '#2aff7a';
      c.beginPath(); c.arc(mx, my, 4, 0, Math.PI * 2); c.fill();
    }
    // Police dots.
    c.fillStyle = '#4a90ff';
    for (const car of this.ctx.police.copCars) {
      const [mx, my] = toMap(car.x, car.z);
      c.beginPath(); c.arc(mx, my, 3, 0, Math.PI * 2); c.fill();
    }
    // Other cars (faint).
    c.fillStyle = 'rgba(255,255,255,0.5)';
    for (const v of this.ctx.vehicles.vehicles) {
      if (v === this.ctx.player.car) continue;
      const [mx, my] = toMap(v.x, v.z);
      c.fillRect(mx - 1.5, my - 1.5, 3, 3);
    }
    // Player arrow (rotates with heading).
    const [px, py] = toMap(p.x, p.z);
    const heading = this.ctx.player.driving ? this.ctx.player.car.heading : this.ctx.player.heading;
    c.save();
    c.translate(px, py);
    c.rotate(heading);
    c.fillStyle = this.ctx.player.driving ? '#ffd21f' : '#ffffff';
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 6);
    c.lineTo(-5, 6);
    c.closePath();
    c.fill();
    c.restore();
    c.restore();
    // Ring border.
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    c.stroke();
    // Waypoint distance readout under the minimap is handled by the
    // objective line; the arrow in the 3D world points the way too.
    if (wp) {
      const d = Math.round(dist2D(p.x, p.z, wp.x, wp.z));
      c.fillStyle = '#ffd21f';
      c.font = 'bold 13px sans-serif';
      c.textAlign = 'center';
      c.fillText(`${d}m`, S / 2, S - 8);
    }
  }
}
