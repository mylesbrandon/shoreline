/**
 * Display metadata for 2v2 teams and seats. OWNER: Developer 2 (shared chrome).
 * Colours are the --color-team-* tokens in src/app/globals.css.
 */
import { Binoculars, Sailboat, type LucideIcon } from "lucide-react";
import type { TeamId, VersusRole } from "@/game/versus/contract";

export const TEAM_INFO: Record<TeamId, { label: string; text: string; bg: string; border: string; hex: string }> = {
  blue: { label: "Blue Tower", text: "text-team-blue", bg: "bg-team-blue", border: "border-team-blue", hex: "#5aa9ff" },
  red: { label: "Red Tower", text: "text-team-red", bg: "bg-team-red", border: "border-team-red", hex: "#ff6f61" },
};

export const VERSUS_ROLE_INFO: Record<VersusRole, { label: string; icon: LucideIcon; brief: string }> = {
  captain: {
    label: "Driver",
    icon: Sailboat,
    brief: "You drive the ski, but the glare hides everything past your nose. Listen to your Navigator.",
  },
  navigator: {
    label: "Navigator",
    icon: Binoculars,
    brief: "Sweep for hazards, scan for the swimmer, call the turns. Your Driver is blind without you.",
  },
};
