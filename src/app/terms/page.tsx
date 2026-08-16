import type { Metadata } from "next";
import { MarketingPage, Section } from "@/components/landing/page-shell";
import { COMPANY } from "@/lib/team";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <MarketingPage
      eyebrow="Legal"
      title="Terms of service"
      intro={`The agreement between you and ${COMPANY.name} for use of ${COMPANY.product}. Written plainly, because terms nobody reads protect nobody.`}
      updated="13 August 2026"
    >
      <Section title="1. What this covers">
        <p>
          These terms apply to {COMPANY.product}, operated by {COMPANY.name}. By
          creating an account you agree to them. If you are agreeing on behalf of
          a business, you confirm you are authorised to bind that business.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          You are responsible for keeping your password secure and for activity
          under your account. Passwords are handled by our authentication
          provider and are never stored by {COMPANY.product} itself. Tell us
          promptly if you believe your account has been accessed by someone else.
        </p>
      </Section>

      <Section title="3. Your data stays yours">
        <p>
          You keep all rights to the files you upload and to the outputs
          generated from them. We store your data only to provide the service:
          to profile it, run the analyses you request, and produce the reports
          you export. We do not sell it, and we do not use your data to train
          models.
        </p>
      </Section>

      <Section title="4. Credits and plans">
        <p>
          Free accounts include 10 AI analysis credits. One credit is consumed
          per completed analysis. An analysis that fails does not consume a
          credit. Uploading data, browsing your workspace and re-downloading
          reports you have already generated are free on every plan.
        </p>
      </Section>

      <Section title="5. Acceptable use">
        <p>
          Do not upload data you have no right to process, attempt to breach the
          isolation between workspaces, probe or attack the infrastructure, or
          use the service to build a directly competing product. We may suspend
          an account that does.
        </p>
      </Section>

      <Section title="6. Accuracy and your judgement">
        <p>
          Every figure the service reports is computed from the data you supply,
          and written summaries are checked against those computed values before
          they are shown. That protects against invented numbers — it does not
          make the underlying data correct. Forecasts are projections, not
          promises. You remain responsible for decisions you take.
        </p>
      </Section>

      <Section title="7. Availability">
        <p>
          We aim for continuous availability but do not guarantee uninterrupted
          service on free plans. Planned maintenance is announced in advance
          where practical.
        </p>
      </Section>

      <Section title="8. Ending the agreement">
        <p>
          You may close your account at any time; your data is removed from
          active systems on request. We may end the agreement if these terms are
          breached, with notice where the law requires it.
        </p>
      </Section>

      <Section title="9. Liability">
        <p>
          To the extent permitted by law, our total liability arising from the
          service is limited to the amount you paid us in the twelve months
          before the claim. For free accounts, that amount is zero. Nothing here
          limits liability that cannot lawfully be limited.
        </p>
      </Section>

      <Section title="10. Changes and contact">
        <p>
          We will give notice of material changes to these terms before they take
          effect. Questions go to {COMPANY.name} through the contact page.
        </p>
      </Section>
    </MarketingPage>
  );
}
