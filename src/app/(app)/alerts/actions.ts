"use server";

import { revalidatePath } from "next/cache";
import { requireSession, assertCanWrite } from "@/lib/auth/session";
import { createAlert, deleteAlert, setAlertActive } from "@/lib/store";
import { boundedString, isUuid } from "@/lib/security/validate";
import { canCreate } from "@/lib/credits";
import { AGGREGATIONS } from "@/lib/analysis/explore";

/**
 * Alert actions.
 *
 * An alert stores the question and the line, never a number. Checking is done
 * by recomputing from the file — see evaluateAlert() — so an alert cannot go on
 * reporting a figure that has since changed.
 */

export type AlertResult = { ok: true } | { ok: false; error: string };

export async function createAlertAction(input: {
  name: string;
  datasetId: string;
  groupBy: string;
  measure: string | null;
  aggregation: string;
  comparison: string;
  threshold: string;
}): Promise<AlertResult> {
  const session = await requireSession();
  try {
    assertCanWrite(session);
  } catch {
    return { ok: false, error: "You do not have permission to create an alert." };
  }

  if (!isUuid(input.datasetId)) return { ok: false, error: "Choose a file." };

  const name = boundedString(input.name, 80);
  if (!name) return { ok: false, error: "Give the alert a name." };

  const groupBy = boundedString(input.groupBy, 120);
  if (!groupBy) return { ok: false, error: "Choose a column to group by." };

  if (!AGGREGATIONS.includes(input.aggregation as (typeof AGGREGATIONS)[number])) {
    return { ok: false, error: "That is not a summary this page can calculate." };
  }

  const measure = input.aggregation === "count" ? null : boundedString(input.measure, 120);
  if (input.aggregation !== "count" && !measure) {
    return { ok: false, error: "Choose the number to watch." };
  }

  if (input.comparison !== "above" && input.comparison !== "below") {
    return { ok: false, error: "Choose whether to watch for above or below." };
  }

  /*
   * Parsed strictly. Number("") is 0 and Number(" 12abc") is NaN, and an alert
   * silently created with a threshold of zero would fire on everything.
   */
  const threshold = Number(input.threshold.trim());
  if (!Number.isFinite(threshold)) {
    return { ok: false, error: "Give the threshold as a number." };
  }

  const allowance = await canCreate(session);
  if (!allowance.allowed) return { ok: false, error: allowance.message };

  await createAlert(session, {
    dataset_id: input.datasetId,
    name,
    group_by: groupBy,
    measure,
    aggregation: input.aggregation,
    comparison: input.comparison,
    threshold,
  });

  revalidatePath("/alerts");
  return { ok: true };
}

export async function toggleAlertAction(id: string, active: boolean): Promise<AlertResult> {
  const session = await requireSession();
  if (!isUuid(id)) return { ok: false, error: "That alert could not be found." };

  await setAlertActive(session, id, active);
  revalidatePath("/alerts");
  return { ok: true };
}

export async function deleteAlertAction(id: string): Promise<AlertResult> {
  const session = await requireSession();
  if (!isUuid(id)) return { ok: false, error: "That alert could not be found." };

  await deleteAlert(session, id);
  revalidatePath("/alerts");
  return { ok: true };
}
