# Setup, Supabase, GitHub and Vercel

Owner: Developer 2.

## Local setup

Requirements: Node.js ≥ 20.9 (LTS 22 recommended), npm, git.

```bash
git clone https://github.com/<OWNER>/stormline.git
cd stormline
npm install
npm run dev            # http://localhost:3000 — mock mode until Supabase is configured
```

Phones on the same Wi-Fi: `npm run dev:lan`, then open `http://<your-laptop-ip>:3000` on the phone (`ipconfig getifaddr en0` on macOS).

Scripts:

| Script | What |
|---|---|
| `npm run dev` / `dev:lan` | Dev server (LAN variant binds 0.0.0.0) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (Next core-web-vitals + TS) |
| `npm test` | Unit tests (`node:test` via `tsx`) for engine, protocol, sessions |
| `npm run build` | Production build |
| `npm run check` | All of the above — run before every PR |

## Supabase Realtime

Stormline uses **only** Realtime Broadcast and Presence. No tables, no auth, no SQL.

1. Create a free project at <https://supabase.com/dashboard> (any region near Texas, e.g. `us-east-1`).
2. Project Settings → API (or the **Connect** button): copy the **Project URL** and the **anon** public key (or the newer **publishable** key, `sb_publishable_…`).
3. Locally:
   ```bash
   cp .env.example .env.local
   # edit .env.local:
   # NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   # NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...   (or sb_publishable_...)
   ```
4. Restart `npm run dev`. The badge on the landing page switches to **Live · Supabase Realtime**.
5. Realtime settings: defaults are fine. Leave "Allow public access" for Realtime channels enabled (we use public channels, no RLS-authorized private channels). Free tier limits (concurrent connections, messages/sec) are far above a 5-device game at 10 Hz.

Never use the `service_role` / secret key in this app — every `NEXT_PUBLIC_*` value ships to browsers.

### How the transport works (`src/lib/realtime/supabase-transport.ts`)

- Channel `stormline:room:<CODE>`, one broadcast event `"msg"` carrying a `NetworkMessage`, `broadcast.self = false` (senders never get their own message), presence keyed by `playerId`.
- Status mapping: `SUBSCRIBED` → `connected`, `CHANNEL_ERROR` / `TIMED_OUT` → `error`, `CLOSED` → `disconnected`. supabase-js rejoins automatically after a network blip; every rejoin re-tracks presence and emits `connected` again, which makes `PlayerSession` re-send `hello`.
- **One Supabase client per transport.** supabase-js ≥ 2.11 hands back the *same* channel object if you call `channel()` twice with the same topic on one client, so two transports for one room in the same tab (React StrictMode double-mounts effects in dev) would tear down each other's channel. `createTransport()` therefore gives each transport its own client (`createSupabaseClient()`).
- `send()` is dropped until the channel is joined. Otherwise supabase-js silently falls back to an HTTP POST per message.
- Presence is collapsed to one member per `playerId` (newest connection wins) and validated before it reaches the app.

### Smoke test: `/debug/<CODE>` (temporary)

1. `npm run dev` (or `npm run dev:lan` for a phone), open `http://localhost:3000/debug/ABCD` in two browsers or two tabs. Open a **new** tab and paste the URL; "Duplicate tab" copies sessionStorage and gives both tabs the same id.
2. Both should show status `connected` and list each other under **Presence**. Add `?name=Phone` to label a device.
3. **Send test** in one: the other logs `← "test #1 …"` with an approximate latency; the sender only logs its own `→`.
4. Close one tab: it disappears from the other's presence within a few seconds. Reopen it: it comes back with the same id. The **Leave / Rejoin** button does the same without closing the tab.

Gotchas:

- A tab that's closed drops its WebSocket immediately and presence updates within ~1–2 s. A phone that's locked or backgrounded may keep the socket for up to ~30 s before the server times out its heartbeat.
- Env vars are read at build/dev-server start. After editing `.env.local`, restart `npm run dev`.
- Without the env vars everything falls back to mock mode, and `/debug` says so (only that tab is in the room).

## GitHub collaboration

Repository owner (once):

```bash
gh auth login                                   # if needed
cd stormline
gh repo create stormline --private --source=. --remote=origin --push
gh repo edit --add-topic hackathon,howdyhack
# invite teammates:
gh api -X PUT repos/<OWNER>/stormline/collaborators/<teammate-username> -f permission=push
```

Without `gh`: create an empty private repo named `stormline` on github.com (no README/license), then:

```bash
git remote add origin https://github.com/<OWNER>/stormline.git
git push -u origin main
```

Each teammate:

```bash
git clone https://github.com/<OWNER>/stormline.git
cd stormline
npm install
git checkout -b feat/engine          # or feat/realtime, feat/captain-ui, feat/specialist-ui
git push -u origin feat/engine
```

Recommended: protect `main` (Settings → Branches → require PR + passing checks). For Devpost, make the repo **public** before submitting (`gh repo edit --visibility public --accept-visibility-change-consequences`) or add judges as collaborators.

## Vercel

1. <https://vercel.com/new> → Import the `stormline` GitHub repo. Framework: Next.js (auto-detected). No build settings to change.
2. Environment Variables (Production + Preview): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Deploy. Every push to `main` deploys production; every PR gets a preview URL.
4. Changing env vars requires a redeploy (they're inlined at build time).

CLI alternative:

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel --prod
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Badge says Mock on Vercel | Env vars missing in that environment, or set after the last deploy → redeploy. |
| Phones can't load `localhost` | Use `npm run dev:lan` and the laptop's IP, or the Vercel URL. |
| Presence never shows the other device | Check both use the same room code; check browser console for `CHANNEL_ERROR`; confirm Realtime is enabled for the project. |
| `next/font` fails offline | Fonts download at build time; build with internet or swap to system fonts in `src/app/layout.tsx`. |
