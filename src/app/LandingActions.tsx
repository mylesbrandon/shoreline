"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Swords } from "lucide-react";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "@/lib/realtime/room-code";

/** 2v2 "Rescue Showdown" is the game; the co-op routes only redirect here now. */
export function HostButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/versus/host/${generateRoomCode()}`)}
      className="btn-buoy flex h-14 items-center justify-center gap-2 rounded-2xl text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam"
    >
      <Swords className="size-5" /> Host a game
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
        className="h-14 w-0 min-w-0 flex-1 rounded-2xl border-2 border-sand/40 bg-abyss/70 px-4 text-center font-poster text-2xl tracking-[0.3em] text-foam placeholder:text-foam/30 focus:border-amber focus:outline-none"
      />
      <button
        type="submit"
        disabled={!valid}
        className="h-14 rounded-2xl bg-teal px-5 text-lg font-bold text-abyss transition-opacity disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foam"
      >
        Join
      </button>
    </form>
  );
}
