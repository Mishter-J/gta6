// Port Meridian — input.js
// Keyboard + mouse state. Fires are counted, never collapsed: every
// mousedown (or F press) pushes one entry onto the click queue, and
// combat consumes up to 3 per frame, so rapid clicks each count as a
// shot. Clicks on DOM buttons (menu / pause) never reach the queue,
// and the queue is cleared whenever play starts, so a menu click can
// never leak into gameplay as a stray shot.

export class Input {
  constructor() {
    this.keys = new Set();
    this.just = new Set();
    this.clicks = [];
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.attached = false;
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) {
        this.just.add(e.code);
        if (e.code === 'KeyF') this.clicks.push(1);
      }
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
    });
    // Only clicks whose target is the game canvas count as fire.
    // Button clicks (menu, pause, overlays) are ignored entirely.
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const t = e.target;
      if (t && t.closest && t.closest('button')) return;
      if (t && t.tagName && t.tagName !== 'CANVAS' && t.tagName !== 'BODY') return;
      this.clicks.push(1);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });
  }

  down(code) {
    return this.keys.has(code);
  }

  pressed(code) {
    return this.just.has(code);
  }

  // Number of queued fire clicks; consumes the queue.
  consumeClicks() {
    const n = this.clicks.length;
    this.clicks.length = 0;
    return n;
  }

  clearClicks() {
    this.clicks.length = 0;
  }

  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy };
  }

  endFrame() {
    this.just.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
