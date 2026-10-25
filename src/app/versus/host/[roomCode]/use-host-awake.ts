"use client";
/**
 * Keep the host laptop awake and in front during a match. OWNER: Developer 2.
 * The host tab runs the only simulation; a sleeping screen or a background tab slows it and
 * stalls every phone. This asks for a Screen Wake Lock while `active` (feature-detected,
 * re-acquired when the tab comes back, released on stop), and reports when the tab was hidden
 * during play so the screen can warn. Failures are silent: it's a best-effort guard.
 */
import { useEffect, useState } from "react";

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

export function useHostAwake(active: boolean): { wasHidden: boolean; dismiss: () => void } {
  const [wasHidden, setWasHidden] = useState(false);

  useEffect(() => {
    if (!active) return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    let sentinel: WakeLockSentinelLike | null = null;
    let stopped = false;

    const acquire = async () => {
      if (!wakeLock || document.visibilityState !== "visible") return;
      try {
        const lock = await wakeLock.request("screen");
        if (stopped) void lock.release().catch(() => {});
        else sentinel = lock;
      } catch {
        /* not allowed (battery saver, iframe, old browser): the banner still covers us */
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") setWasHidden(true);
      else void acquire(); // the browser drops the lock when the tab hides
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);

  return { wasHidden, dismiss: () => setWasHidden(false) };
}
