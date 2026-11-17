// Port Meridian — configuration, world constants and the story missions.
// Every number the game tunes lives here so the other files stay readable.

/** Deterministic RNG (mulberry32): the city layout is identical every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** City geometry: a road grid with blocks between the roads. */
export const CITY = {
  seed: 1337,
  blocks: 7,            // blocks per side
  pitch: 62,            // metres between road centrelines
  roadWidth: 14,
  sidewalk: 4,
  blockSize: 62 - 14,   // buildable square inside a block
  // Roads run at x = i * pitch and z = j * pitch for i, j in 0..blocks.
  // The city spans 0..blocks*pitch on both axes; the beach is south of z = blocks*pitch.
  size: 7 * 62,
};

export const WORLD = {
  gravity: -22,
  playerWalkSpeed: 6.5,
  playerRunSpeed: 10.5,
  playerJumpSpeed: 8.5,
  carTopSpeed: 42,          // m/s, ~95 mph
  carAccel: 16,
  carBrake: 30,
  carReverseSpeed: 12,
  trafficCount: 14,
  pedestrianCount: 26,
  maxWanted: 5,
  saveKey: 'port-meridian-save-v1',
};

/** Cash rewards and fines. */
export const ECONOMY = {
  missionReward: [500, 800, 1000, 1500, 1200, 5000],
  taxiFare: 120,
  bustedFine: 300,
  wastedFine: 200,
  carStealHeat: 1,
  pedHitHeat: 1,
  shotHeat: 1,
  copKillHeat: 2,
};

/** Wanted level behaviour: cops spawned, decay seconds at each level. */
export const WANTED = [
  { stars: 0, copCars: 0, footCops: 0, decay: 0 },
  { stars: 1, copCars: 1, footCops: 1, decay: 18 },
  { stars: 2, copCars: 2, footCops: 2, decay: 30 },
  { stars: 3, copCars: 3, footCops: 3, decay: 45 },
  { stars: 4, copCars: 4, footCops: 4, decay: 60 },
  { stars: 5, copCars: 5, footCops: 5, decay: 90 },
];

/** Mission marker positions are road intersections (multiples of pitch). */
const P = CITY.pitch;
export const PLACES = {
  marasGarage: { x: 2 * P, z: 2 * P, name: "Mara's Garage" },
  docks: { x: 6 * P, z: 6 * P, name: 'Meridian Docks' },
  warehouse: { x: 1 * P, z: 5 * P, name: 'Old Cannery Warehouse' },
  bank: { x: 4 * P, z: 3 * P, name: 'Meridian National Bank' },
  hideout: { x: 0 * P, z: 1 * P, name: 'Rex’s Hideout' },
  hospital: { x: 5 * P, z: 1 * P, name: 'St. Anselm Hospital' },
  policeHQ: { x: 3 * P, z: 5 * P, name: 'Meridian PD HQ' },
  beach: { x: 3 * P, z: 7 * P + 26, name: 'Meridian Beach' },
};

/**
 * The story: six jobs from fixer Mara Voss. Each mission is a list of steps.
 * Step types:
 *   goto      reach a marker (on foot or in a car)
 *   enterCar  get into any car (or the flagged mission car)
 *   driveTo   reach a marker while driving
 *   pickup    stand at a marker and press E
 *   loseCops  bring wanted down to 0 (police are spawned by the step)
 *   shootout  eliminate N rival shooters at a place
 *   timed     reach a marker before the timer runs out
 *   grabCash  stand at a marker and hold still for a few seconds
 */
