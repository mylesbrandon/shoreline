/**
 * Pure canvas drawing helpers: Red Flag Day beach art (sunny water, sandbars, rocks, jellyfish,
 * a rescue jet ski and a tourist on a giant inflatable seagull).
 * All inputs are in normalized map units; `size` is the canvas side length in CSS pixels.
 * Heading convention: 0 = north (up), clockwise positive — matches src/game/types.ts.
 * Hazard kinds keep their code names: reef = sandbar, rock = rocks, debris = jellyfish bloom.
 */
import type { BoatState, Hazard, Marker, RescueTarget, Vec2 } from "@/game/types";
import { BOAT } from "@/game/config";
import { PALETTE } from "./palette";

export interface OceanScene {
  boat: BoatState;
  /** Optional versus deck colour; absent preserves the original co-op drawing. */
  boatTint?: string;
  hazards: Hazard[];
  markers: Marker[];
  target?: RescueTarget | null;
  current?: Vec2;
  stormIntensity?: number;
  /**
   * Boat-centred, north-up window instead of the whole map (the Driver's view). `span` is the
   * window width in map units; `lookout` is the clear radius around the ski (glare beyond it).
   */
  window?: { span: number; lookout: number };
}

/** Map → screen transform: screen = (map - origin) * scale. */
interface Camera {
  scale: number;
  ox: number;
  oy: number;
}

const toScreen = (cam: Camera, p: Vec2) => ({ x: (p.x - cam.ox) * cam.scale, y: (p.y - cam.oy) * cam.scale });

function cameraFor(size: number, scene: OceanScene): Camera {
  if (!scene.window) return { scale: size, ox: 0, oy: 0 };
  const half = scene.window.span / 2;
  return { scale: size / scene.window.span, ox: scene.boat.position.x - half, oy: scene.boat.position.y - half };
}

/** Where the sand starts on the full-map view (the shore along the bottom edge). */
const SHORE_Y = 0.965;

