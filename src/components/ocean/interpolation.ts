import type { BoatState } from "@/game/types";

export interface BoatSample { boat: BoatState; at: number }

/** Render only between received snapshots; hold at either end rather than predicting rules. */
export function interpolateBoat(samples: readonly BoatSample[], at: number): BoatState | null {
  const first = samples[0];
  if (!first) return null;
  if (at <= first.at) return first.boat;
  for (let i = 1; i < samples.length; i++) {
    const next = samples[i]!;
    if (at > next.at) continue;
    if (at === next.at) return next.boat;
    const previous = samples[i - 1]!;
    const alpha = Math.max(0, Math.min(1, (at - previous.at) / Math.max(1, next.at - previous.at)));
    const turn = Math.atan2(Math.sin(next.boat.heading - previous.boat.heading), Math.cos(next.boat.heading - previous.boat.heading));
    const heading = (previous.boat.heading + turn * alpha + Math.PI * 2) % (Math.PI * 2);
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    return { ...next.boat, heading, position: {
      x: lerp(previous.boat.position.x, next.boat.position.x),
      y: lerp(previous.boat.position.y, next.boat.position.y),
    }, speed: lerp(previous.boat.speed, next.boat.speed) };
  }
  return samples[samples.length - 1]!.boat;
}

