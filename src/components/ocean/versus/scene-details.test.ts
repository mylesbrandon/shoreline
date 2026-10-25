import { test } from "node:test";
import assert from "node:assert/strict";
import { MOCK_SPECTATOR_VIEW } from "@/game/mock-state";
import type { Marker } from "@/game/types";
import { freshNavigatorMark, sharedOcean, waterFlecks, waterHash } from "./scene-details";
test("world water is deterministic, bounded and remains anchored across camera moves", () => {
  const first=waterFlecks({x:.4,y:.4},.18),second=waterFlecks({x:.405,y:.405},.18);
  assert.deepEqual(first,waterFlecks({x:.4,y:.4},.18));
  assert.ok(first.length>100 && first.length<300);
  const common=second.filter(b=>first.some(a=>a.x===b.x&&a.y===b.y&&a.strength===b.strength));
  assert.ok(common.length>100);
  assert.ok(first.every(p=>p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1&&p.strength>=0&&p.strength<1));
  assert.ok(waterHash(1,2)!==waterHash(2,1));
});
test("fresh Navigator label lasts two mission seconds, excluding future and non-Navigator marks", () => {
  const marker:Marker={id:"m",kind:"hazard",position:{x:.5,y:.5},placedAtMs:1000,placedBy:"sonar"};
  assert.equal(freshNavigatorMark(marker,999),false);
  assert.equal(freshNavigatorMark(marker,1000),true);
  assert.equal(freshNavigatorMark(marker,2999),true);
  assert.equal(freshNavigatorMark(marker,3000),false);
  assert.equal(freshNavigatorMark({...marker,placedBy:"captain"},1000),false);
});
test("one ocean merges public hazards and marks by id, ORs reveals, and preserves source snapshots", () => {
  const hazard={...MOCK_SPECTATOR_VIEW.hazards[0]!,id:"same",revealed:false};
  const marker:Marker={id:"m",kind:"hazard",position:{x:.5,y:.5},placedAtMs:1000,placedBy:"sonar"};
  const blue={...MOCK_SPECTATOR_VIEW,hazards:[hazard],markers:[marker]};
  const red={...blue,hazards:[{...hazard,revealed:true}],markers:[{...marker,placedAtMs:2000}]};
  const merged=sharedOcean(blue,red);
  assert.equal(merged.hazards.length,1);assert.equal(merged.hazards[0]!.revealed,true);
  assert.equal(merged.markers.length,1);assert.equal(merged.markers[0]!.placedAtMs,2000);
  assert.equal(hazard.revealed,false);assert.equal(marker.placedAtMs,1000);
  assert.equal("target" in merged,false);
});
