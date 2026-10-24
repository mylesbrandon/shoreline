# First tasks

Each task is independent and testable with mock data. Nobody waits on anybody. Read [CONTRACTS.md](CONTRACTS.md) first (10 minutes).

Setup for everyone:

```bash
git clone https://github.com/<OWNER>/stormline.git
cd stormline
npm install
git checkout -b <your-branch>   # see each task
npm run dev                      # http://localhost:3000
```

---

## Developer 1 — Game engine · branch `feat/engine`

**Objective:** a deterministic single-player simulation in pure TypeScript where the Captain's actions move the boat.

**Owned files:** `src/game/engine/**` (start in `actions.ts`, `step.ts`, `engine.test.ts`).

**Expected inputs:**
- `createInitialState({ seed, gameId })` → `GameState`
- `applyAction(state, { type: "STEER", rudder }, "captain")`, `applyAction(state, { type: "SET_THROTTLE", throttle }, "captain")`
- `step(state, dtMs)` called with `dtMs = 1000 / NETWORK.simHz` (≈33.3 ms)

**Expected outputs:** new `GameState` objects (never mutate input) plus `GameEvent[]`.

**Do:**
1. In `applyAction`, store `rudder` / `throttle` on `state.boat` (they're already validated).
2. In `step`, implement boat physics using constants from `config.ts`:
   - speed eases toward `throttle * BOAT.maxSpeed` at `BOAT.acceleration`
   - `heading += rudder * BOAT.maxTurnRate * (speed / BOAT.maxSpeed) * dtSeconds`, normalized to `[0, 2π)`
   - `position += (sin(heading), -cos(heading)) * speed * dtSeconds`
   - clamp position to `[MAP.edgePadding, 1 - MAP.edgePadding]`
3. Replace the five `test.todo(...)` entries in `engine.test.ts` with real tests.

**Acceptance criteria:**
- Boat at `MISSION.boatStart`, heading 0, throttle 1 → after 60 steps (2 s), `y` decreased and `x` unchanged (within 1e-9).
- Positive rudder increases heading; negative decreases it; zero speed → no turning.
- Driving into any edge never leaves `[edgePadding, 1 - edgePadding]`.
- Same seed + same action sequence + same dt sequence → `deepEqual` states.
- No imports of React, Next, Supabase, `Date.now()` or `Math.random()` in `src/game/engine/**`.

**Proof required:** `npm test` output showing all engine tests passing with 0 todo in "step"; PR description pastes it.

**Definition of done:** tests pass, `npm run check` passes, PR `engine: boat movement` merged to `main`.

**What next:** hazard collisions (hull damage + `collisionCooldownMs` + `HAZARD_HIT`), weather current + shield, `SONAR_PING` reveal with cooldown, `RADIO_SCAN` strength from distance, rescue win check + score, then seeded layout generation in `state.ts`.

---

## Developer 2 — Multiplayer / integration · branch `feat/realtime`

**Objective:** two real browsers in the same room over Supabase Realtime, with presence and a test message.

**Owned files:** `src/lib/realtime/**`, `src/lib/game-client/**`, `src/app/**`, `src/components/shared/**`, root config, `docs/DEPLOY.md`.

**Expected inputs:** room code (4 letters), `PresenceMeta` for this device, `NetworkMessage`s from other devices.

**Expected outputs:** a working `SupabaseRoomTransport` that satisfies the `RoomTransport` interface exactly like `MockRoomTransport` does.

**Do:**
1. Create a free Supabase project; put URL + anon/publishable key in `.env.local` (see [DEPLOY.md](DEPLOY.md)).
2. Implement `src/lib/realtime/supabase-transport.ts` (the notes at the top of the file are the recipe): channel `stormline:room:<CODE>`, broadcast event `"msg"` with `self: false`, presence keyed by `playerId`, status mapping, clean `disconnect()`.
3. Add a temporary debug route `src/app/debug/[roomCode]/page.tsx` that connects, lists presence members live, and has a "Send test" button that sends `{ type: "test" }` and shows received test messages.
4. Verify leave/rejoin: closing a tab removes it from presence within a few seconds; reopening shows it again; `PlayerSession` sends `hello` on reconnect.
5. Fill in the "Supabase" section of `DEPLOY.md` with anything you learned.

**Acceptance criteria:**
- Two browsers (one may be a phone on the LAN via `npm run dev:lan`) on `/debug/ABCD` see each other in presence.
- A test message sent from one appears on the other within ~300 ms; the sender doesn't receive its own.
- Closing one browser removes it from the other's presence list; reopening re-adds it.
- With env vars removed, the app falls back to mock mode and still builds and runs.
- `src/lib/realtime/protocol.test.ts` and `src/lib/game-client/sessions.test.ts` still pass.

**Proof required:** short screen recording or two screenshots side-by-side + `npm run check` output in the PR.

**Definition of done:** PR `realtime: supabase transport` merged; Vercel project created and deploying `main` with env vars set.

**What next:** end-to-end host ↔ phones using the existing `HostSession` / `PlayerSession` (already wired into `/host/[code]` and `/room/[code]`); "Reconnecting…" banner; results screen routing; merge teammates' PRs and keep `main` deployable. **Do not implement game rules** — if the engine isn't ready, the stub engine still lets the whole flow run.

---

## Developer 3 — Ocean / Captain UI · branch `feat/captain-ui`

**Objective:** a beautiful, responsive ocean view and a captain helm that emits typed actions, using mock data only.

**Owned files:** `src/components/ocean/**`, `src/components/captain/**`.

**Expected inputs:** `CaptainView` and `SpectatorView` props (use `MOCK_CAPTAIN_VIEW`, `mockRoleViewsAt(t)`, `mockSpectatorViewAt(t)` from `@/game/mock-state`).

**Expected outputs:** components that render the view and call `onAction({ type: "STEER" | "SET_THROTTLE", ... })`.

**Work at:** `http://localhost:3000/room/DEMO?preview=captain` and `?preview=spectator` — the page animates a scripted boat and prints every emitted action.

**Do:**
1. Make `OceanCanvas` look like the game: storm atmosphere, nicer boat sprite and wake, hazard styling, marker styling, current indicator.
2. Add **interpolation**: keep the previous and latest boat states with arrival times; render `NETWORK.interpolationDelayMs` behind and lerp position and (shortest-arc) heading. Test it by throttling the scripted preview to 10 Hz.
3. Polish `CaptainControls` for phones: thumb-sized rudder that springs back to center, throttle lever, current heading/speed readout. Must emit only valid ranges.
4. `SpectatorDisplay`: hull bar, mission phase, big countdown, placeholder victory/failure overlay.

**Acceptance criteria:**
- Canvas is crisp on retina, square, fills the width on a 375 px phone and fits the height on a laptop.
- Boat motion looks smooth at 60 fps with view updates at 10 Hz.
- Every helm interaction prints a valid `STEER` (`-1..1`) or `SET_THROTTLE` (`0..1`) action in the preview log.
- No imports from `src/lib/realtime`, `src/lib/game-client` or `src/game/engine`.

**Proof required:** screenshots/GIF of captain (phone size) and spectator (laptop size) previews; `npm run check` output.

**Definition of done:** PR `ui: ocean + captain` merged; previews look good on a real phone.

**What next:** hazard-hit shake and flash (from `GameEvent`s, Dev 2 exposes `recentEvents`), results overlay, sonar-mark highlighting on the captain view, ambient rain/lightning scaled by `stormIntensity`.

---

## Developer 4 — Specialist roles · branch `feat/specialist-ui`

**Objective:** a responsive sonar station with a working Scan button, plus reusable instruments for weather and radio.

**Owned files:** `src/components/roles/**`.

**Expected inputs:** `SonarView`, `WeatherView`, `RadioView` props (use `MOCK_SONAR_VIEW`, `mockRoleViewsAt(t)` from `@/game/mock-state`).

**Expected outputs:** components that render the view and call `onAction({ type: "SONAR_PING" })`, `MARK_HAZARD`, `WEATHER_SHIELD`, `RADIO_SCAN`.

**Work at:** `http://localhost:3000/room/DEMO?preview=sonar` (also `weather`, `radio`).

**Do:**
1. `SonarStation`: polished scope (sweep, range rings, contacts as blips from `view.contacts`), ping ring animation from `lastPingOrigin`, contact fade by age, tap-to-mark emitting `MARK_HAZARD` with a normalized position.
2. Scan button emits `SONAR_PING` and shows the cooldown from `view.pingReadyAtMs` vs `view.mission.elapsedMs` (`CooldownButton`).
3. Grow `src/components/roles/instruments/` into the shared kit for all three stations (dial, cooldown button, signal bars, panel, readouts) so weather and radio look like one family.
4. Leave `WeatherStation` and `RadioStation` as clearly-commented placeholders that use the kit (they already emit valid actions).

**Acceptance criteria:**
- Sonar looks good and is usable one-handed on a 375 px phone.
- Tapping Ping emits exactly one `SONAR_PING`; while cooling down, it's disabled and shows time left.
- Tapping the scope emits `MARK_HAZARD` with `0 ≤ x,y ≤ 1`.
- Mock contacts render at the right positions (compare with the spectator preview).
- No sonar *rules* in the component (what's revealed comes from the view); no imports from `src/lib/**` or the engine.

**Proof required:** phone-size screenshots of sonar/weather/radio previews + action log; `npm run check` output.

**Definition of done:** PR `ui: sonar station + instrument kit` merged.

**What next:** full weather station (forecast timeline, shield active ring), full radio station (heat map, long-press `MARK_TARGET`, distress typewriter), results screen for phones.

---

## Overlap check

| | Dev 1 | Dev 2 | Dev 3 | Dev 4 |
|---|---|---|---|---|
| Edits | `src/game/engine` | `src/lib`, `src/app`, `components/shared`, config | `components/ocean`, `components/captain` | `components/roles` |
| Uses mock data | engine tests | mock transport | `mock-state.ts` | `mock-state.ts` |
| Needs others to start? | No | No | No | No |
