import type { MatchResult, TeamId } from "@/game/versus/contract";
import { TEAMS } from "@/game/versus/contract";
import { TEAM_INFO } from "@/components/shared/teams";

export interface VersusResultsProps { result: MatchResult; team?: TeamId; footer?: React.ReactNode }

export function VersusResults({ result, team, footer }: VersusResultsProps) {
  const winner = result.winner;
  const headline = winner === null ? "TIE!" : team ? (winner === team ? "YOU WON!" : "YOU LOST") : TEAM_INFO[winner].label.toUpperCase() + " WINS";
  const tiebreak = winner !== null && result.scores.blue.rescues === result.scores.red.rescues;
  return <section className="vs-results" role="status" aria-live="polite">
    <p className="vs-eyebrow">Red Flag Day / final results</p>
    <p className="vs-results-kicker">Rescue Showdown</p>
    <h2 style={{ color: winner ? TEAM_INFO[winner].hex : "var(--color-foam)" }}>{headline}</h2>
    <p className="vs-results-subtitle">{winner === null ? "Same ocean. Same finish. What a race." : "Every rescue made the difference."}</p>
    <div className="vs-result-scores">
      {TEAMS.map((id) => <div key={id} className={`vs-result-team ${winner === id ? "vs-result-winner" : ""}`} style={{ borderColor: TEAM_INFO[id].hex }}>
        <p style={{ color: TEAM_INFO[id].hex }}>{TEAM_INFO[id].label}{team === id ? " · YOU" : ""}</p>
        <strong style={{ color: TEAM_INFO[id].hex }}>{result.scores[id].rescues}</strong>
        <span>rescues</span><small>{result.scores[id].wipeouts} wipeout{result.scores[id].wipeouts === 1 ? "" : "s"}</small>
      </div>)}
    </div>
    {tiebreak && <p className="vs-tiebreak">{TEAM_INFO[winner].label} got there first<span>Equal rescues · earliest final rescue wins</span></p>}
    {footer && <div className="vs-results-footer">{footer}</div>}
  </section>;
}
