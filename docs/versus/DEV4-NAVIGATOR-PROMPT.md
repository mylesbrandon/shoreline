# Developer 4: Navigator interface & gameplay UX (Stormline: Rescue Showdown, contract versus-1)

Copy everything below into your Claude Code or Codex session.

---

You are the coding agent for **Developer 4 (Navigator interface and gameplay UX)** on Stormline, our HowdyHack 2026 entry. Software is due **Sunday Oct 25, 2026, 12:00 Central**. Your job is to **implement and verify** the Navigator screen in real components. Don't stop at a plan. Make ordinary design and implementation choices yourself without asking.

## A. Project context

Stormline is a phone party game: ocean rescue on a sunny "Red Flag Day" beach (jet ski, sandbars, rocks, jellyfish, a tourist on a giant seagull float). It's built with Next.js 16, React 19, TypeScript strict (`noUncheckedIndexedAccess`), Tailwind v4 with theme tokens in `src/app/globals.css` (`bg-abyss`, `text-teal`, `text-amber`, `text-cyan`, `border-hull`, `text-hazard`…), and tests with `node:test` via `tsx`.

- **Host-authoritative:** phones never run game rules.
- **Station components are props in, actions out** (`{ view, onAction }`). They never import `@/game/engine`, `@/lib/realtime` or `@/lib/game-client`.
- No new dependencies. Mobile-first: touch targets ≥ 44 px, design for 375 px wide.
- Read `AGENTS.md` and `docs/versus/CONTRACTS.md` first.

The four-player co-op game is on `main` (tag `coop-v1`). Its stations are:
- **Drone** = `SonarStation`: sweep with `SONAR_PING`, tap the scope to `MARK_HAZARD`;
- **Tower Radio** = `RadioStation`: tap a 4×4 sector to `RADIO_SCAN`, pin mode places `MARK_TARGET`;
- Surf Watch = `WeatherStation`.

They must keep working unchanged for co-op.

## B. The new 2v2 game

**Stormline: Rescue Showdown.** *Two crews. One storm. Save the most lives.*

- Four phones, two teams:
  - **Blue:** Driver (Captain) + **Navigator**
  - **Red:** the same two seats
- Each team drives its own jet ski in its own copy of the same seeded ocean. Both race a 120 s clock (after a 3-2-1 countdown) to rescue the most survivors. A rescued survivor is immediately replaced by the next one somewhere else.
- **The Driver is nearly blind:** a small glare window around the ski (0.24 of the map wide), no survivor, no distant hazards. They depend completely on the Navigator's callouts.
- **The Navigator can't steer.** They combine the old Drone and Tower Radio jobs:
  - **Sweep** reveals hazards within range of the boat for about 5 s on the Driver's screen. It also catches the survivor as a `"gull"` contact when within range;
  - **Mark** places hazard marks everyone on the team sees;
  - **Scan** a sector gives signal strength toward the survivor;
  - **Pin** marks "we think they're here" on the Driver's screen.
- Most rescues wins. The opposing team can be heard across the room, so speed and clear callouts matter.

## C. Your role

You build the **Navigator screen**: one engaging but understandable role on a phone that always has a meaningful next action. You also turn data into callouts the Navigator can shout ("Survivor at 2 o'clock, close!"). Reuse the existing sonar and radio pieces wherever possible.

## D. Git: exact start

```bash
git clone https://github.com/mylesbrandon/stormline.git stormline-versus-navigator
cd stormline-versus-navigator
git fetch origin --tags
git switch --track origin/feat/versus-navigator
git merge-base --is-ancestor c5067ee3c5cbac710a06abf2c3c942e8d19ab8e0 HEAD && echo "baseline OK"
npm install
npm run check        # green at handoff (109 tests)
npm run dev          # then open http://localhost:3000/versus/preview?view=navigator
```

With an existing clone, use a worktree instead:
`git fetch origin --tags && git worktree add ../stormline-versus-navigator --track -b feat/versus-navigator origin/feat/versus-navigator`.
Never run two agents in the same directory. Never commit to `main`.

## E. Files you own

- `src/components/roles/navigator/**`: `NavigatorStation.tsx` (placeholder exists; replace its insides) plus any new files, e.g. `NavigatorTabs.tsx`, `callouts.ts`, `callouts.test.ts`
- `src/components/roles/sonar/**`, `src/components/roles/radio/**`, `src/components/roles/instruments/**`: you may extract reusable pieces (e.g. a `RadioGrid` out of `RadioStation`), but co-op `SonarStation` / `RadioStation` must keep the **same props and behaviour**

## F. Files you must NOT edit

- `src/game/**` (engine and contracts; the engine decides what a sweep or scan reveals)
- `src/lib/**`, `src/app/**` (Developer 2; that includes `/versus/preview` and the phone screen that places your component)
- `src/components/shared/**` (Dev 2), `src/components/ocean/**` and `src/components/captain/**` (Developer 3)
- `src/components/roles/weather/**` (co-op only)
- `package.json`

