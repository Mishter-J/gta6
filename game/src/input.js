// Port Meridian — keyboard + mouse input with pointer lock.
// Tracks held keys, accumulated mouse deltas and edge-triggered presses.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();   // keys pressed since last poll()
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;  // left button pressed since last poll()
    this.clickCount = 0;        // left clicks since last poll() (a count, not a flag)
    this.locked = false;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.onFirstGesture = null; // called once on the first key/click

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this._gesture();
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    document.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      } else if (this.dragging) {
        this.mouseDX += e.clientX - this.lastX;
        this.mouseDY += e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
      }
    });
    canvas.addEventListener('mousedown', (e) => {
      this._gesture();
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
        this.clickCount++;
        if (!this.locked && this.lockEnabled) {
          { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); }
        } else if (!this.lockEnabled) {
          this.dragging = true;
          this.lastX = e.clientX;
          this.lastY = e.clientY;
        }
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) { this.mouseDown = false; this.dragging = false; }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.lockEnabled = true; // screenshots can disable pointer lock
  }

  _gesture() {
    if (this.onFirstGesture) {
      const cb = this.onFirstGesture;
      this.onFirstGesture = null;
      cb();
    }
  }

  down(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  /** Forward axis: W/Up = +1, S/Down = -1. */
  forwardAxis() {
    let v = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) v += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) v -= 1;
    return v;
  }

  /** Strafe axis: D/Right = +1, A/Left = -1. */
  strafeAxis() {
    let v = 0;
    if (this.down('KeyD') || this.down('ArrowRight')) v += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) v -= 1;
    return v;
  }

  /** Call once per frame after reading input: clears edge triggers. */
  poll() {
    const out = { dx: this.mouseDX, dy: this.mouseDY, clicked: this.mouseClicked, clicks: this.clickCount };
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.mouseClicked = false;
    this.clickCount = 0;
    return out;
  }

  /** Call at the end of the frame: clears edge-triggered key presses. */
  clearPressed() { this.pressed = new Set(); }
}
