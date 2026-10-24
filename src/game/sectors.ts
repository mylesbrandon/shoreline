/**
 * Shared, pure helpers for the radio sector grid. Part of the shared contract
 * (used by the engine for RADIO_SCAN and by the radio UI to draw the grid).
 */
import { RADIO } from "./config";
import type { SectorId, Vec2 } from "./types";

const COLUMNS = ["A", "B", "C", "D"] as const;
const ROWS = [1, 2, 3, 4] as const;

export const ALL_SECTORS: readonly SectorId[] = ROWS.flatMap((row) =>
  COLUMNS.map((col) => `${col}${row}` as SectorId),
);

export function isSectorId(value: unknown): value is SectorId {
  return typeof value === "string" && (ALL_SECTORS as readonly string[]).includes(value);
}

/** Sector containing a normalized position (positions on the far edge map to the last sector). */
export function sectorOf(position: Vec2): SectorId {
  const size = 1 / RADIO.grid;
  const col = Math.min(RADIO.grid - 1, Math.max(0, Math.floor(position.x / size)));
  const row = Math.min(RADIO.grid - 1, Math.max(0, Math.floor(position.y / size)));
  return `${COLUMNS[col]}${ROWS[row]}` as SectorId;
}

/** Axis-aligned bounds of a sector in normalized map units. */
export function sectorBounds(sector: SectorId): { x: number; y: number; width: number; height: number } {
  const size = 1 / RADIO.grid;
  const col = COLUMNS.indexOf(sector[0] as (typeof COLUMNS)[number]);
  const row = Number(sector.slice(1)) - 1;
  return { x: col * size, y: row * size, width: size, height: size };
}

export function sectorCenter(sector: SectorId): Vec2 {
  const b = sectorBounds(sector);
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
