"use client";

import { useEffect, useState, useTransition } from "react";
import { BarChart3, Code2, Compass, Loader2, Table2 } from "lucide-react";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
} from "@/components/ui/primitives";
import { formatNumber } from "@/lib/utils";
import {
  getExploreColumnsAction,
  runExploreAction,
  type ExploreColumn,
  type ExploreResult,
} from "@/app/(app)/explore/actions";
import { AGGREGATIONS, AGGREGATION_LABELS, type Aggregation } from "@/lib/analysis/explore";

/**
 * Explore: group a file by any column and summarise any number in it.
 *
 * Every figure on screen is computed by the engine from the uploaded file —
 * the browser never calculates a total. The SQL that produced the result is
 * shown on request, so a number can always be traced back to the query that
 * made it.
 */

type Dataset = { id: string; name: string; rowCount: number | null };

export function ExploreView({ datasets }: { datasets: Dataset[] }) {
  const [datasetId, setDatasetId] = useState(datasets[0]?.id ?? "");
  const [columns, setColumns] = useState<ExploreColumn[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  const [groupBy, setGroupBy] = useState("");
  const [measure, setMeasure] = useState("");
  const [aggregation, setAggregation] = useState<Aggregation>("sum");
  const [sort, setSort] = useState<"value_desc" | "value_asc" | "label_asc">("value_desc");
  const [limit, setLimit] = useState(25);

  const [result, setResult] = useState<ExploreResult | null>(null);
  const [showSql, setShowSql] = useState(false);
  const [pending, startTransition] = useTransition();

  // Columns are per-file, so switching file re-asks the engine and clears
  // choices that may not exist in the new one.
  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    setLoadingColumns(true);
    setResult(null);

    getExploreColumnsAction(datasetId)
      .then((next) => {
        if (cancelled) return;
        setColumns(next);
        const firstText = next.find((column) => !column.numeric) ?? next[0];
        const firstNumber = next.find((column) => column.numeric);
        setGroupBy(firstText?.name ?? "");
        setMeasure(firstNumber?.name ?? "");
        setAggregation(firstNumber ? "sum" : "count");
      })
      .finally(() => !cancelled && setLoadingColumns(false));

    return () => {
      cancelled = true;
    };
  }, [datasetId]);

  const run = () => {
    if (!datasetId || !groupBy) return;
    startTransition(async () => {
      const next = await runExploreAction({
        datasetId,
        groupBy,
        measure: aggregation === "count" ? null : measure || null,
        aggregation,
        sort,
        limit,
      });
      setResult(next);
    });
  };

  if (datasets.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="h-4 w-4" />}
        title="Upload a file first"
        description="Explore works on a file you have uploaded. Once one is in, you can group it by any column and summarise any number in it — no formulas, no SQL."
        className="py-16"
      />
    );
  }

  const numericColumns = columns.filter((column) => column.numeric);
  const needsMeasure = aggregation !== "count";

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader>
          <CardTitle>
            <Compass className="h-3.5 w-3.5" />
            What do you want to see?
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Picker label="File">
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
            </Picker>

            <Picker label="Group by" hint="One row per value of this column">
              <select
                value={groupBy}
                onChange={(event) => setGroupBy(event.target.value)}
                disabled={loadingColumns}
                className={selectClass}
              >
                {columns.map((column) => (
                  <option key={column.name} value={column.name}>
                    {column.name}
                  </option>
                ))}
              </select>
            </Picker>

            <Picker label="Summary">
              <select
                value={aggregation}
                onChange={(event) => setAggregation(event.target.value as Aggregation)}
                className={selectClass}
              >
                {AGGREGATIONS.map((value) => (
                  <option
                    key={value}
                    value={value}
                    disabled={value !== "count" && numericColumns.length === 0}
                  >
                    {AGGREGATION_LABELS[value]}
                  </option>
                ))}
              </select>
            </Picker>

            <Picker label="Of which number">
              <select
                value={measure}
                onChange={(event) => setMeasure(event.target.value)}
                disabled={!needsMeasure || loadingColumns}
                className={selectClass}
              >
                {!needsMeasure ? (
                  <option>— not needed —</option>
                ) : numericColumns.length === 0 ? (
                  <option value="">No number columns in this file</option>
                ) : (
                  numericColumns.map((column) => (
                    <option key={column.name} value={column.name}>
                      {column.name}
                    </option>
                  ))
                )}
              </select>
            </Picker>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Picker label="Order">
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as typeof sort)}
                className={selectClass}
              >
                <option value="value_desc">Biggest first</option>
                <option value="value_asc">Smallest first</option>
                <option value="label_asc">By name</option>
              </select>
            </Picker>

            <Picker label="Show at most">
              <select
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className={selectClass}
              >
                {[10, 25, 50, 100, 250].map((value) => (
                  <option key={value} value={value}>
                    {value} rows
                  </option>
                ))}
              </select>
            </Picker>

            <button
              type="button"
              onClick={run}
              disabled={pending || loadingColumns || !groupBy}
              className="nx-press ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-[var(--nx-purple)] px-4 text-[13px] font-medium text-[var(--nx-purple-on)] transition-colors hover:bg-[var(--nx-purple-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {pending ? "Working…" : "Show me"}
            </button>
          </div>
        </CardBody>
      </Card>

      {result && !result.ok ? (
        <Card>
          <CardBody className="p-3">
            <p className="text-[12.5px] text-[var(--nx-error)]">{result.error}</p>
          </CardBody>
        </Card>
      ) : null}

      {result?.ok ? (
        <ExploreResultView
          result={result}
          showSql={showSql}
          onToggleSql={() => setShowSql((value) => !value)}
        />
      ) : null}
    </div>
  );
}

