import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VERSUS, type MatchEvent, type MatchScoreboard, type MatchResult, type TeamScore } from "@/game/versus/contract";
import { createSfxCueTracker, musicStateFor, sfxCuesFor, type SfxCue } from "./cues";

function score(partial: Partial<TeamScore> & { team: TeamScore["team"] }): TeamScore {
  return {
    rescues: 0,
    wipeouts: 0,
    hull: 100,
    lastRescueAtMs: null,
    ...partial,
  };
}

function board(partial: Partial<MatchScoreboard> & Pick<MatchScoreboard, "phase">): MatchScoreboard {
  const scores = partial.scores ?? {
    blue: score({ team: "blue" }),
    red: score({ team: "red" }),
  };
  return {
    matchId: "m1",
    countdownRemainingMs: 0,
    elapsedMs: 0,
    durationMs: VERSUS.matchDurationMs,
    leader: null,
    result: null,
    scores,
    ...partial,
  };
}

const blueCap = { team: "blue" as const, role: "captain" as const };
const redNav = { team: "red" as const, role: "navigator" as const };

describe("musicStateFor", () => {
  it("maps phases", () => {
    assert.equal(musicStateFor(null), "lobby");
    assert.equal(musicStateFor(board({ phase: "briefing" })), "lobby");
    assert.equal(musicStateFor(board({ phase: "countdown", countdownRemainingMs: 2000 })), "countdown");
    assert.equal(musicStateFor(board({ phase: "active", elapsedMs: 1000 })), "match");
    assert.equal(
      musicStateFor(board({ phase: "active", elapsedMs: VERSUS.matchDurationMs - VERSUS.finalCountdownMs })),
      "final",
    );
    assert.equal(musicStateFor(board({ phase: "ended" })), "results");
  });
});

