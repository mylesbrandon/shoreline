# Judging demo (90 seconds + fallback)

## Setup (before judges arrive)

- Laptop on the venue Wi-Fi (or phone hotspot), plugged in, display mirrored to a monitor if available.
- Open the **production Vercel URL** → **Host a rescue** → leave the lobby (QR) on screen.
- Have 4 team phones already joined as backup players, but plan for judges to play.
- Phones: brightness up, auto-lock off. Do **not** reload the host tab once the room exists.

## Script

| Time | Who | What |
|---|---|---|
| 0:00–0:10 | Presenter | "A storm has hit and a boat called the *Gull* is adrift. You're the rescue crew — four stations, one boat, and nobody sees the whole picture." |
| 0:10–0:25 | Judges | Scan the QR on the laptop. Each phone shows a role card. Presenter points: "You steer. You see reefs. You read the weather. You find the signal." |
| 0:25–0:30 | Host | Press **Start**. 90-second countdown appears on every screen at once. |
| 0:30–1:20 | Judges | Play. Presenter coaches callouts: *"Sonar, ping!"* *"Radio, which sector?"* *"Weather, when does the current shift?"* Point at the laptop: the boat moves the instant the captain steers. |
| 1:20–1:30 | All | Victory flare / failure. Results screen: time left, hull, hazards hit. |
| 1:30–2:00 | Presenter | Tech in one breath: "One browser runs the authoritative simulation at 30 Hz, phones send typed actions over Supabase Realtime, each phone receives a filtered view so the Radio is the only one who can find the *Gull* — and the engine is pure, deterministic TypeScript with tests." |

If judges are shy, run one mission with the team first (60 s), then hand phones over.

## Fallback if networking fails

In order of preference:

1. **Hotspot**: switch laptop and phones to a team phone's hotspot; create a new room.
2. **Local LAN**: run `npm run dev:lan` on the laptop and join from phones on the same hotspot via `http://<laptop-ip>:3000` (still needs Supabase reachable).
3. **No network at all — preview mode**: open `/room/DEMO?preview=spectator` on the laptop and `/room/DEMO?preview=captain` / `sonar` / `weather` / `radio` on phones. These run entirely on-device with clearly labeled mock data. Narrate the cooperation and show the code + tests. Say honestly: "this is the offline preview; the live version syncs via Supabase."
4. **Recorded video**: a 60-second screen recording of a real 4-phone mission (record it at H+20) is in the Devpost submission.

Never pass preview mode off as live multiplayer — the badge on screen says "Station preview · mock data".
