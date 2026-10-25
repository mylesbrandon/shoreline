# Developer 1: Engine & rescue logic (Stormline: Rescue Showdown, contract versus-1)

Copy everything below into your Claude Code or Codex session.

---

You are the coding agent for **Developer 1 (game engine and rescue logic)** on Stormline, our HowdyHack 2026 entry. Software is due **Sunday Oct 25, 2026, 12:00 Central**. Your job is to **implement and verify** the task below in code, with tests. Don't stop at a plan. Make ordinary implementation choices yourself without asking.

## A. Project context

Stormline is a phone party game: ocean rescue on a sunny "Red Flag Day" beach. It's built with Next.js 16, React 19, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind v4 and Supabase Realtime, and tested with `node:test` via `tsx`.

- **Host-authoritative:** one host laptop runs the simulation. Phones send typed `PlayerAction`s and render filtered views.
- **The engine (`src/game/engine/**`) is pure TypeScript:**
  - no React, DOM, Supabase, `src/lib/**` or `src/components/**` imports;
  - no `Date.now()`, `Math.random()` or `performance.now()`. Use `createRng(seed)` from `./rng` and the `dtMs` argument;
  - never mutate input state.
- **Hidden information** is filtered only in `src/game/engine/views.ts`.
- Read `AGENTS.md` and `docs/versus/CONTRACTS.md` before coding.

The existing four-player co-op game (Driver, Drone/Sonar, Surf Watch/Weather, Tower Radio, all chasing one drifting "Gull") is on `main`, tagged `coop-v1`. It must keep working: **all 89 co-op tests in `src/game/engine/engine.test.ts` must still pass without edits.**

## B. The new 2v2 game

**Stormline: Rescue Showdown.** *Two crews. One storm. Save the most lives.*

- Four phones, two teams:
  - **Blue:** Captain (the Driver) + Navigator (Sonar sweep/mark + Radio scan/pin)
  - **Red:** the same two seats
- Each team drives its own boat in **its own copy of the same seeded ocean**. Both race one shared 120 s clock (after a 3 s countdown) to rescue as many survivors as possible.
- Most rescues wins. Ties go to whoever reached that total first; otherwise the match is a tie.
- The architecture is already decided:
  - the host runs **two independent co-op `GameState`s from the same seed**, one per team;
  - your existing single-boat engine runs each one unchanged;
  - each world keeps **one survivor at a time** (`GameState.target`). On a rescue the team's count goes up and the **next survivor in a deterministic shared sequence** appears;
  - a hull at 0 is a **wipeout:** the boat respawns at the start and the match goes on.

## C. Your role

You own the versus rules in the engine:
- survivor respawn and the shared survivor sequence;
- exactly-once rescue counting;
- wipeouts;
- timed match completion and scoring correctness;
- deterministic tests.

You don't touch networking or React.

## D. Git: exact start

```bash
git clone https://github.com/mylesbrandon/stormline.git stormline-versus-engine
cd stormline-versus-engine
git fetch origin --tags
git switch --track origin/feat/versus-engine
git merge-base --is-ancestor c5067ee3c5cbac710a06abf2c3c942e8d19ab8e0 HEAD && echo "baseline OK"
npm install
npm run check      # must be green before you change anything (109 tests at handoff)
```

If you already have a clone with work in it, use a separate worktree instead:
`git fetch origin --tags && git worktree add ../stormline-versus-engine --track -b feat/versus-engine origin/feat/versus-engine`.
Never run two agents in the same directory. Never commit to `main` or `feat/versus` directly.

## E. Files you own

- `src/game/engine/versus.ts`: the `versusEngine` implementation. A working baseline adapter is already there.
- `src/game/engine/versus.test.ts`: versus engine tests. A baseline suite is already there. Add to it; don't weaken it.
- New engine files you create, e.g. `src/game/engine/survivors.ts` (and `survivors.test.ts` if you want).
- `src/game/engine/index.ts`: add exports only.
- The other `src/game/engine/*.ts` files: **additive exports only** (e.g. exporting a helper). Co-op behaviour must not change.

## F. Files you must NOT edit

- `src/game/types.ts`, `src/game/config.ts`, `src/game/sectors.ts`, `src/game/versus/contract.ts`, `src/game/versus/contract.test.ts` (frozen contract);
- `src/game/engine/engine.test.ts` (co-op tests);
- everything in `src/lib/**`, `src/app/**`, `src/components/**`, `package.json`, `docs/**`.

`src/game/versus/mock.ts` is additive-only and you shouldn't need it.

If you believe a contract change is needed, **stop and tell Developer 2** with the exact diff and the reason. Don't change shared types yourself.

## G. Shared types you must use (from `@/game/versus/contract`, relative path `../versus/contract`)

