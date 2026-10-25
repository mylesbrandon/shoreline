# Rescue Showdown — shared contracts (versus-1)

**Contract version:** `versus-1` (`VERSUS_CONTRACT_VERSION` in `src/game/versus/contract.ts`)
**Baseline commit:** `c5067ee3c5cbac710a06abf2c3c942e8d19ab8e0` on `feat/versus` · **handoff tag:** `versus-handoff-1`
**Co-op fallback:** tag `coop-v1` = `0da07f9` (= `main` at handoff, deployed on Vercel)

Everything here is **frozen** for parallel work. To change it, message Developer 2 (integration lead) with the exact diff and the reason. Dev 2 lands contract changes on `feat/versus` as one small `contract:` PR, and everyone merges it in. Never edit a frozen file in a feature PR.

## 1. Files

| File | What | Status |
|---|---|---|
| `src/game/versus/contract.ts` | All 2v2 types, `VERSUS` tuning, `SLOT_ORDER`, `VERSUS_ACTION_PERMISSIONS`, `versusRoleMay`, `decideWinner`, `VersusEngine` interface | **Frozen** |
| `src/game/versus/contract.test.ts` | Tests for the pure contract rules and the mock fixtures | Frozen (goes with the contract) |
| `src/game/types.ts` | Co-op contract, plus 3 additive `NetworkMessage` variants: `versus_room`, `versus_views`, `versus_events` | **Frozen** |
| `src/game/config.ts`, `src/game/sectors.ts` | Co-op tuning and the radio grid, unchanged | **Frozen** |
| `src/game/versus/mock.ts` | Scripted 2v2 fixtures for UI work | Shared, **additive only** |
| `src/game/engine/versus.ts` | `versusEngine` implementing `VersusEngine` (baseline adapter) | Dev 1 |
| `src/lib/realtime/protocol.ts` | `KNOWN_TYPES` now accepts the 3 versus message types | Dev 2 |

Import paths: `@/game/versus/contract`, `@/game/versus/mock`, `versusEngine` from `@/game/engine` (host session only).

## 2. Teams, seats, identity

```ts
type TeamId = "blue" | "red";                       // TEAMS = ["blue", "red"]
type VersusRole = "captain" | "navigator";          // VERSUS_ROLES
interface PlayerTeamAssignment { team: TeamId; role: VersusRole }   // a "slot"/seat
interface VersusPlayer { id; name; slot: PlayerTeamAssignment | null; connected; joinedAt }
interface VersusRoom { code; hostId; players: VersusPlayer[]; status: RoomStatus; createdAt }
```

- **Seat assignment is host-only.** On presence join, the host gives a new player the first free seat in `SLOT_ORDER`: blue captain, red captain, blue navigator, red navigator. So two phones already make a two-boat race. A fifth device gets `slot: null` and watches. The host UI can reseat or swap players.
- **Seats persist by `PlayerId`.** A player who disconnects keeps their seat (`connected: false`). A phone that reloads keeps the same `PlayerId` (`player-identity.ts`), sends `hello`, and gets the same seat back.
- **Action identity.** Phones send the existing `action` message (`ActionEnvelope`). The host checks `envelope.playerId === message.from`, then `SeqTracker.accept`, then looks up the seat in **its own roster**. A seat is never read from a payload. An unseated sender gets `action_rejected: "unknown_player"`.
- **Permissions** (`VERSUS_ACTION_PERMISSIONS`, checked by the engine):
  - captain: `STEER`, `SET_THROTTLE`
  - navigator: `SONAR_PING`, `MARK_HAZARD`, `RADIO_SCAN`, `MARK_TARGET`
  - Nobody can send `WEATHER_SHIELD`, `START_GAME` or `RESET_GAME` from a phone in versus. Start and reset are host calls on the engine.
- **Routing.** `versusEngine.applyAction(match, slot, action)` applies the action to `match.teams[slot.team].state` only. It maps the action to the co-op sender role internally: Navigator sweeps count as `"sonar"`, Navigator scans as `"radio"`. That way the co-op permission and cooldown rules run unchanged.

