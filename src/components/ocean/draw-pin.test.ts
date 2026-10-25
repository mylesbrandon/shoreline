import { test } from "node:test";
import assert from "node:assert/strict";
import type { BoatState, Marker } from "@/game/types";
import { drawScene, type OceanScene } from "./draw";

/** A 2D context that accepts every call and records the text drawn (enough for drawScene). */
function recordingContext(): { ctx: CanvasRenderingContext2D; texts: string[] } {
  const texts: string[] = [];
  const gradient = { addColorStop() {} };
  const target: Record<string, unknown> = {
    fillText: (t: string) => texts.push(t),
    strokeText: (t: string) => texts.push(t),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    measureText: () => ({ width: 10 }),
    getLineDash: () => [],
  };
  const ctx = new Proxy(target, {
    get: (t, key: string) => (key in t ? t[key] : typeof key === "string" && /^[a-z]/.test(key) ? () => undefined : undefined),
    set: (t, key: string, value) => ((t[key] = value), true),
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

const boat: BoatState = { position: { x: 0.5, y: 0.5 }, heading: 0, speed: 0, throttle: 0, rudder: 0, hull: 100 };
const pin: Marker = { id: "m1", kind: "target_guess", position: { x: 0.52, y: 0.48 }, placedBy: "radio", placedAtMs: 0 };

const scene = (window: OceanScene["window"]): OceanScene => ({ boat, hazards: [], markers: [pin], versus: true, window });

test("the radio guess shows as a labelled ring inside the versus Driver window", () => {
  const r = recordingContext();
  drawScene(r.ctx, 300, scene({ span: 0.18, lookout: 0.05 }), 0);
  assert.ok(r.texts.includes("RADIO GUESS"));
});

test("the big screen (no window) does not draw the radio guess", () => {
  const r = recordingContext();
  drawScene(r.ctx, 300, scene(undefined), 0);
  assert.ok(!r.texts.includes("RADIO GUESS"));
});
