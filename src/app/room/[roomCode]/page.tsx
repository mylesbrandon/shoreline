import { redirect } from "next/navigation";
import { ROLES, type Role } from "@/game/types";
import { normalizeRoomCode } from "@/lib/realtime/room-code";
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
  // 2v2 is the only mode: an old co-op join link goes to the versus room for the same code.
  // The co-op PlayerScreen stays in the repo (revert this to bring co-op back).
  const name = typeof query.name === "string" ? `?name=${encodeURIComponent(query.name)}` : "";
  redirect(`/versus/room/${code}${name}`);
}