## 3. Match state (host only, engine owned)

```ts
type MatchPhase = "briefing" | "countdown" | "active" | "ended";
interface TeamWorld { team; state: GameState; rescues; wipeouts; lastRescueAtMs: number | null; rescueLog: RescueEvent[] }
interface VersusMatchState {
  matchId; seed; tick; phase; countdownRemainingMs; elapsedMs; durationMs;
  teams: Record<TeamId, TeamWorld>; result: MatchResult | null;
}
interface RescueEvent { team; survivorIndex /* 0-based */; position: Vec2; atMs }
interface TeamScore { team; rescues; wipeouts; hull; lastRescueAtMs }
interface MatchResult { winner: TeamId | null /* null = tie */; scores: Record<TeamId, TeamScore>; endedAtMs }
```

| Field | Source of truth | Notes |
|---|---|---|
| `VersusMatchState` (all of it) | `HostSession` holds it; **only `versusEngine` produces new versions** | Never mutated in place, never broadcast whole |
| `TeamWorld.state` | the co-op engine (`step`/`applyAction`) via the versus engine | an ordinary `GameState`; `gameId = matchId`, `mission.durationMs = VERSUS.matchDurationMs` |
| `rescues`, `rescueLog`, `lastRescueAtMs`, `wipeouts` | versus engine | `rescues === rescueLog.length` |
| `elapsedMs` (match clock) | versus engine | equals both worlds' `mission.elapsedMs` while active |
| `result` | versus engine | set once, when `phase` becomes `"ended"` |
| seats / `VersusRoom` | versus host session (Dev 2) | the engine has no notion of players |
| wall-clock pacing | host session (`runFrame` accumulator) | the engine only ever sees `dtMs` |

**Lifecycle:**
1. `createMatch({ seed, matchId })` gives `"briefing"`: both worlds are built from the **same seed**, so they have identical hazards, survivor #0 and weather.
2. `startMatch` moves it to `"countdown"` (`VERSUS.countdownMs` = 3 s).
3. The `step` that runs the countdown out applies `START_GAME` to both worlds on the same tick, which gives `"active"`.
4. Every `step(match, dtMs)` advances **both** worlds by the same `dtMs`.
5. When `elapsedMs` reaches `durationMs`, the phase becomes `"ended"` and `result = { winner: decideWinner(scores), ... }`.
6. Reset is `createMatch` again with a new `matchId`. Phones treat a new `matchId` as a new stream (`ViewOrderTracker`).

**One ocean, one survivor, two boats racing for them (versus-3).** The host still keeps a `GameState` per team, but both are the same seeded water and both hold the **same survivor at the same time**. The crews race each other for that one person. When a boat reaches them:
- the engine records exactly one `RescueEvent` for that team and `rescues += 1`;
- both worlds stay `"active"`;
- `target.position` moves to the next survivor in the shared sequence **for both teams at once** — the rival loses that one and the race restarts on the next.

Because both teams chase the same person, a single team's `RescueEvent.survivorIndex` values can **skip numbers**: the gaps are the ones the rival reached first. Don't assume a team's indices are contiguous, and don't derive a team's count from the latest index — use `TeamWorld.rescues`.

That sequence is deterministic from `(seed, survivorIndex)`, so both teams see the same survivor locations in the same order. This reuses Radio signal strength, Sonar's Gull contact, Gull drift and the co-op hidden-information rules without turning `target` into an array. Dev 1 owns how it works; the baseline adapter freezes a world after its first rescue.

**Wipeout.** When the hull reaches 0, the boat respawns at `MISSION.boatStart` with a full hull and `wipeouts += 1`. The match continues: the trip back is the penalty. The baseline adapter freezes the world here too, until Dev 1 replaces it.

**In versus, ignore each world's co-op `mission.phase`, `failureReason` and `score`.** A world times out as `"failure"/"timeout"` in co-op terms. UIs read `MatchScoreboard` / `MatchResult` instead.

## 4. Winner rule (`decideWinner`, frozen)

