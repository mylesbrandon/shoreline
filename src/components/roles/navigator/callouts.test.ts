import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { RadioView, SonarView } from "@/game/types";
import { MOCK_RADIO_VIEW, MOCK_SONAR_VIEW } from "@/game/mock-state";
import {
  bearingTo,
  CALLOUT_FRESH_MS,
  clockPosition,
  distanceBand,
  navigatorCallout,
  relativeBearing,
} from "./callouts";

const TAU = Math.PI * 2;

function sonarAt(partial: Partial<SonarView> & { boat?: Partial<SonarView["boat"]>; contacts?: SonarView["contacts"] }): SonarView {
  return {
    ...MOCK_SONAR_VIEW,
    ...partial,
    boat: { ...MOCK_SONAR_VIEW.boat, ...partial.boat },
    mission: { ...MOCK_SONAR_VIEW.mission, ...(partial.mission ?? {}), elapsedMs: partial.mission?.elapsedMs ?? 30_000 },
    contacts: partial.contacts ?? [],
  };
}

function radioAt(partial: Partial<RadioView> & { boat?: Partial<RadioView["boat"]>; readings?: RadioView["readings"] }): RadioView {
  return {
    ...MOCK_RADIO_VIEW,
    ...partial,
    boat: { ...MOCK_RADIO_VIEW.boat, ...partial.boat },
    mission: { ...MOCK_RADIO_VIEW.mission, ...(partial.mission ?? {}), elapsedMs: partial.mission?.elapsedMs ?? 30_000 },
    readings: partial.readings ?? [],
  };
}

describe("bearing / clock helpers", () => {
  test("straight ahead is 12 o'clock", () => {
    // Heading north, target due north of boat.
    const boat = { x: 0.5, y: 0.5 };
    const target = { x: 0.5, y: 0.3 };
    const abs = bearingTo(boat, target);
    assert.ok(Math.abs(abs) < 1e-9 || Math.abs(abs - TAU) < 1e-9);
    const rel = relativeBearing(0, abs);
    assert.equal(clockPosition(rel), 12);
  });

  test("due east with heading north is 3 o'clock", () => {
    const abs = bearingTo({ x: 0.5, y: 0.5 }, { x: 0.7, y: 0.5 });
    assert.ok(Math.abs(abs - Math.PI / 2) < 1e-9);
    assert.equal(clockPosition(relativeBearing(0, abs)), 3);
  });

  test("behind is 6 o'clock", () => {
    const abs = bearingTo({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.7 });
    assert.equal(clockPosition(relativeBearing(0, abs)), 6);
  });

  test("heading wraparound: heading east, target south → 3 o'clock", () => {
    const abs = bearingTo({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.7 });
    assert.equal(clockPosition(relativeBearing(Math.PI / 2, abs)), 3);
  });

  test("distance bands", () => {
    assert.equal(distanceBand(0.05), "CLOSE");
    assert.equal(distanceBand(0.15), "NEAR");
    assert.equal(distanceBand(0.25), "FAR");
  });
});

describe("navigatorCallout priority", () => {
  const now = 30_000;
  const boat = { position: { x: 0.5, y: 0.5 }, heading: 0, speed: 0, throttle: 0, rudder: 0, hull: 100 };

  test("fresh gull beats radio and hazard", () => {
    const sonar = sonarAt({
      boat,
      contacts: [
        { hazardId: "gull", position: { x: 0.5, y: 0.35 }, radius: 0.04, kind: "gull", detectedAtMs: now - 500 },
        { hazardId: "h1", position: { x: 0.5, y: 0.42 }, radius: 0.04, kind: "reef", detectedAtMs: now - 200 },
      ],
    });
    const radio = radioAt({
      boat,
      readings: [{ sector: "D1", strength: 0.95, atMs: now - 100 }],
    });
    const call = navigatorCallout(sonar, radio, now);
    assert.equal(call.kind, "survivor");
    assert.match(call.text, /PERSON/);
    assert.match(call.text, /12 O'CLOCK/);
  });

  test("strong radio beats hazard warning when no gull", () => {
    const sonar = sonarAt({
      boat,
      contacts: [{ hazardId: "h1", position: { x: 0.5, y: 0.42 }, radius: 0.04, kind: "reef", detectedAtMs: now - 200 }],
    });
    const radio = radioAt({
      boat,
      // D1 centre ≈ (0.875, 0.125) → NW of boat heading north → roughly 10–11 o'clock
      readings: [{ sector: "D1", strength: 0.92, atMs: now - 100 }],
    });
    const call = navigatorCallout(sonar, radio, now);
    assert.equal(call.kind, "signal");
    assert.match(call.text, /SIGNAL \d+ O'CLOCK/);
  });

  test("land ahead when no person and no strong signal", () => {
    const sonar = sonarAt({
      boat,
      contacts: [{ hazardId: "h1", position: { x: 0.5, y: 0.42 }, radius: 0.04, kind: "reef", detectedAtMs: now - 200 }],
    });
    const radio = radioAt({ boat, readings: [{ sector: "A3", strength: 0.2, atMs: now - 100 }] });
    const call = navigatorCallout(sonar, radio, now);
    assert.equal(call.kind, "hazard");
    assert.equal(call.text, "LAND AHEAD");
  });

  test("jellyfish ahead shouts JELLIES", () => {
    const sonar = sonarAt({
      boat,
      contacts: [{ hazardId: "j1", position: { x: 0.5, y: 0.42 }, radius: 0.03, kind: "debris", detectedAtMs: now - 200 }],
    });
    const radio = radioAt({ boat, readings: [] });
    const call = navigatorCallout(sonar, radio, now);
    assert.equal(call.kind, "hazard");
    assert.equal(call.text, "JELLIES");
  });

  test("rock ahead is also LAND AHEAD", () => {
    const sonar = sonarAt({
      boat,
      contacts: [{ hazardId: "r1", position: { x: 0.5, y: 0.42 }, radius: 0.03, kind: "rock", detectedAtMs: now - 200 }],
    });
    assert.equal(navigatorCallout(sonar, radioAt({ boat }), now).text, "LAND AHEAD");
  });

  test("stale gull is ignored → prompt if nothing else", () => {
    const sonar = sonarAt({
      boat,
      contacts: [
        {
          hazardId: "gull",
          position: { x: 0.5, y: 0.35 },
          radius: 0.04,
          kind: "gull",
          detectedAtMs: now - CALLOUT_FRESH_MS - 1,
        },
      ],
    });
    const radio = radioAt({ boat, readings: [] });
    const call = navigatorCallout(sonar, radio, now);
    assert.equal(call.kind, "prompt");
    assert.equal(call.text, "SWEEP OR SCAN TO FIND THEM");
  });

  test("weak radio does not produce a signal callout", () => {
    const sonar = sonarAt({ boat, contacts: [] });
    const radio = radioAt({ boat, readings: [{ sector: "D1", strength: 0.5, atMs: now - 100 }] });
    assert.equal(navigatorCallout(sonar, radio, now).kind, "prompt");
  });

  test("person due east is CLOSE with PERSON wording", () => {
    const sonar = sonarAt({
      boat,
      contacts: [{ hazardId: "gull", position: { x: 0.55, y: 0.5 }, radius: 0.04, kind: "gull", detectedAtMs: now }],
    });
    const call = navigatorCallout(sonar, radioAt({ boat }), now);
    assert.equal(call.kind, "survivor");
    if (call.kind === "survivor") {
      assert.equal(call.clock, 3);
      assert.equal(call.band, "CLOSE");
      assert.match(call.text, /PERSON — CLOSE/);
    }
  });
});