describe("sfxCuesFor", () => {
  it("maps each MatchEvent for a seated phone", () => {
    const t = createSfxCueTracker();
    const events: MatchEvent[] = [
      { type: "MATCH_COUNTDOWN", countdownMs: 3000 },
      { type: "MATCH_STARTED", atMs: 0 },
      { type: "SURVIVOR_RESCUED", rescue: { team: "blue", survivorIndex: 0, position: { x: 0.5, y: 0.5 }, atMs: 1000 } },
      { type: "SURVIVOR_RESCUED", rescue: { team: "red", survivorIndex: 1, position: { x: 0.5, y: 0.5 }, atMs: 2000 } },
      { type: "BOAT_WIPEOUT", team: "blue", atMs: 3000, cause: "aground" },
      { type: "TEAM_GAME_EVENT", team: "blue", event: { type: "HAZARD_HIT", hazardId: "j1", damage: 25, atMs: 5000 } },
      { type: "TEAM_GAME_EVENT", team: "blue", event: { type: "HAZARD_HIT", hazardId: "l1", damage: 0, atMs: 5100 } },
      { type: "TEAM_GAME_EVENT", team: "blue", event: { type: "SONAR_PINGED", origin: { x: 0, y: 0 }, contactsFound: 1, atMs: 6000 } },
      { type: "TEAM_GAME_EVENT", team: "blue", event: { type: "RADIO_SCANNED", sector: "A1", strength: 0, atMs: 7000 } },
      {
        type: "TEAM_GAME_EVENT",
        team: "blue",
        event: {
          type: "MARKER_PLACED",
          marker: { id: "m", kind: "hazard", position: { x: 0.1, y: 0.1 }, placedBy: "sonar", placedAtMs: 8000 },
          atMs: 8000,
        },
      },
      { type: "TEAM_GAME_EVENT", team: "blue", event: { type: "CURRENT_SHIFTED", current: { x: 0, y: 0 }, atMs: 9000 } },
    ];
    const cues = sfxCuesFor(events, null, board({ phase: "active", elapsedMs: 9000 }), blueCap, t);
    assert.deepEqual(
      cues.filter((c) => c !== "final_tick"),
      [
        "countdown_go",
        "match_whistle",
        "rescue_chime",
        "rival_rescue",
        "aground_thud",
        "jelly_sting",
        "sonar_ping",
        "radio_scan_0",
        "marker_tick",
      ],
    );
  });

  it("ignores the other crew's TEAM_GAME_EVENTs", () => {
    const t = createSfxCueTracker();
    const ev: MatchEvent = {
      type: "TEAM_GAME_EVENT",
      team: "red",
      event: { type: "SONAR_PINGED", origin: { x: 0, y: 0 }, contactsFound: 0, atMs: 1 },
    };
    assert.deepEqual(sfxCuesFor([ev], null, board({ phase: "active" }), blueCap, t), []);
  });

  it("jelly vs land map differently; wreck suppresses sting", () => {
    const t = createSfxCueTracker();
    const jelly: MatchEvent = {
      type: "TEAM_GAME_EVENT",
      team: "blue",
      event: { type: "HAZARD_HIT", hazardId: "j", damage: 40, atMs: 1 },
    };
    const land: MatchEvent = {
      type: "TEAM_GAME_EVENT",
      team: "blue",
      event: { type: "HAZARD_HIT", hazardId: "l", damage: 0, atMs: 2 },
    };
    assert.deepEqual(sfxCuesFor([jelly], null, board({ phase: "active" }), blueCap, t), ["jelly_sting"]);
    assert.deepEqual(sfxCuesFor([land], null, board({ phase: "active" }), blueCap, t), []);

    const t2 = createSfxCueTracker();
    const wreckBatch: MatchEvent[] = [
      { type: "TEAM_GAME_EVENT", team: "blue", event: { type: "HAZARD_HIT", hazardId: "j", damage: 100, atMs: 3 } },
      { type: "BOAT_WIPEOUT", team: "blue", atMs: 3, cause: "wrecked" },
    ];
    assert.deepEqual(sfxCuesFor(wreckBatch, null, board({ phase: "active" }), blueCap, t2), ["wreck_crash"]);
  });

  it("maps four RADIO_SCANNED strengths", () => {
    const strengths = [0, 0.33, 0.67, 1] as const;
    const expected: SfxCue[] = ["radio_scan_0", "radio_scan_1", "radio_scan_2", "radio_scan_3"];
    strengths.forEach((strength, i) => {
      const t = createSfxCueTracker();
      const ev: MatchEvent = {
        type: "TEAM_GAME_EVENT",
        team: "blue",
        event: { type: "RADIO_SCANNED", sector: "A1", strength, atMs: i },
      };
      assert.deepEqual(sfxCuesFor([ev], null, board({ phase: "active" }), blueCap, t), [expected[i]!]);
    });
  });

  it("win / lose / tie follow result.winner vs phone team", () => {
    const result = (winner: MatchResult["winner"]): MatchResult => ({
      winner,
      scores: { blue: score({ team: "blue", rescues: 1 }), red: score({ team: "red" }) },
      endedAtMs: 1000,
    });
    for (const [winner, cue] of [
      ["blue", "win_jingle"],
      ["red", "lose_blip"],
      [null, "tie_jingle"],
    ] as const) {
      const t = createSfxCueTracker();
      const ev: MatchEvent = { type: "MATCH_ENDED", result: result(winner) };
      assert.deepEqual(
        sfxCuesFor([ev], board({ phase: "active" }), board({ phase: "ended", result: result(winner) }), blueCap, t),
        [cue],
      );
    }
    const tRed = createSfxCueTracker();
    assert.deepEqual(
      sfxCuesFor(
        [{ type: "MATCH_ENDED", result: result("blue") }],
        board({ phase: "active" }),
        board({ phase: "ended", result: result("blue") }),
        redNav,
        tRed,
      ),
      ["lose_blip"],
    );
  });

  it("dedupes the same event objects", () => {
    const t = createSfxCueTracker();
    const ev: MatchEvent = { type: "MATCH_STARTED", atMs: 0 };
    assert.deepEqual(sfxCuesFor([ev], null, board({ phase: "active" }), blueCap, t), ["match_whistle"]);
    assert.deepEqual(sfxCuesFor([ev], null, board({ phase: "active" }), blueCap, t), []);
  });

  it("scoreboard rescue without event still cues once; both present still once", () => {
    const before = board({
      phase: "active",
      scores: { blue: score({ team: "blue", rescues: 0 }), red: score({ team: "red" }) },
    });
    const after = board({
      phase: "active",
      scores: { blue: score({ team: "blue", rescues: 1 }), red: score({ team: "red" }) },
    });
    const t = createSfxCueTracker();
    // Prime tracker to before counts (simulate prior frame).
    sfxCuesFor([], null, before, blueCap, t);
    assert.deepEqual(sfxCuesFor([], before, after, blueCap, t), ["rescue_chime"]);

    const t2 = createSfxCueTracker();
    const rescueEv: MatchEvent = {
      type: "SURVIVOR_RESCUED",
      rescue: { team: "blue", survivorIndex: 0, position: { x: 0.5, y: 0.5 }, atMs: 100 },
    };
    sfxCuesFor([], null, before, blueCap, t2);
    assert.deepEqual(sfxCuesFor([rescueEv], before, after, blueCap, t2), ["rescue_chime"]);
  });

  it("final-10-s ticks once per second; new matchId resets", () => {
    const t = createSfxCueTracker();
    const nearEnd = board({
      phase: "active",
      elapsedMs: VERSUS.matchDurationMs - 9500,
    });
    const cues1 = sfxCuesFor([], null, nearEnd, blueCap, t);
    assert.ok(cues1.includes("final_tick"));
    const sameSecond = board({
      phase: "active",
      elapsedMs: VERSUS.matchDurationMs - 9200,
    });
    assert.deepEqual(sfxCuesFor([], nearEnd, sameSecond, blueCap, t), []);
    const nextSecond = board({
      phase: "active",
      elapsedMs: VERSUS.matchDurationMs - 8500,
    });
    assert.deepEqual(sfxCuesFor([], sameSecond, nextSecond, blueCap, t), ["final_tick"]);

    const newMatch = board({ phase: "briefing", matchId: "m2" });
    sfxCuesFor([], nextSecond, newMatch, blueCap, t);
    assert.equal(t.matchId, "m2");
    assert.equal(t.lastFinalSecond, null);
    assert.equal(t.playedStarted, false);
  });
});
