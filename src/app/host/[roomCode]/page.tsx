import { redirect } from "next/navigation";
import { normalizeRoomCode } from "@/lib/realtime/room-code";

/**
 * 2v2 is the only mode: an old co-op host link goes to the versus host for the same code.
 * The co-op HostScreen stays in the repo (revert this to bring co-op back).
 */
export default async function HostPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  redirect(`/versus/host/${normalizeRoomCode(roomCode)}`);
}
