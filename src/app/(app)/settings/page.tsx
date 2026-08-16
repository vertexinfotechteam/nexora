import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { getAvailableAiProviders } from "@/lib/env";
import { listDatasets, listJobs, listReports } from "@/lib/store";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  SectionLabel,
} from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";
import { getBranding } from "@/lib/branding";
import { getCreditBalance } from "@/lib/credits";
import { BrandingForm } from "@/components/settings/branding-form";

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

  const providers = getAvailableAiProviders();
  const totalRows = datasets.reduce((sum, d) => sum + (d.row_count ?? 0), 0);
  const totalBytes = datasets.reduce((sum, d) => sum + (d.size_bytes ?? 0), 0);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[15px] font-semibold tracking-tight">Settings</h1>
        <p className="text-[12px] text-[var(--nx-text-muted)]">
          Configuration is read from the server environment. Secrets are never
          sent to the browser.
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

        {/* Workspace */}
        <Card>
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <Badge tone={session.mode === "supabase" ? "success" : "warning"}>
              {session.mode === "supabase" ? "Supabase" : "Local mode"}
            </Badge>
          </CardHeader>
          <CardBody className="space-y-2 p-4">
            <Row label="Name" value={session.organizationName} />
            <Row label="Plan" value={session.plan.toUpperCase()} />
            <Row
              label="Storage backend"
              value={
                session.mode === "supabase"
                  ? "Supabase Storage (private bucket)"
                  : "Local filesystem (./.nexora)"
              }
            />
            <Row
              label="Database"
              value={
                session.mode === "supabase"
                  ? "Supabase Postgres with RLS"
                  : "Local JSON store"
              }
            />
          </CardBody>
        </Card>

        {/* AI settings */}
        <Card>
          <CardHeader>
            <CardTitle>AI settings</CardTitle>
          </CardHeader>
          <CardBody className="p-4">
            {providers.length === 0 ? (
              <p className="text-[12px] leading-relaxed text-[var(--nx-text-muted)]">
                No AI provider is configured. Analyses still run — profiling,
                measures, trends, anomaly detection, forecasting and
                recommendations are all statistical — but questions are not
                interpreted and summaries are assembled from computed values.
                Add <code className="font-mono">ANTHROPIC_API_KEY</code>,{" "}
                <code className="font-mono">GEMINI_API_KEY</code>,{" "}
                <code className="font-mono">OPENAI_API_KEY</code> or{" "}
                <code className="font-mono">OLLAMA_BASE_URL</code> to{" "}
                <code className="font-mono">.env.local</code>.
              </p>
            ) : (
              <>
                <SectionLabel className="mb-2">
                  Configured providers, in fallback order
                </SectionLabel>
                <ul className="space-y-1.5">
                  {providers.map((provider, index) => (
                    <li
                      key={provider.id}
                      className="flex items-center justify-between gap-2 border-b border-[var(--nx-border-subtle)] pb-1.5"
                    >
                      <span className="flex items-center gap-2 text-[12px]">
                        <span className="font-mono text-[10px] text-[var(--nx-text-faint)]">
                          {index + 1}
                        </span>
                        {provider.id}
                        {index === 0 ? <Badge tone="success">primary</Badge> : null}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--nx-text-muted)]">
                        {provider.model}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--nx-text-faint)]">
                  Keys are read on the server only. Every figure the model quotes
                  is verified against a computed value before it is shown.
                </p>
              </>
            )}
          </CardBody>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle>Security</CardTitle>
          </CardHeader>
          <CardBody className="space-y-2 p-4">
            <Check
              ok={isSupabaseConfigured()}
              label="Supabase Auth (passwords never stored by this app)"
            />
            <Check ok={isSupabaseConfigured()} label="Row Level Security policies" />
            <Check ok label="Content-Security-Policy with per-request nonce" />
            <Check ok label="Read-only SQL validation on AI queries" />
            <Check ok label="Sealed query engine (no network, no filesystem)" />
            <Check ok label="Prompt-injection fencing on dataset content" />
            <Check ok label="Numeric output verified against computations" />
            <Check ok label="Append-only audit log" />
          </CardBody>
        </Card>

        <BrandingForm branding={branding} workspaceName={session.organizationName} />

        {/* Usage */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Usage</CardTitle>
            <span className="text-[10.5px] text-[var(--nx-text-faint)]">
              tracked for billing readiness
            </span>
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

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--nx-success)]" />
      ) : (
        <XCircle className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--nx-text-faint)]" />
      )}
      <span
        className={`text-[12px] leading-snug ${ok ? "text-[var(--nx-text)]" : "text-[var(--nx-text-faint)]"}`}
      >
        {label}
        {!ok ? " — needs Supabase" : ""}
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
