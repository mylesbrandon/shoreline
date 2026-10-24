import { normalizeRoomCode } from "@/lib/realtime/room-code";
import { DebugRoom } from "./DebugRoom";

/**
 * TEMPORARY transport smoke test (Developer 2). Remove once host ↔ phone play works end to end.
 * Open /debug/ABCD in two browsers: presence should list both, "Send test" should reach the other.
 */
export default async function DebugPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roomCode } = await params;
  const query = await searchParams;
  return <DebugRoom roomCode={normalizeRoomCode(roomCode)} name={typeof query.name === "string" ? query.name.slice(0, 16) : ""} />;
}
