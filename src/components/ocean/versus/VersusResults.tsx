/**
 * End-of-match results (winner, both scores) for phones and the host screen. OWNER: Developer 3.
 *
 * BASELINE PLACEHOLDER (handoff versus-1): text only. TODO(dev3): the dramatic results screen.
 */
import type { MatchResult, TeamId } from "@/game/versus/contract";

export interface VersusResultsProps {
  result: MatchResult;
  /** The viewer's team on a phone ("You won!" / "You lost"); omit on the spectator screen. */
  team?: TeamId;
  footer?: React.ReactNode;
}

export function VersusResults({ result, team, footer }: VersusResultsProps) {
  const headline =
    result.winner === null ? "It's a tie!" : team ? (result.winner === team ? "You won!" : "You lost") : `${result.winner.toUpperCase()} wins!`;
  return (
    <section className="instrument grid justify-items-center gap-3 rounded-2xl p-6 text-center">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-mist">Match over</p>
      <h2 className="text-4xl font-bold text-foam">{headline}</h2>
      <p className="font-mono text-2xl">
        <span className="text-team-blue">BLUE {result.scores.blue.rescues}</span>
        {" · "}
        <span className="text-team-red">{result.scores.red.rescues} RED</span>
      </p>
      {footer}
    </section>
  );
}
