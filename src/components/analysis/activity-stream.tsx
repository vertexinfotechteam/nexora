"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Code2,
  Database,
  FileText,
  Loader2,
  MessageSquare,
  Play,
  Search,
  ShieldCheck,
  Sigma,
  XCircle,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import type { ActivityStep } from "@/lib/store/types";

/**
 * The live activity stream.
 *
 * Shows what the engine is doing as it does it, in plain language, with the
 * real numbers each step produced. The point is that a non-technical user can
 * follow the reasoning and see that the figures were computed, not guessed.
 */

const STAGE_META: Record<
  ActivityStep["stage"],
  { icon: typeof Brain; label: string }
> = {
  queued: { icon: CircleDashed, label: "Queued" },
  understanding: { icon: MessageSquare, label: "Understanding" },
  schema: { icon: Database, label: "Data" },
  planning: { icon: Brain, label: "Planning" },
  tool: { icon: Play, label: "Tool" },
  sql: { icon: Code2, label: "Query" },
  validating: { icon: ShieldCheck, label: "Safety" },
  executing: { icon: Play, label: "Running" },
  computing: { icon: Sigma, label: "Computing" },
  charting: { icon: BarChart3, label: "Chart" },
  explaining: { icon: Search, label: "Explaining" },
  saving: { icon: FileText, label: "Saving" },
  done: { icon: CheckCircle2, label: "Done" },
  error: { icon: XCircle, label: "Error" },
};

function statusColor(status: ActivityStep["status"]): string {
  switch (status) {
    case "ok":
      return "text-[var(--nx-success)]";
    case "warn":
      return "text-[var(--nx-warning)]";
    case "error":
      return "text-[var(--nx-error)]";
    default:
      return "text-[var(--nx-accent)]";
  }
}

function StepRow({ step, isLast }: { step: ActivityStep; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  const meta = STAGE_META[step.stage] ?? STAGE_META.computing;
  const Icon = meta.icon;
  const expandable = Boolean(step.sql || (step.facts && step.facts.length > 0));

  return (
    <li className="nx-enter relative flex gap-2.5 pb-3">
      {/* Rail */}
      {!isLast ? (
        <span
          className="absolute left-[10px] top-6 bottom-0 w-px bg-[var(--nx-border)]"
          aria-hidden
        />
      ) : null}

      <span
        className={cn(
          "relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border bg-[var(--nx-card)]",
          step.status === "running"
            ? "border-[var(--nx-accent)] nx-live-dot"
            : step.status === "error"
              ? "border-[var(--nx-error-border-strong)]"
              : step.status === "warn"
                ? "border-[var(--nx-accent-border-strong)]"
                : "border-[var(--nx-border)]",
        )}
      >
        {step.status === "running" ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-[var(--nx-accent)]" />
        ) : (
          <Icon className={cn("h-2.5 w-2.5", statusColor(step.status))} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => expandable && setOpen((v) => !v)}
            className={cn(
              "min-w-0 flex-1 text-left",
              expandable && "cursor-pointer",
            )}
          >
            <p className="flex items-center gap-1.5 text-[12.5px] leading-tight font-medium text-[var(--nx-text)]">
              {expandable ? (
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 text-[var(--nx-text-faint)] transition-transform",
                    open && "rotate-90",
                  )}
                />
              ) : null}
              <span className="truncate">{step.label}</span>
            </p>
            {step.detail ? (
              <p className="mt-0.5 pl-[18px] text-[11.5px] leading-relaxed text-[var(--nx-text-muted)]">
                {step.detail}
              </p>
            ) : null}
          </button>

          {step.durationMs !== undefined ? (
            <span className="shrink-0 pt-px font-mono text-[10px] text-[var(--nx-text-faint)]">
              {formatDuration(step.durationMs)}
            </span>
          ) : null}
        </div>

        {open ? (
          <div className="mt-2 ml-[18px] space-y-2">
            {step.facts && step.facts.length > 0 ? (
              <div className="rounded border border-[var(--nx-border)] bg-[var(--nx-inset)]">
                <p className="border-b border-[var(--nx-border)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--nx-text-faint)]">
                  Computed values
                </p>
                <dl className="divide-y divide-[var(--nx-border-subtle)]">
                  {step.facts.map((fact, index) => (
                    <div
                      key={`${fact.label}-${index}`}
                      className="flex items-baseline justify-between gap-3 px-2.5 py-1"
                    >
                      <dt className="truncate text-[11px] text-[var(--nx-text-muted)]">
                        {fact.label}
                      </dt>
                      <dd className="shrink-0 font-mono text-[11px] text-[var(--nx-text)]">
                        {fact.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {step.sql ? (
              <div className="rounded border border-[var(--nx-border)] bg-[var(--nx-inset)]">
                <p className="border-b border-[var(--nx-border)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--nx-text-faint)]">
                  SQL executed
                </p>
                <pre className="overflow-x-auto px-2.5 py-2 font-mono text-[10.5px] leading-relaxed text-[var(--nx-code)]">
                  {step.sql}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function ActivityStream({
  steps,
  running,
  className,
}: {
  steps: ActivityStep[];
  running: boolean;
  className?: string;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && running) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [steps.length, autoScroll, running]);

  if (steps.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-[10px] border border-dashed border-[var(--nx-border)] px-4 py-6 text-[12px] text-[var(--nx-text-muted)]",
          className,
        )}
      >
        <CircleDashed className="h-3.5 w-3.5" />
        Activity will appear here as the analysis runs.
      </div>
    );
  }

  const errors = steps.filter((s) => s.status === "error").length;
  const warnings = steps.filter((s) => s.status === "warn").length;

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-2.5 flex items-center gap-2">
        <span
          className={cn(
            "flex h-1.5 w-1.5 rounded-full",
            running ? "bg-[var(--nx-accent)] nx-live-dot" : "bg-[var(--nx-success)]",
          )}
        />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--nx-text-muted)]">
          {running ? "Live" : "Finished"}
        </span>
        <span className="text-[11px] text-[var(--nx-text-faint)]">
          {steps.length} step{steps.length === 1 ? "" : "s"}
          {warnings > 0 ? ` · ${warnings} warning${warnings === 1 ? "" : "s"}` : ""}
          {errors > 0 ? ` · ${errors} error${errors === 1 ? "" : "s"}` : ""}
        </span>
        {running ? (
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-[10.5px] text-[var(--nx-text-faint)]">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3 w-3 accent-[var(--nx-purple)]"
            />
            Follow
          </label>
        ) : null}
      </div>

      <ol
        className="max-h-[440px] overflow-y-auto pr-1"
        aria-live="polite"
        aria-relevant="additions"
      >
        {steps.map((step, index) => (
          <StepRow
            key={step.id}
            step={step}
            isLast={index === steps.length - 1}
          />
        ))}
        <div ref={endRef} />
      </ol>

      {errors > 0 ? (
        <p className="mt-1 flex items-start gap-1.5 rounded border border-[var(--nx-error-border)] bg-[var(--nx-error-soft)] px-2.5 py-1.5 text-[11px] text-[var(--nx-error-fg)]">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          Some steps failed. Expand them above to see exactly what went wrong.
        </p>
      ) : null}
    </div>
  );
}
