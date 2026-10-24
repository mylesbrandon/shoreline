/**
 * Pure canvas drawing helpers. OWNER: Developer 3.
 * All inputs are in normalized map units; `size` is the canvas side length in CSS pixels.
 * Heading convention: 0 = north (up), clockwise positive — matches src/game/types.ts.
 */
import type { BoatState, Hazard, Marker, RescueTarget, Vec2 } from "@/game/types";
import { PALETTE } from "./palette";

export interface OceanScene {
  boat: BoatState;
  hazards: Hazard[];
  markers: Marker[];
  target?: RescueTarget | null;
  current?: Vec2;
  stormIntensity?: number;
}

export function drawOcean(ctx: CanvasRenderingContext2D, size: number, timeMs: number, storm = 0.3): void {
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.75);
  g.addColorStop(0, PALETTE.deep);
  g.addColorStop(1, PALETTE.abyss);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Drifting swell lines — cheap "living water" effect.
  ctx.strokeStyle = `rgba(34, 211, 238, ${0.05 + storm * 0.06})`;
  ctx.lineWidth = 1;
  const t = timeMs / 1000;
  for (let i = 0; i < 18; i++) {
    const y0 = ((i / 18) * size + t * 8) % size;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 12) {
      const y = y0 + Math.sin(x / (40 + i * 3) + t * (0.8 + storm)) * (3 + storm * 6);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Faint 4x4 chart grid (matches radio sectors).
  ctx.strokeStyle = "rgba(138, 162, 200, 0.08)";
  ctx.setLineDash([4, 6]);
  for (let i = 1; i < 4; i++) {
    const p = (i / 4) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

export function drawHazard(ctx: CanvasRenderingContext2D, size: number, h: Hazard, timeMs: number): void {
  const x = h.position.x * size;
  const y = h.position.y * size;
  const r = h.radius * size;
  const pulse = 0.5 + 0.5 * Math.sin(timeMs / 400 + x);
  ctx.fillStyle = h.kind === "reef" ? "rgba(245, 165, 36, 0.28)" : "rgba(239, 68, 68, 0.25)";
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = h.kind === "reef" ? PALETTE.amber : PALETTE.hazard;
  ctx.globalAlpha = 0.5 + pulse * 0.5;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.arc(x, y, r + 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

export function drawMarker(ctx: CanvasRenderingContext2D, size: number, m: Marker): void {
  const x = m.position.x * size;
  const y = m.position.y * size;
  ctx.lineWidth = 2.5;
  if (m.kind === "hazard") {
    ctx.strokeStyle = PALETTE.hazard;
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 7);
    ctx.lineTo(x + 7, y + 7);
    ctx.moveTo(x + 7, y - 7);
    ctx.lineTo(x - 7, y + 7);
    ctx.stroke();
  } else {
    ctx.strokeStyle = m.kind === "target_guess" ? PALETTE.cyan : PALETTE.foam;
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x + 9, y);
    ctx.lineTo(x, y + 9);
    ctx.lineTo(x - 9, y);
    ctx.closePath();
    ctx.stroke();
  }
}

export function drawTarget(ctx: CanvasRenderingContext2D, size: number, target: RescueTarget, timeMs: number): void {
  const x = target.position.x * size;
  const y = target.position.y * size;
  const r = target.rescueRadius * size;
  ctx.strokeStyle = PALETTE.brass;
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const k = ((timeMs / 1200 + i / 2) % 1) * 1.6;
    ctx.globalAlpha = 1 - k / 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.6 + k), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawBoat(ctx: CanvasRenderingContext2D, size: number, boat: BoatState): void {
  const x = boat.position.x * size;
  const y = boat.position.y * size;
  const s = Math.max(10, size * 0.028);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(boat.heading);

  // Wake
  const wake = Math.min(1, boat.speed / 0.06);
  if (wake > 0.05) {
    ctx.strokeStyle = `rgba(230, 241, 255, ${0.25 * wake})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, s * 0.8);
    ctx.lineTo(-s * 1.2, s * (1.6 + 2 * wake));
    ctx.moveTo(s * 0.4, s * 0.8);
    ctx.lineTo(s * 1.2, s * (1.6 + 2 * wake));
    ctx.stroke();
  }

  // Hull (points "up" = heading 0 = north)
  ctx.shadowColor = PALETTE.teal;
  ctx.shadowBlur = 14;
  ctx.fillStyle = PALETTE.foam;
  ctx.strokeStyle = PALETTE.teal;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.2);
  ctx.quadraticCurveTo(s * 0.75, -s * 0.2, s * 0.55, s * 0.9);
  ctx.lineTo(-s * 0.55, s * 0.9);
  ctx.quadraticCurveTo(-s * 0.75, -s * 0.2, 0, -s * 1.2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawCurrentArrow(ctx: CanvasRenderingContext2D, size: number, current: Vec2): void {
  const mag = Math.hypot(current.x, current.y);
  if (mag < 1e-6) return;
  const cx = size - 36;
  const cy = 36;
  const len = Math.min(24, 8 + (mag / 0.03) * 16);
  const ux = current.x / mag;
  const uy = current.y / mag;
  ctx.strokeStyle = PALETTE.cyan;
  ctx.fillStyle = PALETTE.cyan;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.globalAlpha = 0.25;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(cx - ux * len, cy - uy * len);
  ctx.lineTo(cx + ux * len, cy + uy * len);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + ux * len, cy + uy * len, 3, 0, Math.PI * 2);
  ctx.fill();
}

export function drawScene(ctx: CanvasRenderingContext2D, size: number, scene: OceanScene, timeMs: number): void {
  drawOcean(ctx, size, timeMs, scene.stormIntensity ?? 0.3);
  for (const h of scene.hazards) drawHazard(ctx, size, h, timeMs);
  for (const m of scene.markers) drawMarker(ctx, size, m);
  if (scene.target) drawTarget(ctx, size, scene.target, timeMs);
  drawBoat(ctx, size, scene.boat);
  if (scene.current) drawCurrentArrow(ctx, size, scene.current);
}
