/** Canvas colors: keep in sync with the @theme tokens in src/app/globals.css (Red Flag Day beach palette). */
export const PALETTE = {
  abyss: "#08304a",
  navy: "#0d4462",
  deep: "#1f7a99",
  hull: "#3a7f97",
  foam: "#ffffff",
  mist: "#b9dfe6",
  teal: "#4cc9c0",
  cyan: "#8be3ef",
  amber: "#ffc83d",
  hazard: "#e8412f",
  brass: "#f3d9a4",
  /** Beach-only extras (no Tailwind token needed). */
  shallow: "#4cc9c0",
  sand: "#f3d9a4",
  jelly: "#f48fb1",
  ink: "#12324a",
} as const;
