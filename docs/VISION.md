# Vision

**Stormline** — *Four players. Four perspectives. One rescue mission.*

## The pitch

A storm has hit the coast and a small vessel, the *Gull*, is adrift. Your crew of four takes a rescue boat into the dark. Everyone grabs their phone and gets a different station on the same ship. Nobody can win alone: the Captain can steer but can't see the reefs; Sonar can see the reefs but can't steer; Weather knows when the current will shove you sideways; Radio is the only one who can find the *Gull*. You have 90 seconds. Start talking.

## Experience, in order

1. The host opens Stormline on a laptop connected to a big screen and clicks **Host a rescue**.
2. A room code and QR code appear. Four people scan it with their phones.
3. Each phone flips to a role card: Captain, Sonar, Weather, Radio.
4. Host presses **Start**. A 90-second countdown begins on every screen at once.
5. The laptop shows a moody, animated chart of the storm with the boat cutting through it — this is what the audience watches.
6. Phones become instruments: a helm, a sonar scope, a weather dial, a radio grid.
7. People shout: *"Reef dead ahead, hard to port!"* *"Current's flipping east in five!"* *"Signal's strongest in D1!"*
8. The boat reaches the *Gull* (victory flare) or runs out of hull or time (failure).
9. A results screen shows time left, hull, hazards hit, and a score.

## Who it's for

- **Judges at HowdyHack** — it must make sense in 10 seconds and be fun to play in 90.
- Friends, classes, clubs, and team-building sessions: a party game for one screen and four phones, no installs, no accounts.

## The hook

**Asymmetric information on your own phone.** Everyone sees a different slice of the truth, so the game *is* the conversation. It's the *Keep Talking and Nobody Explodes* / *Spaceteam* feeling, built for the web, themed around the ocean and a rescue — cooperative, not competitive.

## Look and feel

Polished indie game, not dashboard. Dark navy ocean, teal and cyan navigation instruments, amber and red hazards, brass details. Smooth, purposeful motion: swells drift, sonar sweeps, the boat leaves a wake. Mobile-first stations with big touch targets; a cinematic spectator view on the laptop.

## The judging demo (summary)

Four judges each scan the QR code and play one mission while we narrate. See [DEMO.md](DEMO.md) for the exact 90-second script and the fallback if the network fails.

## Technical substance to highlight

- Host-authoritative real-time simulation in the browser at 30 Hz, broadcasting per-role views at 10 Hz over Supabase Realtime.
- Deterministic, unit-tested pure-TypeScript game engine.
- Hidden-information filtering in one audited place, with tests that prove no role sees the target.
- Seq-numbered actions, snapshot resync and stable player identity for reconnection.
- Canvas rendering with client-side interpolation.