function ExploreResultView({
  result,
  showSql,
  onToggleSql,
}: {
  result: Extract<ExploreResult, { ok: true }>;
  showSql: boolean;
  onToggleSql: () => void;
}) {
  if (result.rows.length === 0) {
    return (
      <Card>
        <CardBody className="p-6 text-center">
          <p className="text-[12.5px] text-[var(--nx-text-muted)]">
            That combination produced no rows.
          </p>
        </CardBody>
      </Card>
    );
  }

  // The bar scale is taken from the largest absolute value so negatives are
  // drawn to the same scale rather than disappearing.
  const peak = Math.max(...result.rows.map((row) => Math.abs(row.value)), 1);

  return (
    <>
      {result.explanation ? (
        <Card>
          <CardBody className="p-3">
            <p className="text-[12.5px] leading-relaxed text-[var(--nx-text)]">
              {result.explanation}
            </p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <BarChart3 className="h-3.5 w-3.5" />
            {result.valueLabel} by {result.groupColumn}
          </CardTitle>
          <div className="flex items-center gap-2">
            {result.truncated ? (
              <Badge tone="warning">Showing the top {result.rows.length}</Badge>
            ) : null}
            <button
              type="button"
              onClick={onToggleSql}
              className="inline-flex items-center gap-1 text-[10.5px] text-[var(--nx-text-muted)] hover:text-[var(--nx-text)]"
            >
              <Code2 className="h-3 w-3" />
              {showSql ? "Hide" : "Show"} the query
            </button>
          </div>
        </CardHeader>
        <CardBody className="p-3">
          {showSql ? (
            <pre className="mb-3 overflow-x-auto rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] p-2.5 font-mono text-[10.5px] leading-relaxed text-[var(--nx-code)]">
              {result.sql}
            </pre>
          ) : null}

          <ul className="space-y-1.5">
            {result.rows.map((row) => (
              <li key={row.label} className="flex items-center gap-2">
                <span
                  className="w-[28%] shrink-0 truncate text-[11.5px] text-[var(--nx-text-muted)]"
                  title={row.label}
                >
                  {row.label}
                </span>
                <span className="relative h-4 flex-1 overflow-hidden rounded bg-[var(--nx-inset)]">
                  <span
                    className="absolute inset-y-0 left-0 rounded bg-[var(--nx-accent)] transition-[width] duration-500"
                    style={{ width: `${(Math.abs(row.value) / peak) * 100}%` }}
                  />
                </span>
                <span className="w-[22%] shrink-0 text-right font-mono text-[11.5px]">
                  {formatNumber(row.value)}
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <Table2 className="h-3.5 w-3.5" />
            The numbers
          </CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[11.5px]">
              <thead>
                <tr className="text-[var(--nx-text-muted)]">
                  {[result.groupColumn, result.valueLabel, "Rows"].map((header) => (
                    <th
                      key={header}
                      className="whitespace-nowrap border-b border-[var(--nx-border)] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.label} className="hover:bg-[var(--nx-hover)]">
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5">
                      {row.label}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono">
                      {formatNumber(row.value)}
                    </td>
                    <td className="border-b border-[var(--nx-border-subtle)] px-3 py-1.5 text-right font-mono text-[var(--nx-text-muted)]">
                      {formatNumber(row.rowCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </>
  );
}

const selectClass =
  "h-9 w-full rounded-md border border-[var(--nx-border)] bg-[var(--nx-inset)] px-2 text-[12.5px] text-[var(--nx-text)] outline-none focus:border-[var(--nx-accent)] disabled:opacity-50";

function Picker({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-[150px]">
      <span className="mb-1 block text-[11px] font-medium text-[var(--nx-text-muted)]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-0.5 block text-[10px] text-[var(--nx-text-faint)]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
