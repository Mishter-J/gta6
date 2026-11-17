// Port Meridian — screenshot staging hooks.
// The screenshots are real renders of this game's own code in a browser.
// A ?shot= parameter stages a real game state (menu / chase / mission /
// end) so the screenshot run can capture it; every staged state is one
// the player can reach by playing. window.__game exposes the live game
// for the screenshot driver and for debugging.

export function installShotHooks(game) {
  window.__game = game;
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  if (!shot) return;
  // Pointer lock would fight headless screenshots; staging disables it.
  game.input.lockEnabled = false;
  const stage = () => {
    if (shot === 'menu') return; // the menu is the default state
    game.startGame(true);
    if (shot === 'chase') stageChase(game);
    else if (shot === 'mission') stageMission(game);
    else if (shot === 'end') stageEnd(game);
  };
  // Stage after the first frame so the renderer exists.
  setTimeout(stage, 400);
}

function stageChase(game) {
  // Rex in a car on the long straight west road, three stars, MPD closing in.
  const p = game.player;
  const car = game.traffic.spawnCar(0, 120, 0, 0xc0392b);
  p.pos.set(car.pos.x - 3, 0, car.pos.z);
  p.enterCar(car);
  car.speed = 20;
  game.police.setWanted(3);
  game.hud.showBanner('WANTED ★★★', 'Lose the cops — Detective Hale is on the radio');
  game.hud.showDialogue('DETECTIVE HALE', 'All units, Calloway is in a stolen Comet heading downtown. Bring him in.', 6);
}

function stageMission(game) {
  // Mission 4, Payback: the shootout at the Old Cannery, pistol out.
  const p = game.player;
  game.missions.startMission(3);
  p.pos.set(1 * 62 + 5, 0, 5 * 62 + 3);
  p.setWeapon(true);
  // Walk the player into the shootout step at once (the goto completes).
  game.missions.update(0.1, false);
  game.hud.showBanner('PAYBACK', 'Eliminate the Vipers');
  // Let the briefing fade so the shootout itself is visible.
  setTimeout(() => game.hud.hideDialogue(), 3500);
}

function stageEnd(game) {
  game.showEndScreen('complete');
}
