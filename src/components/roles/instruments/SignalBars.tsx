/** Signal strength meter (0..1). OWNER: Developer 4. */
export function SignalBars({ strength, bars = 5 }: { strength: number; bars?: number }) {
  const lit = Math.round(Math.max(0, Math.min(1, strength)) * bars);
  return (
    <span className="inline-flex items-end gap-0.5" aria-label={`Signal ${Math.round(strength * 100)}%`}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={`w-1.5 rounded-sm ${i < lit ? "bg-amber" : "bg-hull"}`}
          style={{ height: `${6 + i * 4}px` }}
        />
      ))}
    </span>
  );
}
