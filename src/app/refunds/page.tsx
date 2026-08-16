import type { Metadata } from "next";
import { MarketingPage, Section } from "@/components/landing/page-shell";
import { COMPANY } from "@/lib/team";

export const metadata: Metadata = { title: "Refunds & cancellation" };

export default function RefundsPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Refunds & cancellation"
      intro="How billing works, how to cancel, and when we refund."
      updated="13 August 2026"
    >
      <Section title="Paid plans are not yet live">
        <p>
          {COMPANY.product} is currently available on the free plan only. Pricing
          for Pro, Business and Enterprise is published so you can plan, but no
          payment provider is connected and no card can be charged today. This
          policy sets out the terms that will apply when paid plans open.
        </p>
      </Section>

      <Section title="Free plan">
        <p>
          The free plan includes 10 AI analysis credits and does not require a
          card. There is nothing to cancel and nothing to refund. You can delete
          your workspace at any time.
        </p>
      </Section>

      <Section title="Cancelling a paid plan">
        <p>
          You will be able to cancel at any time from Settings. Cancellation
          takes effect at the end of the billing period you have already paid
          for — you keep full access until then, and are not charged again.
        </p>
      </Section>

      <Section title="Refunds">
        <p>
          If you cancel within 7 days of a first payment and have used fewer than
          25 credits in that period, we will refund it in full, no questions
          asked.
        </p>
        <p>
          Beyond that window, we refund on a pro-rata basis where the service was
          unavailable for a sustained period through our fault. We do not
          normally refund for unused credits within a period that was otherwise
          available.
        </p>
      </Section>

      <Section title="Failed analyses are never charged">
        <p>
          A credit is consumed only when an analysis completes. If a run fails,
          no credit is deducted. If you believe you have been charged a credit
          for work that did not complete, tell us and we will restore it.
        </p>
      </Section>

      <Section title="How to ask">
        <p>
          Refund requests go to {COMPANY.name} through the contact page. Include
          the workspace name and the approximate date. We aim to resolve within
          five working days.
        </p>
      </Section>
    </MarketingPage>
  );
}
