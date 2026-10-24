import { normalizeRoomCode } from "@/lib/realtime/room-code";
import { HostScreen } from "./HostScreen";

export default async function HostPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  return <HostScreen roomCode={normalizeRoomCode(roomCode)} />;
}
