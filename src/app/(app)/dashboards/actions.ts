"use server";

import { revalidatePath } from "next/cache";
import { requireSession, assertCanWrite } from "@/lib/auth/session";
import {
  createDashboard,
  createWidget,
  deleteDashboard,
  deleteWidget,
  getDashboard,
  renameDashboard,
} from "@/lib/store";
import { boundedString, isUuid } from "@/lib/security/validate";
import { canCreate } from "@/lib/credits";
import type { WidgetType } from "@/lib/store/types";
import { AGGREGATIONS } from "@/lib/analysis/explore";

/**
 * Saved view actions.
 *
 * A tile stores a question — dataset, grouping, summary — and never a number.
 * The figures are recomputed from the file every time the view is opened, so a
 * saved screen cannot quietly go stale and show something that was true when
 * it was pinned.
 */

export type ViewResult = { ok: true; id?: string } | { ok: false; error: string };

const WIDGET_TYPES: WidgetType[] = ["kpi", "line", "bar", "donut", "table"];

/** Kept in step with the engine's own list, so the two cannot drift apart. */
const ALLOWED_AGGREGATIONS: readonly string[] = AGGREGATIONS;

export async function createViewAction(name: string): Promise<ViewResult> {
  const session = await requireSession();
  try {
    assertCanWrite(session);
  } catch {
    return { ok: false, error: "You do not have permission to create a view." };
  }

  const clean = boundedString(name, 80);
  if (!clean) return { ok: false, error: "Give the view a name." };

  // Creating is new work; reading and downloading are not, and are left alone.
  const allowance = await canCreate(session);
  if (!allowance.allowed) return { ok: false, error: allowance.message };

  const view = await createDashboard(session, { name: clean });
  revalidatePath("/dashboards");
  return { ok: true, id: view.id };
}

export async function renameViewAction(id: string, name: string): Promise<ViewResult> {
  const session = await requireSession();
  if (!isUuid(id)) return { ok: false, error: "That view could not be found." };

  const clean = boundedString(name, 80);
  if (!clean) return { ok: false, error: "Give the view a name." };

  await renameDashboard(session, id, clean);
  revalidatePath("/dashboards");
  revalidatePath(`/dashboards/${id}`);
  return { ok: true };
}

export async function deleteViewAction(id: string): Promise<ViewResult> {
  const session = await requireSession();
  if (!isUuid(id)) return { ok: false, error: "That view could not be found." };

  await deleteDashboard(session, id);
  revalidatePath("/dashboards");
  return { ok: true };
}

export async function addTileAction(input: {
  dashboardId: string;
  datasetId: string;
  groupBy: string;
  measure: string | null;
  aggregation: string;
  chart: string;
  title: string;
}): Promise<ViewResult> {
  const session = await requireSession();
  try {
    assertCanWrite(session);
  } catch {
    return { ok: false, error: "You do not have permission to add a tile." };
  }

  if (!isUuid(input.dashboardId) || !isUuid(input.datasetId)) {
    return { ok: false, error: "That view or file could not be found." };
  }

  /*
   * The view is fetched rather than trusted from the form: without this, a
   * tile could be posted onto another workspace's view by id alone.
   */
  const allowance = await canCreate(session);
  if (!allowance.allowed) return { ok: false, error: allowance.message };

  const view = await getDashboard(session, input.dashboardId);
  if (!view) return { ok: false, error: "That view could not be found." };

  const chart = WIDGET_TYPES.includes(input.chart as WidgetType)
    ? (input.chart as WidgetType)
    : "bar";

  if (!ALLOWED_AGGREGATIONS.includes(input.aggregation)) {
    return { ok: false, error: "That is not a summary this page can calculate." };
  }

  const groupBy = boundedString(input.groupBy, 120);
  if (!groupBy) return { ok: false, error: "Choose a column to group by." };

  // "count" needs no measure; everything else summarises a number.
  const measure = input.aggregation === "count" ? null : boundedString(input.measure, 120);
  if (input.aggregation !== "count" && !measure) {
    return { ok: false, error: "Choose the number to summarise." };
  }

  await createWidget(session, {
    dashboard_id: view.id,
    widget_type: chart,
    title: boundedString(input.title, 80) || `${input.aggregation} by ${groupBy}`,
    config: {
      datasetId: input.datasetId,
      groupBy,
      measure,
      aggregation: input.aggregation,
      sort: "value_desc",
      limit: 12,
    },
  });

  revalidatePath(`/dashboards/${view.id}`);
  return { ok: true };
}

export async function removeTileAction(
  dashboardId: string,
  widgetId: string,
): Promise<ViewResult> {
  const session = await requireSession();
  if (!isUuid(widgetId)) return { ok: false, error: "That tile could not be found." };

  await deleteWidget(session, widgetId);
  revalidatePath(`/dashboards/${dashboardId}`);
  return { ok: true };
}
