# Developer 2: Multiplayer, match orchestration & integration (Stormline: Rescue Showdown, contract versus-1)

Copy everything below into your Claude Code or Codex session.

---

You are the coding agent for **Developer 2 (multiplayer, match orchestration, integration lead)** on Stormline, our HowdyHack 2026 entry. Software is due **Sunday Oct 25, 2026, 12:00 Central**. Your job is to **implement and verify** the task below. Don't stop at a plan. Make ordinary implementation choices yourself without asking. **You are on the critical path:** the go/no-go milestone (four phones playing a 2v2 match) can't happen until your first PR merges. Target: merged by 23:00 CT Saturday.

## A. Project context

Stormline is a phone party game: ocean rescue on a sunny "Red Flag Day" beach. It's built with Next.js 16 (App Router), React 19, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind v4 and Supabase Realtime (Broadcast + Presence), and tested with `node:test` via `tsx`.

- **Host-authoritative:** one host laptop runs the simulation; phones send typed `PlayerAction`s and render filtered views.
- **Only** `src/lib/realtime/supabase-*.ts` imports Supabase.
- Components are props in, actions out, and never import `src/lib/**` or the engine.
- **Mock mode must stay honest:** show `<ModeBadge mode="mock" | "preview" | "live" />`.
- No new dependencies.
- Read `AGENTS.md`, `docs/CONTRACTS.md` (co-op protocol) and `docs/versus/CONTRACTS.md` before coding.

The existing four-player co-op game is on `main`, tagged `coop-v1`, and must keep working. **Don't modify** `HostSession`, `PlayerSession`, `HostScreen`, `PlayerScreen` or the co-op routes; build versus beside them.

## B. The new 2v2 game

**Stormline: Rescue Showdown.** *Two crews. One storm. Save the most lives.*

- Four phones, two teams:
  - **Blue:** Captain (the Driver) + Navigator (Sonar sweep/mark + Radio scan/pin)
  - **Red:** the same two seats
- Each team drives its own boat in its own copy of the same seeded ocean. Both race one shared 120 s clock (after a 3 s countdown) to rescue the most survivors. Survivors respawn after each rescue, from a shared deterministic sequence.
- Most rescues wins; ties go to whoever got there first; otherwise it's a tie.
- The host holds one `VersusMatchState` containing **two independent co-op `GameState`s from the same seed**. All game rules live in `versusEngine` (Developer 1).
- **Your job is orchestration:** seats, routing, the loop, broadcasting, reconnects, the screens.

## C. Your role

You own:
- two-team room management and Captain/Navigator seating;
- the versus host loop (two worlds through `versusEngine`) and action routing with seat verification;
- per-seat views to phones, the shared match timer cadence, and match lifecycle (start, reset, results);
- the versus routes and screens;
- integrating everyone's PRs into `feat/versus`.

You don't write game rules, the ocean or spectator visuals, or the Navigator UI.

## D. Git: exact start

```bash
git clone https://github.com/mylesbrandon/stormline.git stormline-versus-network
cd stormline-versus-network
git fetch origin --tags
git switch --track origin/feat/versus-network
git merge-base --is-ancestor c5067ee3c5cbac710a06abf2c3c942e8d19ab8e0 HEAD && echo "baseline OK"
npm install
cp ../stormline/.env.local .env.local    # live Supabase keys (public anon key); without it everything runs in mock mode
npm run check                            # green at handoff (109 tests)
```

With an existing clone, use a worktree instead:
`git fetch origin --tags && git worktree add ../stormline-versus-network --track -b feat/versus-network origin/feat/versus-network`.
Never run two agents in the same directory. Never commit to `main`.

## E. Files you own

- **New:** `src/lib/game-client/versus-host-session.ts`, `src/lib/game-client/versus-player-session.ts`, `src/lib/game-client/versus-sessions.test.ts`
- `src/lib/game-client/index.ts` (exports), `src/lib/realtime/protocol.ts` and `protocol.test.ts`
- **New:**
  - `src/app/versus/host/[roomCode]/page.tsx` + `VersusHostScreen.tsx`
  - `src/app/versus/room/[roomCode]/page.tsx` + `VersusPlayerScreen.tsx`
- `src/app/versus/preview/**` (exists), `src/app/page.tsx`, `src/app/LandingActions.tsx` (add the versus entry)
- `src/components/shared/**`: `VersusRoleStation.tsx`, `teams.ts`, `JoinQr.tsx` (add an optional path prop), and new shared chrome
- `docs/versus/**` (keep them current as integration lead), `package.json` (no new deps)
- As integration lead: merging PRs into `feat/versus`, and landing approved contract changes as separate `contract:` PRs

## F. Files you must NOT edit

