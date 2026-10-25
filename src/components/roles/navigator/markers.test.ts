import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { Marker } from "@/game/types";
import { VERSUS } from "@/game/versus/contract";
import { hazardMarkAt, hazardMarkCount, markIntent, MAX_HAZARD_MARKS } from "./markers";

const mark = (id: string, kind: Marker["kind"], x: number, y: number): Marker => ({
  id,
  kind,
  position: { x, y },
  placedBy: kind === "hazard" ? "sonar" : "radio",
  placedAtMs: 0,
});

describe("navigator hazard marks", () => {
  test("cap matches the contract and radio pins never count", () => {
    assert.equal(MAX_HAZARD_MARKS, VERSUS.maxHazardMarks);
    assert.equal(hazardMarkCount([mark("m1", "hazard", 0.2, 0.2), mark("m2", "target_guess", 0.5, 0.5)]), 1);
  });

  test("tap on a mark removes it, elsewhere places, and at the cap explains instead", () => {
    const one = [mark("m1", "hazard", 0.2, 0.2)];
    assert.equal(markIntent(one, { x: 0.2 + VERSUS.markRemoveRadius / 2, y: 0.2 }), "remove");
    assert.equal(markIntent(one, { x: 0.6, y: 0.6 }), "place");
    const two = [...one, mark("m2", "hazard", 0.6, 0.6)];
    assert.equal(markIntent(two, { x: 0.4, y: 0.4 }), "full");
    assert.equal(markIntent(two, { x: 0.6, y: 0.61 }), "remove");
  });

  test("a radio pin under the tap is never treated as a hazard mark", () => {
    assert.equal(hazardMarkAt([mark("m1", "target_guess", 0.5, 0.5)], { x: 0.5, y: 0.5 }), null);
  });
});
