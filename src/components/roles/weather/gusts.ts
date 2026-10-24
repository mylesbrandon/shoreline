/**
 * Read the weather forecast as gusts for the Gust Watch screen. Display-only: the engine decides
 * what the current does; this only labels what the WeatherView already says.
 *
 * The engine sends each gust as two forecast entries (gust current, then back to the calm base
 * current), so a "gust" is any current noticeably stronger than the calmest one in view.
 */
import { WEATHER } from "@/game/config";
import type { Vec2, WeatherState } from "@/game/types";

export type GustSize = "SMALL" | "BIG" | "HUGE";

export interface Gust {
  atMs: number;
  /** When the current drops back to calm, if that's in the forecast window. */
  endsAtMs: number | null;
  size: GustSize;
  /** Compass name of where the gust blows FROM (what players shout: "from the west"). */
  from: string;
  /** Radians, heading convention (0 = north, clockwise): direction it blows from. */
  fromAngle: number;
}

export interface GustOutlook {
  active: Gust | null;
  upcoming: Gust[];
}

/** Stronger than the calm current by this much (map units / second) counts as a gust. */
const GUST_MARGIN = 0.004;
const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;

const strength = (v: Vec2) => Math.hypot(v.x, v.y);

export function compassName(angle: number): string {
  const index = Math.round(angle / (Math.PI / 4));
  return COMPASS[((index % 8) + 8) % 8] ?? "north";
}

export function gustSize(current: Vec2): GustSize {
  const k = strength(current) / WEATHER.maxCurrent;
  return k < 0.6 ? "SMALL" : k < 0.85 ? "BIG" : "HUGE";
}

function toGust(atMs: number, current: Vec2, endsAtMs: number | null): Gust {
  const fromAngle = (Math.atan2(current.x, -current.y) + Math.PI) % (2 * Math.PI);
  return { atMs, endsAtMs, size: gustSize(current), from: compassName(fromAngle), fromAngle };
}

export function readGusts(weather: WeatherState, nowMs: number): GustOutlook {
  const calm = Math.min(strength(weather.current), ...weather.forecast.map((e) => strength(e.current)));
  const isGust = (v: Vec2) => strength(v) > calm + GUST_MARGIN;
  const nextAt = (i: number) => weather.forecast[i]?.atMs ?? null;

  const active = isGust(weather.current) ? toGust(nowMs, weather.current, nextAt(0)) : null;
  const upcoming = weather.forecast.flatMap((entry, i) =>
    isGust(entry.current) ? [toGust(entry.atMs, entry.current, nextAt(i + 1))] : [],
  );
  return { active, upcoming };
}
