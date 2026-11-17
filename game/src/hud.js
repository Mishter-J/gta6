// Port Meridian — hud.js
// DOM overlay built entirely by this module: cash, wanted stars,
// health, ammo, speed, mission objective + waypoint arrow/distance,
// message toasts, a circular minimap canvas, and the menu / pause /
// busted / wasted / complete screens. The controls line is set with
// textContent and plain separators — no HTML entities, no <br> tags.

export class HUD {
  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'pm-ui';
    document.body.appendChild(this.root);

    const style = document.createElement('style');
    style.textContent = `
      #pm-ui { position: fixed; inset: 0; pointer-events: none; font-family: Arial, Helvetica, sans-serif; color: #fff; z-index: 10; }
      #pm-ui .topbar { position: absolute; top: 12px; left: 12px; right: 12px; display: flex; gap: 18px; font-size: 20px; font-weight: bold; text-shadow: 0 2px 4px #000; }
      #pm-ui .topbar .stars { color: #ffd76a; letter-spacing: 2px; }
      #pm-ui .healthbar { width: 130px; height: 12px; background: #222; border: 1px solid #fff; display: inline-block; vertical-align: middle; }
      #pm-ui .healthbar i { display: block; height: 100%; background: #3fae5a; }
      #pm-ui .objective { position: absolute; top: 52px; left: 12px; max-width: 520px; font-size: 16px; background: rgba(0,0,0,0.55); padding: 8px 12px; border-radius: 6px; line-height: 1.4; }
      #pm-ui .objective .arrow { font-size: 22px; color: #ffd76a; }
      #pm-ui .toast { position: absolute; bottom: 110px; left: 50%; transform: translateX(-50%); font-size: 19px; font-weight: bold; background: rgba(0,0,0,0.65); padding: 10px 18px; border-radius: 8px; display: none; text-align: center; max-width: 80%; }
      #pm-ui #pm-minimap { position: absolute; right: 14px; bottom: 14px; width: 170px; height: 170px; border-radius: 50%; border: 3px solid rgba(255,255,255,0.85); background: rgba(10,14,20,0.85); }
      #pm-ui .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(8,10,18,0.72); pointer-events: auto; text-align: center; }
      #pm-ui .overlay h1 { font-size: 64px; margin: 0; letter-spacing: 6px; color: #ffd76a; text-shadow: 0 4px 18px #000; }
      #pm-ui .overlay h2 { font-size: 30px; margin: 6px 0 18px 0; color: #fff; }
      #pm-ui .overlay .sub { font-size: 18px; margin: 4px 0 20px 0; color: #ffe9b0; }
      #pm-ui .overlay .controls { font-size: 15px; color: #ddd; margin: 18px 0 8px 0; max-width: 720px; line-height: 1.7; }
      #pm-ui .overlay button { pointer-events: auto; font-size: 20px; font-weight: bold; padding: 12px 30px; margin: 6px; border: none; border-radius: 8px; background: #ffd76a; color: #222; cursor: pointer; }
      #pm-ui .overlay button.secondary { background: #e8e8e8; }
      #pm-ui .overlay button:disabled { opacity: 0.45; cursor: default; }
      #pm-ui .hidden { display: none !important; }
    `;
    document.head.appendChild(style);

    this.root.innerHTML = '';
    // Top bar.
    this.topbar = this._div('topbar');
    this.cashEl = this._span('$0');
    this.starsEl = this._span('', 'stars');
    this.healthWrap = this._span('');
    this.healthBar = document.createElement('span');
    this.healthBar.className = 'healthbar';
    this.healthFill = document.createElement('i');
    this.healthBar.appendChild(this.healthFill);
    this.healthWrap.appendChild(document.createTextNode('HP '));
    this.healthWrap.appendChild(this.healthBar);
    this.ammoEl = this._span('12 / 48');
    this.speedEl = this._span('');
    this.topbar.append(this.cashEl, this.starsEl, this.healthWrap, this.ammoEl, this.speedEl);
    this.root.appendChild(this.topbar);

    this.objectiveEl = this._div('objective');
    this.root.appendChild(this.objectiveEl);

