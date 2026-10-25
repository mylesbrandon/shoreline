"use client";
import { useRef, useState } from "react";
import type { BoatState, PlayerAction } from "@/game/types";
import { BOAT } from "@/game/config";

export interface CaptainControlsProps {
  boat: BoatState;
  onAction: (action: PlayerAction) => void;
  disabled?: boolean;
  /** Versus-only readout scale; the co-op default is unchanged. */
  maxSpeed?: number;
}

export function CaptainControls({ boat, onAction, disabled = false, maxSpeed = BOAT.maxSpeed }: CaptainControlsProps) {
  const [rudder, setRudder] = useState(0);
  const [throttle, setThrottle] = useState<number | null>(null);
  const steering = useRef(false);
  const reset = () => {
    if (!steering.current) return;
    steering.current = false;
    setRudder(0);
    onAction({ type: "STEER", rudder: 0 });
  };
  const throttleValue = disabled ? boat.throttle : (throttle ?? boat.throttle);
  const heading = ((boat.heading * 180 / Math.PI) % 360 + 360) % 360;
  return <div className="instrument grid gap-4 rounded-2xl p-4">
    <div className="flex items-center justify-between border-b border-hull pb-3">
      <div><p className="font-mono text-[10px] uppercase tracking-[0.25em] text-mist">Jet ski</p>
        <p className="text-lg font-semibold">{disabled ? "Waiting for the whistle" : "You're driving"}</p></div>
      <div className="text-right font-mono"><p className="text-xl text-teal">{(Math.round(heading) % 360).toString().padStart(3, "0")}°</p>
        <p className="text-xs text-mist">{Math.round(boat.speed / maxSpeed * 100)}% speed</p></div>
    </div>
    <label className="grid gap-1">
      <span className="flex justify-between font-mono text-[11px] uppercase tracking-wider text-mist">
        <span>← Port</span><span className="text-teal">Steer {(disabled ? 0 : rudder).toFixed(2)}</span><span>Starboard →</span>
      </span>
      <input aria-label="Rudder" aria-describedby="rudder-help" className="helm-range min-h-12" style={{ opacity: disabled ? 0.4 : 1 }}
        type="range" min={-1} max={1} step={0.05} disabled={disabled} value={disabled ? 0 : rudder}
        onPointerDown={(e) => { steering.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
        onChange={(e) => {
          steering.current = true;
          const value = Math.max(-1, Math.min(1, Number(e.currentTarget.value)));
          setRudder(value); onAction({ type: "STEER", rudder: value });
        }}
        onPointerUp={reset} onPointerCancel={reset} onLostPointerCapture={reset}
        onKeyUp={(e) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) reset(); }}
        onBlur={reset} />
      <span id="rudder-help" className="text-center font-mono text-[10px] text-mist">Hold to turn · release to center</span>
    </label>
    <label className="grid gap-1">
      <span className="flex justify-between font-mono text-[11px] uppercase tracking-wider text-mist">
        <span>Idle</span><span className="text-amber">Throttle {Math.round(throttleValue * 100)}%</span><span>Full throttle</span>
      </span>
      <input aria-label="Throttle" className="helm-range min-h-12" style={{ opacity: disabled ? 0.4 : 1 }}
        type="range" min={0} max={1} step={0.05} disabled={disabled} value={throttleValue}
        onChange={(e) => {
          const value = Math.max(0, Math.min(1, Number(e.currentTarget.value)));
          setThrottle(value); onAction({ type: "SET_THROTTLE", throttle: value });
        }} />
    </label>
  </div>;
}

