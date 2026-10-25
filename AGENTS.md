# AGENTS.md — rules for coding agents (Codex, Claude Code, Copilot, Cursor…)

Shoreline is a four-player cooperative ocean-rescue browser game built in ~24 hours for HowdyHack 2026 by four developers working in parallel. These rules are the same for every agent and every human. `CLAUDE.md` points here; if the two ever disagree, **this file wins** — fix the other one.

## Before you change anything

1. Read `docs/CONTRACTS.md` (types, units, protocol, ownership) and your developer's section of `docs/TASKS.md`.
2. Ask the human which developer you are working for if it isn't obvious from the branch name:
   `feat/engine` → Dev 1 · `feat/realtime` → Dev 2 · `feat/captain-ui` → Dev 3 · `feat/specialist-ui` → Dev 4.
3. Only edit files that developer owns (table below). If the task needs a change elsewhere, **stop and tell the human** what change is needed and who owns it.

## Ownership

| Path | Owner |
|---|---|
| `src/game/engine/**` | Dev 1 |
| `src/lib/realtime/**`, `src/lib/game-client/**`, `src/app/**`, `src/components/shared/**`, `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `.env.example`, `docs/DEPLOY.md` | Dev 2 |
| `src/components/ocean/**`, `src/components/captain/**` | Dev 3 |
| `src/components/roles/**` | Dev 4 |
| `src/game/types.ts`, `src/game/config.ts`, `src/game/sectors.ts` | **Shared contract — do not edit without explicit team approval** |
| `src/game/mock-state.ts`, `src/app/globals.css` | Shared, additive only (add, don't change existing entries) |

## Architecture rules (non-negotiable)

- **Host-authoritative.** One host browser runs the simulation (`HostSession` → engine). Phones send `PlayerAction`s and render `RoleViewState`s. Never run game rules on phones.
- **Engine is pure TypeScript.** `src/game/**` must not import React, Next, Supabase, the DOM, `src/lib/**` or `src/components/**`, and must not call `Date.now()`, `Math.random()`, or `performance.now()`. Use `createRng(seed)` for randomness and the `dtMs` argument for time. Never mutate input state.
- **Components are props-in, actions-out.** Stations take `{ view, onAction }`. Components never import `src/lib/realtime`, `src/lib/game-client`, or `src/game/engine`.
- **Only `src/lib/realtime/supabase-*.ts` imports `@supabase/supabase-js`.**
- **Hidden information** is filtered only in `src/game/engine/views.ts`. Never add the rescue target to any role view, with two approved exceptions: (1) a Sonar ping within `SONAR.pingRange` adds a `"gull"` contact (a position snapshot) to the **Sonar** view only — the Captain, Weather and Radio views never get it; (2) **in versus only**, `VersusCaptainView.survivor` carries the survivor's position while they are within `VERSUS.captainVisualRange` of that team's boat, and is `null` otherwise. Both are filtered in `views.ts` and nowhere else. The versus **big-screen spectator view** (the host laptop, not a seat) shows the live survivor during play via `getLiveSpectatorView` in `views.ts`; phones never get it beyond the two exceptions above.
- **Units:** normalized map `[0,1]²` (+y is south), radians with 0 = north clockwise, mission-time milliseconds. See `docs/CONTRACTS.md`.
- **Mock mode must stay honest.** Anything rendering mock data shows `<ModeBadge mode="mock" | "preview" />`. Never fake multi-device sync.
- No new dependencies without Dev 2's approval. Never add: Redux/Zustand/XState, a separate server, Python, auth, database tables, AI APIs.

## Workflow

- Work on your developer's feature branch. Never commit directly to `main`.
- Before finishing: run `npm run check` (typecheck + lint + test + build) and paste the result. Don't claim success without running it.
- Keep diffs small and focused. Prefer editing existing files over adding abstractions.
- Write or update tests for engine and protocol logic (`*.test.ts`, run with `npm test`, `node:test` + `node:assert/strict`).
- Never commit secrets or `.env.local`. Only `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (public by design) are used.
- **No destructive git**: no `push --force` to shared branches, no `reset --hard`, no `clean -fd`, no deleting branches, no rewriting `main` history.

## Commands

```bash
npm install
npm run dev          # http://localhost:3000 (mock mode without .env.local)
npm run check        # typecheck + lint + test + build
npm test             # unit tests only
```

Station sandboxes (mock data, no network): `/room/DEMO?preview=captain|sonar|weather|radio|spectator`.

## Style

- TypeScript strict (`noUncheckedIndexedAccess` on). No `any`; narrow unknown input with type guards.
- React function components, `"use client"` only where needed. No state reads from `localStorage`/`window` during render.
- Tailwind with theme tokens from `src/app/globals.css` (`bg-abyss`, `text-teal`, `border-hull`, `text-amber`, `text-hazard`…). Canvas colors from `src/components/ocean/palette.ts`.
- Mobile-first: big touch targets (≥ 44 px), test at 375 px wide.
- Comment the *why*, and mark unfinished work as `TODO(devN): …`.
