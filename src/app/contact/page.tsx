import type { Metadata } from "next";
import Link from "next/link";
import { Bot, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import { MarketingPage, Section } from "@/components/landing/page-shell";
import { COMPANY } from "@/lib/team";

export const metadata: Metadata = { title: "Contact support" };

const ROUTES = [
  {
    icon: Bot,
    title: "Product questions",
    body: "Credits, file formats, exports, how the analysis works. The assistant in the corner answers these instantly, at any hour.",
    action: null,
  },
  {
    icon: Mail,
    title: "Sales and enterprise",
    body: "Pricing for larger teams, private deployment, bringing your own model keys, or a security review before you commit.",
    action: {
      label: "hello@vertexinfotech.com",
      href: "mailto:hello@vertexinfotech.com?subject=NEXORA%20AI%20enquiry",
    },
  },
  {
    icon: LifeBuoy,
    title: "Something is broken",
    body: "An analysis that failed, an export that will not download, a figure that looks wrong. Include your workspace name and roughly when it happened.",
    action: {
      label: "support@vertexinfotech.com",
      href: "mailto:support@vertexinfotech.com?subject=NEXORA%20AI%20support",
    },
  },
  {
    icon: ShieldCheck,
    title: "Security and privacy",
    body: "Vulnerability reports, data protection requests, or questions about how your data is isolated. These are read by a person, not a queue.",
    action: {
      label: "security@vertexinfotech.com",
      href: "mailto:security@vertexinfotech.com?subject=NEXORA%20AI%20security",
    },
  },
];

export default function ContactPage() {
  return (
    <MarketingPage
      eyebrow="Company"
      title="Contact support"
      intro={`Four ways to reach ${COMPANY.name}, depending on what you need. We would rather point you at the fastest route than a single generic inbox.`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {ROUTES.map((route) => {
          const Icon = route.icon;
          return (
            <article
              key={route.title}
              className="flex flex-col rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--nx-purple-soft)] text-[var(--nx-purple-fg)]">
                <Icon className="h-4 w-4" />
              </span>
              <h2 className="mt-3 text-[14px] font-semibold">{route.title}</h2>
              <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-[var(--nx-text-muted)]">
                {route.body}
              </p>
              {route.action ? (
                <a
                  href={route.action.href}
                  className="mt-3 text-[12.5px] font-semibold text-[var(--nx-purple)] hover:underline"
                >
                  {route.action.label}
                </a>
              ) : (
                <p className="mt-3 text-[12.5px] font-semibold text-[var(--nx-purple)]">
                  Open the assistant, bottom right
                </p>
              )}
            </article>
          );
        })}
      </div>

      <Section title="Before you write in">
        <p>
          Most product questions are already answered on the{" "}
          <Link
            href="/faq"
            className="font-medium text-[var(--nx-purple)] hover:underline"
          >
            FAQ
          </Link>
          , which draws from the same knowledge base as the assistant — so the
          two never disagree.
        </p>
        <p>
          If you are reporting a wrong figure, the report&apos;s final page
          contains the full method trail: every step, its timing and the values
          it produced. Sending that page with your message usually resolves it in
          one round trip.
        </p>
      </Section>

      <Section title="Response times">
        <p>
          The assistant is immediate. Email is answered within one working day,
          and security reports are triaged the same day they arrive.
        </p>
      </Section>
    </MarketingPage>
  );
}
