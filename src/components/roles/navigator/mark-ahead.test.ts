import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { MOCK_SONAR_VIEW } from "@/game/mock-state";
import { nearestContactAhead } from "./mark-ahead";

describe("nearestContactAhead", () => {
  test("picks the closest contact ahead of the boat", () => {
    const sonar = {
      ...MOCK_SONAR_VIEW,
      boat: {
        ...MOCK_SONAR_VIEW.boat,
        position: { x: 0.5, y: 0.5 },
        heading: 0,
      },
      contacts: [
        { hazardId: "far", position: { x: 0.5, y: 0.2 }, radius: 0.03, kind: "reef" as const, detectedAtMs: 0 },
        { hazardId: "near", position: { x: 0.5, y: 0.4 }, radius: 0.03, kind: "rock" as const, detectedAtMs: 0 },
        { hazardId: "gull", position: { x: 0.5, y: 0.35 }, radius: 0.04, kind: "gull" as const, detectedAtMs: 0 },
        { hazardId: "side", position: { x: 0.8, y: 0.5 }, radius: 0.03, kind: "debris" as const, detectedAtMs: 0 },
      ],
    };
    const pos = nearestContactAhead(sonar);
    assert.deepEqual(pos, { x: 0.5, y: 0.4 });
  });

  test("returns null when nothing is ahead", () => {
    const sonar = {
      ...MOCK_SONAR_VIEW,
      boat: { ...MOCK_SONAR_VIEW.boat, position: { x: 0.5, y: 0.5 }, heading: 0 },
      contacts: [{ hazardId: "behind", position: { x: 0.5, y: 0.7 }, radius: 0.03, kind: "reef" as const, detectedAtMs: 0 }],
    };
    assert.equal(nearestContactAhead(sonar), null);
  });
});
