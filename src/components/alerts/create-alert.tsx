"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createAlertAction } from "@/app/(app)/alerts/actions";
import { getExploreColumnsAction, type ExploreColumn } from "@/app/(app)/explore/actions";

/**
 * Creates an alert.
 *
 * The columns come from the chosen file, so a column that does not exist
 * cannot be watched. The threshold stays a string until the server parses it —
 * an empty box must not quietly become a threshold of zero, which would fire
 * on everything.
 */
export function CreateAlert({ datasets }: { datasets: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [columns, setColumns] = useState<ExploreColumn[]>([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState("");
  const [measure, setMeasure] = useState("");
  const [aggregation, setAggregation] = useState("sum");
  const [comparison, setComparison] = useState("below");
  const [threshold, setThreshold] = useState("");

  useEffect(() => {
    if (!open || !datasetId) return;
    let cancelled = false;
    setLoading(true);
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
        if (!cancelled) setLoading(false);
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
        New alert
      </Button>
    );
  }

  const needsMeasure = aggregation !== "count";
  const numeric = columns.filter((column) => column.numeric);
  const ready =
    Boolean(name.trim()) &&
    Boolean(groupBy) &&
    (!needsMeasure || Boolean(measure)) &&
    threshold.trim().length > 0 &&
    !loading;

  return (
    <form
      className="w-[min(94vw,420px)] space-y-2.5 rounded-xl border border-[var(--nx-border)] bg-[var(--nx-card)] p-3.5 shadow-[var(--nx-shadow-lg)]"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await createAlertAction({
            name,
            datasetId,
            groupBy,
            measure: needsMeasure ? measure : null,
            aggregation,
            comparison,
            threshold,
          });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Alert created and checked.");
          setOpen(false);
          setName("");
          setThreshold("");
          router.refresh();
        });
      }}
    >
      <Field label="Name">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Revenue falling in any region"
          className={inputClass}
        />
      </Field>

      <Field label="File">
        <select value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className={inputClass}>
          {datasets.map((dataset) => (
            <option key={dataset.id} value={dataset.id}>
              {dataset.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Watch">
        <div className="flex gap-1.5">
          <select value={aggregation} onChange={(e) => setAggregation(e.target.value)} className={inputClass}>
            <option value="sum">Total</option>
            <option value="avg">Average</option>
            <option value="count">Count of rows</option>
            <option value="min">Lowest</option>
            <option value="max">Highest</option>
            <option value="median">Median</option>
          </select>
          {needsMeasure ? (
            <select value={measure} onChange={(e) => setMeasure(e.target.value)} disabled={loading} className={inputClass}>
              {numeric.length === 0 ? <option value="">No number columns</option> : null}
              {numeric.map((column) => (
                <option key={column.name} value={column.name}>
                  {column.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </Field>

      <Field label="For each">
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} disabled={loading} className={inputClass}>
          {loading ? <option>Reading columns…</option> : null}
          {columns.map((column) => (
            <option key={column.name} value={column.name}>
              {column.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Tell me when it is">
        <div className="flex gap-1.5">
          <select value={comparison} onChange={(e) => setComparison(e.target.value)} className={inputClass}>
            <option value="below">below</option>
            <option value="above">above</option>
          </select>
          <input
            value={threshold}
            onChange={(event) => setThreshold(event.target.value)}
            inputMode="decimal"
            placeholder="50000"
            className={inputClass}
          />
        </div>
      </Field>

      <div className="flex justify-end gap-1.5 pt-0.5">
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="accent" type="submit" disabled={pending || !ready}>
          {pending ? "Creating…" : "Create alert"}
        </Button>
      </div>
    </form>
  );
}

const inputClass =
  "h-8 w-full min-w-0 rounded-md border border-[var(--nx-border)] bg-[var(--nx-surface)] px-2 text-[12px] outline-none focus:border-[var(--nx-accent)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--nx-text-muted)]">{label}</span>
      {children}
    </label>
  );
}
