import type { ReactNode } from "react";

/**
 * Labeled digital readout used across specialist stations. OWNER: Developer 4.
 * Display-only — never derive game rules from these numbers.
 */
export type ReadoutTone = "foam" | "cyan" | "amber" | "brass" | "teal" | "hazard" | "mist";

const TONES: Record<ReadoutTone, string> = {
  foam: "text-foam",
  cyan: "text-cyan",
  amber: "text-amber",
  brass: "text-brass",
  teal: "text-teal",
  hazard: "text-hazard",
  mist: "text-mist",
};

export interface ReadoutProps {
  label: string;
  value: string | number;
  unit?: string;
  tone?: ReadoutTone;
}

export function Readout({ label, value, unit, tone = "foam" }: ReadoutProps) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 px-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-mist">{label}</span>
      <span className={`font-mono text-lg tabular-nums leading-none ${TONES[tone]}`}>
        {value}
        {unit !== undefined && <span className="ml-0.5 text-xs text-mist">{unit}</span>}
      </span>
    </div>
  );
}

export function ReadoutRow({ children }: { children: ReactNode }) {
  return <div className="grid auto-cols-fr grid-flow-col items-start gap-2 pt-1">{children}</div>;
}
