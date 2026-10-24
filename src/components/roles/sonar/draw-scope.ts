/**
 * Boat-centered PPI drawing for the sonar station. OWNER: Developer 4.
 * Renders only what the view already revealed — no ping rules, no hidden hazards.
 *
 * Colours come from the shared canvas palette (components/ocean/palette.ts).
 */
import { SONAR } from "@/game/config";
import type { HazardKind, Marker, SonarContact, SonarView, Vec2 } from "@/game/types";
import { PALETTE } from "@/components/ocean/palette";
import { SCOPE_DISPLAY_RANGE } from "./scope-coords";

// One palette for every canvas (the old ownership split is gone), so the drone camera re-themes with the rest.
const C = PALETTE;

const TAU = Math.PI * 2;
const SWEEP_MS = 3_200;
/** Contacts dim over this many mission-ms after detection, but never vanish. */
const CONTACT_FADE_MS = 18_000;
const CONTACT_FLOOR = 0.28;

export interface ScopeRipple {
  position: Vec2;
  bornMs: number;
}

function worldToScreen(pos: Vec2, boat: Vec2, cx: number, cy: number, pxPerUnit: number): { x: number; y: number } {
  return {
    x: cx + (pos.x - boat.x) * pxPerUnit,
    y: cy + (pos.y - boat.y) * pxPerUnit,
  };
}

function contactFade(contact: SonarContact, elapsedMs: number): number {
  const age = elapsedMs - contact.detectedAtMs;
  if (!Number.isFinite(age) || age <= 0) return 1;
  return Math.max(CONTACT_FLOOR, 1 - age / CONTACT_FADE_MS);
}

function kindColor(kind: HazardKind): string {
  if (kind === "rock") return C.hazard;
  if (kind === "debris") return C.brass;
  return C.amber;
}

export function drawSonarScope(
  ctx: CanvasRenderingContext2D,
  size: number,
  view: SonarView,
  nowMs: number,
  ripples: readonly ScopeRipple[],
  reducedMotion: boolean,
): void {
  const cx = size / 2;
  const cy = size / 2;
  const well = size * 0.46;
  const pxPerUnit = well / SCOPE_DISPLAY_RANGE;
  const boat = view.boat.position;
  const elapsed = view.mission.elapsedMs;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = C.abyss;
  ctx.fillRect(0, 0, size, size);

  // Outer bezel.
  ctx.beginPath();
  ctx.arc(cx, cy, well + size * 0.03, 0, TAU);
  ctx.fillStyle = C.navy;
  ctx.fill();
  ctx.lineWidth = Math.max(2, size * 0.012);
  ctx.strokeStyle = C.hull;
  ctx.stroke();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, well, 0, TAU);
  ctx.clip();

  const wellGlow = ctx.createRadialGradient(cx, cy, well * 0.08, cx, cy, well);
  wellGlow.addColorStop(0, C.deep);
  wellGlow.addColorStop(1, C.abyss);
  ctx.fillStyle = wellGlow;
  ctx.fillRect(0, 0, size, size);

  drawRangeRings(ctx, cx, cy, well, pxPerUnit);
  drawCrosshairs(ctx, cx, cy, well);
  if (!reducedMotion) drawScanlines(ctx, cx, cy, well, nowMs);
  drawSweep(ctx, cx, cy, well, nowMs, reducedMotion);
  drawPingRing(ctx, view, cx, cy, pxPerUnit, well);
  drawMarkers(ctx, view.markers, boat, cx, cy, pxPerUnit, well);
  drawContacts(ctx, view.contacts, boat, cx, cy, pxPerUnit, well, elapsed, nowMs);
  drawRipples(ctx, ripples, boat, cx, cy, pxPerUnit, nowMs);
  drawBoat(ctx, cx, cy, view.boat.heading, size);

  ctx.restore();

  // Inner rim + cardinals sit on top of the clip so they stay crisp.
  ctx.beginPath();
  ctx.arc(cx, cy, well, 0, TAU);
  ctx.strokeStyle = "rgba(139, 227, 239, 0.55)";
  ctx.lineWidth = Math.max(1.5, size * 0.008);
  ctx.stroke();

  drawCardinals(ctx, cx, cy, well, size);
}

function drawRangeRings(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  well: number,
  pxPerUnit: number,
): void {
  const rings = [0.25, 0.5, 0.75, 1];
  for (const t of rings) {
    const r = SONAR.pingRange * t * pxPerUnit;
    if (r > well) continue;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = t === 1 ? "rgba(139, 227, 239, 0.38)" : "rgba(139, 227, 239, 0.14)";
    ctx.lineWidth = t === 1 ? 1.6 : 1;
    ctx.stroke();
  }
}

function drawCrosshairs(ctx: CanvasRenderingContext2D, cx: number, cy: number, well: number): void {
  ctx.strokeStyle = "rgba(139, 227, 239, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy - well);
  ctx.lineTo(cx, cy + well);
  ctx.moveTo(cx - well, cy);
  ctx.lineTo(cx + well, cy);
  ctx.stroke();
}