`src/app/globals.css` and `src/game/versus/mock.ts` are additive only: you may add a class, keyframes or a fixture.

If you need a new prop, data field or action, **ask Developer 2** with the exact diff.

## G. Shared types you must use

```ts
// @/game/versus/contract
interface VersusNavigatorView { role: "navigator"; team: TeamId; matchId: string; tick: number; sonar: SonarView; radio: RadioView }
interface NavigatorStationProps { view: VersusNavigatorView; onAction: (action: PlayerAction) => void }   // FROZEN (exported from NavigatorStation.tsx)
const VERSUS_ACTION_PERMISSIONS.navigator = ["SONAR_PING", "MARK_HAZARD", "RADIO_SCAN", "MARK_TARGET"];
// @/game/types (co-op, unchanged)
SonarView { boat, mission, markers, contacts: SonarContact[] /* kind may be "gull" */, lastPingAtMs, lastPingOrigin, pingReadyAtMs }
RadioView { boat, mission, markers, readings: SignalReading[], lastScanAtMs, scanReadyAtMs, distressLog: string[] }
PlayerAction: { type: "SONAR_PING" } | { type: "MARK_HAZARD"; position: Vec2 } | { type: "RADIO_SCAN"; sector: SectorId } | { type: "MARK_TARGET"; position: Vec2 }
// @/game/config: SONAR.pingCooldownMs (3000), SONAR.pingRange (0.3), RADIO.scanCooldownMs (3500)
// @/game/sectors: ALL_SECTORS, sectorCenter, sectorOf      // GULL_CONTACT_ID = "gull" in @/game/types
```

- Units: normalized map `[0,1]²` with +y south; heading in radians, 0 = north, clockwise; mission-time ms.
- `view.sonar.mission.elapsedMs` is "now" for every cooldown. Use mission time, never `Date.now()`.
- In versus, use `mission.phase === "active"` only to enable buttons. The score and results are shown above your station by Dev 3's `MatchScoreStrip`.

Existing pieces to reuse:
- `SonarScope({ view: SonarView, onMark(position), disabled })`, the boat-centred drone well (`roles/sonar/SonarScope.tsx`);
- `CooldownButton({ label, nowMs, readyAtMs, cooldownMs, onPress, disabled, tone, size: "md" | "xl", urgent })`;
- `StationPanel`, `Readout` / `ReadoutRow`, `SignalBars` (`roles/instruments`);
- the 4×4 sector grid, scan/pin modes, reading fade and pin ghost inside `RadioStation.tsx`.

## H. What to implement

Replace the placeholder (currently `SonarStation` and `RadioStation` stacked, which is too long for one phone screen) with a single Navigator screen:

1. **Layout at 375×812**, with no page scroll needed during play:
   - a **segmented toggle** "DRONE | RADIO" switching the main panel between the sonar scope (tap to mark a hazard) and the radio grid (tap to scan; pin mode drops `MARK_TARGET` at `sectorCenter`);
   - a **persistent action bar** at the bottom, always visible:
     - a **SWEEP** `CooldownButton` (`SONAR_PING`, `pingReadyAtMs`, `SONAR.pingCooldownMs`);
     - a **SCAN** button with its own cooldown fill (`scanReadyAtMs`, `RADIO.scanCooldownMs`). Pressing it rescans the sector the boat is in now (`sectorOf(view.radio.boat.position)`), and the radio grid stays available for scanning any other square;
   - both cooldowns run independently, so the Navigator alternates and is never idle. Keep the toggle state local (`useState`), default DRONE.
2. **Callout line** (the heart of the role). Make it a pure helper in `navigator/callouts.ts`, unit-tested, and render it big at the top:
   - if a fresh `"gull"` contact exists (`elapsedMs - detectedAtMs < ~6000`), compute bearing and distance from `view.sonar.boat` **relative to the boat's heading**, as a clock position and distance band: "SURVIVOR 2 O'CLOCK · CLOSE" (close < 0.1, near < 0.2, else far);
   - else, if a fresh radio reading is strong (≥ 0.6), give the direction from the boat to that sector's centre relative to heading: "SIGNAL 11 O'CLOCK";
   - else, if a fresh hazard contact is ahead within 0.12 and within ±45° of heading: "SANDBAR AHEAD · TURN";
   - else a prompt: "SWEEP OR SCAN TO FIND THEM".
   This is display math on data already in the view; it adds no game rule and doesn't leak anything (the view already holds it).
3. **Hazard marking:** keep tap-to-mark on the scope, with clear feedback (a ripple, and a "Marked for your Driver" toast for 1 s).
4. **Feedback:**
   - a sweep sends `navigator.vibrate?.(30)` (feature-detected, in the handler);
   - contacts fade with age (the scope already does);
   - the hot radio tile pulses;
   - show "Survivor found!" emphasis when a gull contact appears;
   - honour `prefers-reduced-motion`.
