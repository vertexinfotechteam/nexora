import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Check,
  Database,
  FileSpreadsheet,
  GraduationCap,
  LifeBuoy,
  Lock,
  Play,
  ShieldCheck,
  Timer,
  TrendingUp,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo";
import { Reveal } from "@/components/visual/reveal";
import { LiveDemoChart, LiveDemoPoll } from "./live-demo";
import { TEAM, COMPANY } from "@/lib/team";

/* -------------------------------------------------------------------------- */
/* Hero                                                                       */
/* -------------------------------------------------------------------------- */

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="nx-datafield relative overflow-hidden">
      {/* Layered atmosphere: grid, two halos in the mark's colours, and a
          hairline that traces the section edge. */}
      <div aria-hidden className="nx-hero-grid absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="nx-halo absolute left-[8%] top-[-14%] -z-10 h-[420px] w-[520px] rounded-full bg-[var(--nx-purple-soft)] blur-[130px]"
      />
      <div
        aria-hidden
        className="nx-halo absolute right-[4%] top-[6%] -z-10 h-[380px] w-[460px] rounded-full blur-[140px]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--nx-logo-green) 26%, transparent) 0%, transparent 70%)",
          animationDelay: "2.5s",
        }}
      />

      {/*
        Columns start at the top rather than centring.
        The demo stack on the right is far taller than the copy on the left, so
        centring pushed the headline ~90px down and opened a band of empty page
        directly under the navbar — the first thing a visitor saw was nothing.
      */}
      <div className="mx-auto grid max-w-6xl items-start gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pb-24 lg:pt-12">
        <div>
          <span className="nx-rise nx-sheen inline-flex items-center gap-1.5 rounded-full border border-[var(--nx-border)] bg-[var(--nx-card)] px-3 py-1 text-[11.5px] text-[var(--nx-text-muted)] shadow-[var(--nx-shadow)]">
            <LogoMark className="h-3.5 w-3.5" />
            Powered by {COMPANY.name}
          </span>

          <h1 className="nx-rise nx-delay-1 mt-4 text-[34px] font-semibold leading-[1.08] tracking-tight sm:text-[44px] lg:text-[50px]">
            Ask a question.
            <br />
            <span className="nx-gradient-text">Get the analysis,</span>
            <br />
            not a guess.
          </h1>

          <p className="nx-rise nx-delay-2 mt-4 max-w-xl text-[14.5px] leading-relaxed text-[var(--nx-text-muted)]">
            Upload a spreadsheet and describe what you need in plain English.
            Nexus profiles the data, runs the calculations, finds what is
            unusual, forecasts what is next — and shows you every step as it
            happens. Every figure is computed from your file. Nothing is
            invented, and anything the AI cannot prove never reaches your screen.
          </p>

          <div className="nx-rise nx-delay-3 mt-6 flex flex-wrap items-center gap-2.5">
            {signedIn ? (
              <Button asChild size="lg" variant="primary" className="group">
                <Link href="/dashboard">
                  Open your dashboard
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg" variant="primary" className="group">
                  <Link href="/signup">
                    Create account free
                    <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">
                    <Play className="h-4 w-4" />
                    Sign in
                  </Link>
                </Button>
              </>
            )}
          </div>

          <ul className="nx-rise nx-delay-4 mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] text-[var(--nx-text-muted)]">
            {[
              "10 free analysis credits",
              "No card required",
              "PDF & Excel export",
            ].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-[var(--nx-success)]" />
                {item}
              </li>
            ))}
          </ul>

          {/*
            Fills the band that opened under the copy once the columns were
            top-aligned — the demo stack on the right is much taller, so the
            left ran out of content halfway down.

            It shows the four steps an analysis actually goes through, which is
            the one thing the product does that a spreadsheet does not: you
            watch it work. Ornament would have filled the same space and said
            nothing.
          */}
          <PipelinePreview />
        </div>

        <div className="nx-rise nx-delay-3 space-y-3">
          <LiveDemoChart />
          <LiveDemoPoll />
        </div>
      </div>
    </section>
  );
}


