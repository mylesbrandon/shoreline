/**
 * Pick the nearest sonar contact ahead of the boat for a one-tap MARK. OWNER: Developer 4.
 */
import type { SonarContact, SonarView, Vec2 } from "@/game/types";
import { GULL_CONTACT_ID } from "@/game/types";
import { bearingTo, HAZARD_AHEAD_HALF_ANGLE, hypot2, relativeBearing } from "./callouts";

const TAU = Math.PI * 2;

/** Nearest non-person contact within ±45° of heading, or null. */
export function nearestContactAhead(sonar: SonarView): Vec2 | null {
  const boat = sonar.boat;
  let best: SonarContact | null = null;
  let bestDist = Infinity;
  for (const c of sonar.contacts) {
    if (c.kind === "gull" || c.hazardId === GULL_CONTACT_ID) continue;
    const abs = bearingTo(boat.position, c.position);
    const rel = relativeBearing(boat.heading, abs);
    const offBow = Math.min(rel, TAU - rel);
    if (offBow > HAZARD_AHEAD_HALF_ANGLE) continue;
    const dist = hypot2(boat.position, c.position);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best ? { ...best.position } : null;
}
