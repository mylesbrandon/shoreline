/**
 * Display metadata for roles (labels, icons, one-line briefs). OWNER: Developer 2.
 */
import { Anchor, CloudLightning, Radar, RadioTower, type LucideIcon } from "lucide-react";
import type { Role } from "@/game/types";

export const ROLE_INFO: Record<Role, { label: string; icon: LucideIcon; brief: string; accent: string }> = {
  captain: {
    label: "Captain",
    icon: Anchor,
    brief: "Steer the boat. You see the water, not what's under it.",
    accent: "text-teal",
  },
  sonar: {
    label: "Sonar",
    icon: Radar,
    brief: "Ping for hidden reefs and mark them for the Captain.",
    accent: "text-cyan",
  },
  weather: {
    label: "Weather",
    icon: CloudLightning,
    brief: "Read the currents ahead. Raise the shield when the storm hits.",
    accent: "text-brass",
  },
  radio: {
    label: "Radio",
    icon: RadioTower,
    brief: "Triangulate the distress signal and guide the crew to it.",
    accent: "text-amber",
  },
};
