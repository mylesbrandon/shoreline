import { ROLES, type Role } from "@/game/types";
import { normalizeRoomCode } from "@/lib/realtime/room-code";
import { PlayerScreen } from "./PlayerScreen";
import { StationPreview } from "./StationPreview";

type PreviewTarget = Role | "spectator";

function parsePreview(value: string | string[] | undefined): PreviewTarget | null {
  if (typeof value !== "string") return null;
  if (value === "spectator") return value;
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roomCode } = await params;
  const query = await searchParams;
  const preview = parsePreview(query.preview);
  const code = normalizeRoomCode(roomCode);

  // ?preview=<role|spectator> renders a station with MOCK data — the sandbox for UI developers.
  if (preview) return <StationPreview target={preview} />;
  return <PlayerScreen roomCode={code} initialName={typeof query.name === "string" ? query.name : ""} />;
}
