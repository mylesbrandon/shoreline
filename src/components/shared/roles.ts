/**
 * Display metadata for roles (labels, icons, one-line briefs). Red Flag Day names; code ids stay captain/sonar/weather/radio.
 */
import { Binoculars, RadioTower, Sailboat, Waves, type LucideIcon } from "lucide-react";
import type { Role } from "@/game/types";

export const ROLE_INFO: Record<Role, { label: string; icon: LucideIcon; brief: string; accent: string }> = {
  captain: {
    label: "Driver",
    icon: Sailboat,
    brief: "You drive the ski. The glare's bad. Trust your crew.",
    accent: "text-teal",
  },
  sonar: {
    label: "Drone",
    icon: Binoculars,
    brief: "Sweep the water. Call out sandbars, rocks and jellies before the Driver hits them.",
    accent: "text-cyan",
  },
  weather: {
    label: "Surf Watch",
    icon: Waves,
    brief: "Sets are rolling in. Brace the ski or warn the Driver.",
    accent: "text-brass",
  },
  radio: {
    label: "Tower Radio",
    icon: RadioTower,
    brief: "The beach is calling in sightings. Find the swimmer. Move the pin.",
    accent: "text-amber",
  },
};
