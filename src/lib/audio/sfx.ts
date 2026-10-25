/**
 * Phone SFX: one shared AudioContext, master gain + compressor.
 * File one-shots for countdown / crash / hurt / click; procedural for the rest.
 */
import type { SfxCue } from "./cues";

const SFX = {
  countdown: "/audio/sfx/countdown-go.mp3",
  crash: "/audio/sfx/crash.mp3",
  hurt: "/audio/sfx/hurt.mp3",
  click: "/audio/sfx/click.mp3",
} as const;

const MAX_VOICES = 8;
/**
 * countdown-go.mp3 plays at its natural speed: VERSUS.countdownMs (3.5 s) is set to when it says
 * "GO", and the visual numbers follow its beats (COUNTDOWN_BEATS_MS in ocean/versus/feedback).
 */
const COUNTDOWN_BEATS_MS = [550, 1_600, 2_500] as const;

export type PhoneSfxController = {
  unlock: () => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  isUnlocked: () => boolean;
  play: (cue: SfxCue) => void;
  dispose: () => void;
};

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

function warnOnce(key: string, msg: string, seen: Set<string>): void {
  if (seen.has(key)) return;
  seen.add(key);
  console.warn(msg);
}

export function createPhoneSfx(): PhoneSfxController {
  const warned = new Set<string>();
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let unlocked = false;
  let muted = false;
  let disposed = false;
  let activeVoices = 0;
  const buffers = new Map<string, AudioBuffer | null>();

  function ensureGraph(): AudioContext | null {
    if (disposed || typeof AudioContext === "undefined") return null;
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.85;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 12;
      comp.ratio.value = 4;
      comp.attack.value = 0.003;
      comp.release.value = 0.15;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    return ctx;
  }

  async function loadBuffer(src: string): Promise<AudioBuffer | null> {
    if (buffers.has(src)) return buffers.get(src) ?? null;
    const ac = ensureGraph();
    if (!ac) return null;
    try {
      const res = await fetch(src);
      if (!res.ok) throw new Error(String(res.status));
      const raw = await res.arrayBuffer();
      const buf = await ac.decodeAudioData(raw.slice(0));
      buffers.set(src, buf);
      return buf;
    } catch {
      warnOnce(src, `[audio] sfx missing or broken: ${src}`, warned);
      buffers.set(src, null);
      return null;
    }
  }

  function voiceSlot(): boolean {
    if (activeVoices >= MAX_VOICES) return false;
    activeVoices += 1;
    return true;
  }

  function releaseVoice(afterMs: number): void {
    window.setTimeout(() => {
      activeVoices = Math.max(0, activeVoices - 1);
    }, afterMs);
  }

  function playBuffer(buf: AudioBuffer, opts?: { rate?: number; gain?: number }): void {
    const ac = ensureGraph();
    if (!ac || !master || !voiceSlot()) return;
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts?.rate ?? 1;
    const g = ac.createGain();
    g.gain.value = opts?.gain ?? 1;
    src.connect(g);
    g.connect(master);
    const dur = (buf.duration / (opts?.rate ?? 1)) * 1000 + 50;
    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    src.start();
    releaseVoice(dur);
  }

  function envGain(ac: AudioContext, peak: number, attack: number, release: number): GainNode {
    const g = ac.createGain();
    const now = ac.currentTime;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
    return g;
  }

  function tone(freq: number, dur: number, type: OscillatorType = "sine", peak = 0.25): void {
    const ac = ensureGraph();
    if (!ac || !master || !voiceSlot()) return;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = envGain(ac, peak, 0.01, dur);
    osc.connect(g);
    g.connect(master);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    releaseVoice((dur + 0.05) * 1000);
  }

  function noiseBurst(dur: number, peak = 0.2, hipass = 400): void {
    const ac = ensureGraph();
    if (!ac || !master || !voiceSlot()) return;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource();
    src.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = hipass;
    filter.Q.value = 0.7;
    const g = envGain(ac, peak, 0.005, dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        g.disconnect();
      } catch {
        /* ignore */
      }
    };
    releaseVoice(dur * 1000 + 40);
  }

  async function playFile(src: string, opts?: { rate?: number; gain?: number }): Promise<void> {
    const buf = await loadBuffer(src);
    if (buf) playBuffer(buf, opts);
  }

  function playCue(cue: SfxCue): void {
    if (!unlocked || disposed || muted) return;
    const ac = ensureGraph();
    if (!ac) return;
    if (ac.state === "suspended") void ac.resume();

    switch (cue) {
      case "countdown_go": {
        void playFile(SFX.countdown, { rate: 1, gain: 0.9 }).then(() => {
          // File missing: three beeps on the same beats as the clip's voice.
          if (buffers.get(SFX.countdown) === null) {
            for (const at of COUNTDOWN_BEATS_MS) window.setTimeout(() => tone(880, 0.12, "square", 0.2), at);
          }
        });
        break;
      }
      case "match_whistle":
        tone(1800, 0.18, "sine", 0.22);
        window.setTimeout(() => tone(2100, 0.28, "sine", 0.2), 90);
        break;
      case "final_tick":
        tone(1200, 0.04, "square", 0.08);
        break;
      case "win_jingle":
        tone(523, 0.12, "triangle", 0.22);
        window.setTimeout(() => tone(659, 0.12, "triangle", 0.22), 100);
        window.setTimeout(() => tone(784, 0.22, "triangle", 0.24), 200);
        break;
      case "lose_blip":
        tone(220, 0.25, "sawtooth", 0.15);
        break;
      case "tie_jingle":
        tone(440, 0.14, "triangle", 0.18);
        window.setTimeout(() => tone(440, 0.14, "triangle", 0.18), 180);
        break;
      case "rescue_chime":
        tone(880, 0.1, "triangle", 0.22);
        window.setTimeout(() => tone(1175, 0.16, "triangle", 0.22), 80);
        noiseBurst(0.18, 0.12, 600);
        vibrate(60);
        break;
      case "rival_rescue":
        tone(180, 0.2, "sine", 0.14);
        break;
      case "jelly_sting":
        void playFile(SFX.hurt, { gain: 0.85 });
        noiseBurst(0.12, 0.18, 2000);
        vibrate(120);
        break;
      case "aground_thud":
        noiseBurst(0.2, 0.28, 180);
        tone(90, 0.22, "sine", 0.2);
        vibrate([80, 40, 80]);
        break;
      case "wreck_crash":
        void playFile(SFX.crash, { gain: 1 });
        noiseBurst(0.35, 0.25, 350);
        tone(160, 0.4, "sawtooth", 0.12);
        vibrate(250);
        break;
      case "sonar_ping": {
        const ac2 = ensureGraph();
        if (!ac2 || !master || !voiceSlot()) break;
        const osc = ac2.createOscillator();
        osc.type = "sine";
        const now = ac2.currentTime;
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(420, now + 0.35);
        const g = envGain(ac2, 0.2, 0.01, 0.35);
        osc.connect(g);
        g.connect(master);
        osc.start();
        osc.stop(now + 0.4);
        releaseVoice(450);
        break;
      }
      case "radio_scan_0":
      case "radio_scan_1":
      case "radio_scan_2":
      case "radio_scan_3": {
        const level = Number(cue.slice(-1));
        noiseBurst(0.08, 0.1, 1500);
        tone(300 + level * 160, 0.12, "square", 0.12 + level * 0.03);
        break;
      }
      case "marker_tick":
        void playFile(SFX.click, { gain: 0.5 }).then(() => {
          if (buffers.get(SFX.click) === null) tone(1400, 0.04, "square", 0.12);
        });
        break;
      default:
        break;
    }
  }

  return {
    unlock() {
      if (disposed) return;
      unlocked = true;
      const ac = ensureGraph();
      if (ac && ac.state === "suspended") void ac.resume();
      void loadBuffer(SFX.countdown);
      void loadBuffer(SFX.crash);
      void loadBuffer(SFX.hurt);
      void loadBuffer(SFX.click);
    },
    setMuted(m: boolean) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.85;
    },
    isMuted: () => muted,
    isUnlocked: () => unlocked,
    play(cue: SfxCue) {
      try {
        playCue(cue);
      } catch {
        /* never break the game for audio */
      }
    },
    dispose() {
      disposed = true;
      if (ctx) void ctx.close().catch(() => undefined);
      ctx = null;
      master = null;
      buffers.clear();
    },
  };
}

/** Shared instance so "Join the showdown" can unlock before SeatedView mounts. */
let sharedPhone: PhoneSfxController | null = null;

export function getSharedPhoneSfx(): PhoneSfxController {
  if (!sharedPhone) sharedPhone = createPhoneSfx();
  return sharedPhone;
}

/** Call from the Join button's click handler (user gesture). */
export function unlockPhoneAudioFromGesture(): void {
  getSharedPhoneSfx().unlock();
}

export function disposeSharedPhoneSfx(): void {
  sharedPhone?.dispose();
  sharedPhone = null;
}
