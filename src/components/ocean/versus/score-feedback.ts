import type { MatchScoreboard, TeamId } from "@/game/versus/contract";
export type ScoreNoticeKind = "picked-up" | "aground" | "wrecked";
export interface ScoreNotice { team: TeamId; kind: ScoreNoticeKind; label: string; key: string }
export function scoreNotices(before: MatchScoreboard | null, next: MatchScoreboard): ScoreNotice[] {
  if (!before || before.matchId !== next.matchId || next.elapsedMs < before.elapsedMs || (next.phase !== "active" && next.phase !== "ended")) return [];
  return (["blue", "red"] as const).flatMap((team) => {
    const old = before.scores[team], score = next.scores[team];
    const notices: ScoreNotice[] = [];
    if (score.rescues > old.rescues) notices.push({ team, kind: "picked-up", label: "PICKED UP!", key: next.matchId + team + ":rescue:" + score.rescues });
    if (score.wipeouts > old.wipeouts) {
      const wrecked = old.hull <= 25;
      notices.push({ team, kind: wrecked ? "wrecked" : "aground", label: wrecked ? "WRECKED" : "RAN AGROUND — back to the tower", key: next.matchId + team + ":wipeout:" + score.wipeouts });
    }
    return notices;
  });
}
export function hullColour(hull: number): string {
  return hull <= 25 ? "#ff6f61" : hull <= 50 ? "#ffc83d" : "#4ade80";
}
