# Stormline: Rescue Showdown — architecture

> Two crews. One storm. Save the most lives.

**Baseline:** `feat/versus` @ `c5067ee3c5cbac710a06abf2c3c942e8d19ab8e0` · **handoff tag** `versus-handoff-1` · **contract** `versus-1`
**Fallback:** `main` = tag `coop-v1` (`0da07f9`), the four-player co-op build, deployed and untouched.

## 1. What exists today (verified at `0da07f9`)

| Layer | Files | Facts that matter for 2v2 |
|---|---|---|
| Shared types | `src/game/types.ts` | One `GameState` with one `boat`, one `target` (the Gull) and one `mission`. `Role` = captain, sonar, weather, radio. `ACTION_PERMISSIONS` is keyed by co-op role. `RoleViews` is one view per co-op role. |
| Engine | `src/game/engine/{state,layout,step,actions,views,score}.ts` | `createInitialState({ seed, gameId })` is deterministic. `step(state, dtMs)` covers boat physics, collisions, forecast, Gull drift and the endings: hull 0 → `failure/hull_destroyed`, reaching the Gull → `victory`, time up → `failure/timeout`. `applyAction(state, action, senderRole)` checks permissions, phase, payload and cooldowns. Views filter hidden information. 89 co-op tests. |
| Host | `src/lib/game-client/host-session.ts` | `HostSession`: one `GameState`, a 30 Hz fixed-step accumulator (`runFrame`), views at 10 Hz (`broadcastViews`), seats by presence (first free `ROLES`), `SeqTracker` + `RecentIds`, `hello` → resend views. |
| Phone | `src/lib/game-client/player-session.ts` | `PlayerSession`: per-session `seq`, keeps `views[me.role]` using `ViewOrderTracker(gameId, tick)`, re-sends `hello` when views are stale. |
| Transport | `src/lib/realtime/*` | Supabase Broadcast + Presence on `stormline:room:<CODE>`, plus an in-memory `MockRoomTransport` for tests. Nothing here is role- or team-aware. |
| UI | `CaptainStation` (Driver window), `SonarStation`/`SonarScope`, `RadioStation`, `WeatherStation`, `SpectatorDisplay`/`OceanCanvas`, `RoleStation` switch, `HostScreen`, `PlayerScreen`, `StationPreview` | All stations are props in, actions out (`{ view, onAction }`). |

## 2. Chosen 2v2 design

```
                    ┌──────────────────────── host laptop (VersusHostSession) ───────────────────────┐
 Blue Driver ─┐     │  roster: playerId → { team, role }    (SLOT_ORDER, host-only)                  │
 Blue Nav  ───┤ act │  VersusMatchState ── versusEngine.applyAction(match, slot, action)             │
 Red Driver ──┤────▶│     ├─ teams.blue.state : GameState  ◀─ co-op engine, unchanged                │
 Red Nav   ───┘     │     └─ teams.red.state  : GameState  ◀─ co-op engine, unchanged                │
                    │  30 Hz: versusEngine.step(match, dt)  → both worlds, one clock                 │
      ◀── versus_views (10 Hz): scoreboard + views[team][role] ─────────────────────────────────────── │
                    │  local: versusEngine.getSpectatorView(match) → VersusSpectatorDisplay          │
                    └────────────────────────────────────────────────────────────────────────────────┘
```

- **One ocean, two boats racing (versus-3).** Each team gets an ordinary co-op `GameState` built from the **same seed**, and both hold the **same survivor at the same time**: the crews race for that one person, and when either reaches them the next survivor appears for both. Physics, collisions, Sonar, Radio, Gull drift and hidden-information filtering are reused unchanged. The boats still don't collide or otherwise interact — they only compete for the survivor — but each seat now sees the rival: `VersusNavigatorView.rival` always, `VersusCaptainView.rival` only while the rival is inside the Driver's window.
- **One clock.** `versusEngine.step` advances both worlds by the same `dtMs` on the same tick. The countdown (3 s) ends on one tick for both. The match ends at `VERSUS.matchDurationMs` (120 s).
- **Navigator = Sonar + Radio in one seat.** The engine maps Navigator sweeps to the co-op `"sonar"` sender and Navigator scans to `"radio"`, so co-op permission and cooldown rules apply as they are. Captain = the existing Driver. The Weather seat is dropped; gusts still hit both boats identically.
- **Respawning survivor, not an array.** We keep the single `GameState.target`. On a rescue, the count goes up and the target jumps to survivor #n+1 of a sequence derived from `(seed, n)`. Compared with multiple survivors at once:

  | | Respawn (chosen) | Multiple at once |
  |---|---|---|
  | Contract change | none to `GameState` | `target` → array: changes `types.ts`, views, mocks |
  | Engine code touched | wrapper in `versus.ts` + a spawn function | rescue check, drift, `signalStrength`, Sonar Gull detection, views, score |
  | Co-op tests broken | 0 | ~25 assume a single Gull |
  | Gameplay | one clear objective, so the Navigator always has a job: find the *next* one | Radio readings blur between survivors; Navigator can't call one bearing |
  | Fairness | same sequence for both teams | same, but teams can pick different targets |

