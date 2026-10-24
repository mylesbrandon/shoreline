"use client";
/**
 * Picks the right station for a role view. OWNER: Developer 2 (route composition).
 * The `switch` on view.role is exhaustive — adding a role to the contract will fail typecheck here.
 */
import type { PlayerAction, RoleViewState } from "@/game/types";
import { CaptainStation } from "@/components/captain/CaptainStation";
import { SonarStation } from "@/components/roles/sonar/SonarStation";
import { WeatherStation } from "@/components/roles/weather/WeatherStation";
import { RadioStation } from "@/components/roles/radio/RadioStation";

export function RoleStation({ view, onAction }: { view: RoleViewState; onAction: (a: PlayerAction) => void }) {
  switch (view.role) {
    case "captain":
      return <CaptainStation view={view} onAction={onAction} />;
    case "sonar":
      return <SonarStation view={view} onAction={onAction} />;
    case "weather":
      return <WeatherStation view={view} onAction={onAction} />;
    case "radio":
      return <RadioStation view={view} onAction={onAction} />;
  }
}
