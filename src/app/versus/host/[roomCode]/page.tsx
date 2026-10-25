import { headers } from "next/headers";
import { normalizeRoomCode } from "@/lib/realtime/room-code";
import { devLanOrigin } from "@/lib/realtime/lan-origin";
import { VersusHostScreen } from "./VersusHostScreen";

export default async function VersusHostPage({ params }: { params: Promise<{ roomCode: string }> }) {
  const { roomCode } = await params;
  const lanOrigin = devLanOrigin((await headers()).get("host"));
  return <VersusHostScreen roomCode={normalizeRoomCode(roomCode)} lanOrigin={lanOrigin} />;
}