1. More rescues wins.
2. Equal and > 0: the team that reached that total first (smaller `lastRescueAtMs`) wins.
3. Both 0, or the same millisecond: **tie** (`winner: null`).

The scoreboard's live `leader` uses the same function.

## 5. Views

```ts
interface MatchScoreboard { matchId; phase; countdownRemainingMs; elapsedMs; durationMs; scores; leader: TeamId | null; result }
interface VersusCaptainView   { role: "captain";   team; matchId; tick; captain: CaptainView }
interface VersusNavigatorView { role: "navigator"; team; matchId; tick; sonar: SonarView; radio: RadioView }
type VersusRoleView = VersusCaptainView | VersusNavigatorView;
type VersusViews = Record<TeamId, { captain: VersusCaptainView; navigator: VersusNavigatorView }>;
interface SpectatorMatchView { role: "spectator"; matchId; tick; scoreboard; teams: Record<TeamId, SpectatorView>; recentRescues: RescueEvent[] }
```

- The nested co-op views are produced by the existing `getCaptainView` / `getSonarView` / `getRadioView` / `getSpectatorView` on that team's world, so `CaptainStation`, `SonarScope` and the radio grid render them unchanged.
- **Hidden information** is still decided only in `src/game/engine/views.ts`. The big-screen spectator view shows the live survivor while the match is active (`getLiveSpectatorView`); phones never get it except the existing Sonar contact / Driver survivor field:
  - No view contains `target`.
  - Exception 1: `sonar.contacts` may hold a `"gull"` contact (a snapshot from a ping in range), in the **Navigator** view only.
  - Exception 2 (versus-2, versus only): `VersusCaptainView.survivor` is the survivor's position while they are within `VERSUS.captainVisualRange` of that team's boat, and `null` otherwise.
  - Not hidden information (versus-3): the **rival boat**. `VersusCaptainView.rival` is the other team's boat while it is inside this Driver's window (`|dx|,|dy| <= VERSUS.captainWindowSpan / 2`), else `null`; `VersusNavigatorView.rival` is always that boat. Both boats are already on the shared spectator map, so neither field reveals anything new. It is a sibling of the nested co-op `captain` view, so the co-op `CaptainView` itself is unchanged and the co-op game is unaffected.
  - Apart from that field, the Captain view never gets it: `visibleHazards` only lists real hazards.
  - The spectator's per-team `target` is `null` in the lobby and countdown, live during play (big screen only), and the final position once the match ends.
- The **scoreboard is public**: everyone sees both teams' counts and the clock. That's the live score pressure.
- Weather is gone as a seat. Gusts still blow, identically for both teams (same seed). Nobody gets the forecast.

## 6. Network protocol

Everything goes over the same channel (`stormline:room:<CODE>`), event `"msg"`, `PROTOCOL_VERSION` 1.

| Message | Direction | When |
|---|---|---|
| `hello { playerId, name }` (existing) | phone → host | on connect, on reconnect, when views go stale (`NETWORK.staleAfterMs`) |
| `action { envelope }` (existing) | phone → host | every input |
| `action_rejected { actionId, reason }` (existing) | host → all (the phone filters by its own id) | refused action |
| **`versus_room { room: VersusRoom }`** | host → all | any roster/status change, and in reply to `hello` |
| **`versus_views { matchId, tick, scoreboard, views: VersusViews }`** | host → all | `NETWORK.viewBroadcastHz` (10 Hz), and right after start, reset or a `hello` |
| **`versus_events { matchId, tick, events: MatchEvent[] }`** | host → all | with the views broadcast whenever events are pending |

- A versus host never sends co-op `room`, `views` or `events`. Co-op and versus rooms are separate routes, and so separate rooms.
- **Ordering and dedupe are reused unchanged** from `src/lib/realtime/protocol.ts`:
  - `RecentIds` drops duplicate `msgId`s on both sides;
  - `SeqTracker` drops stale or duplicate action `seq`s per player, and is reset on `hello`;
  - `ViewOrderTracker.accept(matchId, tick)` drops older `versus_views`, and a new `matchId` always wins.
