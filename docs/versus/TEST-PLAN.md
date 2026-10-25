# Rescue Showdown — test plan

Run everything with the project's real scripts: `npm test` (node:test via tsx), `npm run check` (typecheck + lint + test + build). Never report a check as passing without running it. The 89 co-op tests must stay green. At handoff `npm run check` passes: **109 tests** (89 co-op + 20 versus).

## 1. Unit tests: engine (Dev 1, `src/game/engine/versus.test.ts`)

Already in the baseline (must keep passing): identical seeded map/survivor/weather for both teams · determinism · countdown → both worlds active on one tick · no actions before GO · both world clocks equal the match clock · captain/navigator permissions · team isolation (movement, sonar) · no input mutation · rescue counted exactly once · match ends exactly at `durationMs` with one `MATCH_ENDED` · full idle match → tie · per-seat views, survivor hidden.

Dev 1 adds:

| Case | Expect |
|---|---|
| Three rescues in a row (park the boat on each new survivor) | `rescues` = 1, 2, 3; `survivorIndex` = 0, 1, 2; one `SURVIVOR_RESCUED` each; world stays `"active"` |
| Rescue followed by 30 more steps with no movement | count does not increase (no double count) |
| Survivor sequence is shared | both teams rescuing in the same boat positions get identical spawn positions for index 1..5 |
| Spawn validity, 50 seeds × 8 indices | inside the map margin, clear of every hazard (rim + rescue clearance), ≥ the minimum distance from the boat |
| Spawn sequence is deterministic | same seed, index and boat position ⇒ same point |
| After a rescue | radio readings cleared, `target_guess` marker removed, the `"gull"` sonar contact removed; hazard marks kept |
| Hull to 0 | `BOAT_WIPEOUT` once; boat at `MISSION.boatStart`, speed 0, hull `BOAT.startHull`; `wipeouts` +1; world `"active"`; survivor unchanged |
| Hull 0 and survivor in the same step | wipeout, no rescue (co-op precedence: sunk beats rescue) |
| Rescue on the final step | counts, and the match still ends that step |
| Tie-break end to end | equal counts, earlier `lastRescueAtMs` wins |
| Clocks after rescues and wipeouts | both worlds' `mission.elapsedMs` === match `elapsedMs` |
| Scripted full match (fixed inputs), run twice | deep-equal final `VersusMatchState` |
| `engine.test.ts` | unchanged, all passing |

## 2. Integration tests: sessions (Dev 2, `src/lib/game-client/versus-sessions.test.ts`, `MockRoomTransport`)

| Case | Expect |
|---|---|
| 4 players join in order | seats = blue captain, red captain, blue navigator, red navigator |
| 5th player joins | `slot: null`, gets no view, can't act (`unknown_player`) |
| One captain + one navigator per team | after any `assignSlot` swap, no seat is held twice |
| Each phone's view after start | `view.role`/`view.team` match its seat; `scoreboard` present |
| Blue captain `SET_THROTTLE 1` + ticks | blue boat moves, red boat doesn't |
| Navigator sends `STEER` | `action_rejected: not_permitted` to that phone only |
| Captain sends `START_GAME` | rejected; match doesn't start |
| Duplicate message (same `msgId` delivered twice) | applied once |
| Stale `seq` (≤ last seen) | dropped |
| Older `versus_views` tick after a newer one | ignored by the phone |
| Disconnect, then reconnect with the same `playerId` + `hello` | same seat, views resume, seq restarts at 1 and is accepted |
| `resetMatch` mid-match | new `matchId`; phones accept tick 0 of the new match |
| Lifecycle with manual `tick()` | `lobby` → `playing` → `ended`; `VersusRoom.status === "ended"` and `scoreboard.result` set when time runs out |
| Co-op `sessions.test.ts` | unchanged, all passing |

`protocol.test.ts`: `isNetworkMessage` accepts `versus_room`, `versus_views`, `versus_events`.

## 3. Manual: four phones + host laptop (Dev 2 leads, everyone joins)

Setup: a laptop on the venue Wi-Fi with live Supabase keys, `npm run dev:lan` or the Vercel preview URL of `feat/versus`. Four phones (mix iOS and Android if possible) on the same network. Open `/versus/host/<CODE>` on the laptop.

1. Scan the QR with phone A. It's seated **Blue Driver**. Phone B → **Red Driver**. Phones C and D → **Blue Navigator** and **Red Navigator**. The host lineup shows all four, in team colours.
2. Phone E (optional) joins and sees "watching". Close it.
3. Press Start. Every screen shows 3-2-1-GO at the same moment (±0.5 s), and no boat moves before GO.
4. Blue Driver goes full throttle and turns left; Red Driver stays still. On the spectator screen, only the blue boat moves.
5. Both Navigators sweep and scan. Each sees only their own team's contacts and readings (compare the two phones).
6. Blue rescues a survivor. Blue's count goes up within about 0.3 s on the host and every phone, the rescue effect plays, and a new survivor exists (radio readings reset).
7. Reload Red Navigator's phone mid-match. It returns to Red Navigator with live views in under 3 s, and the match continues for everyone.
8. Let the clock run out. The last 10 s are visibly dramatic. At 0:00 the result is identical on the host and all four phones, and it's correct.
9. Reset, then Start. A fresh match starts and the old views don't flash back.
10. Hit hazards until the hull reaches 0 (after Dev 1's PR). The boat respawns at the start, wipeouts increase, and the match continues.
11. Play 3 full matches, rotating seats. For each seat, note whether the player was busy or idle, whether the two talked, and the rescue counts. Tune `VERSUS.matchDurationMs` and the spawn distance from this.
12. Co-op regression: `/host/<CODE>` + 4 × `/room/<CODE>` plays one co-op mission to the end.

**Pass:** steps 1–9 (and 10 after the engine PR), with no console errors on the host.
**Viewports:** each phone screen at 375 px wide (no horizontal scroll, touch targets ≥ 44 px); the spectator screen at 1280×720 and on the projector.
