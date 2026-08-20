import "server-only";

import { getSupabaseConfig } from "@/lib/env";
import { getServiceClient, hasServiceClient } from "@/lib/supabase/admin";
import { findLocal, insertLocal, updateLocal } from "@/lib/store/local";
import { newId, storeMode } from "@/lib/store";
import type { Session } from "@/lib/store/types";

/**
 * AI analysis credits.
 *
 * One credit is consumed per completed AI analysis. Uploading, browsing and
 * re-downloading existing reports are free — a user should never be charged
 * for looking at work they already paid for.
 *
 * The balance is authoritative on the server. The client is shown the number
 * but the check that matters happens in the analysis route before any work
 * starts, and the decrement happens only after the analysis succeeds, so a
 * failed run never costs the user a credit.
 */

export const FREE_PLAN_CREDITS = 10;

/**
 * What spends a credit.
 *
 * Importing a file costs one, and so does running an analysis. Both are the
 * expensive half of the product — an import profiles every column through the
 * engine, an analysis runs a planner over it — and both are the moments a
 * plan is really being used.
 *
 * Listed here rather than at the two call sites, because the balance is
 * counted by reading these back: a kind charged but not counted would let an
 * account spend for ever, and a kind counted but never charged would show a
 * balance nobody could explain.
 */
export const BILLABLE_KINDS = ["ai_analysis", "dataset_import"] as const;

export type BillableKind = (typeof BILLABLE_KINDS)[number];

export const PLAN_CREDITS: Record<Session["plan"], number> = {
  free: FREE_PLAN_CREDITS,
  pro: 500,
  business: 2500,
  // Enterprise is effectively unmetered; a large finite number keeps the same
  // code path rather than special-casing "unlimited" everywhere.
  enterprise: 1_000_000,
};

export type CreditBalance = {
  used: number;
  limit: number;
  remaining: number;
  plan: Session["plan"];
};

type CreditRow = {
  id: string;
  organization_id: string;
  user_id: string;
  used: number;
  updated_at: string;
};

const COLLECTION = "credit_usage";

export class OutOfCreditsError extends Error {
  constructor(readonly balance: CreditBalance) {
    super(
      `You have used all ${balance.limit} AI analysis credits on the ${balance.plan.toUpperCase()} plan.`,
    );
    this.name = "OutOfCreditsError";
  }
}

async function readUsed(session: Session): Promise<number> {
  if (storeMode() === "local" || !hasServiceClient()) {
    const rows = await findLocal<CreditRow>(
      COLLECTION,
      (row) =>
        row.organization_id === session.organizationId &&
        row.user_id === session.userId,
    );
    return rows[0]?.used ?? 0;
  }

  // Counted from usage_events, which is written by the server only.
  const { count } = await getServiceClient()
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.organizationId)
    .eq("user_id", session.userId)
    .in("kind", [...BILLABLE_KINDS]);

  return count ?? 0;
}

export async function getCreditBalance(
  session: Session,
): Promise<CreditBalance> {
  const limit = PLAN_CREDITS[session.plan] ?? FREE_PLAN_CREDITS;
  const used = await readUsed(session);
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    plan: session.plan,
  };
}

/**
 * Throws when the user has nothing left. Call before starting work, so the
 * user is told immediately rather than after a long-running analysis.
 */
export async function assertHasCredit(session: Session): Promise<CreditBalance> {
  const balance = await getCreditBalance(session);
  if (balance.remaining <= 0) throw new OutOfCreditsError(balance);
  return balance;
}

/**
 * Records one consumed credit.
 *
 * Called only after the work has actually succeeded — a failed analysis or an
 * import that could not be read must never cost the user anything.
 */
export async function consumeCredit(
  session: Session,
  metadata: Record<string, unknown> = {},
  kind: BillableKind = "ai_analysis",
): Promise<CreditBalance> {
  if (storeMode() === "local" || !hasServiceClient()) {
    const rows = await findLocal<CreditRow>(
      COLLECTION,
      (row) =>
        row.organization_id === session.organizationId &&
        row.user_id === session.userId,
    );
    const existing = rows[0];
    if (existing) {
      await updateLocal<CreditRow>(COLLECTION, existing.id, {
        used: existing.used + 1,
        updated_at: new Date().toISOString(),
      });
    } else {
      await insertLocal<CreditRow>(COLLECTION, {
        id: newId(),
        organization_id: session.organizationId,
        user_id: session.userId,
        used: 1,
        updated_at: new Date().toISOString(),
      });
    }
  } else {
    await getServiceClient().from("usage_events").insert({
      id: newId(),
      organization_id: session.organizationId,
      user_id: session.userId,
      kind,
      quantity: 1,
      metadata,
      occurred_at: new Date().toISOString(),
    });
  }

  return getCreditBalance(session);
}

/** Supabase config presence, used to explain where credits are stored. */
export function creditsBackend(): "supabase" | "local" {
  return getSupabaseConfig() ? "supabase" : "local";
}

/**
 * Whether the account may still create things.
 *
 * The rule this expresses: an allowance that has run out stops new work, and
 * nothing else. Everything already produced stays readable and downloadable —
 * reports, exports, saved views, uploaded files — because those were paid for
 * when they were made, and taking them back at zero would be charging twice.
 *
 * So this gates writes only. It is deliberately not called on any read path.
 */
export async function canCreate(
  session: Session,
): Promise<{ allowed: true } | { allowed: false; message: string }> {
  const balance = await getCreditBalance(session);

  if (balance.remaining > 0) return { allowed: true };

  return {
    allowed: false,
    message:
      "Your credits for this period are used up, so nothing new can be created. Everything you have already made stays available to read and download.",
  };
}
