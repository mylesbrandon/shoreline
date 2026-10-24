/**
 * Always-visible label for where data comes from. OWNER: Developer 2.
 * Rule: any screen rendering mock or scripted data MUST show <ModeBadge mode="mock" />.
 */
export type DataMode = "mock" | "preview" | "live";

const STYLES: Record<DataMode, { label: string; className: string }> = {
  mock: { label: "Mock mode · single device · not synced", className: "border-amber/60 text-amber bg-amber/10" },
  preview: { label: "Station preview · mock data", className: "border-amber/60 text-amber bg-amber/10" },
  live: { label: "Live · Supabase Realtime", className: "border-teal/50 text-teal bg-teal/10" },
};

export function ModeBadge({ mode, className = "" }: { mode: DataMode; className?: string }) {
  const s = STYLES[mode];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider ${s.className} ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {s.label}
    </span>
  );
}