export const MISSIONS = [
  {
    id: 'm1', title: 'FIRST WHEELS', giver: 'MARA VOSS',
    briefing: 'Rex. You\'re back, and I\'ve got work. First, wheels. There\'s a red Comet parked outside my garage — take it. Don\'t pay for it. Then bring it to the docks so I know you can still drive.',
    steps: [
      { type: 'goto', at: PLACES.marasGarage, text: 'Go to Mara’s Garage' },
      { type: 'enterCar', missionCar: true, text: 'Steal the red Comet' },
      { type: 'driveTo', at: PLACES.docks, text: 'Drive the Comet to the Docks' },
    ],
    complete: 'Mara: "Not bad. The Comet suits you. The real work starts now."',
  },
  {
    id: 'm2', title: 'THE PICKUP', giver: 'MARA VOSS',
    briefing: 'A crate came in at the docks with my name on it — and two of Hale\'s patrol cars watching the gate. Grab the crate, then get it to the hideout. If the cops light you up, lose them.',
    steps: [
      { type: 'driveTo', at: PLACES.docks, text: 'Drive to the Docks' },
      { type: 'pickup', at: PLACES.docks, text: 'Pick up the crate (press E)' },
      { type: 'driveTo', at: PLACES.hideout, text: 'Deliver the crate to the Hideout', heat: 2 },
      { type: 'loseCops', text: 'Lose the cops' },
    ],
    complete: 'Mara: "Clean. Hale\'s boys are still circling the docks like lost gulls."',
  },
  {
    id: 'm3', title: 'HOT PURSUIT', giver: 'DETECTIVE HALE',
    briefing: 'Hale (on the radio, patched through Mara): "Calloway. I know you\'re driving my streets. Three stars, Rex — let\'s see if you\'re still the best wheelman in Meridian."',
    steps: [
      { type: 'loseCops', heat: 3, text: 'Lose a 3-star wanted level' },
    ],
    complete: 'Mara: "Hale\'s furious. You just made the evening news, Rex."',
  },
  {
    id: 'm4', title: 'PAYBACK', giver: 'MARA VOSS',
    briefing: 'The Vipers torched my garage last night. Five of them are holed up at the old cannery. Take your pistol, walk in, and send a message. Watch your health — they shoot back.',
    steps: [
      { type: 'goto', at: PLACES.warehouse, text: 'Go to the Old Cannery' },
      { type: 'shootout', at: PLACES.warehouse, count: 5, text: 'Eliminate the Vipers (0/5)' },
    ],
    complete: 'Mara: "The Vipers won\'t torch anything again. You\'re worth every dollar, Rex."',
  },
  {
    id: 'm5', title: 'THE DROP', giver: 'MARA VOSS',
    briefing: 'A buyer at the beach is waiting on a package, and the tide won\'t wait either. Ninety seconds, Rex — across town, in traffic. Drive like the old days.',
    steps: [
      { type: 'timed', at: PLACES.beach, seconds: 90, text: 'Deliver to the Beach — 90 seconds' },
    ],
    complete: 'Mara: "Ninety seconds and not a scratch. You still drive like a ghost."',
  },
  {
    id: 'm6', title: 'THE MERIDIAN JOB', giver: 'MARA VOSS',
    briefing: 'This is it. Meridian National Bank, the vault Hale guards with his career. Walk in, grab the cash, and get out. Four stars the moment the alarm trips. Bring it home, Rex — and we\'re done.',
    steps: [
      { type: 'goto', at: PLACES.bank, text: 'Go to Meridian National Bank' },
      { type: 'grabCash', at: PLACES.bank, seconds: 6, text: 'Grab the cash — stay in the vault' },
      { type: 'driveTo', at: PLACES.hideout, text: 'Escape to the Hideout', heat: 4 },
      { type: 'loseCops', text: 'Lose the cops' },
    ],
    complete: 'Mara: "It\'s done, Rex. The Meridian Job is finished — and so is Hale\'s career. Welcome home."',
  },
];

/** Taxi fares: pickup and drop-off intersection pairs. */
export const TAXI_SPOTS = [
  { from: { x: 1 * P, z: 1 * P }, to: { x: 6 * P, z: 2 * P } },
  { from: { x: 5 * P, z: 4 * P }, to: { x: 2 * P, z: 6 * P } },
  { from: { x: 0 * P, z: 4 * P }, to: { x: 4 * P, z: 0 * P } },
  { from: { x: 3 * P, z: 6 * P }, to: { x: 6 * P, z: 5 * P } },
];

/** Radio stations: original synth loops, switched with Q. */
export const RADIO = [
  { name: 'MERIDIAN FM 88.1 — Sunset Drive', bpm: 96, root: 45 },
  { name: 'WAVE 104 — Night Cruise', bpm: 112, root: 41 },
  { name: 'RADIO OFF', bpm: 0, root: 0 },
];

/** Palette: a sun-soaked coastal city at golden hour. */
export const PALETTE = {
  skyTop: 0x2f6fb2,
  skyHorizon: 0xffc98a,
  sun: 0xffd9a0,
  fog: 0xf2b878,
  road: 0x2e3138,
  roadLine: 0xd8d8c8,
  sidewalk: 0x9a938a,
  grass: 0x5d8a4a,
  sand: 0xe8cf9e,
  water: 0x1e6f8e,
  buildingGlass: 0x8fb8d8,
};
