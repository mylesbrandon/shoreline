/**
 * "Reconnecting…" strip shown when a device loses its room connection. OWNER: Developer 2.
 * Props-only (components never import src/lib/realtime); the status union mirrors TransportStatus.
 */
import { WifiOff } from "lucide-react";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function ConnectionBanner({ status, error }: { status: ConnectionStatus; error?: string | null }) {
  if (status === "connected" || status === "idle") return null;
  const label = status === "connecting" ? "Connecting to the room…" : "Connection lost. Reconnecting…";
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-20 -mx-4 flex items-center gap-2 border-b border-amber/40 bg-amber/15 px-4 py-2 text-sm text-amber backdrop-blur"
    >
      <WifiOff className="size-4 shrink-0" />
      <span className="font-semibold">{label}</span>
      {error && status !== "connecting" && <span className="truncate text-amber/80">{error}</span>}
    </div>
  );
}
