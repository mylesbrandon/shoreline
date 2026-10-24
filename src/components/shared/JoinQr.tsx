"use client";
/**
 * QR code + link for players to join a room. OWNER: Developer 2.
 */
import { QRCodeSVG } from "qrcode.react";
import { useOrigin } from "@/lib/game-client/hooks";

export function JoinQr({ roomCode }: { roomCode: string }) {
  const origin = useOrigin();
  const url = `${origin}/room/${roomCode}`;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl bg-foam p-3">
        {origin ? (
          <QRCodeSVG value={url} size={168} bgColor="#e6f1ff" fgColor="#040a16" level="M" />
        ) : (
          <div className="size-[168px]" />
        )}
      </div>
      <p className="text-center font-mono text-xs text-mist break-all">{origin ? url : "…"}</p>
    </div>
  );
}
