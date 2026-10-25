/**
 * STORMLINE: RESCUE SHOWDOWN — SHARED 2v2 CONTRACT (versus-1)
 * ===========================================================
 * Frozen for parallel work. Every versus module (engine, host/player sessions, spectator UI,
 * navigator UI) depends on these types. Changes go through Developer 2 (integration lead) and
 * need all four developers' OK — see docs/versus/CONTRACTS.md.
 *
 * Design in one paragraph: one room, four phones, two teams. The host runs TWO independent
 * co-op GameStates (one per team) from the same seed, so both crews get the same reefs, gusts
 * and survivor sequence. Each world still has ONE survivor at a time (GameState.target); when a
 * team rescues it, its count goes up and the next survivor in the shared sequence appears.
 * One match clock ends both worlds together; most rescues wins.
 *
 * Same conventions as src/game/types.ts: normalized map units, radians (0 = north, clockwise),
 * mission-time milliseconds, plain JSON-serializable data. Pure TypeScript: no React/DOM/network.
 */
import type {
  ActionRejectReason,
  CaptainView,
  GameEvent,
  GameState,
  HazardKind,
  PlayerAction,
  PlayerActionType,
  PlayerId,
  RadioView,
  RoomStatus,
  SonarView,
  SpectatorView,
  Vec2,
} from "../types";

export const VERSUS_CONTRACT_VERSION = "versus-2" as const;

// ---------------------------------------------------------------------------
// Teams, roles, lineup
// ---------------------------------------------------------------------------

export type TeamId = "blue" | "red";
export const TEAMS: readonly TeamId[] = ["blue", "red"] as const;

/** Captain = steer + throttle (the existing Driver). Navigator = Sonar sweep/mark + Radio scan/pin. */
export type VersusRole = "captain" | "navigator";
export const VERSUS_ROLES: readonly VersusRole[] = ["captain", "navigator"] as const;

/** A player's seat: which boat, which job. Assigned ONLY by the host; never read from a payload. */
export interface PlayerTeamAssignment {
  team: TeamId;
  role: VersusRole;
}

/**
 * Auto-assignment order for joining phones. Captains first, alternating teams, so two phones
 * already give a two-boat race (handy for testing) and three or four fill the Navigator seats.
 */
export const SLOT_ORDER: readonly PlayerTeamAssignment[] = [
  { team: "blue", role: "captain" },
  { team: "red", role: "captain" },
  { team: "blue", role: "navigator" },
  { team: "red", role: "navigator" },
] as const;

/** Like `Player` (types.ts) but seated by team instead of by co-op role. */
export interface VersusPlayer {
  id: PlayerId;
  name: string;
  /** null = spectating (all four seats taken, or unseated by the host). */
  slot: PlayerTeamAssignment | null;
  connected: boolean;
  /** Wall-clock ms when first seen by the host. */
  joinedAt: number;
}

export interface VersusRoom {
  code: string;
  hostId: PlayerId;
  players: VersusPlayer[];
  status: RoomStatus;
  createdAt: number;
}

/**
 * Which actions each versus role may send. Everything else (WEATHER_SHIELD, START_GAME,
 * RESET_GAME) is not a phone action in versus: the host starts/resets via the engine directly.
 */
export const VERSUS_ACTION_PERMISSIONS: Record<VersusRole, readonly PlayerActionType[]> = {
  captain: ["STEER", "SET_THROTTLE"],
  navigator: ["SONAR_PING", "MARK_HAZARD", "RADIO_SCAN", "MARK_TARGET"],
};

export function versusRoleMay(role: VersusRole, type: PlayerActionType): boolean {
  return VERSUS_ACTION_PERMISSIONS[role].includes(type);
}

// ---------------------------------------------------------------------------
// Match tuning (semantics frozen; numbers may be tuned in playtests — tell the team)
// ---------------------------------------------------------------------------

