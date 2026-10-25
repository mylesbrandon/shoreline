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

/** `path` picks the join route: "room" for co-op (default, unchanged) or "versus/room" for 2v2. */
export function JoinQr({
  roomCode,
  lanOrigin = null,
  path = "room",
  onLight = false,
}: {
  roomCode: string;
  lanOrigin?: string | null;
  path?: string;
  /** Set when the QR sits on a light surface (the host's sand sign): helper text turns to ink. */
  onLight?: boolean;
}) {
  const pageOrigin = useOrigin();
  const loopback = pageOrigin !== "" && isLoopback(pageOrigin);
  const origin = loopback && lanOrigin ? lanOrigin : pageOrigin;
  const url = `${origin}/${path}/${roomCode}`;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl bg-foam p-3">
        {origin ? (
          <QRCodeSVG value={url} size={168} bgColor="#fffdf6" fgColor="#073f4d" level="M" />
        ) : (
          <div className="size-[168px]" />
        )}
      </div>
      <p className={`text-center text-xs break-all ${onLight ? "text-[#12324a]/80" : "text-mist"}`}>{origin ? url : "…"}</p>
      {loopback && (
        <p className={`text-center text-xs ${onLight ? "font-semibold text-[#8a2a12]" : "text-amber"}`}>
          {lanOrigin
            ? "Phones must be on the same Wi-Fi, and the server must be started with npm run dev:lan."
            : "This page is on localhost, so phones can't use this QR. Open it via your laptop's Wi-Fi IP instead."}
        </p>
      )}
    </div>
  );
}