function drawScanlines(ctx: CanvasRenderingContext2D, cx: number, cy: number, well: number, nowMs: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, well, 0, TAU);
  ctx.clip();
  ctx.strokeStyle = "rgba(139, 227, 239, 0.035)";
  ctx.lineWidth = 1;
  const drift = (nowMs / 80) % 6;
  for (let y = cy - well + drift; y < cy + well; y += 6) {
    ctx.beginPath();
    ctx.moveTo(cx - well, y);
    ctx.lineTo(cx + well, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSweep(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  well: number,
  nowMs: number,
  reducedMotion: boolean,
): void {
  const angle = reducedMotion ? 0 : ((nowMs / SWEEP_MS) * TAU) % TAU;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  const trail = ctx.createRadialGradient(0, 0, 0, 0, 0, well);
  trail.addColorStop(0, "rgba(139, 227, 239, 0.22)");
  trail.addColorStop(1, "rgba(139, 227, 239, 0)");
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, well, -Math.PI / 2 - 0.9, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  const blade = ctx.createRadialGradient(0, 0, 0, 0, 0, well);
  blade.addColorStop(0, "rgba(139, 227, 239, 0.4)");
  blade.addColorStop(1, "rgba(139, 227, 239, 0)");
  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, well, -Math.PI / 2, -Math.PI / 2 + 0.42);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(186, 247, 255, 0.9)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -well);
  ctx.stroke();
  ctx.restore();
}

function drawPingRing(
  ctx: CanvasRenderingContext2D,
  view: SonarView,
  cx: number,
  cy: number,
  pxPerUnit: number,
  well: number,
): void {
  const origin = view.lastPingOrigin;
  const at = view.lastPingAtMs;
  if (!origin || at === null) return;
  const age = view.mission.elapsedMs - at;
  if (age < 0 || age > SONAR.sweepDurationMs) return;

  const t = age / SONAR.sweepDurationMs;
  const screen = worldToScreen(origin, view.boat.position, cx, cy, pxPerUnit);
  const r = SONAR.pingRange * t * pxPerUnit;
  if (r < 1) return;

  ctx.beginPath();
  ctx.arc(screen.x, screen.y, r, 0, TAU);
  ctx.strokeStyle = `rgba(139, 227, 239, ${0.85 * (1 - t)})`;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(screen.x, screen.y, Math.min(well, r * 0.92), 0, TAU);
  ctx.strokeStyle = `rgba(76, 201, 192, ${0.2 * (1 - t)})`;
  ctx.lineWidth = 8;
  ctx.stroke();
}

function drawContacts(
  ctx: CanvasRenderingContext2D,
  contacts: readonly SonarContact[],
  boat: Vec2,
  cx: number,
  cy: number,
  pxPerUnit: number,
  well: number,
  elapsedMs: number,
  nowMs: number,
): void {
  for (const contact of contacts) {
    const screen = worldToScreen(contact.position, boat, cx, cy, pxPerUnit);
    const dx = screen.x - cx;
    const dy = screen.y - cy;
    if (dx * dx + dy * dy > well * well * 1.02) continue;

    const fade = contactFade(contact, elapsedMs);
    const pulse = 0.7 + 0.3 * Math.sin(nowMs / 280 + contact.position.x * 20);
    const color = kindColor(contact.kind);
    const radius = Math.max(3.5, contact.radius * pxPerUnit * 0.22);

    ctx.save();
    ctx.globalAlpha = fade;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 * pulse;

    ctx.beginPath();
    ctx.arc(screen.x, screen.y, radius, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = fade * 0.35;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, Math.max(radius * 2.2, contact.radius * pxPerUnit * 0.45), 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function drawMarkers(
  ctx: CanvasRenderingContext2D,
  markers: readonly Marker[],
  boat: Vec2,
  cx: number,
  cy: number,
  pxPerUnit: number,
  well: number,
): void {
  for (const marker of markers) {
    if (marker.kind !== "hazard") continue;
    const screen = worldToScreen(marker.position, boat, cx, cy, pxPerUnit);
    const dx = screen.x - cx;
    const dy = screen.y - cy;
    if (dx * dx + dy * dy > well * well) continue;

    const arm = 6;
    ctx.strokeStyle = C.hazard;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(screen.x - arm, screen.y - arm);
    ctx.lineTo(screen.x + arm, screen.y + arm);
    ctx.moveTo(screen.x + arm, screen.y - arm);
    ctx.lineTo(screen.x - arm, screen.y + arm);
    ctx.stroke();
  }
}

function drawRipples(
  ctx: CanvasRenderingContext2D,
  ripples: readonly ScopeRipple[],
  boat: Vec2,
  cx: number,
  cy: number,
  pxPerUnit: number,
  nowMs: number,
): void {
  for (const ripple of ripples) {
    const age = nowMs - ripple.bornMs;
    if (age < 0 || age > 420) continue;
    const t = age / 420;
    const screen = worldToScreen(ripple.position, boat, cx, cy, pxPerUnit);
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, 6 + t * 22, 0, TAU);
    ctx.strokeStyle = `rgba(232, 65, 47, ${0.85 * (1 - t)})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBoat(ctx: CanvasRenderingContext2D, cx: number, cy: number, heading: number, size: number): void {
  const scale = size / 320;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(heading);
  ctx.fillStyle = C.teal;
  ctx.strokeStyle = C.foam;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, -11 * scale);
  ctx.lineTo(7 * scale, 9 * scale);
  ctx.lineTo(0, 5 * scale);
  ctx.lineTo(-7 * scale, 9 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawCardinals(ctx: CanvasRenderingContext2D, cx: number, cy: number, well: number, size: number): void {
  const font = `${Math.max(10, size * 0.038)}px ui-monospace, monospace`;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = C.mist;
  const inset = well - size * 0.055;
  ctx.fillText("N", cx, cy - inset);
  ctx.fillText("S", cx, cy + inset);
  ctx.fillText("W", cx - inset, cy);
  ctx.fillText("E", cx + inset, cy);
}
