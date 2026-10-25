/** The game's name as displayed. */
export const GAME_TITLE = "Shoreline";

/** Poster lettering, sized by the parent's font-size: the same mark works in a phone header and as the landing hero. */
export function Wordmark() {
  return <span className="font-poster leading-none text-foam [text-shadow:0_0.06em_0_#073f4d]">{GAME_TITLE}</span>;
}
