"use client";

/**
 * Mute / unmute (≥ 44 px). Plain tokens so the UI developer can restyle.
 * When host music is still locked, label reads "Tap for music".
 */
export function SoundToggle({
  muted,
  unlocked,
  onToggle,
  kind = "sfx",
}: {
  muted: boolean;
  unlocked: boolean;
  onToggle: () => void;
  /** Host shows "Tap for music" until the first unlock gesture. */
  kind?: "music" | "sfx";
}) {
  const label =
    kind === "music" && !unlocked ? "Tap for music" : muted ? "Sound off" : "Sound on";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!muted && unlocked}
      aria-label={label}
      className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-xl border border-hull bg-navy px-3 font-mono text-xs uppercase tracking-widest text-foam"
    >
      {label}
    </button>
  );
}
