# MVP scope

Deadline: ~24 hours. If something isn't on the **Required** list, it waits until every required item works end-to-end on the deployed URL.

## Required (the demo fails without these)

| # | Feature | Owner |
|---|---|---|
| R1 | Host creates a room; QR + code shown on laptop | Dev 2 |
| R2 | Four phones join by code/QR and get distinct roles automatically | Dev 2 |
| R3 | Host starts a 90 s mission; synchronized countdown on every screen | Dev 2 + Dev 1 |
| R4 | Captain steers + throttles; boat moves on every screen | Dev 1 (physics), Dev 3 (helm + canvas) |
| R5 | Hidden reefs damage the hull on collision | Dev 1 |
| R6 | Sonar ping reveals nearby reefs on the sonar screen; sonar can mark hazards that appear for the Captain | Dev 1 (rules), Dev 4 (UI) |
| R7 | Radio scans sectors and sees signal strength pointing to the hidden *Gull* | Dev 1 (rules), Dev 4 (UI) |
| R8 | Weather sees current + forecast; shield dampens current for a few seconds | Dev 1 (rules), Dev 4 (UI) |
| R9 | Win: reach the *Gull*. Lose: time out or hull 0. Same result on all screens | Dev 1 + Dev 2 |
| R10 | Results screen: time left, hull, hazards hit, score | Dev 3 (spectator), Dev 4 or Dev 3 (phones) |
| R11 | Attractive spectator view on the laptop | Dev 3 |
| R12 | Deployed on Vercel; works on phones over cellular/venue Wi-Fi | Dev 2 |
| R13 | Mock/preview mode works without Supabase (fallback demo) | done in scaffold; keep it working |

## Optional (in rough priority order)

1. Client-side interpolation polish and screen shake on hits.
2. Sound: sonar ping, radio static, hull hit, victory horn (respect a mute toggle).
3. Seeded procedural layouts (different map every mission).
4. Host can drag-assign roles in the lobby.
5. Difficulty levels (more reefs, stronger current, shorter timer).
6. Rejoin banner ("Reconnecting…") and haptics (`navigator.vibrate`).
7. Results share card / leaderboard per room (in memory).
8. Host `GameState` snapshot to `sessionStorage` to survive a host reload.
9. Per-player messages so role views aren't visible in devtools.

## Out of scope (do not build)

- Accounts, login, user profiles, persistence in a database.
- A separate game server, Python, Unity/Unreal.
- AI/LLM features inside the game.
- Competitive modes, matchmaking, public lobbies.
- More than four player roles or more than one boat.
- Native mobile apps.
- Heavy state libraries (Redux, Zustand, XState) — `Store` + `useSyncExternalStore` is enough.
