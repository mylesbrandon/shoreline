import Link from "next/link";
import { MISSION } from "@/game/config";
import { Wordmark } from "@/components/shared/Wordmark";
import { ROLES } from "@/game/types";
import { ROLE_INFO } from "@/components/shared/roles";
import { HostButton, JoinForm, VersusHostButton } from "./LandingActions";
import { resolveTransportKind } from "@/lib/realtime/env";
import { ModeBadge } from "@/components/shared/ModeBadge";

export default function Home() {
  const mode = resolveTransportKind() === "supabase" ? "live" : "mock";
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col gap-12 px-4 py-10 sm:px-8 sm:py-16">
      <header className="flex items-center justify-between">
        <span className="font-mono text-xs uppercase tracking-[0.35em] text-mist">HowdyHack 2026</span>
        <ModeBadge mode={mode} />
      </header>

      <section className="grid gap-6">
        <h1 className="text-5xl font-bold tracking-tight sm:text-8xl">
          <Wordmark />
        </h1>
        <p className="max-w-xl text-xl text-mist sm:text-2xl">
          A swimmer got dragged past the buoys by the rip.{" "}
          <span className="text-foam">Four lifeguards, four phones, {MISSION.durationMs / 1000} seconds.</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="instrument grid gap-3 rounded-2xl p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-mist">On the big screen</h2>
            <HostButton />
            <VersusHostButton />
          </div>
          <div className="instrument grid gap-3 rounded-2xl p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-mist">On your phone</h2>
            <JoinForm />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-mist">Tower 4&apos;s crew · preview each station with mock data</h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {ROLES.map((role) => {
            const info = ROLE_INFO[role];
            const Icon = info.icon;
            return (
              <Link
                key={role}
                href={`/room/DEMO?preview=${role}`}
                className="instrument group grid gap-2 rounded-2xl p-4 transition hover:-translate-y-0.5"
              >
                <Icon className={`size-6 ${info.accent}`} />
                <span className="text-lg font-semibold">{info.label}</span>
                <span className="text-sm text-mist">{info.brief}</span>
              </Link>
            );
          })}
        </div>
        <Link href="/room/DEMO?preview=spectator" className="font-mono text-xs text-mist underline-offset-4 hover:underline">
          Preview spectator screen →
        </Link>
      </section>
    </main>
  );
}
