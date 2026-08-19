"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { addTileAction } from "@/app/(app)/dashboards/actions";
import { getExploreColumnsAction, type ExploreColumn } from "@/app/(app)/explore/actions";

/**
 * Pins a summary onto a view.
 *
 * The pickers are filled from the file's real columns, fetched when a file is
 * chosen — so a column that does not exist cannot be selected, and the shape of
 * the form matches the shape of the data rather than a guess about it.
 *
 * The chart is chosen here rather than decided for the reader: the same numbers
 * answer different questions as a ranking, a proportion or a trend, and only
 * the person looking knows which they meant.
 */

const CHARTS = [
  { id: "bar", label: "Bar", hint: "compare groups" },
  { id: "donut", label: "Pie", hint: "share of total" },
  { id: "line", label: "Line", hint: "change over time" },
  { id: "kpi", label: "Single number", hint: "one total" },
  { id: "table", label: "Table", hint: "exact values" },
];

const AGGREGATIONS = [
  { id: "sum", label: "Total" },
  { id: "avg", label: "Average" },
  { id: "count", label: "Count of rows" },
  { id: "min", label: "Lowest" },
  { id: "max", label: "Highest" },
  { id: "median", label: "Median" },
];

export function AddTile({
  dashboardId,
  datasets,
}: {
  dashboardId: string;
  datasets: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [columns, setColumns] = useState<ExploreColumn[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [groupBy, setGroupBy] = useState("");
  const [measure, setMeasure] = useState("");
  const [aggregation, setAggregation] = useState("sum");
  const [chart, setChart] = useState("bar");
  const [title, setTitle] = useState("");

  // Columns follow the chosen file. Cleared first so the previous file's
  // columns are never briefly selectable against the new one.
  useEffect(() => {
    if (!open || !datasetId) return;
    let cancelled = false;
    setLoadingColumns(true);
    setColumns([]);
    setGroupBy("");
    setMeasure("");

    getExploreColumnsAction(datasetId)
      .then((list) => {
        if (cancelled) return;
        setColumns(list);
        setGroupBy(list.find((c) => !c.numeric)?.name ?? list[0]?.name ?? "");
        setMeasure(list.find((c) => c.numeric)?.name ?? "");
      })
      .catch(() => {
        if (!cancelled) toast.error("That file's columns could not be read.");
      })
      .finally(() => {
        if (!cancelled) setLoadingColumns(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, datasetId]);

  if (datasets.length === 0) return null;

  if (!open) {
    return (
      <Button size="sm" variant="accent" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5" />
        Add tile
      </Button>
    );
  }

  const needsMeasure = aggregation !== "count";
  const numericColumns = columns.filter((column) => column.numeric);
  const canSubmit =
    Boolean(datasetId) && Boolean(groupBy) && (!needsMeasure || Boolean(measure)) && !loadingColumns;

  return (
    <form
      className="w-[min(94vw,420px)] space-y-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-3.5 shadow-[var(--nx-shadow-lg)]"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await addTileAction({
            dashboardId,
            datasetId,
            groupBy,
            measure: needsMeasure ? measure : null,
            aggregation,
            chart,
            title,
          });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          setOpen(false);
          setTitle("");
          router.refresh();
        });
      }}
    >
      <Field label="File">
        <select
          value={datasetId}
          onChange={(event) => setDatasetId(event.target.value)}
          className={selectClass}
        >
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Group by">
        <select
          value={groupBy}
          onChange={(event) => setGroupBy(event.target.value)}
          disabled={loadingColumns}
          className={selectClass}
        >
          {loadingColumns ? <option>Reading columns…</option> : null}
          {columns.map((column) => (
            <option key={column.name} value={column.name}>
              {column.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Summarise">
        <div className="flex gap-1.5">
          <select
            value={aggregation}
            onChange={(event) => setAggregation(event.target.value)}
            className={selectClass}
          >
            {AGGREGATIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {needsMeasure ? (
            <select
              value={measure}
              onChange={(event) => setMeasure(event.target.value)}
              disabled={loadingColumns}
              className={selectClass}
            >
              {numericColumns.length === 0 ? (
                <option value="">No number columns</option>
              ) : null}
              {numericColumns.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </Field>

      <Field label="Show as">
        <div className="flex flex-wrap gap-1">
          {CHARTS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setChart(option.id)}
              title={option.hint}
              className={
                chart === option.id
                  ? "rounded-md bg-[var(--nx-purple)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--nx-purple-on)]"
                  : "rounded-md border border-[var(--nx-border)] px-2.5 py-1 text-[11.5px] text-[var(--nx-text-muted)] hover:text-[var(--nx-text)]"
              }
            >
              {option.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Title (optional)">
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder="Revenue by region"
          className={selectClass}
        />
      </Field>

      <div className="flex justify-end gap-1.5 pt-0.5">
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="accent" type="submit" disabled={pending || !canSubmit}>
          {pending ? "Adding…" : "Add tile"}
        </Button>
      </div>
    </form>
  );
}

const selectClass =
  "h-8 w-full min-w-0 rounded-md border border-[var(--nx-border)] bg-[var(--nx-surface)] px-2 text-[12px] outline-none focus:border-[var(--nx-accent)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--nx-text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
