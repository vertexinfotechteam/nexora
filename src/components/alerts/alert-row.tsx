"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Pause, Play, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardBody, Badge } from "@/components/ui/primitives";
import { formatNumber, relativeTime } from "@/lib/utils";
import { deleteAlertAction, toggleAlertAction } from "@/app/(app)/alerts/actions";
import type { AlertCheck } from "@/app/(app)/alerts/page";

/**
 * One alert, and what the check just found.
 *
 * The state shown is from the check that ran when this page loaded, not from a
 * stored flag — so the badge cannot say "ok" about a figure that has moved.
 */
export function AlertRow({ check }: { check: AlertCheck }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { alert, state, worst } = check;

  const paused = !alert.is_active;
  const summary =
    alert.aggregation === "count"
      ? `count of rows by ${alert.group_by}`
      : `${alert.aggregation} of ${alert.measure} by ${alert.group_by}`;

  return (
    <Card>
      <CardBody className="flex flex-wrap items-start gap-3 p-3.5">
        <div className="mt-0.5 shrink-0">
          {paused ? (
            <Pause className="h-4 w-4 text-[var(--nx-text-faint)]" />
          ) : state === "triggered" ? (
            <AlertTriangle className="h-4 w-4 text-[var(--nx-warning)]" />
          ) : state === "error" ? (
            <XCircle className="h-4 w-4 text-[var(--nx-error)]" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-[var(--nx-success)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[13px] font-semibold">{alert.name}</h3>
            {paused ? (
              <Badge>paused</Badge>
            ) : state === "triggered" ? (
              <Badge tone="warning">over the line</Badge>
            ) : state === "error" ? (
              <Badge tone="error">could not check</Badge>
            ) : (
              <Badge tone="success">within range</Badge>
            )}
          </div>

          <p className="mt-1 text-[11.5px] text-[var(--nx-text-muted)]">
            {summary} — alert when {alert.comparison}{" "}
            <span className="tabular-nums">{formatNumber(alert.threshold)}</span>
          </p>

          {state === "triggered" && worst ? (
            <p className="mt-1 text-[11.5px]">
              <span className="font-medium">{worst.label}</span> is at{" "}
              <span className="tabular-nums font-medium">{formatNumber(worst.value)}</span>
            </p>
          ) : null}

          {state === "error" && check.error ? (
            <p className="mt-1 text-[11.5px] text-[var(--nx-text-muted)]">{check.error}</p>
          ) : null}

          {alert.last_checked_at ? (
            <p className="mt-1 text-[10.5px] text-[var(--nx-text-faint)]">
              Last checked {relativeTime(alert.last_checked_at)}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={paused ? `Resume ${alert.name}` : `Pause ${alert.name}`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await toggleAlertAction(alert.id, paused);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                router.refresh();
              })
            }
            className="rounded-md p-1.5 text-[var(--nx-text-faint)] transition-colors hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-text)] disabled:opacity-50"
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            aria-label={`Delete ${alert.name}`}
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete the alert "${alert.name}"? Your file is not affected.`)) return;
              start(async () => {
                const result = await deleteAlertAction(alert.id);
                if (!result.ok) {
                  toast.error(result.error);
                  return;
                }
                toast.success(`"${alert.name}" deleted.`);
                router.refresh();
              });
            }}
            className="rounded-md p-1.5 text-[var(--nx-text-faint)] transition-colors hover:bg-[var(--nx-elevated)] hover:text-[var(--nx-error)] disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
