import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { LandingNavbar } from "./navbar";
import { AiAssistant } from "./ai-assistant";
import { Footer } from "./sections";

/**
 * Shell for the static marketing pages (legal, company, FAQ, contact).
 * Same navigation, footer and assistant as the landing page so a visitor never
 * feels they have left the site.
 */
export async function MarketingPage({
  eyebrow,
  title,
  intro,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  children: React.ReactNode;
}) {
  const session = await getSession();

  return (
    <div className="min-h-screen bg-[var(--nx-bg)]">
      <LandingNavbar signedIn={Boolean(session)} />

      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-[var(--nx-purple)]">
          {eyebrow}
        </p>
        <h1 className="mt-2 text-[30px] font-semibold leading-tight tracking-tight sm:text-[36px]">
          {title}
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--nx-text-muted)]">
          {intro}
        </p>
        {updated ? (
          <p className="mt-3 text-[12px] text-[var(--nx-text-faint)]">
            Last updated {updated}
          </p>
        ) : null}

        <div className="mt-10 space-y-8">{children}</div>

        <div className="mt-14 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5">
          <p className="text-[13.5px] font-semibold">Still have a question?</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--nx-text-muted)]">
            The assistant in the corner answers product questions around the
            clock, and{" "}
            <Link
              href="/contact"
              className="font-medium text-[var(--nx-purple)] hover:underline"
            >
              contact support
            </Link>{" "}
            reaches a person.
          </p>
        </div>
      </main>

      <Footer />
      <AiAssistant />
    </div>
  );
}

/** A titled block within a marketing page. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
      <div className="mt-2.5 space-y-3 text-[13.5px] leading-relaxed text-[var(--nx-text-muted)]">
        {children}
      </div>
    </section>
  );
}