- `src/game/engine/**` (Developer 1)
- `src/components/ocean/**`, `src/components/captain/**` (Developer 3)
- `src/components/roles/**` (Developer 4)
- `src/game/types.ts`, `src/game/config.ts`, `src/game/sectors.ts`, `src/game/versus/contract.ts` (frozen; contract changes only as an approved `contract:` PR)
- Co-op files: `host-session.ts`, `player-session.ts`, `src/app/host/**`, `src/app/room/**`, `src/app/debug/**`

You may *import* and reuse anything.

## G. Shared types you must use

From `@/game/versus/contract`:
- `TeamId`, `TEAMS`, `VersusRole`, `PlayerTeamAssignment`, `SLOT_ORDER`
- `VersusPlayer`, `VersusRoom`
- `VersusEngine`, `VersusMatchState`, `MatchScoreboard`, `MatchResult`, `MatchEvent`
- `VersusViews`, `VersusRoleView`, `SpectatorMatchView`, `VERSUS`

From `@/game/engine`: `versusEngine` (implements `VersusEngine`).

From `@/game/types`: `NetworkMessage`, which now includes:

```ts
| { type: "versus_room";   room: VersusRoom }
| { type: "versus_views";  matchId: string; tick: number; scoreboard: MatchScoreboard; views: VersusViews }
| { type: "versus_events"; matchId: string; tick: number; events: MatchEvent[] }
```

Plus the unchanged `hello`, `action` (`ActionEnvelope`) and `action_rejected`, and `PresenceMeta`.

Reuse from `@/lib/realtime/protocol`: `createMessage`, `newId`, `SeqTracker`, `RecentIds`, `ViewOrderTracker`, `type MessageBody`. `isNetworkMessage` already accepts the versus types.

Reuse `RoomTransport` / `createTransport` / `MockRoomTransport`, `Store`, `useStore`, and `player-identity`'s `loadTabIdentity` / `saveIdentity`.

UI components with frozen props:
- `VersusRoleStation({ view: VersusRoleView, onAction })` (yours, in `components/shared`)
- `VersusSpectatorDisplay({ view: SpectatorMatchView })`, `MatchScoreStrip({ scoreboard, team? })`, `VersusResults({ result, team?, footer? })` (Dev 3, `components/ocean/versus/`)
- `NavigatorStation` (Dev 4)

Display metadata: `TEAM_INFO`, `VERSUS_ROLE_INFO` (`components/shared/teams.ts`), and Tailwind `text-team-blue` / `text-team-red`.

## H. What to implement

Mirror the structure of the co-op `HostSession` / `PlayerSession` (read them first). It's proven code.

### 1. `VersusHostSession` (`src/lib/game-client/versus-host-session.ts`)

```ts
export interface VersusHostSnapshot { status: TransportStatus; error: string | null; room: VersusRoom; spectator: SpectatorMatchView; recentEvents: MatchEvent[] }
export interface VersusHostSessionOptions { roomCode: string; transport: RoomTransport; engine: VersusEngine; hostId?: string; now?: () => number }
export class VersusHostSession {
  readonly hostId: string; readonly store: Store<VersusHostSnapshot>;
  start(opts?: { loop?: boolean }): Promise<void>; stop(): Promise<void>;
  startMatch(): void; resetMatch(): void;
  assignSlot(playerId: string, slot: PlayerTeamAssignment | null): void;
  tick(dtMs?: number): void; getMatch(): VersusMatchState; get transportKind(): RoomTransport["kind"];
}
```

- **Loop:** the same fixed-step accumulator as `HostSession.runFrame`. Each `tick` calls `engine.step(match, 1000 / NETWORK.simHz)` and collects events. Both worlds advance inside that one call, so the shared clock is automatic. Broadcast every `1000 / NETWORK.viewBroadcastHz` ms.
- **`startMatch()`:** `match = engine.createMatch({ seed: Math.floor(now() % 1e9), matchId: newId() })`, then `engine.startMatch(match)`, set `room.status = "playing"`, broadcast right away. Each match is a fresh seed, and both teams always share it.
- **`resetMatch()`:** `createMatch({ seed: 1, matchId: newId() })`, `room.status = "lobby"`, broadcast.
- After each tick, if `match.phase === "ended"` and the room is playing, set `room.status = "ended"`.
- **Seating (`handlePresence`):**
  - a new player id gets the first free seat in `SLOT_ORDER`; if all four are taken, `slot: null` (watching). Add them to `players` anyway, so their phone shows "watching" rather than hanging;
  - known ids keep their seat; online/offline only updates `connected`;
  - offline players keep their seat until the host reseats them.
