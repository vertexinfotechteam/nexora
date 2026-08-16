import type { Metadata } from "next";
import { MarketingPage, Section } from "@/components/landing/page-shell";
import { COMPANY } from "@/lib/team";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Privacy policy"
      intro={`What ${COMPANY.name} collects when you use ${COMPANY.product}, why, and what we never do with it.`}
      updated="13 August 2026"
    >
      <Section title="What we collect">
        <p>
          <strong className="text-[var(--nx-text)]">Account details</strong> —
          your name, business name and email address, so we can identify your
          workspace and contact you about it.
        </p>
        <p>
          <strong className="text-[var(--nx-text)]">Files you upload</strong> —
          stored privately and readable only by your workspace.
        </p>
        <p>
          <strong className="text-[var(--nx-text)]">Activity records</strong> —
          sign-ins, uploads, analyses, exports and deletions, kept as an audit
          trail. Passwords, tokens and secrets are never recorded.
        </p>
      </Section>

      <Section title="What we never do">
        <p>
          We do not sell your data. We do not use your uploaded files to train
          any model. We do not share your data with other customers, and
          workspace isolation is enforced in the database rather than only in
          application code.
        </p>
      </Section>

      <Section title="AI providers">
        <p>
          When an AI provider is configured, the question you type and a
          description of your data&apos;s structure — column names, types and a
          few example values — may be sent to that provider so it can plan the
          analysis. Calculations happen on our side, not theirs. If you would
          rather nothing leaves the system, the platform runs a fully statistical
          mode with no provider configured at all.
        </p>
      </Section>

      <Section title="Where your data lives">
        <p>
          Files are held in private storage with row level security applied at
          the database. The query engine that reads them runs sealed, without
          network or filesystem access, so your data cannot be sent anywhere by
          the analysis itself.
        </p>
      </Section>

      <Section title="How long we keep it">
        <p>
          Uploaded files and their analyses are kept until you delete them or
          close your account. Audit records are retained longer because they are
          a security control, but they never contain the contents of your files.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can access, correct, export or delete your data at any time from
          within the product, or by asking us. We respond to requests within 30
          days.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Privacy questions go to {COMPANY.name} through the contact page, and
          are handled by a person rather than a form response.
        </p>
      </Section>
    </MarketingPage>
  );
}
