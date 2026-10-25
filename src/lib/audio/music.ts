/**
 * Host-laptop music controller. HTMLAudioElement per track, volume ramps, no SFX.
 * Paths are fixed so the team can swap files without code changes.
 */
import type { MusicState } from "./cues";

const LOBBY_SRC = "/audio/music-lobby.mp3";
const MATCH_SRC = "/audio/music-match.mp3";

const CROSSFADE_MS = 1000;
const MATCH_END_FADE_MS = 1500;
const DUCK_LEVEL = 0.4;
const FINAL_RATE = 1.06;
const FINAL_VOL_BOOST = 1.12;
const MASTER_VOL = 0.55;
const RAMP_HZ = 40; // ~25 ms steps — not frame-rate busywork

export type HostMusicController = {
  /** Call from a user gesture (click / SoundToggle). */
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  isUnlocked: () => boolean;
  /** Drive from scoreboard-derived MusicState each render/effect. */
  setState: (state: MusicState) => void;
  dispose: () => void;
};

function warnOnce(key: string, msg: string, seen: Set<string>): void {
  if (seen.has(key)) return;
  seen.add(key);
  console.warn(msg);
}

export function createHostMusic(): HostMusicController {
  const warned = new Set<string>();
  let unlocked = false;
  let muted = false;
  let disposed = false;
  let current: MusicState = "lobby";
  let lobby: HTMLAudioElement | null = null;
  let match: HTMLAudioElement | null = null;
  let rampTimer: ReturnType<typeof setInterval> | null = null;
  let lobbyTarget = 0;
  let matchTarget = 0;
  let lobbyVol = 0;
  let matchVol = 0;
  let ducking = false;

  function ensureElements(): void {
    if (typeof Audio === "undefined") return;
    if (!lobby) {
      lobby = new Audio(LOBBY_SRC);
      lobby.loop = true;
      lobby.preload = "auto";
      lobby.volume = 0;
      lobby.addEventListener("error", () => warnOnce("lobby", "[audio] music-lobby.mp3 missing or broken", warned));
    }
    if (!match) {
      match = new Audio(MATCH_SRC);
      match.loop = true;
      match.preload = "auto";
      match.volume = 0;
      match.addEventListener("error", () => warnOnce("match", "[audio] music-match.mp3 missing or broken", warned));
    }
  }

  function clearRamp(): void {
    if (rampTimer !== null) {
      clearInterval(rampTimer);
      rampTimer = null;
    }
  }

  function applyVolumes(): void {
    if (lobby) lobby.volume = muted ? 0 : Math.min(1, Math.max(0, lobbyVol));
    if (match) match.volume = muted ? 0 : Math.min(1, Math.max(0, matchVol));
  }

  function startRamp(durationMs: number): void {
    clearRamp();
    const steps = Math.max(1, Math.round(durationMs / RAMP_HZ));
    let i = 0;
    const startL = lobbyVol;
    const startM = matchVol;
    const endL = lobbyTarget;
    const endM = matchTarget;
    rampTimer = setInterval(() => {
      i += 1;
      const t = Math.min(1, i / steps);
      lobbyVol = startL + (endL - startL) * t;
      matchVol = startM + (endM - startM) * t;
      applyVolumes();
      if (t >= 1) {
        clearRamp();
        // Pause the silent bed so we don't burn decode on a zeroed track forever.
        if (lobbyVol < 0.01 && lobby && !lobby.paused) lobby.pause();
        if (matchVol < 0.01 && match && !match.paused) match.pause();
      }
    }, RAMP_HZ);
  }

  async function playSafe(el: HTMLAudioElement): Promise<void> {
    try {
      if (el.paused) await el.play();
    } catch {
      // Autoplay blocked — stay quiet until unlock().
    }
  }

  function setBeds(next: MusicState, fadeMs: number): void {
    ensureElements();
    if (!lobby || !match || !unlocked || disposed) return;

    ducking = next === "countdown";
    const lobbyOn = next === "lobby" || next === "countdown" || next === "results";
    const matchOn = next === "match" || next === "final";

    if (lobbyOn) void playSafe(lobby);
    if (matchOn) void playSafe(match);

    const base = MASTER_VOL;
    lobbyTarget = lobbyOn ? (ducking ? base * DUCK_LEVEL : base) : 0;
    matchTarget = matchOn ? (next === "final" ? base * FINAL_VOL_BOOST : base) : 0;

    // Final 10 s: nudge rate (preservesPitch when supported) + slight volume lift.
    try {
      match.playbackRate = next === "final" ? FINAL_RATE : 1;
      const typed = match as HTMLAudioElement & { preservesPitch?: boolean; mozPreservesPitch?: boolean };
      if ("preservesPitch" in typed) typed.preservesPitch = true;
      if ("mozPreservesPitch" in typed) typed.mozPreservesPitch = true;
    } catch {
      /* ignore */
    }

    startRamp(fadeMs);
    applyVolumes();
  }

  return {
    unlock() {
      if (disposed) return;
      unlocked = true;
      ensureElements();
      // Unlock gesture: play+pause both beds so later play() works.
      for (const el of [lobby, match]) {
        if (!el) continue;
        void el.play().then(() => {
          if (current === "lobby" || current === "countdown" || current === "results") {
            if (el === match) el.pause();
          } else if (el === lobby) {
            el.pause();
          }
        }).catch(() => {
          /* still blocked */
        });
      }
      setBeds(current, CROSSFADE_MS);
    },
    setMuted(m: boolean) {
      muted = m;
      applyVolumes();
    },
    isMuted: () => muted,
    isUnlocked: () => unlocked,
    setState(state: MusicState) {
      if (disposed) return;
      const prev = current;
      current = state;
      if (!unlocked) return;

      if (prev === state) return;

      if (prev === "match" || prev === "final") {
        if (state === "results" || state === "lobby") {
          // Fade match out, then lobby in.
          ensureElements();
          matchTarget = 0;
          startRamp(MATCH_END_FADE_MS);
          window.setTimeout(() => {
            if (disposed || current !== state) return;
            setBeds(state, CROSSFADE_MS);
          }, MATCH_END_FADE_MS);
          return;
        }
      }

      if (prev === "countdown" && (state === "match" || state === "final")) {
        // GO: crossfade into match track.
        setBeds(state, CROSSFADE_MS);
        return;
      }

      setBeds(state, CROSSFADE_MS);
    },
    dispose() {
      disposed = true;
      clearRamp();
      for (const el of [lobby, match]) {
        if (!el) continue;
        try {
          el.pause();
          el.src = "";
        } catch {
          /* ignore */
        }
      }
      lobby = null;
      match = null;
    },
  };
}
