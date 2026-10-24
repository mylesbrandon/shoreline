# Stormline

**Four players. Four perspectives. One rescue mission.**

A browser-based cooperative ocean-rescue game for HowdyHack 2026. A host laptop shows the storm; four players join from their phones as **Captain**, **Sonar**, **Weather** and **Radio**. Each sees a different slice of the truth. Talk, steer, and reach the stranded *Gull* before the 90-second clock runs out.

## Quick start

```bash
git clone https://github.com/<OWNER>/stormline.git
cd stormline
npm install
npm run dev
```

Open <http://localhost:3000>. With no Supabase keys the app runs in **mock mode** (clearly labeled, single device):

- `/` — landing page (host a rescue / join with a code)
- `/host/ABCD` — host + spectator screen (QR code, crew list, ocean)
- `/room/ABCD` — player phone screen
- `/room/DEMO?preview=captain` (or `sonar`, `weather`, `radio`, `spectator`) — station sandboxes with animated mock data and an on-screen action log

For real multiplayer, add Supabase Realtime keys:

```bash
cp .env.example .env.local    # then fill in NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev:lan               # phones on the same Wi-Fi open http://<laptop-ip>:3000
```

Full instructions: [docs/DEPLOY.md](docs/DEPLOY.md).

## Scripts

| | |
|---|---|
| `npm run dev` | dev server |
| `npm run dev:lan` | dev server reachable from phones on your network |
| `npm run typecheck` | strict TypeScript check |
| `npm run lint` | ESLint |
| `npm test` | unit tests (engine, protocol, sessions) |
| `npm run build` | production build |
| `npm run check` | everything above — run before every PR |

## How it works

```
Phone (Captain) ─┐                         ┌─> Phone: CaptainView
Phone (Sonar)   ─┼─ PlayerAction ─┐   ┌────┼─> Phone: SonarView
Phone (Weather) ─┤   (Supabase    ▼   │    ├─> Phone: WeatherView
Phone (Radio)   ─┘    Broadcast)  Host laptop └─> Phone: RadioView
                                  HostSession
                                  └─ engine.applyAction / engine.step (30 Hz)
                                  └─ engine.getRoleViews → broadcast (10 Hz)
```

- **Host-authoritative**: one browser runs the only simulation; phones never simulate.
- **Pure engine** (`src/game/engine`): deterministic TypeScript, unit tested, no React/network.
- **Hidden information**: each role gets a filtered view; nobody's view contains the rescue target.
- **Transport interface** (`src/lib/realtime`): `MockRoomTransport` for offline work, `SupabaseRoomTransport` for live play.

## Project layout

```
src/
  app/                      routes: /, /host/[roomCode], /room/[roomCode]       (Dev 2)
  components/
    shared/                 mode badge, QR, role metadata, RoleStation          (Dev 2)
    ocean/                  canvas renderer, spectator display                  (Dev 3)
    captain/                captain station + helm                              (Dev 3)
    roles/                  sonar / weather / radio stations + instrument kit   (Dev 4)
  game/
    types.ts config.ts sectors.ts   SHARED CONTRACTS (team agreement to change)
    mock-state.ts                   mock fixtures for UI and tests
    engine/                         simulation and rules                        (Dev 1)
  lib/
    realtime/               transports, protocol, room codes, identity          (Dev 2)
    game-client/            HostSession, PlayerSession, store, hooks            (Dev 2)
docs/                       VISION, MVP, CONTRACTS, TEAM, TASKS, DEMO, DEPLOY
AGENTS.md, CLAUDE.md        rules for coding agents
```

## Team docs

[Vision](docs/VISION.md) · [MVP](docs/MVP.md) · [Contracts](docs/CONTRACTS.md) · [Team](docs/TEAM.md) · [First tasks](docs/TASKS.md) · [Demo](docs/DEMO.md) · [Deploy](docs/DEPLOY.md)

## Tech

Next.js (App Router) · TypeScript (strict) · Tailwind CSS v4 · HTML Canvas · Supabase Realtime (Broadcast + Presence) · Vercel · lucide-react · qrcode.react
