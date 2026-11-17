# gta6

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Mishter-J/gta6/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Mishter-J/gta6/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Port Meridian** — an original open-world crime game in the browser, built for make.fun's "Make GTA 6" bounty. You are Rex Calloway, a wheelman back in town. Fixer Mara Voss has six jobs for you, Detective Hale is hunting you, and the whole sun-soaked city of Port Meridian is yours to explore on foot and by car.

What is in the game:

- **A living city** — a seeded 7×7 road grid with ~200 buildings, the Meridian Tower landmark, a beach and open water, palms, street lamps, drifting clouds and golden-hour light. The layout is identical every load.
- **Cars to steal and drive** — the red sports car "Comet", parked cars, and AI traffic on the roads. Arcade handling with handbrake, damage, and wreck smoke. Press E near a car to take it.
- **Wanted system & police** — 0–5 stars that rise on crimes (stealing, shooting, hitting pedestrians) and decay while you hide. Police interceptors pursue and ram with rubber-banding; foot cops chase at 2+ stars, shoot at 3+, and bust you on foot.
- **Six story missions** — steal the Comet, a dock pickup, losing a 3-star tail, a warehouse shootout against the Vipers, a 90-second cross-town drop, and the Meridian Bank finale — plus taxi fares as a side activity.
- **Combat** — a pistol with a 12-round magazine and reload, fists, hitscan tracers and muzzle flash.
- **HUD & minimap** — cash, wanted stars, health, ammo, speed, mission objective with waypoint distance, and a circular minimap showing roads, the waypoint, police and traffic.
- **Sound, all synthesized** — engine hum tied to speed, gunshots, sirens, pickup blips and two original radio loops. No audio files.
- **Saves** — cash and mission progress persist in localStorage; New Game / Continue, pause menu, Busted / Wasted / Job Complete screens.

Everything is original: the city, characters, vehicles, story, art and music are our own — nothing from any commercial game.

## Run it

```sh
python3 -m http.server 8000 --directory game
# then open http://localhost:8000 in desktop Chrome
```

No build step, no network requests at runtime — every script, library (three.js r160, vendored under `game/vendor/`) and asset is a local file. Keyboard and mouse: WASD move/drive, mouse look and fire, E enter/exit car, F fire, R reload, Space handbrake, Shift run, P/Esc pause, M mute.

## License

MIT — see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
