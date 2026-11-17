// input.js — keyboard + mouse state for Port Meridian.
//
// Keys are tracked by code (KeyW, ArrowUp, ...). Mouse fire is counted,
// not collapsed to a boolean: rapid clicks inside one frame each count
// as a shot (combat consumes up to 3 per frame). Edge-triggered actions
// (pause, mute, reload, enter car) are exposed as consume-once flags.

export class Input {
  constructor() {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.clickQueue = []; // timestamps of mousedown / F presses
    this.pressed = new Set(); // edge-triggered codes, consumed by readers
    this.pointerLocked = false;
    this.onFirstGesture = null; // set by main.js (starts audio)
    this._gestureFired = false;
    this._attach();
  }

  _attach() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this._gesture();
      if (e.code === 'KeyF') this.clickQueue.push(performance.now());
      // Keep the page from scrolling / losing focus on game keys.
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.mouseDown = true;
      this.clickQueue.push(performance.now());
      this._gesture();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDX += e.movementX || 0;
        this.mouseDY += e.movementY || 0;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === document.body;
    });
    window.addEventListener('pointerdown', () => this._gesture());
  }

  _gesture() {
    if (!this._gestureFired) {
      this._gestureFired = true;
      if (this.onFirstGesture) this.onFirstGesture();
    }
  }

  down(code) {
    return this.keys.has(code);
  }

  // True once per physical press; the reader consumes it.
  wasPressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  peekPressed(code) {
    return this.pressed.has(code);
  }

  // WASD / arrows as a -1..1 pair, camera-relative (forward = -z of yaw).
  moveAxes() {
    let x = 0;
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    return { x, y };
  }

  running() {
    return this.down('ShiftLeft') || this.down('ShiftRight');
  }

  // Mouse look deltas since last call, then cleared.
  takeMouseDelta() {
    const d = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  // Up to `max` queued fire clicks; the rest stay queued for next frame.
  takeClicks(max) {
    const n = Math.min(max, this.clickQueue.length);
    if (n > 0) this.clickQueue.splice(0, n);
    return n;
  }

  clearClicks() {
    this.clickQueue.length = 0;
  }

  lockPointer() {
    try {
      const r = document.body.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (err) {
      /* pointer lock is a nicety, not a requirement */
    }
  }

  unlockPointer() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (err) {
      /* ignore */
    }
  }
}
