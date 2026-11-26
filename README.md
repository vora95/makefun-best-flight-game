# makefun-best-flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/vora95/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/vora95/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**SKYRING COURIER** — a complete 3D flight game. You fly the mail plane *Kutilang-7* across a tropical archipelago at golden hour: thread all 12 glowing sky rings, mind your fuel, and bring her home on the runway at Tanjung Cendrawasih. Chase and cockpit cameras, a live instrument panel (altitude, speed, heading, attitude, fuel), takeoffs, landings, stalls and crashes — all offline, in a desktop browser, keyboard + mouse.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — click **TAKE OFF**, hold **SHIFT** for throttle, steer with **W/A/S/D** or the mouse. **C** switches chase/cockpit camera, **P** pauses, **R** restarts, **M** mutes.

## How it plays

- **Take off** from the runway, follow the gold beacon to the next ring.
- **Each ring: +100 pts.** All 12 rings: time bonus, then land for **+250** and a full tank.
- **Fuel burns with throttle** — empty tanks mean a glide to the runway. Land in time or swim.
- **Stall below 26 m/s**, crash into a mountain or ditch in the sea, and the sortie is over.
- **Sortie clock: 3:00.** Rings don't wait.

## Files

- `game/` — the playable game (three.js vendored under `game/vendor/three/`)
- `game/src/` — one job per file: `main.js` (loop + state machine), `world.js` (archipelago), `plane.js` (the Kutilang-7), `rings.js` (the course), `flight.js` (flight model), `hud.js` (instruments), `input.js`, `audio.js` (synthesised sound), `shots.js` (screenshot staging)
- `screenshots/` — real renders of the game's own code
- `main.ts` — the hand-in program (Node 22): copies `game/` + `screenshots/` to `/output` and writes `dossier.json`

---

<sub>Entered on [make.fun](https://make.fun/?ref=05axmjqh&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