- **`assignSlot(playerId, slot)`:** if another player holds `slot`, **swap** them into the mover's old seat, so a seat is never held twice. `null` unseats.
- **Messages:**
  - `hello`: `seq.resetPlayer(id)`, update the name, send `versus_room`, then `versus_views`.
  - `action`:
    1. require `envelope.playerId === m.from`;
    2. require `seq.accept`;
    3. look the seat up in **your roster**; if there's none, send `action_rejected { reason: "unknown_player" }`;
    4. call `engine.applyAction(match, slot, envelope.action)`;
    5. if rejected, send `action_rejected`; otherwise keep the new match and queue its events.
  - Drop duplicate `msgId`s with `RecentIds`. Ignore everything else.
- **Broadcast:** send `versus_views { matchId, tick, scoreboard: engine.getScoreboard(m), views: engine.getViews(m) }`. If events are pending, also send `versus_events` and append them to `store.recentEvents` (cap 20). Publish `spectator: engine.getSpectatorView(match)` to the store every frame.

### 2. `VersusPlayerSession` (`src/lib/game-client/versus-player-session.ts`)

```ts
export interface VersusPlayerSnapshot { status; error; room: VersusRoom | null; me: VersusPlayer | null; view: VersusRoleView | null; scoreboard: MatchScoreboard | null; lastViewAt: number; recentEvents: MatchEvent[]; lastRejection: { actionId: string; reason: ActionRejectReason } | null }
export class VersusPlayerSession { start(opts?: { watchdog?: boolean }); stop(); sendAction(action: PlayerAction): string; get playerId(): string }
```

This works like `PlayerSession`:
- `seq` restarts at 0 on every `hello`;
- send `hello` on connect, and again when views are stale for `NETWORK.staleAfterMs` while the room is playing;
- on `versus_room`, update `room` and `me`;
- on `versus_views`: if `me.slot` is set and `ViewOrderTracker.accept(matchId, tick)`, store `view = views[slot.team][slot.role]`, `scoreboard` and `lastViewAt`;
- on `versus_events`, keep the last 20;
- on `action_rejected` for your own `actionId` prefix, set `lastRejection`.

### 3. Routes and screens

- **`/versus/host/[roomCode]`** (`VersusHostScreen`). Copy the `HostScreen` layout:
  - wordmark, `ModeBadge`, the big room code, `JoinQr` pointing at `/versus/room/<CODE>` (add an optional `path` prop to `JoinQr`, default `"room"`, so co-op stays unchanged);
  - a **lineup** card: the four seats in `SLOT_ORDER`, team-coloured, each with the player name, online/offline, and a control to reseat or swap (a `<select>` of players per seat is fine);
  - **Start** and **Reset** buttons;
  - `<VersusSpectatorDisplay view={snap.spectator} />`;
  - `<VersusResults result={...} />` once `spectator.scoreboard.result` is set.
  - In mock transport, show the mock notice with a link to `/versus/preview`.
- **`/versus/room/[roomCode]`** (`VersusPlayerScreen`). Copy `PlayerScreen`'s identity flow (`Boarding` state, `loadTabIdentity` / `saveIdentity`, nothing read from storage during render). Its states:
  - **name form**;
  - **"watching"** when `me.slot === null`;
  - **seat card** in lobby/briefing: team label and colour, role label/icon/brief from `VERSUS_ROLE_INFO`, "Waiting for the whistle…";
  - **countdown/active:** `<MatchScoreStrip scoreboard={scoreboard} team={me.slot.team} />` above `<VersusRoleStation view={view} onAction={(a) => session.sendAction(a)} />`;
  - **ended:** `<VersusResults result={scoreboard.result} team={me.slot.team} footer={…} />`.
  - Show `ConnectionBanner` throughout.
- **Landing page:** add a "Host a Rescue Showdown (2v2)" button (`/versus/host/<generateRoomCode()>`) next to the co-op one. Keep co-op first or equal. Joining by QR is the main path; adding a versus join form is optional.

### 4. Tests (`src/lib/game-client/versus-sessions.test.ts`, `MockRoomTransport`, `versusEngine`)

Copy the `setup()` pattern from `sessions.test.ts`. Cover:
- seat order for 4 joins; a 5th is `slot: null` and gets `unknown_player`;
- `assignSlot` swaps keep seats unique;
- each phone's `view.role` / `view.team` matches its seat after start (run `host.tick()` past `VERSUS.countdownMs`);
- the blue captain's throttle moves only blue;
- a navigator's `STEER` is rejected `not_permitted` to that phone only; a captain's `START_GAME` is rejected;
- a duplicate `msgId` is applied once; a stale `seq` is dropped; an older `versus_views` tick is ignored;
- disconnect/reconnect with the same id + `hello` keeps the seat and resumes views;
- `resetMatch` gives a new `matchId` that phones accept;
- full lifecycle with manual ticks to `VERSUS.matchDurationMs` gives room `"ended"` and `scoreboard.result` on phones.

