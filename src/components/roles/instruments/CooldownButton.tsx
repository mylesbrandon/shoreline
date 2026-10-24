"use client";
/**
 * Big action button with a cooldown fill. OWNER: Developer 4. Reused by sonar/weather/radio.
 * All times are MISSION time (ms) from the view — never Date.now().
 */
export interface CooldownButtonProps {
  label: string;
  nowMs: number;
  readyAtMs: number;
  /** Total cooldown length, for the progress fill. */
  cooldownMs: number;
  onPress: () => void;
  disabled?: boolean;
  tone?: "cyan" | "amber" | "brass";
}

const TONES = {
  cyan: "border-cyan text-cyan shadow-[0_0_24px_-6px_var(--color-cyan)]",
  amber: "border-amber text-amber shadow-[0_0_24px_-6px_var(--color-amber)]",
  brass: "border-brass text-brass shadow-[0_0_24px_-6px_var(--color-brass)]",
};

export function CooldownButton({ label, nowMs, readyAtMs, cooldownMs, onPress, disabled, tone = "cyan" }: CooldownButtonProps) {
  const remaining = Math.max(0, readyAtMs - nowMs);
  const cooling = remaining > 0;
  const ready = !cooling && !disabled;
  const fill = cooldownMs > 0 ? 1 - remaining / cooldownMs : 1;
  const caption = cooling ? `${(remaining / 1000).toFixed(1)}s` : label;

  return (
    <button
      type="button"
      disabled={!ready}
      onClick={onPress}
      aria-label={cooling ? `${label}, ready in ${caption}` : label}
      className={`relative h-16 min-h-11 w-full overflow-hidden rounded-xl border-2 bg-navy font-display text-lg font-semibold uppercase tracking-[0.2em] transition active:scale-[0.98] disabled:opacity-60 ${TONES[tone]}`}
    >
      <span
        className="absolute inset-y-0 left-0 bg-current opacity-15"
        style={{ width: `${Math.min(1, Math.max(0, fill)) * 100}%` }}
      />
      <span className="relative" aria-live="polite">
        {caption}
      </span>
    </button>
  );
}
