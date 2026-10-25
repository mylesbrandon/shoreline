/**
 * Versus survivor sequence tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MISSION, TARGET } from "../config";
import type { Hazard, Vec2 } from "../types";
import { LAYOUT } from "./layout";
import { createInitialState } from "./state";
import { SURVIVORS, survivorSpawn } from "./survivors";

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const START: Vec2 = { x: MISSION.boatStart.x, y: MISSION.boatStart.y };
const hazardsOf = (seed: number) => createInitialState({ seed, gameId: "g" }).hazards;

describe("survivors: sequence", () => {
  test("survivor #0 is the layout's Gull", () => {
    for (const seed of [1, 7, 42]) {
      const state = createInitialState({ seed, gameId: "g" });
      assert.deepEqual(survivorSpawn(seed, 0, state.hazards, START), state.target.position);
    }
  });

  test("is deterministic", () => {
    const hazards = hazardsOf(7);
    for (let i = 1; i <= 5; i++) {
      assert.deepEqual(survivorSpawn(7, i, hazards, START), survivorSpawn(7, i, structuredClone(hazards), { ...START }));
    }
  });

  test("different indices and seeds give different survivors", () => {
    const hazards = hazardsOf(7);
    const spawns = [1, 2, 3, 4, 5].map((i) => survivorSpawn(7, i, hazards, START));
    assert.equal(new Set(spawns.map((p) => `${p.x},${p.y}`)).size, spawns.length);
    assert.notDeepEqual(survivorSpawn(7, 1, hazards, START), survivorSpawn(8, 1, hazards, START));
  });

  test("ignores hazard reveal/hit state, so both teams' worlds agree", () => {
    const hazards = hazardsOf(7);
    const touched = hazards.map((h) => ({ ...h, revealed: true, lastHitAtMs: 1234 }));
    for (let i = 1; i <= 5; i++) assert.deepEqual(survivorSpawn(7, i, touched, START), survivorSpawn(7, i, hazards, START));
  });

  test("never mutates its inputs", () => {
    const hazards = hazardsOf(3);
    const boat = { x: 0.4, y: 0.6 };
    const copy = structuredClone({ hazards, boat });
    survivorSpawn(3, 2, hazards, boat);
    assert.deepEqual({ hazards, boat }, copy);
  });
});

describe("survivors: spawn validity", () => {
  const boats: Vec2[] = [START, { x: 0.5, y: 0.5 }, { x: 0.15, y: 0.15 }, { x: 0.85, y: 0.3 }];

  test("50 seeds × 8 indices: inside the margin, clear of hazards, far enough from the boat", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const hazards = hazardsOf(seed);
      for (let i = 1; i <= 8; i++) {
        const boat = boats[(seed + i) % boats.length] ?? START;
        const p = survivorSpawn(seed, i, hazards, boat);
        const where = `seed ${seed} survivor ${i}`;
        assert.ok(p.x >= LAYOUT.margin && p.x <= 1 - LAYOUT.margin, `${where}: x ${p.x} outside margin`);
        assert.ok(p.y >= LAYOUT.margin && p.y <= 1 - LAYOUT.margin, `${where}: y ${p.y} outside margin`);
        for (const h of hazards) {
          assert.ok(
            distance(p, h.position) >= h.radius + TARGET.rescueRadius + LAYOUT.targetClearance,
            `${where}: too close to ${h.id}`,
          );
        }
        assert.ok(distance(p, boat) >= SURVIVORS.minSpawnFromBoat, `${where}: ${distance(p, boat)} from the boat`);
      }
    }
  });

  test("falls back to a fixed in-map point when every candidate is on a hazard", () => {
    const everywhere: Hazard[] = [
      { id: "h1", kind: "reef", position: { x: 0.5, y: 0.5 }, radius: 2, revealed: false, lastHitAtMs: null },
    ];
    const p = survivorSpawn(7, 1, everywhere, START);
    assert.deepEqual(survivorSpawn(7, 2, everywhere, START), p);
    assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1);
  });

  test("with no candidate far enough, still returns a clear candidate (not the fixed fallback)", () => {
    // Clear water only within ~0.3 of the top-left corner; the boat sits in that corner, so no
    // clear point is minSpawnFromBoat away and the farthest clear one wins.
    const boat = { x: LAYOUT.margin, y: LAYOUT.margin };
    const ring: Hazard[] = [
      { id: "h1", kind: "reef", position: { x: 1, y: 1 }, radius: 1.03, revealed: false, lastHitAtMs: null },
    ];
    const clearance = (p: Vec2) => distance(p, { x: 1, y: 1 }) - (1.03 + TARGET.rescueRadius + LAYOUT.targetClearance);
    let checked = 0;
    for (let seed = 1; seed <= 200 && checked < 3; seed++) {
      const p = survivorSpawn(seed, 1, ring, boat);
      if (clearance(p) < 0) continue; // every candidate blocked: the fixed fallback (covered above)
      checked++;
      assert.ok(distance(p, boat) < SURVIVORS.minSpawnFromBoat);
    }
    assert.ok(checked > 0, "some seed produced a clear candidate");
  });
});

describe("survivors: rescue radius", () => {
  test("a wider rescue ring keeps the same hazard clearance around it", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const hazards = hazardsOf(seed);
      for (let i = 1; i <= 4; i++) {
        const p = survivorSpawn(seed, i, hazards, START, 0.06);
        for (const h of hazards) assert.ok(distance(p, h.position) >= h.radius + 0.06 + LAYOUT.targetClearance);
      }
    }
  });
});

describe("survivors: several boats", () => {
  test("keeps away from every boat (versus passes both)", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const hazards = hazardsOf(seed);
      const boats: Vec2[] = [START, { x: 0.3, y: 0.3 }];
      for (let i = 1; i <= 8; i++) {
        const p = survivorSpawn(seed, i, hazards, boats, 0.06);
        for (const b of boats) assert.ok(distance(p, b) >= SURVIVORS.minSpawnFromAnyBoat, `seed ${seed} #${i}`);
      }
    }
  });

  test("one boat and a one-boat list give the same survivor", () => {
    const hazards = hazardsOf(9);
    for (let i = 1; i <= 5; i++) assert.deepEqual(survivorSpawn(9, i, hazards, START), survivorSpawn(9, i, hazards, [START]));
  });
});