```ts
type TeamId = "blue" | "red";  const TEAMS;  type VersusRole = "captain" | "navigator";
interface PlayerTeamAssignment { team: TeamId; role: VersusRole }
const VERSUS = { matchDurationMs: 120_000, countdownMs: 3_000, finalCountdownMs: 10_000, recentRescuesKept: 8 };
type MatchPhase = "briefing" | "countdown" | "active" | "ended";
interface RescueEvent { team; survivorIndex /* 0-based */; position: Vec2; atMs }
interface TeamWorld { team; state: GameState; rescues; wipeouts; lastRescueAtMs: number | null; rescueLog: RescueEvent[] }
interface VersusMatchState { matchId; seed; tick; phase; countdownRemainingMs; elapsedMs; durationMs; teams: Record<TeamId, TeamWorld>; result: MatchResult | null }
interface TeamScore { team; rescues; wipeouts; hull; lastRescueAtMs }
interface MatchResult { winner: TeamId | null; scores: Record<TeamId, TeamScore>; endedAtMs }
type MatchEvent = MATCH_COUNTDOWN | MATCH_STARTED | SURVIVOR_RESCUED{rescue} | BOAT_WIPEOUT{team,atMs} | MATCH_ENDED{result} | TEAM_GAME_EVENT{team,event}
function decideWinner(scores): TeamId | null;   function versusRoleMay(role, actionType): boolean;
interface VersusEngine { createMatch; startMatch; applyAction(match, slot, action); step(match, dtMs); getViews; getScoreboard; getSpectatorView }
```

Co-op engine pieces you reuse:
- `createInitialState({ seed, gameId })` (`./state`);
- `step(state, dtMs)` (`./step`). Its endings: hull 0 → `failure/hull_destroyed`; reaching the Gull → `victory`; time up → `failure/timeout`. Precedence is hull > victory > timeout;
- `applyAction(state, action, sender)` (`./actions`);
- `LAYOUT` (`./layout`, exported), `createRng` / `randomBetween` (`./rng`);
- `MISSION.boatStart`, `MISSION.boatStartHeading`, `BOAT.startHull`, `TARGET.rescueRadius` (`../config`).

## H. What to implement

The baseline adapter in `src/game/engine/versus.ts` already does:
- per-team action routing and permissions (Navigator → co-op `"sonar"` / `"radio"` sender);
- the countdown;
- both worlds stepped by the same `dtMs`;
- the match ending at `durationMs` with `decideWinner`;
- views, scoreboard and spectator view.

It has two `TODO(dev1)` gaps in `stepWorld`: a rescue or a hull at 0 currently **freezes** that team's world. Replace them:

1. **Survivor sequence** (new `src/game/engine/survivors.ts`):
   ```ts
   export const SURVIVORS = { minSpawnFromBoat: 0.35, candidates: 24 } as const;   // engine-owned tuning
   export function survivorSpawn(seed: number, survivorIndex: number, hazards: Hazard[], boat: Vec2): Vec2
   ```
   - Survivor #0 is the layout's Gull (the world's initial `target`). For `survivorIndex >= 1`, seed a fresh RNG from `(seed, survivorIndex)`, for example `createRng((seed ^ Math.imul(survivorIndex, 0x9e3779b1)) >>> 0)`. Don't use the world's state for this.
   - Generate `candidates` points inside `[LAYOUT.margin, 1 - LAYOUT.margin]²`.
   - Keep only candidates clear of every hazard: distance ≥ `h.radius + TARGET.rescueRadius + LAYOUT.targetClearance`.
   - Return the **first** kept candidate that is ≥ `minSpawnFromBoat` from `boat`. If none qualifies, return the kept candidate farthest from the boat. If nothing was kept, fall back to a fixed in-map point.
   - This makes the sequence identical for both teams (same seed and index). The boat filter only differs if the boats are in different places, and it exists to stop an instant second rescue. Explain this in a comment.
2. **Respawn on rescue** (in `stepWorld`): when the co-op step reports `victory` for an active world:
   - record one `RescueEvent { team, survivorIndex: world.rescues, position: <rescued target position>, atMs }`;
   - set `rescues + 1`, `lastRescueAtMs`, and append to `rescueLog`;
   - emit `SURVIVOR_RESCUED`;
   - return the world to `phase: "active"`, `failureReason: null`, `score: null`;
   - move `target.position` to `survivorSpawn(match.seed, world.rescues + 1, state.hazards, state.boat.position)`. Pass `match.seed` into `stepWorld`;
   - clear stale tracking for the old survivor: `radio.readings = []` (keep `lastScanAtMs` so the cooldown still holds), remove `kind: "target_guess"` markers, and remove the `"gull"` sonar contact (`kind === "gull"`). Keep hazard marks and hazard contacts.
   - **Never emit the co-op `MISSION_ENDED`** in versus (the baseline already filters it).
3. **Wipeout on hull 0:** when the co-op step reports `failure` with `hull_destroyed`:
   - set the boat to `position = MISSION.boatStart`, `heading = MISSION.boatStartHeading`, `speed = 0`, `hull = BOAT.startHull`;
   - **keep `throttle` and `rudder`**, so the Driver's controls stay truthful;
   - return the world to `"active"` with `failureReason: null`, `score: null`;
   - set `wipeouts + 1` and emit `BOAT_WIPEOUT`;
   - leave the survivor where it is.
