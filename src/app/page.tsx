import Link from "next/link";
import { VERSUS, VERSUS_ROLES } from "@/game/versus/contract";
import { Wordmark } from "@/components/shared/Wordmark";
import { VERSUS_ROLE_INFO } from "@/components/shared/teams";
import { HostButton, JoinForm } from "./LandingActions";
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
          Swimmers are getting dragged past the buoys by the rip.{" "}
          <span className="text-foam">
            Two crews, four phones, {VERSUS.matchDurationMs / 1000} seconds. Save the most swimmers.
          </span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="instrument grid gap-3 rounded-2xl p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-mist">On the big screen</h2>
            <HostButton />
          </div>
          <div className="instrument grid gap-3 rounded-2xl p-5">
            <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-mist">On your phone</h2>
            <JoinForm />
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="font-mono text-xs uppercase tracking-[0.25em] text-mist">Each crew · preview each seat with mock data</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {VERSUS_ROLES.map((role) => {
            const info = VERSUS_ROLE_INFO[role];
            const Icon = info.icon;
            return (
              <Link
                key={role}
                href={`/versus/preview?view=${role}`}
                className="instrument group grid gap-2 rounded-2xl p-4 transition hover:-translate-y-0.5"
              >
                <Icon className="size-6 text-teal" />
                <span className="text-lg font-semibold">{info.label}</span>
                <span className="text-sm text-mist">{info.brief}</span>
              </Link>
            );
          })}
        </div>
        <Link href="/versus/preview?view=spectator" className="font-mono text-xs text-mist underline-offset-4 hover:underline">
          Preview spectator screen →
        </Link>
      </section>
    </main>
  );
}
