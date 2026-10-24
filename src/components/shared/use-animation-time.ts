"use client";
/**
 * Milliseconds since mount, updated every animation frame. Used to drive mock/scripted previews.
 * OWNER: Developer 2 (shared). Not for game logic — the host's engine owns game time.
 */
import { useEffect, useState } from "react";

export function useAnimationTime(enabled = true): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      setT(now - start);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
  return t;
}
