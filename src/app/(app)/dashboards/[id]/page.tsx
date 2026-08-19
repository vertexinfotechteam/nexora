import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, LayoutDashboard } from "lucide-react";
import { requireSession } from "@/lib/auth/session";
import { getDashboard, listWidgets, listDatasets } from "@/lib/store";
import { runExploreAction } from "@/app/(app)/explore/actions";
import { EmptyState } from "@/components/ui/primitives";
import { AddTile } from "@/components/dashboards/add-tile";
import { Tile } from "@/components/dashboards/tile";
import type { Aggregation } from "@/lib/analysis/explore";

export const metadata: Metadata = { title: "Saved View" };

/**
 * One saved view.
 *
 * Every tile is recomputed here, on the server, from the file it names — the
 * stored tile holds the question, never the answer. That costs a query per
 * tile on each open, and buys the guarantee this product is built on: a
 * number on screen was computed from the data as it is now.
 *
 * Tiles are computed in parallel; one that fails renders its own error and
 * leaves the rest of the view standing.
 */
export default async function SavedViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession();

  const view = await getDashboard(session, id);
  if (!view) notFound();

  const [widgets, datasets] = await Promise.all([
    listWidgets(session, view.id),
    listDatasets(session),
  ]);

  const ready = datasets.filter((dataset) => dataset.status === "ready");

  const computed = await Promise.all(
    widgets.map(async (widget) => {
      try {
        const result = await runExploreAction({
          datasetId: widget.config.datasetId,
          groupBy: widget.config.groupBy,
          measure: widget.config.measure,
          aggregation: widget.config.aggregation as Aggregation,
          sort: widget.config.sort,
          limit: widget.config.limit,
        });
        return { widget, result };
      } catch (error) {
        return {
          widget,
          result: {
            ok: false as const,
            error: error instanceof Error ? error.message : "This tile could not be calculated.",
          },
        };
      }
    }),
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0">
          <Link
            href="/dashboards"
            className="inline-flex items-center gap-1 text-[11.5px] text-[var(--nx-text-muted)] hover:underline"
          >
            <ArrowLeft className="h-3 w-3" />
            Saved Views
          </Link>
          <h1 className="mt-1 text-[15px] font-semibold tracking-tight">{view.name}</h1>
          <p className="text-[12px] text-[var(--nx-text-muted)]">
            {widgets.length === 0
              ? "No tiles yet."
              : `${widgets.length} tile${widgets.length === 1 ? "" : "s"}, recalculated just now from your files.`}
          </p>
        </div>
        <div className="ml-auto">
          <AddTile dashboardId={view.id} datasets={ready.map((d) => ({ id: d.id, name: d.name }))} />
        </div>
      </div>

      {widgets.length === 0 ? (
        <EmptyState
          icon={<LayoutDashboard className="h-4 w-4" />}
          title="This view is empty"
          description={
            ready.length === 0
              ? "Upload a file first — a tile summarises one of your files, so there is nothing to pin yet."
              : "Add a tile: choose a file, what to group by, and which number to summarise. Pick the chart it should be drawn as."
          }
          className="py-16"
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {computed.map(({ widget, result }) => (
            <Tile key={widget.id} widget={widget} result={result} dashboardId={view.id} />
          ))}
        </div>
      )}
    </div>
  );
}
