/**
 * Display metadata for 2v2 teams and seats. OWNER: Developer 2 (shared chrome).
 * Colours are the --color-team-* tokens in src/app/globals.css.
 */
import { Binoculars, Sailboat, type LucideIcon } from "lucide-react";
import type { TeamId, VersusRole } from "@/game/versus/contract";

export const TEAM_INFO: Record<TeamId, { label: string; text: string; bg: string; border: string; hex: string }> = {
  blue: { label: "Blue crew", text: "text-team-blue", bg: "bg-team-blue", border: "border-team-blue", hex: "#46b3ff" },
  red: { label: "Red crew", text: "text-team-red", bg: "bg-team-red", border: "border-team-red", hex: "#ff5a4e" },
};

export const VERSUS_ROLE_INFO: Record<VersusRole, { label: string; icon: LucideIcon; brief: string }> = {
  captain: {
    label: "Driver",
    icon: Sailboat,
    brief: "You drive the ski, but you can only see a little way around you. Listen to your Navigator.",
  },
  navigator: {
    label: "Navigator",
    icon: Binoculars,
    brief: "Sweep for hazards, scan for the swimmer, call the turns. Your Driver is blind without you.",
  },
};

/**
 * Wait-screen how-to-play, one list per seat. Written for a 375 px phone held by someone who has
 * never played: short imperative lines, the thing that kills you before the thing that scores.
 */
export const VERSUS_ROLE_STEPS: Record<VersusRole, readonly string[]> = {
  captain: [
    "You steer the ski. Drag to turn, slider for throttle.",
    "You only see a small circle around you. Listen to your Navigator.",
    "Sandbars and rocks are land. Touch them and you're sent back to the dock.",
    "Jellyfish sting your hull. At 0 you're wrecked and sent back to the dock.",
    "The person appears when you're close. Drive through them to pick them up, before the other boat does.",
  ],
  navigator: [
    "You have two screens; tap the tabs to switch. On Drone, press Sweep to scan around your boat for land, jellyfish and the person.",
    "Tap the radar to mark an obstacle. Your mark shows up on your Driver's screen.",
    "On Radio, Scan tells you how close the person is in each square. Pin your best guess and it shows on the Driver's screen as an arrow.",
    "Shout directions: \u201cland ahead, go left\u201d, \u201cperson two o'clock\u201d.",
    "The other crew is racing you for the same person.",
  ],
};
