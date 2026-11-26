# makefun-best-flight-game

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/vora95/makefun-best-flight-game/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/vora95/makefun-best-flight-game/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

**SKYRING COURIER** is a complete 3D flight game built for make.fun's "Make the best flight game" bounty. You are the pilot of the mail plane *Kutilang-7*, flying out of Tanjung Cendrawasih across a tropical archipelago at golden hour. Thread all 12 glowing sky rings, watch your fuel and the sortie clock, then bring her home on the runway for the landing bonus. Chase and cockpit cameras, a live instrument panel (altitude, speed, vertical speed, heading, attitude, fuel, throttle), takeoffs, landings, stalls and crashes — all offline, in a desktop browser, keyboard + mouse. No network, no build step.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — click **TAKE OFF**, hold **SHIFT** for throttle, steer with **W/A/S/D** or the mouse. **C** switches chase/cockpit camera, **P** pauses, **R** restarts, **M** mutes.

## How it plays

- **Take off** from the runway, follow the gold beacon to the next ring — each ring has a name, and the HUD tells you how far away it is.
- **Each ring: +100 pts.** All 12 rings: a time bonus, then land for **+250** and a full tank.
- **Fuel burns with throttle** — empty tanks mean a glide to the runway. Land in time or swim.
- **Stall below 26 m/s**, crash into a mountain or ditch in the sea, and the sortie is over.
- **Sortie clock: 3:00.** Rings don't wait. Leaving the window mid-flight pauses the sortie.

## Files

- `game/` — the playable game (three.js vendored under `game/vendor/three/`)
- `game/src/` — one job per file: `main.js` (boot, loop, cameras, state machine), `world.js` (archipelago, runway, town, sky), `plane.js` (the Kutilang-7), `rings.js` (the 12-ring course), `flight.js` (flight model), `hud.js` (instruments), `input.js`, `audio.js` (synthesised sound), `shots.js` (screenshot staging)
- `screenshots/` — real renders of the game's own code (`?shot=cover|menu|runway|ring`)
- `main.ts` — the hand-in program (Node 22): copies `game/` + `screenshots/` to `/output` and writes `dossier.json`

---

<sub>Entered on [make.fun](https://make.fun/?ref=05axmjqh&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
