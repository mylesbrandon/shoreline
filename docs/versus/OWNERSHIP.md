# Rescue Showdown — file ownership (versus-1)

The rule hasn't changed: **only edit files your developer owns.** If you need a change somewhere else, tell its owner. Shared contract changes go through Dev 2 (see CONTRACTS.md). Each developer works in **their own clone or git worktree**; never run two agents in one working directory.

| Dev | Branch (from `versus-handoff-1`) | PR target |
|---|---|---|
| 1 — Engine & rescue logic | `feat/versus-engine` | `feat/versus` |
| 2 — Multiplayer & orchestration (**integration lead**) | `feat/versus-network` | `feat/versus` |
| 3 — Spectator, scoreboard, competitive UX | `feat/versus-spectator` | `feat/versus` |
| 4 — Navigator UI | `feat/versus-navigator` | `feat/versus` |

Nothing merges straight into `main`. `feat/versus` → `main` happens only after the go/no-go and the test plan pass (INTEGRATION.md).

## Matrix

| Path | Owner | Notes |
|---|---|---|
| `src/game/versus/contract.ts` | **Frozen** (changes via Dev 2) | the versus-1 contract |
| `src/game/versus/contract.test.ts` | **Frozen** (changes via Dev 2) | tests for the contract and the fixtures |
| `src/game/types.ts`, `src/game/config.ts`, `src/game/sectors.ts` | **Frozen** | co-op contract (+3 versus message variants) |
| `src/game/versus/mock.ts` | Shared, **additive only** | anyone may *add* fixtures; Dev 2 resolves conflicts |
| `src/game/mock-state.ts`, `src/app/globals.css` | Shared, **additive only** | as before |
| `src/game/engine/versus.ts`, `src/game/engine/versus.test.ts` | **Dev 1** | the `versusEngine` implementation |
| new `src/game/engine/survivors.ts` (or similar new engine files) | **Dev 1** | survivor sequence / spawn |
| `src/game/engine/index.ts` | **Dev 1** | add exports only |
| `src/game/engine/{state,step,actions,views,layout,score,rng}.ts`, `engine.test.ts` | **Dev 1, co-op frozen** | additive exports only; co-op behaviour and tests must not change |
| new `src/lib/game-client/versus-host-session.ts`, `versus-player-session.ts`, `versus-sessions.test.ts` | **Dev 2** | |
| `src/lib/game-client/index.ts`, `src/lib/realtime/protocol.ts`, `protocol.test.ts` | **Dev 2** | |
| `src/lib/game-client/{host-session,player-session,store,hooks}.ts`, `src/lib/realtime/*transport*` | **Dev 2, co-op frozen** | reuse; don't change co-op behaviour |
| `src/app/versus/**` (preview, new `host/[roomCode]`, new `room/[roomCode]`) | **Dev 2** | |
| `src/app/page.tsx`, `src/app/LandingActions.tsx` | **Dev 2** | add a "Host a showdown" entry; keep co-op |
| `src/app/host/**`, `src/app/room/**`, `src/app/debug/**` | **Dev 2, co-op frozen** | don't change |
| `src/components/shared/**` (`VersusRoleStation.tsx`, `teams.ts`, `JoinQr.tsx`, …) | **Dev 2** | `JoinQr` may gain an optional path prop |
| `docs/versus/**` | **Dev 2** | the integration lead keeps these current |
| `package.json`, `package-lock.json`, root configs | **Dev 2** | **no new dependencies** |
| `src/components/ocean/versus/**` (`VersusSpectatorDisplay`, `MatchScoreStrip`, `VersusResults`, new files) | **Dev 3** | |
| `src/components/ocean/{OceanCanvas,draw,palette,interpolation}.ts(x)` | **Dev 3** | additive options only; co-op rendering unchanged |
| `src/components/ocean/SpectatorDisplay.tsx` | **Dev 3, co-op frozen** | co-op spectator stays as is |
| `src/components/captain/**` | **Dev 3** | `CaptainStation` props are frozen (the versus Driver renders `view.captain`) |
| `src/components/roles/navigator/**` | **Dev 4** | `NavigatorStation` props are frozen |
| `src/components/roles/{sonar,radio,instruments}/**` | **Dev 4** | refactor for reuse is OK; co-op `SonarStation` / `RadioStation` props and behaviour unchanged |
| `src/components/roles/weather/**` | **Dev 4, co-op frozen** | not used in versus |

## Who imports whom (the seams)

```
Dev 2  VersusHostSession ──▶ versusEngine (Dev 1)                     [VersusEngine interface]
Dev 2  /versus/host       ──▶ VersusSpectatorDisplay, MatchScoreStrip, VersusResults (Dev 3)
Dev 2  /versus/room       ──▶ VersusRoleStation (Dev 2) ──▶ CaptainStation (Dev 3), NavigatorStation (Dev 4)
                          ──▶ MatchScoreStrip, VersusResults (Dev 3)
Dev 3/4 components        ──▶ only @/game/types, @/game/config, @/game/sectors, @/game/versus/contract,
                              @/game/versus/mock (previews), @/components/shared/*
```

Components never import `@/game/engine`, `@/lib/realtime` or `@/lib/game-client`.
