import type { MatchScoreboard } from "@/game/versus/contract";
import { countdownLabel } from "./feedback";

export function MatchCountdown({ scoreboard, phone = false }: { scoreboard: MatchScoreboard; phone?: boolean }) {
  const label = countdownLabel(scoreboard);
  if (!label) return null;
  return <div className={`vs-countdown ${phone ? "vs-countdown-phone" : ""} ${label === "GO!" ? "vs-go" : ""}`}
    role="status" aria-live="polite" aria-label={label === "GO!" ? "Go!" : "Starting in " + label}>
    <div><p className="vs-eyebrow">{label === "GO!" ? "Save the most lives" : "Two crews. One ocean."}</p>
      <strong key={label}>{label}</strong><p className="vs-eyebrow">{label === "GO!" ? "Rescue showdown" : "Get ready"}</p></div>
  </div>;
}
