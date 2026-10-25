import { normalizeRoomCode } from "@/lib/realtime/room-code";
import { VersusPlayerScreen } from "./VersusPlayerScreen";

export default async function VersusRoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ roomCode: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { roomCode } = await params;
  const query = await searchParams;
  return (
    <VersusPlayerScreen
      roomCode={normalizeRoomCode(roomCode)}
      initialName={typeof query.name === "string" ? query.name.slice(0, 16) : ""}
    />
  );
}
