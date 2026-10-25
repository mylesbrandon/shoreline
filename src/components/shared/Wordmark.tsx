/** The game's name as displayed. */
export const GAME_TITLE = "Shoreline";

/**
 * Lifeguard flag + poster lettering. Sized by the parent's font-size (the flag scales with it),
 * so the same mark works in a phone header and as the landing hero.
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-[0.35em] align-middle">
      <span className="flex items-stretch" aria-hidden>
        <span className="w-[0.09em] rounded-full bg-foam/90" />
        <span className="lifeguard-flag h-[0.72em]" />
      </span>
      <span className="font-poster leading-none text-foam [text-shadow:0_0.06em_0_#073f4d]">{GAME_TITLE}</span>
    </span>
  );
}
