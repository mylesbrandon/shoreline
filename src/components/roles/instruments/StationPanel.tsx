import type { ReactNode } from "react";

/** Titled instrument panel section. OWNER: Developer 4. */
export type StationTone = "cyan" | "amber" | "brass" | "teal";

const TONE_BAR: Record<StationTone, string> = {
  cyan: "bg-cyan",
  amber: "bg-amber",
  brass: "bg-brass",
  teal: "bg-teal",
};

export interface StationPanelProps {
  title: string;
  children: ReactNode;
  className?: string;
  /** Thin accent bar so sonar / weather / radio read as one family. */
  tone?: StationTone;
  aside?: ReactNode;
}

export function StationPanel({ title, children, className = "", tone = "cyan", aside }: StationPanelProps) {
  return (
    <section className={`instrument relative overflow-hidden rounded-2xl p-4 ${className}`}>
      <span aria-hidden className={`absolute inset-x-0 top-0 h-0.5 opacity-70 ${TONE_BAR[tone]}`} />
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-[0.25em] text-mist">{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}
