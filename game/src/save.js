// Port Meridian — saving to localStorage: cash, mission progress,
// health and position. Nothing leaves the browser.

import { WORLD } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      cash: state.cash,
      missionIndex: state.missionIndex,
      health: state.health,
      armor: state.armor,
      x: state.x,
      z: state.z,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(WORLD.saveKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(WORLD.saveKey);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function hasSave() {
  return loadGame() !== null;
}
