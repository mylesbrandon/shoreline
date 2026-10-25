"use client";
/**
 * Picks the right 2v2 station for a seat's view. OWNER: Developer 2 (route composition).
 * The `switch` on view.role is exhaustive, like RoleStation.
 *
 * `scoreboard` is the public match scoreboard for the phone's own seat. The stations need it for
 * the health bar and for score-change feedback ("PICKED UP!", "RAN AGROUND") — those are derived
 * from the scoreboard arriving, never computed here, and never from hidden state.
 */
import type { PlayerAction } from "@/game/types";
import type { MatchScoreboard, VersusRoleView } from "@/game/versus/contract";
import { CaptainStation } from "@/components/captain/CaptainStation";
import { NavigatorStation } from "@/components/roles/navigator/NavigatorStation";

export interface VersusRoleStationProps {
  view: VersusRoleView;
  /**
   * Optional only until both stations declare it; the phone always passes it.
   * Dev 3: `VersusCaptainStation({ view, scoreboard, onAction })`.
   * Dev 4: add `scoreboard?: MatchScoreboard` to `NavigatorStationProps`.
   */
  scoreboard?: MatchScoreboard;
  onAction: (a: PlayerAction) => void;
}

export function VersusRoleStation(props: VersusRoleStationProps) {
  const { view, onAction } = props;
  switch (view.role) {
    case "captain":
      // TODO(dev2): swap to <VersusCaptainStation view={view} scoreboard={props.scoreboard}
      // onAction={onAction} /> as soon as Dev 3's component lands in components/captain/.
      // Until then the co-op Driver screen renders the team world's nested CaptainView unchanged.
      return <CaptainStation view={view.captain} onAction={onAction} />;
    case "navigator":
      // TODO(dev2): forward scoreboard={props.scoreboard} once NavigatorStationProps accepts it.
      return <NavigatorStation view={view} onAction={onAction} />;
  }
}