export const VERSUS = {
  /** Match length once the countdown ends. Every team world uses this as its mission.durationMs. */
  matchDurationMs: 120_000,
  /** "3-2-1-GO" before the boats can move. */
  countdownMs: 3_000,
  /** UI turns dramatic (red clock, pulse, sound) when this much time is left. */
  finalCountdownMs: 10_000,
  /** SpectatorMatchView.recentRescues keeps at most this many (newest last). */
  recentRescuesKept: 8,
  /** Driver's clear lookout radius in versus (co-op uses CAPTAIN.visualRange = 0.07). The engine filters with it; the Driver window draws it. */
  captainVisualRange: 0.05,
  /** Driver window width in map units in versus (co-op uses 0.24). */
  captainWindowSpan: 0.18,
} as const;

/** Versus hazard classes. Sandbars (reef) and rocks are LAND: touching one runs the boat aground (back to the start, hull untouched). Jellyfish (debris) are the only hazard that damages the hull. */
export type HazardClass = "land" | "jelly";

export function hazardClass(kind: HazardKind): HazardClass {
  return kind === "debris" ? "jelly" : "land";
}

// ---------------------------------------------------------------------------
// Host-only authoritative match state (owned and mutated ONLY by the engine)
// ---------------------------------------------------------------------------

/** briefing (lobby) → countdown → active → ended. RESET = engine.createMatch() with a new matchId. */
export type MatchPhase = "briefing" | "countdown" | "active" | "ended";

/** One rescue, as recorded by the engine. Exactly one per survivor actually reached. */
export interface RescueEvent {
  team: TeamId;
  /** 0-based index in the shared survivor sequence. The team's rescue count afterwards is survivorIndex + 1. */
  survivorIndex: number;
  /** Where the boat picked them up (the survivor's drifted position). */
  position: Vec2;
  /** Match time (= that world's mission.elapsedMs). */
  atMs: number;
}

/** One team's world. `state` is an ordinary co-op GameState: the single-boat engine runs it unchanged. */
export interface TeamWorld {
  team: TeamId;
  /** gameId = the match's matchId; mission.durationMs = VERSUS.matchDurationMs. */
  state: GameState;
  rescues: number;
  /** Times the hull hit 0. A wipeout respawns the boat at the start instead of ending the match. */
  wipeouts: number;
  /** Match time of this team's latest rescue (tiebreak: whoever reached their total first). */
  lastRescueAtMs: number | null;
  rescueLog: RescueEvent[];
}

export interface TeamScore {
  team: TeamId;
  rescues: number;
  wipeouts: number;
  /** Current hull 0..100. */
  hull: number;
  lastRescueAtMs: number | null;
}

export interface MatchResult {
  /** null = tie. See decideWinner. */
  winner: TeamId | null;
  scores: Record<TeamId, TeamScore>;
  endedAtMs: number;
}

export interface VersusMatchState {
  matchId: string;
  seed: number;
  /** +1 on every engine step (countdown included). Orders versus_views on the phones. */
  tick: number;
  phase: MatchPhase;
  /** > 0 only during "countdown". */
  countdownRemainingMs: number;
  /** Shared match clock: mission time since the countdown ended. Equals both worlds' mission.elapsedMs. */
  elapsedMs: number;
  durationMs: number;
  teams: Record<TeamId, TeamWorld>;
  /** Set exactly once, when phase becomes "ended". */
  result: MatchResult | null;
}

/**
 * Winner rule (frozen): more rescues wins. Equal and > 0: whoever reached that total first
 * (smaller lastRescueAtMs) wins. Otherwise (both 0, or same millisecond): tie = null.
 * Also used live as the "leader" shown on the scoreboard.
 */
export function decideWinner(scores: Record<TeamId, TeamScore>): TeamId | null {
  const { blue, red } = scores;
  if (blue.rescues !== red.rescues) return blue.rescues > red.rescues ? "blue" : "red";
  if (blue.rescues === 0 || blue.lastRescueAtMs === null || red.lastRescueAtMs === null) return null;
  if (blue.lastRescueAtMs === red.lastRescueAtMs) return null;
  return blue.lastRescueAtMs < red.lastRescueAtMs ? "blue" : "red";
}

// ---------------------------------------------------------------------------
// Views (what phones and the spectator screen render)
// ---------------------------------------------------------------------------

/** Public to everyone: both teams' scores and the shared clock. */
export interface MatchScoreboard {
  matchId: string;
  phase: MatchPhase;
  countdownRemainingMs: number;
  elapsedMs: number;
  durationMs: number;
  scores: Record<TeamId, TeamScore>;
  /** decideWinner(scores) right now; null while tied. */
  leader: TeamId | null;
  result: MatchResult | null;
}

