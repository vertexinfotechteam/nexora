import type { Metadata } from "next";
import { MarketingPage, Section } from "@/components/landing/page-shell";
import { COMPANY, TEAM } from "@/lib/team";

export const metadata: Metadata = { title: COMPANY.name };

export default function CompanyPage() {
  return (
    <MarketingPage
      eyebrow="Company"
      title={COMPANY.name}
      intro={`${COMPANY.tagline} We build ${COMPANY.product} — analytics software for teams who have to stand behind the numbers they present.`}
    >
      <Section title="Why we built it">
        <p>
          Most AI analytics tools ask you to trust a paragraph of confident
          prose. We watched enough confident, wrong paragraphs to decide the
          opposite: the model should plan the work and explain the result, and a
          real engine should do every calculation. If a sentence contains a
          number the engine did not produce, that sentence does not ship.
        </p>
        <p>
          That single rule shapes the whole product — the live activity feed, the
          verification layer, the honest labelling on forecasts, and the method
          trail printed at the back of every report.
        </p>
      </Section>

      <Section title="The team">
        <div className="mt-1 grid gap-3 sm:grid-cols-2">
          {TEAM.map((member) => (
            <div
              key={member.name}
              className="rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-4"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--nx-purple)] text-[13px] font-semibold text-[var(--nx-purple-on)]">
                  {member.initials}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold text-[var(--nx-text)]">
                    {member.name}
                  </p>
                  <p className="text-[12px] font-medium text-[var(--nx-purple)]">
                    {member.role}
                  </p>
                </div>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed">
                {member.focus}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="How to reach us">
        <p>
          Product questions are answered around the clock by the assistant in the
          corner. Anything commercial, legal or technical that it cannot handle
          goes to a person through the contact page.
        </p>
      </Section>
    </MarketingPage>
  );
}
