"use client";
import type { PlayerAction } from "@/game/types";
import { BOAT, TARGET } from "@/game/config";
import { VERSUS, type VersusCaptainView, type MatchScoreboard } from "@/game/versus/contract";
import { TEAM_INFO } from "@/components/shared/teams";
import { OceanCanvas } from "@/components/ocean/OceanCanvas";
import { hullColour } from "@/components/ocean/versus/score-feedback";
import { useScoreFeedback } from "@/components/ocean/versus/use-score-feedback";
import styles from "@/components/ocean/versus/playtest.module.css";
import { CaptainControls } from "./CaptainControls";

export interface VersusCaptainStationProps {
  view: VersusCaptainView;
  scoreboard?: MatchScoreboard;
  onAction: (action: PlayerAction) => void;
}
const WINDOW = { span: VERSUS.captainWindowSpan, lookout: VERSUS.captainVisualRange } as const;

export function VersusCaptainStation({ view, scoreboard, onAction }: VersusCaptainStationProps) {
  const notices = useScoreFeedback(scoreboard);
  const notice = notices[view.team];
  const hull = Math.max(0, Math.min(100, scoreboard?.scores[view.team].hull ?? view.captain.boat.hull));
  const active = scoreboard ? scoreboard.phase === "active" : view.captain.mission.phase === "active";
  return <section className={styles.driver} aria-label={TEAM_INFO[view.team].label + " Driver station"}>
    <div className={styles.chart}>
      <OceanCanvas gameId={view.matchId + view.team} boat={view.captain.boat} hazards={view.captain.visibleHazards} markers={view.captain.markers}
        target={view.survivor ? { position: view.survivor, rescueRadius: TARGET.rescueRadius } : null}
        stormIntensity={view.captain.stormIntensity} window={WINDOW} versus boatTint={TEAM_INFO[view.team].hex} className="instrument" />
      {notice && <p key={notice.key} className={styles.notice} role="status" style={{ color: notice.kind === "picked-up" ? "#4ade80" : "#ffc83d" }}>{notice.label}</p>}
    </div>
    <div className={styles.hull}>
      <div className={styles.hullLabel}><span>HULL</span><strong style={{ color: hullColour(hull) }}>{Math.round(hull)}%</strong></div>
      <div className={styles.bar} role="progressbar" aria-label="Hull integrity" aria-valuenow={hull} aria-valuemin={0} aria-valuemax={100}>
        <div className={styles.barFill} style={{ width: hull + "%", backgroundColor: hullColour(hull) }} />
      </div>
      <p className={styles.help}>Jellyfish sting · land sends you home</p>
    </div>
    <div className={styles.controls}><CaptainControls key={view.matchId + view.team} boat={view.captain.boat} maxSpeed={BOAT.maxSpeed * 1.5} onAction={onAction} disabled={!active} /></div>
  </section>;
}
