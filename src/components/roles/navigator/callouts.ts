/**
 * Navigator shout lines from already-revealed view data. OWNER: Developer 4.
 * Pure display math — no rules, no hidden info beyond what SonarView / RadioView already hold.
 *
 * Clock convention: 12 = dead ahead of the boat's heading, clockwise (3 = starboard, 6 = astern).
 * Hazard wording follows versus-2 classes: land (sandbar/rock) vs jelly (debris).
 */
import { sectorCenter } from "@/game/sectors";
import type { RadioView, SonarContact, SonarView, SignalReading, Vec2 } from "@/game/types";
import { GULL_CONTACT_ID } from "@/game/types";
import { hazardClass } from "@/game/versus/contract";

const TAU = Math.PI * 2;

/** A person / contact / reading older than this is ignored for callouts. */
export const CALLOUT_FRESH_MS = 6_000;
/** Strong radio reading threshold for a direction callout. */
export const SIGNAL_STRONG = 0.6;
/** Hazard must be this close (map units) to warn "AHEAD". */
export const HAZARD_AHEAD_RANGE = 0.12;
/** ± this many radians of heading counts as "ahead" (~45°). */
export const HAZARD_AHEAD_HALF_ANGLE = Math.PI / 4;

export type DistanceBand = "CLOSE" | "NEAR" | "FAR";

export type Callout =
  | { kind: "survivor"; text: string; clock: number; band: DistanceBand }
  | { kind: "signal"; text: string; clock: number; strength: number }
  | { kind: "hazard"; text: string; clock: number }
  | { kind: "prompt"; text: string };

/** Absolute bearing of `to` from `from`: 0 = north, clockwise (same as boat heading). */
export function bearingTo(from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return (Math.atan2(dx, -dy) + TAU) % TAU;
}

/** Relative clockwise angle from heading to an absolute bearing, in [0, 2π). */
export function relativeBearing(heading: number, absolute: number): number {
  return (((absolute - heading) % TAU) + TAU) % TAU;
}

/** Clock face 1–12 from a relative bearing (0 rad → 12 o'clock). */
export function clockPosition(relative: number): number {
  const hour = Math.round((relative / TAU) * 12) % 12;
  return hour === 0 ? 12 : hour;
}

export function distanceBand(dist: number): DistanceBand {
  if (dist < 0.1) return "CLOSE";
  if (dist < 0.2) return "NEAR";
  return "FAR";
}

export function hypot2(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function isFresh(atMs: number, nowMs: number, windowMs = CALLOUT_FRESH_MS): boolean {
  // Clamp "future" stamps (scripted mocks) to age 0 — same idea as RadioStation's freshness.
  if (!Number.isFinite(atMs) || !Number.isFinite(nowMs)) return false;
  const age = Math.max(0, nowMs - atMs);
  return age < windowMs;
}

function hazardCalloutText(kind: Exclude<SonarContact["kind"], "gull">): string {
  return hazardClass(kind) === "jelly" ? "JELLIES" : "LAND AHEAD";
}

function clockCall(boat: { position: Vec2; heading: number }, target: Vec2): { clock: number; dist: number; relative: number } {
  const absolute = bearingTo(boat.position, target);
  const relative = relativeBearing(boat.heading, absolute);
  return { clock: clockPosition(relative), dist: hypot2(boat.position, target), relative };
}

function freshPerson(sonar: SonarView, nowMs: number): SonarContact | null {
  let best: SonarContact | null = null;
  for (const c of sonar.contacts) {
    if (c.kind !== "gull" && c.hazardId !== GULL_CONTACT_ID) continue;
    if (!isFresh(c.detectedAtMs, nowMs)) continue;
    if (best === null || c.detectedAtMs > best.detectedAtMs) best = c;
  }
  return best;
}

function strongReading(radio: RadioView, nowMs: number): SignalReading | null {
  let best: SignalReading | null = null;
  for (const r of radio.readings) {
    if (r.strength < SIGNAL_STRONG) continue;
    if (!isFresh(r.atMs, nowMs)) continue;
    if (best === null || r.strength > best.strength || (r.strength === best.strength && r.atMs > best.atMs)) {
      best = r;
    }
  }
  return best;
}

function hazardAhead(sonar: SonarView, nowMs: number): SonarContact | null {
  const boat = sonar.boat;
  let best: SonarContact | null = null;
  let bestDist = Infinity;
  for (const c of sonar.contacts) {
    if (c.kind === "gull" || c.hazardId === GULL_CONTACT_ID) continue;
    if (!isFresh(c.detectedAtMs, nowMs)) continue;
    const { dist, relative } = clockCall(boat, c.position);
    if (dist > HAZARD_AHEAD_RANGE) continue;
    const offBow = Math.min(relative, TAU - relative);
    if (offBow > HAZARD_AHEAD_HALF_ANGLE) continue;
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Pick one shout line for the Navigator. Priority: fresh person → strong radio → hazard ahead → prompt.
 */
export function navigatorCallout(sonar: SonarView, radio: RadioView, nowMs: number = sonar.mission.elapsedMs): Callout {
  const person = freshPerson(sonar, nowMs);
  if (person) {
    const { clock, dist } = clockCall(sonar.boat, person.position);
    const band = distanceBand(dist);
    const text =
      band === "CLOSE" ? `PERSON — CLOSE · ${clock} O'CLOCK` : `PERSON IN THE WATER · ${clock} O'CLOCK · ${band}`;
    return { kind: "survivor", clock, band, text };
  }

  const signal = strongReading(radio, nowMs);
  if (signal) {
    const { clock } = clockCall(radio.boat, sectorCenter(signal.sector));
    return {
      kind: "signal",
      clock,
      strength: signal.strength,
      text: `SIGNAL ${clock} O'CLOCK`,
    };
  }

  const hazard = hazardAhead(sonar, nowMs);
  if (hazard && hazard.kind !== "gull") {
    const { clock } = clockCall(sonar.boat, hazard.position);
    return {
      kind: "hazard",
      clock,
      text: hazardCalloutText(hazard.kind),
    };
  }

  return { kind: "prompt", text: "SWEEP OR SCAN TO FIND THEM" };
}
