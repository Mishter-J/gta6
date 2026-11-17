// save.js — Port Meridian saves: cash, mission progress and best stats
// in localStorage. The start screen offers New Game / Continue; the
// pause menu offers save-and-quit; Busted / Wasted screens retry from
// the last save.

const SAVE_KEY = 'portmeridian.save.v1';

export class SaveSys {
  constructor(ctx) {
    this.ctx = ctx;
  }

  // Plain data object; main.js owns the live fields.
  snapshot() {
    const ctx = this.ctx;
    return {
      version: 1,
      cash: ctx.cash,
      missionIndex: ctx.missions.index,
      vipersDown: ctx.missions.vipersDown,
      bestCash: Math.max(ctx.bestCash || 0, ctx.cash),
      missionsDone: ctx.missions.index,
      savedAt: new Date().toISOString(),
    };
  }

  save() {
    try {
      const data = this.snapshot();
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.ctx.bestCash = data.bestCash;
      return true;
    } catch (err) {
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  hasSave() {
    return this.load() !== null;
  }

  apply(data) {
    const ctx = this.ctx;
    ctx.cash = data.cash || 0;
    ctx.bestCash = data.bestCash || 0;
    ctx.missions.index = Math.min(data.missionIndex || 0, 6);
    ctx.missions.vipersDown = 0;
    ctx.missions.stage = 'go';
    ctx.missions.taxi = null;
  }

  clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (err) {
      /* storage may be unavailable in some embeds */
    }
  }
}
