/**
 * Nautical compass dial with a needle. OWNER: Developer 4.
 * `angle` uses the shared heading convention: radians, 0 = north (up), clockwise.
 */
export interface DialProps {
  angle: number;
  /** 0..1 — needle length / glow. */
  magnitude?: number;
  label?: string;
  readout?: string;
  size?: number;
  color?: string;
}

export function Dial({ angle, magnitude = 1, label, readout, size = 160, color = "var(--color-cyan)" }: DialProps) {
  const deg = (angle * 180) / Math.PI;
  const len = 18 + 26 * Math.max(0, Math.min(1, magnitude));
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="-60 -60 120 120" width={size} height={size} role="img" aria-label={label}>
        <circle r="56" fill="var(--color-navy)" stroke="var(--color-hull)" strokeWidth="2" />
        {Array.from({ length: 36 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1={-56}
            x2="0"
            y2={i % 9 === 0 ? -46 : -51}
            stroke="var(--color-mist)"
            strokeOpacity={i % 9 === 0 ? 0.8 : 0.3}
            transform={`rotate(${i * 10})`}
          />
        ))}
        {(["N", "E", "S", "W"] as const).map((d, i) => (
          <text
            key={d}
            x="0"
            y="-34"
            fill="var(--color-mist)"
            fontSize="9"
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${i * 90}) `}
            fontFamily="var(--font-mono)"
          >
            {d}
          </text>
        ))}
        <g transform={`rotate(${deg})`}>
          <line x1="0" y1="8" x2="0" y2={-len} stroke={color} strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy={-len} r="3.5" fill={color} />
        </g>
        <circle r="4" fill="var(--color-foam)" />
      </svg>
      {label && <figcaption className="font-mono text-[10px] uppercase tracking-widest text-mist">{label}</figcaption>}
      {readout && <p className="font-mono text-sm text-foam">{readout}</p>}
    </figure>
  );
}