export function drawOcean(ctx: CanvasRenderingContext2D, size: number, cam: Camera, timeMs: number, chop = 0.3, grid = true): void {
  // Deep water to the north (out to sea), turquoise shallows toward the shore (south).
  const top = toScreen(cam, { x: 0, y: 0 }).y;
  const bottom = toScreen(cam, { x: 0, y: 1 }).y;
  const g = ctx.createLinearGradient(0, top, 0, bottom);
  g.addColorStop(0, PALETTE.deep);
  g.addColorStop(0.7, "#2a9bb0");
  g.addColorStop(1, PALETTE.shallow);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Rolling foam lines moving toward the shore: the "wave sets" feel, ambience only.
  const t = timeMs / 1000;
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + chop * 0.1})`;
  ctx.lineWidth = 1.5;
  const rows = 14;
  for (let i = 0; i < rows; i++) {
    const y0 = (((i / rows) * size + t * 10) % (size + 20)) - 10;
    ctx.beginPath();
    for (let x = 0; x <= size; x += 10) {
      const y = y0 + Math.sin(x / (34 + i * 2) + t * (0.7 + chop)) * (2 + chop * 4);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Sun glints: deterministic sparkles, never simulation state.
  ctx.fillStyle = "rgba(255, 250, 225, 0.75)";
  for (let i = 0; i < 26; i++) {
    const x = (i * 97.3 + t * 3) % size;
    const y = (i * 61.9 + Math.sin(i) * 40) % size;
    const twinkle = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
    ctx.globalAlpha = twinkle * 0.8;
    ctx.fillRect(x, y, 2 + twinkle * 2, 1.2);
  }
  ctx.globalAlpha = 1;

  // Faint 4x4 grid (matches Tower Radio sectors). Not in the Driver's window: it would give away position.
  if (!grid) return;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
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
  ctx.fillStyle = PALETTE.foam;
  ctx.font = "9px monospace";
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 4; i++) {
    ctx.fillText("ABCD"[i]!, (size * (i + 0.5)) / 4, 14);
    ctx.fillText(String(i + 1), 8, (size * (i + 0.5)) / 4);
  }
  ctx.globalAlpha = 1;
}

/** Sand strip along the bottom with Tower 4 and the red flag (spectator / full-map view). */
function drawShore(ctx: CanvasRenderingContext2D, size: number, cam: Camera, timeMs: number): void {
  const y = toScreen(cam, { x: 0, y: SHORE_Y }).y;
  ctx.fillStyle = PALETTE.sand;
  ctx.beginPath();
  ctx.moveTo(0, y);
  for (let x = 0; x <= size; x += 12) ctx.lineTo(x, y + Math.sin(x / 30 + timeMs / 900) * 2);
  ctx.lineTo(size, size);
  ctx.lineTo(0, size);
  ctx.closePath();
  ctx.fill();
  // Foam where the water meets the sand.
  ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = 0; x <= size; x += 12) {
    const yy = y + Math.sin(x / 30 + timeMs / 900) * 2;
    if (x === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  }
  ctx.stroke();

  // Tower 4: a little hut on stilts, with a red flag snapping in the wind.
  const tx = size * 0.82;
  const ty = y + (size - y) * 0.15;
  const h = Math.max(10, (size - y) * 0.7);
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(tx - h * 0.4, ty + h);
  ctx.lineTo(tx - h * 0.3, ty + h * 0.35);
  ctx.moveTo(tx + h * 0.4, ty + h);
  ctx.lineTo(tx + h * 0.3, ty + h * 0.35);
  ctx.stroke();
  ctx.fillStyle = PALETTE.hazard;
  ctx.fillRect(tx - h * 0.45, ty, h * 0.9, h * 0.4);
  ctx.fillStyle = PALETTE.foam;
  ctx.font = `bold ${Math.max(7, h * 0.28)}px monospace`;
  ctx.textAlign = "center";
  ctx.fillText("4", tx, ty + h * 0.32);
  ctx.textAlign = "start";
  const fx = tx + h * 0.7;
  ctx.strokeStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.moveTo(fx, ty + h);
  ctx.lineTo(fx, ty - h * 0.5);
  ctx.stroke();
  const wave = Math.sin(timeMs / 180) * h * 0.08;
  ctx.fillStyle = PALETTE.hazard;
  ctx.beginPath();
  ctx.moveTo(fx, ty - h * 0.5);
  ctx.lineTo(fx + h * 0.6, ty - h * 0.35 + wave);
  ctx.lineTo(fx, ty - h * 0.15);
  ctx.closePath();
  ctx.fill();
}

export function drawHazard(ctx: CanvasRenderingContext2D, cam: Camera, h: Hazard, timeMs: number): void {
  const { x, y } = toScreen(cam, h.position);
  const r = h.radius * cam.scale;
  const t = timeMs / 1000;

  if (h.kind === "reef") {
    // Sandbar: pale sand with breaking white foam around it.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -t * 8;
    ctx.beginPath();
    ctx.ellipse(x, y, r + 4, (r + 4) * 0.8, 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = PALETTE.sand;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.78, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(18, 50, 74, 0.12)";
    ctx.beginPath();
    ctx.ellipse(x + r * 0.2, y + r * 0.15, r * 0.55, r * 0.35, 0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (h.kind === "rock") {
    // Rocks: a few grey boulders with a foam ring.
    ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    const boulders = [
      [0, 0, 0.75],
      [-0.45, 0.35, 0.45],
      [0.5, 0.3, 0.4],
    ] as const;
    for (const [bx, by, br] of boulders) {
      ctx.fillStyle = "#6f7b85";
      ctx.beginPath();
      ctx.arc(x + bx * r, y + by * r, br * r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
      ctx.beginPath();
      ctx.arc(x + bx * r - br * r * 0.3, y + by * r - br * r * 0.3, br * r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  // Jellyfish bloom: translucent pink bells with trailing tentacles, gently pulsing.
  const bells = [
    [0, 0],
    [-0.5, 0.35],
    [0.45, -0.4],
  ] as const;
  for (const [i, [bx, by]] of bells.entries()) {
    const pulse = 1 + 0.08 * Math.sin(t * 2.5 + i);
    const cx = x + bx * r;
    const cy = y + by * r;
    const br = r * 0.42 * pulse;
    ctx.strokeStyle = "rgba(244, 143, 177, 0.6)";
    ctx.lineWidth = 1.2;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(cx + k * br * 0.5, cy);
      ctx.quadraticCurveTo(cx + k * br * 0.5 + Math.sin(t * 3 + k) * 3, cy + br, cx + k * br * 0.4, cy + br * 1.7);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(244, 143, 177, 0.55)";
    ctx.beginPath();
    ctx.arc(cx, cy, br, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawMarker(ctx: CanvasRenderingContext2D, cam: Camera, m: Marker): void {
  const { x, y } = toScreen(cam, m.position);
  if (m.kind === "hazard") {
    // Drone's mark: red X on a white disc, readable on any water colour.
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.hazard;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 6);
    ctx.lineTo(x + 6, y + 6);
    ctx.moveTo(x + 6, y - 6);
    ctx.lineTo(x - 6, y + 6);
    ctx.stroke();
    return;
  }
  // Tower Radio's pin (and waypoints): a yellow buoy.
  ctx.fillStyle = m.kind === "target_guess" ? PALETTE.amber : PALETTE.foam;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = PALETTE.hazard;
  ctx.fillRect(x - 9, y - 2, 18, 4);
}

/** The Gull: a tourist on a giant inflatable seagull, on a yellow float ring. */
export function drawTarget(ctx: CanvasRenderingContext2D, cam: Camera, target: RescueTarget, timeMs: number): void {
  const { x, y } = toScreen(cam, target.position);
  const r = target.rescueRadius * cam.scale;
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = 2;
  for (let i = 0; i < 2; i++) {
    const k = ((timeMs / 1200 + i / 2) % 1) * 1.6;
    ctx.globalAlpha = 1 - k / 1.6;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.6 + k), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const s = Math.max(8, r * 0.45);
  const bob = Math.sin(timeMs / 500) * 1.5;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.fillStyle = PALETTE.amber;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.3, s * 1.2, s * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.foam;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(s * 0.85, -s * 0.5, s * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ff9f1c";
  ctx.beginPath();
  ctx.moveTo(s * 1.15, -s * 0.55);
  ctx.lineTo(s * 1.6, -s * 0.45);
  ctx.lineTo(s * 1.15, -s * 0.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Rescue jet ski: red and white, pointing along its heading, with a white wake. */
export function drawBoat(ctx: CanvasRenderingContext2D, size: number, cam: Camera, boat: BoatState, boatTint?: string): void {
  const { x, y } = toScreen(cam, boat.position);
  const s = Math.max(10, size * 0.028);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(boat.heading);

  const wake = Math.min(1, boat.speed / BOAT.maxSpeed);
  if (wake > 0.05) {
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * wake})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.35, s * 0.9);
    ctx.lineTo(-s * 1.1, s * (1.8 + 2 * wake));
    ctx.moveTo(s * 0.35, s * 0.9);
    ctx.lineTo(s * 1.1, s * (1.8 + 2 * wake));
    ctx.stroke();
  }

  ctx.shadowColor = "rgba(18, 50, 74, 0.45)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = PALETTE.foam;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.15);
  ctx.quadraticCurveTo(s * 0.6, -s * 0.3, s * 0.45, s * 0.95);
  ctx.lineTo(-s * 0.45, s * 0.95);
  ctx.quadraticCurveTo(-s * 0.6, -s * 0.3, 0, -s * 1.15);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Default red deck is unchanged for co-op.
  ctx.fillStyle = boatTint ?? PALETTE.hazard;
  ctx.beginPath();
  ctx.moveTo(0, -s * 1.0);
  ctx.quadraticCurveTo(s * 0.3, -s * 0.4, s * 0.25, s * 0.2);
  ctx.lineTo(-s * 0.25, s * 0.2);
  ctx.quadraticCurveTo(-s * 0.3, -s * 0.4, 0, -s * 1.0);
  ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.fillRect(-s * 0.2, s * 0.25, s * 0.4, s * 0.55);
  ctx.fillRect(-s * 0.4, -s * 0.15, s * 0.8, s * 0.12);
  ctx.restore();
}

export function drawCurrentArrow(ctx: CanvasRenderingContext2D, size: number, current: Vec2): void {
  const mag = Math.hypot(current.x, current.y);
  if (mag < 1e-6) return;
  const cx = size - 36;
  const cy = 144;
  const len = Math.min(24, 8 + (mag / 0.03) * 16);
  const ux = current.x / mag;
  const uy = current.y / mag;
  ctx.strokeStyle = PALETTE.foam;
  ctx.fillStyle = PALETTE.foam;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, Math.PI * 2);
  ctx.globalAlpha = 0.35;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(cx - ux * len, cy - uy * len);
  ctx.lineTo(cx + ux * len, cy + uy * len);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + ux * len, cy + uy * len, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  ctx.fillText("RIP / SETS", cx, cy + 38);
  ctx.textAlign = "start";
}

/** Sun glare beyond the lookout circle, and solid colour beyond the map edge (sand at the shore). */
function drawGlare(ctx: CanvasRenderingContext2D, size: number, cam: Camera, lookout: number): void {
  const tl = toScreen(cam, { x: 0, y: 0 });
  const br = toScreen(cam, { x: 1, y: 1 });
  ctx.fillStyle = "rgba(8, 48, 74, 0.92)";
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.rect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.fill("evenodd");
  if (br.y < size) {
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, br.y, size, size - br.y);
  }

  const r = lookout * cam.scale;
  const g = ctx.createRadialGradient(size / 2, size / 2, r * 0.8, size / 2, size / 2, r * 1.3);
  g.addColorStop(0, "rgba(255, 250, 230, 0)");
  g.addColorStop(1, "rgba(255, 250, 230, 0.93)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** North marker: the window is north-up, so this is the only orientation cue. */
function drawCompass(ctx: CanvasRenderingContext2D): void {
  const cx = 28;
  const cy = 28;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.hazard;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 12);
  ctx.lineTo(cx + 5, cy);
  ctx.lineTo(cx - 5, cy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = PALETTE.ink;
  ctx.font = "bold 10px monospace";
  ctx.textAlign = "center";
  ctx.fillText("N", cx, cy + 12);
  ctx.textAlign = "start";
}

/** When a marker is off-screen, an arrow on the window edge points the way to it. */
function drawEdgeArrow(ctx: CanvasRenderingContext2D, size: number, cam: Camera, m: Marker): void {
  const p = toScreen(cam, m.position);
  const inset = 22;
  if (p.x >= inset && p.x <= size - inset && p.y >= inset && p.y <= size - inset) return;
  const c = size / 2;
  const dx = p.x - c;
  const dy = p.y - c;
  // Scale the direction until it touches the inset square around the window.
  const k = (c - inset) / Math.max(Math.abs(dx), Math.abs(dy));
  ctx.save();
  ctx.translate(c + dx * k, c + dy * k);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.fillStyle = PALETTE.amber;
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(-8, -10);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawScene(ctx: CanvasRenderingContext2D, size: number, scene: OceanScene, timeMs: number): void {
  const cam = cameraFor(size, scene);
  drawOcean(ctx, size, cam, timeMs, scene.stormIntensity ?? 0.3, !scene.window);
  if (!scene.window) drawShore(ctx, size, cam, timeMs);
  for (const h of scene.hazards) drawHazard(ctx, cam, h, timeMs);
  for (const m of scene.markers) drawMarker(ctx, cam, m);
  if (scene.target) drawTarget(ctx, cam, scene.target, timeMs);
  if (scene.window) drawGlare(ctx, size, cam, scene.window.lookout);
  drawBoat(ctx, size, cam, scene.boat, scene.boatTint);
  if (scene.window) {
    for (const m of scene.markers) if (m.kind === "target_guess") drawEdgeArrow(ctx, size, cam, m);
    drawCompass(ctx);
  }
  if (scene.current) drawCurrentArrow(ctx, size, scene.current);
}
