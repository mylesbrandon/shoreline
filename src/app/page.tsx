import { VERSUS } from "@/game/versus/contract";
import { Wordmark } from "@/components/shared/Wordmark";
import { HostButton, JoinForm } from "./LandingActions";
import { resolveTransportKind } from "@/lib/realtime/env";
import { ModeBadge } from "@/components/shared/ModeBadge";

export default function Home() {
  const mode = resolveTransportKind() === "supabase" ? "live" : "mock";
  return (
    <div className="flex min-h-dvh flex-col">
      <main className="mx-auto grid w-full max-w-4xl flex-1 content-start gap-8 px-4 pt-10 pb-10 sm:px-8 sm:pt-16">
        <header className="grid gap-5">
          <ModeBadge mode={mode} />
          <h1 className="text-[clamp(3rem,13vw,7.5rem)] leading-none">
            <Wordmark />
          </h1>
          <p className="max-w-[36ch] text-xl leading-snug text-mist sm:text-2xl">
            The rip is pulling swimmers past the buoys. Two lifeguard crews race to bring them in, and the crew with more
            rescues after {VERSUS.matchDurationMs / 1000} seconds wins.
          </p>
        </header>

        {/* One painted board, like the sign on a lifeguard tower: laptop on the left, phones on the right. */}
        <section
          aria-label="Play"
          className="grid gap-6 rounded-[10px] border-2 border-wet-sand bg-sand p-5 text-[#12324a] shadow-[0_6px_0_#c99a52] sm:grid-cols-2 sm:gap-0 sm:p-7"
        >
          <div className="grid content-start gap-3 sm:pr-7">
            <h2 className="font-poster text-2xl">On the laptop</h2>
            <HostButton />
            <p className="text-base leading-snug">It becomes the big screen: both crews, the clock and the score.</p>
          </div>
          <div className="grid content-start gap-3 border-t-2 border-dashed border-wet-sand pt-6 sm:border-t-0 sm:border-l-2 sm:pt-0 sm:pl-7">
            <h2 className="font-poster text-2xl">On each phone</h2>
            <JoinForm />
            <p className="text-base leading-snug">Scan the QR code on the laptop, or type the code under it.</p>
          </div>
        </section>
      </main>

      <footer className="shoreline" aria-hidden />
    </div>
  );
}
