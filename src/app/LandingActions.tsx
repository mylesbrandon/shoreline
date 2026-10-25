"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "@/lib/realtime/room-code";

/** 2v2 "Rescue Showdown" is the game; the co-op routes only redirect here now. */
export function HostButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/versus/host/${generateRoomCode()}`)}
      className="btn-buoy h-14 rounded-xl border-2 border-[#12324a] text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12324a]"
    >
      Host a game
    </button>
  );
}

export function JoinForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const valid = isValidRoomCode(code);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) router.push(`/versus/room/${code}`);
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
        placeholder="CODE"
        aria-label="Room code"
        autoCapitalize="characters"
        className="h-14 w-0 min-w-0 flex-1 rounded-xl border-2 border-[#12324a] bg-foam px-4 text-center font-poster text-2xl tracking-[0.3em] text-[#12324a] placeholder:text-[#12324a]/30 focus:outline-2 focus:outline-offset-2 focus:outline-[#12324a]"
      />
      <button
        type="submit"
        disabled={!valid}
        className="h-14 rounded-xl bg-[#12324a] px-5 text-lg font-bold text-foam transition-opacity disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12324a]"
      >
        Join
      </button>
    </form>
  );
}