    this.toastEl = this._div('toast');
    this.root.appendChild(this.toastEl);

    this.minimap = document.createElement('canvas');
    this.minimap.id = 'pm-minimap';
    this.minimap.width = 170;
    this.minimap.height = 170;
    this.root.appendChild(this.minimap);

    // Menu overlay.
    this.menuEl = this._overlay('menu');
    const title = document.createElement('h1');
    title.textContent = 'PORT MERIDIAN';
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = 'An open-world crime story — Rex Calloway is back in town.';
    this.btnNew = this._button('New Game', 'btn-new');
    this.btnContinue = this._button('Continue', 'btn-continue');
    const controls = document.createElement('div');
    controls.className = 'controls';
    controls.id = 'pm-controls';
    controls.textContent = 'WASD / Arrows — Move and Drive · Mouse — Look and Fire · E — Enter / Exit Car · F — Fire · R — Reload · Space — Handbrake · P / Esc — Pause · M — Mute';
    this.menuEl.append(title, sub, this.btnNew, this.btnContinue, controls);
    this.root.appendChild(this.menuEl);

    // Pause overlay.
    this.pauseEl = this._overlay('pause');
    const pauseTitle = document.createElement('h2');
    pauseTitle.textContent = 'PAUSED';
    this.btnResume = this._button('Resume', 'btn-resume');
    this.btnRestart = this._button('Restart Mission', 'btn-restart');
    this.btnSaveQuit = this._button('Save and Quit to Menu', 'btn-savequit');
    this.btnSaveQuit.classList.add('secondary');
    this.pauseEl.append(pauseTitle, this.btnResume, this.btnRestart, this.btnSaveQuit);
    this.root.appendChild(this.pauseEl);

    // Busted / wasted overlay.
    this.endEl = this._overlay('end');
    this.endTitle = document.createElement('h1');
    this.endTitle.textContent = 'BUSTED';
    this.endText = document.createElement('div');
    this.endText.className = 'sub';
    this.btnRetry = this._button('Retry Mission', 'btn-retry');
    this.btnQuitMenu = this._button('Quit to Menu', 'btn-quit-menu');
    this.btnQuitMenu.classList.add('secondary');
    this.endEl.append(this.endTitle, this.endText, this.btnRetry, this.btnQuitMenu);
    this.root.appendChild(this.endEl);

    // Job complete overlay.
    this.completeEl = this._overlay('complete');
    const doneTitle = document.createElement('h1');
    doneTitle.textContent = 'JOB COMPLETE';
    this.completeText = document.createElement('div');
    this.completeText.className = 'sub';
    this.btnPlayAgain = this._button('Play Again', 'btn-playagain');
    this.completeEl.append(doneTitle, this.completeText, this.btnPlayAgain);
    this.root.appendChild(this.completeEl);

