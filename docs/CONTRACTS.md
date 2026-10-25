# Contracts

The source of truth is code: [`src/game/types.ts`](../src/game/types.ts) and [`src/game/config.ts`](../src/game/config.ts). This doc explains the rules behind them.

> **Changing `types.ts` or the meaning of anything in `config.ts` needs a thumbs-up from all four devs** (post in team chat, open a small PR titled `contract: …`, Dev 2 merges). Tweaking a tuning number in `config.ts` during playtesting is fine — just announce it.

## 1. Units and coordinates

| Quantity | Unit | Notes |
|---|---|---|
| Position | normalized map units | Ocean is the square `[0,1] × [0,1]`. `(0,0)` = top-left / north-west. `+x` = east, `+y` = **south** (screen convention). |
| Heading / angles | radians | `0` = north (up), **clockwise** positive. `π/2` = east. Engine keeps heading in `[0, 2π)`. |
| Speed, current | map units / second | Full throttle ≈ `BOAT.maxSpeed` = 0.035 (crosses the map in ~29 s). |
| Game time | milliseconds of **mission time** | `MissionState.elapsedMs`. All cooldowns (`pingReadyAtMs`, `shieldReadyAtMs`…) are mission time. |
| Network timestamps | wall-clock ms (`Date.now()`) | Only in envelopes (`sentAt`). Never used for game logic. |
| Rudder | `-1..1` | -1 hard port (left), +1 hard starboard (right). |
| Throttle | `0..1` | |

Rendering: multiply normalized coordinates by the canvas side length. Heading vector: `dx = sin(heading)`, `dy = -cos(heading)`.

## 2. State ownership

