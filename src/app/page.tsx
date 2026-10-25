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
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto grid w-full max-w-5xl flex-1 content-start gap-10 px-4 pt-10 pb-6 sm:px-8 sm:pt-16">
        <header className="grid gap-5">
          <div className="flex justify-end">
            <ModeBadge mode={mode} />
          </div>
          <h1 className="text-[clamp(2.75rem,12vw,6.5rem)] leading-none">
            <Wordmark />
          </h1>
          <p className="max-w-[34ch] text-xl leading-snug text-mist sm:text-2xl">
            The rip is pulling swimmers past the buoys. Two lifeguard crews race to bring them in —{" "}
            <span className="text-foam">{VERSUS.matchDurationMs / 1000} seconds, four phones, one laptop.</span>
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2" aria-label="Play">
          <div className="instrument grid content-start gap-3 rounded-3xl p-5">
            <h2 className="text-lg font-semibold text-foam">Join from your phone</h2>
            <JoinForm />
            <p className="text-sm text-mist">The room code is on the laptop, under the QR code.</p>
          </div>
          <div className="instrument grid content-start gap-3 rounded-3xl p-5">
            <h2 className="text-lg font-semibold text-foam">Run the beach from a laptop</h2>
            <HostButton />
            <p className="text-sm text-mist">The laptop is the big screen: both boats, the clock and the score.</p>
          </div>
        </section>

        <section className="grid gap-3" aria-label="Try a seat">
          <h2 className="text-base font-semibold text-mist">Try a seat with practice data</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {VERSUS_ROLES.map((role) => {
              const info = VERSUS_ROLE_INFO[role];
              const Icon = info.icon;
              return (
                <Link
                  key={role}
                  href={`/versus/preview?view=${role}`}
                  className="group flex items-start gap-3 rounded-2xl border border-sand/30 bg-abyss/40 p-4 transition-colors hover:border-sand/70 focus-visible:outline-2 focus-visible:outline-amber"
                >
                  <Icon className="mt-0.5 size-6 shrink-0 text-amber" />
                  <span className="grid gap-0.5">
                    <span className="text-lg font-semibold text-foam">{info.label}</span>
                    <span className="text-sm leading-snug text-mist">{info.brief}</span>
                  </span>
                </Link>
              );
            })}
          </div>
          <Link
            href="/versus/preview?view=spectator"
            className="w-fit text-sm text-mist underline decoration-sand/60 underline-offset-4 hover:text-foam"
          >
            Preview the big screen
          </Link>
        </section>
      </main>

      <footer className="shoreline" aria-hidden>
        <p className="absolute inset-x-0 bottom-5 text-center font-poster text-lg text-wet-sand">HowdyHack 2026</p>
      </footer>
    </div>
  );
}
