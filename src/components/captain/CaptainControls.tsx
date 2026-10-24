"use client";
/**
 * Helm controls. OWNER: Developer 3.
 * Emits typed actions via `onAction` — never talks to the network directly.
 * TODO(dev3): spring the rudder back to center on release; haptics (navigator.vibrate) on hits.
 */
import type { BoatState, PlayerAction } from "@/game/types";

export interface CaptainControlsProps {
  boat: BoatState;
  onAction: (action: PlayerAction) => void;
  disabled?: boolean;
}

export function CaptainControls({ boat, onAction, disabled = false }: CaptainControlsProps) {
  return (
    <div className="instrument grid gap-4 rounded-2xl p-4">
      <label className="grid gap-1">
        <span className="flex justify-between font-mono text-xs uppercase tracking-widest text-mist">
          <span>Port</span>
          <span>Rudder {boat.rudder.toFixed(2)}</span>
          <span>Starboard</span>
        </span>
        <input
          aria-label="Rudder"
          className="helm-range"
          type="range"
          min={-1}
          max={1}
          step={0.05}
          disabled={disabled}
          defaultValue={boat.rudder}
          onChange={(e) => onAction({ type: "STEER", rudder: Number(e.currentTarget.value) })}
        />
      </label>
      <label className="grid gap-1">
        <span className="flex justify-between font-mono text-xs uppercase tracking-widest text-mist">
          <span>Stop</span>
          <span>Throttle {Math.round(boat.throttle * 100)}%</span>
          <span>Full</span>
        </span>
        <input
          aria-label="Throttle"
          className="helm-range"
          type="range"
          min={0}
          max={1}
          step={0.05}
          disabled={disabled}
          defaultValue={boat.throttle}
          onChange={(e) => onAction({ type: "SET_THROTTLE", throttle: Number(e.currentTarget.value) })}
        />
      </label>
    </div>
  );
}