| State | Lives in | Mutated by | Owner |
|---|---|---|---|
| `GameState` (authoritative world) | Host browser only, inside `HostSession` | **Only** engine functions (`applyAction`, `step`) | Dev 1 (rules), Dev 2 (where it's held) |
| `Room` (roster, roles, status) | Host browser, `HostSession` | `HostSession` (presence, role assignment) | Dev 2 |
| `RoleViewState` | Each phone, `PlayerSession.store` | Replaced wholesale on every `views` message | Dev 2 (delivery), Dev 3/4 (rendering) |
| UI-local state (slider drag, animations) | React components | Components | Dev 3 / Dev 4 |

Nobody else keeps a copy of game rules. Phones **never** simulate; they render the latest view and interpolate between views for smoothness.

## 3. Module boundaries

```
 src/game/types.ts, config.ts, sectors.ts, mock-state.ts   ← shared contracts (everyone imports)
          ▲                 ▲                      ▲
 src/game/engine  (Dev 1)   │                      │
   pure TS: createInitialState / applyAction / step / getRoleViews / getSpectatorView
          ▲                 │                      │
 src/lib/realtime (Dev 2)   │                      │
   RoomTransport: MockRoomTransport | SupabaseRoomTransport, protocol helpers
          ▲                 │                      │
 src/lib/game-client (Dev 2)                       │
   HostSession (engine + transport loop), PlayerSession, Store, hooks
          ▲                                        │
 src/app/** routes (Dev 2) ──── compose ────► src/components/** (Dev 3, Dev 4)
                                               props in (views), typed actions out (onAction)
```

Import rules (enforced by review, not tooling):

- `src/game/**` imports nothing from React, Next, Supabase, `src/lib`, or `src/components`.
- `src/components/**` never imports `src/lib/realtime` or the engine. A station's whole API is `({ view, onAction })`.
- Only `src/lib/realtime/supabase-*.ts` imports `@supabase/supabase-js`.
- Other modules import a module's public `index.ts` (`@/game/engine`, `@/lib/realtime`) rather than its internals.

## 4. Actions

`PlayerAction` is a discriminated union on `type`:

| Action | Payload | Who may send | Valid phase | Notes |
|---|---|---|---|---|
| `STEER` | `rudder: -1..1` | captain | active | Continuous "set" — latest wins |
| `SET_THROTTLE` | `throttle: 0..1` | captain | active | Continuous "set" — latest wins |
| `SONAR_PING` | — | sonar | active | Cooldown `SONAR.pingCooldownMs`; reveals hazards within `SONAR.pingRange` |
| `MARK_HAZARD` | `position: Vec2` | sonar | active | Shared marker everyone sees |
| `WEATHER_SHIELD` | — | weather | active | Cooldown `WEATHER.shieldCooldownMs`; current × `shieldCurrentFactor` for `shieldDurationMs` |
| `RADIO_SCAN` | `sector: SectorId` | radio | active | Cooldown `RADIO.scanCooldownMs`; adds a `SignalReading` |
| `MARK_TARGET` | `position: Vec2` | radio | active | Shared "we think they're here" marker |
| `START_GAME` | — | host | not active | |
| `RESET_GAME` | — | host | any | Host session creates a fresh `GameState` (new `gameId`) |

The permission table is code: `ACTION_PERMISSIONS` in `types.ts`.

### How the host validates an action

1. **Transport**: `isNetworkMessage()` structural check; drop if `msgId` was already seen (`RecentIds`).
2. **Identity**: `envelope.playerId` must equal the message `from`.
3. **Ordering**: `SeqTracker.accept(playerId, seq)` — drop if `seq <=` the last accepted seq for that player (duplicates and out-of-order). A player's `hello` resets their counter (page reloads start at 1 again).
4. **Role**: host looks up the sender's role in `Room.players` (unknown → `unknown_player`).
5. **Engine**: `applyAction(state, action, role)` → `validateAction` checks permission, phase and payload range; `applyAction` checks cooldowns. Rejections return `rejected: ActionRejectReason` and the unchanged state.
6. Rejected actions get an `action_rejected` reply (optional UX feedback; never required for correctness).

Because steering/throttle are "set to value" (not "nudge by"), dropping an old one is always safe — the next one carries the full intent.

## 5. Network protocol

One Supabase Realtime channel per room: `shoreline:room:<CODE>`. One broadcast event name: `"msg"`. Payload is always a `NetworkMessage`; route on `message.type`. `broadcast.self = false`.

| `type` | Direction | When | Payload |
|---|---|---|---|
| `hello` | player → host | on join, on reconnect, when views go stale | `playerId`, `name` |
| `action` | player → host | on input | `ActionEnvelope` |
| `room` | host → all | any roster/status change, and after every `hello` | `Room` |
| `views` | host → all | `NETWORK.viewBroadcastHz` (10 Hz) while running + after `hello` | `gameId`, `tick`, `views: Partial<RoleViews>` |
| `events` | host → all | with `views` when the engine emitted events | `GameEvent[]` |
| `action_rejected` | host → all (filtered by actionId prefix) | on rejection | `actionId`, `reason` |
| `test` | anyone | connectivity smoke test | `text` |

**Presence** (same channel) carries `PresenceMeta { playerId, name, kind: "host"|"player", onlineAt }`, keyed by `playerId`. The host derives `Player.connected` from presence.

### Why a "views bundle" and is it really hidden?

The host sends all four role views in one message (~2–4 KB at 10 Hz — well inside Supabase limits) and each phone renders only its own. This is simple and robust, but a curious player with devtools could read another role's view. **The rescue target is never in the Captain, Weather or Radio views** (only in `GameState`, in `SpectatorView` after the mission ends, and as a `"gull"` contact in the Sonar view when a ping catches it in range), so the core secret only leaks to someone already close to it. For a party game this trade-off is fine. If we have time, Dev 2 can switch to per-player messages without touching anyone else's code.

### Duplicates and ordering

- Exact duplicates: dropped by `msgId` (`RecentIds`) on both sides.
- Actions: per-player `seq`, see above.
- Views: `ViewOrderTracker` keeps a view only if `tick` is newer for the same `gameId`; a new `gameId` (start/reset) always wins.
- Events are best-effort cosmetic signals (shake, sound). Anything that matters is also reflected in the next view.

## 6. Hidden information

Implemented in **one place**: `src/game/engine/views.ts` (`getRoleViews`, `getSpectatorView`). Tests in `engine.test.ts` assert no leaks.

| Data | Captain | Sonar | Weather | Radio | Spectator |
|---|---|---|---|---|---|
| Boat, mission clock, shared markers | ✅ | ✅ | ✅ | ✅ | ✅ |
| Revealed hazards | ✅ | as contacts | — | — | ✅ |
| Unrevealed hazards | only within `CAPTAIN.visualRange` | — | — | — | — |
| Current (coarse arrow) | ✅ | — | ✅ exact | — | ✅ |
| Current forecast | — | — | ✅ | — | ✅ (judges enjoy it) |
| Signal readings, distress log | — | — | — | ✅ | — |
| Rescue target | — | only as a `"gull"` ping contact within range | — | — | only after mission ends |

## 7. Rendering on clients

- Phones keep the latest view in `PlayerSession.store` and React reads it via `useStore`.
- `OceanCanvas` redraws every animation frame from the latest props. Dev 3 adds interpolation (render `NETWORK.interpolationDelayMs` behind, lerp between the last two boat states).
- Countdowns use mission time from the view (`view.mission.elapsedMs`), so all phones agree.

## 8. Reconnection / resynchronization

| Situation | What happens |
|---|---|
| Phone locks / tab sleeps / Wi-Fi blip | Presence drops → host marks player `connected: false` but **keeps their role**. Game continues. |
| Phone comes back | Supabase rejoins the channel → `PlayerSession` sends `hello` on `connected` → host replies with `room` + fresh `views`. Because views are full snapshots (not deltas), one message fully resyncs. |
| Page reload | `playerId` is persisted in `localStorage` per room (`player-identity.ts`), so the host recognizes the same player and keeps their role. Seq restarts at 1 and `hello` resets the host's tracker. |
| No views for `NETWORK.staleAfterMs` while playing | `PlayerSession` re-sends `hello`; UI may show "Reconnecting…". |
| Host laptop reloads | **Game is lost** (host is authoritative and in-memory). Phones stay on the channel; host starts a new mission. Mitigation for demo day: don't reload the host; keep it plugged in. Optional stretch: snapshot `GameState` to `sessionStorage` every second and restore. |
| Fifth device joins | Gets no role; sees the "watching" screen. |

## 9. Mock mode

With no Supabase env vars, `createTransport()` returns `MockRoomTransport`, which only connects transports **in the same tab**. The UI says so (`<ModeBadge mode="mock" />`) and the player page refuses to fake a connection. Station previews at `/room/DEMO?preview=<role>` use hand-written data from `mock-state.ts`.
