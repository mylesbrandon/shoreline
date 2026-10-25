"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ship, Swords } from "lucide-react";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "@/lib/realtime/room-code";

export function HostButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/host/${generateRoomCode()}`)}
      className="flex h-14 items-center justify-center gap-2 rounded-xl bg-teal font-semibold uppercase tracking-[0.2em] text-abyss transition hover:brightness-110 active:scale-[0.98]"
    >
      <Ship className="size-5" /> Host a rescue
    </button>
  );
}

/** 2v2 "Rescue Showdown". Co-op stays the primary button; this sits directly under it. */
export function VersusHostButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/versus/host/${generateRoomCode()}`)}
      className="flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-teal font-semibold uppercase tracking-[0.2em] text-teal transition hover:brightness-110 active:scale-[0.98]"
    >
      <Swords className="size-5" /> Host a Rescue Showdown (2v2)
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
        if (valid) router.push(`/room/${code}`);
      }}
    >
      <input
        value={code}
        onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
        placeholder="CODE"
        aria-label="Room code"
        autoCapitalize="characters"
        className="h-14 w-0 min-w-0 flex-1 rounded-xl border border-hull bg-navy px-4 text-center font-mono text-2xl tracking-[0.4em] text-foam placeholder:text-hull focus:border-teal focus:outline-none"
      />
      <button
        type="submit"
        disabled={!valid}
        className="h-14 rounded-xl border-2 border-teal px-5 font-semibold uppercase tracking-[0.2em] text-teal disabled:opacity-40"
      >
        Join
      </button>
    </form>
  );
}
