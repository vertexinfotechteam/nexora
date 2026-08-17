"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreditBalance } from "@/lib/credits";

/**
 * Remaining AI analysis credits, always visible in the top bar.
 *
 * Shown as a meter rather than a bare number so the user can see how close
 * they are to the limit before they hit it.
 */
export function CreditMeter({ balance }: { balance: CreditBalance }) {
  const pct =
    balance.limit > 0
      ? Math.max(0, Math.min(100, (balance.remaining / balance.limit) * 100))
      : 0;

  const tone =
    balance.remaining === 0
      ? "error"
      : balance.remaining <= Math.max(2, balance.limit * 0.2)
        ? "warning"
        : "ok";

  const barColor =
    tone === "error"
      ? "var(--nx-error)"
      : tone === "warning"
        ? "var(--nx-warning)"
        : "var(--nx-success)";

  return (
    <Link
      href="/upgrade"
      title={`${balance.remaining} of ${balance.limit} AI analysis credits remaining on the ${balance.plan.toUpperCase()} plan`}
      className={cn(
        "hidden items-center gap-2 rounded-md border px-2 py-1 transition-colors sm:flex",
        tone === "error"
          ? "border-[var(--nx-error-border)] bg-[var(--nx-error-soft)]"
          : "border-[var(--nx-border)] hover:bg-[var(--nx-elevated)]",
      )}
    >
      <Zap
        className={cn(
          "h-3.5 w-3.5",
          tone === "error"
            ? "text-[var(--nx-error)]"
            : tone === "warning"
              ? "text-[var(--nx-warning)]"
              : "text-[var(--nx-accent)]",
        )}
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[10.5px] font-medium leading-none tabular-nums">
          {balance.remaining}/{balance.limit} credits
        </span>
        <span
          aria-hidden
          className="h-[3px] w-16 overflow-hidden rounded-full bg-[var(--nx-border)]"
        >
          <span
            className="block h-full rounded-full transition-[width] duration-500"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </span>
      </span>
    </Link>
  );
}
