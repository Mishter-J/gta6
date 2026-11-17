// config.js — Port Meridian: single source of tunable constants plus the
// seeded PRNG and small math helpers. The city layout is identical every
// load for a given seed, so screenshots and playtests are reproducible.

export const CONFIG = {
  // World
  seed: 19489,
  cityHalf: 280, // playable city spans -280..280 on x and z
  roadSpacing: 80, // distance between road centre lines
  roadWidth: 14,
  blockCount: 7, // 7x7 blocks between the roads
  beachStart: 288, // beach strip east of the city
  waterStart: 322,
  worldBound: 340, // hard clamp for player and cars
  // Player on foot
  walkSpeed: 6,
  runSpeed: 11,
  playerHealth: 100,
  // Cars
  carTopSpeed: 30,
  carAccel: 16,
  carBrake: 30,
  carDrag: 0.6,
  carTurnRate: 1.9,
  carHealth: 100,
  // Wanted
  wantedMax: 5,
  wantedDecayPerSec: 0.045, // slow decay while hidden
  wantedDecayDelay: 9, // seconds without crime / police nearby
  // Combat
  pistolMag: 12,
  pistolDamage: 34,
  pistolRange: 90,
  reloadSeconds: 1.4,
  fistDamage: 12,
  fistRange: 2.2,
  // Missions
  missionRewards: [500, 400, 600, 800, 1000, 5000],
  dropTimeLimit: 90,
  // Economy
  taxiFarePerMetre: 0.35,
  taxiMinFare: 25,
  // Police
  copCarTopSpeed: 33,
  copRamDamage: 8,
  bustDistance: 1.6,
  bustHoldSeconds: 1.2,
  // Colours (golden-hour palette)
  skyTop: 0x2e4a7a,
  skyBottom: 0xffb36b,
  sunColor: 0xffd9a0,
  fogColor: 0xe8a06a,
  roadColor: 0x2b2e33,
  sidewalkColor: 0x8d8578,
  groundColor: 0x6f7d5a,
  sandColor: 0xe0c188,
  waterColor: 0x1e6f8e,
};

// mulberry32 — tiny seeded PRNG. The seed lives in CONFIG so the whole
// city (buildings, palms, parked cars, pedestrians) is reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed angle difference, in radians.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2D(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Road centre lines: -280, -200, ..., 280 (8 lines each axis).
export function roadLines() {
  const lines = [];
  for (let i = 0; i <= CONFIG.blockCount; i++) {
    lines.push(-CONFIG.cityHalf + i * CONFIG.roadSpacing);
  }
  return lines;
}

// Nearest point on the road grid to (x, z), snapped to a lane offset.
export function nearestRoadPoint(x, z) {
  const lines = roadLines();
  let bestX = lines[0];
  let bestZ = lines[0];
  for (const l of lines) {
    if (Math.abs(l - x) < Math.abs(bestX - x)) bestX = l;
    if (Math.abs(l - z) < Math.abs(bestZ - z)) bestZ = l;
  }
  // Choose the closer axis: drive along x on the nearest z-line, or
  // along z on the nearest x-line.
  if (Math.abs(bestZ - z) <= Math.abs(bestX - x)) return { x, z: bestZ, axis: 'x' };
  return { x: bestX, z, axis: 'z' };
}

export function isOnRoad(x, z) {
  const lines = roadLines();
  const half = CONFIG.roadWidth / 2;
  for (const l of lines) {
    if (Math.abs(x - l) < half || Math.abs(z - l) < half) return true;
  }
  return false;
}