In `protocol.test.ts`, check that `isNetworkMessage` accepts the three versus types.

## I. Mocks and adapters while others work

- `versusEngine` already works as a baseline adapter: routing, countdown, shared clock, winner, views. Until Dev 1 merges respawn, each team can rescue once, and then that boat freezes. That's enough for the go/no-go.
- The UI placeholders (`NavigatorStation`, `VersusSpectatorDisplay`, `MatchScoreStrip`, `VersusResults`) already render real views. Wire them; Dev 3 and Dev 4 replace their insides later without changing props.
- `src/game/versus/mock.ts` + `/versus/preview` show the target look without a network.

## J. Steps

1. Run `npm run check` (green). Read `host-session.ts`, `player-session.ts`, `protocol.ts`, `sessions.test.ts`, `HostScreen.tsx`, `PlayerScreen.tsx`, `src/game/versus/contract.ts` and `src/game/engine/versus.ts`.
2. Write `VersusHostSession` + `VersusPlayerSession` and the session tests. Get `npm test` green.
3. Build `/versus/host` and `/versus/room` plus the landing button. Run `npm run dev`, open `/versus/host/TEST` in mock mode, and check it renders with no console errors.
4. Run `npm run check`, commit, push, open PR #1 (O). **Merge it into `feat/versus` as soon as it's green.** As integration lead you may self-merge after the checks below; ask one teammate to skim if they're free.
5. Live test: run `npm run dev:lan` (or the Vercel preview) with `.env.local`, and do the four-phone smoke test (TEST-PLAN §3 steps 1–9) with your teammates. Fix bugs in your files.
6. Integrate the others' PRs in the order given in INTEGRATION.md §2. After each merge, run `npm run check` and a quick four-phone match.
7. Call **go/no-go at 00:00 CT** (INTEGRATION.md §4) and tell the team.

## K. Acceptance criteria

- Four phones join `/versus/room/<CODE>` and are seated blue captain, red captain, blue navigator, red navigator. The host lineup shows this, and swapping works.
- Start shows a 3 s countdown on every screen. Then both Drivers steer only their own boats, and Navigators sweep and scan only their own ocean.
- Scores update live on the host and on every phone. At 120 s the match ends, and the same correct result shows everywhere.
- A reloaded phone returns to the same seat within 3 s. Duplicate and stale messages have no effect.
- Reset → Start works without reloads. Co-op `/host` + `/room` still plays a full mission.

## L. Test cases and verification

```bash
npm test
npm run check
npm run dev            # mock mode: /versus/host/TEST renders; /versus/preview still works
npm run dev:lan        # live: four phones on the same Wi-Fi (needs .env.local)
```

Manual: TEST-PLAN §3 steps 1–9 and step 12 (co-op regression).

## M. Definition of done

- Both sessions, both routes and the landing entry are implemented.
- The session tests pass, and `npm run check` is green.
- PR merged into `feat/versus`.
- The four-phone smoke test passed live, or the failures are written up precisely.
- The go/no-go call is made and posted.

## N. Report back (to the team; you are the integration lead)

Post:
- the PR URL and merge SHA;
- the `npm run check` summary;
- the four-phone smoke results per step (pass/fail);
- the go/no-go decision with the reason;
- the merge status of Dev 1, 3 and 4's PRs;
- any contract changes you landed (with diffs).

## O. Commit and PR

```bash
git add src/lib src/app src/components/shared docs/versus
git commit -m "realtime: versus host/player sessions, routes and tests"
git push -u origin feat/versus-network
gh pr create --base feat/versus --head feat/versus-network \
  --title "realtime: versus sessions + /versus/host + /versus/room" \
  --body "Two-world host via versusEngine, seats per SLOT_ORDER, versus_room/views/events, reconnect. npm run check: <paste summary>."
gh pr merge <number> --merge      # once green and smoke-tested
```

Without `gh`: push and use `https://github.com/mylesbrandon/stormline/compare/feat/versus...feat/versus-network`.
Never force-push, never `reset --hard`, never delete branches, never push to `main`. To merge others' PRs, use `gh pr merge <n> --merge`, then `git fetch origin && git merge origin/feat/versus` on your branch.

## P. Blockers

If the contract can't express something you need (for example a new message field), **don't edit `contract.ts` or `types.ts` inside your feature PR.**
1. Write the exact diff and the reason.
2. Tell all three developers.
3. Land it as its own tiny `contract:` PR on `feat/versus` with `npm run check` green.
4. Announce the new merge.

If someone else's module blocks you, say exactly what you need from whom.

## Q. Implement and verify

Actually write the code and tests, run them, and report real output. Don't claim a check passed, or that phones synced, unless you saw it happen. Mock mode must never pretend devices are synchronized.