/** Captain phone. `captain` is the co-op CaptainView of the team's world, so CaptainStation renders it as-is. */
export interface VersusCaptainView {
  role: "captain";
  team: TeamId;
  matchId: string;
  tick: number;
  captain: CaptainView;
  /** The survivor's position when within VERSUS.captainVisualRange of the boat, else null. Filtered only in src/game/engine/views.ts. */
  survivor: Vec2 | null;
}

/**
 * Navigator phone: the team world's Sonar view AND Radio view, so the existing SonarScope and
 * radio grid can be reused directly. The Gull contact rule is unchanged: only `sonar.contacts`
 * may contain a "gull" contact (in-range ping snapshot); nothing else reveals the survivor.
 */
export interface VersusNavigatorView {
  role: "navigator";
  team: TeamId;
  matchId: string;
  tick: number;
  sonar: SonarView;
  radio: RadioView;
}

export type VersusRoleView = VersusCaptainView | VersusNavigatorView;

export interface TeamViews {
  captain: VersusCaptainView;
  navigator: VersusNavigatorView;
}

/** The versus_views bundle. A phone keeps only views[slot.team][slot.role]. */
export type VersusViews = Record<TeamId, TeamViews>;

/** Host laptop / big screen. Each team's SpectatorView hides that team's survivor until the match ends. */
export interface SpectatorMatchView {
  role: "spectator";
  matchId: string;
  tick: number;
  scoreboard: MatchScoreboard;
  teams: Record<TeamId, SpectatorView>;
  /** Newest last, at most VERSUS.recentRescuesKept. Drive rescue animations off new entries. */
  recentRescues: RescueEvent[];
}

// ---------------------------------------------------------------------------
// One-shot events (sounds, flashes). Derived by the engine; state is still the source of truth.
// ---------------------------------------------------------------------------

export type MatchEvent =
  | { type: "MATCH_COUNTDOWN"; countdownMs: number }
  | { type: "MATCH_STARTED"; atMs: number }
  | { type: "SURVIVOR_RESCUED"; rescue: RescueEvent }
  /** aground = touched land; wrecked = jellyfish took the hull to 0. Both respawn at the start; both count in TeamWorld.wipeouts. */
  | { type: "BOAT_WIPEOUT"; team: TeamId; atMs: number; cause: "aground" | "wrecked" }
  | { type: "MATCH_ENDED"; result: MatchResult }
  /** A co-op engine event from one team's world (HAZARD_HIT, SONAR_PINGED, …). Never MISSION_ENDED. */
  | { type: "TEAM_GAME_EVENT"; team: TeamId; event: GameEvent };

// ---------------------------------------------------------------------------
// Engine API (implemented in src/game/engine/versus.ts, exported as `versusEngine`)
// ---------------------------------------------------------------------------

export interface MatchStepResult {
  match: VersusMatchState;
  events: MatchEvent[];
}

export interface MatchActionResult extends MatchStepResult {
  /** Non-null if refused; `match` is then the unchanged input. */
  rejected: ActionRejectReason | null;
}

/** Pure: never mutates its input, no clock, no Math.random(). The host session depends only on this. */
export interface VersusEngine {
  /** Both worlds from `seed`, phase "briefing". Also how RESET works (with a fresh matchId). */
  createMatch(options: { seed: number; matchId: string }): VersusMatchState;
  /** briefing → countdown. No-op (no events) in any other phase. */
  startMatch(match: VersusMatchState): MatchStepResult;
  /** Routes a phone action to `slot.team`'s world, checked against VERSUS_ACTION_PERMISSIONS[slot.role]. */
  applyAction(match: VersusMatchState, slot: PlayerTeamAssignment, action: PlayerAction): MatchActionResult;
  /** Advance the countdown or both worlds by the same dtMs; ends the match at durationMs. */
  step(match: VersusMatchState, dtMs: number): MatchStepResult;
  getViews(match: VersusMatchState): VersusViews;
  getScoreboard(match: VersusMatchState): MatchScoreboard;
  getSpectatorView(match: VersusMatchState): SpectatorMatchView;
}