5. **Readability:** callout text ≥ 28 px, buttons ≥ 56 px tall, high contrast, team accent from `view.team` (`TEAM_INFO[view.team]` in `@/components/shared/teams`, or `text-team-blue` / `text-team-red`).
6. **Co-op safety:** if you extract pieces out of `RadioStation` / `SonarStation`, the co-op `/room/DEMO?preview=sonar` and `?preview=radio` must look and behave the same.

## I. Mocks while others work

Develop against **`/versus/preview?view=navigator&team=blue`** (and `&team=red`). It renders `VersusRoleStation`, then your `NavigatorStation`, with `mockVersusViewsAt(t)` from `src/game/versus/mock.ts`.

- The scripted boat moves, the mock sonar view includes hazard contacts and one `"gull"` contact, and the radio view has three readings and a pin.
- The emitted actions are logged on screen ("not sent anywhere"), so you can verify every tap emits the right typed action.
- You may **add** fixtures to `mock.ts` (additive), e.g. a view with a gull contact dead ahead, for testing callouts.
- Real data arrives through the same props once Developer 2's host session lands. Then test with a real Driver.

## J. Steps

1. Run `npm run check`, then `npm run dev`, and open the navigator preview plus the co-op `/room/DEMO?preview=sonar` and `?preview=radio`. Read `NavigatorStation.tsx`, `SonarStation.tsx`, `SonarScope.tsx`, `RadioStation.tsx`, `instruments/*`, `src/game/versus/contract.ts`, and `scope-coords.ts` (its tests show the coordinate conventions).
2. Write `callouts.ts` + `callouts.test.ts` first. Cases:
   - straight ahead = 12 o'clock;
   - due east with heading north = 3 o'clock;
   - behind = 6;
   - heading wraparound;
   - distance bands;
   - stale contacts ignored;
   - the gull beats radio, and radio beats the hazard warning.
3. Extract the radio grid if needed (co-op unchanged). Build the tabbed `NavigatorStation` with the persistent action bar and callout line.
4. Verify at 375×812 (no scroll during play) and at 768 px. Every tap in the preview log should emit exactly the expected action. Check that co-op previews are unchanged and there are no console errors.
5. Run `npm run check`. Commit in small pieces. Push and open the PR (O).

## K. Acceptance criteria

- On a 375 px phone, the Navigator can sweep, scan, mark and pin without scrolling. Both cooldowns are always visible.
- The callout line gives a correct clock bearing and distance for gull contacts and strong readings (unit-tested).
- Every interaction emits only `SONAR_PING`, `MARK_HAZARD`, `RADIO_SCAN` or `MARK_TARGET`, with valid payloads (sector ids from `ALL_SECTORS`, positions in `[0,1]`).
- Co-op Sonar and Radio stations are unchanged. No forbidden imports or new dependencies. `npm run check` is green.

## L. Tests and verification

```bash
npm test
npm run check
npm run dev   # /versus/preview?view=navigator&team=blue|red at 375×812; /room/DEMO?preview=sonar|radio unchanged
grep -rnE "@/game/engine|@/lib/(realtime|game-client)" src/components/roles || echo "imports clean"
```

## M. Definition of done

- `NavigatorStation` is implemented (tabs, persistent cooldown bar, callout line, marking and feedback) and verified in the preview at 375 px.
- `callouts.test.ts` passes, `npm run check` is green, co-op stations are unchanged.
- PR open against `feat/versus` with a 375 px screenshot of both tabs.

## N. Report back to Developer 2 (integration lead)

Send:
- the PR URL and last SHA;
- the `npm run check` summary;
- screenshots of both tabs;
- the callout rules and thresholds you chose;
- what you'd like playtested (e.g. "is DRONE the right default?");
- any data you wish the view carried, as an exact contract diff (don't apply it).

## O. Commit and PR

```bash
git add src/components/roles src/game/versus/mock.ts src/app/globals.css
git commit -m "ui: versus Navigator station with callouts"
git push -u origin feat/versus-navigator
gh pr create --base feat/versus --head feat/versus-navigator \
  --title "ui: versus Navigator (drone + radio, callouts)" \
  --body "Replaces the NavigatorStation placeholder (props unchanged, contract versus-1). Verified in /versus/preview at 375 px; co-op stations unchanged. npm run check: <paste summary>."
```

Without `gh`: push and use `https://github.com/mylesbrandon/stormline/compare/feat/versus...feat/versus-navigator`.
Never force-push, never `reset --hard`, never delete branches.

## P. Blockers

If the Navigator needs data the view doesn't carry, or a change in someone else's file, **stop and explain** it to Developer 2: what, why, and the smallest diff. Don't edit shared contracts, the engine, routes or other developers' components yourself.

## Q. Implement and verify

Actually build the screen, use it in the browser at 375 px, run the tests and checks, and report real results. Don't claim something works, or that a check passed, unless you saw it.
