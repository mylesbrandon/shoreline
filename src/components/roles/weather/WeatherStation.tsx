"use client";
/**
 * Weather specialist's phone screen: "Gust Watch".
 * One decision every few seconds: a gust is coming — brace it now (10 s cooldown) or save the
 * brace and shout its direction to the Captain. No raw numbers; just when, how big, from where.
 * Props in (WeatherView), typed actions out (onAction).
 */
import type { PlayerAction, WeatherView } from "@/game/types";
import { WEATHER } from "@/game/config";
import { CooldownButton, StationPanel } from "../instruments";
import { readGusts, type Gust, type GustSize } from "./gusts";

export interface WeatherStationProps {
  view: WeatherView;
  onAction: (action: PlayerAction) => void;
}

const ARROW_WIDTH: Record<GustSize, number> = { SMALL: 7, BIG: 12, HUGE: 18 };
/** The BRACE button glows when a big gust lands within this long. */
const URGENT_MS = 3_000;

const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

export function WeatherStation({ view, onAction }: WeatherStationProps) {
  const w = view.weather;
  const now = view.mission.elapsedMs;
  const { active, upcoming } = readGusts(w, now);
  const next = upcoming[0] ?? null;
  const braced = w.shieldActiveUntilMs !== null && now < w.shieldActiveUntilMs;
  const big = (g: Gust | null) => g !== null && g.size !== "SMALL";
  const urgent = (big(active) && !braced) || (big(next) && next !== null && next.atMs - now <= URGENT_MS);

  const headline = braced
    ? `BRACED · ${seconds((w.shieldActiveUntilMs ?? now) - now)}`
    : active
      ? `SET NOW${active.endsAtMs !== null ? ` · ${seconds(active.endsAtMs - now)}` : ""}`
      : next
        ? `NEXT SET IN ${seconds(next.atMs - now)}`
        : "FLAT WATER";
  const shown = active ?? next;
  // Ring fills as the next gust approaches across the forecast window; full while one is blowing.
  const progress = active ? 1 : next ? 1 - Math.min(1, (next.atMs - now) / WEATHER.forecastHorizonMs) : 0;

  return (
    <div className="grid gap-3">
      <StationPanel title="Surf watch" tone="brass">
        <p
          className={`text-center font-display text-4xl font-bold tracking-wide ${active && !braced ? "text-hazard" : braced ? "text-teal" : "text-foam"}`}
          aria-live="polite"
        >
          {headline}
        </p>
        <p className="mt-1 text-center font-mono text-sm uppercase tracking-widest text-mist">
          {shown ? `${shown.size} from the ${shown.from}` : "Nothing in the next few seconds"}
        </p>

        <GustDial gust={shown} progress={progress} blowing={active !== null} braced={braced} />

        {upcoming.length > (active ? 0 : 1) && (
          <ul className="mt-2 flex flex-wrap justify-center gap-2">
            {upcoming.slice(active ? 0 : 1, active ? 2 : 3).map((g) => (
              <li key={g.atMs} className="rounded-full border border-hull px-3 py-1 font-mono text-xs uppercase tracking-wider text-mist">
                then <span className="text-foam">{g.size}</span> from {g.from}
              </li>
            ))}
          </ul>
        )}
      </StationPanel>

      <CooldownButton
        label="Brace"
        tone="hazard"
        size="xl"
        urgent={urgent}
        nowMs={now}
        readyAtMs={w.shieldReadyAtMs}
        cooldownMs={WEATHER.shieldCooldownMs}
        disabled={view.mission.phase !== "active"}
        onPress={() => onAction({ type: "WEATHER_SHIELD" })}
      />
      <p className="text-center font-mono text-[11px] text-mist">
        Brace keeps the ski steady for {WEATHER.shieldDurationMs / 1000} s. Can&apos;t brace? Shout the direction.
      </p>
    </div>
  );
}

/** Boat in the middle, N at the top, the gust arrow pushing in from where it blows. */
function GustDial({ gust, progress, blowing, braced }: { gust: Gust | null; progress: number; blowing: boolean; braced: boolean }) {
  const R = 88;
  const ring = 2 * Math.PI * R;
  const tip = 34;
  const tail = 80;
  const sx = (r: number) => 100 + Math.sin(gust?.fromAngle ?? 0) * r;
  const sy = (r: number) => 100 - Math.cos(gust?.fromAngle ?? 0) * r;
  const angleDeg = ((gust?.fromAngle ?? 0) * 180) / Math.PI;

  return (
    <svg viewBox="0 0 200 200" className="mx-auto mt-2 block w-full max-w-[280px]" role="img"
      aria-label={gust ? `${gust.size} gust from the ${gust.from}` : "No gust coming"}>
      <circle cx={100} cy={100} r={R} fill="none" stroke="var(--color-hull)" strokeWidth={6} />
      <circle cx={100} cy={100} r={R} fill="none" stroke={blowing ? "var(--color-hazard)" : "var(--color-brass)"}
        strokeWidth={6} strokeLinecap="round" strokeDasharray={`${ring * progress} ${ring}`} transform="rotate(-90 100 100)" />
      <text x={100} y={26} textAnchor="middle" className="fill-mist font-mono" fontSize={12}>N</text>
      {braced && <circle cx={100} cy={100} r={26} fill="none" stroke="var(--color-teal)" strokeWidth={4} className="animate-pulse" />}
      {/* Boat, north-up */}
      <path d="M100 86 L108 108 L92 108 Z" fill="var(--color-foam)" />
      {gust && (
        <g className={blowing ? "animate-pulse" : undefined}>
          <line x1={sx(tail)} y1={sy(tail)} x2={sx(tip + 8)} y2={sy(tip + 8)} stroke={blowing ? "var(--color-hazard)" : "var(--color-brass)"}
            strokeWidth={ARROW_WIDTH[gust.size]} strokeLinecap="round" />
          <polygon points="0,-14 12,6 -12,6" transform={`translate(${sx(tip)} ${sy(tip)}) rotate(${angleDeg + 180})`}
            fill={blowing ? "var(--color-hazard)" : "var(--color-brass)"} />
        </g>
      )}
    </svg>
  );
}
