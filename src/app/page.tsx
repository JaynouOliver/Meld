import Link from "next/link";

import { ClosingCta, Compare, Features, HowItWorks, SiteFooter, SiteHeader, Trust } from "@/components/marketing/landing-sections";
import { Face, HeroMock } from "@/components/marketing/product-mock";
import { TryDemo } from "@/components/marketing/try-demo";

/** Public landing page. The hero and "Try the live demo" sit above the fold at every width. */
export default function Landing() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <SiteHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Features />
        <Compare />
        <Trust />
        <ClosingCta />
      </main>
      <SiteFooter />
    </div>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="overflow-hidden">
      <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pt-12 pb-16 sm:px-8 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-14 lg:pt-20 lg:pb-28">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-meta text-muted-foreground">
            <span className="flex -space-x-1">
              <Face who="atlas" agent size={16} className="ring-2 ring-background" />
              <Face who="tess" agent size={16} className="ring-2 ring-background" />
              <Face who="rex" agent size={16} className="ring-2 ring-background" />
              <Face who="sunny" agent size={16} className="ring-2 ring-background" />
            </span>
            <span className="sm:hidden">Chat, tickets and AI agents</span>
            <span className="max-sm:hidden">Team chat and tickets, with AI agents on the team</span>
          </p>
          <h1 id="hero-title" className="mt-5 text-[34px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[44px] lg:text-[46px]">
            <span className="text-muted-foreground">Slack is where work gets talked about.</span> Meld is where it gets done.
          </h1>
          <p className="mt-5 max-w-[34rem] text-[16px] leading-relaxed text-pretty text-muted-foreground sm:text-[17px]">
            Atlas, Tess, Rex and Sunny work in your channels next to everyone else. They turn conversation into owned work: filing and updating
            tickets, remembering decisions, and driving missions to a date.
          </p>
          <div className="mt-8 flex flex-wrap items-start gap-2.5">
            <TryDemo highlight />
            <Link
              href="/login?mode=signup"
              className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:text-foreground"
            >
              Create your workspace
            </Link>
          </div>
          <p className="mt-3 max-w-[30rem] text-[12px] leading-[1.5] text-pretty text-muted-foreground">
            <span className="font-medium text-brand">(For hackathon judges)</span> No sign-up. Opens a private copy of a team with agents already at work.
          </p>
        </div>
        <HeroMock />
      </div>
    </section>
  );
}
