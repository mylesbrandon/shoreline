/**
 * LAND · JELLY · PERSON key under the sonar scope. OWNER: Developer 4.
 * HTML, not canvas: the scope canvas is clipped to a circle, which cut off and skewed a key drawn
 * along its bottom edge (playtest r7).
 */
import { LEGEND_COLORS as K } from "./draw-scope";

export function ScopeLegend() {
  return (
    <div className="mt-1 flex items-center justify-center gap-4 font-mono text-[10px] uppercase tracking-wider text-mist" aria-hidden>
      <span className="inline-flex items-center gap-1.5">
        <svg width="12" height="10" viewBox="-6 -5 12 10">
          <path d="M-5 0 L-2 -4 L5 -2 L3 4 L-4 3 Z" fill={K.landFill} stroke={K.landStroke} strokeWidth="1.5" />
        </svg>
        Land
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="10" height="10" viewBox="-5 -5 10 10">
          <circle r="4" fill={K.jelly} stroke={K.jellyStroke} strokeWidth="1.5" strokeDasharray="2 2" />
        </svg>
        Jelly
      </span>
      <span className="inline-flex items-center gap-1.5">
        <svg width="11" height="11" viewBox="-5.5 -5.5 11 11">
          <circle r="4.5" fill="none" stroke={K.person} strokeWidth="1.5" />
          <circle cy="-1" r="1.2" fill={K.foam} />
        </svg>
        Person
      </span>
    </div>
  );
}
