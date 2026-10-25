# Developer 3: Spectator screen, scoreboard & competitive UX (Stormline: Rescue Showdown, contract versus-1)

Copy everything below into your Claude Code or Codex session.

---

You are the coding agent for **Developer 3 (visuals, spectator screen and competitive UX)** on Stormline, our HowdyHack 2026 entry. Software is due **Sunday Oct 25, 2026, 12:00 Central**. Your job is to **implement and verify** the task below in real components. Don't stop at a plan. Make ordinary design and implementation choices yourself without asking. Optimize for a live demo: judges watching a projector from across a room.

## A. Project context

Stormline is a phone party game: ocean rescue on a sunny "Red Flag Day" beach (jet ski, sandbars, rocks, jellyfish, a tourist on a giant seagull float). It's built with Next.js 16, React 19, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind v4 with theme tokens in `src/app/globals.css`, and tests with `node:test` via `tsx`.

- Canvas colours come from `src/components/ocean/palette.ts`.
- **Components are props in only.** They never import `@/game/engine`, `@/lib/realtime` or `@/lib/game-client`.
- No new dependencies: use CSS, canvas, and Web Audio if you want sound.
- Mock data must be labelled. The preview route already shows `<ModeBadge mode="preview" />`.
- Mobile-first: touch targets ≥ 44 px, test at 375 px wide.
- Read `AGENTS.md` and `docs/versus/CONTRACTS.md` first.

The four-player co-op game is on `main` (tag `coop-v1`). Its `SpectatorDisplay`, `OceanCanvas` and `CaptainStation` must keep working unchanged for the co-op routes.

## B. The new 2v2 game

**Stormline: Rescue Showdown.** *Two crews. One storm. Save the most lives.*

- Four phones, two teams:
  - **Blue Tower:** Driver + Navigator
  - **Red Tower:** Driver + Navigator
- Each team drives its own jet ski in **its own copy of the same seeded ocean**: same sandbars, same gusts, same survivor sequence.
- Both race one 120 s clock (after a 3-2-1 countdown) to rescue the most survivors. A rescued survivor is immediately replaced by the next one.
- Most rescues wins; equal counts go to whoever got there first; otherwise it's a tie.
- A wipeout (hull at 0) sends the ski back to the start.
- The host laptop shows both oceans and the score. Phones show their station plus a live score strip.

## C. Your role

You make the competition **feel** competitive:
- the split-screen spectator display;
- the Blue-vs-Red scoreboard;
- the countdown and the final-10-seconds drama;
- rescue animations and feedback;
- lead changes;
- the winner/results presentation on the big screen and on phones;
- team tinting of the existing ocean visuals.

## D. Git: exact start

```bash
git clone https://github.com/mylesbrandon/stormline.git stormline-versus-spectator
cd stormline-versus-spectator
git fetch origin --tags
git switch --track origin/feat/versus-spectator
git merge-base --is-ancestor c5067ee3c5cbac710a06abf2c3c942e8d19ab8e0 HEAD && echo "baseline OK"
npm install
npm run check        # green at handoff (109 tests)
npm run dev          # then open http://localhost:3000/versus/preview?view=spectator
```

With an existing clone, use a worktree instead:
`git fetch origin --tags && git worktree add ../stormline-versus-spectator --track -b feat/versus-spectator origin/feat/versus-spectator`.
Never run two agents in the same directory. Never commit to `main`.

## E. Files you own

