import type { Metadata } from "next";
import { AlertTriangle, BellRing, Database } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { listAlerts, listDatasets, recordAlertCheck } from "@/lib/store";
import { runExploreAction } from "@/app/(app)/explore/actions";
import { Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { CreateAlert } from "@/components/alerts/create-alert";
import { AlertRow } from "@/components/alerts/alert-row";
import type { Aggregation } from "@/lib/analysis/explore";
import type { Alert } from "@/lib/store/types";
import { findBreach } from "@/lib/alerts/evaluate";

export const metadata: Metadata = { title: "Alerts" };

export type AlertCheck = {
  alert: Alert;
  state: "ok" | "triggered" | "error";
  value: number | null;
  worst: { label: string; value: number } | null;
  error: string | null;
};

/**
 * Alerts: a saved question, a line, and what the data says right now.
 *
 * Every alert is checked here, on the server, when the page is opened — the
 * stored rule holds the question, never a number. There is no background
 * scheduler, and the page says so rather than implying one: a screen that
 * claims to watch your data around the clock while nothing runs between visits
 * would be the most damaging kind of wrong this product could be.
 *
 * The observation is written back afterwards so the row can say when it was
 * last checked, but it is never what the next check reads.
 */
async function evaluate(alert: Alert): Promise<AlertCheck> {
  if (!alert.is_active) {
    return { alert, state: "ok", value: alert.last_value, worst: null, error: null };
  }

  try {
    const result = await runExploreAction({
      datasetId: alert.dataset_id,
      groupBy: alert.group_by,
      measure: alert.measure,
      aggregation: alert.aggregation as Aggregation,
      sort: "value_desc",
      limit: 200,
    });

    if (!result.ok) {
      return { alert, state: "error", value: null, worst: null, error: result.error };
    }

    // The comparison itself lives in lib/alerts/evaluate so it can be tested
    // directly; this decides what to do with the verdict.
    const breach = findBreach(result.rows, alert.comparison, alert.threshold);

    return {
      alert,
      state: breach.triggered ? "triggered" : "ok",
      value: breach.worst?.value ?? null,
      worst: breach.worst,
      error: null,
    };
  } catch (error) {
    return {
      alert,
      state: "error",
      value: null,
      worst: null,
      error: error instanceof Error ? error.message : "This alert could not be checked.",
    };
  }
}

export default async function AlertsPage() {
  const session = await requireSession();
  const [listing, datasets] = await Promise.all([listAlerts(session), listDatasets(session)]);

  if (!listing.ok) {
    return (
      <div className="space-y-3">
        <Header />
        <EmptyState
          icon={<Database className="h-4 w-4" />}
          title={
            listing.reason === "table_missing"
              ? "Alerts needs one database change"
              : "Alerts is not reachable"
          }
          description={
            listing.reason === "table_missing"
              ? "The alerts table has not been created yet. Run migration 0004 in Supabase and this screen starts working — nothing else needs deploying. Until then nothing is shown here rather than an empty list, which would suggest you simply have no alerts."
              : `The alerts table could not be read: ${listing.detail}`
          }
          className="py-16"
        />
      </div>
    );
  }

  const ready = datasets.filter((dataset) => dataset.status === "ready");
  const checks = await Promise.all(listing.alerts.map(evaluate));

  // Written after rendering data is gathered, and never allowed to fail the
  // page: recording what was seen is bookkeeping, not the answer.
  await Promise.all(
    checks
      .filter((check) => check.alert.is_active)
      .map((check) =>
        recordAlertCheck(session, check.alert.id, {
          last_value: check.value,
          last_state: check.state,
          last_error: check.error,
        }).catch(() => {}),
      ),
  );

  const triggered = checks.filter((check) => check.state === "triggered").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <Header triggered={triggered} total={checks.length} />
        <div className="ml-auto">
          <CreateAlert datasets={ready.map((d) => ({ id: d.id, name: d.name }))} />
        </div>
      </div>

      {checks.length === 0 ? (
        <EmptyState
          icon={<BellRing className="h-4 w-4" />}
          title="No alerts yet"
          description={
            ready.length === 0
              ? "Upload a file first — an alert watches a number in one of your files."
              : "Create an alert: pick a file, the number to watch, and the line that matters. It is checked against every group, so one region falling does not hide behind a healthy total."
          }
          className="py-16"
        />
      ) : (
        <>
          {triggered > 0 ? (
            <Card>
              <CardBody className="flex items-start gap-2 p-3">
                <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-[var(--nx-warning)]" />
                <p className="text-[12.5px] leading-relaxed">
                  {/* Plural follows the total, the verb follows the count:
                      "1 of 2 alerts is", "2 of 5 alerts are". */}
                  {triggered} of {checks.length} {checks.length === 1 ? "alert" : "alerts"}{" "}
                  {triggered === 1 ? "is" : "are"} over the line right now.
                </p>
              </CardBody>
            </Card>
          ) : null}

          <div className="space-y-2">
            {checks.map((check) => (
              <AlertRow key={check.alert.id} check={check} />
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--nx-text-faint)]">
            Alerts are checked when you open this page, against your files as
            they are now. Nothing runs in the background yet, so this page is
            the check — it does not email you between visits.
          </p>
        </>
      )}
    </div>
  );
}

function Header({ triggered, total }: { triggered?: number; total?: number } = {}) {
  return (
    <div className="min-w-0">
      <h1 className="text-[15px] font-semibold tracking-tight">Alerts</h1>
      <p className="text-[12px] text-[var(--nx-text-muted)]">
        {total === undefined
          ? "Watch a number in your data and be told when it crosses a line you set."
          : `${total} alert${total === 1 ? "" : "s"}, checked just now${
              triggered ? ` — ${triggered} over the line` : ""
            }.`}
      </p>
    </div>
  );
}
