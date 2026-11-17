// Port Meridian — shots.js
// Scripted camera sequences used ONLY to capture the screenshots.
// They drive the real game code (startNewGame, enterCar, mission
// setup, wanted level, the real render path) — no faked or
// composited frames. Each setup leaves the game in a live, rendered
// state; the screenshot script then captures the canvas.

export async function setupShot(kind, game) {
  if (kind === 'menu') {
    game.quitToMenu();
    game.menuOrbit = true;
    return;
  }
  if (kind === 'chase') {
    game.menuOrbit = false;
    game.startNewGame();
    game.debugEnterComet();
    game.debugSetWanted(3);
    // Drive forward for a moment so the chase reads as motion.
    game.debugDriveForward();
    game.debugHoldKeys(['KeyW'], 4000);
    game.hud.toast('3 stars — lose the tail!');
    return;
  }
  if (kind === 'mission') {
    game.menuOrbit = false;
    game.startNewGame();
    game.debugSetMission(3);
    // Rex on foot at the warehouse, Vipers in view, pistol ready.
    game.debugTeleport(108, -28);
    game.debugFace(2.2);
    game.debugFireShot();
    game.hud.toast('Payback — clear out the Vipers!');
    return;
  }
  if (kind === 'end') {
    game.menuOrbit = false;
    game.startNewGame();
    game.debugCompleteAll();
    return;
  }
}