/**
 * The four stages of an analysis, drawn as a track.
 *
 * Static markup with a CSS-driven sweep; nothing here fetches or computes, so
 * it stays honest about being an illustration rather than a live readout.
 */
const PIPELINE = [
  { label: "Read the file", detail: "columns, types, gaps" },
  { label: "Compute", detail: "totals, trends, breakdowns" },
  { label: "Check", detail: "every figure re-derived" },
  { label: "Explain", detail: "PDF and Excel, ready to send" },
];

function PipelinePreview() {
  return (
    <div className="nx-rise nx-delay-5 mt-8 hidden lg:block" aria-hidden>
      <p className="nx-label mb-3">What happens when you upload</p>

      <ol className="relative flex items-stretch gap-2">
        {/* The rail the pulse travels along. */}
        <span className="absolute left-0 right-0 top-[13px] h-px bg-[var(--nx-border)]" />
        <span className="nx-rail absolute left-0 top-[13px] h-px w-1/3" />

        {PIPELINE.map((stage, index) => (
          <li key={stage.label} className="relative flex-1">
            <span
              className="nx-node relative z-10 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--nx-border)] bg-[var(--nx-card)] text-[10.5px] font-semibold text-[var(--nx-accent)] shadow-[var(--nx-shadow)]"
              style={{ animationDelay: `${index * 0.6}s` }}
            >
              {index + 1}
            </span>
            <p className="mt-2 text-[11.5px] font-medium leading-tight">
              {stage.label}
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-[var(--nx-text-faint)]">
              {stage.detail}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Product                                                                    */
/* -------------------------------------------------------------------------- */

const FEATURES = [
  {
    icon: Zap,
    title: "One task, a full analysis",
    body: "Describe what you want once. Nexus profiles every column, computes the headline measures, breaks them down by your strongest dimensions, hunts for anomalies and fits a forecast — without being asked for each piece separately.",
  },
  {
    icon: Timer,
    title: "Watch it work, live",
    body: "A running feed shows each step as it happens: the query written, the safety check passed, the rows returned, the chart chosen. Expand any step to see the exact SQL and the values it produced.",
  },
  {
    icon: BadgeCheck,
    title: "Numbers you can check",
    body: "The AI plans and explains; the engine calculates. Every figure in a written summary is matched against a computed value before you see it, and rejected if it does not match.",
  },
  {
    icon: TrendingUp,
    title: "Real statistics, stated honestly",
    body: "Anomaly detection uses robust scoring that outliers cannot distort. Forecasts are backtested against unseen periods, and tell you plainly when the history is too short to trust.",
  },
  {
    icon: FileSpreadsheet,
    title: "Reports that ship",
    body: "Every analysis becomes a PDF and an Excel workbook carrying your logo and signature — executive summary, charts, anomalies, forecast, recommendations and the full method trail.",
  },
  {
    icon: Lock,
    title: "Sealed by design",
    body: "Your data loads into a query engine with no network and no filesystem access, enforced by the engine itself. Uploaded content is treated as untrusted, so instructions hidden in a spreadsheet go nowhere.",
  },
];

export function Product() {
  return (
    <section id="product" className="nx-datafield border-t border-[var(--nx-border)] py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><SectionHeading
          eyebrow="Product"
          title="Everything an analyst does, in the time it takes to ask"
          subtitle="Not a chatbot bolted onto a spreadsheet. A real analytics engine with an AI planner in front of it, and a verification layer behind it."
        /></Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="nx-lift group rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5 hover:-translate-y-1 hover:border-[var(--nx-logo-green)] hover:shadow-[var(--nx-shadow-lg)]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--nx-purple-soft)] text-[var(--nx-purple-fg)] transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-4 w-4" />
                </span>
                <h3 className="mt-3 text-[14px] font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--nx-text-muted)]">
                  {feature.body}
                </p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Pricing                                                                    */
/* -------------------------------------------------------------------------- */

const PLANS = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    blurb: "Everything you need to judge whether this works for your data.",
    credits: "10 AI analysis credits",
    features: [
      "Unlimited dataset uploads",
      "Full statistical pipeline",
      "Anomaly detection & forecasting",
      "PDF and Excel export",
      "Branded reports with your logo",
      "24/7 assistant",
    ],
    cta: "Create account free",
    href: "/signup",
    highlight: false,
  },
  {
    name: "Pro",
    price: "$29",
    cadence: "per user / month",
    blurb: "For the person who owns the numbers and has to defend them.",
    credits: "500 AI analysis credits / month",
    features: [
      "Everything in Free",
      "Scheduled analyses",
      "Saved dashboards",
      "Priority processing",
      "Larger file limits",
      "Email support",
    ],
    cta: "Start with Pro",
    href: "/signup?plan=pro",
    highlight: true,
  },
  {
    name: "Business",
    price: "$99",
    cadence: "per user / month",
    blurb: "For teams who need shared answers and an audit trail.",
    credits: "2,500 AI analysis credits / month",
    features: [
      "Everything in Pro",
      "Shared workspaces & roles",
      "Governance and audit log",
      "SSO ready",
      "Custom report branding",
      "Onboarding session",
    ],
    cta: "Start with Business",
    href: "/signup?plan=business",
    highlight: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    cadence: "talk to us",
    blurb: "Deployed where your data already lives, on your terms.",
    credits: "Unlimited analysis credits",
    features: [
      "Everything in Business",
      "Private or on-premise deployment",
      "Bring your own model keys",
      "Security review & DPA",
      "SLA and named contact",
      "Custom integrations",
    ],
    cta: "Contact sales",
    href: "mailto:hello@vertexinfotech.com?subject=Nexus%20AI%20Enterprise",
    highlight: false,
  },
];

export function Pricing() {
  return (
    <section
      id="pricing"
      className="nx-datafield border-t border-[var(--nx-border)] bg-[var(--nx-surface)] py-16 lg:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><SectionHeading
          eyebrow="Pricing"
          title="Start free. Pay when it earns its place."
          subtitle="Every plan runs the same analytics engine. What changes is how much you can run and how many people you run it with."
        /></Reveal>

        <div className="mt-10 grid gap-4 lg:grid-cols-4">
          {PLANS.map((plan) => (
            <article
              key={plan.name}
              className={
                plan.highlight
                  ? "nx-ring nx-lift relative flex flex-col rounded-xl border-2 border-[var(--nx-purple)] bg-[var(--nx-card)] p-5 shadow-[var(--nx-shadow-lg)] hover:-translate-y-1"
                  : "nx-lift relative flex flex-col rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5 hover:-translate-y-1 hover:border-[var(--nx-logo-green)] hover:shadow-[var(--nx-shadow-lg)]"
              }
            >
              {plan.highlight ? (
                <span className="absolute -top-2.5 left-5 rounded-full bg-[var(--nx-purple)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--nx-purple-on)]">
                  Most popular
                </span>
              ) : null}

              <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--nx-text-muted)]">
                {plan.name}
              </h3>
              <p className="mt-2 flex items-baseline gap-1.5">
                <span className="text-[30px] font-semibold leading-none tracking-tight">
                  {plan.price}
                </span>
                <span className="text-[11.5px] text-[var(--nx-text-muted)]">
                  {plan.cadence}
                </span>
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
                {plan.blurb}
              </p>

              <p className="mt-3 rounded-md bg-[var(--nx-accent-soft)] px-2.5 py-1.5 text-[11.5px] font-medium text-[var(--nx-accent-fg-on-soft)]">
                {plan.credits}
              </p>

              <ul className="mt-4 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-1.5 text-[12px]">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--nx-success)]" />
                    <span className="text-[var(--nx-text-muted)]">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className="mt-5 w-full"
                variant={plan.highlight ? "primary" : "secondary"}
              >
                <Link href={plan.href}>{plan.cta}</Link>
              </Button>
            </article>
          ))}
        </div>

        <p className="mt-6 text-center text-[11.5px] text-[var(--nx-text-muted)]">
          Credits are consumed by AI analyses only. Uploading data, browsing
          dashboards and re-downloading reports you already generated are always
          free.
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Resources                                                                  */
/* -------------------------------------------------------------------------- */

const RESOURCES = [
  {
    icon: BookOpen,
    tag: "Guide",
    title: "Getting your first answer in five minutes",
    body: "Upload a CSV, ask one question, and read the activity feed to see exactly how the result was reached.",
  },
  {
    icon: ShieldCheck,
    tag: "Technical",
    title: "How we stop an AI inventing numbers",
    body: "The verification layer explained: what gets checked, what gets rejected, and what you are shown when a figure fails.",
  },
  {
    icon: TrendingUp,
    tag: "Method",
    title: "Forecasting without false confidence",
    body: "Why we backtest against unseen periods, and why an honest wide interval beats a confident wrong line.",
  },
  {
    icon: Database,
    tag: "Data",
    title: "Preparing a file that analyses well",
    body: "One row per event, a real date column, consistent categories. What the profiler flags, and why it matters.",
  },
  {
    icon: Workflow,
    tag: "Workflow",
    title: "From upload to board pack",
    body: "Turning a raw export into a branded PDF and Excel report your leadership team can read without a translator.",
  },
  {
    icon: GraduationCap,
    tag: "Learn",
    title: "Reading an anomaly report",
    body: "What actual, expected, deviation and confidence each mean — and when a flagged point is a data problem, not a business one.",
  },
];

export function Resources() {
  return (
    <section id="resources" className="nx-datafield border-t border-[var(--nx-border)] py-16 lg:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><SectionHeading
          eyebrow="Resources"
          title="Learn the method, not just the buttons"
          subtitle="Short, practical writing on getting trustworthy answers out of imperfect data."
        /></Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {RESOURCES.map((resource) => {
            const Icon = resource.icon;
            return (
              <article
                key={resource.title}
                className="nx-lift flex flex-col rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5 hover:-translate-y-1 hover:border-[var(--nx-logo-green)] hover:shadow-[var(--nx-shadow-lg)]"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--nx-accent-soft)] text-[var(--nx-accent-fg-on-soft)]">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="rounded-full bg-[var(--nx-elevated)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--nx-text-muted)]">
                    {resource.tag}
                  </span>
                </div>
                <h3 className="mt-3 text-[13.5px] font-semibold leading-snug">
                  {resource.title}
                </h3>
                <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-[var(--nx-text-muted)]">
                  {resource.body}
                </p>
                <p className="mt-3 text-[11.5px] font-medium text-[var(--nx-text-faint)]">
                  Coming soon
                </p>
              </article>
            );
          })}
        </div>

        <div className="mt-6 flex items-center gap-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4">
          <LifeBuoy className="h-4 w-4 shrink-0 text-[var(--nx-purple)]" />
          <p className="text-[12.5px] text-[var(--nx-text-muted)]">
            Need something specific? The assistant in the corner answers product
            questions around the clock, and the {COMPANY.name} team picks up
            anything it cannot.
          </p>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Team                                                                       */
/* -------------------------------------------------------------------------- */

export function Team() {
  return (
    <section
      id="team"
      className="nx-datafield border-t border-[var(--nx-border)] bg-[var(--nx-surface)] py-16 lg:py-20"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal><SectionHeading
          eyebrow="Team"
          title={`The people behind ${COMPANY.product}`}
          subtitle={`A small team at ${COMPANY.name} with one shared rule: if we cannot show where a number came from, it does not ship.`}
        /></Reveal>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEAM.map((member) => (
            <article
              key={member.name}
              className="nx-lift rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5 hover:-translate-y-1 hover:border-[var(--nx-logo-green)] hover:shadow-[var(--nx-shadow-lg)]"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--nx-purple)] to-[var(--nx-accent)] text-[14px] font-semibold text-white">
                  {member.initials}
                </span>
                {/* Names only. Titles invite a hierarchy read that says
                    nothing about the product. */}
                <h3 className="min-w-0 truncate text-[14px] font-semibold">
                  {member.name}
                </h3>
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
                {member.focus}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* CTA + footer                                                               */
/* -------------------------------------------------------------------------- */

export function FinalCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-t border-[var(--nx-border)] py-16 lg:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[32px]">
          Your data already has the answer.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-[var(--nx-text-muted)]">
          Ten free credits, no card, no sales call. Upload one file and see
          whether the result stands up to your own scrutiny — that is the only
          test that matters.
        </p>
        <div className="mt-6 flex justify-center gap-2.5">
          <Button asChild size="lg" variant="primary">
            <Link href={signedIn ? "/dashboard" : "/signup"}>
              {signedIn ? "Open your dashboard" : "Create account free"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const columns: { title: string; links: { label: string; href: string }[] }[] = [
    {
      title: "Product",
      links: [
        { label: "Overview", href: "#product" },
        { label: "AI assistant", href: "#product" },
        { label: "Pricing", href: "#pricing" },
        { label: "Start free", href: "/signup" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: COMPANY.name, href: "/company" },
        { label: "FAQ", href: "/faq" },
        { label: "Contact support", href: "/contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms of service", href: "/terms" },
        { label: "Privacy policy", href: "/privacy" },
        { label: "Refunds & cancellation", href: "/refunds" },
      ],
    },
  ];

  /*
   * Dark footer, to the reference design.
   *
   * Every link is one that already existed — the same ten routes, regrouped
   * into the reference's shape. Nothing here was added, removed or rewired.
   *
   * The colours are literal rather than tokens on purpose: this block is a
   * deliberate dark island at the foot of a light page, so it must not follow
   * the surface tokens the rest of the site uses.
   */
  return (
    <footer className="relative overflow-hidden bg-[#0d1b26] text-[#dbe4ea]">
      {/* Teal wash rising from the lower right, as in the reference. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 120% at 78% 118%, rgba(28,138,106,0.42) 0%, rgba(13,27,38,0) 62%)",
        }}
      />
      {/* The navbar's drifting hairline, repeated along the top edge so the two
          bars are recognisably the same family. */}
      <span
        aria-hidden
        className="nx-scan pointer-events-none absolute inset-x-0 top-0 h-px"
      />

      <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.4fr]">
        <div>
          <LogoMark className="h-9 w-9" />
          <p className="mt-4 max-w-[15rem] text-[12.5px] leading-relaxed text-[#94a7b4]">
            Building smart analytics that let a team grow, automate and defend
            every number they report.
          </p>
          <p className="mt-4 text-[12px] text-[#94a7b4]">
            A product by{" "}
            <Link
              href="/company"
              className="font-semibold text-[#dbe4ea] transition-colors hover:text-[var(--nx-logo-green)]"
            >
              {COMPANY.name}
            </Link>
            .
          </p>
        </div>

        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h2 className="text-[13px] font-semibold text-white">
              {column.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-[12.5px] text-[#94a7b4] transition-colors hover:text-[var(--nx-logo-green)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <div>
          <h2 className="text-[13px] font-semibold text-white">
            Questions about your data?
          </h2>
          <p className="mt-3 text-[12.5px] leading-relaxed text-[#94a7b4]">
            {/*
              The reference has a newsletter box here. There is no mailing list
              behind this site, and an input that swallows an address without
              storing it anywhere is worse than no input — so this points at
              the contact form, which is real and does reach a person.
            */}
            Write to us and someone from {COMPANY.name} will read it and reply.
          </p>
          <Link
            href="/#contact"
            className="nx-press mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--nx-logo-green)] px-4 text-[12.5px] font-semibold text-white transition-colors hover:brightness-110"
          >
            Ask our team
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      <div className="relative border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-5 text-center text-[12px] text-[#7c8f9d] sm:px-6 md:flex-row md:items-center md:text-left">
          <p>
            © {new Date().getFullYear()} {COMPANY.product}. All rights reserved.
          </p>
          <p className="md:ml-auto">
            Sample figures on this page are illustrative and are not connected to
            any live system.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--nx-accent)]">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight sm:text-[30px]">
        {title}
      </h2>
      <p className="mt-2.5 text-[13.5px] leading-relaxed text-[var(--nx-text-muted)]">
        {subtitle}
      </p>
    </div>
  );
}
