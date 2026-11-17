// Port Meridian — config.js
// Single source of tunable constants plus the seeded PRNG (mulberry32)
// and small math helpers. The city layout is identical every load for
// a given seed. No network, no outside data: everything here is local.

export const CONFIG = {
  seed: 19489,
  cityHalf: 150,
  bounds: 145,
  roadSpacing: 40,
  roads: [-120, -80, -40, 0, 40, 80, 120],
  roadWidth: 10,

  // Player spawn and the red Comet sports car. The Comet sits on the
  // x = 0 road facing the garage, so mission 1 is a straight drive.
  playerSpawn: { x: 4, z: 24 },
  cometPos: { x: 0, z: 20, heading: Math.PI },
  garagePos: { x: 0, z: -80 },
  garageRadius: 14,
  enterRadius: 6.5,

  // Mission markers (all on road intersections, reachable by car).
  docksPos: { x: -120, z: 120 },
  warehousePos: { x: 120, z: -40 },
  dropPos: { x: 120, z: 120 },
  bankPos: { x: 40, z: 40 },
  towerPos: { x: 60, z: 60 },

  walkSpeed: 6,
  runSpeed: 10,
  carAccel: 26,
  carMaxSpeed: 40,
  cometMaxSpeed: 47,
  carReverseSpeed: 14,
  carSteer: 1.9,
  carBrake: 34,

  magSize: 12,
  reserveStart: 48,
  playerHealth: 100,

  startCash: 0,
  rewards: { m1: 500, m2: 750, m3: 1000, m4: 1500, m5: 2000, m6: 5000 },
  taxiFare: 100,

  saveKey: 'portmeridian-save-v1',

  colors: {
    sky: 0xffd9a0,
    fog: 0xf2c98d,
    ground: 0x9a938a,
    road: 0x33343a,
    marking: 0xd8d8ce,
    building: 0x8a7f74,
    tower: 0x5a6b8a,
    water: 0x2e7f9e,
    sand: 0xe0c98f,
    comet: 0xd21f26,
    police: 0x1a1d24,
  },
};

// Seeded PRNG (mulberry32). Deterministic city layout per seed.
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

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Shortest signed difference between two headings, in (-PI, PI].
export function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Forward vector for a heading where heading 0 faces +z.
export function headingVec(heading) {
  return { x: Math.sin(heading), z: Math.cos(heading) };
}
