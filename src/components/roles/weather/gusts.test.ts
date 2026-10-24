import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { WeatherState } from "@/game/types";
import { compassName, gustSize, readGusts } from "./gusts";

const weather = (current: WeatherState["current"], forecast: WeatherState["forecast"]): WeatherState => ({
  windDirection: 0,
  windStrength: 0,
  current,
  forecast,
  stormIntensity: 0.5,
  shieldActiveUntilMs: null,
  shieldReadyAtMs: 0,
});

const calm = { x: 0.002, y: 0 };

describe("gust reading", () => {
  test("gust pairs become upcoming gusts with their end time; calm entries are skipped", () => {
    const w = weather(calm, [
      { atMs: 5_000, current: { x: 0.025, y: 0 } }, // blowing east → comes from the west
      { atMs: 8_000, current: calm },
    ]);
    const { active, upcoming } = readGusts(w, 2_000);
    assert.equal(active, null);
    assert.equal(upcoming.length, 1);
    assert.equal(upcoming[0]?.atMs, 5_000);
    assert.equal(upcoming[0]?.endsAtMs, 8_000);
    assert.equal(upcoming[0]?.from, "west");
  });

  test("a gust blowing now is active until the forecast returns to calm", () => {
    const w = weather({ x: 0, y: 0.03 }, [{ atMs: 9_000, current: calm }]); // blowing south → from the north
    const { active, upcoming } = readGusts(w, 7_000);
    assert.equal(active?.from, "north");
    assert.equal(active?.endsAtMs, 9_000);
    assert.equal(active?.size, "HUGE");
    assert.deepEqual(upcoming, []);
  });

  test("an empty forecast in calm water has no gusts", () => {
    assert.deepEqual(readGusts(weather(calm, []), 0), { active: null, upcoming: [] });
  });

  test("sizes and compass names", () => {
    assert.equal(gustSize({ x: 0.012, y: 0 }), "SMALL");
    assert.equal(gustSize({ x: 0.02, y: 0 }), "BIG");
    assert.equal(gustSize({ x: 0.03, y: 0 }), "HUGE");
    assert.equal(compassName(0), "north");
    assert.equal(compassName(Math.PI / 4), "north-east");
    assert.equal(compassName(-Math.PI / 2), "west");
  });
});
