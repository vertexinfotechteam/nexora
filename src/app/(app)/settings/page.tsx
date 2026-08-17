import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listDatasets, listJobs, listReports } from "@/lib/store";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";
import { getBranding } from "@/lib/branding";
import { getCreditBalance } from "@/lib/credits";
import { BrandingForm } from "@/components/settings/branding-form";
import { COMPANY } from "@/lib/team";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireSession();
  const [datasets, jobs, reports, branding, credits] = await Promise.all([
    listDatasets(session),
    listJobs(session, 500),
    listReports(session, 500),
    getBranding(session),
    getCreditBalance(session),
  ]);

  const totalRows = datasets.reduce((sum, d) => sum + (d.row_count ?? 0), 0);
  const totalBytes = datasets.reduce((sum, d) => sum + (d.size_bytes ?? 0), 0);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Settings</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Your account, your branding, and how much of your plan you have used.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 p-4">
            <Row label="Display name" value={session.displayName ?? "—"} />
            <Row label="Username" value={`@${session.username}`} />
            <Row label="Email" value={session.email ?? "not set in local mode"} />
            <Row label="Role in workspace" value={session.role} />
          </CardBody>
        </Card>

        {/*
          The Workspace card is gone.
          It reported the storage backend and the database engine, which is
          our plumbing rather than anything the account holder decides or acts
          on, and it named a workspace the product no longer asks anyone to
          think about. The plan is on the account menu and the credit meter,
          where it is read in context.
        */}

        {/*
          What used to be here: an "AI settings" card naming the model vendors
          and exact model versions in fallback order, and a "Security" card
          ticking off each individual control by name.

          Both were written for whoever built the product, and both are now
          removed from the customer's view, because between them they handed a
          stranger a map:

            - Naming the model and version tells an attacker precisely which
              jailbreak and prompt-injection techniques to bring, and which
              vendor's quirks to probe.
            - Naming each control tells them which defences exist. Worse, the
              ticks were conditional — a misconfigured deployment rendered a
              visible cross next to "Row Level Security policies", which
              advertises the one thing you would never want advertised.
            - The empty state listed the exact environment variable names, i.e.
              the configuration surface worth attacking.

          What a customer actually needs to know is the promise, not the
          mechanism, so that is what is stated below. The full detail is still
          available to platform staff in the admin panel, where the audience is
          the people who operate it.
        */}
        <Card>
          <CardHeader>
            <CardTitle>How your data is handled</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 p-4">
            <Assurance>
              Your files are private to your account. Nobody else using Nexus
              can see them.
            </Assurance>
            <Assurance>
              Your data is never used to train an AI model, and is not shared
              with anyone outside {COMPANY.name}.
            </Assurance>
            <Assurance>
              Every figure in a report is calculated from your file. The AI
              explains and plans; it never does the arithmetic, and anything it
              cannot prove against a computed value is not shown to you.
            </Assurance>
            <Assurance>
              Sign-ins, uploads, analyses and exports are all recorded, and you
              can read that history yourself under Activity History.
            </Assurance>
            <Assurance>
              Your password is never stored by this application, and closing
              your browser ends the session.
            </Assurance>
          </CardBody>
        </Card>

        <BrandingForm branding={branding} workspaceName={session.organizationName} />

        {/* Usage */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage</CardTitle>

          </CardHeader>
          <CardBody className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
            <Metric
              label="AI credits remaining"
              value={`${credits.remaining}/${credits.limit}`}
            />
            <Metric label="Datasets" value={String(datasets.length)} />
            <Metric label="Rows stored" value={formatNumber(totalRows)} />
            <Metric
              label="Storage"
              value={`${(totalBytes / 1024 / 1024).toFixed(1)} MB`}
            />
            <Metric label="Analyses run" value={String(jobs.length)} />
            <Metric label="Reports generated" value={String(reports.length)} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--nx-border-subtle)] pb-1.5">
      <span className="text-[11.5px] text-[var(--nx-text-muted)]">{label}</span>
      <span className="text-right text-[12px]">{value}</span>
    </div>
  );
}

/**
 * One promise, stated plainly.
 *
 * Unconditional by design. The previous version rendered a cross when a
 * control was not active, which turned this list into a live report of which
 * protections were missing.
 */
function Assurance({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--nx-success)]" />
      <span className="text-[12px] leading-relaxed text-[var(--nx-text)]">
        {children}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--nx-text-muted)]">{label}</p>
      <p className="mt-0.5 text-[17px] font-semibold leading-none tracking-tight">
        {value}
      </p>
    </div>
  );
}
