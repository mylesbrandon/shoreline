/**
 * Always-visible label for where data comes from. OWNER: Developer 2.
 * Rule: any screen rendering mock or scripted data MUST show <ModeBadge mode="mock" />.
 */
export type DataMode = "mock" | "preview" | "live";

const LABELS: Record<Exclude<DataMode, "live">, string> = {
  mock: "Practice mode: this device only, nothing syncs",
  preview: "Practice data",
};

/** Live play is the normal case, so it gets no label; only practice data is called out. */
export function ModeBadge({ mode, className = "" }: { mode: DataMode; className?: string }) {
  if (mode === "live") return null;
  return (
    <span className={`inline-block w-fit rounded-[4px] bg-amber px-2 py-0.5 text-sm font-semibold text-[#12324a] ${className}`}>
      {LABELS[mode]}
    </span>
  );
}
