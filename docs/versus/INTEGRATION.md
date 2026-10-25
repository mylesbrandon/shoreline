# Rescue Showdown — integration plan

**Integration lead:** Developer 2. Every developer verifies their own PR (`npm run check` + the checks in their prompt) before asking for a merge.

**Baseline:** `feat/versus` @ `c5067ee3c5cbac710a06abf2c3c942e8d19ab8e0` (foundation code). **Handoff tag:** `versus-handoff-1` (foundation + these docs). **Contract:** `versus-1`. **Fallback:** `main` = `coop-v1` (`0da07f9`).

## 1. Start (every developer)

```bash
git clone https://github.com/mylesbrandon/shoreline.git shoreline-<you>   # or: git -C <existing clone> fetch origin --tags
cd shoreline-<you>
git fetch origin --tags
git switch --track origin/feat/versus-<area>      # engine | network | spectator | navigator
git merge-base --is-ancestor c5067ee3c5cbac710a06abf2c3c942e8d19ab8e0 HEAD && echo "baseline OK"
npm install
cp ../shoreline/.env.local .env.local              # optional: live Supabase (mock mode works without it)
npm run check
```

Already have a clone with work in it? Use a worktree instead of switching branches:

```bash
git fetch origin --tags
git worktree add ../shoreline-versus-<area> --track -b feat/versus-<area> origin/feat/versus-<area>
cd ../shoreline-versus-<area> && npm install
```

## 2. Merge order (all into `feat/versus`)

| # | PR | Why this order | After merging, Dev 2 runs |
|---|---|---|---|
| 1 | **Dev 2 `network`**: `VersusHostSession`, `VersusPlayerSession`, `/versus/host`, `/versus/room`, landing entry | Critical path: needed for anything multi-device | `npm run check`; 2 browser tabs in mock-transport tests; **4-phone smoke on Supabase** (TEST-PLAN §3, steps 1–8) |
| 2 | **Dev 1 `engine`**: survivor respawn + wipeout | Pure engine, no conflicts with #1; can merge before #1 if ready | `npm run check`; 4-phone smoke: two rescues per team in one match |
| 3 | **Dev 4 `navigator`**: Navigator screen | Only touches `roles/**` | `npm run check`; `/versus/preview?view=navigator` at 375 px; 4-phone match |
| 4 | **Dev 3 `spectator`**: spectator, score strip, results | Only touches `ocean/**`, `captain/**` | `npm run check`; `/versus/preview?view=spectator` on the laptop; 4-phone match |
| n | Contract changes (if any) | Dev 2 lands them first as `contract: …`, everyone merges `origin/feat/versus` | `npm run check` |

PRs #3 and #4 can merge in either order. Each developer merges `origin/feat/versus` into their branch after every merge (`git fetch origin && git merge origin/feat/versus`); never rebase a pushed shared branch.

**Merge rules:** keep PRs small (< 400 lines if possible). `npm run check` must be green in the PR. Never force-push. Keep the co-op routes working (`/host/<CODE>` + 4 × `/room/<CODE>` still play a co-op mission). Dev 2 merges with a merge commit (`gh pr merge <n> --merge`).

## 3. Critical path and fallbacks while waiting

| If this is late | Everyone else uses | Effect |
|---|---|---|
| Dev 2 sessions | `/versus/preview` (mock) and engine unit tests | can't test on phones; still the #1 priority |
| Dev 1 respawn | baseline adapter (1 rescue per team, then that boat freezes) | match still runs to 0:00, so go/no-go can pass |
| Dev 4 Navigator | placeholder (Sonar + Radio stacked) | playable, but less fun |
| Dev 3 spectator | placeholder (two maps + numbers) | playable, but little drama |

## 4. Go/no-go milestone (target 00:00 Sunday CT, ~3 h after handoff)

On **four real phones over Supabase** plus the host laptop, using `feat/versus` with at least PR #1 merged:

1. Four phones join one `/versus/room/<CODE>` (QR from `/versus/host/<CODE>`).
2. Blue has Driver + Navigator; Red has Driver + Navigator (shown on the host lineup and each phone's seat card).
3. Both Drivers move their own boats independently: blue input never moves red.
4. Both teams start on the same map (same reefs and gusts, visibly on the spectator screen).
5. Each team rescues at least one survivor.
6. Both rescue counts update live on the spectator screen.
7. The clock runs out at 0:00.
8. The winner is declared correctly (or a tie), on the host and on all phones.
9. Reset → Start plays a second match without reloading anything.

**GO:** all 9 pass, and `npm run check` is green on `feat/versus`.
Then continue: merge #2–#4, playtest, tune.

**NO-GO, stay on co-op**, if any of these is true:
- the milestone isn't met by **01:00 Sun** (one hour of grace, and only if a single named bug is left);
- `npm run check` on `feat/versus` has been red for more than **1 hour**;
- it's 08:00 and a full 4-phone match still has a blocker (desync, stuck phone, wrong winner).

**NO-GO means:**
- demo co-op from `main` / Vercel production (= `coop-v1`);
- leave `feat/versus` unmerged, delete nothing;
- optionally keep polishing co-op on `main` through normal PRs.

## 5. Merging `feat/versus` into `main` (only after GO + TEST-PLAN)

Co-op routes are unchanged, so merging adds versus without removing co-op.

```bash
gh pr create --base main --head feat/versus --title "versus: Rescue Showdown 2v2" --body "Go/no-go passed; TEST-PLAN complete. Co-op routes unchanged."
```

Before merging, run TEST-PLAN §3 **and** one co-op mission on four phones against the PR's Vercel preview URL.

## 6. What each developer reports back to Dev 2

Branch, PR link, last commit SHA, the actual `npm run check` result, what works, what's stubbed (`TODO(devN)`), any contract change request (with the exact diff), and anything another developer must do.
