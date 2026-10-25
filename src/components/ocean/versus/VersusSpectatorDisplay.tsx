"use client";
import { TEAMS, type SpectatorMatchView } from "@/game/versus/contract";
import { TEAM_INFO } from "@/components/shared/teams";
import { formatClock } from "@/components/shared/MissionClock";
import { OceanCanvas } from "../OceanCanvas";
import { isFinalCountdown } from "./feedback";
import { MatchCountdown } from "./MatchCountdown";
import { useRescueFeed } from "./use-rescue-feed";
import { useScoreFeedback } from "./use-score-feedback";
import { hullColour } from "./score-feedback";
import styles from "./playtest.module.css";
import { sharedOcean } from "./scene-details";
import { VersusResults } from "./VersusResults";

export interface VersusSpectatorDisplayProps { view: SpectatorMatchView }

export function VersusSpectatorDisplay({ view }: VersusSpectatorDisplayProps) {
  const { scoreboard } = view;
  const world = view.teams.blue;
  const shared = sharedOcean(world, view.teams.red);
  const feedback = useRescueFeed(view);
  const tickers = useScoreFeedback(scoreboard);
  const urgent = isFinalCountdown(scoreboard);
  const time = formatClock(Math.max(0, scoreboard.durationMs - scoreboard.elapsedMs));
  const leader = scoreboard.leader;
  return <section className={`vs-stage ${styles.sharedStage} ${urgent ? "vs-stage-urgent" : ""}`} aria-label="Rescue Showdown spectator display">
    <header className="vs-board">
      {TEAMS.map((team) => <div key={team} className={`vs-board-team ${leader === team ? "vs-board-leading" : ""}`}
        style={{ color: TEAM_INFO[team].hex, borderColor: TEAM_INFO[team].hex, order: team === "blue" ? 0 : 2 }}>
        <p>{TEAM_INFO[team].label}</p>
        <div className="vs-score-number"><strong key={scoreboard.matchId + ":" + scoreboard.scores[team].rescues} className="vs-score-pop">{scoreboard.scores[team].rescues}</strong>
          {feedback.bursts.filter((b) => b.rescue.team === team).map((burst) => <span key={burst.key} className="vs-score-plus">+1</span>)}</div>
        <span className="vs-rescue-label">RESCUES</span>
      </div>)}
      <div className="vs-board-center" style={{ order: 1 }}>
        <p className="vs-eyebrow">Rescue Showdown</p>
        <strong className={urgent ? "vs-urgent-clock" : ""} aria-label={"Time remaining " + time}>{time}</strong>
        <span className="vs-leader-label" style={{ color: leader ? TEAM_INFO[leader].hex : "var(--color-foam)" }}>
          {scoreboard.phase === "ended" ? "FINAL SCORE" : leader ? leader.toUpperCase() + " LEADS" : "TIED"}
        </span>
        {leader && scoreboard.scores.blue.rescues === scoreboard.scores.red.rescues && <small>Earliest rescue advantage</small>}
      </div>
    </header>
    <div className={styles.sharedMap}>
      <p className={styles.sharedCaption}>ONE OCEAN · ONE PERSON · TWO CREWS</p>
      <div className="vs-map-square" data-shared-map>
        <OceanCanvas gameId={view.matchId} boat={world.boat} hazards={shared.hazards} markers={shared.markers}
          target={world.target} stormIntensity={world.weather.stormIntensity}
          elapsedMs={scoreboard.elapsedMs} boatTint={TEAM_INFO.blue.hex} versus
          additionalBoats={[{ id: "red", boat: view.teams.red.boat, tint: TEAM_INFO.red.hex, label: TEAM_INFO.red.label }]} />
        {/* The person is live on the big screen only (the engine's live spectator view); a tag makes
            clear the crews are racing blind toward it. */}
        {world.target && !scoreboard.result && <div className={styles.personTag} aria-hidden style={{
          left: Math.max(0, Math.min(1, world.target.position.x)) * 100 + "%",
          top: Math.max(0, Math.min(1, world.target.position.y)) * 100 + "%",
        }}><i /><span>Crews can&apos;t see this</span></div>}
        {feedback.bursts.map((burst) =>
          <div key={burst.key} className="vs-rescue-burst" data-rescue-team={burst.rescue.team} style={{
            left: Math.max(0, Math.min(1, burst.rescue.position.x)) * 100 + "%",
            top: Math.max(0, Math.min(1, burst.rescue.position.y)) * 100 + "%",
            color: TEAM_INFO[burst.rescue.team].hex,
          }}><i /><strong>+1</strong><span>RESCUED</span></div>)}
      </div>
    </div>
    <div className={styles.teamStatuses}>
      {TEAMS.map((team) => {
        const score = scoreboard.scores[team];
        const hull = Math.max(0, Math.min(100, score.hull));
        return <article key={team} className={styles.teamStatus} style={{ borderColor: TEAM_INFO[team].hex }}>
          <header className={styles.teamStatusHeader}><h3 style={{ color: TEAM_INFO[team].hex }}>{TEAM_INFO[team].label}</h3><span>{score.wipeouts} wipeout{score.wipeouts === 1 ? "" : "s"}</span></header>
          <div className="vs-map-footer"><span>HULL {Math.round(hull)}%</span>
            <div role="progressbar" aria-label={TEAM_INFO[team].label + " hull"} aria-valuenow={hull} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: hull + "%", backgroundColor: hullColour(hull) }} />
            </div>
          </div>
          <p className={`${styles.ticker} ${tickers[team] ? styles.tickerActive : ""}`} role="status">
            {tickers[team]?.label ?? "Land sends you to the dock"}
          </p>
        </article>;
      })}
    </div>
    <p className="vs-stage-caption">Same ocean. Same clock. Save the most lives. Land = aground · pink jellyfish = hull damage.</p>
    {feedback.lead && !scoreboard.result && <div key={feedback.lead.serial} className="vs-lead-banner" role="status" style={{ color: TEAM_INFO[feedback.lead.team].hex }}>{feedback.lead.team.toUpperCase()} TAKES THE LEAD!</div>}
    <MatchCountdown scoreboard={scoreboard} />
    {scoreboard.result && <div className="vs-results-overlay"><VersusResults result={scoreboard.result} /></div>}
  </section>;
}
