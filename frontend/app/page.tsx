import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  Camera,
  MapPin,
  Quote,
  Route,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LandingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <BackgroundDecor />

      <SiteHeader />

      <Hero />
      <StatsBand />
      <Quotes />
      <Features />
      <FinalCta />

      <SiteFooter />
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/*                              Background decor                              */
/* -------------------------------------------------------------------------- */
function BackgroundDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      {/* radial glows */}
      <div className="absolute -top-40 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.22),transparent_70%)] blur-2xl" />
      <div className="absolute top-[34rem] -left-32 h-[420px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(96,165,250,0.10),transparent_70%)] blur-3xl" />
      <div className="absolute top-[58rem] -right-40 h-[420px] w-[640px] rounded-full bg-[radial-gradient(closest-side,rgba(244,114,182,0.08),transparent_70%)] blur-3xl" />
      {/* faint grid */}
      <div
        className="absolute inset-0 opacity-[0.06] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_85%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Header                                    */
/* -------------------------------------------------------------------------- */
function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-border/50 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
            <Accessibility className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <span className="font-semibold tracking-tight text-[15px]">
            AccessMap <span className="text-primary">AI</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <a href="#impact" className="px-3 py-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
            Impact
          </a>
          <a href="#voices" className="px-3 py-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
            Voices
          </a>
          <a href="#capabilities" className="px-3 py-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
            Capabilities
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-sm")}
          >
            Sign in
          </Link>
          <Link
            href="/app"
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5 text-sm")}
          >
            Open the map <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Hero                                    */
