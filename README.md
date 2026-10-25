# Shoreline

The rip is pulling swimmers past the buoys. Two lifeguard crews of two race to bring them in. Each crew has a **Driver**, who steers a rescue jet ski but can only see a small circle around it, and a **Navigator**, who works a drone (sweeps that reveal sandbars, rocks and jellyfish, plus up to two hazard marks on the Driver's screen) and the beach radio (scans that say how warm each square is, and a pin for their best guess). Both crews race for the **same** swimmer on the **same** map. Whoever reaches them first scores, and the next swimmer appears for both. Most rescues in 120 seconds wins.

Built in ~24 hours for HowdyHack 2026 by four developers.

## How to play

1. Open the site on a laptop and press **Host a game**. The laptop is the big screen.
2. Four phones scan the QR code (or type the room code) and join. The laptop seats them: Blue Driver, Red Driver, Blue Navigator, Red Navigator.
3. Read your seat card, then the host presses **Blow the whistle**.
4. Navigators talk their Drivers through the reefs to the swimmer. Touch land and you go back to the dock; jellyfish sting your hull.

## Quick start

- **Play:** <https://stormline-kohl.vercel.app>. You need one laptop and four phones on any network.
- **Run locally:**

  ```bash
  npm install
  cp .env.example .env.local    # fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
  npm run dev:lan               # phones on the same Wi-Fi open http://<laptop-ip>:3000
  ```

  Without Supabase keys the app runs in a clearly labelled single-device mock mode. `/versus/preview` shows every screen with scripted data.
- **Check everything:** `npm run check` (typecheck + lint + tests + production build).

## How it works

```
 phones (4)                         host laptop                                  phones
 ─────────                          ───────────                                  ──────
 PlayerAction ──► Supabase ──► VersusHostSession ──► versusEngine.step()  ──► per-seat views ──► Supabase ──► render
 (steer, sweep,   Realtime     (the ONLY simulation)  two deterministic         (views.ts filters   Realtime    (props in,
  mark, scan)                                         team worlds, one          what each seat              actions out)
                                                      shared survivor           may see)
```

- **Pure, seeded engine** (`src/game/engine/`): no clock, no `Math.random`, no input mutation. The same seed and inputs always produce the same match, which keeps the tests simple. Each crew has its own world (physics, sonar, radio), and `resolveRescue` keeps one shared survivor in sync across both.
- **Hidden information is filtered in one place** (`src/game/engine/views.ts`). Phones never get the swimmer's position, except a drone contact when a sweep catches them and the Driver's close-up view. The laptop's big screen shows it live.
- **Reef formations with a path check** (`src/game/engine/formations.ts`): walls with gaps and horseshoes built from ordinary hazards. Each formation is kept only if a flood fill proves both docks can still reach the swimmer, and later swimmers only spawn where the docks can reach.
- **Two hazard marks per crew, enforced by the engine** (`applyMatchAction` in `src/game/engine/versus.ts`). Tapping a mark removes it, a third mark is refused, and the radio pin never counts.
- **238 tests** (`node:test`) across the engine, protocol, sessions, audio cues and UI helpers. All pass in `npm run check`.

Also in the build: beach-themed UI; host music plus per-phone sound effects and haptics; a countdown synced to its audio; and an end-of-match beach landing where the rescued swimmers step off one by one.

## Project layout

| Path | What |
|---|---|
| `src/game/engine/` | Pure game engine: co-op core, versus rules (`versus.ts`), formations, survivors, views |
| `src/game/versus/contract.ts` | Shared 2v2 types, tuning and the `VersusEngine` interface |
| `src/lib/realtime/`, `src/lib/game-client/` | Supabase transport, protocol, host and phone sessions |
| `src/lib/audio/` | Host music and phone sound effects |
| `src/app/versus/` | Host (`/versus/host/[code]`), phone (`/versus/room/[code]`) and preview routes |
| `src/components/` | Driver, Navigator, big-screen and shared UI |

The original four-role co-op mode (Captain, Sonar, Weather, Radio) is still in the code as **legacy**. Its routes redirect to 2v2, so it isn't reachable from the site.

## Tech

Next.js 16, React 19, TypeScript (strict), Tailwind CSS v4, Supabase Realtime (broadcast + presence, no database), deployed on Vercel. Setup details: `docs/DEPLOY.md`. Rules for contributors and coding agents: `AGENTS.md`.
