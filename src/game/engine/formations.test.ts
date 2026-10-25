/**
 * Versus reef formation tests (node:test via tsx). Run: npm test
 * OWNER: Developer 1.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { NETWORK } from "../config";
import type { GameState, Vec2 } from "../types";
import { hazardClass } from "../versus/contract";
import { versusEngine as V } from "./index";
import { besideFormation, docksReach, FORMATIONS, landBetween, reachability } from "./formations";
import { dockFor } from "./versus";

const DT = 1000 / NETWORK.simHz;
const DOCKS: Vec2[] = [dockFor("blue"), dockFor("red")];
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const blueWorld = (seed: number) => V.createMatch({ seed, matchId: "m" }).teams.blue.state;
const formationIds = (s: GameState) => new Set(s.hazards.filter((h) => h.id.startsWith("f")).map((h) => h.id.split("-")[0]));

/** Does the straight line a→b touch any hazard in `hazards`? */
function lineHits(a: Vec2, b: Vec2, hazards: GameState["hazards"]): boolean {
  for (let t = 0; t <= 1; t += 0.004) {
    const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    if (hazards.some((h) => distance(p, h.position) < h.radius)) return true;
  }
  return false;
}

describe("versus formations: layout", () => {
  test("deterministic per seed, identical for both crews", () => {
    for (const seed of [3, 17, 99]) {
      const a = V.createMatch({ seed, matchId: "a" });
      const b = V.createMatch({ seed, matchId: "b" });
      assert.deepEqual(a.teams.blue.state.hazards, b.teams.blue.state.hazards);
      assert.deepEqual(a.teams.blue.state.hazards, a.teams.red.state.hazards);
    }
  });

  test("most maps get 2–3 formations made of ordinary land circles", () => {
    let withTwo = 0;
    for (const seed of SEEDS) {
      const s = blueWorld(seed);
      const ids = formationIds(s);
      assert.ok(ids.size >= 1, `seed ${seed} has a formation`);
      if (ids.size >= 2) withTwo++;
      for (const h of s.hazards.filter((x) => x.id.startsWith("f"))) {
        assert.equal(hazardClass(h.kind), "land", `${h.id} is land`);
        assert.ok(h.radius >= FORMATIONS.radius[0] && h.radius <= FORMATIONS.radius[1]);
      }
    }
    assert.ok(withTwo >= SEEDS.length * 0.9, `${withTwo}/${SEEDS.length} maps have 2+ formations`);
  });

  test("the direct line from the docks to the first person is blocked by a formation on most maps", () => {
    let blocked = 0;
    for (const seed of SEEDS) {
      const s = blueWorld(seed);
      const reef = s.hazards.filter((h) => h.id.startsWith("f1"));
      if (lineHits({ x: 0.5, y: 0.9 }, s.target.position, reef)) blocked++;
    }
    assert.ok(blocked >= SEEDS.length * 0.8, `${blocked}/${SEEDS.length}`);
  });

  test("docks and the first person are clear of every hazard", () => {
    for (const seed of SEEDS) {
      const s = blueWorld(seed);
      for (const h of s.hazards) {
        for (const d of DOCKS) assert.ok(distance(h.position, d) >= h.radius + 0.1, `seed ${seed}: ${h.id} near a dock`);
        assert.ok(distance(h.position, s.target.position) >= h.radius + s.target.rescueRadius, `seed ${seed}: ${h.id} on the person`);
      }
    }
  });
});

describe("versus formations: routes", () => {
  test("both docks can reach the first person without touching anything", () => {
    for (const seed of SEEDS) {
      const s = blueWorld(seed);
      assert.ok(docksReach(s.hazards, DOCKS, s.target.position, s.target.rescueRadius), `seed ${seed}`);
    }
  });

  test("every later person also spawns somewhere reachable from the docks", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      let m = V.startMatch(V.createMatch({ seed, matchId: "m" })).match;
      while (m.phase === "countdown") m = V.step(m, DT).match;
      for (let i = 0; i < 5; i++) {
        const park = (s: GameState): GameState => ({ ...s, boat: { ...s.boat, position: { ...s.target.position } } });
        m = V.step({ ...m, teams: { ...m.teams, blue: { ...m.teams.blue, state: park(m.teams.blue.state) } } }, DT).match;
        const s = m.teams.blue.state;
        assert.ok(reachability(s.hazards, DOCKS).reaches(s.target.position), `seed ${seed} person ${i + 1}`);
      }
      assert.equal(m.teams.blue.rescues, 5);
    }
  });

  test("formations collide like any land: touching one runs the boat aground", () => {
    let m = V.startMatch(V.createMatch({ seed: 7, matchId: "m" })).match;
    while (m.phase === "countdown") m = V.step(m, DT).match;
    const reef = m.teams.blue.state.hazards.find((h) => h.id.startsWith("f"));
    assert.ok(reef);
    const s = m.teams.blue.state;
    m = { ...m, teams: { ...m.teams, blue: { ...m.teams.blue, state: { ...s, boat: { ...s.boat, position: { ...reef.position } } } } } };
    const r = V.step(m, DT);
    assert.ok(r.events.some((e) => e.type === "BOAT_WIPEOUT" && e.team === "blue" && e.cause === "aground"));
  });

  test("the drone's sweep finds formation reefs", () => {
    let m = V.startMatch(V.createMatch({ seed: 7, matchId: "m" })).match;
    while (m.phase === "countdown") m = V.step(m, DT).match;
    const reef = m.teams.blue.state.hazards.find((h) => h.id.startsWith("f"));
    assert.ok(reef);
    const s = m.teams.blue.state;
    m = { ...m, teams: { ...m.teams, blue: { ...m.teams.blue, state: { ...s, boat: { ...s.boat, position: { x: reef.position.x, y: reef.position.y + 0.15 } } } } } };
    m = V.applyAction(m, { team: "blue", role: "navigator" }, { type: "SONAR_PING" }).match;
    assert.ok(m.teams.blue.state.sonar.contacts.some((c) => c.hazardId.startsWith("f")));
  });
});

describe("versus formations: people spawn among the obstacles", () => {
  test("most new people have land between them and both boats, or sit beside a formation", () => {
    let total = 0;
    let involved = 0;
    for (const seed of SEEDS.slice(0, 12)) {
      let m = V.startMatch(V.createMatch({ seed, matchId: "m" })).match;
      while (m.phase === "countdown") m = V.step(m, DT).match;
      for (let i = 0; i < 4; i++) {
        const park = (s: GameState): GameState => ({ ...s, boat: { ...s.boat, position: { ...s.target.position } } });
        m = V.step({ ...m, teams: { ...m.teams, blue: { ...m.teams.blue, state: park(m.teams.blue.state) } } }, DT).match;
        const s = m.teams.blue.state;
        const p = s.target.position;
        const boats = [s.boat.position, m.teams.red.state.boat.position];
        total++;
        if (boats.some((b) => landBetween(b, p, s.hazards)) || besideFormation(p, s.hazards, 0.18)) involved++;
      }
    }
    // Measured: 84% with the preferences, 68% without (60 seeds x 6 people).
    assert.ok(involved >= total * 0.75, `${involved}/${total}`);
  });
});