4. **Timeout:** leave the co-op `failure/timeout` alone. The match-level `step` already ends the match when `elapsedMs >= durationMs`. A rescue on the final step must still count (the co-op precedence already gives victory over timeout; your respawn runs first, then the match ends).
5. **Invariants** (test them):
   - `rescues === rescueLog.length`;
   - both worlds' `mission.elapsedMs === match.elapsedMs` while active, including after rescues and wipeouts;
   - every function stays pure and deterministic.
6. *(Only after 1–5 are merged, and only if playtests ask for it.)* There's no Weather seat in versus, so you may scale gust strength for versus worlds inside `createWorld` (for example, multiply forecast currents by an engine-owned factor). Keep it identical for both teams.

Keep `versusEngine`'s exported shape exactly as it is (`VersusEngine`). Developer 2's host session calls it today.

## I. Mocks and adapters

You don't depend on anyone. Test only through `versusEngine` and your engine helpers. The tests' `editWorld` / `openWater` / `at` helpers show how to set up positions. Developers 2, 3 and 4 already integrate against the baseline adapter, so your improvements arrive transparently.

## J. Steps

1. Run `npm run check` (green). Read `src/game/engine/versus.ts`, `versus.test.ts`, `step.ts`, `layout.ts` and `actions.ts`.
2. Write the failing tests from L for the survivor sequence first (`survivorSpawn`), then implement `survivors.ts`.
3. Write the failing tests for respawn, the clearing of readings, pin and gull contact, and exactly-once counting. Then implement them in `stepWorld`.
4. Do the same for wipeouts.
5. Add the invariants and determinism tests.
6. Run `npm test`, then `npm run check`. Commit in small steps (`engine: versus survivor sequence`, `engine: versus respawn`, `engine: versus wipeout`).
7. Push and open the PR (O).

## K. Acceptance criteria

- A team can rescue survivors repeatedly in one match. Each rescue counts exactly once, with `survivorIndex` 0, 1, 2, …
- Both teams get the same survivor positions for the same index when their boats rescue from the same positions.
- Spawned survivors are inside the margin, clear of hazards, and ≥ `minSpawnFromBoat` from the boat whenever a valid candidate exists.
- A hull at 0 respawns the boat and doesn't end that team's game. The match only ends at 120 s.
- All baseline tests in `versus.test.ts` and all 89 co-op tests in `engine.test.ts` pass, without modifying the co-op tests.
- No `Math.random()` / `Date.now()` / `performance.now()` anywhere in `src/game/**`, and no input mutation.

## L. Tests to add (`src/game/engine/versus.test.ts` and/or `survivors.test.ts`)

- three rescues in a row: counts 1/2/3, indices 0/1/2, one `SURVIVOR_RESCUED` each, world still `"active"`;
- staying parked after a rescue for 30 steps doesn't increase the count;
- shared sequence: the two teams give identical spawns for indices 1..5 under identical boat positions;
- spawn validity across 50 seeds × 8 indices (margin, hazard clearance, boat distance);
- `survivorSpawn` is deterministic;
- after a rescue: radio readings empty, no `target_guess` marker, no `"gull"` contact, hazard marks kept;
- wipeout: event once, boat at the start with a full hull and speed 0, throttle/rudder kept, `wipeouts + 1`, world active, survivor unchanged;
- hull 0 and the survivor in the same step: wipeout, no rescue;
- rescue on the final step counts, and the match ends that same step with the right winner;
- an equal count is decided by the earlier `lastRescueAtMs`;
- clocks stay equal after rescues and wipeouts;
- a scripted full match run twice gives deep-equal final states.

Verify:

```bash
npm test
npm run check
grep -rnE "Math\.random|Date\.now|performance\.now" src/game || echo "engine is pure"
```

## M. Definition of done

- The code is implemented (not described), and the tests above are written and passing.
- `npm run check` is green.
- The PR is open against `feat/versus` with no edits outside your files.

## N. Report back to Developer 2 (integration lead)

Send:
- branch, PR URL, last commit SHA;
- the pasted `npm run check` summary (test count and pass/fail);
- the final `SURVIVORS` tuning values;
- whether gust scaling was added;
- any edge cases you found;
- any contract change you'd like, with the exact diff (don't apply it).

## O. Commit and PR

```bash
git add src/game/engine
git commit -m "engine: versus survivor respawn, wipeouts and tests"
git push -u origin feat/versus-engine
gh pr create --base feat/versus --head feat/versus-engine \
  --title "engine: versus survivor respawn + wipeout" \
  --body "Implements TODO(dev1) in src/game/engine/versus.ts per docs/versus/CONTRACTS.md (versus-1). npm run check: <paste summary>."
```

If `gh` isn't authenticated, push the branch and give Developer 2 the compare URL: `https://github.com/mylesbrandon/stormline/compare/feat/versus...feat/versus-engine`.
Never force-push, never `reset --hard`, never delete branches.

## P. Blockers

If something can't be done inside your files and the frozen contract, **stop and explain** it to Developer 2: what, why, and the smallest change that would unblock you. Don't silently change shared types, other developers' files or co-op behaviour.

## Q. Implement and verify

You're expected to actually write the code and the tests, run them, and report real output. Don't claim a check passed unless you ran it and saw it pass.
