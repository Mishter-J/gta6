// Port Meridian — save.js
// localStorage save/load: cash, mission index and best stats.
// Start screen offers New Game / Continue; the pause menu can
// save-and-quit. Mission completion auto-saves. New Game resets.

import { CONFIG } from './config.js';

export class SaveSys {
  constructor() {
    this.key = CONFIG.saveKey;
  }

  save(data) {
    try {
      const record = {
        cash: data.cash || 0,
        missionIndex: data.missionIndex || 0,
        bestCash: data.bestCash || 0,
        savedAt: Date.now(),
      };
      localStorage.setItem(this.key, JSON.stringify(record));
      return true;
    } catch (err) {
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
      return data;
    } catch (err) {
      return null;
    }
  }

  has() {
    return this.load() !== null;
  }

  clear() {
    try {
      localStorage.removeItem(this.key);
    } catch (err) {}
  }
}
