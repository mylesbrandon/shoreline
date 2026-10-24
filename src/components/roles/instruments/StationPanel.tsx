/** Titled instrument panel section. OWNER: Developer 4. */
export function StationPanel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`instrument rounded-2xl p-4 ${className}`}>
      <h3 className="mb-3 font-mono text-[11px] uppercase tracking-[0.25em] text-mist">{title}</h3>
      {children}
    </section>
  );
}