    this._toastTimer = null;
    this.showMenu(false);
  }

  _div(cls) {
    const d = document.createElement('div');
    if (cls) d.className = cls;
    return d;
  }

  _span(text, cls) {
    const s = document.createElement('span');
    if (cls) s.className = cls;
    s.textContent = text;
    return s;
  }

  _overlay(name) {
    const d = this._div('overlay hidden');
    d.id = `pm-${name}`;
    return d;
  }

  _button(label, id) {
    const b = document.createElement('button');
    b.id = id;
    b.textContent = label;
    return b;
  }

  _hideAllOverlays() {
    for (const el of [this.menuEl, this.pauseEl, this.endEl, this.completeEl]) {
      el.classList.add('hidden');
    }
  }

  showMenu(canContinue) {
    this._hideAllOverlays();
    this.menuEl.classList.remove('hidden');
    this.btnContinue.disabled = !canContinue;
    this.topbar.classList.add('hidden');
    this.objectiveEl.classList.add('hidden');
    this.minimap.classList.add('hidden');
  }

  showPlaying() {
    this._hideAllOverlays();
    this.topbar.classList.remove('hidden');
    this.objectiveEl.classList.remove('hidden');
    this.minimap.classList.remove('hidden');
  }

  showPause() {
    this._hideAllOverlays();
    this.pauseEl.classList.remove('hidden');
  }

  showEnd(kind, text) {
    this._hideAllOverlays();
    this.endTitle.textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    this.endText.textContent = text || '';
    this.endEl.classList.remove('hidden');
  }

  showComplete(text) {
    this._hideAllOverlays();
    this.completeText.textContent = text || '';
    this.completeEl.classList.remove('hidden');
  }

  toast(msg, ms) {
    this.toastEl.textContent = msg;
    this.toastEl.style.display = 'block';
    if (this._toastTimer) clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.style.display = 'none';
    }, ms || 3500);
  }

  update(s) {
    this.cashEl.textContent = `$${s.cash}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    this.starsEl.textContent = stars;
    this.healthFill.style.width = `${Math.max(0, Math.min(100, s.health))}%`;
    this.ammoEl.textContent = `${s.mag} / ${s.reserve}`;
    this.speedEl.textContent = s.inCar ? `${Math.round(s.speedKmh)} MPH` : '';
    let obj = s.objective || '';
    if (s.waypointDist != null) {
      const arrow = this._arrowChar(s.waypointAngle);
      obj += `  ${arrow} ${Math.round(s.waypointDist)}m`;
    }
    this.objectiveEl.textContent = obj;
    this._drawMinimap(s);
  }

  _arrowChar(angle) {
    if (angle == null) return '◆';
    // angle: relative bearing, 0 = ahead. 8-way arrow.
    const dirs = ['▲', '↗', '▶', '↘', '▼', '↙', '◀', '↖'];
    const idx = Math.round(((angle % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 4)) % 8;
    return dirs[idx];
  }

  _drawMinimap(s) {
    const c = this.minimap.getContext('2d');
    if (!c) return;
    const W = 170;
    const H = 170;
    const cx = W / 2;
    const cy = H / 2;
    const scale = W / 320; // city 300 wide -> fits
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(20,26,34,0.9)';
    c.beginPath();
    c.arc(cx, cy, 84, 0, Math.PI * 2);
    c.fill();
    c.save();
    c.beginPath();
    c.arc(cx, cy, 84, 0, Math.PI * 2);
    c.clip();
    const toMap = (x, z) => [cx + x * scale, cy + z * scale];
    // Roads.
    c.strokeStyle = '#5a6068';
    c.lineWidth = 5;
    for (const r of [-120, -80, -40, 0, 40, 80, 120]) {
      const [x1, y1] = toMap(r, -150);
      const [x2, y2] = toMap(r, 150);
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      const [x3, y3] = toMap(-150, r);
      const [x4, y4] = toMap(150, r);
      c.beginPath(); c.moveTo(x3, y3); c.lineTo(x4, y4); c.stroke();
    }
    // Waypoint.
    if (s.waypoint) {
      const [wx, wy] = toMap(s.waypoint.x, s.waypoint.z);
      c.fillStyle = '#ffd76a';
      c.beginPath(); c.arc(wx, wy, 6, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 1.5;
      c.stroke();
    }
    // Taxi fare.
    if (s.taxi && s.taxi.visible) {
      const [tx, ty] = toMap(s.taxi.x, s.taxi.z);
      c.fillStyle = '#ffe14a';
      c.beginPath(); c.arc(tx, ty, 4, 0, Math.PI * 2); c.fill();
    }
    // Police dots.
    c.fillStyle = '#5aa2ff';
    for (const cop of s.cops || []) {
      const [px, py] = toMap(cop.x, cop.z);
      c.beginPath(); c.arc(px, py, 3.5, 0, Math.PI * 2); c.fill();
    }
    // Player arrow (rotates with heading); car icon when driving.
    const [px, py] = toMap(s.playerX, s.playerZ);
    c.save();
    c.translate(px, py);
    c.rotate(-s.heading + Math.PI);
    if (s.inCar) {
      c.fillStyle = '#ff4444';
      c.fillRect(-4, -7, 8, 14);
    } else {
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, -8); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath();
      c.fill();
    }
    c.restore();
    c.restore();
  }
}
