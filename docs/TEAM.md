# Team

## Who owns what

| Dev | Area | Owns (may edit freely) | Branch |
|---|---|---|---|
| **1 — Engine** | Game simulation and rules | `src/game/engine/**` | `feat/engine` |
| **2 — Realtime / Integration** | Rooms, sync, sessions, routes, deploy, merging | `src/lib/realtime/**`, `src/lib/game-client/**`, `src/app/**`, `src/components/shared/**`, root config (`package.json`, `next.config.ts`, `eslint.config.mjs`, `tsconfig.json`, `.env.example`), `docs/DEPLOY.md` | `feat/realtime` |
| **3 — Ocean / Captain UI** | Rendering, captain station, spectator visuals | `src/components/ocean/**`, `src/components/captain/**` | `feat/captain-ui` |
| **4 — Specialist roles** | Sonar, weather, radio stations | `src/components/roles/**` | `feat/specialist-ui` |

**Shared contracts** — change only with agreement from all four (see [CONTRACTS.md](CONTRACTS.md)):
`src/game/types.ts`, `src/game/config.ts` (semantics), `src/game/sectors.ts`.

**Shared but additive** — anyone may *add* to these; don't change existing entries without telling the team:
`src/game/mock-state.ts` (mock fixtures), `src/app/globals.css` (add tokens/classes; Dev 2 merges), `docs/TASKS.md` (update your own section).

**Dependencies**: only Dev 2 edits `package.json`. Need a package? Ask in chat; Dev 2 adds it on `main` so everyone pulls the same lockfile.

## What each dev does NOT do

- Dev 1 doesn't touch React, Supabase, or routes.
- Dev 2 doesn't write game rules or station UIs — and **isn't responsible for finishing anyone else's work**. Dev 2 wires finished components into routes.
- Dev 3 doesn't write networking or rules; components take props and emit `onAction`.
- Dev 4 same as Dev 3, for the specialist stations.

If you need something from another module, **ask the owner** (or open an issue). If they're blocked or asleep and it's tiny, make the change in your PR and tag them for review — never silently.

## Branching

```
main  ← always builds, always deployable (Vercel production)
 ├─ feat/engine          (Dev 1)
 ├─ feat/realtime        (Dev 2)
 ├─ feat/captain-ui      (Dev 3)
 └─ feat/specialist-ui   (Dev 4)
```

Short-lived extra branches are fine (`feat/engine-collisions`). One branch per dev per task is the norm.

## Integration workflow

1. **Pull often**: `git fetch origin && git merge origin/main` (or `git rebase origin/main` on your own branch only) at least every couple of hours.
2. **Before pushing**: `npm run check` (typecheck + lint + test + build). Don't open a PR that fails it.
3. **Small PRs**: target < 300 lines, one concern. Title format: `engine: boat movement`, `ui: sonar scope`, `contract: add MARK_TARGET`.
4. **Review**: Dev 2 merges to `main`. Any teammate can approve. Contract PRs need all four 👍.
5. **Vercel preview**: every PR gets a preview URL — test on a phone before merging when UI changed.
6. **After merge**: everyone pulls `main`.

Merge cadence target: each dev lands something on `main` every 3–4 hours. Integration happens continuously, not at hour 22.

## Git safety

- No `git push --force` to `main`. Avoid force-pushing at all; if you must on your own branch, use `--force-with-lease`.
- No `git reset --hard`, `git clean -fd`, or branch deletion on shared branches without asking.
- Never commit `.env.local` or keys. `.gitignore` already covers it.
- Resolve conflicts in your own branch; if a conflict is in someone else's module, ask them.

## Communication

- One team chat channel. Post when you start a task, open a PR, or change a contract.
- Hourly 2-line standup in chat: *done / next / blocked*.
- Hard sync points: **H+6** (single-device boat moves via engine on host), **H+12** (four phones in a room, live), **H+18** (feature freeze, demo rehearsal), **H+22** (code freeze, Devpost).