- **Size:** measured at about 6.5 KB per `versus_views` mid-match (co-op's whole bundle is about 1.8 KB at the start, more mid-game). That's ~65 KB/s at 10 Hz, well under Supabase's per-message limit. Like co-op, the bundle goes to every device; filtering happens in the engine views, not the transport (see `docs/CONTRACTS.md` §5).
- A phone keeps only `views[me.slot.team][me.slot.role]`, plus the `scoreboard`.

```ts
type MatchEvent =
  | { type: "MATCH_COUNTDOWN"; countdownMs }
  | { type: "MATCH_STARTED"; atMs }
  | { type: "SURVIVOR_RESCUED"; rescue: RescueEvent }
  | { type: "BOAT_WIPEOUT"; team; atMs }
  | { type: "MATCH_ENDED"; result }
  | { type: "TEAM_GAME_EVENT"; team; event: GameEvent };   // HAZARD_HIT, SONAR_PINGED, … never MISSION_ENDED
```

Events are for sound and flashes only. UIs must look right from state alone, because events can be lost. Use `scoreboard.scores`, `SpectatorMatchView.recentRescues` and `TeamScore.lastRescueAtMs` to detect rescues.

## 7. Engine API (`VersusEngine`, implemented by `versusEngine`)

```ts
createMatch({ seed, matchId }): VersusMatchState
startMatch(match): { match, events }                       // briefing → countdown; otherwise a no-op
applyAction(match, slot, action): { match, events, rejected }
step(match, dtMs): { match, events }
getViews(match): VersusViews
getScoreboard(match): MatchScoreboard
getSpectatorView(match): SpectatorMatchView
```

These are pure functions: they never mutate their input and use no clock and no `Math.random()`.

Rejections, in this order:
1. `not_permitted`: the role may not send this action type.
2. `wrong_phase`: the match is not `"active"`.
3. The co-op engine's own `invalid_payload` / `cooldown`.

## 8. UI component props (frozen seams)

| Component | File | Props | Owner |
|---|---|---|---|
| `NavigatorStation` | `src/components/roles/navigator/NavigatorStation.tsx` | `{ view: VersusNavigatorView; onAction: (a: PlayerAction) => void }` | Dev 4 |
| `CaptainStation` (reused) | `src/components/captain/CaptainStation.tsx` | `{ view: CaptainView; onAction }`, receiving `versusView.captain` | Dev 3 |
| `VersusSpectatorDisplay` | `src/components/ocean/versus/VersusSpectatorDisplay.tsx` | `{ view: SpectatorMatchView }` | Dev 3 |
| `MatchScoreStrip` | `src/components/ocean/versus/MatchScoreStrip.tsx` | `{ scoreboard: MatchScoreboard; team?: TeamId }` | Dev 3 |
| `VersusResults` | `src/components/ocean/versus/VersusResults.tsx` | `{ result: MatchResult; team?: TeamId; footer?: ReactNode }` | Dev 3 |
| `VersusRoleStation` | `src/components/shared/VersusRoleStation.tsx` | `{ view: VersusRoleView; onAction }` | Dev 2 |
| `TEAM_INFO`, `VERSUS_ROLE_INFO` | `src/components/shared/teams.ts` | display labels and colour classes | Dev 2 |

The Tailwind tokens are `--color-team-blue` and `--color-team-red` (`text-team-blue`, `bg-team-red/20`, …).

The baseline files with `TODO(devN)` are placeholders that already work. Replace their insides and keep their props.

## 9. Routes

| Route | What | Owner |
|---|---|---|
| `/versus/preview?view=captain\|navigator\|spectator\|results&team=blue\|red` | **Exists.** Mock sandbox with jump buttons (countdown / start / final 10 s / results) | Dev 2 (used by Dev 3 and Dev 4) |
| `/versus/host/[roomCode]` | Versus host laptop: lineup, QR, start/reset, spectator | Dev 2 (to build) |
| `/versus/room/[roomCode]` | Versus phone: name → seat card → station + score strip → results | Dev 2 (to build) |
| `/host/*`, `/room/*`, `/debug/*` | Co-op, **unchanged** | n/a |