/* -------------------------------------------------------------------------- */
function Hero() {
  return (
    <section className="relative mx-auto flex w-full max-w-6xl flex-col items-start gap-10 px-5 pt-20 pb-24 md:px-8 md:pt-28 md:pb-32">
      <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/[0.07] px-3 py-1 text-primary text-xs">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        <span className="font-medium tracking-wide uppercase">Accessibility-first navigation</span>
      </div>

      <h1 className="max-w-4xl text-balance font-semibold text-5xl leading-[1.04] tracking-[-0.025em] md:text-7xl">
        The world was{" "}
        <span className="text-muted-foreground/70">not built equally</span>{" "}
        for everyone.
      </h1>

      <p className="max-w-2xl text-balance text-foreground/80 text-lg md:text-xl">
        AccessMap AI helps make cities <span className="text-foreground">understandable</span>,{" "}
        <span className="text-foreground">navigable</span>, and{" "}
        <span className="text-foreground">accessible</span> for all — by routing around the things
        most maps don&apos;t see.
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Link
          href="/app"
          className={cn(buttonVariants({ size: "lg" }), "h-12 gap-2 px-5 text-[15px]")}
        >
          Open the map
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
        <a
          href="#impact"
          className={cn(
            buttonVariants({ variant: "outline", size: "lg" }),
            "h-12 px-5 text-[15px] hover:bg-muted/40",
          )}
        >
          Why it matters
        </a>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Stats band                                  */
/* -------------------------------------------------------------------------- */
function StatsBand() {
  return (
    <section
      id="impact"
      className="relative mx-auto w-full max-w-6xl px-5 pb-24 md:px-8 md:pb-32"
    >
      <div className="overflow-hidden rounded-3xl border border-border bg-card/70 backdrop-blur-sm">
        <div className="grid gap-px bg-border/60 md:grid-cols-3">
          <StatCell
            kicker="In the United States"
            number="1 in 4"
            unit="adults"
            caption="lives with a disability."
          />
          <StatCell
            kicker="That is more than"
            number="70M+"
            unit="people"
            caption="navigating environments that were not designed for them."
          />
          <StatCell
            kicker="Every single day"
            number="∞"
            unit="barriers"
            caption="from missing curb ramps to broken sidewalks, hidden in every route."
            isLast
          />
        </div>
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-balance text-center text-muted-foreground text-base md:text-[17px]">
        Most navigation tools are built for cars and able-bodied pedestrians. AccessMap AI
        is built for the rest of the city — the curb ramps, the construction, the noise,
        the slope, the lighting, the things that turn a 10-minute walk into an impossible one.
      </p>
    </section>
  );
}

function StatCell({
  kicker,
  number,
  unit,
  caption,
  isLast,
}: {
  kicker: string;
  number: string;
  unit: string;
  caption: string;
  isLast?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 bg-card p-8 md:p-10",
        isLast && "md:rounded-r-3xl",
      )}
    >
      <span className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
        {kicker}
      </span>
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-6xl leading-none tracking-[-0.04em] tabular-nums md:text-7xl">
          {number}
        </span>
        <span className="text-muted-foreground text-base">{unit}</span>
      </div>
      <p className="max-w-xs text-balance text-foreground/85 text-base leading-relaxed">
        {caption}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Quotes                                    */
/* -------------------------------------------------------------------------- */
function Quotes() {
  const quotes: { text: string; tag: string; icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }> }[] = [
    {
      text: "Most navigation apps optimize for speed — not accessibility.",
      tag: "On the status quo",
      icon: Route,
    },
    {
      text: "A missing curb ramp can make an entire route impossible.",
      tag: "On the human cost",
      icon: ShieldAlert,
    },
  ];

  return (
    <section
      id="voices"
      className="relative mx-auto w-full max-w-6xl px-5 pb-24 md:px-8 md:pb-32"
    >
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <span className="font-medium text-primary text-xs uppercase tracking-[0.18em]">
            Voices
          </span>
          <h2 className="mt-2 max-w-xl font-semibold text-3xl leading-tight tracking-[-0.02em] md:text-4xl">
            What&apos;s broken about how cities route us.
          </h2>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {quotes.map(({ text, tag, icon: Icon }) => (
          <figure
            key={text}
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-8 transition-colors hover:border-primary/40 md:p-10"
          >
            <Quote
              className="absolute -top-3 -left-3 h-24 w-24 text-primary/[0.07] transition-colors group-hover:text-primary/[0.12]"
              aria-hidden
            />
            <div className="flex items-center gap-2 text-primary text-xs">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              <span className="font-medium uppercase tracking-[0.18em]">{tag}</span>
            </div>
            <blockquote className="relative mt-5 text-balance font-medium text-2xl leading-snug tracking-[-0.015em] md:text-[28px]">
              &ldquo;{text}&rdquo;
            </blockquote>
          </figure>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                Capabilities                                */
/* -------------------------------------------------------------------------- */
function Features() {
  const features = [
    {
      icon: Route,
      title: "Profile-aware routing",
      body:
        "Every step weighed against your needs — slope, surface, stairs, curb ramps, tactile paving, audible crossings, lighting.",
    },
    {
      icon: ShieldAlert,
      title: "Live community hazards",
      body:
        "Construction, broken ramps, blocked sidewalks — reported by users, scored against your profile, baked into the route.",
    },
    {
      icon: Camera,
      title: "AI sidewalk analysis",
      body:
        "Snap a photo of a path and Gemini describes the surface, slope, obstructions, and gives an accessibility score.",
    },
  ];

  return (
    <section
      id="capabilities"
      className="relative mx-auto w-full max-w-6xl px-5 pb-24 md:px-8 md:pb-32"
    >
      <div className="mb-12 max-w-2xl">
        <span className="font-medium text-primary text-xs uppercase tracking-[0.18em]">
          Built for the route, not the road
        </span>
        <h2 className="mt-2 font-semibold text-3xl leading-tight tracking-[-0.02em] md:text-4xl">
          A map that listens to the people walking it.
        </h2>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <div
            key={title}
            className="group rounded-3xl border border-border bg-card p-7 transition-colors hover:border-primary/40"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25 transition-transform group-hover:scale-105">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <h3 className="mt-5 font-semibold text-lg tracking-tight">{title}</h3>
            <p className="mt-2 text-foreground/75 text-[15px] leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Final CTA                                  */
/* -------------------------------------------------------------------------- */
function FinalCta() {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 pb-28 md:px-8 md:pb-36">
      <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/[0.18] via-primary/[0.07] to-transparent p-10 md:p-16">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[radial-gradient(closest-side,rgba(124,92,255,0.45),transparent_70%)] blur-2xl"
        />

        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <span className="font-medium text-primary text-xs uppercase tracking-[0.18em]">
              Try it
            </span>
            <h2 className="mt-2 text-balance font-semibold text-3xl leading-[1.1] tracking-[-0.02em] md:text-5xl">
              Make navigation work for everyone.
            </h2>
            <p className="mt-4 max-w-xl text-foreground/80 text-base md:text-lg">
              Pick a profile, drop two pins, and watch the map route around the things
              other apps pretend aren&apos;t there.
            </p>
          </div>

          <div className="flex flex-col items-stretch gap-3 sm:flex-row md:items-center">
            <Link
              href="/app"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-12 gap-2 px-6 text-[15px]",
              )}
            >
              <MapPin className="h-4 w-4" aria-hidden />
              Open the map
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/signup"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 gap-2 px-6 text-[15px] hover:bg-card",
              )}
            >
              <Users className="h-4 w-4" aria-hidden />
              Create an account
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  Footer                                    */
/* -------------------------------------------------------------------------- */
function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 px-5 py-8 text-muted-foreground text-sm md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary ring-1 ring-primary/30">
            <Accessibility className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-medium text-foreground/85 text-sm">
            AccessMap <span className="text-primary">AI</span>
          </span>
        </div>
        <p className="text-xs">
          Routing the city for the 1 in 4 it forgot. Data: OSM, Supabase, Gemini.
        </p>
      </div>
    </footer>
  );
}