- **Wipeout instead of elimination.** Hull 0 sends the boat back to the start with a full hull. Nobody stands around for 60 s.
- **Separate routes, separate sessions.** Versus lives at `/versus/*` with new `VersusHostSession` / `VersusPlayerSession` classes, reusing the transport and the `protocol.ts` helpers. **The co-op routes and classes aren't modified**, so the same build can still demo co-op. That also means `feat/versus` can merge into `main` later without losing the fallback.
- **Additive contract.** `src/game/versus/contract.ts` is new. `types.ts` gains only three `NetworkMessage` variants. Everything still compiles and all co-op tests pass.

## 3. What the baseline already contains (so nobody is blocked)

| Piece | State at handoff | Replaced by |
|---|---|---|
| `versusEngine` (`src/game/engine/versus.ts`) | **Works.** Per-team routing, permissions, countdown, shared clock, end at 120 s, winner and tiebreak, views, scoreboard, spectator. Gaps: a rescue or a hull at 0 freezes that team's world. | Dev 1: respawn + wipeout |
| `NavigatorStation` | **Works.** Existing `SonarStation` and `RadioStation` stacked. | Dev 4: the real Navigator screen |
| `VersusSpectatorDisplay`, `MatchScoreStrip`, `VersusResults` | **Work.** Plain two maps + numbers. | Dev 3: the competitive UX |
| `VersusRoleStation`, `teams.ts`, `/versus/preview` | Done | Dev 2 maintains |
| `VersusHostSession`, `VersusPlayerSession`, `/versus/host`, `/versus/room` | **Not started** | Dev 2: the critical path |

As soon as Dev 2's sessions and routes land, four phones can play a full (one-rescue) match on the placeholders. Every other PR makes it better without blocking it.

## 4. Critical path

1. **Dev 2:** `VersusHostSession` + `VersusPlayerSession` + routes. This is the only thing between the baseline and the go/no-go milestone.
2. **Dev 1:** respawn + wipeout. Makes the match a race instead of "first to one".
3. **Dev 4 / Dev 3:** Navigator screen and spectator UX. Not needed for go/no-go, essential for the demo.

## 5. Gameplay quality without feature bloat

| Goal | How (and who) |
|---|---|
| Fast start | Phones are seated automatically on join (two phones = two Drivers). Host presses Start → 3-2-1-GO on every screen. Results → Reset → Start is two clicks. (Dev 2, Dev 3) |
| Controls understood immediately | Driver: the existing slider + wheel. Navigator: two big cooldown buttons (SWEEP, SCAN) that are always visible, plus tap-to-mark. The lobby card gives a one-line brief. (Dev 4, Dev 2) |
| Frequent survivor discoveries | Respawning survivors, so there's always a next one. The first is ≥ 0.55 map from the start (~16 s straight). Later ones spawn ≥ ~0.35 from the boat. Aim for 3–5 rescues per team per match; tune spawn distance after the first playtest. (Dev 1) |
| Captain and Navigator depend on each other | The Driver only sees a 0.24-wide glare window, never the survivor. The Navigator sees the drone sweep and the radio grid, but can't steer. The Navigator screen turns data into callouts ("survivor 2 o'clock, close"). (Dev 4) |
| Exciting rescues | Rescue burst on the spectator map, "+1" on the score, a phone flash/vibrate for the rescuing team, and a "BLUE TAKES THE LEAD" banner on lead changes. (Dev 3) |
| Live score pressure | The scoreboard is public: every phone shows both scores and who leads. (Dev 3 strip, Dev 2 places it) |
| Dramatic final countdown | Last 10 s (`VERSUS.finalCountdownMs`): red pulsing clock on every screen, ticking sound on the host. (Dev 3) |
| Satisfying results | Big winner banner in team colour, both counts, tiebreak line ("Red got there first"), wipeouts, "Play again". (Dev 3) |
| Fairness | Same seed, same hazards, same gusts, same survivor sequence. (Dev 1, tested) |

**Out of scope:** boat combat, sabotage, power-ups, accounts, matchmaking, inventory, AI APIs, extra levels, a physics rewrite, new dependencies.

## 6. Timeline (Saturday Oct 24 → Sunday Oct 25, 2026, Central Time)

| When (CT) | What |
|---|---|
| ~21:00 Sat | Handoff: all four devs start from `versus-handoff-1` |
| by 23:00 | Dev 2 PR #1 (sessions + routes) and Dev 1 PR #1 (respawn + wipeout) merged into `feat/versus` |
| **by 00:00 Sun** | **Go/no-go milestone** on four real phones (see INTEGRATION.md §4) |
| 00:00–04:00 | Dev 3 and Dev 4 PRs merge; first full playtests; tuning |
| 08:00 | **Feature freeze** on `feat/versus`. Only bug fixes after this |
| 09:00 | Decide: merge `feat/versus` → `main` (both modes ship), or demo co-op from `main` |
| 10:00 | Demo freeze: deployed build locked; rehearse the pitch |
| **12:00 Sun** | **Submission deadline** |
