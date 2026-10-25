# Audio credits

## Music (`public/audio/`)

| File | Role | Source |
|---|---|---|
| `music-lobby.mp3` | Waiting room / results loop | Team-provided asset (`song1.mp3`), used as lobby bed |
| `music-match.mp3` | In-match loop | Team-provided asset (`song2.mp3`), used as match bed |

These two tracks were supplied by the Shoreline HowdyHack team for the demo.
If you swap them, keep the filenames and update this table with author + licence.

## Sound effects (`public/audio/sfx/`)

| File | Cue | Source (filename provenance) |
|---|---|---|
| `countdown-go.mp3` | 3-2-1-GO | Team-provided (`3-2-1-go-green-screen-footage-…`) |
| `crash.mp3` | Hull wrecked (wipeout) | Team-provided (`dragon-studio-car-crash-sound-…`) |
| `hurt.mp3` | Jellyfish sting (hull still > 0) | Team-provided (`homemade_sfx-slap-hurt-pain-…`) |
| `click.mp3` | UI / marker tick fallback | Team-provided (`mouse-click-sound`) |

Remaining phone SFX (rescue splash, whistle, sonar ping, radio crackle, win/lose jingles, final ticks, aground thud) are **procedural Web Audio** generated at runtime — no third-party samples.

Total audio payload in this folder is kept under 8 MB.
