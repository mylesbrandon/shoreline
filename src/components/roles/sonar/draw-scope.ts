/**
 * Boat-centered PPI drawing for the sonar station. OWNER: Developer 4.
 * Renders only what the view already revealed — no ping rules, no hidden hazards.
 *
 * Colours come from the shared canvas palette (components/ocean/palette.ts).
 */
import { SONAR } from "@/game/config";
import type { Marker, SonarContact, SonarView, Vec2 } from "@/game/types";
import { hazardClass } from "@/game/versus/contract";
import { PALETTE } from "@/components/ocean/palette";
import { SCOPE_DISPLAY_RANGE } from "./scope-coords";

// One palette for every canvas (the old ownership split is gone), so the drone camera re-themes with the rest.
const C = PALETTE;
/** Pink for jelly contacts — also in PALETTE.jelly; kept local for dashed stroke alpha. */
const JELLY = C.jelly;
const LAND_FILL = C.sand;
const LAND_STROKE = "#c4a574";
const PERSON_RING = C.amber;

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
  drawContactLegend(ctx, size);
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
    if (contact.kind === "gull") {
      drawPersonContact(ctx, screen, contact.radius * pxPerUnit, fade, pulse);
      continue;
    }
    // versus-2 classes: reef/rock → land (aground), debris → jelly (hull damage). Shape + colour for colour-blind.
    if (hazardClass(contact.kind) === "jelly") {
      drawJellyContact(ctx, screen, contact.radius * pxPerUnit, fade, pulse);
    } else {
      drawLandContact(ctx, screen, contact.radius * pxPerUnit, fade, contact.kind === "rock");
    }
  }
}

/** LAND: filled sand/stone blob with a solid outline (unmistakable without colour alone). */
function drawLandContact(ctx: CanvasRenderingContext2D, at: Vec2, rPx: number, fade: number, rocky: boolean): void {
  const s = Math.max(5, rPx * 0.35);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(at.x, at.y);
  ctx.beginPath();
  // Irregular stone/sandbar silhouette (not a circle — distinct from jelly).
  ctx.moveTo(-s * 1.1, -s * 0.2);
  ctx.quadraticCurveTo(-s * 0.4, -s * 1.15, s * 0.35, -s * 0.95);
  ctx.quadraticCurveTo(s * 1.25, -s * 0.35, s * 1.05, s * 0.45);
  ctx.quadraticCurveTo(s * 0.2, s * 1.2, -s * 0.55, s * 0.85);
  ctx.quadraticCurveTo(-s * 1.3, s * 0.25, -s * 1.1, -s * 0.2);
  ctx.closePath();
  ctx.fillStyle = rocky ? "#d4b896" : LAND_FILL;
  ctx.fill();
  ctx.strokeStyle = LAND_STROKE;
  ctx.lineWidth = 2.2;
  ctx.setLineDash([]);
  ctx.stroke();
  ctx.restore();
}

/** JELLY: pink body, dashed outline, gentle pulse. */
function drawJellyContact(ctx: CanvasRenderingContext2D, at: Vec2, rPx: number, fade: number, pulse: number): void {
  const r = Math.max(5, rPx * 0.28);
  ctx.save();
  ctx.globalAlpha = fade * (0.75 + 0.25 * pulse);
  ctx.fillStyle = JELLY;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y - r * 0.15, r * 1.15, r * 0.85, 0, 0, TAU);
  ctx.fill();
  // Tentacle hints (shape cue).
  ctx.strokeStyle = JELLY;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(at.x - r * 0.5, at.y + r * 0.4);
  ctx.quadraticCurveTo(at.x - r * 0.6, at.y + r * 1.4, at.x - r * 0.2, at.y + r * 1.6);
  ctx.moveTo(at.x + r * 0.5, at.y + r * 0.4);
  ctx.quadraticCurveTo(at.x + r * 0.6, at.y + r * 1.4, at.x + r * 0.2, at.y + r * 1.6);
  ctx.stroke();
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = "#ffb6c8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(at.x, at.y - r * 0.15, r * 1.25, r * 0.95, 0, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** PERSON: yellow ring + stick figure, labelled PERSON (the rescued swimmer / "gull" contact). */
function drawPersonContact(ctx: CanvasRenderingContext2D, at: Vec2, ringPx: number, fade: number, pulse: number): void {
  const ring = Math.max(10, ringPx);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = PERSON_RING;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([]);
  ctx.shadowColor = PERSON_RING;
  ctx.shadowBlur = 10 * pulse;
  ctx.beginPath();
  ctx.arc(at.x, at.y, ring, 0, TAU);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Stick person glyph.
  ctx.fillStyle = C.foam;
  ctx.strokeStyle = C.foam;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(at.x, at.y - 3, 2.4, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(at.x, at.y - 0.5);
  ctx.lineTo(at.x, at.y + 4);
  ctx.moveTo(at.x - 3.5, at.y + 1);
  ctx.lineTo(at.x + 3.5, at.y + 1);
  ctx.moveTo(at.x, at.y + 4);
  ctx.lineTo(at.x - 2.5, at.y + 7.5);
  ctx.moveTo(at.x, at.y + 4);
  ctx.lineTo(at.x + 2.5, at.y + 7.5);
  ctx.stroke();
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = PERSON_RING;
  ctx.fillText("PERSON", at.x, at.y - ring - 4);
  ctx.textAlign = "start";
  ctx.restore();
}

function drawContactLegend(ctx: CanvasRenderingContext2D, size: number): void {
  const font = `${Math.max(8, size * 0.028)}px ui-monospace, monospace`;
  ctx.font = font;
  ctx.textBaseline = "middle";
  const y = size - size * 0.045;
  const items: { label: string; draw: (x: number, y: number) => void }[] = [
    {
      label: "LAND",
      draw: (x, y0) => {
        ctx.fillStyle = LAND_FILL;
        ctx.strokeStyle = LAND_STROKE;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 5, y0);
        ctx.lineTo(x - 2, y0 - 4);
        ctx.lineTo(x + 5, y0 - 2);
        ctx.lineTo(x + 3, y0 + 4);
        ctx.lineTo(x - 4, y0 + 3);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      },
    },
    {
      label: "JELLY",
      draw: (x, y0) => {
        ctx.fillStyle = JELLY;
        ctx.setLineDash([2, 2]);
        ctx.strokeStyle = "#ffb6c8";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y0, 4, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
      },
    },
    {
      label: "PERSON",
      draw: (x, y0) => {
        ctx.strokeStyle = PERSON_RING;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y0, 4.5, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = C.foam;
        ctx.beginPath();
        ctx.arc(x, y0 - 1, 1.2, 0, TAU);
        ctx.fill();
      },
    },
  ];
  const gap = size * 0.28;
  let x = size * 0.12;
  for (const item of items) {
    item.draw(x, y);
    ctx.fillStyle = C.mist;
    ctx.textAlign = "left";
    ctx.fillText(item.label, x + 8, y);
    x += gap;
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
