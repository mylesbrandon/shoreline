import type { Hazard, Marker, SpectatorView, Vec2 } from "@/game/types";

/** Integer-cell hash: foam stays attached to the world as the camera moves. */
export function waterHash(x: number, y: number): number {
  let hash = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296;
}
export interface WaterFleck { x: number; y: number; strength: number }
export function waterFlecks(origin: Vec2, span: number): WaterFleck[] {
  const spacing = .014;
  const startX = Math.max(0, Math.floor(origin.x / spacing) - 1);
  const startY = Math.max(0, Math.floor(origin.y / spacing) - 1);
  const endX = Math.min(71, Math.ceil((origin.x + span) / spacing));
  const endY = Math.min(71, Math.ceil((origin.y + span) / spacing));
  const flecks: WaterFleck[] = [];
  for (let y = startY; y <= endY; y++) for (let x = startX; x <= endX; x++) {
    flecks.push({ x: (x + waterHash(x, y) * .7 + .15) * spacing,
      y: (y + waterHash(y + 23, x - 19) * .7 + .15) * spacing,
      strength: waterHash(x + 97, y - 53) });
  }
  return flecks;
}
export function freshNavigatorMark(marker: Marker, elapsedMs: number): boolean {
  return (marker.placedBy === "sonar" || marker.placedBy === "radio") && elapsedMs >= marker.placedAtMs && elapsedMs - marker.placedAtMs < 2000;
}
/** Only public shared view data is merged; never discover or infer a survivor. */
export function sharedOcean(blue: SpectatorView, red: SpectatorView): { hazards: Hazard[]; markers: Marker[] } {
  const hazards = new Map<string, Hazard>();
  for (const hazard of [...blue.hazards, ...red.hazards]) {
    const before = hazards.get(hazard.id);
    hazards.set(hazard.id, before?.revealed ? before : hazard);
  }
  const markers = new Map<string, Marker>();
  for (const marker of [...blue.markers, ...red.markers]) {
    const before = markers.get(marker.id);
    if (!before || marker.placedAtMs > before.placedAtMs) markers.set(marker.id, marker);
  }
  return { hazards: [...hazards.values()], markers: [...markers.values()] };
}
