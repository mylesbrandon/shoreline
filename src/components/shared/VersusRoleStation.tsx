"use client";
/**
 * Picks the right 2v2 station for a seat's view. OWNER: Developer 2 (route composition).
 * The `switch` on view.role is exhaustive, like RoleStation.
 */
import type { PlayerAction } from "@/game/types";
import type { VersusRoleView } from "@/game/versus/contract";
import { CaptainStation } from "@/components/captain/CaptainStation";
import { NavigatorStation } from "@/components/roles/navigator/NavigatorStation";

export function VersusRoleStation({ view, onAction }: { view: VersusRoleView; onAction: (a: PlayerAction) => void }) {
  switch (view.role) {
    case "captain":
      // The Driver screen is reused as-is: it renders the team world's co-op CaptainView.
      return <CaptainStation view={view.captain} onAction={onAction} />;
    case "navigator":
      return <NavigatorStation view={view} onAction={onAction} />;
  }
}
