/** Canvas colors: keep in sync with the @theme tokens in src/app/globals.css (Shoreline beach palette). */
export const PALETTE = {
  abyss: "#073f4d",
  navy: "#0a5466",
  deep: "#0f7486",
  hull: "#3e8e98",
  foam: "#fffdf6",
  mist: "#c9ecec",
  teal: "#5ce1d0",
  cyan: "#9befff",
  amber: "#ffd23f",
  hazard: "#e5322d",
  brass: "#f2c879",
  /** Beach-only extras (no Tailwind token needed). */
  shallow: "#4cc9c0",
  sand: "#f2c879",
  jelly: "#f48fb1",
  ink: "#12324a",
} as const;

let uiFamily: string | null = null;
/** Canvas text in the page's own UI face (Baloo 2), read once from <body>; system-ui outside a browser. */
export function canvasFont(px: number, weight: "normal" | "bold" = "bold"): string {
  if (uiFamily === null && typeof document !== "undefined") uiFamily = getComputedStyle(document.body).fontFamily || null;
  return `${weight} ${px}px ${uiFamily ?? "system-ui, sans-serif"}`;
}
