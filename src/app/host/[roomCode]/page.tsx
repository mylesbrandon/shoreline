import { headers } from "next/headers";
import { normalizeRoomCode } from "@/lib/realtime/room-code";
import { devLanOrigin } from "@/lib/realtime/lan-origin";
import { HostScreen } from "./HostScreen";

export default async function HostPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const lanOrigin = devLanOrigin((await headers()).get("host"));
  return <HostScreen roomCode={normalizeRoomCode(roomCode)} lanOrigin={lanOrigin} />;
}
