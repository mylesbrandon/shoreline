"use client";
/**
 * QR code + link for players to join a room. OWNER: Developer 2.
 *
 * If the host page was opened on localhost, the QR would point phones at themselves. In dev the
 * server passes `lanOrigin` (the laptop's Wi-Fi address) and we use that instead.
 */
import { QRCodeSVG } from "qrcode.react";
import { useOrigin } from "@/lib/game-client/hooks";

function isLoopback(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
  } catch {
    return false;
  }
}

export function JoinQr({ roomCode, lanOrigin = null }: { roomCode: string; lanOrigin?: string | null }) {
  const pageOrigin = useOrigin();
  const loopback = pageOrigin !== "" && isLoopback(pageOrigin);
  const origin = loopback && lanOrigin ? lanOrigin : pageOrigin;
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
      {loopback && (
        <p className="text-center text-xs text-amber">
          {lanOrigin
            ? "Phones must be on the same Wi-Fi, and the server must be started with npm run dev:lan."
            : "This page is on localhost, so phones can't use this QR. Open it via your laptop's Wi-Fi IP instead."}
        </p>
      )}
    </div>
  );
}
