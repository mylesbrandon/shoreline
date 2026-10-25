/**
 * Timing for the end-of-match beach landing (pure, so it is testable). OWNER: Developer 3.
 * Both skis glide in to their docks, then each crew's rescued people step off one at a time and
 * the crew's count ticks up as each one reaches the sand. The winner is revealed after the last.
 */
export const LANDING = {
  /** Skis glide from the water to their dock. */
  boatsInMs: 1_400,
  /** Gap between people stepping off (shrinks for big scores so the whole thing stays short). */
  stepMs: 450,
  /** The stepping-off for one crew never takes longer than this. */
  maxUnloadMs: 4_800,
  /** One person's walk from the ski to their spot on the sand. */
  walkMs: 700,
  /** Beat after the last person lands before the winner appears. */
  holdMs: 500,
  /** People drawn per crew: 3 rows of 5 (the count is always exact; the beach just fills up). */
  maxDrawn: 15,
} as const;

/** Gap between people for a crew bringing in `n`. */
export function stepFor(n: number): number {
  return n <= 1 ? LANDING.stepMs : Math.min(LANDING.stepMs, LANDING.maxUnloadMs / (n - 1));
}

/** When person `i` (0-based) of a crew bringing in `n` starts stepping off. */
export function stepOffAt(i: number, n: number): number {
  return LANDING.boatsInMs + i * stepFor(n);
}

/** How many of `n` people are on the sand at `tMs` after the landing starts. */
export function landedBy(tMs: number, n: number): number {
  let landed = 0;
  for (let i = 0; i < n; i++) if (stepOffAt(i, n) + LANDING.walkMs <= tMs) landed++;
  return landed;
}

/** When the winner can be revealed: the slower crew's last person has landed, plus a beat. */
export function revealAt(blue: number, red: number): number {
  const lastLanding = (n: number) => (n === 0 ? LANDING.boatsInMs : stepOffAt(n - 1, n) + LANDING.walkMs);
  return Math.max(lastLanding(blue), lastLanding(red)) + LANDING.holdMs;
}
