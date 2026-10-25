/**
 * Pure canvas drawing helpers: Red Flag Day beach art (sunny water, sandbars, rocks, jellyfish,
 * a rescue jet ski, with opt-in person-in-the-water art for versus).
 * All inputs are in normalized map units; `size` is the canvas side length in CSS pixels.
 * Heading convention: 0 = north (up), clockwise positive — matches src/game/types.ts.
 * Hazard kinds keep their code names: reef = sandbar, rock = rocks, debris = jellyfish bloom.
 */
import type { BoatState, Hazard, Marker, RescueTarget, Vec2 } from "@/game/types";
import { hazardClass } from "@/game/versus/contract";
import { BOAT } from "@/game/config";
import { PALETTE } from "./palette";
import { freshNavigatorMark, waterFlecks } from "./versus/scene-details";

export interface SceneBoat {
  id: string;
  boat: BoatState;
  tint: string;
  opacity?: number;
  label?: string;
}
export interface OceanScene {
  boat: BoatState;
  /** Opt-in playtest visuals: co-op uses its existing art. */
  versus?: boolean;
  /** Optional versus deck colour; absent preserves the original co-op drawing. */
  boatTint?: string;
  /** Versus-only secondary boats; the Driver supplies only an engine-filtered rival. */
  additionalBoats?: SceneBoat[];
  /** Mission time for fresh Navigator marks, never a client wall clock. */
  elapsedMs?: number;
  /** Recent received positions for a cosmetic wake; no client simulation. */
  wakeTrail?: Vec2[];
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

/** Legacy co-op target art, retained to preserve existing co-op screens. */
function drawCoopTarget(ctx: CanvasRenderingContext2D, cam: Camera, target: RescueTarget, timeMs: number): void {
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
function drawGlare(ctx: CanvasRenderingContext2D, size: number, cam: Camera, lookout: number, dark = false): void {
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
  if (dark) {
    // Versus: vision fades to dark water instead of white sun glare (playtest r4: the white wall
    // looked unnatural). Same clear radius, a softer three-stop falloff.
    const v = ctx.createRadialGradient(size / 2, size / 2, r * 0.75, size / 2, size / 2, r * 1.4);
    v.addColorStop(0, "rgba(3, 16, 26, 0)");
    v.addColorStop(0.5, "rgba(3, 16, 26, 0.6)");
    v.addColorStop(1, "rgba(3, 16, 26, 0.95)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, size, size);
    return;
  }
  const g = ctx.createRadialGradient(size / 2, size / 2, r * 0.8, size / 2, size / 2, r * 1.3);
  g.addColorStop(0, "rgba(255, 250, 230, 0)");
  g.addColorStop(1, "rgba(255, 250, 230, 0.93)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
}

/** North marker: the window is north-up, so this is the only orientation cue. */
function drawCompass(ctx: CanvasRenderingContext2D, seeThrough = false): void {
  const cx = 28;
  const cy = 28;
  if (seeThrough) {
    // Versus (playtest r5): an outline instead of a solid disc, drawn under the marks, so a warning
    // marker in the top-left corner is never hidden behind the north pointer.
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = PALETTE.hazard;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 12);
    ctx.lineTo(cx + 5, cy);
    ctx.lineTo(cx - 5, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.foam;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("N", cx, cy + 12);
    ctx.restore();
    return;
  }
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
  if (scene.versus && scene.window) drawWorldWater(ctx, size, cam, scene.window.span, timeMs);
  if (!scene.window) {
    if (scene.versus) drawDock(ctx, size, cam);
    else drawShore(ctx, size, cam, timeMs);
  }
  if (scene.versus && scene.wakeTrail) drawWakeTrail(ctx, cam, scene.wakeTrail, scene.boat.speed);
  for (const h of scene.hazards) {
    if (scene.versus && hazardClass(h.kind) === "land") drawLand(ctx, cam, h);
    else drawHazard(ctx, cam, h, timeMs);
  }
  if (!scene.versus) for (const m of scene.markers) drawMarker(ctx, cam, m);
  // Versus Driver window: the person goes ABOVE the glare. The engine sends them once their rescue
  // ring reaches the lookout circle, i.e. often just outside the clear area, where the 93% glare
  // would hide them until the instant of pickup.
  const personOverGlare = scene.versus && scene.window;
  if (scene.target && !personOverGlare) (scene.versus ? drawTarget : drawCoopTarget)(ctx, cam, scene.target, timeMs);
  if (scene.window) drawGlare(ctx, size, cam, scene.window.lookout, scene.versus);
  // Versus: the north pointer goes under the marks and boats (see drawCompass).
  if (scene.window && scene.versus) drawCompass(ctx, true);
  if (scene.target && personOverGlare) drawTarget(ctx, cam, scene.target, timeMs);
  if (scene.versus) {
    for (const m of scene.markers) drawNavigatorMark(ctx, size, cam, m, scene.elapsedMs ?? -1, timeMs, Boolean(scene.window));
    for (const extra of scene.additionalBoats ?? []) {
      ctx.save();
      ctx.globalAlpha = extra.opacity ?? 1;
      drawBoat(ctx, size, cam, extra.boat, extra.tint);
      if (extra.label) {
        const p = toScreen(cam, extra.boat.position);
        ctx.fillStyle = extra.tint; ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 3; ctx.textAlign = "center"; ctx.font = "bold 9px monospace";
        ctx.strokeText(extra.label, p.x, p.y - 19);ctx.fillText(extra.label, p.x, p.y - 19);
      }
      ctx.restore();
    }
    drawSpeedStreaks(ctx, size, cam, scene.boat, timeMs);
  }
  drawBoat(ctx, size, cam, scene.boat, scene.boatTint);
  if (scene.window) {
    for (const m of scene.markers) if (m.kind === "target_guess") drawEdgeArrow(ctx, size, cam, m);
    if (!scene.versus) drawCompass(ctx);
  }
  if (scene.current) drawCurrentArrow(ctx, size, scene.current);
}

/** Versus land has a continuous shoreline; jellyfish keep the translucent pink renderer. */
function drawLand(ctx: CanvasRenderingContext2D, cam: Camera, hazard: Hazard): void {
  const { x, y } = toScreen(cam, hazard.position);
  const r = hazard.radius * cam.scale;
  ctx.save();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hazard.kind === "reef" ? "#806530" : "#293c49";
  ctx.fillStyle = hazard.kind === "reef" ? PALETTE.sand : "#80909b";
  ctx.beginPath();
  if (hazard.kind === "reef") ctx.ellipse(x, y, r, r * 0.78, 0.4, 0, Math.PI * 2);
  else {
    for (let i = 0; i < 8; i++) {
      const angle = i / 8 * Math.PI * 2;
      const radius = r * (i % 2 ? .82 : 1);
      if (!i) ctx.moveTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      else ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
    }
    ctx.closePath();
  }
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.3)";
  ctx.beginPath();ctx.ellipse(x-r*.2,y-r*.2,r*.45,r*.2,.4,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

/** A waving person in an orange life ring; size remains legible in the small Driver window. */
export function drawTarget(ctx: CanvasRenderingContext2D, cam: Camera, target: RescueTarget, timeMs: number): void {
  const { x, y } = toScreen(cam, target.position);
  const s = Math.max(8, Math.min(14, target.rescueRadius * cam.scale * .45));
  ctx.save();ctx.translate(x,y);
  ctx.strokeStyle = "rgba(255,255,255,.7)";ctx.lineWidth=1.5;
  ctx.beginPath();ctx.ellipse(0,s*.5,s*1.5,s*.7,0,0,Math.PI*2);ctx.stroke();
  ctx.fillStyle = "#ff6f32";ctx.strokeStyle=PALETTE.ink;ctx.lineWidth=2;
  ctx.beginPath();ctx.ellipse(0,s*.25,s*1.15,s*.7,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=PALETTE.deep;
  ctx.beginPath();ctx.ellipse(0,s*.25,s*.55,s*.3,0,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#ffdec0";ctx.lineWidth=Math.max(3,s*.28);ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(-s*.35,-s*.15);ctx.lineTo(-s*.85,-s*.65);ctx.stroke();
  const wave = Math.sin(timeMs/200)*s*.18;
  ctx.beginPath();ctx.moveTo(s*.2,-s*.2);ctx.lineTo(s*.7,-s*.8);ctx.lineTo(s*.75+wave,-s*1.4);ctx.stroke();
  ctx.fillStyle="#ffdec0";ctx.strokeStyle=PALETTE.ink;ctx.lineWidth=1.3;
  ctx.beginPath();ctx.arc(0,-s*.65,s*.4,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.restore();
}

// Reuse world cells while the camera remains in the same grid bounds; bounded for long sessions.
const waterCache = new Map<string, ReturnType<typeof waterFlecks>>();
/** A small, bounded grid: positions depend on map cells, never on frame or camera identity. */
function drawWorldWater(ctx: CanvasRenderingContext2D, size: number, cam: Camera, span: number, timeMs: number): void {
  const spacing=.014;
  const key=[Math.floor(cam.ox/spacing),Math.floor(cam.oy/spacing),Math.ceil((cam.ox+span)/spacing),Math.ceil((cam.oy+span)/spacing)].join(":");
  let flecks=waterCache.get(key);
  if(!flecks) {
    flecks=waterFlecks({x:cam.ox,y:cam.oy},span);
    if(waterCache.size>=32) waterCache.delete(waterCache.keys().next().value!);
    waterCache.set(key,flecks);
  }
  ctx.save();ctx.strokeStyle="rgba(255,255,255,.52)";ctx.lineWidth=1.2;
  for (const fleck of flecks) {
    const x=(fleck.x-cam.ox)*cam.scale,y=(fleck.y-cam.oy)*cam.scale;
    if (x < -8 || y < -8 || x > size+8 || y > size+8) continue;
    ctx.globalAlpha=.35 + fleck.strength*.5;
    const length=2+fleck.strength*5;
    ctx.beginPath();ctx.moveTo(x-length,y);
    ctx.quadraticCurveTo(x,y-2,x+length,y);ctx.stroke();
    if(fleck.strength>.8) {
      const sparkle=.7+.3*Math.sin(timeMs/600+fleck.strength*20);
      ctx.globalAlpha*=sparkle;
      ctx.beginPath();ctx.moveTo(x,y-3);ctx.lineTo(x,y+3);ctx.stroke();
    }
  }
  ctx.restore();
}

function drawWakeTrail(ctx: CanvasRenderingContext2D, cam: Camera, trail: Vec2[], speed: number): void {
  if (speed <= .001 || trail.length < 2) return;
  ctx.save();ctx.lineCap="round";ctx.strokeStyle="rgba(255,255,255,.45)";
  for(let i=1;i<trail.length;i++) {
    const a=toScreen(cam,trail[i-1]!),b=toScreen(cam,trail[i]!);
    // Avoid a map-spanning slash when the host respawns a boat.
    const distance=Math.hypot(a.x-b.x,a.y-b.y);
    if(distance<.25 || distance>cam.scale*.08) continue;
    ctx.globalAlpha=i/trail.length*.65;
    ctx.lineWidth=1+(1-i/trail.length)*5;
    ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
  }
  ctx.restore();
}

function drawSpeedStreaks(ctx: CanvasRenderingContext2D, size: number, cam: Camera, boat: BoatState, timeMs: number): void {
  if(boat.throttle<.7 || boat.speed<BOAT.maxSpeed*.6) return;
  const p=toScreen(cam,boat.position), s=Math.max(10,size*.028);
  const speed=Math.min(1,boat.speed/(BOAT.maxSpeed*1.5));
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(boat.heading);
  ctx.strokeStyle="rgba(255,255,255,.65)";ctx.lineWidth=1.2;
  for(let i=0;i<4;i++) {
    const phase=((timeMs/450+i*.25)%1);
    const x=(i%2?1:-1)*s*(1.4+(i%3)*.25);
    const y=s*(.2+phase*3);
    ctx.globalAlpha=(1-phase)*speed;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+s*(.4+speed));ctx.stroke();
  }
  ctx.restore();
}

/** Radio guess ring size: the versus pickup radius (engine VERSUS_RULES.rescueRadius). */
const RADIO_GUESS_RADIUS = 0.06;

function drawNavigatorMark(ctx: CanvasRenderingContext2D, size: number, cam: Camera, marker: Marker, elapsed: number, timeMs: number, driverWindow = false): void {
  const p=toScreen(cam,marker.position);
  const fresh=freshNavigatorMark(marker,elapsed);
  if(marker.kind==="hazard") {
    const pulse=fresh?1+.12*Math.sin(timeMs/100):1;
    ctx.save();ctx.translate(p.x,p.y);ctx.scale(pulse,pulse);
    ctx.fillStyle=PALETTE.amber;ctx.strokeStyle="#9d241e";ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(12,0);ctx.lineTo(0,12);ctx.lineTo(-12,0);ctx.closePath();ctx.fill();ctx.stroke();
    ctx.fillStyle=PALETTE.ink;ctx.font="bold 16px monospace";ctx.textAlign="center";ctx.fillText("!",0,6);
    ctx.restore();
  } else {
    // Radio's guess pin in versus: never a buoy (the old yellow-and-red one read as a person,
    // playtest r4). In the Driver's window it is a dashed amber ring the size of the pickup zone
    // with a small label, so it stays visible on arrival (audit r9); off-screen the edge arrow
    // points to it. The big screen leaves it out.
    if (!driverWindow || marker.kind !== "target_guess") return;
    const r = RADIO_GUESS_RADIUS * cam.scale;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -timeMs / 80;
    ctx.strokeStyle = PALETTE.amber;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.font = "bold 9px monospace";
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = PALETTE.ink;
    ctx.strokeText("RADIO GUESS", p.x, p.y - r - 5);
    ctx.fillStyle = PALETTE.amber;
    ctx.fillText("RADIO GUESS", p.x, p.y - r - 5);
    ctx.restore();
    return;
  }
  if(fresh && p.x>=0 && p.x<=size && p.y>=0 && p.y<=size) {
    const x=Math.max(73,Math.min(size-73,p.x));
    const y=Math.max(16,p.y-22);
    ctx.save();ctx.fillStyle="rgba(8,48,74,.96)";ctx.fillRect(x-73,y-11,146,18);
    ctx.fillStyle=PALETTE.foam;ctx.font="bold 9px monospace";ctx.textAlign="center";
    ctx.fillText("MARKED BY NAVIGATOR",x,y+2);ctx.restore();
  }
}

/** Versus-only jetty: blue berth west, red berth east. Legacy co-op shore stays untouched. */
function drawDock(ctx: CanvasRenderingContext2D, size: number, cam: Camera): void {
  const left=toScreen(cam,{x:.36,y:.91}),right=toScreen(cam,{x:.64,y:.91});
  const shore=toScreen(cam,{x:0,y:.98}).y;
  ctx.save();ctx.fillStyle=PALETTE.sand;ctx.fillRect(0,shore,size,size-shore);
  const width=Math.max(8,size*.025);
  ctx.fillStyle="#b89160";ctx.strokeStyle="#61472e";ctx.lineWidth=1.5;
  for(const berth of [left,right]) {
    ctx.fillRect(berth.x-width,berth.y,width*2,size-berth.y);
    ctx.strokeRect(berth.x-width,berth.y,width*2,size-berth.y);
    for(let y=berth.y;y<size;y+=6) {ctx.beginPath();ctx.moveTo(berth.x-width,y);ctx.lineTo(berth.x+width,y);ctx.stroke();}
  }
  ctx.fillStyle="#b89160";ctx.fillRect(left.x-width,shore,right.x-left.x+width*2,Math.max(8,size*.02));
  for(const [berth,colour,label] of [[left,"#46b3ff","BLUE"],[right,"#ff5a4e","RED"]] as const) {
    ctx.fillStyle=colour;ctx.fillRect(berth.x-width,berth.y,width*2,Math.max(4,size*.012));
    ctx.font="bold 8px monospace";ctx.textAlign="center";ctx.strokeStyle=PALETTE.ink;ctx.lineWidth=3;
    ctx.strokeText(label,berth.x,berth.y-5);ctx.fillText(label,berth.x,berth.y-5);
  }
  ctx.restore();
}
