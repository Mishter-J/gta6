// Port Meridian — the HUD: DOM readouts, the circular minimap, banners,
// dialogue box, toasts and the context hint ("Press E to steal").

import { CITY } from './config.js';

export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      wanted: document.getElementById('wanted'),
      cash: document.getElementById('cash'),
      clock: document.getElementById('clock'),
      radio: document.getElementById('radio'),
      health: document.getElementById('health-fill'),
      armor: document.getElementById('armor-fill'),
      speed: document.getElementById('speed'),
      speedNum: document.getElementById('speed-num'),
      objective: document.getElementById('objective'),
      objectiveSub: document.getElementById('objective-sub'),
      minimap: document.getElementById('minimap'),
      crosshair: document.getElementById('crosshair'),
      hint: document.getElementById('hint'),
      banner: document.getElementById('banner'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      dialogue: document.getElementById('dialogue'),
      dialogueName: document.getElementById('dialogue-name'),
      dialogueText: document.getElementById('dialogue-text'),
      toast: document.getElementById('toast'),
      damage: document.getElementById('damage-flash'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.bannerTimer = null;
    this.dialogueTimer = null;
    this.toastTimer = null;
    this.gameMinutes = 18 * 60; // the day starts at 18:00, golden hour
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setObjective(title, sub) {
    this.el.objective.textContent = title;
    this.el.objectiveSub.textContent = sub ?? '';
  }

  showBanner(title, sub, ms = 2600) {
    this.el.bannerTitle.textContent = title;
    this.el.bannerSub.textContent = sub ?? '';
    this.el.banner.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => this.el.banner.classList.add('hidden'), ms);
  }

  showDialogue(name, text, seconds = 6) {
    this.el.dialogueName.textContent = name;
    this.el.dialogueText.textContent = text;
    this.el.dialogue.classList.remove('hidden');
    clearTimeout(this.dialogueTimer);
    this.dialogueTimer = setTimeout(() => this.el.dialogue.classList.add('hidden'), seconds * 1000);
  }

  hideDialogue() {
    clearTimeout(this.dialogueTimer);
    this.el.dialogue.classList.add('hidden');
  }

  showToast(text, ms = 3000) {
    this.el.toast.textContent = text;
    this.el.toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.add('hidden'), ms);
  }

  showHint(html) {
    this.el.hint.innerHTML = html;
    this.el.hint.classList.remove('hidden');
  }

  hideHint() { this.el.hint.classList.add('hidden'); }

  flashDamage() {
    this.el.damage.style.opacity = '1';
    setTimeout(() => { this.el.damage.style.opacity = '0'; }, 130);
  }

  /** Per-frame HUD refresh. state: {cash, health, armor, wanted, speedMph, inCar, armed, radio} */
  update(dt, state) {
    this.gameMinutes += dt * 2.2; // game clock runs faster than real time
    const mins = Math.floor(this.gameMinutes) % (24 * 60);
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    this.el.clock.textContent = `${hh}:${mm}`;
    let stars = '';
    for (let i = 0; i < 5; i++) {
      stars += i < state.wanted ? '★' : '<span class="off">★</span>';
    }
    this.el.wanted.innerHTML = stars;
    this.el.cash.textContent = `$${state.cash.toLocaleString('en-US')}`;
    this.el.health.style.width = `${Math.max(0, state.health)}%`;
    this.el.armor.style.width = `${Math.max(0, state.armor)}%`;
    this.el.radio.textContent = state.radio ?? '';
    if (state.inCar) {
      this.el.speed.classList.remove('hidden');
      this.el.speedNum.textContent = String(Math.round(state.speedMph));
    } else {
      this.el.speed.classList.add('hidden');
    }
    if (state.armed && !state.inCar) this.el.crosshair.classList.remove('hidden');
    else this.el.crosshair.classList.add('hidden');
  }

  /** Top-down minimap: roads, beach, player, mission marker, cops, cars. */
  drawMinimap(world, playerPos, playerHeading, missionMarker, taxiMarker, copCars, footCops, cars, playerCar) {
    const g = this.mm;
    const W = 208, H = 208;
    const S = CITY.size;
    const scale = W / (S + 80);
    const toX = (x) => (x + 40) * scale;
    const toY = (z) => (z + 40) * scale;
    g.clearRect(0, 0, W, H);
    // Background: city blocks
    g.fillStyle = '#1a2436';
    g.fillRect(0, 0, W, H);
    // Beach + water
    g.fillStyle = '#e8cf9e';
    g.fillRect(0, toY(S), W, H - toY(S));
    g.fillStyle = '#1e6f8e';
    g.fillRect(0, toY(S + 24), W, H - toY(S + 24));
    // Roads
    g.fillStyle = '#3a3f4a';
    for (let i = 0; i <= CITY.blocks; i++) {
      const v = toX(i * CITY.pitch);
      g.fillRect(v - 3, 0, 6, toY(S));
      g.fillRect(0, v - 3, toX(S), 6);
    }
    // Mission marker (yellow diamond)
    const blip = (x, z, color, r) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(toX(x), toY(z), r, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.stroke();
    };
    if (missionMarker) blip(missionMarker.x, missionMarker.z, '#ffd23e', 6);
    if (taxiMarker) blip(taxiMarker.x, taxiMarker.z, '#2ecc71', 5);
    // Cars (white dots) and cops (flashing blue/red)
    for (const car of cars) {
      if (car.dead) continue;
      if (car.police) {
        const t = Math.floor(performance.now() / 300) % 2 === 0;
        blip(car.pos.x, car.pos.z, t ? '#ff2020' : '#2040ff', 4);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(toX(car.pos.x) - 2, toY(car.pos.z) - 2, 4, 4);
      }
    }
    for (const cop of footCops) {
      if (cop.dead) continue;
      blip(cop.pos.x, cop.pos.z, '#4a90ff', 3);
    }
    void world;
    // Player arrow
    const px = toX(playerPos.x), py = toY(playerPos.z);
    g.save();
    g.translate(px, py);
    g.rotate(playerHeading);
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, -8);
    g.lineTo(5.5, 6);
    g.lineTo(0, 3);
    g.lineTo(-5.5, 6);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    void playerCar;
  }
}