- `src/components/ocean/versus/VersusSpectatorDisplay.tsx` (placeholder exists; replace its insides)
- `src/components/ocean/versus/MatchScoreStrip.tsx` (placeholder exists)
- `src/components/ocean/versus/VersusResults.tsx` (placeholder exists)
- Any new files in `src/components/ocean/versus/**`, e.g. `RescueBurst.tsx`, `use-rescue-feed.ts`, `sound.ts`, `*.test.ts` for pure helpers
- `src/components/ocean/{draw.ts,palette.ts,OceanCanvas.tsx}`: **additive** options only (for example an optional `boatTint` on `OceanScene`). Co-op rendering must look the same when the option is absent.
- `src/components/captain/**`: optional versus polish. `CaptainStation`'s props (`{ view: CaptainView; onAction }`) are frozen.
- `src/app/globals.css`: additive only (new keyframes and classes; don't change existing tokens)

## F. Files you must NOT edit

- `src/game/**` (engine and contracts)
- `src/lib/**`, `src/app/**` except additive `globals.css` (routes belong to Developer 2, including `/versus/preview` and the host and phone screens that place your components)
- `src/components/shared/**` (Dev 2)
- `src/components/roles/**` (Developer 4)
- `src/components/ocean/SpectatorDisplay.tsx` (the co-op spectator)
- `package.json`

If you need a new prop, data field or route change, **ask Developer 2** with the exact diff.

## G. Shared types you must use (`@/game/versus/contract`)

```ts
type TeamId = "blue" | "red";  const TEAMS;  const VERSUS = { matchDurationMs: 120_000, countdownMs: 3_000, finalCountdownMs: 10_000, recentRescuesKept: 8 };
type MatchPhase = "briefing" | "countdown" | "active" | "ended";
interface TeamScore { team; rescues; wipeouts; hull /* 0..100 */; lastRescueAtMs: number | null }
interface MatchResult { winner: TeamId | null /* null = tie */; scores: Record<TeamId, TeamScore>; endedAtMs }
interface MatchScoreboard { matchId; phase; countdownRemainingMs; elapsedMs; durationMs; scores: Record<TeamId, TeamScore>; leader: TeamId | null; result: MatchResult | null }
interface RescueEvent { team; survivorIndex /* 0-based */; position: Vec2 /* normalized map */; atMs }
interface SpectatorMatchView { role: "spectator"; matchId; tick; scoreboard; teams: Record<TeamId, SpectatorView>; recentRescues: RescueEvent[] /* newest last */ }
function decideWinner(scores): TeamId | null   // the frozen winner rule, if you need to explain a tiebreak
```

`SpectatorView` (from `@/game/types`) is the co-op spectator view of one team's world: `boat`, revealed `hazards`, `markers`, `weather`, `mission`, and `target`, which is `null` until the match ends. **Never try to show where the live survivor is.** The teams can see the projector, so that would hand them the answer. In versus, ignore `mission.phase`, `failureReason` and `score` on the team worlds (each world "times out" in co-op terms). Use `scoreboard` and `result`.

Frozen props you implement:

```ts
VersusSpectatorDisplay({ view: SpectatorMatchView })
MatchScoreStrip({ scoreboard: MatchScoreboard; team?: TeamId })           // team = the viewer's team on a phone
VersusResults({ result: MatchResult; team?: TeamId; footer?: React.ReactNode })
```

Helpers you can use:
- `TEAM_INFO[team]` (`label`, `text`, `bg`, `border`, `hex`) from `@/components/shared/teams`;
- the Tailwind tokens `text-team-blue` / `text-team-red` / `bg-team-blue/20`…;
- `formatClock(ms)` from `@/components/shared/MissionClock`;
- `OceanCanvas` (`gameId`, `boat`, `hazards`, `markers`, `target`, `current`, `stormIntensity`, `window?`).

## H. What to implement

1. **`VersusSpectatorDisplay`** (host laptop and projector; design at 1280×720 and 1920×1080, still usable stacked at 375 px):
   - two oceans side by side on wide screens (stacked on narrow), each framed in its team colour and labelled "Blue Tower" / "Red Tower", with hull and wipeout count;
   - a central **scoreboard** with huge rescue counts (readable from 10 m), the match clock, and the leader highlighted ("BLUE LEADS", or "TIED");
   - **countdown:** a full-screen 3-2-1 from `countdownRemainingMs`, then "GO!" for about 1 s at the start of `"active"` (`elapsedMs < 1000`);
   - **final countdown:** when `durationMs - elapsedMs <= VERSUS.finalCountdownMs`, a pulsing red clock and an urgent frame;
   - **rescue feedback:** when a new `RescueEvent` appears in `recentRescues` (keep a `Set` of `${matchId}:${team}:${survivorIndex}` in a ref; reset it when `matchId` changes):
     - a burst/ring animation at `position` on that team's map, as an absolutely positioned overlay at `left: x*100%`, `top: y*100%` of the square canvas;
     - a "+1" flying to that team's score;
     - the score digit pops;
   - **lead change:** a banner ("RED TAKES THE LEAD!") for about 2 s whenever `scoreboard.leader` changes to a non-null team during `"active"`;
   - **results:** when `scoreboard.result` is set, overlay `<VersusResults result={...} />` across both maps. Survivors may now be shown, because `target` is non-null at the end.
   - **Boat tint:** add an optional `boatTint?: string` to `OceanScene` in `draw.ts` (and pass it through `OceanCanvas`), so each team's ski is drawn in `TEAM_INFO[team].hex`. When it's absent, co-op drawing must be pixel-identical.
2. **`MatchScoreStrip`** (phones, above every station; at most ~56 px tall, fits 375 px):
   - BLUE n · clock · n RED, with the viewer's team marked "YOU" and the leader glowing;
   - when the viewer's team's count goes up: a short flash and `navigator.vibrate?.(80)` (feature-detected, inside an effect);
   - countdown: a large fixed overlay 3-2-1-GO on the phone;
   - final 10 s: red pulsing clock.
3. **`VersusResults`** (phones and host):
   - big headline in the winner's team colour: "BLUE TOWER WINS" on the host; "YOU WON!" / "YOU LOST" on phones (`team` set); "TIE!" when `winner === null`;
   - both counts and wipeouts;
   - when counts are equal and `winner !== null`, the tiebreak line "<Team> got there first";
   - render `footer`.
4. **Sound (optional, host only, no assets):** a tiny Web Audio helper (`sound.ts`) for rescue, lead change, final-second ticks and the end horn. Off by default, with a "Sound on" toggle inside `VersusSpectatorDisplay` (browsers block autoplay).
5. **Rules for all of the above:**
   - honour `prefers-reduced-motion` (fade instead of fly or pulse);
   - keep animation timing in effects, refs or CSS. Don't call `Date.now()` / `performance.now()` during render. Game time always comes from the view;
   - keep it legible on the real projector colours.

## I. Mocks while others work

Develop entirely against **`/versus/preview`**. It renders your components from `src/game/versus/mock.ts`, which is scripted (not synced):

| Preview | What it shows |
|---|---|
| `?view=spectator` | `VersusSpectatorDisplay` with `mockSpectatorMatchViewAt(t)` |
| `?view=captain&team=red` / `?view=navigator` | `MatchScoreStrip` above the stations |
| `?view=results&team=blue` | `VersusResults` |

Use the **Jump** buttons (Countdown / Start / Final 10 s / Results) to reach each moment.

The scripted match:
- has lead changes, a tie, a wipeout, and red stealing the win at 115 s;
- has rescues listed in `recentRescues`;
- `MOCK_RESULT_RED_WINS` and `MOCK_RESULT_TIE` are fixed results.

You may **add** fixtures to `mock.ts` (additive only), for example a tie-break result.

The real data arrives through the same props once Developer 2's host session lands.

## J. Steps

1. Run `npm run check`, then `npm run dev` and open the three previews above. Read the placeholders, `OceanCanvas.tsx`, `draw.ts`, `SpectatorDisplay.tsx` (co-op style reference) and `src/game/versus/mock.ts`.
2. Build `MatchScoreStrip` (small, used everywhere), then `VersusResults`, then `VersusSpectatorDisplay`, then the boat tint, then the rescue and lead-change animations, then sound.
3. Unit-test any pure helper you write, e.g. "new rescues since last render" and "lead change detection", in `src/components/ocean/versus/*.test.ts` with `node:test`.
4. Check at 375×812, 1280×720 and 1920×1080 using the preview Jump buttons. Make sure there's no horizontal scroll on phones and no console errors.
5. Run `npm run check`. Commit in small pieces. Push and open the PR (O).

## K. Acceptance criteria

- From 5–10 m away, an observer can tell the score, the leader, the time left, and which map is which team.
- Every rescue in the mock produces a visible burst on the right map and a "+1"; lead changes show a banner; the final 10 s are visibly urgent; 3-2-1-GO shows on both the host and phones.
- The results screen clearly names the winner (or a tie) and explains a tiebreak.
- Co-op screens (`/host/<CODE>`, `/room/DEMO?preview=captain|spectator`) look exactly as before.
- No forbidden imports, no new dependencies, and `npm run check` is green.

## L. Tests and verification

```bash
npm test
npm run check
npm run dev   # /versus/preview?view=spectator | results | captain | navigator, with every Jump button, at 375 px and 1280 px
grep -rnE "@/game/engine|@/lib/(realtime|game-client)" src/components/ocean src/components/captain || echo "imports clean"
```

## M. Definition of done

- All three components are implemented with the behaviour above, verified in the preview at the three viewport sizes.
- Pure helpers are tested, and `npm run check` is green.
- PR open against `feat/versus`, with a screenshot or short GIF of the spectator screen at the final countdown and at the results.

## N. Report back to Developer 2 (integration lead)

Send:
- the PR URL and last SHA;
- the `npm run check` summary;
- screenshots (spectator active, final 10 s, results; phone strip at 375 px);
- whether sound was added and how to enable it;
- any props or data you wish you had, as an exact contract diff (don't apply it).

## O. Commit and PR

```bash
git add src/components/ocean src/components/captain src/app/globals.css src/game/versus/mock.ts
git commit -m "ui: versus spectator split screen, score strip and results"
git push -u origin feat/versus-spectator
gh pr create --base feat/versus --head feat/versus-spectator \
  --title "ui: versus spectator, scoreboard, countdown and results" \
  --body "Replaces the Dev 3 placeholders (props unchanged, contract versus-1). Verified in /versus/preview at 375/1280/1920. npm run check: <paste summary>."
```

Without `gh`: push and use `https://github.com/mylesbrandon/stormline/compare/feat/versus...feat/versus-spectator`.
Never force-push, never `reset --hard`, never delete branches.

## P. Blockers

If you need data the views don't carry, or a change in someone else's file, **stop and explain** it to Developer 2: what, why, and the smallest diff. Don't edit shared contracts, routes or other developers' components yourself.

## Q. Implement and verify

Actually build the components, look at them in the browser at the stated sizes, run the checks, and report real results. Don't claim something works, or that a check passed, unless you saw it.
